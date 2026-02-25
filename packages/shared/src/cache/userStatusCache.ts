/**
 * User Status Cache
 *
 * Redis-backed real-time user status checks for auth middleware.
 * Only stores non-active states (suspended, revoked, deleted).
 * Designed to be fail-open: if Redis is unavailable, requests pass through.
 *
 * Key format: kenchi:user-status:{userId}
 * TTL: 900 seconds (15 minutes, matching JWT lifetime)
 *
 * @module cache/userStatusCache
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import {
  REDIS_KEY_PREFIXES,
  REDIS_TIMEOUTS,
  REDIS_READY_STATUS,
  CACHE_TTL_SECONDS,
} from "../constants/index.js";

const logger = createLogger("user-status-cache");

/** Builds the Redis key for a user status flag. */
const buildKey = (userId: string): string => `${REDIS_KEY_PREFIXES.USER_STATUS}:${userId}`;

/** Checks if the Redis client is connected and ready. */
const isClientReady = (): boolean => {
  try {
    const client = getRedisClient();
    return client.status === REDIS_READY_STATUS;
  } catch {
    return false;
  }
};

/**
 * Sets a non-active status flag for a user in Redis.
 * Used when a user is suspended, revoked, or deleted to block
 * further API access during the remainder of their JWT lifetime.
 *
 * @param userId - The user ID to flag
 * @param status - The blocking status (e.g., "suspended", "revoked", "deleted")
 * @returns true if the flag was set, false on failure
 */
export const setUserStatusFlag = async (userId: string, status: string): Promise<boolean> => {
  if (!isClientReady()) {
    logger.debug("Redis not ready, skipping user status flag set", { userId });
    return false;
  }

  try {
    const client = getRedisClient();
    const key = buildKey(userId);
    const startTime = Date.now();

    await withTimeout(
      client.setex(key, CACHE_TTL_SECONDS.STANDARD, status),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    const durationMs = Date.now() - startTime;
    logger.debug("User status flag set", { userId, status, durationMs });
    return true;
  } catch (error: unknown) {
    logger.warn("User status flag set did not complete", {
      userId,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Clears a user status flag from Redis.
 * Used when a user is reactivated and should regain API access.
 *
 * @param userId - The user ID to clear
 * @returns true if the flag was cleared, false on failure
 */
export const clearUserStatusFlag = async (userId: string): Promise<boolean> => {
  if (!isClientReady()) {
    logger.debug("Redis not ready, skipping user status flag clear", {
      userId,
    });
    return false;
  }

  try {
    const client = getRedisClient();
    const key = buildKey(userId);
    const startTime = Date.now();

    await withTimeout(client.del(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    const durationMs = Date.now() - startTime;
    logger.debug("User status flag cleared", { userId, durationMs });
    return true;
  } catch (error: unknown) {
    logger.warn("User status flag clear did not complete", {
      userId,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Gets the current blocking status flag for a user.
 * Returns null if no flag is set (user is active) or on Redis failure (fail-open).
 *
 * @param userId - The user ID to check
 * @returns The blocking status string, or null if active/unknown
 */
export const getUserStatusFlag = async (userId: string): Promise<string | null> => {
  if (!isClientReady()) {
    logger.debug("Redis not ready, assuming user active (fail-open)", {
      userId,
    });
    return null;
  }

  const startTime = Date.now();

  try {
    const client = getRedisClient();
    const key = buildKey(userId);

    const status = await withTimeout(client.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    const durationMs = Date.now() - startTime;

    if (status !== null) {
      logger.debug("User status flag found", { userId, status, durationMs });
    }

    return status;
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logger.warn("User status flag lookup did not complete, allowing request (fail-open)", {
      userId,
      durationMs,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Checks whether a user is blocked from accessing the API.
 * Returns true if a blocking flag exists (suspended/revoked/deleted).
 * Fail-open: returns false if Redis is unavailable.
 *
 * @param userId - The user ID to check
 * @returns true if the user is blocked, false otherwise
 */
export const isUserBlocked = async (userId: string): Promise<boolean> => {
  const flag = await getUserStatusFlag(userId);
  return flag !== null;
};

// ==================== Tenant Status Functions ====================

/** Builds the Redis key for a tenant status flag. */
const buildTenantKey = (tenantId: string): string =>
  `${REDIS_KEY_PREFIXES.TENANT_STATUS}:${tenantId}`;

/**
 * Sets a non-active status flag for a tenant in Redis.
 * Used when a tenant is suspended or deleted to block further API access
 * for all users in that organization during JWT lifetime.
 *
 * @param tenantId - The tenant ID to flag
 * @param status - The blocking status (e.g., "suspended", "deleted")
 * @returns true if the flag was set, false on failure
 */
export const setTenantStatusFlag = async (tenantId: string, status: string): Promise<boolean> => {
  if (!isClientReady()) {
    logger.debug("Redis not ready, skipping tenant status flag set", { tenantId });
    return false;
  }

  try {
    const client = getRedisClient();
    const key = buildTenantKey(tenantId);
    const startTime = Date.now();

    await withTimeout(
      client.setex(key, CACHE_TTL_SECONDS.STANDARD, status),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    const durationMs = Date.now() - startTime;
    logger.debug("Tenant status flag set", { tenantId, status, durationMs });
    return true;
  } catch (error: unknown) {
    logger.warn("Tenant status flag set did not complete", {
      tenantId,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Clears a tenant status flag from Redis.
 * Used when a tenant is reactivated and should regain API access.
 *
 * @param tenantId - The tenant ID to clear
 * @returns true if the flag was cleared, false on failure
 */
export const clearTenantStatusFlag = async (tenantId: string): Promise<boolean> => {
  if (!isClientReady()) {
    logger.debug("Redis not ready, skipping tenant status flag clear", {
      tenantId,
    });
    return false;
  }

  try {
    const client = getRedisClient();
    const key = buildTenantKey(tenantId);
    const startTime = Date.now();

    await withTimeout(client.del(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    const durationMs = Date.now() - startTime;
    logger.debug("Tenant status flag cleared", { tenantId, durationMs });
    return true;
  } catch (error: unknown) {
    logger.warn("Tenant status flag clear did not complete", {
      tenantId,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Gets the current blocking status flag for a tenant.
 * Returns null if no flag is set (tenant is active) or on Redis failure (fail-open).
 *
 * @param tenantId - The tenant ID to check
 * @returns The blocking status string, or null if active/unknown
 */
export const getTenantStatusFlag = async (tenantId: string): Promise<string | null> => {
  if (!isClientReady()) {
    logger.debug("Redis not ready, assuming tenant active (fail-open)", {
      tenantId,
    });
    return null;
  }

  const startTime = Date.now();

  try {
    const client = getRedisClient();
    const key = buildTenantKey(tenantId);

    const status = await withTimeout(client.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    const durationMs = Date.now() - startTime;

    if (status !== null) {
      logger.debug("Tenant status flag found", { tenantId, status, durationMs });
    }

    return status;
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logger.warn("Tenant status flag lookup did not complete, allowing request (fail-open)", {
      tenantId,
      durationMs,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Checks whether a tenant is blocked from accessing the API.
 * Returns true if a blocking flag exists (suspended/deleted).
 * Fail-open: returns false if Redis is unavailable.
 *
 * @param tenantId - The tenant ID to check
 * @returns true if the tenant is blocked, false otherwise
 */
export const isTenantBlocked = async (tenantId: string): Promise<boolean> => {
  const flag = await getTenantStatusFlag(tenantId);
  return flag !== null;
};
