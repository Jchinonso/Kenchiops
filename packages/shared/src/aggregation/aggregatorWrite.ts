/**
 * Aggregator Write Operations
 *
 * Functions for adding failures and pending checks to Redis aggregation.
 * Handles serialization, metadata updates, and debounce management.
 *
 * @module aggregation/aggregatorWrite
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { REDIS_TIMEOUTS, AGGREGATION_DEFAULTS } from "../constants/index.js";
import {
  DEFAULT_AGGREGATION_CONFIG,
  type AggregationConfig,
  type AggregationKey,
  type AggregationLogContext,
  type AnalyzedFailure,
  type PendingCheckContext,
  type PendingCheckRun,
  type SerializedPendingCheckData,
} from "./types.js";
import {
  formatShaForDisplay,
  calculateAggregationTTL,
  calculateDebounceTTL,
  serializeFailure,
  buildMetadata,
  buildAggregationKeys,
  isRedisReady,
  type AggregationKeySet,
  type FailureContext,
} from "./aggregatorHelpers.js";
import { type AddToAggregationParams, type PipelineOptions } from "./aggregatorTypes.js";

const logger = createLogger("redis-aggregator");

// ==================== Logging Helpers ====================

/** Builds standardized log context for aggregation operations. */
export const buildLogContext = (key: AggregationKey): AggregationLogContext => ({
  repository: key.repositoryFullName,
  commitSha: formatShaForDisplay(key.commitSha),
});

// ==================== Utility Helpers ====================

/** Checks if an object has no keys. */
const isEmptyObject = (obj: Record<string, unknown>): boolean => Object.keys(obj).length === 0;

/** Parses first failure time from existing metadata or uses current time. */
const parseFirstFailureTime = (
  existingMeta: Record<string, string>,
  isNewAggregation: boolean,
  now: Date
): Date => (isNewAggregation ? now : new Date(existingMeta.firstFailureAt || now.toISOString()));

// ==================== Serialization ====================

/** Serialize a pending check for Redis storage. */
export const serializePendingCheck = (pendingCheck: PendingCheckRun): string =>
  JSON.stringify({
    checkRunId: pendingCheck.checkRunId,
    checkName: pendingCheck.checkName,
    conclusion: pendingCheck.conclusion,
    timestamp: pendingCheck.timestamp.toISOString(),
  } satisfies SerializedPendingCheckData);

// ==================== Redis Operation Helpers ====================

/** Fetches existing metadata and current count from Redis. */
const fetchAggregationState = async (
  redis: ReturnType<typeof getRedisClient>,
  keys: AggregationKeySet
): Promise<{ existingMeta: Record<string, string>; currentCount: number }> => {
  const [existingMeta, currentCount] = await Promise.all([
    withTimeout(redis.hgetall(keys.metadataKey), REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS),
    withTimeout(redis.hlen(keys.failuresKey), REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS),
  ]);
  return { existingMeta, currentCount };
};

/** Executes the pipeline to add an item to aggregation. */
const executeAggregationPipeline = async (options: PipelineOptions): Promise<void> => {
  const { redis, keys, checkRunIdStr, serializedData, metadata, ttlSeconds, debounceSeconds } =
    options;
  const pipeline = redis.pipeline();
  pipeline.hset(keys.failuresKey, checkRunIdStr, serializedData);
  pipeline.hset(keys.metadataKey, metadata as unknown as Record<string, string>);
  pipeline.expire(keys.failuresKey, ttlSeconds);
  pipeline.expire(keys.metadataKey, ttlSeconds);
  pipeline.set(keys.debounceKey, AGGREGATION_DEFAULTS.DEBOUNCE_MARKER, "EX", debounceSeconds);
  await withTimeout(pipeline.exec(), REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS);
};

// ==================== Core Add Operation ====================

/** Generic function to add an item (failure or pending check) to Redis aggregation. */
const addToAggregation = async (params: AddToAggregationParams): Promise<void> => {
  const { key, checkRunId, checkName, serializedData, failureContext, config, itemType } = params;
  const redis = getRedisClient();
  const logContext = buildLogContext(key);
  const itemLabel = itemType === "failure" ? "failure" : "pending check";
  const countLabel = itemType === "failure" ? "totalFailures" : "totalPendingChecks";

  if (!isRedisReady(redis)) {
    logger.warn(`Redis not ready for ${itemLabel} aggregation`, { status: redis.status });
    return;
  }

  const keys = buildAggregationKeys(key);
  const now = new Date();

  try {
    const { existingMeta, currentCount } = await fetchAggregationState(redis, keys);
    const isNewAggregation = isEmptyObject(existingMeta);

    if (currentCount >= config.maxFailuresPerCommit) {
      logger.warn(`Max ${itemLabel}s reached for aggregation`, {
        ...logContext,
        maxFailures: config.maxFailuresPerCommit,
        currentCount,
      });
      return;
    }

    const firstFailureTime = parseFirstFailureTime(existingMeta, isNewAggregation, now);
    const metadata = buildMetadata(key, failureContext, firstFailureTime, now);
    const ttlSeconds = calculateAggregationTTL(config.maxWaitMs);
    const debounceSeconds = calculateDebounceTTL(config.debounceMs);

    await executeAggregationPipeline({
      redis,
      keys,
      checkRunIdStr: String(checkRunId),
      serializedData,
      metadata,
      ttlSeconds,
      debounceSeconds,
    });

    logger.info(
      `${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} added to Redis aggregation`,
      {
        ...logContext,
        checkName,
        isNewAggregation,
        [countLabel]: currentCount + 1,
      }
    );
  } catch (error) {
    logger.error(`Failed to add ${itemLabel} to Redis aggregation`, {
      ...logContext,
      error: getErrorMessage(error),
    });
  }
};

// ==================== Public Add Operations ====================

/** Add a failure to the Redis aggregation. */
export const addFailureToRedis = async (
  key: AggregationKey,
  failure: AnalyzedFailure,
  context: FailureContext,
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG
): Promise<void> =>
  addToAggregation({
    key,
    checkRunId: failure.checkRunId,
    checkName: failure.checkName,
    serializedData: serializeFailure(failure),
    failureContext: context,
    config,
    itemType: "failure",
  });

/** Add a pending check to Redis aggregation (without analysis). */
export const addPendingCheckToRedis = async (
  key: AggregationKey,
  pendingCheck: PendingCheckRun,
  context: PendingCheckContext,
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG
): Promise<void> =>
  addToAggregation({
    key,
    checkRunId: pendingCheck.checkRunId,
    checkName: pendingCheck.checkName,
    serializedData: serializePendingCheck(pendingCheck),
    failureContext: {
      repositoryInfo: context.repositoryInfo,
      installationId: context.installationId,
      pullRequestNumbers: context.pullRequestNumbers,
      prContext: null,
      workflowContext: null,
    },
    config,
    itemType: "pending_check",
  });
