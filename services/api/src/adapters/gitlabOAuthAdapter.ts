/**
 * GitLab OAuth Adapter
 *
 * Implements OAuthPort for GitLab (cloud and self-hosted).
 * All HTTP calls to GitLab APIs are encapsulated here.
 * Vendor types are mapped to Kenchi domain types before
 * crossing the port boundary.
 *
 * @module adapters/gitlabOAuthAdapter
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
import type { GitLabTokenResponse, GitLabUserProfile, GitLabGroup } from "./oauthAdapterTypes.js";

// ==================== Constants ====================

const GITLAB_TIMEOUT_MS = 10_000;

const logger = createLogger("gitlab-oauth-adapter");

// ==================== Internal Helpers ====================

/**
 * Reads and validates GitLab OAuth client credentials from config.
 * Throws ValidationError if either value is missing.
 */
const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.GITLAB_OAUTH_CLIENT_ID;
  const clientSecret = config.GITLAB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ValidationError("GitLab OAuth client credentials are not configured", {
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
 * Resolves GitLab API URLs for cloud or self-hosted instances.
 * Uses SELF_HOSTED_URL_PATTERNS when instanceUrl is provided,
 * otherwise falls back to OAUTH_PROVIDER_URLS for cloud.
 */
const getUrls = (
  instanceUrl: string | null
): {
  readonly tokenEndpoint: string;
  readonly userProfile: string;
  readonly userGroups: string;
} =>
  instanceUrl
    ? {
        tokenEndpoint: SELF_HOSTED_URL_PATTERNS.gitlab.token(instanceUrl),
        userProfile: SELF_HOSTED_URL_PATTERNS.gitlab.userProfile(instanceUrl),
        userGroups: SELF_HOSTED_URL_PATTERNS.gitlab.userGroups(instanceUrl),
      }
    : {
        tokenEndpoint: OAUTH_PROVIDER_URLS.gitlab.token,
        userProfile: OAUTH_PROVIDER_URLS.gitlab.userProfile,
        userGroups: OAUTH_PROVIDER_URLS.gitlab.userGroups,
      };

/**
 * Classifies whether a fetch error is retryable based on status code.
 * Network errors (no status) are treated as retryable.
 */
const isRetryableStatus = (status: number | undefined): boolean =>
  status === undefined || status >= 500 || status === 429;

// ==================== OAuth Port Implementation ====================

/**
 * Exchange an authorization code for a GitLab access token.
 */
const exchangeCode = async (
  code: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<OAuthTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const urls = getUrls(instanceUrl);
  const callbackUrl = `${config.OAUTH_CALLBACK_BASE_URL}/auth/gitlab/callback`;
  const startTime = Date.now();

  try {
    const response = await fetch(urls.tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl,
      }),
      signal: AbortSignal.timeout(GITLAB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "gitlab",
        `GitLab exchange failed with status ${String(response.status)}`,
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

    const data = (await response.json()) as GitLabTokenResponse;

    if (data.error) {
      throw new ExternalServiceError(
        "gitlab",
        `GitLab exchange error: ${data.error_description ?? data.error}`,
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

    logger.info("GitLab code exchange completed", {
      provider: "gitlab",
      operation: "exchangeCode",
      durationMs,
      statusCode: response.status,
      ...context,
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
      tokenType: data.token_type,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitLab code exchange failed", {
      provider: "gitlab",
      operation: "exchangeCode",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("gitlab", "Failed to exchange authorization code", {
      metadata: { operation: "exchangeCode", durationMs },
      retryable: true,
    });
  }
};

/**
 * Fetch the authenticated GitLab user's profile.
 * Email is included directly in the profile response.
 */
const getUserProfile = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<OAuthProviderProfile> => {
  const urls = getUrls(instanceUrl);
  const startTime = Date.now();

  try {
    const profileResponse = await fetch(urls.userProfile, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(GITLAB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!profileResponse.ok) {
      throw new ExternalServiceError(
        "gitlab",
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

    const profile = (await profileResponse.json()) as GitLabUserProfile;

    logger.info("GitLab user profile fetched", {
      provider: "gitlab",
      operation: "getUserProfile",
      durationMs,
      statusCode: profileResponse.status,
      ...context,
    });

    return {
      providerUserId: String(profile.id),
      username: profile.username,
      email: profile.email,
      // GitLab's confirmed_at field indicates whether the email was verified.
      // Self-hosted GitLab instances can disable email confirmation, so
      // presence of email alone is NOT proof of verification.
      emailVerified: profile.confirmed_at !== null && profile.confirmed_at !== undefined,
      displayName: profile.name ?? profile.username,
      avatarUrl: profile.avatar_url,
      rawProfile: profile as unknown as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitLab user profile fetch failed", {
      provider: "gitlab",
      operation: "getUserProfile",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("gitlab", "Failed to fetch user profile from GitLab", {
      metadata: { operation: "getUserProfile", durationMs },
      retryable: true,
    });
  }
};

/**
 * Fetch the authenticated GitLab user's group memberships.
 * Uses min_access_level=10 (Guest) to return all accessible groups.
 */
const getUserOrganizations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly OAuthOrganization[]> => {
  const urls = getUrls(instanceUrl);
  const startTime = Date.now();

  try {
    const response = await fetch(`${urls.userGroups}?min_access_level=10`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(GITLAB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "gitlab",
        `User groups fetch failed with status ${String(response.status)}`,
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

    const groups = (await response.json()) as readonly GitLabGroup[];

    logger.info("GitLab user groups fetched", {
      provider: "gitlab",
      operation: "getUserOrganizations",
      durationMs,
      statusCode: response.status,
      orgCount: groups.length,
      ...context,
    });

    return groups.map((group) => ({ login: group.path }));
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitLab user groups fetch failed", {
      provider: "gitlab",
      operation: "getUserOrganizations",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("gitlab", "Failed to fetch user groups from GitLab", {
      metadata: { operation: "getUserOrganizations", durationMs },
      retryable: true,
    });
  }
};

// ==================== Export ====================

/** GitLab OAuth adapter implementing the provider-agnostic OAuthPort. */
export const gitlabOAuthAdapter: OAuthPort = {
  exchangeCode,
  getUserProfile,
  getUserOrganizations,
};
