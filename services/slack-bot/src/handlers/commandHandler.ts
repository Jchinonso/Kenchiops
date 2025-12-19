/**
 * Handler for Slack slash commands.
 * Processes /kenchi commands and returns AI analysis.
 */

import type { SlashCommand, RespondFn, RespondArguments } from "@slack/bolt";
import { createLogger, type ActionProposal, type ActionType } from "@kenchi/shared";
import { formatAnalysisMessage, formatActionButtons, formatErrorMessage } from "../formatters.js";
import { createEventFromCommand, performAnalysis } from "../services/analysisService.js";
import type { SlackBlock } from "../types/slackTypes.js";

// Type for Slack blocks compatible with Bolt
type SlackBlocks = NonNullable<RespondArguments["blocks"]>;

const logger = createLogger("slack-bot");

/**
 * Handles /kenchi slash command.
 *
 * @param command - Slack command object
 * @param ack - Acknowledge function
 * @param respond - Respond function
 */
export const handleKenchiCommand = async (
  command: SlashCommand,
  ack: () => Promise<void>,
  respond: RespondFn
): Promise<void> => {
  await ack();

  logger.info("Slack command received", {
    command: command.text,
    user: command.user_id,
    channel: command.channel_id,
  });

  try {
    const event = createEventFromCommand(command.user_id, command.channel_id, command.text);

    const { analysis, confidence } = await performAnalysis(event);

    const blocks: SlackBlock[] = [...formatAnalysisMessage(analysis, confidence)];

    if (analysis.recommendedActions && analysis.recommendedActions.length > 0) {
      const actionProposals: ActionProposal[] = analysis.recommendedActions.map(
        (action, idx): ActionProposal => ({
          id: `action_${idx}`,
          eventId: event.id,
          actionType: action.actionType as ActionType,
          description: action.description,
          safetyLevel: "medium_risk",
          status: "proposed",
          priority: action.priority,
          reasoning: action.reasoning || "",
          confidence: confidence.finalScore,
          requiresApproval: true,
          createdAt: new Date().toISOString(),
        })
      );

      const actionButtons = formatActionButtons(actionProposals, event.id);
      blocks.push(...actionButtons);
    }

    await respond({
      blocks: blocks as SlackBlocks,
      response_type: "ephemeral",
    });
  } catch (error) {
    logger.error("Error processing Slack command", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorBlocks = formatErrorMessage(
      error instanceof Error ? error : new Error("Unknown error")
    );

    await respond({
      blocks: errorBlocks as SlackBlocks,
      response_type: "ephemeral",
    });
  }
};
