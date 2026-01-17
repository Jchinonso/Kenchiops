/**
 * Aggregator Delete Operations
 *
 * Functions for deleting aggregations from Redis.
 *
 * @module aggregation/redisAggregator
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { REDIS_TIMEOUTS } from "../constants/index.js";
import type { AggregationKey } from "./types.js";
import { buildAggregationKeys, isRedisReady } from "./aggregatorHelpers.js";
import { buildLogContext } from "./aggregatorWrite.js";

const logger = createLogger("redis-aggregator");

// ==================== Delete Operations ====================

/** Delete an aggregation from Redis. */
export const deleteAggregationFromRedis = async (key: AggregationKey): Promise<void> => {
  const redis = getRedisClient();
  const logContext = buildLogContext(key);

  if (!isRedisReady(redis)) {
    logger.warn("Redis not ready for deleteAggregation", { status: redis.status });
    return;
  }

  const { failuresKey, metadataKey, debounceKey } = buildAggregationKeys(key);

  try {
    await withTimeout(
      redis.del(failuresKey, metadataKey, debounceKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );

    logger.debug("Aggregation deleted from Redis", logContext);
  } catch (error) {
    logger.error("Failed to delete aggregation from Redis", {
      ...logContext,
      error: getErrorMessage(error),
    });
  }
};
