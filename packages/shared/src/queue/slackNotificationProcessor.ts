/**
 * Slack Notification Queue Processor
 *
 * Handles queuing and processing of Slack notifications.
 * Provides reliable delivery with retries and dead letter queue.
 *
 * @module queue/slackNotificationProcessor
 */

import { slackNotificationQueue } from "./queueInstances.js";
import { createLogger } from "../core/logger.js";
import { QUEUE_WORKER_DEFAULTS, SLACK_RETRYABLE_ERROR_PATTERNS } from "../constants/index.js";
import { delay } from "../core/utils.js";
import { getErrorMessage } from "../core/errors.js";
import type { AggregatedFailures } from "../aggregation/types.js";
import type {
  QueueMessage,
  ProcessResult,
  QueueStats,
  ConsolidatedCIFailurePayload,
  ActionResultPayload,
  SystemAlertPayload,
  SlackNotificationPayload,
  NotificationHandler,
  WorkerOptions,
} from "./types.js";

export type {
  SlackNotificationType,
  ConsolidatedCIFailurePayload,
  ActionResultPayload,
  SystemAlertPayload,
  SlackNotificationPayload,
  NotificationHandler,
  WorkerOptions,
  QueueStats,
} from "./types.js";

const logger = createLogger("slack-notification-queue");

// ==================== Queue Operations ====================

/**
 * Enqueues a consolidated CI failure notification
 */
export const enqueueConsolidatedNotification = async (
  aggregation: AggregatedFailures,
  slackPayload: ConsolidatedCIFailurePayload["slackPayload"]
): Promise<string> => {
  const payload: ConsolidatedCIFailurePayload = {
    type: "consolidated_ci_failure",
    repository: aggregation.repository.fullName,
    installationId: aggregation.installationId,
    timestamp: new Date().toISOString(),
    aggregation,
    slackPayload,
  };

  const messageId = await slackNotificationQueue.enqueue("consolidated_ci_failure", payload, {
    repository: aggregation.repository.fullName,
    commitSha: aggregation.commitSha,
    failureCount: aggregation.failures.length,
  });

  logger.info("Enqueued consolidated CI failure notification", {
    messageId,
    repository: aggregation.repository.fullName,
    failureCount: aggregation.failures.length,
  });

  return messageId;
};

/**
 * Enqueues an action result notification
 */
export const enqueueActionResultNotification = async (
  payload: Omit<ActionResultPayload, "type" | "timestamp">
): Promise<string> => {
  const fullPayload: ActionResultPayload = {
    ...payload,
    type: "action_result",
    timestamp: new Date().toISOString(),
  };

  const messageId = await slackNotificationQueue.enqueue("action_result", fullPayload, {
    actionId: payload.actionId,
    actionType: payload.actionType,
    success: payload.success,
  });

  logger.info("Enqueued action result notification", {
    messageId,
    actionId: payload.actionId,
    actionType: payload.actionType,
    success: payload.success,
  });

  return messageId;
};

/**
 * Enqueues a system alert notification
 */
export const enqueueSystemAlert = async (
  payload: Omit<SystemAlertPayload, "type" | "timestamp">
): Promise<string> => {
  const fullPayload: SystemAlertPayload = {
    ...payload,
    type: "system_alert",
    timestamp: new Date().toISOString(),
  };

  const messageId = await slackNotificationQueue.enqueue("system_alert", fullPayload, {
    severity: payload.severity,
    title: payload.title,
  });

  logger.info("Enqueued system alert notification", {
    messageId,
    severity: payload.severity,
    title: payload.title,
  });

  return messageId;
};

// ==================== Error Handling ====================

/**
 * Determines if an error is retryable
 */
const isRetryableError = (error?: string): boolean => {
  if (!error) {
    return false;
  }
  return SLACK_RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(error));
};

// ==================== Worker Functions ====================

/**
 * Processes a single notification job from the queue
 */
const processNotificationJob =
  (handler: NotificationHandler) =>
  async (message: QueueMessage<SlackNotificationPayload>): Promise<ProcessResult> => {
    const { payload } = message;
    const startTime = Date.now();

    logger.info("Processing notification job", {
      messageId: message.id,
      type: payload.type,
      repository: payload.repository,
      retryCount: message.retryCount,
    });

    try {
      const result = await handler(payload);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        logger.info("Notification job completed", {
          messageId: message.id,
          type: payload.type,
          durationMs,
        });

        return { success: true };
      }

      logger.warn("Notification job failed", {
        messageId: message.id,
        type: payload.type,
        error: result.error,
        durationMs,
      });

      return {
        success: false,
        error: result.error,
        shouldRetry: isRetryableError(result.error),
      };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      const durationMs = Date.now() - startTime;

      logger.error("Notification job threw exception", {
        messageId: message.id,
        type: payload.type,
        error: errorMsg,
        durationMs,
      });

      return {
        success: false,
        error: errorMsg,
        shouldRetry: isRetryableError(errorMsg),
      };
    }
  };

/**
 * Starts the Slack notification queue worker
 * Continuously processes jobs from the queue
 *
 * @param handler - Function to handle each notification
 * @param options - Worker configuration
 * @returns Stop function to gracefully shutdown the worker
 */
export const startSlackNotificationWorker = async (
  handler: NotificationHandler,
  options: WorkerOptions = {}
): Promise<() => void> => {
  const {
    pollIntervalMs = QUEUE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
    maxConcurrent = QUEUE_WORKER_DEFAULTS.SLACK_MAX_CONCURRENT,
  } = options;
  let running = true;
  const isRunning = (): boolean => running;
  let activeJobs = 0;

  logger.info("Starting Slack notification queue worker", {
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
        await slackNotificationQueue.process(processNotificationJob(handler));
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
    logger.error("Slack notification queue worker error", {
      error: getErrorMessage(error),
    });
  });

  // Return stop function
  return () => {
    running = false;
    logger.info("Slack notification queue worker stopping");
  };
};

/**
 * Gets queue statistics
 */
export const getSlackNotificationQueueStats = async (): Promise<QueueStats> =>
  slackNotificationQueue.getStats();
