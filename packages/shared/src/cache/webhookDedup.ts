/**
 * Webhook Deduplication Cache
 *
 * Redis-backed fast-path deduplication for incoming webhooks.
 * Checks Redis before the slower DB-based idempotency store to
 * short-circuit duplicate webhooks without hitting the database.
 *
 * Key format: kenchi:webhook-dedup:{source}:{deliveryId}
 * TTL: 7 days (matches typical webhook replay windows)
 *
 * Fail-open: if Redis is unavailable, returns false (not a duplicate)
 * so the request falls through to the DB-based idempotency check.
 *
 * @module cache/webhookDedup
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { REDIS_KEY_PREFIXES, REDIS_TIMEOUTS, REDIS_READY_STATUS } from "../constants/index.js";

const logger = createLogger("webhook-dedup");

/** TTL for dedup entries: 7 days in seconds */
const DEDUP_TTL_SECONDS = 604_800;

/** Builds the Redis key for a webhook dedup entry. */
const buildKey = (source: string, deliveryId: string): string =>
  `${REDIS_KEY_PREFIXES.WEBHOOK_DEDUP}:${source}:${deliveryId}`;

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
 * Check if a webhook delivery has already been processed (fast-path).
 * Returns true if the deliveryId exists in Redis (duplicate).
 * Fail-open: returns false if Redis is unavailable.
 *
 * @param source - The webhook source (e.g., "github", "slack")
 * @param deliveryId - The unique delivery identifier from the webhook provider
 * @returns true if this is a duplicate delivery, false otherwise
 */
export const isWebhookDuplicate = async (source: string, deliveryId: string): Promise<boolean> => {
  if (!deliveryId || !isClientReady()) {
    return false;
  }

  const startTime = Date.now();

  try {
    const client = getRedisClient();
    const key = buildKey(source, deliveryId);

    const exists = await withTimeout(client.exists(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    return exists === 1;
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logger.warn("Webhook dedup check failed, allowing request (fail-open)", {
      source,
      deliveryId,
      durationMs,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Mark a webhook delivery as processed in Redis.
 * Should be called after the webhook has been successfully processed
 * so that future duplicates can be short-circuited.
 *
 * @param source - The webhook source (e.g., "github", "slack")
 * @param deliveryId - The unique delivery identifier from the webhook provider
 * @returns true if the mark was set, false on failure
 */
export const markWebhookProcessed = async (
  source: string,
  deliveryId: string
): Promise<boolean> => {
  if (!deliveryId || !isClientReady()) {
    return false;
  }

  const startTime = Date.now();

  try {
    const client = getRedisClient();
    const key = buildKey(source, deliveryId);

    await withTimeout(client.setex(key, DEDUP_TTL_SECONDS, "1"), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    return true;
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logger.warn("Webhook dedup mark failed", {
      source,
      deliveryId,
      durationMs,
      error: getErrorMessage(error),
    });
    return false;
  }
};
