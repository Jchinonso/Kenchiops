/**
 * Redis-based Failure Aggregator
 *
 * Aggregates multiple CI check run failures for a single commit
 * using Redis for state persistence. Survives service restarts
 * and supports horizontal scaling.
 *
 * Architecture:
 * - Failures stored in Redis Hash (one entry per check run)
 * - Metadata stored in separate Hash (repo info, PR context, etc.)
 * - Debounce managed via Redis key TTL
 * - When debounce expires, job is enqueued for processing
 *
 * @module aggregation/redisAggregator
 */

import { getRedisClient } from "../queue/redisClient.js";
import { ciAnalysisQueue } from "../queue/messageQueue.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { REDIS_TIMEOUTS, AGGREGATION_DEFAULTS, REDIS_SCAN } from "../constants/index.js";
import {
  AGGREGATION_KEYS,
  DEFAULT_AGGREGATION_CONFIG,
  type AggregatedFailures,
  type AggregationKey,
  type AggregationConfig,
  type AnalyzedFailure,
} from "./types.js";

// Import from helpers module
import {
  formatShaForDisplay,
  calculateAggregationTTL,
  calculateDebounceTTL,
  serializeFailure,
  deserializeFailure,
  buildMetadata,
  reconstructAggregation,
  parseAggregationKey,
  type FailureContext,
  type AggregationMetadata,
} from "./aggregatorHelpers.js";

// Re-export types for backwards compatibility
export type { FailureContext, AggregationMetadata } from "./aggregatorHelpers.js";

const logger = createLogger("redis-aggregator");

// ==================== Redis Operations ====================

/**
 * Add a failure to the Redis aggregation
 */
export const addFailureToRedis = async (
  key: AggregationKey,
  failure: AnalyzedFailure,
  context: FailureContext,
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG
): Promise<void> => {
  const redis = getRedisClient();

  // Check if Redis is ready
  if (redis.status !== "ready") {
    logger.warn("Redis not ready for aggregation", { status: redis.status });
    return;
  }

  const failuresKey = AGGREGATION_KEYS.failures(key);
  const metadataKey = AGGREGATION_KEYS.metadata(key);
  const debounceKey = AGGREGATION_KEYS.debounce(key);

  const now = new Date();
  const serializedFailure = serializeFailure(failure);
  const checkRunIdStr = String(failure.checkRunId);

  try {
    // Check if this is a new aggregation or update
    const existingMeta = await withTimeout(
      redis.hgetall(metadataKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    const isNew = Object.keys(existingMeta).length === 0;

    // Get current failure count
    const currentCount = await withTimeout(
      redis.hlen(failuresKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    if (currentCount >= config.maxFailuresPerCommit) {
      logger.warn("Max failures reached for aggregation", {
        commitSha: formatShaForDisplay(key.commitSha),
        maxFailures: config.maxFailuresPerCommit,
        currentCount,
      });
      return;
    }

    // Build metadata
    const metadata = buildMetadata(
      key,
      context,
      isNew ? now : new Date(existingMeta.firstFailureAt || now.toISOString()),
      now
    );

    // Calculate TTLs
    const ttlSeconds = calculateAggregationTTL(config.maxWaitMs);
    const debounceSeconds = calculateDebounceTTL(config.debounceMs);

    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();
    pipeline.hset(failuresKey, checkRunIdStr, serializedFailure);
    pipeline.hset(metadataKey, metadata as unknown as Record<string, string>);
    pipeline.expire(failuresKey, ttlSeconds);
    pipeline.expire(metadataKey, ttlSeconds);
    pipeline.set(debounceKey, AGGREGATION_DEFAULTS.DEBOUNCE_MARKER, "EX", debounceSeconds);

    await withTimeout(pipeline.exec(), REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS);

    logger.info("Failure added to Redis aggregation", {
      repository: key.repositoryFullName,
      commitSha: formatShaForDisplay(key.commitSha),
      checkName: failure.checkName,
      isNewAggregation: isNew,
      totalFailures: currentCount + 1,
    });
  } catch (error) {
    logger.error("Failed to add failure to Redis aggregation", {
      repository: key.repositoryFullName,
      commitSha: formatShaForDisplay(key.commitSha),
      error: getErrorMessage(error),
    });
  }
};

/**
 * Get an aggregation from Redis
 */
export const getAggregationFromRedis = async (
  key: AggregationKey
): Promise<AggregatedFailures | null> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
    logger.warn("Redis not ready for getAggregation", { status: redis.status });
    return null;
  }

  const failuresKey = AGGREGATION_KEYS.failures(key);
  const metadataKey = AGGREGATION_KEYS.metadata(key);

  try {
    // Get metadata first
    const metadata = (await withTimeout(
      redis.hgetall(metadataKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    )) as unknown as AggregationMetadata;
    if (!metadata || !metadata.commitSha) {
      return null;
    }

    // Get all failures
    const failuresData = await withTimeout(
      redis.hgetall(failuresKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    const failures = Object.values(failuresData).map(deserializeFailure);

    if (failures.length === 0) {
      return null;
    }

    return reconstructAggregation(metadata, failures);
  } catch (error) {
    logger.error("Failed to get aggregation from Redis", {
      repository: key.repositoryFullName,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Delete an aggregation from Redis
 */
export const deleteAggregationFromRedis = async (key: AggregationKey): Promise<void> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
    logger.warn("Redis not ready for deleteAggregation", { status: redis.status });
    return;
  }

  const failuresKey = AGGREGATION_KEYS.failures(key);
  const metadataKey = AGGREGATION_KEYS.metadata(key);
  const debounceKey = AGGREGATION_KEYS.debounce(key);

  try {
    await withTimeout(
      redis.del(failuresKey, metadataKey, debounceKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );

    logger.debug("Aggregation deleted from Redis", {
      repository: key.repositoryFullName,
      commitSha: formatShaForDisplay(key.commitSha),
    });
  } catch (error) {
    logger.error("Failed to delete aggregation from Redis", {
      repository: key.repositoryFullName,
      error: getErrorMessage(error),
    });
  }
};

/**
 * Check if debounce period has elapsed (key expired)
 */
export const isDebounceExpired = async (key: AggregationKey): Promise<boolean> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
    return false;
  }

  try {
    const debounceKey = AGGREGATION_KEYS.debounce(key);
    const exists = await withTimeout(
      redis.exists(debounceKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    return exists === 0;
  } catch {
    return false;
  }
};

/**
 * Check if max wait time has been exceeded
 */
export const isMaxWaitExceeded = async (
  key: AggregationKey,
  maxWaitMs: number
): Promise<boolean> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
    return false;
  }

  try {
    const metadataKey = AGGREGATION_KEYS.metadata(key);
    const firstFailureAt = await withTimeout(
      redis.hget(metadataKey, "firstFailureAt"),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );

    if (!firstFailureAt) {
      return false;
    }

    const elapsed = Date.now() - new Date(firstFailureAt).getTime();
    return elapsed >= maxWaitMs;
  } catch {
    return false;
  }
};

/**
 * Check if an aggregation key is ready to flush.
 */
const isKeyReadyToFlush = async (key: AggregationKey, maxWaitMs: number): Promise<boolean> => {
  const [debounceExpired, maxWaitExceeded] = await Promise.all([
    isDebounceExpired(key),
    isMaxWaitExceeded(key, maxWaitMs),
  ]);
  return debounceExpired || maxWaitExceeded;
};

/**
 * Filter keys to find those ready for processing.
 * Uses flatMap to combine parse and filter in single pass.
 */
const filterReadyKeys = async (
  metaKeys: readonly string[],
  maxWaitMs: number
): Promise<AggregationKey[]> => {
  // Parse keys in single pass using flatMap (returns empty array for invalid keys)
  const parsedKeys = metaKeys.flatMap((metaKey) => {
    const parsed = parseAggregationKey(metaKey);
    return parsed ? [parsed] : [];
  });

  // Check readiness in parallel
  const readinessResults = await Promise.all(
    parsedKeys.map(async (key) => ({
      key,
      isReady: await isKeyReadyToFlush(key, maxWaitMs),
    }))
  );

  // Return only ready keys
  return readinessResults.filter((result) => result.isReady).map((result) => result.key);
};

/**
 * Recursive Redis SCAN for aggregation keys.
 */
const scanForAggregationKeys = async (
  redis: ReturnType<typeof getRedisClient>,
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

  // Base case: cursor returned to initial position
  if (nextCursor === REDIS_SCAN.INITIAL_CURSOR) {
    return allKeys;
  }

  // Recursive case: continue scanning
  return scanForAggregationKeys(redis, nextCursor, maxWaitMs, allKeys);
};

/**
 * Find all pending aggregations that are ready to flush
 */
export const findReadyAggregations = async (
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG
): Promise<AggregationKey[]> => {
  const redis = getRedisClient();

  if (redis.status !== "ready") {
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

/**
 * Enqueue a ready aggregation for processing
 */
export const enqueueAggregation = async (key: AggregationKey): Promise<string | null> => {
  const aggregation = await getAggregationFromRedis(key);

  if (!aggregation || aggregation.failures.length === 0) {
    logger.warn("No aggregation data to enqueue", {
      repository: key.repositoryFullName,
      commitSha: formatShaForDisplay(key.commitSha),
    });
    await deleteAggregationFromRedis(key);
    return null;
  }

  // Enqueue to CI analysis queue
  const messageId = await ciAnalysisQueue.enqueue("consolidated_analysis", {
    aggregation: {
      ...aggregation,
      // Convert Dates to ISO strings for serialization
      failures: aggregation.failures.map((failure) => ({
        ...failure,
        timestamp: failure.timestamp.toISOString(),
      })),
      firstFailureAt: aggregation.firstFailureAt.toISOString(),
      lastFailureAt: aggregation.lastFailureAt.toISOString(),
    },
  });

  // Delete from Redis after enqueueing
  await deleteAggregationFromRedis(key);

  logger.info("Aggregation enqueued for processing", {
    repository: key.repositoryFullName,
    commitSha: formatShaForDisplay(key.commitSha),
    messageId,
    failureCount: aggregation.failures.length,
  });

  return messageId;
};

// ==================== Re-exports from extracted modules ====================

// Re-export worker and processor from their dedicated modules
export { startAggregatorWorker } from "./aggregatorWorker.js";
export {
  startAnalysisQueueProcessor,
  deserializeQueuePayload,
  type ConsolidatedAnalysisPayload,
  type AggregationReadyCallback,
} from "./analysisQueueProcessor.js";
