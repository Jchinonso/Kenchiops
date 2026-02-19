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

const isRetryableStatus = (status: number | undefined): boolean =>
  status === undefined || status >= 500 || status === 429;

// ==================== Port Implementation ====================

const exchangeCode = async (
  code: string,
  redirectUri: string,
  context: RequestContext
): Promise<IntegrationTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const startTime = Date.now();

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(INTEGRATION_OAUTH_TOKEN_URLS.netlify, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(NETLIFY_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        PROVIDER,
        `Netlify token exchange failed with status ${String(response.status)}`,
        {
          metadata: { operation: "exchangeCode", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as NetlifyTokenResponse;

    if (data.error) {
      throw new ExternalServiceError(
        PROVIDER,
        `Netlify token exchange error: ${data.error_description ?? data.error}`,
        {
          metadata: { operation: "exchangeCode", errorCode: data.error, durationMs },
          retryable: false,
        }
      );
    }

    logger.info("Netlify token exchange completed", {
      provider: PROVIDER,
      operation: "exchangeCode",
      durationMs,
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
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Netlify token exchange failed", {
      provider: PROVIDER,
      operation: "exchangeCode",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to exchange Netlify authorization code", {
      metadata: { operation: "exchangeCode", durationMs },
      retryable: true,
    });
  }
};

/**
 * Fetch the authenticated user's primary Netlify account info.
 * Best-effort -- returns null on failure.
 */
const fetchAccountInfo = async (
  accessToken: string,
  context: RequestContext
): Promise<NetlifyAccount | null> => {
  const startTime = Date.now();

  try {
    const response = await fetch("https://api.netlify.com/api/v1/accounts", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(NETLIFY_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      logger.warn("Netlify account info fetch failed (non-fatal)", {
        provider: PROVIDER,
        operation: "fetchAccountInfo",
        durationMs,
        statusCode: response.status,
        ...context,
      });
      return null;
    }

    const accounts = (await response.json()) as readonly NetlifyAccount[];

    logger.info("Netlify account info fetched", {
      provider: PROVIDER,
      operation: "fetchAccountInfo",
      durationMs,
      statusCode: response.status,
      accountCount: accounts.length,
      ...context,
    });

    return accounts[0] ?? null;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.warn("Netlify account info fetch failed (non-fatal)", {
      provider: PROVIDER,
      operation: "fetchAccountInfo",
      durationMs,
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
  const startTime = Date.now();

  try {
    const response = await fetch(INTEGRATION_API_URLS.netlify.sites, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(NETLIFY_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        PROVIDER,
        `Netlify list sites failed with status ${String(response.status)}`,
        {
          metadata: { operation: "listProjects", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const sites = (await response.json()) as readonly NetlifySite[];

    logger.info("Netlify sites listed", {
      provider: PROVIDER,
      operation: "listProjects",
      durationMs,
      statusCode: response.status,
      siteCount: sites.length,
      ...context,
    });

    return sites.map((site) => ({
      id: site.id,
      name: site.name,
      url: site.url,
    }));
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Netlify list sites failed", {
      provider: PROVIDER,
      operation: "listProjects",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to list Netlify sites", {
      metadata: { operation: "listProjects", durationMs },
      retryable: true,
    });
  }
};

const createWebhook = async (
  accessToken: string,
  webhookUrl: string,
  _secret: string,
  _teamId: string | null,
  context: RequestContext
): Promise<CreatedWebhook> => {
  const startTime = Date.now();

  try {
    const response = await fetch(INTEGRATION_API_URLS.netlify.hooks, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "url",
        event: "deploy_failed",
        data: { url: webhookUrl },
      }),
      signal: AbortSignal.timeout(NETLIFY_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        PROVIDER,
        `Netlify create hook failed with status ${String(response.status)}`,
        {
          metadata: { operation: "createWebhook", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as NetlifyHook;

    logger.info("Netlify webhook created", {
      provider: PROVIDER,
      operation: "createWebhook",
      durationMs,
      statusCode: response.status,
      hookId: data.id,
      ...context,
    });

    return { webhookId: data.id, url: webhookUrl };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Netlify create hook failed", {
      provider: PROVIDER,
      operation: "createWebhook",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to create Netlify webhook", {
      metadata: { operation: "createWebhook", durationMs },
      retryable: true,
    });
  }
};

const deleteWebhook = async (
  accessToken: string,
  webhookId: string,
  _teamId: string | null,
  context: RequestContext
): Promise<void> => {
  const startTime = Date.now();

  try {
    const response = await fetch(`${INTEGRATION_API_URLS.netlify.hooks}/${webhookId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(NETLIFY_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok && response.status !== 404) {
      throw new ExternalServiceError(
        PROVIDER,
        `Netlify delete hook failed with status ${String(response.status)}`,
        {
          metadata: { operation: "deleteWebhook", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    logger.info("Netlify webhook deleted", {
      provider: PROVIDER,
      operation: "deleteWebhook",
      durationMs,
      statusCode: response.status,
      hookId: webhookId,
      ...context,
    });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Netlify delete hook failed", {
      provider: PROVIDER,
      operation: "deleteWebhook",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to delete Netlify webhook", {
      metadata: { operation: "deleteWebhook", durationMs },
      retryable: true,
    });
  }
};

// ==================== Export ====================

export const netlifyIntegrationAdapter: IntegrationOAuthPort = {
  exchangeCode,
  listProjects,
  createWebhook,
  deleteWebhook,
};
