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
import { DEFAULT_AGGREGATION_CONFIG, type AggregationConfig } from "./types.js";
import { findReadyAggregations } from "./aggregationScanner.js";
import { enqueuePendingAggregation } from "./aggregationEnqueuer.js";

const logger = createLogger("aggregator-worker");

// ==================== Types ====================

/** Mutable state for controlling worker lifecycle. */
interface WorkerState {
  running: boolean;
}

/** Function to stop the worker gracefully. */
export type StopFunction = () => void;

/** Async function that polls and recurses until stopped. */
type PollingLoop = () => Promise<void>;

// ==================== Polling Loop ====================

/** Creates recursive polling loop that processes ready aggregations. */
const createPollingLoop = (
  config: AggregationConfig,
  pollIntervalMs: number,
  state: WorkerState
): PollingLoop => {
  const poll = async (): Promise<void> => {
    if (!state.running) {
      return;
    }

    try {
      const readyKeys = await findReadyAggregations(config);

      if (readyKeys.length > 0) {
        logger.info("Found ready aggregations", { count: readyKeys.length });
        await Promise.all(readyKeys.map(enqueuePendingAggregation));
      }
    } catch (error) {
      logger.error("Aggregator worker error", { error: getErrorMessage(error) });
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
const runPollingLoop = async (poll: PollingLoop): Promise<void> => {
  try {
    await poll();
  } catch (error) {
    logger.error("Aggregator worker fatal error", { error: getErrorMessage(error) });
  }
};

/** Starts the aggregator worker. Returns a stop function for graceful shutdown. */
export const startAggregatorWorker = (
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG,
  pollIntervalMs: number = QUEUE_WORKER_DEFAULTS.AGGREGATOR_POLL_INTERVAL_MS
): StopFunction => {
  const state: WorkerState = { running: true };

  logger.info("Starting Redis aggregator worker", {
    pollIntervalMs,
    debounceMs: config.debounceMs,
    maxWaitMs: config.maxWaitMs,
  });

  const poll = createPollingLoop(config, pollIntervalMs, state);
  void runPollingLoop(poll);

  return (): void => {
    state.running = false;
    logger.info("Aggregator worker stopping");
  };
};
