/**
 * Aggregation Scanner
 *
 * Scans Redis for aggregations that are ready to be processed.
 * Checks debounce expiration and max wait time to determine readiness.
 *
 * @module aggregation/aggregationScanner
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { AGGREGATION_METADATA_FIELDS, REDIS_SCAN, REDIS_TIMEOUTS } from "../constants/index.js";
import {
  AGGREGATION_KEYS,
  DEFAULT_AGGREGATION_CONFIG,
  type AggregationConfig,
  type AggregationKey,
  type ReadinessResult,
  type RedisClient,
} from "./types.js";
import { parseAggregationKey, buildAggregationKeys, isRedisReady } from "./aggregatorHelpers.js";

const logger = createLogger("aggregation-scanner");

// ==================== Readiness Checks ====================

/** Check if debounce period has elapsed (key expired). */
export const isDebounceExpired = async (key: AggregationKey): Promise<boolean> => {
  const redis = getRedisClient();

  if (!isRedisReady(redis)) {
    return false;
  }

  try {
    const { debounceKey } = buildAggregationKeys(key);
    const exists = await withTimeout(
      redis.exists(debounceKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    return exists === 0;
  } catch (error) {
    logger.debug("Debounce check failed, skipping", { error: getErrorMessage(error) });
    return false;
  }
};

/** Check if max wait time has been exceeded. */
export const isMaxWaitExceeded = async (
  key: AggregationKey,
  maxWaitMs: number
): Promise<boolean> => {
  const redis = getRedisClient();

  if (!isRedisReady(redis)) {
    return false;
  }

  try {
    const { metadataKey } = buildAggregationKeys(key);
    const firstFailureAt = await withTimeout(
      redis.hget(metadataKey, AGGREGATION_METADATA_FIELDS.FIRST_FAILURE_AT),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );

    if (!firstFailureAt) {
      return false;
    }

    const elapsed = Date.now() - new Date(firstFailureAt).getTime();
    return elapsed >= maxWaitMs;
  } catch (error) {
    logger.debug("Max wait check failed, skipping", { error: getErrorMessage(error) });
    return false;
  }
};

/** Check if an aggregation key is ready to flush. */
const isKeyReadyToFlush = async (key: AggregationKey, maxWaitMs: number): Promise<boolean> => {
  const [debounceExpired, maxWaitExceeded] = await Promise.all([
    isDebounceExpired(key),
    isMaxWaitExceeded(key, maxWaitMs),
  ]);
  return debounceExpired || maxWaitExceeded;
};

// ==================== Scanning ====================

/** Filter keys to find those ready for processing. */
const filterReadyKeys = async (
  metaKeys: readonly string[],
  maxWaitMs: number
): Promise<AggregationKey[]> => {
  const parsedKeys = metaKeys.flatMap((metaKey) => {
    const parsed = parseAggregationKey(metaKey);
    return parsed ? [parsed] : [];
  });

  const readinessResults = await Promise.all(
    parsedKeys.map(
      async (aggregationKey): Promise<ReadinessResult> => ({
        key: aggregationKey,
        isReady: await isKeyReadyToFlush(aggregationKey, maxWaitMs),
      })
    )
  );

  return readinessResults.flatMap((readinessResult) =>
    readinessResult.isReady ? [readinessResult.key] : []
  );
};

/** Recursive Redis SCAN for aggregation keys. */
const scanForAggregationKeys = async (
  redis: RedisClient,
  cursor: string,
  maxWaitMs: number,
  accumulated: readonly AggregationKey[]
): Promise<readonly AggregationKey[]> => {
  const [nextCursor, keys] = await withTimeout(
    redis.scan(cursor, "MATCH", AGGREGATION_KEYS.pattern, "COUNT", REDIS_SCAN.BATCH_SIZE),
    REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
  );

  const readyKeys = await filterReadyKeys(keys, maxWaitMs);
  const allKeys = [...accumulated, ...readyKeys];

  if (nextCursor === REDIS_SCAN.INITIAL_CURSOR) {
    return allKeys;
  }

  return scanForAggregationKeys(redis, nextCursor, maxWaitMs, allKeys);
};

/** Find all pending aggregations that are ready to flush. */
export const findReadyAggregations = async (
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG
): Promise<AggregationKey[]> => {
  const redis = getRedisClient();

  if (!isRedisReady(redis)) {
    logger.debug("Redis not ready, skipping findReadyAggregations", { status: redis.status });
    return [];
  }

  try {
    const readyKeys = await scanForAggregationKeys(
      redis,
      REDIS_SCAN.INITIAL_CURSOR,
      config.maxWaitMs,
      []
    );
    return [...readyKeys];
  } catch (error) {
    logger.error("Failed to find ready aggregations", {
      error: getErrorMessage(error),
    });
    return [];
  }
};
