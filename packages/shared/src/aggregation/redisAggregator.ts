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
import {
  REDIS_TIMEOUTS,
  REDIS_KEY_PREFIXES,
  AGGREGATION_DEFAULTS,
  DISPLAY_DEFAULTS,
  REDIS_SCAN,
} from "../constants/index.js";
import {
  AGGREGATION_KEYS,
  DEFAULT_AGGREGATION_CONFIG,
  type AggregatedFailures,
  type AggregationKey,
  type AggregationConfig,
  type AnalyzedFailure,
  type SerializedFailure,
  type RepositoryInfo,
  type PRContext,
  type WorkflowContext,
} from "./types.js";

const logger = createLogger("redis-aggregator");

/** Regex pattern for parsing aggregation metadata keys */
const AGGREGATION_KEY_PATTERN = new RegExp(
  `^${REDIS_KEY_PREFIXES.AGGREGATION.replace(":", "\\:")}:(.+):([a-f0-9]+):meta$`
);

// ==================== Types ====================

/**
 * Context for failure aggregation operations
 */
export interface FailureContext {
  readonly repositoryInfo: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  readonly prContext: PRContext | null;
  readonly workflowContext: WorkflowContext | null;
}

/**
 * Metadata stored in Redis for an aggregation
 */
interface AggregationMetadata {
  readonly repositoryFullName: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly pullRequestNumbers: string; // JSON array
  readonly prContext: string | null; // JSON or null
  readonly workflowContext: string | null; // JSON or null
  readonly firstFailureAt: string; // ISO timestamp
  readonly lastFailureAt: string; // ISO timestamp
}

// ==================== Helpers ====================

/**
 * Format SHA for display logging
 */
const formatShaForDisplay = (sha: string): string =>
  sha.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH);

/**
 * Calculate TTL for aggregation keys (max wait + buffer)
 */
const calculateAggregationTTL = (maxWaitMs: number): number =>
  Math.ceil(maxWaitMs / 1000) + AGGREGATION_DEFAULTS.TTL_BUFFER_SECONDS;

/**
 * Calculate debounce TTL in seconds
 */
const calculateDebounceTTL = (debounceMs: number): number => Math.ceil(debounceMs / 1000);

// ==================== Serialization ====================

/**
 * Serialize a failure for Redis storage
 */
const serializeFailure = (failure: AnalyzedFailure): string =>
  JSON.stringify({
    ...failure,
    timestamp: failure.timestamp.toISOString(),
  });

/**
 * Deserialize a failure from Redis storage
 */
const deserializeFailure = (data: string): AnalyzedFailure => {
  const parsed = JSON.parse(data) as SerializedFailure;
  return {
    ...parsed,
    timestamp: new Date(parsed.timestamp),
  };
};

/**
 * Build metadata object for Redis storage
 */
const buildMetadata = (
  key: AggregationKey,
  context: FailureContext,
  firstFailureAt: Date,
  lastFailureAt: Date
): AggregationMetadata => ({
  repositoryFullName: context.repositoryInfo.fullName,
  repositoryOwner: context.repositoryInfo.owner,
  repositoryName: context.repositoryInfo.name,
  commitSha: key.commitSha,
  installationId: context.installationId,
  pullRequestNumbers: JSON.stringify(context.pullRequestNumbers),
  prContext: context.prContext ? JSON.stringify(context.prContext) : null,
  workflowContext: context.workflowContext ? JSON.stringify(context.workflowContext) : null,
  firstFailureAt: firstFailureAt.toISOString(),
  lastFailureAt: lastFailureAt.toISOString(),
});

/**
 * Reconstruct AggregatedFailures from Redis data
 */
const reconstructAggregation = (
  metadata: AggregationMetadata,
  failures: AnalyzedFailure[]
): AggregatedFailures => ({
  commitSha: metadata.commitSha,
  repository: {
    fullName: metadata.repositoryFullName,
    owner: metadata.repositoryOwner,
    name: metadata.repositoryName,
  },
  installationId: metadata.installationId,
  pullRequestNumbers: JSON.parse(metadata.pullRequestNumbers) as number[],
  failures,
  prContext: metadata.prContext ? (JSON.parse(metadata.prContext) as PRContext) : null,
  workflowContext: metadata.workflowContext
    ? (JSON.parse(metadata.workflowContext) as WorkflowContext)
    : null,
  firstFailureAt: new Date(metadata.firstFailureAt),
  lastFailureAt: new Date(metadata.lastFailureAt),
});

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

  const readyKeys: AggregationKey[] = [];

  try {
    // Scan for all metadata keys
    let cursor: string = REDIS_SCAN.INITIAL_CURSOR;
    do {
      const [nextCursor, keys] = await withTimeout(
        redis.scan(cursor, "MATCH", AGGREGATION_KEYS.pattern, "COUNT", REDIS_SCAN.BATCH_SIZE),
        REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
      );
      cursor = nextCursor;

      for (const metaKey of keys) {
        // Extract repo:sha from key pattern
        const match = metaKey.match(AGGREGATION_KEY_PATTERN);
        if (!match) {
          continue;
        }

        const [, repoFullName, commitSha] = match;
        const key: AggregationKey = { repositoryFullName: repoFullName, commitSha };

        // Check if ready to flush
        const debounceExpired = await isDebounceExpired(key);
        const maxWaitExceeded = await isMaxWaitExceeded(key, config.maxWaitMs);

        if (debounceExpired || maxWaitExceeded) {
          readyKeys.push(key);
        }
      }
    } while (cursor !== REDIS_SCAN.INITIAL_CURSOR);
  } catch (error) {
    logger.error("Failed to find ready aggregations", {
      error: getErrorMessage(error),
    });
  }

  return readyKeys;
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
