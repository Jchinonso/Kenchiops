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
import {
  executeAction,
  type ActionExecutionContext,
  type ActionExecutionResult,
} from "./actionExecutor.js";
import { createLogger, isRetryableError, delay, getErrorMessage } from "../core/index.js";
import { RETRYABLE_ERROR_PATTERNS, QUEUE_WORKER_DEFAULTS } from "../constants/index.js";
import type { ActionType, ActionProposal } from "../core/types.js";

const logger = createLogger("action-queue");

// ==================== Types ====================

/**
 * Action job payload for queue
 */
export interface ActionJobPayload {
  readonly action: ActionProposal;
  readonly context: ActionExecutionContext;
  readonly callbackChannel?: string;
}

/**
 * Action result event for pub/sub
 */
export interface ActionResultEvent {
  readonly actionId: string;
  readonly actionType: ActionType;
  readonly result: ActionExecutionResult;
  readonly queuedAt: string;
  readonly processedAt: string;
}

// ==================== Queue Operations ====================

/**
 * Enqueues an action for async processing
 */
export const enqueueAction = async (
  action: ActionProposal,
  context: ActionExecutionContext,
  callbackChannel?: string
): Promise<string> => {
  const payload: ActionJobPayload = {
    action,
    context,
    callbackChannel,
  };

  const messageId = await githubActionQueue.enqueue("execute_action", payload, {
    actionId: action.id,
    actionType: action.actionType,
    repository: context.repository,
  });

  logger.info("Action enqueued", {
    messageId,
    actionId: action.id,
    actionType: action.actionType,
    repository: context.repository,
  });

  return messageId;
};

/**
 * Processes a single action job from the queue
 */
const processActionJob = async (
  message: QueueMessage<ActionJobPayload>
): Promise<ProcessResult> => {
  const { action, context, callbackChannel } = message.payload;
  const queuedAt = message.timestamp;

  logger.info("Processing action job", {
    messageId: message.id,
    actionId: action.id,
    actionType: action.actionType,
    retryCount: message.retryCount,
  });

  try {
    // Execute the action
    const result = await executeAction(action, context);
    const processedAt = new Date().toISOString();

    // Publish result to pub/sub for real-time updates
    const resultEvent: ActionResultEvent = {
      actionId: action.id,
      actionType: action.actionType,
      result,
      queuedAt,
      processedAt,
    };

    await publish(callbackChannel ?? CHANNELS.ACTION_EVENTS, "action_completed", resultEvent);

    logger.info("Action job completed", {
      messageId: message.id,
      actionId: action.id,
      success: result.success,
      duration: result.duration,
    });

    return {
      success: result.success,
      error: result.error,
      shouldRetry: !result.success && checkRetryable(result.error),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    logger.error("Action job failed", {
      messageId: message.id,
      actionId: action.id,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      shouldRetry: checkRetryable(errorMessage),
    };
  }
};

/**
 * Check if error is retryable using shared patterns
 */
const checkRetryable = (error?: string): boolean =>
  isRetryableError(error, RETRYABLE_ERROR_PATTERNS);

// ==================== Worker Functions ====================

/**
 * Starts the action queue worker
 * Continuously processes jobs from the queue
 */
export const startActionQueueWorker = async (
  options: { pollIntervalMs?: number; maxConcurrent?: number } = {}
): Promise<() => void> => {
  const {
    pollIntervalMs = QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent = QUEUE_WORKER_DEFAULTS.MAX_CONCURRENT,
  } = options;
  let running = true;
  const isRunning = (): boolean => running;
  let activeJobs = 0;

  logger.info("Starting action queue worker", {
    pollIntervalMs,
    maxConcurrent,
  });

  const processLoop = async (): Promise<void> => {
    while (isRunning()) {
      // Wait if at max concurrency
      if (activeJobs >= maxConcurrent) {
        await delay(QUEUE_WORKER_DEFAULTS.CONCURRENCY_THROTTLE_MS);
        continue;
      }

      try {
        activeJobs++;
        await githubActionQueue.process(processActionJob);
      } finally {
        activeJobs--;
      }

      // Small delay between processing attempts
      await delay(pollIntervalMs);
    }
  };

  // Start multiple concurrent workers
  const workers = Array.from({ length: maxConcurrent }, () => processLoop());

  // Don't await - let them run in background
  Promise.all(workers).catch((error) => {
    logger.error("Action queue worker error", {
      error: getErrorMessage(error),
    });
  });

  // Return stop function
  return () => {
    running = false;
    logger.info("Action queue worker stopping");
  };
};

/**
 * Gets queue statistics
 */
export const getActionQueueStats = async (): Promise<{
  pending: number;
  processing: number;
  dead: number;
}> => githubActionQueue.getStats();
