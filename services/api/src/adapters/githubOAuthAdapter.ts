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
  mapWithConcurrency,
  resilientGet,
  resilientPost,
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

const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = config.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ValidationError("GitHub OAuth client credentials are not configured", {
      operation: "ensureClientCredentials",
      metadata: { hasClientId: Boolean(clientId), hasClientSecret: Boolean(clientSecret) },
    });
  }
  return { clientId, clientSecret };
};

/** Resolves GitHub API URLs for cloud or self-hosted instances. */
const getUrls = (
  instanceUrl: string | null
): {
  readonly token: string;
  readonly userProfile: string;
  readonly userEmails: string;
  readonly userOrgs: string;
} =>
  instanceUrl
    ? {
        token: SELF_HOSTED_URL_PATTERNS.github.token(instanceUrl),
        userProfile: SELF_HOSTED_URL_PATTERNS.github.userProfile(instanceUrl),
        userEmails: SELF_HOSTED_URL_PATTERNS.github.userEmails(instanceUrl),
        userOrgs: SELF_HOSTED_URL_PATTERNS.github.userOrgs(instanceUrl),
      }
    : {
        token: OAUTH_PROVIDER_URLS.github.token,
        userProfile: OAUTH_PROVIDER_URLS.github.userProfile,
        userEmails: OAUTH_PROVIDER_URLS.github.userEmails,
        userOrgs: OAUTH_PROVIDER_URLS.github.userOrgs,
      };

/** Priority: primary verified > any verified > profile.email > null */
const resolveEmail = (
  profile: GitHubUserProfile,
  emails: readonly GitHubUserEmail[]
): { readonly email: string | null; readonly verified: boolean } => {
  const primaryVerified = emails.find((entry) => entry.primary && entry.verified);
  if (primaryVerified) return { email: primaryVerified.email, verified: true };
  const anyVerified = emails.find((entry) => entry.verified);
  if (anyVerified) return { email: anyVerified.email, verified: true };
  return { email: profile.email ?? null, verified: false };
};

// ==================== OAuth Port Implementation ====================

const exchangeCode = async (
  code: string,
  instanceUrl: string | null,
  context: RequestContext,
  codeVerifier?: string
): Promise<OAuthTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const urls = getUrls(instanceUrl);
  const callbackUrl = `${config.OAUTH_CALLBACK_BASE_URL}/auth/github/callback`;

  const tokenBody: Readonly<Record<string, string>> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  };

  const response = await resilientPost<GitHubTokenResponse>(urls.token, tokenBody, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    timeout: GITHUB_TIMEOUT_MS,
    maxRetries: 2,
  });

  const data = response.data;
  if (data.error) {
    throw new ExternalServiceError(
      "github",
      `Token exchange error: ${data.error_description ?? data.error}`,
      {
        metadata: {
          operation: "exchangeCode",
          errorCode: data.error,
          durationMs: response.duration,
        },
        retryable: false,
      }
    );
  }

  logger.info("GitHub token exchange completed", {
    provider: "github",
    operation: "exchangeCode",
    durationMs: response.duration,
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
};

const getUserProfile = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<OAuthProviderProfile> => {
  const urls = getUrls(instanceUrl);
  const opts = {
    headers: { Authorization: `token ${accessToken}`, Accept: "application/json" },
    timeout: GITHUB_TIMEOUT_MS,
    maxRetries: 2,
  };

  const [profileResponse, emailsResponse] = await Promise.all([
    resilientGet<GitHubUserProfile>(urls.userProfile, opts),
    resilientGet<readonly GitHubUserEmail[]>(urls.userEmails, opts),
  ]);

  const profile = profileResponse.data;
  const resolvedEmail = resolveEmail(profile, emailsResponse.data);

  logger.info("GitHub user profile fetched", {
    provider: "github",
    operation: "getUserProfile",
    durationMs: profileResponse.duration,
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
};

/** Best-effort per-org membership role fetch. Returns undefined on any error. */
const fetchOrgMembershipRole = async (
  accessToken: string,
  instanceUrl: string | null,
  orgLogin: string,
  context: RequestContext
): Promise<string | undefined> => {
  const base = instanceUrl ?? "https://api.github.com";
  const url = `${base}${instanceUrl ? "/api/v3" : ""}/user/memberships/orgs/${encodeURIComponent(orgLogin)}`;

  try {
    const response = await resilientGet<{ readonly role?: string; readonly state?: string }>(url, {
      headers: { Authorization: `token ${accessToken}`, Accept: "application/json" },
      timeout: GITHUB_TIMEOUT_MS,
      maxRetries: 1,
      skipCircuitBreaker: true,
    });
    logger.debug("GitHub org membership fetched", {
      provider: "github",
      operation: "getOrgMembership",
      orgLogin,
      role: response.data.role,
      durationMs: response.duration,
      ...context,
    });
    return response.data.role;
  } catch (error) {
    logger.warn("GitHub org membership fetch failed (best-effort)", {
      provider: "github",
      operation: "getOrgMembership",
      orgLogin,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });
    return undefined;
  }
};

/** Best-effort: returns org logins from /user/memberships/orgs (empty on failure). */
const fetchUserMemberships = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly string[]> => {
  const baseUrl = instanceUrl ?? "https://api.github.com";
  const url = `${baseUrl}/user/memberships/orgs?state=active&per_page=100`;

  try {
    const response = await resilientGet<
      ReadonlyArray<{
        readonly organization: { readonly login: string };
      }>
    >(url, {
      headers: { Authorization: `token ${accessToken}`, Accept: "application/vnd.github+json" },
      timeout: GITHUB_TIMEOUT_MS,
      maxRetries: 1,
      skipCircuitBreaker: true,
    });
    logger.info("GitHub user memberships fetched", {
      provider: "github",
      operation: "fetchUserMemberships",
      durationMs: response.duration,
      statusCode: response.status,
      membershipCount: response.data.length,
      ...context,
    });
    return response.data.map((membership) => membership.organization.login);
  } catch (error) {
    logger.warn("GitHub user memberships fetch failed (best-effort)", {
      provider: "github",
      operation: "fetchUserMemberships",
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });
    return [];
  }
};

/** Best-effort: returns account logins + installationIds from /user/installations. */
const fetchUserInstallations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<ReadonlyArray<{ readonly login: string; readonly installationId: number }>> => {
  const url = `${instanceUrl ?? "https://api.github.com"}/user/installations`;

  try {
    const response = await resilientGet<GitHubInstallationsResponse>(url, {
      headers: { Authorization: `token ${accessToken}`, Accept: "application/vnd.github+json" },
      timeout: GITHUB_TIMEOUT_MS,
      maxRetries: 1,
      skipCircuitBreaker: true,
    });
    logger.info("GitHub user installations fetched", {
      provider: "github",
      operation: "fetchUserInstallations",
      durationMs: response.duration,
      statusCode: response.status,
      installationCount: response.data.total_count,
      ...context,
    });
    return response.data.installations.map((inst) => ({
      login: inst.account.login,
      installationId: inst.id,
    }));
  } catch (error) {
    logger.warn("GitHub user installations fetch failed (best-effort)", {
      provider: "github",
      operation: "fetchUserInstallations",
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });
    return [];
  }
};

/**
 * Fetch the authenticated GitHub user's organization memberships.
 * Also fetches /user/installations and /user/memberships/orgs for
 * resilient discovery across OAuth app restrictions.
 */
const getUserOrganizations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly OAuthOrganization[]> => {
  const urls = getUrls(instanceUrl);

  const [orgsResponse, membershipLogins, installationData] = await Promise.all([
    resilientGet<readonly GitHubOrg[]>(`${urls.userOrgs}?per_page=100`, {
      headers: { Authorization: `token ${accessToken}`, Accept: "application/vnd.github+json" },
      timeout: GITHUB_TIMEOUT_MS,
      maxRetries: 2,
    }),
    fetchUserMemberships(accessToken, instanceUrl, context),
    fetchUserInstallations(accessToken, instanceUrl, context),
  ]);

  const orgs = orgsResponse.data;
  logger.info("GitHub user organizations fetched", {
    provider: "github",
    operation: "getUserOrganizations",
    durationMs: orgsResponse.duration,
    statusCode: orgsResponse.status,
    orgCount: orgs.length,
    membershipCount: membershipLogins.length,
    installationCount: installationData.length,
    ...context,
  });

  const orgLoginSet = new Set(orgs.map((org) => org.login.toLowerCase()));
  const installationIdMap = new Map(
    installationData.map((entry) => [entry.login.toLowerCase(), entry.installationId])
  );

  // Enrich orgs with missing roles via per-org membership endpoint
  const orgsWithMissingRoles = orgs.filter((org) => !org.role);
  let enrichedOrgResults: readonly OAuthOrganization[]; // let: conditionally assigned from async branch

  if (orgsWithMissingRoles.length > 0) {
    logger.info("Fetching per-org membership roles for orgs missing role field", {
      provider: "github",
      operation: "getUserOrganizations",
      missingRoleCount: orgsWithMissingRoles.length,
      totalOrgCount: orgs.length,
      ...context,
    });
    const enrichedRoles = await mapWithConcurrency(
      orgsWithMissingRoles,
      async (org) => ({
        login: org.login,
        role: await fetchOrgMembershipRole(accessToken, instanceUrl, org.login, context),
      }),
      5
    );
    const roleMap = new Map(enrichedRoles.map((entry) => [entry.login, entry.role]));
    enrichedOrgResults = orgs.map((org) => ({
      login: org.login,
      role: org.role ?? roleMap.get(org.login),
      installationId: installationIdMap.get(org.login.toLowerCase()),
    }));
  } else {
    enrichedOrgResults = orgs.map((org) => ({
      login: org.login,
      role: org.role,
      installationId: installationIdMap.get(org.login.toLowerCase()),
    }));
  }

  // Merge memberships and installations not already in /user/orgs
  const installationLogins = installationData.map((entry) => entry.login);
  const allAdditionalLogins = [...membershipLogins, ...installationLogins].filter(
    (login) => !orgLoginSet.has(login.toLowerCase())
  );
  const uniqueAdditionalLogins = [
    ...new Set(allAdditionalLogins.map((login) => login.toLowerCase())),
  ];
  const loginCaseMap = new Map(
    [...membershipLogins, ...installationLogins].map((login) => [login.toLowerCase(), login])
  );
  const deduplicatedLogins = uniqueAdditionalLogins
    .filter((lower) => !orgLoginSet.has(lower))
    .map((lower) => loginCaseMap.get(lower) ?? lower);

  if (deduplicatedLogins.length > 0) {
    logger.info("Discovered additional accounts from memberships/installations", {
      provider: "github",
      operation: "getUserOrganizations",
      additionalAccounts: deduplicatedLogins,
      ...context,
    });
  }

  const additionalOrgs: readonly OAuthOrganization[] = deduplicatedLogins.map((login) => ({
    login,
    installationId: installationIdMap.get(login.toLowerCase()),
  }));

  return [...enrichedOrgResults, ...additionalOrgs];
};

// ==================== Export ====================

/** GitHub OAuth adapter implementing the provider-agnostic OAuthPort. */
export const githubOAuthAdapter: OAuthPort = {
  exchangeCode,
  getUserProfile,
  getUserOrganizations,
};
