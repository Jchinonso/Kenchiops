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
import { createLogger } from "../core/logger.js";
import type {
  AggregatedFailures,
  AggregationKey,
  AggregationConfig,
  AnalyzedFailure,
  SerializedFailure,
  RepositoryInfo,
  PRContext,
  WorkflowContext,
  ConsolidatedPostResult,
} from "./types.js";
import { AGGREGATION_KEYS, DEFAULT_AGGREGATION_CONFIG } from "./types.js";

const logger = createLogger("redis-aggregator");

// ==================== Types ====================

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

/**
 * Callback type for when aggregation is ready to be posted
 */
export type AggregationReadyCallback = (
  aggregation: AggregatedFailures
) => Promise<ConsolidatedPostResult>;

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
  repositoryInfo: RepositoryInfo,
  installationId: number,
  pullRequestNumbers: readonly number[],
  prContext: PRContext | null,
  workflowContext: WorkflowContext | null,
  firstFailureAt: Date,
  lastFailureAt: Date
): AggregationMetadata => ({
  repositoryFullName: repositoryInfo.fullName,
  repositoryOwner: repositoryInfo.owner,
  repositoryName: repositoryInfo.name,
  commitSha: key.commitSha,
  installationId,
  pullRequestNumbers: JSON.stringify(pullRequestNumbers),
  prContext: prContext ? JSON.stringify(prContext) : null,
  workflowContext: workflowContext ? JSON.stringify(workflowContext) : null,
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
  repositoryInfo: RepositoryInfo,
  installationId: number,
  pullRequestNumbers: readonly number[],
  prContext: PRContext | null,
  workflowContext: WorkflowContext | null,
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG
): Promise<void> => {
  const redis = getRedisClient();
  const failuresKey = AGGREGATION_KEYS.failures(key);
  const metadataKey = AGGREGATION_KEYS.metadata(key);
  const debounceKey = AGGREGATION_KEYS.debounce(key);

  const now = new Date();
  const serializedFailure = serializeFailure(failure);
  const checkRunIdStr = String(failure.checkRunId);

  // Check if this is a new aggregation or update
  const existingMeta = await redis.hgetall(metadataKey);
  const isNew = Object.keys(existingMeta).length === 0;

  // Get current failure count
  const currentCount = await redis.hlen(failuresKey);
  if (currentCount >= config.maxFailuresPerCommit) {
    logger.warn("Max failures reached for aggregation", {
      commitSha: key.commitSha.substring(0, 7),
      maxFailures: config.maxFailuresPerCommit,
      currentCount,
    });
    return;
  }

  // Use pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Add/update failure
  pipeline.hset(failuresKey, checkRunIdStr, serializedFailure);

  // Update or set metadata
  const metadata = buildMetadata(
    key,
    repositoryInfo,
    installationId,
    pullRequestNumbers,
    prContext,
    workflowContext,
    isNew ? now : new Date(existingMeta.firstFailureAt || now.toISOString()),
    now
  );

  // Set all metadata fields
  pipeline.hset(metadataKey, metadata as unknown as Record<string, string>);

  // Set TTL on all keys (cleanup safety net)
  const ttlSeconds = Math.ceil(config.maxWaitMs / 1000) + 60; // Max wait + 1 minute buffer
  pipeline.expire(failuresKey, ttlSeconds);
  pipeline.expire(metadataKey, ttlSeconds);

  // Set debounce key with TTL - when this expires, we should flush
  // The debounce key acts as "time since last failure"
  const debounceSeconds = Math.ceil(config.debounceMs / 1000);
  pipeline.set(debounceKey, "1", "EX", debounceSeconds);

  await pipeline.exec();

  logger.info("Failure added to Redis aggregation", {
    repository: key.repositoryFullName,
    commitSha: key.commitSha.substring(0, 7),
    checkName: failure.checkName,
    isNewAggregation: isNew,
    totalFailures: currentCount + 1,
  });
};

/**
 * Get an aggregation from Redis
 */
export const getAggregationFromRedis = async (
  key: AggregationKey
): Promise<AggregatedFailures | null> => {
  const redis = getRedisClient();
  const failuresKey = AGGREGATION_KEYS.failures(key);
  const metadataKey = AGGREGATION_KEYS.metadata(key);

  // Get metadata first
  const metadata = (await redis.hgetall(metadataKey)) as unknown as AggregationMetadata;
  if (!metadata || !metadata.commitSha) {
    return null;
  }

  // Get all failures
  const failuresData = await redis.hgetall(failuresKey);
  const failures = Object.values(failuresData).map(deserializeFailure);

  if (failures.length === 0) {
    return null;
  }

  return reconstructAggregation(metadata, failures);
};

/**
 * Delete an aggregation from Redis
 */
export const deleteAggregationFromRedis = async (key: AggregationKey): Promise<void> => {
  const redis = getRedisClient();
  const failuresKey = AGGREGATION_KEYS.failures(key);
  const metadataKey = AGGREGATION_KEYS.metadata(key);
  const debounceKey = AGGREGATION_KEYS.debounce(key);

  await redis.del(failuresKey, metadataKey, debounceKey);

  logger.debug("Aggregation deleted from Redis", {
    repository: key.repositoryFullName,
    commitSha: key.commitSha.substring(0, 7),
  });
};

/**
 * Check if debounce period has elapsed (key expired)
 */
export const isDebounceExpired = async (key: AggregationKey): Promise<boolean> => {
  const redis = getRedisClient();
  const debounceKey = AGGREGATION_KEYS.debounce(key);
  const exists = await redis.exists(debounceKey);
  return exists === 0;
};

/**
 * Check if max wait time has been exceeded
 */
export const isMaxWaitExceeded = async (
  key: AggregationKey,
  maxWaitMs: number
): Promise<boolean> => {
  const redis = getRedisClient();
  const metadataKey = AGGREGATION_KEYS.metadata(key);
  const firstFailureAt = await redis.hget(metadataKey, "firstFailureAt");

  if (!firstFailureAt) return false;

  const elapsed = Date.now() - new Date(firstFailureAt).getTime();
  return elapsed >= maxWaitMs;
};

/**
 * Find all pending aggregations that are ready to flush
 */
export const findReadyAggregations = async (
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG
): Promise<AggregationKey[]> => {
  const redis = getRedisClient();
  const readyKeys: AggregationKey[] = [];

  // Scan for all metadata keys
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      AGGREGATION_KEYS.pattern,
      "COUNT",
      100
    );
    cursor = nextCursor;

    for (const metaKey of keys) {
      // Extract repo:sha from key pattern kenchi:agg:{repo}:{sha}:meta
      const match = metaKey.match(/^kenchi:agg:(.+):([a-f0-9]+):meta$/);
      if (!match) continue;

      const [, repoFullName, commitSha] = match;
      const key: AggregationKey = { repositoryFullName: repoFullName, commitSha };

      // Check if ready to flush
      const debounceExpired = await isDebounceExpired(key);
      const maxWaitExceeded = await isMaxWaitExceeded(key, config.maxWaitMs);

      if (debounceExpired || maxWaitExceeded) {
        readyKeys.push(key);
      }
    }
  } while (cursor !== "0");

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
      commitSha: key.commitSha.substring(0, 7),
    });
    await deleteAggregationFromRedis(key);
    return null;
  }

  // Enqueue to CI analysis queue
  const messageId = await ciAnalysisQueue.enqueue("consolidated_analysis", {
    aggregation: {
      ...aggregation,
      // Convert Dates to ISO strings for serialization
      failures: aggregation.failures.map((f) => ({
        ...f,
        timestamp: f.timestamp.toISOString(),
      })),
      firstFailureAt: aggregation.firstFailureAt.toISOString(),
      lastFailureAt: aggregation.lastFailureAt.toISOString(),
    },
  });

  // Delete from Redis after enqueueing
  await deleteAggregationFromRedis(key);

  logger.info("Aggregation enqueued for processing", {
    repository: key.repositoryFullName,
    commitSha: key.commitSha.substring(0, 7),
    messageId,
    failureCount: aggregation.failures.length,
  });

  return messageId;
};

// ==================== Aggregator Worker ====================

/**
 * Starts the aggregator worker that checks for ready aggregations
 * and enqueues them for processing
 */
export const startAggregatorWorker = (
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG,
  pollIntervalMs: number = 5000
): (() => void) => {
  let running = true;

  logger.info("Starting Redis aggregator worker", {
    pollIntervalMs,
    debounceMs: config.debounceMs,
    maxWaitMs: config.maxWaitMs,
  });

  const poll = async (): Promise<void> => {
    while (running) {
      try {
        const readyKeys = await findReadyAggregations(config);

        if (readyKeys.length > 0) {
          logger.info("Found ready aggregations", { count: readyKeys.length });

          // Enqueue all ready aggregations in parallel
          await Promise.all(readyKeys.map(enqueueAggregation));
        }
      } catch (error) {
        logger.error("Aggregator worker error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  // Start polling (don't await)
  poll().catch((error) => {
    logger.error("Aggregator worker fatal error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });

  // Return stop function
  return () => {
    running = false;
    logger.info("Aggregator worker stopping");
  };
};

// ==================== CI Analysis Queue Processor ====================

/**
 * Payload structure for consolidated analysis jobs
 */
export interface ConsolidatedAnalysisPayload {
  readonly aggregation: {
    readonly commitSha: string;
    readonly repository: RepositoryInfo;
    readonly installationId: number;
    readonly pullRequestNumbers: readonly number[];
    readonly failures: readonly SerializedFailure[];
    readonly prContext: PRContext | null;
    readonly workflowContext: WorkflowContext | null;
    readonly firstFailureAt: string;
    readonly lastFailureAt: string;
  };
}

/**
 * Deserialize aggregation from queue payload
 */
export const deserializeQueuePayload = (
  payload: ConsolidatedAnalysisPayload
): AggregatedFailures => ({
  ...payload.aggregation,
  failures: payload.aggregation.failures.map((f) => ({
    ...f,
    timestamp: new Date(f.timestamp),
  })),
  firstFailureAt: new Date(payload.aggregation.firstFailureAt),
  lastFailureAt: new Date(payload.aggregation.lastFailureAt),
});

/**
 * Starts the CI analysis queue processor
 * Processes consolidated analysis jobs and posts results
 */
export const startAnalysisQueueProcessor = (
  onReady: AggregationReadyCallback,
  options: { pollIntervalMs?: number; maxConcurrent?: number } = {}
): (() => void) => {
  const { pollIntervalMs = 1000, maxConcurrent = 3 } = options;
  let running = true;
  let activeJobs = 0;

  logger.info("Starting CI analysis queue processor", {
    pollIntervalMs,
    maxConcurrent,
  });

  const processLoop = async (): Promise<void> => {
    while (running) {
      if (activeJobs >= maxConcurrent) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      try {
        activeJobs++;
        await ciAnalysisQueue.process(async (message) => {
          const payload = message.payload as ConsolidatedAnalysisPayload;

          // Validate payload
          if (!payload.aggregation || !payload.aggregation.failures) {
            logger.error("Invalid queue payload", { messageId: message.id });
            return { success: false, error: "Invalid payload", shouldRetry: false };
          }

          // Deserialize and process
          const aggregation = deserializeQueuePayload(payload);

          logger.info("Processing consolidated analysis", {
            messageId: message.id,
            repository: aggregation.repository.fullName,
            commitSha: aggregation.commitSha.substring(0, 7),
            failureCount: aggregation.failures.length,
          });

          try {
            const result = await onReady(aggregation);

            logger.info("Consolidated analysis completed", {
              messageId: message.id,
              success: result.success,
              prCommentsPosted: result.prCommentsPosted,
              slackMessageSent: result.slackMessageSent,
            });

            return { success: result.success };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            logger.error("Failed to process consolidated analysis", {
              messageId: message.id,
              error: errorMessage,
            });
            return { success: false, error: errorMessage, shouldRetry: true };
          }
        });
      } finally {
        activeJobs--;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  // Start workers
  const workers = Array.from({ length: maxConcurrent }, () => processLoop());
  Promise.all(workers).catch((error) => {
    logger.error("Analysis queue processor error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });

  return () => {
    running = false;
    logger.info("Analysis queue processor stopping");
  };
};
