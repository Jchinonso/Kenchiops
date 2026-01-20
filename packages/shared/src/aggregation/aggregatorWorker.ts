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

// ==================== Re-exports for Backwards Compatibility ====================

export type {
  WorkerErrorCallback,
  WorkerStats,
  WorkerControl,
  AggregatorWorkerOptions,
} from "./types.js";

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

/** Processes all ready aggregations, handling individual failures gracefully. */
const processReadyAggregations = async (
  readyKeys: readonly AggregationKey[],
  state: AggregatorWorkerState,
  onError?: WorkerErrorCallback
): Promise<void> => {
  const results = await Promise.all(readyKeys.map(enqueueWithErrorCapture));

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
  onError?: WorkerErrorCallback
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
        await processReadyAggregations(readyKeys, state, onError);
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
  });

  const poll = createPollingLoop(config, pollIntervalMs, state, onError);
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
