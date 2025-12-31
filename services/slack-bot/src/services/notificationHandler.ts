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
  findChannelForRepository,
  findByGitHubInstallation,
  UI_EMOJI,
  SLACK_COLORS,
  type SlackNotificationPayload,
  type ConsolidatedCIFailurePayload,
  type ActionResultPayload,
  type SystemAlertPayload,
} from "@kenchi/shared";
import { postConsolidatedMessage } from "./messageService.js";
import type { ConsolidatedMessageRequest } from "../types/slackTypes.js";
import { getSlackClientForTenant, isMultiTenantEnabled } from "./tenantSlackClient.js";
import { storeAnalysisContext } from "./analysisContextStore.js";

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
  repository: string
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
  payload: SystemAlertPayload
): Promise<HandlerResult> => {
  const { severity, title, message, details, repository, installationId } = payload;

  logger.info("Processing system alert notification", {
    severity,
    title,
    repository,
  });

  // Try to find a channel for this alert
  const channelId = await findAlertChannel(installationId, repository);

  if (!channelId) {
    // No channel configured - log and succeed (alerts still go to monitoring)
    logger.info("System alert logged (no channel configured)", {
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

    logger.info("System alert posted to Slack", {
      severity,
      title,
      channelId,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
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
export const createNotificationHandler =
  (defaultClient: WebClient): ((payload: SlackNotificationPayload) => Promise<HandlerResult>) =>
  async (payload: SlackNotificationPayload): Promise<HandlerResult> => {
    const startTime = Date.now();

    try {
      // Get appropriate client
      const client = await getClientForNotification(defaultClient, payload.installationId);

      // Route to appropriate handler based on type
      const handlers: Record<
        SlackNotificationPayload["type"],
        (slackClient: WebClient, notification: SlackNotificationPayload) => Promise<HandlerResult>
      > = {
        consolidated_ci_failure: (slackClient, notification) =>
          handleConsolidatedCIFailure(slackClient, notification as ConsolidatedCIFailurePayload),
        action_result: (slackClient, notification) =>
          handleActionResult(slackClient, notification as ActionResultPayload),
        system_alert: (slackClient, notification) =>
          handleSystemAlert(slackClient, notification as SystemAlertPayload),
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
