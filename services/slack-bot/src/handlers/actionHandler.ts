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
  updateActionProposalStatus,
  getErrorMessage,
  parseOpaqueActionValue,
  retrieveActionPayload,
  deleteActionPayload,
  type ActionExecutionContext,
  type ActionType,
  type StoredActionPayload,
  type OpaqueActionValue,
} from "@kenchi/shared";
import { formatProgressUpdate } from "../formatters.js";

// Type for Slack blocks compatible with Bolt
type SlackBlocks = NonNullable<SayArguments["blocks"]>;

const logger = createLogger("slack-bot");

// ==================== Types ====================

/**
 * Legacy action value format (for backward compatibility with old buttons)
 */
interface LegacyActionValue {
  readonly eventId?: string;
  readonly actionId: string;
  readonly actionType?: string;
  readonly repository?: string;
  readonly commitSha?: string;
  readonly installationId?: number;
  readonly priority?: string | number;
  readonly checkRunId?: number;
  readonly description?: string;
}

// ==================== Helper Functions ====================

/**
 * Type guard for legacy action value format
 */
const isLegacyActionValue = (value: unknown): value is LegacyActionValue =>
  typeof value === "object" &&
  value !== null &&
  "actionId" in value &&
  typeof (value as LegacyActionValue).actionId === "string";

/**
 * Parses a JSON action value string.
 */
const parseActionValueJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new ValidationError(`Failed to parse action value: ${getErrorMessage(error)}`);
  }
};

/**
 * Parses and retrieves action payload from Slack button action.
 * Handles both new opaque ID format and legacy full payload format.
 *
 * @returns The stored action payload (retrieved from store or legacy value)
 */
const getActionPayload = (action: ButtonAction): StoredActionPayload => {
  if (!action.value) {
    throw new ValidationError("Action value is missing");
  }

  let opaqueValue: OpaqueActionValue | null = null;
  try {
    opaqueValue = parseOpaqueActionValue(action.value);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
  }

  if (opaqueValue) {
    return retrieveActionPayload(opaqueValue);
  }

  const parsed = parseActionValueJson(action.value);

  // Legacy format - convert to StoredActionPayload shape
  if (isLegacyActionValue(parsed)) {
    return {
      actionType: parsed.actionType ?? "manual_investigation",
      description: parsed.description ?? "Legacy action",
      repository: parsed.repository ?? "unknown",
      commitSha: parsed.commitSha ?? "unknown",
      installationId: parsed.installationId ?? 0,
      priority: parsed.priority ?? "medium",
      checkRunId: parsed.checkRunId,
      createdAt: Date.now(),
      verificationToken: "legacy",
    };
  }

  throw new ValidationError("Unknown action value format");
};

/**
 * Extracts the opaque action ID from the action value (for cleanup).
 */
const extractOpaqueId = (action: ButtonAction): string | null => {
  if (!action.value) {
    return null;
  }
  try {
    const opaqueValue = parseOpaqueActionValue(action.value);
    return opaqueValue.id;
  } catch (error) {
    logger.debug("Failed to parse action value for opaque id", {
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Creates execution context from stored action payload
 */
const createExecutionContext = (
  payload: StoredActionPayload,
  approvedBy: string
): ActionExecutionContext => ({
  installationId: payload.installationId,
  repository: payload.repository,
  commitSha: payload.commitSha,
  checkRunId: payload.checkRunId,
  approvedBy,
  metadata: {
    priority: payload.priority,
    description: payload.description,
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
  } catch (error) {
    logger.debug("Redis health check failed, using sync execution", {
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Persists action status to database (non-blocking, logs errors)
 */
const persistActionStatus = async (
  actionId: string,
  status: "approved" | "rejected" | "executed" | "failed",
  approvedBy?: string,
  executionResult?: Record<string, unknown>
): Promise<void> => {
  try {
    await updateActionProposalStatus({
      actionId,
      status,
      approvedBy,
      executionResult,
    });
    logger.debug("Action status persisted", { actionId, status });
  } catch (error) {
    logger.warn("Failed to persist action status", {
      actionId,
      status,
      error: getErrorMessage(error),
    });
  }
};

// ==================== Action Handlers ====================

/**
 * Executes an action after retrieval from store.
 * Handles both async (Redis queue) and sync execution.
 */
const executeStoredAction = async (
  payload: StoredActionPayload,
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

/**
 * Handles action approval.
 * Retrieves payload from server-side store and executes the action.
 */
export const handleActionApproval = async (
  action: ButtonAction,
  ack: () => Promise<void>,
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
  ack: () => Promise<void>,
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
          text: `⚠️ *Confirm Action: ${payload.actionType}*\n\n${payload.description}\n\nRepository: \`${payload.repository}\``,
        },
      },
      {
        type: "actions",
        block_id: "action_confirmation_block",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Confirm & Execute", emoji: true },
            style: "primary",
            value: action.value, // Pass through the same opaque value
            action_id: `execute_confirmed_${slackActionId.replace("confirm_action_", "")}`,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "❌ Cancel", emoji: true },
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
  ack: () => Promise<void>,
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
