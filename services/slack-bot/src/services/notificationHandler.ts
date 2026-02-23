/**
 * Notification Handler Service
 *
 * Processes Slack notifications from the message queue.
 * Provides reliable delivery with proper error handling.
 */

import type { WebClient } from "@slack/web-api";
import crypto from "crypto";
import {
  createLogger,
  getErrorMessage,
  findChannelForRepository,
  findByGitHubInstallation,
  UI_EMOJI,
  SLACK_COLORS,
  type SlackNotificationPayload,
  type ConsolidatedCIFailurePayload,
  type ActionResultPayload,
  type SystemAlertPayload,
  type RequestContext,
} from "@kenchi/shared";
import { postConsolidatedMessage } from "./messageService.js";
import type { ConsolidatedMessageRequest } from "../types/slackTypes.js";
import { getSlackClientForTenant, isMultiTenantEnabled } from "./tenantSlackClient.js";
import { storeAnalysisContext } from "./analysisContextStore.js";
import type { HandlerResult } from "./notificationHandlerTypes.js";

const logger = createLogger("notification-handler");

// ==================== Context Builder ====================

/**
 * Build RequestContext for a notification payload.
 * Resolves tenantId from the GitHub installation ID.
 */
const buildNotificationContext = async (
  payload: SlackNotificationPayload
): Promise<RequestContext> => {
  const requestId = crypto.randomUUID();

  try {
    const tenant = await findByGitHubInstallation(payload.installationId);
    return {
      requestId,
      tenantId: tenant?.id ?? "system",
      actor: "notification-worker",
    };
  } catch {
    return {
      requestId,
      tenantId: "system",
      actor: "notification-worker",
    };
  }
};

// ==================== Handler Functions ====================

/**
 * Handle consolidated CI failure notification
 */
const handleConsolidatedCIFailure = async (
  client: WebClient,
  payload: ConsolidatedCIFailurePayload,
  context: RequestContext
): Promise<HandlerResult> => {
  const { aggregation, slackPayload } = payload;
  logger.info("Processing consolidated CI failure notification", {
    ...context,
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

  // Store analysis context for later lesson extraction on positive feedback
  if (result.channel && result.timestamp) {
    storeAnalysisContext(aggregation, result.channel, result.timestamp);
  }

  return { success: true };
};

/**
 * Handle action result notification
 */
const handleActionResult = async (
  client: WebClient,
  payload: ActionResultPayload,
  context: RequestContext
): Promise<HandlerResult> => {
  const { actionId, actionType, success, message, channelId, threadTs } = payload;

  logger.info("Processing action result notification", {
    ...context,
    actionId,
    actionType,
    success,
  });

  // If we have a specific channel and thread, post there
  if (channelId) {
    const startTime = Date.now();
    try {
      const emoji = success ? "✅" : "❌";
      const statusText = success ? "completed" : "failed";

      await client.chat.postMessage({
        channel: channelId,
        text: `${emoji} Action *${actionType}* ${statusText}: ${message}`,
        ...(threadTs && { thread_ts: threadTs }),
      });

      const durationMs = Date.now() - startTime;
      logger.info("Action result posted to Slack", {
        ...context,
        provider: "slack",
        operation: "postMessage",
        durationMs,
        channelId,
      });

      return { success: true };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Failed to post action result to Slack", {
        ...context,
        provider: "slack",
        operation: "postMessage",
        durationMs,
        channelId,
        error: getErrorMessage(error),
      });
      return { success: false, error: getErrorMessage(error) };
    }
  }

  // No specific channel - just log it
  logger.info("Action result processed (no channel specified)", {
    ...context,
    actionId,
    actionType,
    success,
    message,
  });

  return { success: true };
};

/**
 * Severity emoji mapping for system alerts using UI_EMOJI constants
 */
const SEVERITY_EMOJI: Record<SystemAlertPayload["severity"], string> = {
  info: UI_EMOJI.info,
  warning: UI_EMOJI.warning,
  error: UI_EMOJI.failure,
  critical: UI_EMOJI.alert,
} as const;

/**
 * Severity color mapping for system alerts using SLACK_COLORS
 */
const SEVERITY_COLOR: Record<SystemAlertPayload["severity"], string> = {
  info: SLACK_COLORS.INFO,
  warning: SLACK_COLORS.WARNING,
  error: SLACK_COLORS.DANGER,
  critical: SLACK_COLORS.DANGER,
} as const;

/**
 * Formats system alert details as a readable string
 */
const formatAlertDetails = (details?: Record<string, unknown>): string => {
  if (!details || Object.keys(details).length === 0) {
    return "";
  }

  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `• *${key}*: ${String(value)}`)
    .join("\n");
};

/**
 * Looks up channel for system alert based on installation ID and repository.
 */
const findAlertChannel = async (
  installationId: number,
  repository: string,
  context: RequestContext
): Promise<string | null> => {
  // Skip lookup for system-level alerts
  if (repository === "system" || installationId === 0) {
    return null;
  }

  try {
    const tenant = await findByGitHubInstallation(installationId);
    if (!tenant) {
      return null;
    }

    const mapping = await findChannelForRepository(tenant.id, repository);
    return mapping?.slackChannelId ?? null;
  } catch (error) {
    logger.warn("Failed to lookup alert channel", {
      ...context,
      installationId,
      repository,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Handle system alert notification
 */
const handleSystemAlert = async (
  client: WebClient,
  payload: SystemAlertPayload,
  context: RequestContext
): Promise<HandlerResult> => {
  const { severity, title, message, details, repository, installationId } = payload;

  logger.info("Processing system alert notification", {
    ...context,
    severity,
    title,
    repository,
  });

  // Try to find a channel for this alert
  const channelId = await findAlertChannel(installationId, repository, context);

  if (!channelId) {
    // No channel configured - log and succeed (alerts still go to monitoring)
    logger.info("System alert logged (no channel configured)", {
      ...context,
      severity,
      title,
      message,
      repository,
      details,
    });
    return { success: true };
  }

  // Build formatted alert message
  const emoji = SEVERITY_EMOJI[severity];
  const color = SEVERITY_COLOR[severity];
  const formattedDetails = formatAlertDetails(details);

  // Build message text parts
  const headerText = `*${title}*\n\n${message}`;
  const detailsText = formattedDetails ? `*Details:*\n${formattedDetails}` : null;
  const contextText = `Severity: *${severity.toUpperCase()}* | Repository: \`${repository}\``;

  const startTime = Date.now();
  try {
    await client.chat.postMessage({
      channel: channelId,
      text: `${emoji} ${title}`,
      attachments: [
        {
          color,
          fallback: `${title}: ${message}`,
          blocks: [
            {
              type: "section" as const,
              text: {
                type: "mrkdwn" as const,
                text: headerText,
              },
            },
            ...(detailsText
              ? [
                  {
                    type: "section" as const,
                    text: {
                      type: "mrkdwn" as const,
                      text: detailsText,
                    },
                  },
                ]
              : []),
            {
              type: "context" as const,
              elements: [
                {
                  type: "mrkdwn" as const,
                  text: contextText,
                },
              ],
            },
          ],
        },
      ],
    });

    const durationMs = Date.now() - startTime;
    logger.info("System alert posted to Slack", {
      ...context,
      provider: "slack",
      operation: "postMessage",
      durationMs,
      severity,
      title,
      channelId,
    });

    return { success: true };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error("Failed to post system alert to Slack", {
      ...context,
      provider: "slack",
      operation: "postMessage",
      durationMs,
      channelId,
      error: getErrorMessage(error),
    });
    return { success: false, error: getErrorMessage(error) };
  }
};

// ==================== Main Handler ====================

/**
 * Get the appropriate Slack client for a notification
 */
const getClientForNotification = async (
  defaultClient: WebClient,
  installationId: number,
  context: RequestContext
): Promise<WebClient> => {
  if (!isMultiTenantEnabled()) {
    return defaultClient;
  }

  try {
    return await getSlackClientForTenant(installationId);
  } catch (error) {
    logger.warn("Failed to get tenant-specific client, using default", {
      ...context,
      installationId,
      error: getErrorMessage(error),
    });
    return defaultClient;
  }
};

/**
 * Creates a notification handler function for the queue worker
 */
export const createNotificationHandler =
  (defaultClient: WebClient): ((payload: SlackNotificationPayload) => Promise<HandlerResult>) =>
  async (payload: SlackNotificationPayload): Promise<HandlerResult> => {
    const startTime = Date.now();
    const context = await buildNotificationContext(payload);

    try {
      // Get appropriate client
      const client = await getClientForNotification(defaultClient, payload.installationId, context);

      // Route to appropriate handler based on type
      const handlers: Record<
        SlackNotificationPayload["type"],
        (
          slackClient: WebClient,
          notification: SlackNotificationPayload,
          ctx: RequestContext
        ) => Promise<HandlerResult>
      > = {
        consolidated_ci_failure: (slackClient, notification, ctx) =>
          handleConsolidatedCIFailure(
            slackClient,
            notification as ConsolidatedCIFailurePayload,
            ctx
          ),
        action_result: (slackClient, notification, ctx) =>
          handleActionResult(slackClient, notification as ActionResultPayload, ctx),
        system_alert: (slackClient, notification, ctx) =>
          handleSystemAlert(slackClient, notification as SystemAlertPayload, ctx),
      };

      const handler = handlers[payload.type];
      if (!handler) {
        return { success: false, error: `Unknown notification type: ${payload.type}` };
      }

      const result = await handler(client, payload, context);
      const durationMs = Date.now() - startTime;

      logger.info("Notification processed", {
        ...context,
        type: payload.type,
        repository: payload.repository,
        success: result.success,
        durationMs,
      });

      return result;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      const durationMs = Date.now() - startTime;

      logger.error("Notification handler error", {
        ...context,
        type: payload.type,
        repository: payload.repository,
        error: errorMsg,
        durationMs,
      });

      return { success: false, error: errorMsg };
    }
  };
