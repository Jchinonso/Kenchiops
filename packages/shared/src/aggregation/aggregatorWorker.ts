/**
 * Aggregator Worker
 *
 * Background worker that polls Redis for aggregations ready to be processed.
 * When debounce expires or max wait is exceeded, enqueues for analysis.
 *
 * @module aggregation/aggregatorWorker
 */

import { createLogger, delay, getErrorMessage } from "../core/index.js";
import { QUEUE_WORKER_DEFAULTS } from "../constants/index.js";
import {
  DEFAULT_AGGREGATION_CONFIG,
  type AggregationConfig,
  type AggregationEnqueueResult,
  type AggregationKey,
  type AggregatorWorkerOptions,
  type AggregatorWorkerState,
  type PollingLoop,
  type WorkerControl,
  type WorkerErrorCallback,
  type WorkerStats,
} from "./types.js";
import { findReadyAggregations } from "./aggregationScanner.js";
import { enqueuePendingAggregation } from "./aggregationEnqueuer.js";

const logger = createLogger("aggregator-worker");

// ==================== Enqueue Operations ====================

/** Enqueues a single aggregation with error capture. */
const enqueueWithErrorCapture = async (key: AggregationKey): Promise<AggregationEnqueueResult> => {
  try {
    await enqueuePendingAggregation(key);
    return { status: "success", key };
  } catch (caughtError) {
    return { status: "error", key, error: getErrorMessage(caughtError) };
  }
};

/**
 * Filters ready keys through the beforeEnqueue callback.
 * Keys where the callback returns false are deferred (left in Redis).
 */
const filterKeysForEnqueue = async (
  readyKeys: readonly AggregationKey[],
  beforeEnqueue: (key: AggregationKey) => Promise<boolean>
): Promise<readonly AggregationKey[]> => {
  const results = await Promise.all(
    readyKeys.map(async (key) => {
      try {
        const shouldEnqueue = await beforeEnqueue(key);

        if (!shouldEnqueue) {
          logger.info("Aggregation deferred by beforeEnqueue check", {
            repository: key.repositoryFullName,
            commitSha: key.commitSha,
          });
        }

        return { key, shouldEnqueue };
      } catch (error) {
        // On error, proceed with enqueue (fail-open)
        logger.warn("beforeEnqueue check failed, proceeding with enqueue", {
          repository: key.repositoryFullName,
          commitSha: key.commitSha,
          error: getErrorMessage(error),
        });
        return { key, shouldEnqueue: true };
      }
    })
  );

  return results.filter((result) => result.shouldEnqueue).map((result) => result.key);
};

/** Processes all ready aggregations, handling individual failures gracefully. */
const processReadyAggregations = async (
  readyKeys: readonly AggregationKey[],
  state: AggregatorWorkerState,
  onError?: WorkerErrorCallback,
  beforeEnqueue?: (key: AggregationKey) => Promise<boolean>
): Promise<void> => {
  // Filter through beforeEnqueue if provided (e.g., check GitHub for in-progress runs)
  const keysToEnqueue = beforeEnqueue
    ? await filterKeysForEnqueue(readyKeys, beforeEnqueue)
    : readyKeys;

  if (keysToEnqueue.length === 0) {
    return;
  }

  const results = await Promise.all(keysToEnqueue.map(enqueueWithErrorCapture));

  const successCount = results.filter((result) => result.status === "success").length;
  const failures = results.filter(
    (result): result is Extract<AggregationEnqueueResult, { status: "error" }> =>
      result.status === "error"
  );

  state.totalProcessed += successCount;

  if (failures.length > 0) {
    state.totalErrors += failures.length;
    state.lastErrorAt = new Date();

    failures.forEach((failure) => {
      logger.error("Failed to enqueue aggregation", {
        repository: failure.key.repositoryFullName,
        commitSha: failure.key.commitSha,
        error: failure.error,
      });
      onError?.(failure.error, {
        repository: failure.key.repositoryFullName,
        commitSha: failure.key.commitSha,
      });
    });
  }

  if (successCount > 0) {
    logger.info("Aggregations enqueued", {
      successCount,
      failureCount: failures.length,
    });
  }
};

// ==================== Polling Loop ====================

/** Creates recursive polling loop that processes ready aggregations. */
const createPollingLoop = (
  config: AggregationConfig,
  pollIntervalMs: number,
  state: AggregatorWorkerState,
  onError?: WorkerErrorCallback,
  beforeEnqueue?: (key: AggregationKey) => Promise<boolean>
): PollingLoop => {
  const poll = async (): Promise<void> => {
    if (!state.running) {
      return;
    }

    state.lastPollAt = new Date();

    try {
      const readyKeys = await findReadyAggregations(config);

      if (readyKeys.length > 0) {
        logger.info("Found ready aggregations", { count: readyKeys.length });
        await processReadyAggregations(readyKeys, state, onError, beforeEnqueue);
      }
    } catch (caughtError) {
      const errorMessage = getErrorMessage(caughtError);
      state.totalErrors++;
      state.lastErrorAt = new Date();
      logger.error("Aggregator worker poll error", { error: errorMessage });
      onError?.(errorMessage, { phase: "poll" });
    }

    if (!state.running) {
      return;
    }

    await delay(pollIntervalMs);
    return poll();
  };

  return poll;
};

// ==================== Worker ====================

/** Runs the polling loop with error boundary. */
const runPollingLoop = async (
  poll: PollingLoop,
  state: AggregatorWorkerState,
  onError?: WorkerErrorCallback
): Promise<void> => {
  try {
    await poll();
  } catch (caughtError) {
    const errorMessage = getErrorMessage(caughtError);
    state.totalErrors++;
    state.lastErrorAt = new Date();
    logger.error("Aggregator worker fatal error", { error: errorMessage });
    onError?.(errorMessage, { phase: "fatal" });
  }
};

/** Creates a stats snapshot from current worker state. */
const createStatsSnapshot = (state: AggregatorWorkerState): WorkerStats => ({
  totalProcessed: state.totalProcessed,
  totalErrors: state.totalErrors,
  lastPollAt: state.lastPollAt,
  lastErrorAt: state.lastErrorAt,
  isRunning: state.running,
});

/**
 * Starts the aggregator worker.
 * Returns a control object for stopping and monitoring the worker.
 */
export const startAggregatorWorker = (options: AggregatorWorkerOptions = {}): WorkerControl => {
  const {
    config = DEFAULT_AGGREGATION_CONFIG,
    pollIntervalMs = QUEUE_WORKER_DEFAULTS.AGGREGATOR_POLL_INTERVAL_MS,
    onError,
    beforeEnqueue,
  } = options;

  const state: AggregatorWorkerState = {
    running: true,
    totalProcessed: 0,
    totalErrors: 0,
    lastPollAt: null,
    lastErrorAt: null,
  };

  logger.info("Starting Redis aggregator worker", {
    pollIntervalMs,
    debounceMs: config.debounceMs,
    maxWaitMs: config.maxWaitMs,
    hasBeforeEnqueue: !!beforeEnqueue,
  });

  const poll = createPollingLoop(config, pollIntervalMs, state, onError, beforeEnqueue);
  void runPollingLoop(poll, state, onError);

  return {
    stop: (): void => {
      state.running = false;
      logger.info("Aggregator worker stopping", {
        totalProcessed: state.totalProcessed,
        totalErrors: state.totalErrors,
      });
    },
    getStats: (): WorkerStats => createStatsSnapshot(state),
  };
};
