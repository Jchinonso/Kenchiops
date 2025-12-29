/**
 * Notification Handler Service
 *
 * Processes Slack notifications from the message queue.
 * Provides reliable delivery with proper error handling.
 */

import type { WebClient } from "@slack/web-api";
import {
  logger,
  getErrorMessage,
  type SlackNotificationPayload,
  type ConsolidatedCIFailurePayload,
  type ActionResultPayload,
  type SystemAlertPayload,
} from "@kenchi/shared";
import { postConsolidatedMessage } from "./messageService.js";
import type { ConsolidatedMessageRequest } from "../types/slackTypes.js";
import { getSlackClientForTenant, isMultiTenantEnabled } from "./tenantSlackClient.js";

// ==================== Types ====================

/**
 * Handler result
 */
interface HandlerResult {
  readonly success: boolean;
  readonly error?: string;
}

// ==================== Handler Functions ====================

/**
 * Handle consolidated CI failure notification
 */
const handleConsolidatedCIFailure = async (
  client: WebClient,
  payload: ConsolidatedCIFailurePayload
): Promise<HandlerResult> => {
  const { aggregation, slackPayload } = payload;

  logger.info("Processing consolidated CI failure notification", {
    repository: aggregation.repository.fullName,
    commitSha: aggregation.commitSha.substring(0, 7),
    failureCount: aggregation.failures.length,
  });

  // Build metadata from aggregation for type safety
  const metadata: ConsolidatedMessageRequest["payload"]["metadata"] = {
    repository: aggregation.repository.fullName,
    commitSha: aggregation.commitSha,
    failureCount: aggregation.failures.length,
    checkNames: aggregation.failures.map((failure) => failure.checkName),
    avgConfidence:
      aggregation.failures.length > 0
        ? aggregation.failures.reduce((sum, failure) => sum + failure.confidence, 0) /
          aggregation.failures.length
        : 0,
    isConsolidated: true,
  };

  const request: ConsolidatedMessageRequest = {
    consolidated: true,
    payload: {
      blocks: [...slackPayload.blocks] as ConsolidatedMessageRequest["payload"]["blocks"],
      text: slackPayload.text,
      metadata,
    },
    repository: aggregation.repository.fullName,
    installation_id: aggregation.installationId,
    commit_sha: aggregation.commitSha,
    failure_count: aggregation.failures.length,
  };

  const result = await postConsolidatedMessage(client, request);

  if (result.status === "error") {
    return { success: false, error: result.error };
  }

  return { success: true };
};

/**
 * Handle action result notification
 */
const handleActionResult = async (
  client: WebClient,
  payload: ActionResultPayload
): Promise<HandlerResult> => {
  const { actionId, actionType, success, message, channelId, threadTs } = payload;

  logger.info("Processing action result notification", {
    actionId,
    actionType,
    success,
  });

  // If we have a specific channel and thread, post there
  if (channelId) {
    try {
      const emoji = success ? "✅" : "❌";
      const statusText = success ? "completed" : "failed";

      await client.chat.postMessage({
        channel: channelId,
        text: `${emoji} Action *${actionType}* ${statusText}: ${message}`,
        ...(threadTs && { thread_ts: threadTs }),
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  // No specific channel - just log it
  logger.info("Action result processed (no channel specified)", {
    actionId,
    actionType,
    success,
    message,
  });

  return { success: true };
};

/**
 * Handle system alert notification
 */
const handleSystemAlert = async (
  client: WebClient,
  payload: SystemAlertPayload
): Promise<HandlerResult> => {
  const { severity, title, message, details } = payload;

  logger.info("Processing system alert notification", {
    severity,
    title,
  });

  // System alerts could be posted to a dedicated ops channel
  // For now, just log them
  logger.warn("System alert received", {
    severity,
    title,
    message,
    details,
  });

  // TODO: Post to a configured alerts channel when available

  return { success: true };
};

// ==================== Main Handler ====================

/**
 * Get the appropriate Slack client for a notification
 */
const getClientForNotification = async (
  defaultClient: WebClient,
  installationId: number
): Promise<WebClient> => {
  if (!isMultiTenantEnabled()) {
    return defaultClient;
  }

  try {
    return await getSlackClientForTenant(installationId);
  } catch (error) {
    logger.warn("Failed to get tenant-specific client, using default", {
      installationId,
      error: getErrorMessage(error),
    });
    return defaultClient;
  }
};

/**
 * Creates a notification handler function for the queue worker
 */
export const createNotificationHandler = (
  defaultClient: WebClient
): ((payload: SlackNotificationPayload) => Promise<HandlerResult>) => {
  return async (payload: SlackNotificationPayload): Promise<HandlerResult> => {
    const startTime = Date.now();

    try {
      // Get appropriate client
      const client = await getClientForNotification(defaultClient, payload.installationId);

      // Route to appropriate handler based on type
      const handlers: Record<
        SlackNotificationPayload["type"],
        (client: WebClient, payload: SlackNotificationPayload) => Promise<HandlerResult>
      > = {
        consolidated_ci_failure: (c, p) =>
          handleConsolidatedCIFailure(c, p as ConsolidatedCIFailurePayload),
        action_result: (c, p) => handleActionResult(c, p as ActionResultPayload),
        system_alert: (c, p) => handleSystemAlert(c, p as SystemAlertPayload),
      };

      const handler = handlers[payload.type];
      if (!handler) {
        return { success: false, error: `Unknown notification type: ${payload.type}` };
      }

      const result = await handler(client, payload);
      const duration = Date.now() - startTime;

      logger.info("Notification processed", {
        type: payload.type,
        repository: payload.repository,
        success: result.success,
        duration,
      });

      return result;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      const duration = Date.now() - startTime;

      logger.error("Notification handler error", {
        type: payload.type,
        repository: payload.repository,
        error: errorMsg,
        duration,
      });

      return { success: false, error: errorMsg };
    }
  };
};
