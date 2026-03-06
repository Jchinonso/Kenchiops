/**
 * Vercel Integration OAuth Adapter
 *
 * Implements IntegrationOAuthPort for Vercel.
 * All HTTP calls to Vercel APIs are encapsulated here.
 * Vendor types are mapped to Kenchi domain types before
 * crossing the port boundary.
 *
 * @module adapters/vercelIntegrationAdapter
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
  VercelTokenResponse,
  VercelProjectsResponse,
  VercelWebhookResponse,
} from "./integrationAdapterTypes.js";

// ==================== Constants ====================

const VERCEL_TIMEOUT_MS = 15_000;
const PROVIDER = "vercel" as const;

const logger = createLogger("vercel-integration-adapter");

// ==================== Internal Helpers ====================

const ensureClientCredentials = (): {
  readonly clientId: string;
  readonly clientSecret: string;
} => {
  const clientId = config.VERCEL_OAUTH_CLIENT_ID;
  const clientSecret = config.VERCEL_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ValidationError("Vercel OAuth client credentials are not configured", {
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
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await resilientPost<VercelTokenResponse>(
    INTEGRATION_OAUTH_TOKEN_URLS.vercel,
    undefined,
    {
      rawBody: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: VERCEL_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  const data = response.data;

  if (data.error) {
    throw new ExternalServiceError(
      PROVIDER,
      `Vercel token exchange error: ${data.error_description ?? data.error}`,
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

  logger.info("Vercel token exchange completed", {
    provider: PROVIDER,
    operation: "exchangeCode",
    durationMs: response.duration,
    statusCode: response.status,
    ...context,
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
    teamId: data.team_id ?? null,
    teamName: null,
  };
};

const listProjects = async (
  accessToken: string,
  teamId: string | null,
  context: RequestContext
): Promise<readonly IntegrationProject[]> => {
  const url = new URL(INTEGRATION_API_URLS.vercel.projects);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  const response = await resilientGet<VercelProjectsResponse>(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: VERCEL_TIMEOUT_MS,
    maxRetries: 2,
  });

  logger.info("Vercel projects listed", {
    provider: PROVIDER,
    operation: "listProjects",
    durationMs: response.duration,
    statusCode: response.status,
    projectCount: response.data.projects.length,
    ...context,
  });

  return response.data.projects.map((proj) => ({
    id: proj.id,
    name: proj.name,
    url: null,
  }));
};

const createWebhook = async (
  accessToken: string,
  webhookUrl: string,
  secret: string,
  teamId: string | null,
  context: RequestContext
): Promise<CreatedWebhook> => {
  const url = new URL(INTEGRATION_API_URLS.vercel.webhooks);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  const response = await resilientPost<VercelWebhookResponse>(
    url.toString(),
    {
      url: webhookUrl,
      events: ["deployment.error", "deployment.ready"],
      secret,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: VERCEL_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  logger.info("Vercel webhook created", {
    provider: PROVIDER,
    operation: "createWebhook",
    durationMs: response.duration,
    statusCode: response.status,
    webhookId: response.data.id,
    ...context,
  });

  return { webhookId: response.data.id, url: response.data.url };
};

const deleteWebhook = async (
  accessToken: string,
  webhookId: string,
  teamId: string | null,
  context: RequestContext
): Promise<void> => {
  const url = new URL(`${INTEGRATION_API_URLS.vercel.webhooks}/${webhookId}`);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  try {
    const response = await resilientDelete<unknown>(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: VERCEL_TIMEOUT_MS,
      maxRetries: 2,
    });

    logger.info("Vercel webhook deleted", {
      provider: PROVIDER,
      operation: "deleteWebhook",
      durationMs: response.duration,
      statusCode: response.status,
      webhookId,
      ...context,
    });
  } catch (error) {
    // 404 is treated as success (webhook already gone)
    if (error instanceof ExternalServiceError && error.message.includes("HTTP 404")) {
      logger.info("Vercel webhook already deleted (404)", {
        provider: PROVIDER,
        operation: "deleteWebhook",
        webhookId,
        ...context,
      });
      return;
    }
    throw error;
  }
};

const refreshToken = async (
  currentRefreshToken: string,
  context: RequestContext
): Promise<IntegrationTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: currentRefreshToken,
    grant_type: "refresh_token",
  });

  const response = await resilientPost<VercelTokenResponse>(
    INTEGRATION_OAUTH_TOKEN_URLS.vercel,
    undefined,
    {
      rawBody: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: VERCEL_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  const data = response.data;

  if (data.error) {
    throw new ExternalServiceError(
      PROVIDER,
      `Vercel token refresh error: ${data.error_description ?? data.error}`,
      {
        metadata: {
          operation: "refreshToken",
          errorCode: data.error,
          durationMs: response.duration,
        },
        retryable: false,
      }
    );
  }

  logger.info("Vercel token refresh completed", {
    provider: PROVIDER,
    operation: "refreshToken",
    durationMs: response.duration,
    statusCode: response.status,
    ...context,
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
    teamId: data.team_id ?? null,
    teamName: null,
  };
};

// ==================== Export ====================

export const vercelIntegrationAdapter: IntegrationOAuthPort = {
  exchangeCode,
  listProjects,
  createWebhook,
  deleteWebhook,
  refreshToken,
};
