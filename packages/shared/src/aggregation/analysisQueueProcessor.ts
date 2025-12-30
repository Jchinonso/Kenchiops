/**
 * CI Analysis Queue Processor
 *
 * Processes consolidated analysis jobs from the message queue.
 * Deserializes aggregated failures and invokes the analysis callback.
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

const logger = createLogger("analysis-queue-processor");

/**
 * Callback type for when aggregation is ready to be posted
 */
export type AggregationReadyCallback = (
  aggregation: AggregatedFailures
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
 * Creates a message processor function for the queue
 */
const createMessageProcessor =
  (
    onReady: AggregationReadyCallback
  ): ((message: { id: string; payload: unknown }) => Promise<ProcessResult>) =>
  async (message): Promise<ProcessResult> => {
    const payload = message.payload as ConsolidatedAnalysisPayload;

    // Validate payload structure
    if (!payload.aggregation || !payload.aggregation.failures) {
      logger.error("Invalid queue payload", { messageId: message.id });
      return { success: false, error: "Invalid payload", shouldRetry: false };
    }

    // Deserialize and process
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
 * Processes consolidated analysis jobs and posts results.
 *
 * @param onReady - Callback invoked when aggregation is ready for processing
 * @param options - Processor configuration
 * @returns Stop function to gracefully shutdown the processor
 *
 * @example
 * const stopProcessor = startAnalysisQueueProcessor(async (aggregation) => {
 *   await postToSlack(aggregation);
 *   await postToGitHub(aggregation);
 *   return { success: true, prCommentsPosted: 1, slackMessageSent: true };
 * });
 */
export const startAnalysisQueueProcessor = (
  onReady: AggregationReadyCallback,
  options: { pollIntervalMs?: number; maxConcurrent?: number } = {}
): (() => void) => {
  const { pollIntervalMs = QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS, maxConcurrent = 3 } = options;
  let isRunning = true;
  let activeJobs = 0;

  logger.info("Starting CI analysis queue processor", {
    pollIntervalMs,
    maxConcurrent,
  });

  const processMessage = createMessageProcessor(onReady);

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
