/**
 * Azure DevOps OAuth Adapter
 *
 * Implements OAuthPort for Azure DevOps (cloud only).
 * Azure DevOps uses a non-standard OAuth flow with JWT bearer
 * assertions. Self-hosted Azure DevOps Server is not supported.
 *
 * All HTTP calls to Azure DevOps APIs are encapsulated here.
 * Vendor types are mapped to Kenchi domain types before
 * crossing the port boundary.
 *
 * @module adapters/azureDevOpsOAuthAdapter
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
  AzureDevOpsTokenResponse,
  AzureDevOpsUserProfile,
  AzureDevOpsAccountsResponse,
} from "./oauthAdapterTypes.js";

// ==================== Constants ====================

const AZURE_DEVOPS_TIMEOUT_MS = 10_000;

const AZURE_DEVOPS_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

const AZURE_DEVOPS_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

const logger = createLogger("azure-devops-oauth-adapter");

// ==================== Internal Helpers ====================

/**
 * Reads and validates Azure DevOps OAuth client credentials from config.
 * Throws ValidationError if either value is missing.
 */
const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.AZURE_DEVOPS_OAUTH_CLIENT_ID;
  const clientSecret = config.AZURE_DEVOPS_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ValidationError("Azure DevOps OAuth client credentials are not configured", {
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
 * Validates that no self-hosted instance URL is provided.
 * Azure DevOps Server (on-premises) is not yet supported.
 */
const rejectSelfHosted = (instanceUrl: string | null): void => {
  if (instanceUrl) {
    throw new ValidationError("Azure DevOps Server (self-hosted) is not yet supported", {
      operation: "rejectSelfHosted",
      metadata: { instanceUrl },
    });
  }
};

/**
 * Fetch the user profile from Azure DevOps.
 * Returns the raw vendor profile, used internally by both
 * getUserProfile and getUserOrganizations.
 */
const fetchProfile = async (
  accessToken: string,
  context: RequestContext
): Promise<AzureDevOpsUserProfile> => {
  const profileUrl = `${OAUTH_PROVIDER_URLS.azure_devops.userProfile}?api-version=6.0`;

  const response = await resilientGet<AzureDevOpsUserProfile>(profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    timeout: AZURE_DEVOPS_TIMEOUT_MS,
    maxRetries: 2,
  });

  logger.info("Azure DevOps user profile fetched", {
    provider: "azure_devops",
    operation: "fetchProfile",
    durationMs: response.duration,
    statusCode: response.status,
    ...context,
  });

  return response.data;
};

// ==================== OAuth Port Implementation ====================

/**
 * Exchange an authorization code for an Azure DevOps access token.
 * Uses non-standard JWT bearer assertion grant type.
 */
const exchangeCode = async (
  code: string,
  instanceUrl: string | null,
  context: RequestContext,
  _codeVerifier?: string
): Promise<OAuthTokenResponse> => {
  rejectSelfHosted(instanceUrl);
  const { clientId: _clientId, clientSecret } = ensureClientCredentials();
  const callbackUrl = `${config.OAUTH_CALLBACK_BASE_URL}/auth/azure_devops/callback`;

  const params = new URLSearchParams({
    client_assertion_type: AZURE_DEVOPS_ASSERTION_TYPE,
    client_assertion: clientSecret,
    grant_type: AZURE_DEVOPS_GRANT_TYPE,
    assertion: code,
    redirect_uri: callbackUrl,
  });

  const response = await resilientPost<AzureDevOpsTokenResponse>(
    OAUTH_PROVIDER_URLS.azure_devops.token,
    undefined,
    {
      rawBody: params.toString(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: AZURE_DEVOPS_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  const data = response.data;

  if (data.error) {
    throw new ExternalServiceError(
      "azure_devops",
      `Azure DevOps exchange error: ${data.error_description ?? data.error}`,
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

  logger.info("Azure DevOps code exchange completed", {
    provider: "azure_devops",
    operation: "exchangeCode",
    durationMs: response.duration,
    statusCode: response.status,
    ...context,
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: OAUTH_PROVIDER_URLS.azure_devops.scopes.join(" "),
    tokenType: data.token_type,
  };
};

/**
 * Fetch the authenticated Azure DevOps user's profile.
 * Avatar URL is not available from the profile API.
 */
const getUserProfile = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<OAuthProviderProfile> => {
  rejectSelfHosted(instanceUrl);

  const profile = await fetchProfile(accessToken, context);

  return {
    providerUserId: profile.id,
    username: profile.publicAlias,
    email: profile.emailAddress,
    // Azure DevOps emails come from Azure AD/Microsoft accounts (verified)
    emailVerified: profile.emailAddress !== null,
    displayName: profile.displayName ?? profile.publicAlias,
    avatarUrl: null,
    rawProfile: profile as unknown as Record<string, unknown>,
  };
};

/**
 * Fetch the authenticated Azure DevOps user's organization memberships.
 * Requires the user's memberId (profile ID), so fetches the profile first.
 */
const getUserOrganizations = async (
  accessToken: string,
  instanceUrl: string | null,
  context: RequestContext
): Promise<readonly OAuthOrganization[]> => {
  rejectSelfHosted(instanceUrl);

  const profile = await fetchProfile(accessToken, context);

  const accountsUrl = `${OAUTH_PROVIDER_URLS.azure_devops.userAccounts}?memberId=${profile.id}&api-version=6.0`;

  const response = await resilientGet<AzureDevOpsAccountsResponse>(accountsUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    timeout: AZURE_DEVOPS_TIMEOUT_MS,
    maxRetries: 2,
  });

  logger.info("Azure DevOps user accounts fetched", {
    provider: "azure_devops",
    operation: "getUserOrganizations",
    durationMs: response.duration,
    statusCode: response.status,
    orgCount: response.data.value.length,
    ...context,
  });

  return response.data.value.map((account) => ({ login: account.accountName }));
};

// ==================== Export ====================

/** Azure DevOps OAuth adapter implementing the provider-agnostic OAuthPort. */
export const azureDevOpsOAuthAdapter: OAuthPort = {
  exchangeCode,
  getUserProfile,
  getUserOrganizations,
};
