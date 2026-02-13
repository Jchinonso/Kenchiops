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
  context: RequestContext
): Promise<OAuthTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const urls = getUrls(instanceUrl);
  const callbackUrl = `${config.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`;
  const startTime = Date.now();

  try {
    const response = await fetch(urls.token, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
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
 * Fetch the authenticated GitHub user's organization memberships.
 */
const getUserOrganizations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly OAuthOrganization[]> => {
  const urls = getUrls(instanceUrl);
  const startTime = Date.now();

  try {
    const response = await fetch(urls.userOrgs, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "github",
        `User orgs fetch failed with status ${String(response.status)}`,
        {
          metadata: {
            operation: "getUserOrganizations",
            statusCode: response.status,
            durationMs,
          },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const orgs = (await response.json()) as readonly GitHubOrg[];

    logger.info("GitHub user organizations fetched", {
      provider: "github",
      operation: "getUserOrganizations",
      durationMs,
      statusCode: response.status,
      orgCount: orgs.length,
      ...context,
    });

    return orgs.map((org) => ({ login: org.login }));
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
