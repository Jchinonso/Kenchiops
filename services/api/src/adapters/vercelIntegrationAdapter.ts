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
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(INTEGRATION_OAUTH_TOKEN_URLS.vercel, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        PROVIDER,
        `Vercel token exchange failed with status ${String(response.status)}`,
        {
          metadata: { operation: "exchangeCode", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as VercelTokenResponse;

    if (data.error) {
      throw new ExternalServiceError(
        PROVIDER,
        `Vercel token exchange error: ${data.error_description ?? data.error}`,
        {
          metadata: { operation: "exchangeCode", errorCode: data.error, durationMs },
          retryable: false,
        }
      );
    }

    logger.info("Vercel token exchange completed", {
      provider: PROVIDER,
      operation: "exchangeCode",
      durationMs,
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
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Vercel token exchange failed", {
      provider: PROVIDER,
      operation: "exchangeCode",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to exchange Vercel authorization code", {
      metadata: { operation: "exchangeCode", durationMs },
      retryable: true,
    });
  }
};

const listProjects = async (
  accessToken: string,
  teamId: string | null,
  context: RequestContext
): Promise<readonly IntegrationProject[]> => {
  const startTime = Date.now();
  const url = new URL(INTEGRATION_API_URLS.vercel.projects);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        PROVIDER,
        `Vercel list projects failed with status ${String(response.status)}`,
        {
          metadata: { operation: "listProjects", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as VercelProjectsResponse;

    logger.info("Vercel projects listed", {
      provider: PROVIDER,
      operation: "listProjects",
      durationMs,
      statusCode: response.status,
      projectCount: data.projects.length,
      ...context,
    });

    return data.projects.map((proj) => ({
      id: proj.id,
      name: proj.name,
      url: null,
    }));
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Vercel list projects failed", {
      provider: PROVIDER,
      operation: "listProjects",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to list Vercel projects", {
      metadata: { operation: "listProjects", durationMs },
      retryable: true,
    });
  }
};

const createWebhook = async (
  accessToken: string,
  webhookUrl: string,
  secret: string,
  teamId: string | null,
  context: RequestContext
): Promise<CreatedWebhook> => {
  const startTime = Date.now();
  const url = new URL(INTEGRATION_API_URLS.vercel.webhooks);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ["deployment.error", "deployment.ready"],
        secret,
      }),
      signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        PROVIDER,
        `Vercel create webhook failed with status ${String(response.status)}`,
        {
          metadata: { operation: "createWebhook", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as VercelWebhookResponse;

    logger.info("Vercel webhook created", {
      provider: PROVIDER,
      operation: "createWebhook",
      durationMs,
      statusCode: response.status,
      webhookId: data.id,
      ...context,
    });

    return { webhookId: data.id, url: data.url };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Vercel create webhook failed", {
      provider: PROVIDER,
      operation: "createWebhook",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to create Vercel webhook", {
      metadata: { operation: "createWebhook", durationMs },
      retryable: true,
    });
  }
};

const deleteWebhook = async (
  accessToken: string,
  webhookId: string,
  teamId: string | null,
  context: RequestContext
): Promise<void> => {
  const startTime = Date.now();
  const url = new URL(`${INTEGRATION_API_URLS.vercel.webhooks}/${webhookId}`);
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok && response.status !== 404) {
      throw new ExternalServiceError(
        PROVIDER,
        `Vercel delete webhook failed with status ${String(response.status)}`,
        {
          metadata: { operation: "deleteWebhook", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    logger.info("Vercel webhook deleted", {
      provider: PROVIDER,
      operation: "deleteWebhook",
      durationMs,
      statusCode: response.status,
      webhookId,
      ...context,
    });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Vercel delete webhook failed", {
      provider: PROVIDER,
      operation: "deleteWebhook",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to delete Vercel webhook", {
      metadata: { operation: "deleteWebhook", durationMs },
      retryable: true,
    });
  }
};

const refreshToken = async (
  currentRefreshToken: string,
  context: RequestContext
): Promise<IntegrationTokenResponse> => {
  const { clientId, clientSecret } = ensureClientCredentials();
  const startTime = Date.now();

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: currentRefreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch(INTEGRATION_OAUTH_TOKEN_URLS.vercel, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        PROVIDER,
        `Vercel token refresh failed with status ${String(response.status)}`,
        {
          metadata: { operation: "refreshToken", statusCode: response.status, durationMs },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as VercelTokenResponse;

    if (data.error) {
      throw new ExternalServiceError(
        PROVIDER,
        `Vercel token refresh error: ${data.error_description ?? data.error}`,
        {
          metadata: { operation: "refreshToken", errorCode: data.error, durationMs },
          retryable: false,
        }
      );
    }

    logger.info("Vercel token refresh completed", {
      provider: PROVIDER,
      operation: "refreshToken",
      durationMs,
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
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("Vercel token refresh failed", {
      provider: PROVIDER,
      operation: "refreshToken",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to refresh Vercel token", {
      metadata: { operation: "refreshToken", durationMs },
      retryable: true,
    });
  }
};

// ==================== Export ====================

export const vercelIntegrationAdapter: IntegrationOAuthPort = {
  exchangeCode,
  listProjects,
  createWebhook,
  deleteWebhook,
  refreshToken,
};
