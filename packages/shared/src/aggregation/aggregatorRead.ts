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
import { REDIS_TIMEOUTS } from "../constants/index.js";
import {
  type AggregatedFailures,
  type AggregationKey,
  type PendingCheckRun,
  type PendingAggregation,
} from "./types.js";

import {
  deserializeFailure,
  reconstructAggregation,
  buildAggregationKeys,
  isRedisReady,
  type AggregationMetadata,
} from "./aggregatorHelpers.js";

import { buildLogContext } from "./aggregatorWrite.js";
import {
  type SerializedPendingCheckData,
  RADIX_DECIMAL,
  DEFAULT_INSTALLATION_ID,
} from "./aggregatorTypes.js";

const logger = createLogger("redis-aggregator");

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

// ==================== Read Operations ====================

/** Get pending aggregation from Redis (checks without analysis). */
export const getPendingAggregationFromRedis = async (
  key: AggregationKey
): Promise<PendingAggregation | null> => {
  const redis = getRedisClient();
  const logContext = buildLogContext(key);

  if (!isRedisReady(redis)) {
    logger.warn("Redis not ready for getPendingAggregation", { status: redis.status });
    return null;
  }

  const { failuresKey, metadataKey } = buildAggregationKeys(key);

  try {
    const metadata = (await withTimeout(
      redis.hgetall(metadataKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    )) as unknown as Record<string, string>;

    if (!metadata || !metadata.commitSha) {
      return null;
    }

    const checksData = await withTimeout(
      redis.hgetall(failuresKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );
    const pendingChecks = Object.values(checksData).map(deserializePendingCheck);

    if (pendingChecks.length === 0) {
      return null;
    }

    const pullRequestNumbers = metadata.pullRequestNumbers
      ? (JSON.parse(metadata.pullRequestNumbers) as number[])
      : [];

    return {
      commitSha: metadata.commitSha,
      repository: {
        fullName: metadata.repositoryFullName || key.repositoryFullName,
        owner: metadata.repositoryOwner || "",
        name: metadata.repositoryName || "",
      },
      installationId: parseInt(metadata.installationId || DEFAULT_INSTALLATION_ID, RADIX_DECIMAL),
      pullRequestNumbers,
      pendingChecks,
      firstFailureAt: new Date(metadata.firstFailureAt),
      lastFailureAt: new Date(metadata.lastFailureAt),
    };
  } catch (error) {
    logger.error("Failed to get pending aggregation from Redis", {
      ...logContext,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/** Get an aggregation from Redis. */
export const getAggregationFromRedis = async (
  key: AggregationKey
): Promise<AggregatedFailures | null> => {
  const redis = getRedisClient();
  const logContext = buildLogContext(key);

  if (!isRedisReady(redis)) {
    logger.warn("Redis not ready for getAggregation", { status: redis.status });
    return null;
  }

  const { failuresKey, metadataKey } = buildAggregationKeys(key);

  try {
    const metadata = (await withTimeout(
      redis.hgetall(metadataKey),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    )) as unknown as AggregationMetadata;

    if (!metadata || !metadata.commitSha) {
      return null;
    }

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
      ...logContext,
      error: getErrorMessage(error),
    });
    return null;
  }
};
