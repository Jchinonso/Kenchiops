/**
 * CI Analysis Queue Processor
 *
 * Processes consolidated analysis jobs from the message queue.
 * Supports two payload types: ConsolidatedAnalysisPayload (legacy) and
 * PendingAggregationPayload (new combined analysis flow).
 *
 * @module aggregation/analysisQueueProcessor
 */

import { ciAnalysisQueue } from "../queue/messageQueue.js";
import { createLogger, delay, getErrorMessage } from "../core/index.js";
import { QUEUE_WORKER_DEFAULTS } from "../constants/index.js";
import type {
  AggregatedFailures,
  SerializedFailure,
  RepositoryInfo,
  PRContext,
  WorkflowContext,
  ConsolidatedPostResult,
} from "./types.js";
import type { PendingAggregationPayload } from "./aggregationEnqueuer.js";
import { formatShaForDisplay } from "./aggregatorHelpers.js";

const logger = createLogger("analysis-queue-processor");

// ==================== Constants ====================

const DEFAULT_MAX_CONCURRENT = 3;

// ==================== Types ====================

/** Callback for pre-analyzed aggregation (legacy flow). */
export type AggregationReadyCallback = (
  aggregation: AggregatedFailures
) => Promise<ConsolidatedPostResult>;

/** Callback for pending aggregation needing combined analysis (new flow). */
export type PendingAnalysisCallback = (
  payload: PendingAggregationPayload
) => Promise<ConsolidatedPostResult>;

/** Function to stop the processor gracefully. */
export type StopFunction = () => void;

/** Payload structure for consolidated analysis jobs. */
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

/** Configuration options for the analysis queue processor. */
export interface AnalysisQueueProcessorOptions {
  readonly pollIntervalMs?: number;
  readonly maxConcurrent?: number;
  readonly onPendingReady?: PendingAnalysisCallback;
}

/** Process result from queue handler. */
interface ProcessResult {
  readonly success: boolean;
  readonly error?: string;
  readonly shouldRetry?: boolean;
}

/** Queue message structure. */
interface QueueMessage {
  readonly id: string;
  readonly payload: unknown;
}

/** Mutable state for controlling worker lifecycle. */
interface WorkerState {
  running: boolean;
  activeJobs: number;
}

// ==================== Helpers ====================

/** Deserializes aggregation from queue payload (converts ISO strings to Dates). */
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

// ==================== Type Guards ====================

/** Type guard for non-null object. */
const isNonNullObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Type guard for PendingAggregationPayload. */
const isPendingAggregationPayload = (payload: unknown): payload is PendingAggregationPayload =>
  isNonNullObject(payload) &&
  "pendingAggregation" in payload &&
  isNonNullObject(payload.pendingAggregation);

/** Type guard for ConsolidatedAnalysisPayload. */
const isConsolidatedAnalysisPayload = (payload: unknown): payload is ConsolidatedAnalysisPayload =>
  isNonNullObject(payload) &&
  "aggregation" in payload &&
  isNonNullObject(payload.aggregation) &&
  "failures" in payload.aggregation;

// ==================== Message Processing ====================

type MessageProcessor = (message: QueueMessage) => Promise<ProcessResult>;

/** Logs completion and returns ProcessResult. */
const logCompletionAndReturn = (
  messageId: string,
  analysisType: string,
  result: ConsolidatedPostResult
): ProcessResult => {
  logger.info(`${analysisType} completed`, {
    messageId,
    success: result.success,
    prCommentsPosted: result.prCommentsPosted,
    slackMessageSent: result.slackMessageSent,
  });
  return { success: result.success };
};

/** Logs error and returns failed ProcessResult. */
const logErrorAndReturn = (
  messageId: string,
  analysisType: string,
  error: unknown
): ProcessResult => {
  const errorMessage = getErrorMessage(error);
  logger.error(`Failed to process ${analysisType}`, { messageId, error: errorMessage });
  return { success: false, error: errorMessage, shouldRetry: true };
};

/** Processes pending aggregation payload (new combined analysis flow). */
const processPendingPayload = async (
  message: QueueMessage,
  payload: PendingAggregationPayload,
  onPendingReady?: PendingAnalysisCallback
): Promise<ProcessResult> => {
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
    return logCompletionAndReturn(message.id, "Combined analysis", result);
  } catch (error) {
    return logErrorAndReturn(message.id, "combined analysis", error);
  }
};

/** Processes consolidated analysis payload (legacy flow). */
const processConsolidatedPayload = async (
  message: QueueMessage,
  payload: ConsolidatedAnalysisPayload,
  onReady: AggregationReadyCallback
): Promise<ProcessResult> => {
  const aggregation = deserializeQueuePayload(payload);

  logger.info("Processing consolidated analysis", {
    messageId: message.id,
    repository: aggregation.repository.fullName,
    commitSha: formatShaForDisplay(aggregation.commitSha),
    failureCount: aggregation.failures.length,
  });

  try {
    const result = await onReady(aggregation);
    return logCompletionAndReturn(message.id, "Consolidated analysis", result);
  } catch (error) {
    return logErrorAndReturn(message.id, "consolidated analysis", error);
  }
};

/** Creates a message processor that routes to appropriate handler based on payload type. */
const createMessageProcessor =
  (onReady: AggregationReadyCallback, onPendingReady?: PendingAnalysisCallback): MessageProcessor =>
  async (message: QueueMessage): Promise<ProcessResult> => {
    const { payload } = message;

    if (isPendingAggregationPayload(payload)) {
      return processPendingPayload(message, payload, onPendingReady);
    }

    if (isConsolidatedAnalysisPayload(payload)) {
      return processConsolidatedPayload(message, payload, onReady);
    }

    logger.error("Unknown queue payload type", { messageId: message.id });
    return { success: false, error: "Unknown payload type", shouldRetry: false };
  };

// ==================== Worker Loop ====================

type WorkerLoop = () => Promise<void>;

/** Creates a recursive worker loop that processes messages until stopped. */
const createWorkerLoop = (
  processMessage: MessageProcessor,
  state: WorkerState,
  pollIntervalMs: number,
  maxConcurrent: number
): WorkerLoop => {
  const loop = async (): Promise<void> => {
    if (!state.running) {
      return;
    }

    if (state.activeJobs >= maxConcurrent) {
      await delay(QUEUE_WORKER_DEFAULTS.CONCURRENCY_THROTTLE_MS);
      return loop();
    }

    try {
      state.activeJobs++;
      await ciAnalysisQueue.process(processMessage);
    } finally {
      state.activeJobs--;
    }

    if (!state.running) {
      return;
    }

    await delay(pollIntervalMs);
    return loop();
  };

  return loop;
};

/** Runs all workers with error handling. */
const runWorkers = async (workers: readonly WorkerLoop[]): Promise<void> => {
  try {
    await Promise.all(workers.map((worker): Promise<void> => worker()));
  } catch (error) {
    logger.error("Analysis queue processor error", { error: getErrorMessage(error) });
  }
};

// ==================== Public API ====================

/** Starts the CI analysis queue processor. Returns a stop function for graceful shutdown. */
export const startAnalysisQueueProcessor = (
  onReady: AggregationReadyCallback,
  options: AnalysisQueueProcessorOptions = {}
): StopFunction => {
  const {
    pollIntervalMs = QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    onPendingReady,
  } = options;

  const state: WorkerState = { running: true, activeJobs: 0 };

  logger.info("Starting CI analysis queue processor", {
    pollIntervalMs,
    maxConcurrent,
    hasPendingHandler: Boolean(onPendingReady),
  });

  const processMessage = createMessageProcessor(onReady, onPendingReady);
  const workerLoop = createWorkerLoop(processMessage, state, pollIntervalMs, maxConcurrent);

  const workers: readonly WorkerLoop[] = Array(maxConcurrent).fill(workerLoop);

  void runWorkers(workers);

  return (): void => {
    state.running = false;
    logger.info("Analysis queue processor stopping");
  };
};
