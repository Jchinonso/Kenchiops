/**
 * Handlers for Slack action button interactions.
 * Processes approve/reject actions and feedback buttons.
 */

import type { ButtonAction, SayFn, SayArguments } from "@slack/bolt";
import { createLogger, UI_CONSTANTS } from "@kenchi/shared";
import { formatProgressUpdate } from "../formatters.js";
import type { SlackActionValue } from "../types/slackTypes.js";

// Type for Slack blocks compatible with Bolt
type SlackBlocks = NonNullable<SayArguments["blocks"]>;

const logger = createLogger("slack-bot");

/**
 * Parses action value from Slack button action.
 */
const parseActionValue = (action: ButtonAction): SlackActionValue => {
  if (!action.value) {
    throw new Error("Action value is missing");
  }
  try {
    return JSON.parse(action.value) as SlackActionValue;
  } catch (error) {
    throw new Error(
      `Failed to parse action value: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

/**
 * Handles action approval.
 */
export const handleActionApproval = async (
  action: ButtonAction,
  ack: () => Promise<void>,
  say: SayFn | undefined,
  messageTs?: string
): Promise<void> => {
  await ack();

  const actionId = action.action_id;
  logger.info("Action approved", { action_id: actionId });

  try {
    const value = parseActionValue(action);

    if (!say) {
      logger.warn("Say function not available for action approval");
      return;
    }

    const inProgressBlocks = formatProgressUpdate(
      value.actionId,
      "in_progress",
      "Action approved and executing..."
    );

    await say({
      blocks: inProgressBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
    });

    // TODO: Execute the actual action here
    // For now, just mark as completed after timeout
    setTimeout(async () => {
      if (say) {
        const completedBlocks = formatProgressUpdate(
          value.actionId,
          "completed",
          "Action completed successfully"
        );

        await say({
          blocks: completedBlocks as SlackBlocks,
          ...(messageTs && { thread_ts: messageTs }),
        });
      }
    }, UI_CONSTANTS.ACTION_TIMEOUT_MS);
  } catch (error) {
    logger.error("Error handling action approval", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

/**
 * Handles action rejection.
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

    const rejectedBlocks = formatProgressUpdate(
      value.actionId,
      "failed",
      "Action rejected by user"
    );

    await say({
      blocks: rejectedBlocks as SlackBlocks,
      ...(messageTs && { thread_ts: messageTs }),
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
