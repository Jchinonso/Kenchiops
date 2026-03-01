/**
 * GitHub OAuth Adapter
 *
 * Implements OAuthPort for GitHub (cloud and Enterprise).
 * All HTTP calls to GitHub APIs are encapsulated here.
 * Vendor types are mapped to Kenchi domain types before
 * crossing the port boundary.
 *
 * @module adapters/githubOAuthAdapter
 */

import {
  config,
  OAUTH_PROVIDER_URLS,
  SELF_HOSTED_URL_PATTERNS,
  createLogger,
  ExternalServiceError,
  ValidationError,
  redactSecrets,
  type OAuthTokenResponse,
  type OAuthProviderProfile,
  type RequestContext,
} from "@kenchi/shared";

import type { OAuthPort, OAuthOrganization } from "../ports/oauthPort.js";
import type {
  GitHubTokenResponse,
  GitHubUserProfile,
  GitHubUserEmail,
  GitHubOrg,
  GitHubInstallationsResponse,
} from "./oauthAdapterTypes.js";

// ==================== Constants ====================

const GITHUB_TIMEOUT_MS = 10_000;

const logger = createLogger("github-oauth-adapter");

// ==================== Internal Helpers ====================

/**
 * Reads and validates GitHub OAuth client credentials from config.
 * Throws ValidationError if either value is missing.
 */
const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = config.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ValidationError("GitHub OAuth client credentials are not configured", {
      operation: "ensureClientCredentials",
      metadata: {
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
      },
    });
  }

  return { clientId, clientSecret };
};

/**
 * Resolves GitHub API URLs for cloud or self-hosted instances.
 * Uses SELF_HOSTED_URL_PATTERNS when instanceUrl is provided,
 * otherwise falls back to OAUTH_PROVIDER_URLS for cloud.
 */
const getUrls = (
  instanceUrl: string | null
): {
  readonly authorize: string;
  readonly token: string;
  readonly userProfile: string;
  readonly userEmails: string;
  readonly userOrgs: string;
} =>
  instanceUrl
    ? {
        authorize: SELF_HOSTED_URL_PATTERNS.github.authorize(instanceUrl),
        token: SELF_HOSTED_URL_PATTERNS.github.token(instanceUrl),
        userProfile: SELF_HOSTED_URL_PATTERNS.github.userProfile(instanceUrl),
        userEmails: SELF_HOSTED_URL_PATTERNS.github.userEmails(instanceUrl),
        userOrgs: SELF_HOSTED_URL_PATTERNS.github.userOrgs(instanceUrl),
      }
    : {
        authorize: OAUTH_PROVIDER_URLS.github.authorize,
        token: OAUTH_PROVIDER_URLS.github.token,
        userProfile: OAUTH_PROVIDER_URLS.github.userProfile,
        userEmails: OAUTH_PROVIDER_URLS.github.userEmails,
        userOrgs: OAUTH_PROVIDER_URLS.github.userOrgs,
      };

/**
 * Resolves the best available email from a GitHub user profile
 * and their verified email list.
 *
 * Priority: primary verified > any verified > profile.email > null
 * Returns both the email and whether it was verified by GitHub.
 */
const resolveEmail = (
  profile: GitHubUserProfile,
  emails: readonly GitHubUserEmail[]
): { readonly email: string | null; readonly verified: boolean } => {
  const primaryVerified = emails.find((entry) => entry.primary && entry.verified);
  if (primaryVerified) {
    return { email: primaryVerified.email, verified: true };
  }

  const anyVerified = emails.find((entry) => entry.verified);
  if (anyVerified) {
    return { email: anyVerified.email, verified: true };
  }

  return { email: profile.email ?? null, verified: false };
};

/**
 * Classifies whether a fetch error is retryable based on status code.
 * Network errors (no status) are treated as retryable.
 */
const isRetryableStatus = (status: number | undefined): boolean =>
  status === undefined || status >= 500 || status === 429;

// ==================== OAuth Port Implementation ====================

/**
 * Exchange an authorization code for a GitHub access token.
 */
const exchangeCode = async (
  code: string,
  instanceUrl: string | null,
  context: RequestContext,
  codeVerifier?: string
): Promise<OAuthTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const urls = getUrls(instanceUrl);
  const callbackUrl = `${config.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`;
  const startTime = Date.now();

  try {
    const tokenBody: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    };
    if (codeVerifier) {
      tokenBody.code_verifier = codeVerifier;
    }

    const response = await fetch(urls.token, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokenBody),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "github",
        `Token exchange failed with status ${String(response.status)}`,
        {
          metadata: {
            operation: "exchangeCode",
            statusCode: response.status,
            durationMs,
          },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as GitHubTokenResponse;

    if (data.error) {
      throw new ExternalServiceError(
        "github",
        `Token exchange error: ${data.error_description ?? data.error}`,
        {
          metadata: {
            operation: "exchangeCode",
            errorCode: data.error,
            durationMs,
          },
          retryable: false,
        }
      );
    }

    logger.info("GitHub token exchange completed", {
      provider: "github",
      operation: "exchangeCode",
      durationMs,
      statusCode: response.status,
      ...context,
    });

    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresIn: null,
      scope: data.scope,
      tokenType: data.token_type,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitHub token exchange failed", {
      provider: "github",
      operation: "exchangeCode",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("github", "Failed to exchange authorization code", {
      metadata: { operation: "exchangeCode", durationMs },
      retryable: true,
    });
  }
};

/**
 * Fetch the authenticated GitHub user's profile and primary email.
 */
const getUserProfile = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<OAuthProviderProfile> => {
  const urls = getUrls(instanceUrl);
  const startTime = Date.now();

  const authHeaders: Record<string, string> = {
    Authorization: `token ${accessToken}`,
    Accept: "application/json",
  };

  try {
    const [profileResponse, emailsResponse] = await Promise.all([
      fetch(urls.userProfile, {
        headers: authHeaders,
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      }),
      fetch(urls.userEmails, {
        headers: authHeaders,
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      }),
    ]);

    const durationMs = Date.now() - startTime;

    if (!profileResponse.ok) {
      throw new ExternalServiceError(
        "github",
        `User profile fetch failed with status ${String(profileResponse.status)}`,
        {
          metadata: {
            operation: "getUserProfile",
            statusCode: profileResponse.status,
            durationMs,
          },
          retryable: isRetryableStatus(profileResponse.status),
        }
      );
    }

    if (!emailsResponse.ok) {
      throw new ExternalServiceError(
        "github",
        `User emails fetch failed with status ${String(emailsResponse.status)}`,
        {
          metadata: {
            operation: "getUserProfile",
            statusCode: emailsResponse.status,
            durationMs,
          },
          retryable: isRetryableStatus(emailsResponse.status),
        }
      );
    }

    const profile = (await profileResponse.json()) as GitHubUserProfile;
    const emails = (await emailsResponse.json()) as readonly GitHubUserEmail[];

    const resolvedEmail = resolveEmail(profile, emails);

    logger.info("GitHub user profile fetched", {
      provider: "github",
      operation: "getUserProfile",
      durationMs,
      statusCode: profileResponse.status,
      ...context,
    });

    return {
      providerUserId: String(profile.id),
      username: profile.login,
      email: resolvedEmail.email,
      emailVerified: resolvedEmail.verified,
      displayName: profile.name ?? profile.login,
      avatarUrl: profile.avatar_url,
      rawProfile: profile as unknown as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitHub user profile fetch failed", {
      provider: "github",
      operation: "getUserProfile",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("github", "Failed to fetch user profile from GitHub", {
      metadata: { operation: "getUserProfile", durationMs },
      retryable: true,
    });
  }
};

/**
 * Build the membership API URL for a specific org.
 * GitHub API: GET /user/memberships/orgs/{org}
 */
const getMembershipUrl = (instanceUrl: string | null, orgLogin: string): string =>
  instanceUrl
    ? `${instanceUrl}/api/v3/user/memberships/orgs/${encodeURIComponent(orgLogin)}`
    : `https://api.github.com/user/memberships/orgs/${encodeURIComponent(orgLogin)}`;

/**
 * Fetch the authenticated user's role in a specific org via the membership endpoint.
 * Best-effort fallback: returns undefined on any error (caller defaults to "member").
 */
const fetchOrgMembershipRole = async (
  accessToken: string,
  instanceUrl: string | null,
  orgLogin: string,
  context: RequestContext
): Promise<string | undefined> => {
  const url = getMembershipUrl(instanceUrl, orgLogin);
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      logger.warn("GitHub org membership fetch returned non-OK status", {
        provider: "github",
        operation: "getOrgMembership",
        orgLogin,
        statusCode: response.status,
        durationMs,
        ...context,
      });
      return undefined;
    }

    const membership = (await response.json()) as {
      readonly role?: string;
      readonly state?: string;
    };

    logger.debug("GitHub org membership fetched", {
      provider: "github",
      operation: "getOrgMembership",
      orgLogin,
      role: membership.role,
      state: membership.state,
      durationMs,
      ...context,
    });

    return membership.role;
  } catch (error) {
    logger.warn("GitHub org membership fetch failed (best-effort)", {
      provider: "github",
      operation: "getOrgMembership",
      orgLogin,
      durationMs: Date.now() - startTime,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });
    return undefined;
  }
};

/**
 * Fetch GitHub App installations accessible to the authenticated user.
 * Returns account logins from installations, which includes both orgs AND
 * personal accounts where the app is installed. This is essential because
 * /user/orgs only returns organizations, missing personal account installations.
 *
 * Best-effort: returns empty array on failure so org discovery still works
 * via /user/orgs alone.
 */
const fetchUserInstallations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly string[]> => {
  const baseUrl = instanceUrl ?? "https://api.github.com";
  const url = `${baseUrl}/user/installations`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      logger.warn("GitHub user installations fetch returned non-OK status", {
        provider: "github",
        operation: "fetchUserInstallations",
        statusCode: response.status,
        durationMs,
        ...context,
      });
      return [];
    }

    const data = (await response.json()) as GitHubInstallationsResponse;

    logger.info("GitHub user installations fetched", {
      provider: "github",
      operation: "fetchUserInstallations",
      durationMs,
      statusCode: response.status,
      installationCount: data.total_count,
      ...context,
    });

    return data.installations.map((installation) => installation.account.login);
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.warn("GitHub user installations fetch failed (best-effort)", {
      provider: "github",
      operation: "fetchUserInstallations",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });
    return [];
  }
};

/**
 * Fetch the authenticated GitHub user's organization memberships.
 *
 * Also fetches /user/installations to discover accounts (orgs + personal)
 * where the GitHub App is installed. This makes org discovery resilient to
 * missed webhooks (e.g., webhook URL misconfigured, service down, etc.).
 *
 * When /user/orgs omits the `role` field for any org, falls back to
 * the per-org membership endpoint (GET /user/memberships/orgs/{org})
 * to retrieve the accurate role. This avoids defaulting all users
 * to "member" when the bulk endpoint doesn't surface roles.
 */
const getUserOrganizations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly OAuthOrganization[]> => {
  const urls = getUrls(instanceUrl);
  const startTime = Date.now();

  try {
    // Fetch orgs and installations in parallel for resilient discovery
    const [orgsResponse, installationLogins] = await Promise.all([
      fetch(urls.userOrgs, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      }),
      fetchUserInstallations(accessToken, instanceUrl, context),
    ]);

    const durationMs = Date.now() - startTime;

    if (!orgsResponse.ok) {
      throw new ExternalServiceError(
        "github",
        `User orgs fetch failed with status ${String(orgsResponse.status)}`,
        {
          metadata: {
            operation: "getUserOrganizations",
            statusCode: orgsResponse.status,
            durationMs,
          },
          retryable: isRetryableStatus(orgsResponse.status),
        }
      );
    }

    const orgs = (await orgsResponse.json()) as readonly GitHubOrg[];

    logger.info("GitHub user organizations fetched", {
      provider: "github",
      operation: "getUserOrganizations",
      durationMs,
      statusCode: orgsResponse.status,
      orgCount: orgs.length,
      installationCount: installationLogins.length,
      ...context,
    });

    // Build result from /user/orgs first
    const orgLoginSet = new Set(orgs.map((org) => org.login.toLowerCase()));

    // Enrich orgs with missing roles via per-org membership endpoint
    const orgsWithMissingRoles = orgs.filter((org) => !org.role);
    // let: enrichedOrgResults is conditionally built from async role enrichment
    let enrichedOrgResults: readonly OAuthOrganization[];

    if (orgsWithMissingRoles.length > 0) {
      logger.info("Fetching per-org membership roles for orgs missing role field", {
        provider: "github",
        operation: "getUserOrganizations",
        missingRoleCount: orgsWithMissingRoles.length,
        totalOrgCount: orgs.length,
        ...context,
      });

      const enrichedRoles = await Promise.all(
        orgsWithMissingRoles.map(async (org) => ({
          login: org.login,
          role: await fetchOrgMembershipRole(accessToken, instanceUrl, org.login, context),
        }))
      );

      const roleMap = new Map(enrichedRoles.map((entry) => [entry.login, entry.role]));

      enrichedOrgResults = orgs.map((org) => ({
        login: org.login,
        role: org.role ?? roleMap.get(org.login),
      }));
    } else {
      enrichedOrgResults = orgs.map((org) => ({ login: org.login, role: org.role }));
    }

    // Merge installation accounts not already in /user/orgs.
    // This captures personal accounts and orgs where the app is installed
    // but the user might not have org-level membership visible via /user/orgs.
    const installationOnlyLogins = installationLogins.filter(
      (login) => !orgLoginSet.has(login.toLowerCase())
    );

    if (installationOnlyLogins.length > 0) {
      logger.info("Discovered additional accounts from GitHub App installations", {
        provider: "github",
        operation: "getUserOrganizations",
        additionalAccounts: installationOnlyLogins,
        ...context,
      });
    }

    const installationOrgs: readonly OAuthOrganization[] = installationOnlyLogins.map((login) => ({
      login,
    }));

    return [...enrichedOrgResults, ...installationOrgs];
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitHub user organizations fetch failed", {
      provider: "github",
      operation: "getUserOrganizations",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("github", "Failed to fetch user organizations from GitHub", {
      metadata: { operation: "getUserOrganizations", durationMs },
      retryable: true,
    });
  }
};

// ==================== Export ====================

/** GitHub OAuth adapter implementing the provider-agnostic OAuthPort. */
export const githubOAuthAdapter: OAuthPort = {
  exchangeCode,
  getUserProfile,
  getUserOrganizations,
};
