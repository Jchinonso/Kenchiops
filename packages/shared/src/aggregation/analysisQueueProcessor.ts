/**
 * CI Analysis Queue Processor
 *
 * Processes consolidated analysis jobs from the message queue.
 * Supports two types of payloads:
 * - ConsolidatedAnalysisPayload: Pre-analyzed failures (legacy flow)
 * - PendingAggregationPayload: Pending checks that need combined analysis (new flow)
 *
 * @module aggregation/analysisQueueProcessor
 */

import { ciAnalysisQueue } from "../queue/messageQueue.js";
import { createLogger, delay, getErrorMessage } from "../core/index.js";
import { QUEUE_WORKER_DEFAULTS, DISPLAY_DEFAULTS } from "../constants/index.js";
import type {
  AggregatedFailures,
  SerializedFailure,
  RepositoryInfo,
  PRContext,
  WorkflowContext,
  ConsolidatedPostResult,
} from "./types.js";
import type { PendingAggregationPayload } from "./redisAggregator.js";

const logger = createLogger("analysis-queue-processor");

/**
 * Callback type for when aggregation is ready to be posted (pre-analyzed)
 */
export type AggregationReadyCallback = (
  aggregation: AggregatedFailures
) => Promise<ConsolidatedPostResult>;

/**
 * Callback type for when pending aggregation needs combined analysis
 */
export type PendingAnalysisCallback = (
  payload: PendingAggregationPayload
) => Promise<ConsolidatedPostResult>;

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
 * Format SHA for display logging
 */
const formatShaForDisplay = (sha: string): string =>
  sha.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH);

/**
 * Deserialize aggregation from queue payload
 */
export const deserializeQueuePayload = (
  payload: ConsolidatedAnalysisPayload
): AggregatedFailures => ({
  ...payload.aggregation,
  failures: payload.aggregation.failures.map((failure) => ({
    ...failure,
    timestamp: new Date(failure.timestamp),
  })),
  firstFailureAt: new Date(payload.aggregation.firstFailureAt),
  lastFailureAt: new Date(payload.aggregation.lastFailureAt),
});

/**
 * Process result from queue handler
 */
interface ProcessResult {
  readonly success: boolean;
  readonly error?: string;
  readonly shouldRetry?: boolean;
}

/**
 * Check if payload is a pending aggregation (new flow)
 */
const isPendingAggregationPayload = (payload: unknown): payload is PendingAggregationPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "pendingAggregation" in payload &&
  typeof (payload as PendingAggregationPayload).pendingAggregation === "object";

/**
 * Check if payload is a consolidated analysis (legacy flow)
 */
const isConsolidatedAnalysisPayload = (payload: unknown): payload is ConsolidatedAnalysisPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "aggregation" in payload &&
  typeof (payload as ConsolidatedAnalysisPayload).aggregation === "object" &&
  "failures" in (payload as ConsolidatedAnalysisPayload).aggregation;

/**
 * Creates a message processor function for the queue
 * Handles both pending aggregation (new flow) and consolidated analysis (legacy flow)
 */
const createMessageProcessor =
  (
    onReady: AggregationReadyCallback,
    onPendingReady?: PendingAnalysisCallback
  ): ((message: { id: string; payload: unknown }) => Promise<ProcessResult>) =>
  async (message): Promise<ProcessResult> => {
    const { payload } = message;

    // Handle pending aggregation (new combined analysis flow)
    if (isPendingAggregationPayload(payload)) {
      if (!onPendingReady) {
        logger.error("Received pending aggregation but no handler configured", {
          messageId: message.id,
        });
        return { success: false, error: "No pending analysis handler", shouldRetry: false };
      }

      const pending = payload.pendingAggregation;
      logger.info("Processing pending aggregation for combined analysis", {
        messageId: message.id,
        repository: pending.repository.fullName,
        commitSha: formatShaForDisplay(pending.commitSha),
        pendingCheckCount: pending.pendingChecks.length,
      });

      try {
        const result = await onPendingReady(payload);

        logger.info("Combined analysis completed", {
          messageId: message.id,
          success: result.success,
          prCommentsPosted: result.prCommentsPosted,
          slackMessageSent: result.slackMessageSent,
        });

        return { success: result.success };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error("Failed to process combined analysis", {
          messageId: message.id,
          error: errorMessage,
        });
        return { success: false, error: errorMessage, shouldRetry: true };
      }
    }

    // Handle consolidated analysis (legacy flow with pre-analyzed failures)
    if (isConsolidatedAnalysisPayload(payload)) {
      const aggregation = deserializeQueuePayload(payload);

      logger.info("Processing consolidated analysis", {
        messageId: message.id,
        repository: aggregation.repository.fullName,
        commitSha: formatShaForDisplay(aggregation.commitSha),
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
        const errorMessage = getErrorMessage(error);
        logger.error("Failed to process consolidated analysis", {
          messageId: message.id,
          error: errorMessage,
        });
        return { success: false, error: errorMessage, shouldRetry: true };
      }
    }

    // Unknown payload type
    logger.error("Unknown queue payload type", { messageId: message.id });
    return { success: false, error: "Unknown payload type", shouldRetry: false };
  };

/**
 * Creates a worker loop using recursive pattern
 */
const createWorkerLoop = (
  processMessage: (message: { id: string; payload: unknown }) => Promise<ProcessResult>,
  pollIntervalMs: number,
  isRunning: () => boolean,
  getActiveJobs: () => number,
  setActiveJobs: (updater: (current: number) => number) => void,
  maxConcurrent: number
): (() => Promise<void>) => {
  const processLoop = async (): Promise<void> => {
    if (!isRunning()) {
      return;
    }

    // Throttle if at max concurrency
    if (getActiveJobs() >= maxConcurrent) {
      await delay(QUEUE_WORKER_DEFAULTS.CONCURRENCY_THROTTLE_MS);
      await processLoop();
      return;
    }

    try {
      setActiveJobs((current) => current + 1);
      await ciAnalysisQueue.process(processMessage);
    } finally {
      setActiveJobs((current) => current - 1);
    }

    // Continue processing if still running
    if (isRunning()) {
      await delay(pollIntervalMs);
      await processLoop();
    }
  };

  return processLoop;
};

/**
 * Starts the CI analysis queue processor.
 * Processes both consolidated and pending analysis jobs.
 *
 * @param onReady - Callback invoked when pre-analyzed aggregation is ready (legacy flow)
 * @param options - Processor configuration including optional pending analysis handler
 * @returns Stop function to gracefully shutdown the processor
 *
 * @example
 * const stopProcessor = startAnalysisQueueProcessor(
 *   async (aggregation) => {
 *     // Handle pre-analyzed failures (legacy)
 *     return await postConsolidatedAnalysis(aggregation);
 *   },
 *   {
 *     onPendingReady: async (payload) => {
 *       // Handle pending checks that need combined analysis (new flow)
 *       return await processCombinedAnalysis(payload);
 *     },
 *   }
 * );
 */
export const startAnalysisQueueProcessor = (
  onReady: AggregationReadyCallback,
  options: {
    pollIntervalMs?: number;
    maxConcurrent?: number;
    onPendingReady?: PendingAnalysisCallback;
  } = {}
): (() => void) => {
  const {
    pollIntervalMs = QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent = 3,
    onPendingReady,
  } = options;
  let isRunning = true;
  let activeJobs = 0;

  logger.info("Starting CI analysis queue processor", {
    pollIntervalMs,
    maxConcurrent,
    hasPendingHandler: Boolean(onPendingReady),
  });

  const processMessage = createMessageProcessor(onReady, onPendingReady);

  const workerLoop = createWorkerLoop(
    processMessage,
    pollIntervalMs,
    () => isRunning,
    () => activeJobs,
    (updater) => {
      activeJobs = updater(activeJobs);
    },
    maxConcurrent
  );

  // Start worker instances
  const startWorkers = async (): Promise<void> => {
    const workerPromises = Array.from({ length: maxConcurrent }, () => workerLoop());
    try {
      await Promise.all(workerPromises);
    } catch (error) {
      logger.error("Analysis queue processor error", {
        error: getErrorMessage(error),
      });
    }
  };

  // Fire and forget
  void startWorkers();

  return (): void => {
    isRunning = false;
    logger.info("Analysis queue processor stopping");
  };
};
