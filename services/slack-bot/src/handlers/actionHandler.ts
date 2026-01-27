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
  // Safety features
  checkRestrictions,
  assessActionRisk,
  recordActionProposal,
  recordRestrictionApplied,
  recordRiskAssessment,
  type SafetyRequestContext,
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
 * Includes safety checks: restrictions and risk assessment.
 */
const executeStoredAction = async (
  payload: Awaited<ReturnType<typeof getActionPayload>>,
  opaqueId: string | null,
  say: SayFn,
  messageTs?: string
): Promise<void> => {
  const actionId = opaqueId ?? `legacy_${payload.commitSha.substring(0, 8)}`;

  // Build safety request context for audit logging
  const safetyContext: SafetyRequestContext = {
    requestId: actionId,
    tenantId: payload.repository.split("/")[0] ?? "unknown",
    actor: "slack-user",
  };

  // Check time-based restrictions before executing
  const restrictionCheck = checkRestrictions({ actionType: payload.actionType });
  if (!restrictionCheck.isAllowed) {
    logger.warn("Action blocked by restriction", {
      actionId,
      actionType: payload.actionType,
      reason: restrictionCheck.reason,
      restrictedUntil: restrictionCheck.restrictedUntil?.toISOString(),
    });

    // Record restriction in audit log
    const restriction = restrictionCheck.activeRestrictions[0];
    if (restriction) {
      await recordRestrictionApplied(
        restriction.type,
        restriction.name,
        payload.actionType,
        safetyContext
      );
    }

    const restrictedBlocks = formatProgressUpdate(
      actionId,
      "failed",
      `Action *${payload.actionType}* blocked: ${restrictionCheck.reason}`
    );

    await say({
      blocks: restrictedBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    return;
  }

  // Create action proposal from stored payload
  const actionProposal = {
    id: actionId,
    eventId: `evt_${payload.commitSha.substring(0, 8)}`,
    actionType: payload.actionType as ActionType,
    description: payload.description,
    confidence: 0.8,
    safetyLevel: "low_risk" as const, // Will be updated after risk assessment
    requiresApproval: true,
    status: "approved" as const,
  };

  // Assess risk of the action
  const riskAssessment = assessActionRisk(actionProposal);

  // Update safety level based on risk assessment
  const safetyLevel: "high_risk" | "low_risk" =
    riskAssessment.score >= 0.7 ? "high_risk" : "low_risk";
  const finalActionProposal = { ...actionProposal, safetyLevel };

  // Record risk assessment in audit log
  await recordRiskAssessment(
    payload.actionType,
    riskAssessment.score,
    riskAssessment.summary,
    safetyContext
  );

  if (riskAssessment.score >= 0.8) {
    logger.warn("High-risk action detected", {
      actionId,
      actionType: payload.actionType,
      riskScore: riskAssessment.score,
      summary: riskAssessment.summary,
    });
  }

  // Record action proposal in audit log
  await recordActionProposal(payload.actionType, 0.8, "allowed", safetyContext);

  const context = createExecutionContext(payload, "slack-user");
  const useAsync = await canUseAsyncExecution();

  if (useAsync) {
    // Async execution via Redis queue
    const inProgressBlocks = formatProgressUpdate(
      finalActionProposal.id,
      "in_progress",
      `Queued *${payload.actionType}* for execution...`
    );

    await say({
      blocks: inProgressBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    await enqueueAction(finalActionProposal, context);
    await persistActionStatus(finalActionProposal.id, "approved", "slack-user");

    logger.info("Action enqueued for async execution", {
      actionId: finalActionProposal.id,
      actionType: payload.actionType,
    });

    const queuedBlocks = formatProgressUpdate(
      finalActionProposal.id,
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
      finalActionProposal.id,
      "in_progress",
      `Executing *${payload.actionType}*...`
    );

    await say({
      blocks: inProgressBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    const result = await executeAction(finalActionProposal, context);
    const executionStatus = result.success ? "executed" : "failed";
    await persistActionStatus(finalActionProposal.id, executionStatus, "slack-user", {
      success: result.success,
      message: result.message,
      duration: result.duration,
    });

    const { status, text } = formatResultMessage(
      result.success,
      payload.actionType,
      result.message
    );
    const completedBlocks = formatProgressUpdate(finalActionProposal.id, status, text);

    await say({
      blocks: completedBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    logger.info("Action executed synchronously", {
      actionId: finalActionProposal.id,
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
 * Logs the rejection, records audit entry, cleans up stored payload, and updates the message.
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

    // Build safety request context for audit logging
    const safetyContext: SafetyRequestContext = {
      requestId: displayId,
      tenantId: payload.repository.split("/")[0] ?? "unknown",
      actor: "slack-user",
    };

    // Record rejection in audit log
    await recordActionProposal(actionType, 0.8, "blocked", safetyContext);

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
