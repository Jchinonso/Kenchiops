/**
 * Tenant Slack Client Factory
 *
 * Creates and manages Slack WebClient instances for multi-tenant operation.
 * Each tenant has their own Slack workspace with unique credentials stored in the database.
 */

import { WebClient, LogLevel } from "@slack/web-api";
import {
  createLogger,
  getSlackCredentials,
  config,
} from "@kenchi/shared";

const logger = createLogger("tenant-slack-client");

/**
 * Client cache to avoid creating new clients for every request.
 * Key: installation_id, Value: { client, createdAt }
 */
interface CachedClient {
  readonly client: WebClient;
  readonly createdAt: number;
  readonly workspaceId: string;
}

const clientCache = new Map<number, CachedClient>();

/**
 * Cache TTL in milliseconds (5 minutes)
 * Clients are recreated after TTL to pick up token refreshes
 */
const CLIENT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Log level lookup based on environment
 */
const LOG_LEVEL_BY_ENV: Record<string, LogLevel> = {
  development: LogLevel.DEBUG,
  test: LogLevel.ERROR,
  production: LogLevel.ERROR,
};

/**
 * Check if a cached client is expired
 */
const isExpired = (cached: CachedClient, now: number): boolean =>
  now - cached.createdAt > CLIENT_CACHE_TTL;

/**
 * Check if a cached client is valid (exists and not expired)
 */
const isValidCache = (cached: CachedClient | undefined, now: number): cached is CachedClient =>
  cached !== undefined && !isExpired(cached, now);

/**
 * Clean up expired clients from cache using functional approach
 */
const cleanupExpiredClients = (): void => {
  const now = Date.now();
  const expiredEntries = Array.from(clientCache.entries())
    .filter(([, cached]) => isExpired(cached, now));

  const deletedCount = expiredEntries.length;
  expiredEntries.forEach(([installationId]) => {
    clientCache.delete(installationId);
    logger.debug("Evicted expired Slack client from cache", { installationId });
  });

  deletedCount > 0 && logger.debug("Cache cleanup complete", { deletedCount });
};

// Clean up expired clients every minute
setInterval(cleanupExpiredClients, 60 * 1000);

/**
 * Create a new Slack WebClient with appropriate configuration
 */
const createSlackClient = (token: string): WebClient =>
  new WebClient(token, {
    logLevel: LOG_LEVEL_BY_ENV[config.NODE_ENV] ?? LogLevel.ERROR,
  });

/**
 * Get a Slack WebClient for a specific tenant identified by GitHub installation ID.
 *
 * @param installationId - GitHub App installation ID
 * @returns Slack WebClient configured for the tenant's workspace
 * @throws Error if tenant not found or no Slack token available
 */
export const getSlackClientForTenant = async (
  installationId: number
): Promise<WebClient> => {
  const now = Date.now();
  const cached = clientCache.get(installationId);

  // Return cached client if valid
  if (isValidCache(cached, now)) {
    logger.debug("Using cached Slack client", { installationId });
    return cached.client;
  }

  // Lookup tenant credentials
  const credentials = await getSlackCredentials(installationId);

  // Credentials are required for multi-tenant operation
  if (!credentials) {
    throw new Error(
      `No Slack credentials found for installation ${installationId}. ` +
        "Ensure the tenant has completed Slack OAuth."
    );
  }

  // Create and cache new client
  const client = createSlackClient(credentials.token);

  clientCache.set(installationId, {
    client,
    createdAt: now,
    workspaceId: credentials.workspaceId,
  });

  logger.info("Created new Slack client for tenant", {
    installationId,
    workspaceId: credentials.workspaceId,
  });

  return client;
};

/**
 * Get the workspace ID for a cached client.
 * Useful for logging and debugging.
 *
 * @param installationId - GitHub App installation ID
 * @returns Workspace ID or null if not cached
 */
export const getCachedWorkspaceId = (installationId: number): string | null =>
  clientCache.get(installationId)?.workspaceId ?? null;

/**
 * Invalidate cached client for a tenant.
 * Call this when a tenant's token is updated.
 *
 * @param installationId - GitHub App installation ID
 */
export const invalidateTenantClient = (installationId: number): void => {
  const existed = clientCache.delete(installationId);
  existed && logger.info("Invalidated cached Slack client", { installationId });
};

/**
 * Clear all cached clients.
 * Useful for testing or when doing bulk token updates.
 */
export const clearAllCachedClients = (): void => {
  const count = clientCache.size;
  clientCache.clear();
  logger.info("Cleared all cached Slack clients", { count });
};

/**
 * Get cache statistics for monitoring.
 */
export const getCacheStats = (): {
  readonly size: number;
  readonly installationIds: readonly number[];
} => ({
  size: clientCache.size,
  installationIds: Array.from(clientCache.keys()),
});

/**
 * Check if multi-tenant mode is enabled.
 * In multi-tenant mode, Slack clients are created per-tenant from database credentials.
 * In single-tenant mode, a single client is used from environment variables.
 */
export const isMultiTenantEnabled = (): boolean =>
  config.MULTI_TENANT_MODE === true;
