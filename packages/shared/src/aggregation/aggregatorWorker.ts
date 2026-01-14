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
import { findReadyAggregations, enqueuePendingAggregation } from "./redisAggregator.js";

const logger = createLogger("aggregator-worker");

/**
 * Recursive polling function that continues until stopped.
 * Uses tail recursion pattern to avoid while loops.
 */
const createPollingLoop = (
  config: AggregationConfig,
  pollIntervalMs: number,
  isRunning: () => boolean
): (() => Promise<void>) => {
  const poll = async (): Promise<void> => {
    if (!isRunning()) {
      return;
    }

    try {
      const readyKeys = await findReadyAggregations(config);

      if (readyKeys.length > 0) {
        logger.info("Found ready aggregations", { count: readyKeys.length });

        // Enqueue all ready pending aggregations for combined analysis
        await Promise.all(readyKeys.map(enqueuePendingAggregation));
      }
    } catch (error) {
      logger.error("Aggregator worker error", {
        error: getErrorMessage(error),
      });
    }

    // Schedule next poll if still running
    if (isRunning()) {
      await delay(pollIntervalMs);
      await poll();
    }
  };

  return poll;
};

/**
 * Starts the aggregator worker that checks for ready aggregations
 * and enqueues them for processing.
 *
 * The worker runs continuously, polling Redis at the specified interval
 * to find aggregations where the debounce period has expired or max
 * wait time has been exceeded.
 *
 * @param config - Aggregation configuration (debounce, max wait, etc.)
 * @param pollIntervalMs - How often to check for ready aggregations
 * @returns Stop function to gracefully shutdown the worker
 *
 * @example
 * const stopWorker = startAggregatorWorker();
 * // Later, to stop:
 * stopWorker();
 */
export const startAggregatorWorker = (
  config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG,
  pollIntervalMs: number = QUEUE_WORKER_DEFAULTS.AGGREGATOR_POLL_INTERVAL_MS
): (() => void) => {
  let isRunning = true;

  logger.info("Starting Redis aggregator worker", {
    pollIntervalMs,
    debounceMs: config.debounceMs,
    maxWaitMs: config.maxWaitMs,
  });

  const poll = createPollingLoop(config, pollIntervalMs, () => isRunning);

  // Start polling with error boundary
  const startPolling = async (): Promise<void> => {
    try {
      await poll();
    } catch (error) {
      logger.error("Aggregator worker fatal error", {
        error: getErrorMessage(error),
      });
    }
  };

  // Fire and forget - starts the async loop
  void startPolling();

  // Return stop function for graceful shutdown
  return (): void => {
    isRunning = false;
    logger.info("Aggregator worker stopping");
  };
};
