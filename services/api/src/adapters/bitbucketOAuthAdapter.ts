/**
 * Bitbucket OAuth Adapter
 *
 * Implements OAuthPort for Bitbucket Cloud.
 * All HTTP calls to Bitbucket APIs are encapsulated here.
 * Vendor types are mapped to Kenchi domain types before
 * crossing the port boundary.
 *
 * @module adapters/bitbucketOAuthAdapter
 */

import {
  config,
  OAUTH_PROVIDER_URLS,
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
  BitbucketTokenResponse,
  BitbucketUserProfile,
  BitbucketEmailsResponse,
  BitbucketWorkspacesResponse,
} from "./oauthAdapterTypes.js";

// ==================== Constants ====================

const BITBUCKET_TIMEOUT_MS = 10_000;

const logger = createLogger("bitbucket-oauth-adapter");

// ==================== Internal Helpers ====================

/**
 * Reads and validates Bitbucket OAuth client credentials from config.
 * Throws ValidationError if either value is missing.
 */
const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.BITBUCKET_OAUTH_CLIENT_ID;
  const clientSecret = config.BITBUCKET_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ValidationError("Bitbucket OAuth client credentials are not configured", {
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
 * Resolves the best available email from Bitbucket's email list.
 *
 * Priority: primary confirmed > any confirmed > null
 */
const resolveEmail = (emails: BitbucketEmailsResponse): string | null => {
  const primaryConfirmed = emails.values.find((entry) => entry.is_primary && entry.is_confirmed);
  if (primaryConfirmed) {
    return primaryConfirmed.email;
  }

  const anyConfirmed = emails.values.find((entry) => entry.is_confirmed);
  if (anyConfirmed) {
    return anyConfirmed.email;
  }

  return null;
};

/**
 * Strips curly braces from Bitbucket's UUID format.
 * Bitbucket returns UUIDs as "{uuid-here}" — we normalize to "uuid-here".
 */
const stripBraces = (uuid: string): string => uuid.replace(/[{}]/g, "");

/**
 * Classifies whether a fetch error is retryable based on status code.
 * Network errors (no status) are treated as retryable.
 */
const isRetryableStatus = (status: number | undefined): boolean =>
  status === undefined || status >= 500 || status === 429;

/**
 * Builds the Basic auth header value for Bitbucket credential exchange.
 */
const buildBasicAuthHeader = (clientId: string, clientSecret: string): string => {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${encoded}`;
};

// ==================== OAuth Port Implementation ====================

/**
 * Exchange an authorization code for a Bitbucket access token.
 * Bitbucket uses Basic auth + URL-encoded body (not JSON).
 */
const exchangeCode = async (
  code: string,
  _instanceUrl: string | null,
  context: RequestContext
): Promise<OAuthTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const startTime = Date.now();

  try {
    const response = await fetch(OAUTH_PROVIDER_URLS.bitbucket.token, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: buildBasicAuthHeader(clientId, clientSecret),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
      }).toString(),
      signal: AbortSignal.timeout(BITBUCKET_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "bitbucket",
        `Bitbucket exchange failed with status ${String(response.status)}`,
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

    const data = (await response.json()) as BitbucketTokenResponse;

    if (data.error) {
      throw new ExternalServiceError(
        "bitbucket",
        `Bitbucket exchange error: ${data.error_description ?? data.error}`,
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

    logger.info("Bitbucket code exchange completed", {
      provider: "bitbucket",
      operation: "exchangeCode",
      durationMs,
      statusCode: response.status,
      ...context,
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scopes,
      tokenType: data.token_type,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Bitbucket code exchange failed", {
      provider: "bitbucket",
      operation: "exchangeCode",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("bitbucket", "Failed to exchange authorization code", {
      metadata: { operation: "exchangeCode", durationMs },
      retryable: true,
    });
  }
};

/**
 * Fetch the authenticated Bitbucket user's profile and primary email.
 * Email requires a separate API call (parallel with profile).
 */
const getUserProfile = async (
  accessToken: string,
  _instanceUrl: string | null,
  context: RequestContext
): Promise<OAuthProviderProfile> => {
  const startTime = Date.now();

  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  try {
    const [profileResponse, emailsResponse] = await Promise.all([
      fetch(OAUTH_PROVIDER_URLS.bitbucket.userProfile, {
        headers: authHeaders,
        signal: AbortSignal.timeout(BITBUCKET_TIMEOUT_MS),
      }),
      fetch(OAUTH_PROVIDER_URLS.bitbucket.userEmails, {
        headers: authHeaders,
        signal: AbortSignal.timeout(BITBUCKET_TIMEOUT_MS),
      }),
    ]);

    const durationMs = Date.now() - startTime;

    if (!profileResponse.ok) {
      throw new ExternalServiceError(
        "bitbucket",
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
        "bitbucket",
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

    const profile = (await profileResponse.json()) as BitbucketUserProfile;
    const emails = (await emailsResponse.json()) as BitbucketEmailsResponse;

    const email = resolveEmail(emails);

    logger.info("Bitbucket user profile fetched", {
      provider: "bitbucket",
      operation: "getUserProfile",
      durationMs,
      statusCode: profileResponse.status,
      ...context,
    });

    return {
      providerUserId: stripBraces(profile.uuid),
      username: profile.username,
      email,
      // Bitbucket resolveEmail only returns confirmed emails (or null)
      emailVerified: email !== null,
      displayName: profile.display_name ?? profile.username,
      avatarUrl: profile.links.avatar.href,
      rawProfile: profile as unknown as Record<string, unknown>,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Bitbucket user profile fetch failed", {
      provider: "bitbucket",
      operation: "getUserProfile",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("bitbucket", "Failed to fetch user profile from Bitbucket", {
      metadata: { operation: "getUserProfile", durationMs },
      retryable: true,
    });
  }
};

/**
 * Fetch the authenticated Bitbucket user's workspace memberships.
 * Bitbucket Server (self-hosted) uses a different API, so if
 * instanceUrl is provided, returns empty with a warning log.
 */
const getUserOrganizations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly OAuthOrganization[]> => {
  if (instanceUrl) {
    logger.warn("Bitbucket Server workspaces not supported, returning empty", {
      provider: "bitbucket",
      operation: "getUserOrganizations",
      instanceUrl,
      ...context,
    });
    return [];
  }

  const startTime = Date.now();

  try {
    const response = await fetch(OAUTH_PROVIDER_URLS.bitbucket.userWorkspaces, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(BITBUCKET_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "bitbucket",
        `User workspaces fetch failed with status ${String(response.status)}`,
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

    const workspaces = (await response.json()) as BitbucketWorkspacesResponse;

    logger.info("Bitbucket user workspaces fetched", {
      provider: "bitbucket",
      operation: "getUserOrganizations",
      durationMs,
      statusCode: response.status,
      orgCount: workspaces.values.length,
      ...context,
    });

    return workspaces.values.map((workspace) => ({ login: workspace.slug }));
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Bitbucket user workspaces fetch failed", {
      provider: "bitbucket",
      operation: "getUserOrganizations",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("bitbucket", "Failed to fetch user workspaces from Bitbucket", {
      metadata: { operation: "getUserOrganizations", durationMs },
      retryable: true,
    });
  }
};

// ==================== Export ====================

/** Bitbucket OAuth adapter implementing the provider-agnostic OAuthPort. */
export const bitbucketOAuthAdapter: OAuthPort = {
  exchangeCode,
  getUserProfile,
  getUserOrganizations,
};
