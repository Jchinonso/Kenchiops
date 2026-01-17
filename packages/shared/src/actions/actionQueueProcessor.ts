/**
 * Action Queue Processor
 *
 * Processes actions from the Redis queue asynchronously.
 * Publishes results via pub/sub for real-time updates.
 *
 * @module actions/actionQueueProcessor
 */

import {
  githubActionQueue,
  publish,
  CHANNELS,
  type QueueMessage,
  type ProcessResult,
} from "../queue/index.js";
import { executeAction } from "./actionExecutor.js";
import { createLogger, isRetryableError, delay, getErrorMessage } from "../core/index.js";
import { RETRYABLE_ERROR_PATTERNS, QUEUE_WORKER_DEFAULTS } from "../constants/index.js";
import type { ActionProposal } from "../core/types.js";
import type {
  ActionExecutionContext,
  ActionJobPayload,
  ActionResultEvent,
  QueueStats,
} from "./actionTypes.js";

// Re-export types for backwards compatibility
export type { ActionJobPayload, ActionResultEvent, QueueStats } from "./actionTypes.js";

const logger = createLogger("action-queue");

// ==================== Queue Operations ====================

/** Enqueues an action for async processing, returns message ID. */
export const enqueueAction = async (
  action: ActionProposal,
  context: ActionExecutionContext,
  callbackChannel?: string
): Promise<string> => {
  const payload: ActionJobPayload = { action, context, callbackChannel };
  const metadata = {
    actionId: action.id,
    actionType: action.actionType,
    repository: context.repository,
  };

  try {
    const messageId = await githubActionQueue.enqueue("execute_action", payload, metadata);
    logger.info("Action enqueued", { messageId, ...metadata });
    return messageId;
  } catch (error) {
    logger.error("Failed to enqueue action", { ...metadata, error: getErrorMessage(error) });
    throw error;
  }
};

/** Check if error is retryable using shared patterns. */
const checkRetryable = (error?: string): boolean =>
  isRetryableError(error, RETRYABLE_ERROR_PATTERNS);

/** Builds a ProcessResult with retry determination. */
const buildProcessResult = (success: boolean, error?: string): ProcessResult => ({
  success,
  error,
  shouldRetry: !success && checkRetryable(error),
});

/** Processes a single action job from the queue. */
const processActionJob = async (
  message: QueueMessage<ActionJobPayload>
): Promise<ProcessResult> => {
  const { action, context, callbackChannel } = message.payload;
  const jobContext = { messageId: message.id, actionId: action.id };

  logger.info("Processing action job", {
    ...jobContext,
    actionType: action.actionType,
    retryCount: message.retryCount,
  });

  try {
    const result = await executeAction(action, context);

    const resultEvent: ActionResultEvent = {
      actionId: action.id,
      actionType: action.actionType,
      result,
      queuedAt: message.timestamp,
      processedAt: new Date().toISOString(),
    };

    await publish(callbackChannel ?? CHANNELS.ACTION_EVENTS, "action_completed", resultEvent);

    logger.info("Action job completed", {
      ...jobContext,
      success: result.success,
      duration: result.duration,
    });

    return buildProcessResult(result.success, result.error);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Action job failed", { ...jobContext, error: errorMessage });
    return buildProcessResult(false, errorMessage);
  }
};

// ==================== Worker Functions ====================

interface WorkerOptions {
  readonly pollIntervalMs?: number;
  readonly maxConcurrent?: number;
}

interface WorkerState {
  running: boolean;
  activeJobs: number;
}

type WorkerLoop = () => Promise<void>;

/** Recursive worker loop - processes jobs until stopped. */
const createProcessLoop = (
  state: WorkerState,
  maxConcurrent: number,
  pollIntervalMs: number
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
      await githubActionQueue.process(processActionJob);
    } finally {
      state.activeJobs--;
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
    logger.error("Action queue worker error", { error: getErrorMessage(error) });
  }
};

/** Starts the action queue worker. Returns a stop function. */
export const startActionQueueWorker = async (options: WorkerOptions = {}): Promise<() => void> => {
  const {
    pollIntervalMs = QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent = QUEUE_WORKER_DEFAULTS.MAX_CONCURRENT,
  } = options;

  const state: WorkerState = { running: true, activeJobs: 0 };

  logger.info("Starting action queue worker", { pollIntervalMs, maxConcurrent });

  const workers = Array.from(
    { length: maxConcurrent },
    (): WorkerLoop => createProcessLoop(state, maxConcurrent, pollIntervalMs)
  );

  void runWorkers(workers);

  return (): void => {
    state.running = false;
    logger.info("Action queue worker stopping");
  };
};

/** Returns queue statistics for monitoring. */
export const getActionQueueStats = async (): Promise<QueueStats> => {
  try {
    return await githubActionQueue.getStats();
  } catch (error) {
    logger.error("Failed to get action queue stats", { error: getErrorMessage(error) });
    return { pending: 0, processing: 0, dead: 0 };
  }
};
