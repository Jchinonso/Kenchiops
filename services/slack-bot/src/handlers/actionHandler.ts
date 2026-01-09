/**
 * Action Handler
 *
 * Handlers for Slack action button interactions.
 * Processes approve/reject actions for CI failure recommended actions.
 * Uses the action executor from @kenchi/shared for safe action execution.
 *
 * This is the public API that re-exports from focused modules:
 * - actionHandlerTypes.ts: Types and type guards
 * - actionHandlerHelpers.ts: Helper functions
 */

import type { ButtonAction, SayFn } from "@slack/bolt";
import {
  createLogger,
  executeAction,
  enqueueAction,
  getErrorMessage,
  deleteActionPayload,
  type ActionType,
} from "@kenchi/shared";
import { formatProgressUpdate } from "../formatters.js";
import type { SlackBlocks, AckFn } from "./actionHandlerTypes.js";
import {
  getActionPayload,
  extractOpaqueId,
  createExecutionContext,
  formatResultMessage,
  canUseAsyncExecution,
  persistActionStatus,
} from "./actionHandlerHelpers.js";

// Re-export types for consumers
export type { SlackBlocks, LegacyActionValue, AckFn } from "./actionHandlerTypes.js";
export { isLegacyActionValue } from "./actionHandlerTypes.js";

const logger = createLogger("slack-bot");

// ==================== Internal Functions ====================

/**
 * Executes an action after retrieval from store.
 * Handles both async (Redis queue) and sync execution.
 */
const executeStoredAction = async (
  payload: Awaited<ReturnType<typeof getActionPayload>>,
  opaqueId: string | null,
  say: SayFn,
  messageTs?: string
): Promise<void> => {
  // Create action proposal from stored payload
  const actionProposal = {
    id: opaqueId ?? `legacy_${payload.commitSha.substring(0, 8)}`,
    eventId: `evt_${payload.commitSha.substring(0, 8)}`,
    actionType: payload.actionType as ActionType,
    description: payload.description,
    confidence: 0.8,
    safetyLevel: "low_risk" as const,
    requiresApproval: true,
    status: "approved" as const,
  };

  const context = createExecutionContext(payload, "slack-user");
  const useAsync = await canUseAsyncExecution();

  if (useAsync) {
    // Async execution via Redis queue
    const inProgressBlocks = formatProgressUpdate(
      actionProposal.id,
      "in_progress",
      `Queued *${payload.actionType}* for execution...`
    );

    await say({
      blocks: inProgressBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    await enqueueAction(actionProposal, context);
    await persistActionStatus(actionProposal.id, "approved", "slack-user");

    logger.info("Action enqueued for async execution", {
      actionId: actionProposal.id,
      actionType: payload.actionType,
    });

    const queuedBlocks = formatProgressUpdate(
      actionProposal.id,
      "completed",
      `Action *${payload.actionType}* queued for processing`
    );

    await say({
      blocks: queuedBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });
  } else {
    // Sync execution
    const inProgressBlocks = formatProgressUpdate(
      actionProposal.id,
      "in_progress",
      `Executing *${payload.actionType}*...`
    );

    await say({
      blocks: inProgressBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    const result = await executeAction(actionProposal, context);
    const executionStatus = result.success ? "executed" : "failed";
    await persistActionStatus(actionProposal.id, executionStatus, "slack-user", {
      success: result.success,
      message: result.message,
      duration: result.duration,
    });

    const { status, text } = formatResultMessage(
      result.success,
      payload.actionType,
      result.message
    );
    const completedBlocks = formatProgressUpdate(actionProposal.id, status, text);

    await say({
      blocks: completedBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    logger.info("Action executed synchronously", {
      actionId: actionProposal.id,
      actionType: payload.actionType,
      success: result.success,
      duration: result.duration,
    });
  }

  // Clean up stored payload after execution
  if (opaqueId) {
    deleteActionPayload(opaqueId);
  }
};

// ==================== Public Handlers ====================

/**
 * Handles action approval.
 * Retrieves payload from server-side store and executes the action.
 */
export const handleActionApproval = async (
  action: ButtonAction,
  ack: AckFn,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> => {
  await ack();

  const slackActionId = action.action_id;
  logger.info("Action approval received", { action_id: slackActionId });

  try {
    if (!say) {
      logger.warn("Say function not available for action approval");
      return;
    }

    // Retrieve payload from store (or parse legacy format)
    const payload = getActionPayload(action);
    const opaqueId = extractOpaqueId(action);

    logger.debug("Action payload retrieved", {
      actionType: payload.actionType,
      repository: payload.repository,
      opaqueId,
    });

    // Execute the action
    await executeStoredAction(payload, opaqueId, say, messageTs);
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    logger.error("Error handling action approval", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (say) {
      try {
        const errorBlocks = formatProgressUpdate(
          slackActionId,
          "failed",
          `Action failed: ${errorMessage}`
        );

        await say({
          blocks: errorBlocks as SlackBlocks,
          ...(messageTs && { thread_ts: messageTs }),
        });
      } catch (sayError) {
        logger.error("Failed to send error message to Slack", {
          error: getErrorMessage(sayError),
        });
      }
    }
  }
};

/**
 * Handles action confirmation request.
 * Shows a confirmation message before executing potentially dangerous actions.
 */
export const handleActionConfirmation = async (
  action: ButtonAction,
  ack: AckFn,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> => {
  await ack();

  const slackActionId = action.action_id;
  logger.info("Action confirmation requested", { action_id: slackActionId });

  try {
    if (!say) {
      logger.warn("Say function not available for action confirmation");
      return;
    }

    // Retrieve payload to show in confirmation
    const payload = getActionPayload(action);

    // Send confirmation prompt
    const confirmationBlocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Confirm Action: ${payload.actionType}*\n\n${payload.description}\n\nRepository: \`${payload.repository}\``,
        },
      },
      {
        type: "actions",
        block_id: "action_confirmation_block",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Confirm & Execute", emoji: true },
            style: "primary",
            value: action.value, // Pass through the same opaque value
            action_id: `execute_confirmed_${slackActionId.replace("confirm_action_", "")}`,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Cancel", emoji: true },
            style: "danger",
            value: action.value,
            action_id: `cancel_action_${slackActionId.replace("confirm_action_", "")}`,
          },
        ],
      },
    ];

    await say({
      blocks: confirmationBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    logger.info("Confirmation prompt sent", {
      actionType: payload.actionType,
      repository: payload.repository,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    logger.error("Error handling action confirmation", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (say) {
      try {
        await say({
          text: `Failed to show confirmation: ${errorMessage}`,
          ...(messageTs && { thread_ts: messageTs }),
        });
      } catch (sayError) {
        logger.error("Failed to send error message to Slack", {
          error: getErrorMessage(sayError),
        });
      }
    }
  }
};

/**
 * Handles action rejection.
 * Logs the rejection, cleans up stored payload, and updates the message.
 */
export const handleActionRejection = async (
  action: ButtonAction,
  ack: AckFn,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> => {
  await ack();

  const slackActionId = action.action_id;
  logger.info("Action rejected", { action_id: slackActionId });

  try {
    // Try to get payload for logging (may fail if already expired)
    const payload = getActionPayload(action);
    const opaqueId = extractOpaqueId(action);

    if (!say) {
      logger.warn("Say function not available for action rejection");
      return;
    }

    const displayId = opaqueId ?? `legacy_${payload.commitSha.substring(0, 8)}`;
    const { actionType } = payload;

    const rejectedBlocks = formatProgressUpdate(
      displayId,
      "failed",
      `Action *${actionType}* dismissed by user`
    );

    await say({
      blocks: rejectedBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    // Persist rejection status to database
    await persistActionStatus(displayId, "rejected", "slack-user");

    logger.info("Action rejection handled", {
      actionId: displayId,
      actionType,
    });
  } catch (error) {
    logger.error("Error handling action rejection", {
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};
