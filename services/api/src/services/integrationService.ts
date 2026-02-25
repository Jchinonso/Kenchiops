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
  encryptForTenant,
  decryptAuto,
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
  TryCreateWebhookOptions,
  WebhookCreationResult,
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

/** Attempt to create a webhook on the provider (non-fatal on failure). */
const tryCreateWebhook = async (
  options: TryCreateWebhookOptions
): Promise<WebhookCreationResult> => {
  const { adapter, accessValue, webhookUrl, webhookCredential, teamId, provider, context } =
    options;
  const webhookLogger = createLogger("integration-service");

  try {
    const webhook = await adapter.createWebhook(
      accessValue,
      webhookUrl,
      webhookCredential,
      teamId,
      context
    );

    webhookLogger.info("Integration webhook created", {
      provider,
      webhookId: webhook.webhookId,
      ...context,
    });

    return { webhookCreated: true, webhookId: webhook.webhookId };
  } catch (webhookError: unknown) {
    webhookLogger.warn("Failed to create integration webhook (non-fatal)", {
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
  const deleteLogger = createLogger("integration-service");

  try {
    await adapter.deleteWebhook(accessValue, webhookId, externalOrgId, context);

    deleteLogger.info("Integration webhook deleted", {
      provider,
      webhookId,
      ...context,
    });

    return true;
  } catch (deleteError: unknown) {
    deleteLogger.warn("Failed to delete integration webhook (non-fatal)", {
      provider,
      webhookId,
      error: getErrorMessage(deleteError),
      ...context,
    });

    return false;
  }
};

// ==================== Extracted Methods ====================

/** Connect a CI provider via OAuth: exchange code, create webhook, store tokens. */
const connectImpl = async (
  getAdapter: (provider: IntegrationProvider) => IntegrationOAuthPort,
  provider: IntegrationProvider,
  code: string,
  redirectUri: string,
  tenantId: string,
  context: RequestContext
): Promise<ConnectIntegrationResult> => {
  const connectLogger = createLogger("integration-service");

  const clientId = getIntegrationClientId(provider);
  if (!clientId) {
    throw new ValidationError(
      `OAuth client ID not configured for integration provider ${provider}`,
      { operation: "connectIntegration", metadata: { provider } }
    );
  }

  const existing = await findByTenantAndProvider(tenantId, provider);
  if (existing) {
    throw new ValidationError(`Tenant already has an active ${provider} connection`, {
      operation: "connectIntegration",
      metadata: { provider, connectionId: existing.id },
    });
  }

  await enforcePlanLimit(tenantId, "max_integrations");

  const adapter = getAdapter(provider);
  const tokens = await adapter.exchangeCode(code, redirectUri, context);

  connectLogger.info("Integration token exchange completed", {
    provider,
    hasRefresh: tokens.refreshToken !== null,
    ...context,
  });

  const credential = generateWebhookSecret();
  const webhookUrl = getWebhookUrl(provider);
  const { webhookCreated, webhookId } = await tryCreateWebhook({
    adapter,
    accessValue: tokens.accessToken,
    webhookUrl,
    webhookCredential: credential,
    teamId: tokens.teamId,
    provider,
    context,
  });

  const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;

  const encryptedConfig = {
    ...(tokens.refreshToken
      ? { refreshToken: await encryptForTenant(tenantId, tokens.refreshToken) }
      : {}),
    ...(webhookId ? { webhookId } : {}),
  };

  const connection = await createProviderConnection({
    tenantId,
    provider,
    connectionName: tokens.teamName ?? provider,
    externalOrgId: tokens.teamId,
    accessToken: tokens.accessToken,
    webhookSecret: credential,
    tokenExpiresAt: expiresAt,
    config: encryptedConfig,
  });

  connectLogger.info("Integration connection created", {
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
};

/** Refresh the access token for a connection if it is expiring soon. */
const refreshIfNeededImpl = async (
  getAdapter: (provider: IntegrationProvider) => IntegrationOAuthPort,
  connectionId: string,
  context: RequestContext
): Promise<void> => {
  const refreshLogger = createLogger("integration-service");

  const connection = await findConnectionById(connectionId);
  if (!connection || !connection.isActive) {
    return;
  }

  if (!connection.tokenExpiresAt) {
    return;
  }

  const expiresInMs = connection.tokenExpiresAt.getTime() - Date.now();
  if (expiresInMs > TOKEN_REFRESH_BUFFER_MS) {
    return;
  }

  const adapter = getAdapter(connection.provider as IntegrationProvider);

  if (!adapter.refreshToken) {
    refreshLogger.warn("Expiring but provider has no refresh capability", {
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
    refreshLogger.warn("Expiring but no refresh value stored", {
      provider: connection.provider,
      connectionId,
      ...context,
    });
    return;
  }

  const stored = await decryptAuto(connection.tenantId, encryptedRefresh);

  if (!stored) {
    refreshLogger.warn("Refresh token decryption returned empty", {
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

  const updatedConfig = {
    ...connectionConfig,
    ...(newTokens.refreshToken
      ? { refreshToken: await encryptForTenant(connection.tenantId, newTokens.refreshToken) }
      : {}),
  };

  await updateProviderConnection({
    id: connectionId,
    tenantId: connection.tenantId,
    accessToken: newTokens.accessToken,
    tokenExpiresAt: newExpiresAt,
    config: updatedConfig,
  });

  refreshLogger.info("Integration credentials refreshed", {
    provider: connection.provider,
    connectionId,
    ...context,
  });
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
  connect: (
    provider: IntegrationProvider,
    code: string,
    redirectUri: string,
    tenantId: string,
    context: RequestContext
  ): Promise<ConnectIntegrationResult> =>
    connectImpl(getAdapter, provider, code, redirectUri, tenantId, context),

  disconnect: async (
    connectionId: string,
    tenantId: string,
    context: RequestContext
  ): Promise<DisconnectIntegrationResult> => {
    const disconnectLogger = createLogger("integration-service");

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

    await deactivateConnection(connectionId);

    disconnectLogger.info("Integration connection deactivated", {
      provider: connection.provider,
      connectionId,
      webhookDeleted,
      ...context,
    });

    return { connectionId, webhookDeleted };
  },

  listConnections: async (
    tenantId: string,
    context: RequestContext
  ): Promise<readonly IntegrationConnectionStatus[]> => {
    const listLogger = createLogger("integration-service");

    const rows = await findByTenant(tenantId);

    listLogger.info("Listed integration connections", {
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

  refreshIfNeeded: (connectionId: string, context: RequestContext): Promise<void> =>
    refreshIfNeededImpl(getAdapter, connectionId, context),
});
