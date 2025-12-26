/**
 * Slack Notification Queue Processor
 *
 * Handles queuing and processing of Slack notifications.
 * Provides reliable delivery with retries and dead letter queue.
 *
 * @module queue/slackNotificationProcessor
 */

import { slackNotificationQueue, type QueueMessage, type ProcessResult } from "./messageQueue.js";
import { createLogger } from "../core/logger.js";
import type { AggregatedFailures } from "../aggregation/types.js";

const logger = createLogger("slack-notification-queue");

// ==================== Types ====================

/**
 * Slack notification job types
 */
export type SlackNotificationType =
  | "consolidated_ci_failure"
  | "single_ci_failure"
  | "action_result"
  | "system_alert";

/**
 * Base notification payload
 */
interface BaseNotificationPayload {
  readonly type: SlackNotificationType;
  readonly repository: string;
  readonly installationId: number;
  readonly timestamp: string;
}

/**
 * Consolidated CI failure notification payload
 */
export interface ConsolidatedCIFailurePayload extends BaseNotificationPayload {
  readonly type: "consolidated_ci_failure";
  readonly aggregation: AggregatedFailures;
  readonly slackPayload: {
    readonly blocks: readonly unknown[];
    readonly text: string;
    readonly metadata?: Record<string, unknown>;
  };
}

/**
 * Action result notification payload
 */
export interface ActionResultPayload extends BaseNotificationPayload {
  readonly type: "action_result";
  readonly actionId: string;
  readonly actionType: string;
  readonly success: boolean;
  readonly message: string;
  readonly channelId?: string;
  readonly threadTs?: string;
}

/**
 * System alert notification payload
 */
export interface SystemAlertPayload extends BaseNotificationPayload {
  readonly type: "system_alert";
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly title: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Union type for all notification payloads
 */
export type SlackNotificationPayload =
  | ConsolidatedCIFailurePayload
  | ActionResultPayload
  | SystemAlertPayload;

/**
 * Notification handler function type
 */
export type NotificationHandler = (
  payload: SlackNotificationPayload
) => Promise<{ success: boolean; error?: string }>;

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
  if (!error) return false;

  const retryablePatterns = [
    /timeout/i,
    /network/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /rate.?limit/i,
    /503/,
    /502/,
    /504/,
    /channel_not_found/i,
    /not_in_channel/i,
  ];

  return retryablePatterns.some((pattern) => pattern.test(error));
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
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info("Notification job completed", {
          messageId: message.id,
          type: payload.type,
          duration,
        });

        return { success: true };
      }

      logger.warn("Notification job failed", {
        messageId: message.id,
        type: payload.type,
        error: result.error,
        duration,
      });

      return {
        success: false,
        error: result.error,
        shouldRetry: isRetryableError(result.error),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      logger.error("Notification job threw exception", {
        messageId: message.id,
        type: payload.type,
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        error: errorMessage,
        shouldRetry: isRetryableError(errorMessage),
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
  options: { pollIntervalMs?: number; maxConcurrent?: number } = {}
): Promise<() => void> => {
  const { pollIntervalMs = 1000, maxConcurrent = 3 } = options;
  let running = true;
  let activeJobs = 0;

  logger.info("Starting Slack notification queue worker", {
    pollIntervalMs,
    maxConcurrent,
  });

  const processLoop = async (): Promise<void> => {
    while (running) {
      // Wait if at max concurrency
      if (activeJobs >= maxConcurrent) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      try {
        activeJobs++;
        await slackNotificationQueue.process(processNotificationJob(handler));
      } finally {
        activeJobs--;
      }

      // Small delay between processing attempts
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  // Start multiple concurrent workers
  const workers = Array.from({ length: maxConcurrent }, () => processLoop());

  // Don't await - let them run in background
  Promise.all(workers).catch((error) => {
    logger.error("Slack notification queue worker error", {
      error: error instanceof Error ? error.message : "Unknown error",
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
export const getSlackNotificationQueueStats = async (): Promise<{
  pending: number;
  processing: number;
  dead: number;
}> => slackNotificationQueue.getStats();
