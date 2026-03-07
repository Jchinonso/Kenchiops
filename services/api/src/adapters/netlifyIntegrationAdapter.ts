/**
 * Netlify Integration OAuth Adapter
 *
 * Implements IntegrationOAuthPort for Netlify.
 * All HTTP calls to Netlify APIs are encapsulated here.
 * Vendor types are mapped to Kenchi domain types before
 * crossing the port boundary.
 *
 * @module adapters/netlifyIntegrationAdapter
 */

import {
  config,
  INTEGRATION_OAUTH_TOKEN_URLS,
  INTEGRATION_API_URLS,
  createLogger,
  ExternalServiceError,
  ValidationError,
  resilientGet,
  resilientPost,
  resilientDelete,
  redactSecrets,
  type RequestContext,
} from "@kenchi/shared";

import type {
  IntegrationOAuthPort,
  IntegrationTokenResponse,
  IntegrationProject,
  CreatedWebhook,
} from "../ports/integrationOAuthPort.js";
import type {
  NetlifyTokenResponse,
  NetlifySite,
  NetlifyHook,
  NetlifyAccount,
} from "./integrationAdapterTypes.js";

// ==================== Constants ====================

const NETLIFY_TIMEOUT_MS = 15_000;
const PROVIDER = "netlify" as const;

const logger = createLogger("netlify-integration-adapter");

// ==================== Internal Helpers ====================

const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.NETLIFY_OAUTH_CLIENT_ID;
  const clientSecret = config.NETLIFY_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ValidationError("Netlify OAuth client credentials are not configured", {
      operation: "ensureClientCredentials",
      metadata: {
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
      },
    });
  }

  return { clientId, clientSecret };
};

// ==================== Port Implementation ====================

const exchangeCode = async (
  code: string,
  redirectUri: string,
  context: RequestContext
): Promise<IntegrationTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await resilientPost<NetlifyTokenResponse>(
    INTEGRATION_OAUTH_TOKEN_URLS.netlify,
    undefined,
    {
      rawBody: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: NETLIFY_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  const data = response.data;

  if (data.error) {
    throw new ExternalServiceError(
      PROVIDER,
      `Netlify token exchange error: ${data.error_description ?? data.error}`,
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

  logger.info("Netlify token exchange completed", {
    provider: PROVIDER,
    operation: "exchangeCode",
    durationMs: response.duration,
    statusCode: response.status,
    ...context,
  });

  // Fetch the user's account info to get the team/account name
  const accountInfo = await fetchAccountInfo(data.access_token, context);

  return {
    accessToken: data.access_token,
    refreshToken: null,
    expiresIn: null,
    teamId: accountInfo?.slug ?? null,
    teamName: accountInfo?.name ?? null,
  };
};

/**
 * Fetch the authenticated user's primary Netlify account info.
 * Best-effort -- returns null on failure.
 */
const fetchAccountInfo = async (
  accessToken: string,
  context: RequestContext
): Promise<NetlifyAccount | null> => {
  try {
    const response = await resilientGet<readonly NetlifyAccount[]>(
      "https://api.netlify.com/api/v1/accounts",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: NETLIFY_TIMEOUT_MS,
        maxRetries: 1,
        skipCircuitBreaker: true,
      }
    );

    logger.info("Netlify account info fetched", {
      provider: PROVIDER,
      operation: "fetchAccountInfo",
      durationMs: response.duration,
      statusCode: response.status,
      accountCount: response.data.length,
      ...context,
    });

    return response.data[0] ?? null;
  } catch (error) {
    logger.warn("Netlify account info fetch failed (non-fatal)", {
      provider: PROVIDER,
      operation: "fetchAccountInfo",
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    return null;
  }
};

const listProjects = async (
  accessToken: string,
  _teamId: string | null,
  context: RequestContext
): Promise<readonly IntegrationProject[]> => {
  const response = await resilientGet<readonly NetlifySite[]>(INTEGRATION_API_URLS.netlify.sites, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: NETLIFY_TIMEOUT_MS,
    maxRetries: 2,
  });

  logger.info("Netlify sites listed", {
    provider: PROVIDER,
    operation: "listProjects",
    durationMs: response.duration,
    statusCode: response.status,
    siteCount: response.data.length,
    ...context,
  });

  return response.data.map((site) => ({
    id: site.id,
    name: site.name,
    url: site.url,
  }));
};

const createWebhook = async (
  accessToken: string,
  webhookUrl: string,
  _secret: string,
  _teamId: string | null,
  context: RequestContext
): Promise<CreatedWebhook> => {
  const response = await resilientPost<NetlifyHook>(
    INTEGRATION_API_URLS.netlify.hooks,
    {
      type: "url",
      event: "deploy_failed",
      data: { url: webhookUrl },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: NETLIFY_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  logger.info("Netlify webhook created", {
    provider: PROVIDER,
    operation: "createWebhook",
    durationMs: response.duration,
    statusCode: response.status,
    hookId: response.data.id,
    ...context,
  });

  return { webhookId: response.data.id, url: webhookUrl };
};

const deleteWebhook = async (
  accessToken: string,
  webhookId: string,
  _teamId: string | null,
  context: RequestContext
): Promise<void> => {
  try {
    const response = await resilientDelete<unknown>(
      `${INTEGRATION_API_URLS.netlify.hooks}/${webhookId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: NETLIFY_TIMEOUT_MS,
        maxRetries: 2,
      }
    );

    logger.info("Netlify webhook deleted", {
      provider: PROVIDER,
      operation: "deleteWebhook",
      durationMs: response.duration,
      statusCode: response.status,
      hookId: webhookId,
      ...context,
    });
  } catch (error) {
    // 404 is treated as success (webhook already gone)
    if (error instanceof ExternalServiceError && error.message.includes("HTTP 404")) {
      logger.info("Netlify webhook already deleted (404)", {
        provider: PROVIDER,
        operation: "deleteWebhook",
        hookId: webhookId,
        ...context,
      });
      return;
    }
    throw error;
  }
};

// ==================== Export ====================

export const netlifyIntegrationAdapter: IntegrationOAuthPort = {
  exchangeCode,
  listProjects,
  createWebhook,
  deleteWebhook,
};
