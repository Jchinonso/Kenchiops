/**
 * Integration OAuth Service
 *
 * Business logic for connecting/disconnecting CI providers via OAuth.
 * Orchestrates token exchange, webhook creation, and credential storage.
 *
 * @module services/integrationService
 */

import crypto from "node:crypto";
import {
  createLogger,
  getErrorMessage,
  NotFoundError,
  ValidationError,
  config,
  encryptValue,
  decryptValue,
  enforcePlanLimit,
  findByTenantAndProvider,
  findConnectionById,
  createProviderConnection,
  updateProviderConnection,
  deactivateConnection,
  findByTenant,
  type IntegrationProvider,
  type RequestContext,
} from "@kenchi/shared";

import type { IntegrationOAuthPort } from "../ports/integrationOAuthPort.js";
import type {
  ConnectIntegrationResult,
  DisconnectIntegrationResult,
  IntegrationConnectionStatus,
} from "./integrationServiceTypes.js";

// ==================== Constants ====================

/** Buffer before token expiry at which to trigger refresh (5 minutes). */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Number of random bytes used to generate webhook secrets. */
const WEBHOOK_SECRET_BYTES = 32;

// ==================== Helpers ====================

/** Generate a random webhook secret as a hex string. */
const generateWebhookSecret = (): string =>
  crypto.randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");

/** Compute the webhook URL for a given provider. */
const getWebhookUrl = (provider: IntegrationProvider): string => {
  const WEBHOOK_PATH_MAP: Readonly<Record<IntegrationProvider, string>> = {
    vercel: "/webhooks/vercel",
    netlify: "/webhooks/netlify",
  };
  return `${config.OAUTH_CALLBACK_BASE_URL}${WEBHOOK_PATH_MAP[provider]}`;
};

/** Map provider to config client ID. */
const getIntegrationClientId = (provider: IntegrationProvider): string | undefined => {
  const CLIENT_ID_MAP: Readonly<Record<IntegrationProvider, string | undefined>> = {
    vercel: config.VERCEL_OAUTH_CLIENT_ID,
    netlify: config.NETLIFY_OAUTH_CLIENT_ID,
  };
  return CLIENT_ID_MAP[provider];
};

/** Safely extract a string value from a config record by key. */
const getConfigString = (
  configRecord: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = configRecord[key];
  return typeof value === "string" ? value : null;
};

// ==================== Webhook Helpers ====================

interface WebhookCreationResult {
  readonly webhookCreated: boolean;
  readonly webhookId: string | null;
}

/** Attempt to create a webhook on the provider (non-fatal on failure). */
const tryCreateWebhook = async (
  adapter: IntegrationOAuthPort,
  accessValue: string,
  webhookUrl: string,
  webhookCredential: string,
  teamId: string | null,
  provider: IntegrationProvider,
  context: RequestContext
): Promise<WebhookCreationResult> => {
  const logger = createLogger("integration-service");

  try {
    const webhook = await adapter.createWebhook(
      accessValue,
      webhookUrl,
      webhookCredential,
      teamId,
      context
    );

    logger.info("Integration webhook created", {
      provider,
      webhookId: webhook.webhookId,
      ...context,
    });

    return { webhookCreated: true, webhookId: webhook.webhookId };
  } catch (webhookError: unknown) {
    logger.warn("Failed to create integration webhook (non-fatal)", {
      provider,
      error: getErrorMessage(webhookError),
      ...context,
    });

    return { webhookCreated: false, webhookId: null };
  }
};

/** Attempt to delete a webhook on the provider (non-fatal on failure). */
const tryDeleteWebhook = async (
  adapter: IntegrationOAuthPort,
  accessValue: string,
  webhookId: string,
  externalOrgId: string | null,
  provider: string,
  context: RequestContext
): Promise<boolean> => {
  const logger = createLogger("integration-service");

  try {
    await adapter.deleteWebhook(accessValue, webhookId, externalOrgId, context);

    logger.info("Integration webhook deleted", {
      provider,
      webhookId,
      ...context,
    });

    return true;
  } catch (deleteError: unknown) {
    logger.warn("Failed to delete integration webhook (non-fatal)", {
      provider,
      webhookId,
      error: getErrorMessage(deleteError),
      ...context,
    });

    return false;
  }
};

// ==================== Service Type ====================

interface IntegrationService {
  readonly connect: (
    provider: IntegrationProvider,
    code: string,
    redirectUri: string,
    tenantId: string,
    context: RequestContext
  ) => Promise<ConnectIntegrationResult>;
  readonly disconnect: (
    connectionId: string,
    tenantId: string,
    context: RequestContext
  ) => Promise<DisconnectIntegrationResult>;
  readonly listConnections: (
    tenantId: string,
    context: RequestContext
  ) => Promise<readonly IntegrationConnectionStatus[]>;
  readonly refreshIfNeeded: (connectionId: string, context: RequestContext) => Promise<void>;
}

// ==================== Service Factory ====================

/**
 * Create the integration service with injected adapter lookup.
 *
 * @param getAdapter - Function to retrieve the adapter for a given provider.
 */
export const createIntegrationService = (
  getAdapter: (provider: IntegrationProvider) => IntegrationOAuthPort
): IntegrationService => ({
  /**
   * Connect a CI provider via OAuth.
   *
   * Flow: exchange code -> create webhook -> store encrypted tokens.
   */
  connect: async (
    provider: IntegrationProvider,
    code: string,
    redirectUri: string,
    tenantId: string,
    context: RequestContext
  ): Promise<ConnectIntegrationResult> => {
    const logger = createLogger("integration-service");

    // Verify client ID is configured
    const clientId = getIntegrationClientId(provider);
    if (!clientId) {
      throw new ValidationError(
        `OAuth client ID not configured for integration provider ${provider}`,
        {
          operation: "connectIntegration",
          metadata: { provider },
        }
      );
    }

    // Enforce plan limit on integrations
    await enforcePlanLimit(tenantId, "max_integrations");

    // Check for existing active connection
    const existing = await findByTenantAndProvider(tenantId, provider);
    if (existing) {
      throw new ValidationError(`Tenant already has an active ${provider} connection`, {
        operation: "connectIntegration",
        metadata: { provider, connectionId: existing.id },
      });
    }

    const adapter = getAdapter(provider);

    // Exchange authorization code for tokens
    const tokens = await adapter.exchangeCode(code, redirectUri, context);

    logger.info("Integration token exchange completed", {
      provider,
      hasRefresh: tokens.refreshToken !== null,
      ...context,
    });

    // Create webhook on the provider (non-fatal)
    const credential = generateWebhookSecret();
    const webhookUrl = getWebhookUrl(provider);
    const { webhookCreated, webhookId } = await tryCreateWebhook(
      adapter,
      tokens.accessToken,
      webhookUrl,
      credential,
      tokens.teamId,
      provider,
      context
    );

    // Compute token expiry
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;

    // Store connection with encrypted tokens
    const connection = await createProviderConnection({
      tenantId,
      provider,
      connectionName: tokens.teamName ?? provider,
      externalOrgId: tokens.teamId,
      accessToken: tokens.accessToken,
      webhookSecret: credential,
      tokenExpiresAt: expiresAt,
      config: {
        ...(tokens.refreshToken ? { refreshToken: encryptValue(tokens.refreshToken) } : {}),
        ...(webhookId ? { webhookId } : {}),
      },
    });

    logger.info("Integration connection created", {
      provider,
      connectionId: connection.id,
      webhookCreated,
      ...context,
    });

    return {
      connectionId: connection.id,
      provider,
      teamName: tokens.teamName,
      webhookCreated,
    };
  },

  /**
   * Disconnect a CI provider connection.
   *
   * Flow: delete remote webhook (best-effort) -> soft-delete DB row.
   */
  disconnect: async (
    connectionId: string,
    tenantId: string,
    context: RequestContext
  ): Promise<DisconnectIntegrationResult> => {
    const logger = createLogger("integration-service");

    const connection = await findConnectionById(connectionId);

    if (!connection || connection.tenantId !== tenantId) {
      throw new NotFoundError("Integration connection not found", {
        operation: "disconnectIntegration",
        metadata: { connectionId },
      });
    }

    if (!connection.isActive) {
      throw new ValidationError("Connection is already disconnected", {
        operation: "disconnectIntegration",
        metadata: { connectionId },
      });
    }

    // Best-effort delete remote webhook
    const connectionConfig = connection.config;
    const storedWebhookId = getConfigString(connectionConfig, "webhookId");

    const webhookDeleted =
      storedWebhookId && connection.accessToken
        ? await tryDeleteWebhook(
            getAdapter(connection.provider as IntegrationProvider),
            connection.accessToken,
            storedWebhookId,
            connection.externalOrgId,
            connection.provider,
            context
          )
        : false;

    // Soft-delete the connection
    await deactivateConnection(connectionId);

    logger.info("Integration connection deactivated", {
      provider: connection.provider,
      connectionId,
      webhookDeleted,
      ...context,
    });

    return { connectionId, webhookDeleted };
  },

  /**
   * List all integration connection statuses for a tenant.
   * Never exposes tokens -- only safe metadata for the frontend.
   */
  listConnections: async (
    tenantId: string,
    context: RequestContext
  ): Promise<readonly IntegrationConnectionStatus[]> => {
    const logger = createLogger("integration-service");

    const rows = await findByTenant(tenantId);

    logger.info("Listed integration connections", {
      ...context,
      count: rows.length,
    });

    return rows.map(({ provider, isActive, id, connectionName, createdAt }) => ({
      provider,
      connected: isActive,
      connectionId: id,
      connectionName,
      connectedAt: createdAt.toISOString(),
    }));
  },

  /**
   * Refresh the access token for a connection if it's expiring soon.
   * Only applicable for providers with token refresh (e.g. Vercel).
   */
  refreshIfNeeded: async (connectionId: string, context: RequestContext): Promise<void> => {
    const logger = createLogger("integration-service");

    const connection = await findConnectionById(connectionId);

    if (!connection || !connection.isActive) {
      return;
    }

    // Skip if no expiry set or not expiring soon
    if (!connection.tokenExpiresAt) {
      return;
    }

    const expiresInMs = connection.tokenExpiresAt.getTime() - Date.now();
    if (expiresInMs > TOKEN_REFRESH_BUFFER_MS) {
      return;
    }

    const adapter = getAdapter(connection.provider as IntegrationProvider);

    if (!adapter.refreshToken) {
      logger.warn("Expiring but provider has no refresh capability", {
        provider: connection.provider,
        connectionId,
        expiresInMs,
        ...context,
      });
      return;
    }

    const connectionConfig = connection.config;
    const encryptedRefresh = getConfigString(connectionConfig, "refreshToken");

    if (!encryptedRefresh) {
      logger.warn("Expiring but no refresh value stored", {
        provider: connection.provider,
        connectionId,
        ...context,
      });
      return;
    }

    const stored = decryptValue(encryptedRefresh);

    if (!stored) {
      logger.warn("Refresh token decryption returned empty", {
        provider: connection.provider,
        connectionId,
        ...context,
      });
      return;
    }

    const newTokens = await adapter.refreshToken(stored, context);

    const newExpiresAt = newTokens.expiresIn
      ? new Date(Date.now() + newTokens.expiresIn * 1000)
      : null;

    await updateProviderConnection({
      id: connectionId,
      accessToken: newTokens.accessToken,
      tokenExpiresAt: newExpiresAt,
      config: {
        ...connectionConfig,
        ...(newTokens.refreshToken ? { refreshToken: encryptValue(newTokens.refreshToken) } : {}),
      },
    });

    logger.info("Integration credentials refreshed", {
      provider: connection.provider,
      connectionId,
      ...context,
    });
  },
});
