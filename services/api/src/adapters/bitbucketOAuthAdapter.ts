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
  resilientGet,
  resilientPost,
  type OAuthTokenResponse,
  type OAuthProviderProfile,
  type RequestContext,
} from "@kenchi/shared";

import type { OAuthPort, OAuthOrganization } from "../ports/oauthPort.js";
import type {
  BitbucketTokenResponse,
  BitbucketUserProfile,
  BitbucketEmailsResponse,
  BitbucketWorkspacePermissionsResponse,
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
  context: RequestContext,
  codeVerifier?: string
): Promise<OAuthTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();

  const formParams: Readonly<Record<string, string>> = {
    grant_type: "authorization_code",
    code,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  };

  const response = await resilientPost<BitbucketTokenResponse>(
    OAUTH_PROVIDER_URLS.bitbucket.token,
    undefined,
    {
      rawBody: new URLSearchParams(formParams).toString(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: buildBasicAuthHeader(clientId, clientSecret),
      },
      timeout: BITBUCKET_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  const data = response.data;

  if (data.error) {
    throw new ExternalServiceError(
      "bitbucket",
      `Bitbucket exchange error: ${data.error_description ?? data.error}`,
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

  logger.info("Bitbucket code exchange completed", {
    provider: "bitbucket",
    operation: "exchangeCode",
    durationMs: response.duration,
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
  const authHeaders: Readonly<Record<string, string>> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  const requestOptions = {
    headers: authHeaders,
    timeout: BITBUCKET_TIMEOUT_MS,
    maxRetries: 2,
  };

  const [profileResponse, emailsResponse] = await Promise.all([
    resilientGet<BitbucketUserProfile>(OAUTH_PROVIDER_URLS.bitbucket.userProfile, requestOptions),
    resilientGet<BitbucketEmailsResponse>(OAUTH_PROVIDER_URLS.bitbucket.userEmails, requestOptions),
  ]);

  const profile = profileResponse.data;
  const emails = emailsResponse.data;
  const email = resolveEmail(emails);

  logger.info("Bitbucket user profile fetched", {
    provider: "bitbucket",
    operation: "getUserProfile",
    durationMs: profileResponse.duration,
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

  // Use permissions/workspaces endpoint to get both workspace and role in one call
  const permissionsUrl = "https://api.bitbucket.org/2.0/user/permissions/workspaces";

  const response = await resilientGet<BitbucketWorkspacePermissionsResponse>(permissionsUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    timeout: BITBUCKET_TIMEOUT_MS,
    maxRetries: 2,
  });

  logger.info("Bitbucket user workspace permissions fetched", {
    provider: "bitbucket",
    operation: "getUserOrganizations",
    durationMs: response.duration,
    statusCode: response.status,
    orgCount: response.data.values.length,
    ...context,
  });

  return response.data.values.map((entry) => ({
    login: entry.workspace.slug,
    role: entry.permission,
  }));
};

// ==================== Export ====================

/** Bitbucket OAuth adapter implementing the provider-agnostic OAuthPort. */
export const bitbucketOAuthAdapter: OAuthPort = {
  exchangeCode,
  getUserProfile,
  getUserOrganizations,
};
