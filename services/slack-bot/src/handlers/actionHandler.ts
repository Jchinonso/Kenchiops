/**
 * Handlers for Slack action button interactions.
 * Processes approve/reject actions for CI failure recommended actions.
 * Uses the action executor from @kenchi/shared for safe action execution.
 */

import type { ButtonAction, SayFn, SayArguments } from "@slack/bolt";
import {
  createLogger,
  ValidationError,
  executeAction,
  enqueueAction,
  isRedisHealthy,
  SLACK_BOT_TIMEOUTS,
  SLACK_BOT_MESSAGES,
  type ActionExecutionContext,
  type ActionType,
} from "@kenchi/shared";
import { formatProgressUpdate } from "../formatters.js";

// Type for Slack blocks compatible with Bolt
type SlackBlocks = NonNullable<SayArguments["blocks"]>;

const logger = createLogger("slack-bot");

// ==================== Types ====================

/**
 * Action button value payload (matches slackPayloadFormatter.ts)
 */
interface ActionButtonValue {
  readonly actionId: string;
  readonly actionType: string;
  readonly description: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly priority: string | number;
  readonly checkRunId?: number;
}

/**
 * Legacy action value format (for backward compatibility)
 */
interface LegacyActionValue {
  readonly eventId: string;
  readonly actionId: string;
}

/**
 * Combined action value type
 */
type ParsedActionValue = ActionButtonValue | LegacyActionValue;

// ==================== Helper Functions ====================

/**
 * Type guard for new action value format
 */
const isActionButtonValue = (value: ParsedActionValue): value is ActionButtonValue =>
  "actionType" in value && "repository" in value;

/**
 * Parses action value from Slack button action.
 * Handles both new and legacy formats.
 */
const parseActionValue = (action: ButtonAction): ParsedActionValue => {
  if (!action.value) {
    throw new ValidationError("Action value is missing");
  }
  try {
    return JSON.parse(action.value) as ParsedActionValue;
  } catch (error) {
    throw new ValidationError(
      `Failed to parse action value: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

/**
 * Creates execution context from action button value
 */
const createExecutionContext = (
  value: ActionButtonValue,
  approvedBy: string
): ActionExecutionContext => ({
  installationId: value.installationId,
  repository: value.repository,
  commitSha: value.commitSha,
  checkRunId: value.checkRunId,
  approvedBy,
  metadata: {
    priority: value.priority,
    description: value.description,
  },
});

/**
 * Format action result message based on success/failure
 */
const formatResultMessage = (
  success: boolean,
  actionType: string,
  message: string
): { status: "completed" | "failed"; text: string } => ({
  status: success ? "completed" : "failed",
  text: success
    ? `Action *${actionType}* executed successfully: ${message}`
    : `Action *${actionType}* failed: ${message}`,
});

/**
 * Check if async execution via Redis is available
 */
const canUseAsyncExecution = async (): Promise<boolean> => {
  try {
    return await isRedisHealthy();
  } catch {
    return false;
  }
};

// ==================== Action Handlers ====================

/**
 * Handles action approval.
 * Executes the action using the shared executor and reports result.
 */
export const handleActionApproval = async (
  action: ButtonAction,
  ack: () => Promise<void>,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> => {
  await ack();

  const actionId = action.action_id;
  logger.info("Action approval received", { action_id: actionId });

  try {
    const value = parseActionValue(action);

    if (!say) {
      logger.warn("Say function not available for action approval");
      return;
    }

    // Handle new action button value format
    if (isActionButtonValue(value)) {
      // Create action proposal
      const actionProposal = {
        id: value.actionId,
        eventId: `evt_${value.commitSha.substring(0, 8)}`,
        actionType: value.actionType as ActionType,
        description: value.description,
        confidence: 0.8, // Default confidence for approved actions
        safetyLevel: "low_risk" as const,
        requiresApproval: true,
        status: "approved" as const,
      };

      // Create execution context
      const context = createExecutionContext(value, "slack-user");

      // Check if async execution is available
      const useAsync = await canUseAsyncExecution();

      if (useAsync) {
        // Async execution via Redis queue
        const inProgressBlocks = formatProgressUpdate(
          value.actionId,
          "in_progress",
          `Queued *${value.actionType}* for execution...`
        );

        await say({
          blocks: inProgressBlocks as SlackBlocks,
          ...(messageTs && { thread_ts: messageTs }),
        });

        await enqueueAction(actionProposal, context);

        logger.info("Action enqueued for async execution", {
          actionId: value.actionId,
          actionType: value.actionType,
        });

        // Note: Result will be published via pub/sub when processed
        // For now, acknowledge the queue submission
        const queuedBlocks = formatProgressUpdate(
          value.actionId,
          "completed",
          `Action *${value.actionType}* queued for processing`
        );

        await say({
          blocks: queuedBlocks as SlackBlocks,
          ...(messageTs && { thread_ts: messageTs }),
        });
      } else {
        // Sync execution (fallback when Redis unavailable)
        const inProgressBlocks = formatProgressUpdate(
          value.actionId,
          "in_progress",
          `Executing *${value.actionType}*...`
        );

        await say({
          blocks: inProgressBlocks as SlackBlocks,
          ...(messageTs && { thread_ts: messageTs }),
        });

        const result = await executeAction(actionProposal, context);

        // Send completion update
        const { status, text } = formatResultMessage(
          result.success,
          value.actionType,
          result.message
        );

        const completedBlocks = formatProgressUpdate(value.actionId, status, text);

        await say({
          blocks: completedBlocks as SlackBlocks,
          ...(messageTs && { thread_ts: messageTs }),
        });

        logger.info("Action executed synchronously", {
          actionId: value.actionId,
          actionType: value.actionType,
          success: result.success,
          duration: result.duration,
        });
      }
    } else {
      // Legacy format handling
      const inProgressBlocks = formatProgressUpdate(
        value.actionId,
        "in_progress",
        SLACK_BOT_MESSAGES.LEGACY_ACTION_IN_PROGRESS
      );

      await say({
        blocks: inProgressBlocks as SlackBlocks,
        ...(messageTs && { thread_ts: messageTs }),
      });

      // Legacy: just mark as completed after timeout
      setTimeout(async () => {
        try {
          const completedBlocks = formatProgressUpdate(
            value.actionId,
            "completed",
            SLACK_BOT_MESSAGES.LEGACY_ACTION_COMPLETED
          );

          await say({
            blocks: completedBlocks as SlackBlocks,
            ...(messageTs && { thread_ts: messageTs }),
          });
        } catch (timeoutError) {
          logger.error("Error sending completion message", {
            error: timeoutError instanceof Error ? timeoutError.message : "Unknown error",
          });
        }
      }, SLACK_BOT_TIMEOUTS.LEGACY_ACTION_TIMEOUT_MS);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.error("Error handling action approval", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (say) {
      try {
        const errorBlocks = formatProgressUpdate(
          actionId,
          "failed",
          `Action failed: ${errorMessage}`
        );

        await say({
          blocks: errorBlocks as SlackBlocks,
          ...(messageTs && { thread_ts: messageTs }),
        });
      } catch (sayError) {
        logger.error("Failed to send error message to Slack", {
          error: sayError instanceof Error ? sayError.message : "Unknown error",
        });
      }
    }
  }
};

/**
 * Handles action rejection.
 * Logs the rejection and updates the message.
 */
export const handleActionRejection = async (
  action: ButtonAction,
  ack: () => Promise<void>,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> => {
  await ack();

  const actionId = action.action_id;
  logger.info("Action rejected", { action_id: actionId });

  try {
    const value = parseActionValue(action);

    if (!say) {
      logger.warn("Say function not available for action rejection");
      return;
    }

    const displayId = isActionButtonValue(value) ? value.actionId : value.actionId;
    const actionType = isActionButtonValue(value) ? value.actionType : "action";

    const rejectedBlocks = formatProgressUpdate(
      displayId,
      "failed",
      `Action *${actionType}* dismissed by user`
    );

    await say({
      blocks: rejectedBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    logger.info("Action rejection handled", {
      actionId: displayId,
      actionType,
    });
  } catch (error) {
    logger.error("Error handling action rejection", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

/**
 * Handles positive feedback.
 */
export const handlePositiveFeedback = async (
  action: ButtonAction,
  ack: () => Promise<void>
): Promise<void> => {
  await ack();

  const eventId = action.value;
  logger.info("Positive feedback received", { event_id: eventId });

  // TODO: Store feedback in database/metrics
};

/**
 * Handles negative feedback.
 */
export const handleNegativeFeedback = async (
  action: ButtonAction,
  ack: () => Promise<void>
): Promise<void> => {
  await ack();

  const eventId = action.value;
  logger.info("Negative feedback received", { event_id: eventId });

  // TODO: Store feedback in database/metrics
};
