/**
 * CI Analysis Queue Processor
 *
 * Processes consolidated analysis jobs from the message queue.
 * Supports two payload types: ConsolidatedAnalysisPayload (legacy) and
 * PendingAggregationPayload (new combined analysis flow).
 *
 * @module aggregation/analysisQueueProcessor
 */

import {
  ciAnalysisQueue,
  type ProcessResult as QueueProcessResult,
} from "../queue/messageQueue.js";
import { createLogger, delay, getErrorMessage } from "../core/index.js";
import { QUEUE_WORKER_DEFAULTS, type CIProvider } from "../constants/index.js";
import type {
  AggregatedFailures,
  ConsolidatedPostResult,
  PendingAggregationPayload,
  ConsolidatedAnalysisPayload,
  AggregationReadyCallback,
  PendingAnalysisCallback,
  ProcessorErrorCallback,
  ProcessorStats,
  ProcessorControl,
  AnalysisQueueProcessorOptions,
  QueueMessage,
  ProcessorWorkerState,
  WorkerLoop,
  MessageProcessor,
} from "./types.js";
import { formatShaForDisplay } from "./aggregatorHelpers.js";

const logger = createLogger("analysis-queue-processor");

// ==================== Result Constructors ====================

/** Creates a success result. */
const successResult = (): QueueProcessResult => ({ success: true });

/** Creates an error result. */
const errorResult = (error: string, shouldRetry: boolean): QueueProcessResult => ({
  success: false,
  error,
  shouldRetry,
});

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
  provider: payload.aggregation.provider as CIProvider | undefined,
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

/** Handles successful processing and updates state. */
const handleSuccess = (
  messageId: string,
  analysisType: string,
  result: ConsolidatedPostResult,
  state: ProcessorWorkerState
): QueueProcessResult => {
  state.totalProcessed++;
  state.lastProcessedAt = new Date();

  logger.info(`${analysisType} completed`, {
    messageId,
    success: result.success,
    prCommentsPosted: result.prCommentsPosted,
    slackMessageSent: result.slackMessageSent,
  });

  return successResult();
};

/** Handles error and updates state. */
const handleError = (
  messageId: string,
  analysisType: string,
  caughtError: unknown,
  state: ProcessorWorkerState,
  onError?: ProcessorErrorCallback,
  context?: Record<string, unknown>
): QueueProcessResult => {
  const errorMessage = getErrorMessage(caughtError);
  state.totalErrors++;
  state.lastErrorAt = new Date();

  logger.error(`Failed to process ${analysisType}`, { messageId, error: errorMessage });
  onError?.(errorMessage, { messageId, analysisType, ...context });

  return errorResult(errorMessage, true);
};

/** Processes pending aggregation payload (new combined analysis flow). */
const processPendingPayload = async (
  message: QueueMessage,
  payload: PendingAggregationPayload,
  state: ProcessorWorkerState,
  onPendingReady?: PendingAnalysisCallback,
  onError?: ProcessorErrorCallback
): Promise<QueueProcessResult> => {
  if (!onPendingReady) {
    const errorMessage = "No pending analysis handler configured";
    state.totalErrors++;
    state.lastErrorAt = new Date();

    logger.error("Received pending aggregation but no handler configured", {
      messageId: message.id,
    });
    onError?.(errorMessage, { messageId: message.id, phase: "handler_missing" });

    return errorResult(errorMessage, false);
  }

  const pending = payload.pendingAggregation;
  const context = {
    repository: pending.repository.fullName,
    commitSha: pending.commitSha,
    pendingCheckCount: pending.pendingChecks.length,
  };

  logger.info("Processing pending aggregation for combined analysis", {
    messageId: message.id,
    ...context,
    commitSha: formatShaForDisplay(pending.commitSha),
  });

  try {
    const result = await onPendingReady(payload);
    return handleSuccess(message.id, "Combined analysis", result, state);
  } catch (caughtError) {
    return handleError(message.id, "combined analysis", caughtError, state, onError, context);
  }
};

/** Processes consolidated analysis payload (legacy flow). */
const processConsolidatedPayload = async (
  message: QueueMessage,
  payload: ConsolidatedAnalysisPayload,
  state: ProcessorWorkerState,
  onReady: AggregationReadyCallback,
  onError?: ProcessorErrorCallback
): Promise<QueueProcessResult> => {
  const aggregation = deserializeQueuePayload(payload);
  const context = {
    repository: aggregation.repository.fullName,
    commitSha: aggregation.commitSha,
    failureCount: aggregation.failures.length,
  };

  logger.info("Processing consolidated analysis", {
    messageId: message.id,
    ...context,
    commitSha: formatShaForDisplay(aggregation.commitSha),
  });

  try {
    const result = await onReady(aggregation);
    return handleSuccess(message.id, "Consolidated analysis", result, state);
  } catch (caughtError) {
    return handleError(message.id, "consolidated analysis", caughtError, state, onError, context);
  }
};

/** Creates a message processor that routes to appropriate handler based on payload type. */
const createMessageProcessor =
  (
    onReady: AggregationReadyCallback,
    state: ProcessorWorkerState,
    onPendingReady?: PendingAnalysisCallback,
    onError?: ProcessorErrorCallback
  ): MessageProcessor =>
  async (message: QueueMessage): Promise<QueueProcessResult> => {
    const { payload } = message;

    if (isPendingAggregationPayload(payload)) {
      return processPendingPayload(message, payload, state, onPendingReady, onError);
    }

    if (isConsolidatedAnalysisPayload(payload)) {
      return processConsolidatedPayload(message, payload, state, onReady, onError);
    }

    const errorMessage = "Unknown payload type";
    state.totalErrors++;
    state.lastErrorAt = new Date();

    logger.error("Unknown queue payload type", { messageId: message.id });
    onError?.(errorMessage, { messageId: message.id, phase: "payload_validation" });

    return errorResult(errorMessage, false);
  };

// ==================== Worker Loop ====================

/** Creates a recursive worker loop that processes messages until stopped. */
const createWorkerLoop = (
  processMessage: MessageProcessor,
  state: ProcessorWorkerState,
  pollIntervalMs: number,
  maxConcurrent: number,
  onError?: ProcessorErrorCallback
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
    } catch (caughtError) {
      const errorMessage = getErrorMessage(caughtError);
      state.totalErrors++;
      state.lastErrorAt = new Date();
      logger.error("Worker loop error", { error: errorMessage });
      onError?.(errorMessage, { phase: "worker_loop" });
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
const runWorkers = async (
  workers: readonly WorkerLoop[],
  state: ProcessorWorkerState,
  onError?: ProcessorErrorCallback
): Promise<void> => {
  try {
    await Promise.all(workers.map((worker): Promise<void> => worker()));
  } catch (caughtError) {
    const errorMessage = getErrorMessage(caughtError);
    state.totalErrors++;
    state.lastErrorAt = new Date();
    logger.error("Analysis queue processor fatal error", { error: errorMessage });
    onError?.(errorMessage, { phase: "fatal" });
  }
};

/** Creates a stats snapshot from current worker state. */
const createStatsSnapshot = (state: ProcessorWorkerState): ProcessorStats => ({
  totalProcessed: state.totalProcessed,
  totalErrors: state.totalErrors,
  lastProcessedAt: state.lastProcessedAt,
  lastErrorAt: state.lastErrorAt,
  isRunning: state.running,
});

// ==================== Public API ====================

/**
 * Starts the CI analysis queue processor.
 * Returns a control object for stopping and monitoring the processor.
 */
export const startAnalysisQueueProcessor = (
  onReady: AggregationReadyCallback,
  options: AnalysisQueueProcessorOptions = {}
): ProcessorControl => {
  const {
    pollIntervalMs = QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent = QUEUE_WORKER_DEFAULTS.ANALYSIS_MAX_CONCURRENT,
    onPendingReady,
    onError,
  } = options;

  const state: ProcessorWorkerState = {
    running: true,
    activeJobs: 0,
    totalProcessed: 0,
    totalErrors: 0,
    lastProcessedAt: null,
    lastErrorAt: null,
  };

  logger.info("Starting CI analysis queue processor", {
    pollIntervalMs,
    maxConcurrent,
    hasPendingHandler: Boolean(onPendingReady),
  });

  const processMessage = createMessageProcessor(onReady, state, onPendingReady, onError);
  const workerLoop = createWorkerLoop(
    processMessage,
    state,
    pollIntervalMs,
    maxConcurrent,
    onError
  );

  const workers = Array.from({ length: maxConcurrent }, (): WorkerLoop => workerLoop);

  void runWorkers(workers, state, onError);

  return {
    stop: (): void => {
      state.running = false;
      logger.info("Analysis queue processor stopping", {
        totalProcessed: state.totalProcessed,
        totalErrors: state.totalErrors,
      });
    },
    getStats: (): ProcessorStats => createStatsSnapshot(state),
  };
};
