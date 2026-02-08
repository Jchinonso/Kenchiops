/**
 * Aggregator Read Operations
 *
 * Functions for reading aggregations and pending checks from Redis.
 * Handles deserialization and reconstruction of aggregated data.
 *
 * @module aggregation/aggregatorRead
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { AGGREGATION_DEFAULTS, PARSE_INT_RADIX, REDIS_TIMEOUTS } from "../constants/index.js";
import type {
  AggregatedFailures,
  AggregationKey,
  AggregationMetadata,
  AggregationReadResult,
  PendingAggregation,
  PendingCheckRun,
  SerializedPendingCheckData,
} from "./types.js";
import {
  deserializeFailure,
  reconstructAggregation,
  buildAggregationKeys,
  isRedisReady,
} from "./aggregatorHelpers.js";
import { buildLogContext } from "./aggregatorWrite.js";

const logger = createLogger("redis-aggregator");

// ==================== Result Constructors ====================

/** Creates a success result. */
const success = <T>(data: T): AggregationReadResult<T> => ({ status: "success", data });

/** Creates a not found result. */
const notFound = <T>(): AggregationReadResult<T> => ({ status: "not_found" });

/** Creates an error result. */
const error = <T>(message: string): AggregationReadResult<T> => ({
  status: "error",
  error: message,
});

// ==================== Deserialization ====================

/** Deserialize a pending check from Redis storage. */
const deserializePendingCheck = (data: string): PendingCheckRun => {
  const parsed = JSON.parse(data) as SerializedPendingCheckData;
  return {
    checkRunId: parsed.checkRunId,
    checkName: parsed.checkName,
    conclusion: parsed.conclusion,
    timestamp: new Date(parsed.timestamp),
  };
};

// ==================== Read Operations (with Result types) ====================

/**
 * Get pending aggregation from Redis with explicit result status.
 * Distinguishes between not found and error states.
 */
export const getPendingAggregationResult = async (
  key: AggregationKey
): Promise<AggregationReadResult<PendingAggregation>> => {
  const redis = getRedisClient();
  const logContext = buildLogContext(key);

  if (!isRedisReady(redis)) {
    const errorMessage = `Redis not ready (status: ${redis.status})`;
    logger.warn("Redis not ready for getPendingAggregation", { status: redis.status });
    return error(errorMessage);
  }

  const { failuresKey, metadataKey } = buildAggregationKeys(key);

  try {
    const metadata = (await withTimeout(
      redis.hgetall(metadataKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    )) as unknown as Record<string, string>;

    if (!metadata || !metadata.commitSha) {
      return notFound();
    }

    const checksData = await withTimeout(
      redis.hgetall(failuresKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    const pendingChecks = Object.values(checksData).map(deserializePendingCheck);

    if (pendingChecks.length === 0) {
      return notFound();
    }

    const pullRequestNumbers = metadata.pullRequestNumbers
      ? (JSON.parse(metadata.pullRequestNumbers) as number[])
      : [];

    return success({
      commitSha: metadata.commitSha,
      repository: {
        fullName: metadata.repositoryFullName || key.repositoryFullName,
        owner: metadata.repositoryOwner || "",
        name: metadata.repositoryName || "",
      },
      installationId: parseInt(
        metadata.installationId || AGGREGATION_DEFAULTS.DEFAULT_INSTALLATION_ID,
        PARSE_INT_RADIX
      ),
      pullRequestNumbers,
      pendingChecks,
      firstFailureAt: new Date(metadata.firstFailureAt),
      lastFailureAt: new Date(metadata.lastFailureAt),
    });
  } catch (caughtError) {
    const errorMessage = getErrorMessage(caughtError);
    logger.error("Failed to get pending aggregation from Redis", {
      ...logContext,
      error: errorMessage,
    });
    return error(errorMessage);
  }
};

/**
 * Get aggregation from Redis with explicit result status.
 * Distinguishes between not found and error states.
 */
export const getAggregationResult = async (
  key: AggregationKey
): Promise<AggregationReadResult<AggregatedFailures>> => {
  const redis = getRedisClient();
  const logContext = buildLogContext(key);

  if (!isRedisReady(redis)) {
    const errorMessage = `Redis not ready (status: ${redis.status})`;
    logger.warn("Redis not ready for getAggregation", { status: redis.status });
    return error(errorMessage);
  }

  const { failuresKey, metadataKey } = buildAggregationKeys(key);

  try {
    const metadata = (await withTimeout(
      redis.hgetall(metadataKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    )) as unknown as AggregationMetadata;

    if (!metadata || !metadata.commitSha) {
      return notFound();
    }

    const failuresData = await withTimeout(
      redis.hgetall(failuresKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    const failures = Object.values(failuresData).map(deserializeFailure);

    if (failures.length === 0) {
      return notFound();
    }

    return success(reconstructAggregation(metadata, failures));
  } catch (caughtError) {
    const errorMessage = getErrorMessage(caughtError);
    logger.error("Failed to get aggregation from Redis", {
      ...logContext,
      error: errorMessage,
    });
    return error(errorMessage);
  }
};

// ==================== Legacy Functions (backwards compatibility) ====================

/**
 * Get pending aggregation from Redis (checks without analysis).
 * @deprecated Use getPendingAggregationResult for explicit error handling.
 */
export const getPendingAggregationFromRedis = async (
  key: AggregationKey
): Promise<PendingAggregation | null> => {
  const result = await getPendingAggregationResult(key);
  return result.status === "success" ? result.data : null;
};

/**
 * Get an aggregation from Redis.
 * @deprecated Use getAggregationResult for explicit error handling.
 */
export const getAggregationFromRedis = async (
  key: AggregationKey
): Promise<AggregatedFailures | null> => {
  const result = await getAggregationResult(key);
  return result.status === "success" ? result.data : null;
};
