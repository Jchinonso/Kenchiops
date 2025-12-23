/**
 * Handler for Slack slash commands.
 * Processes /kenchi commands with subcommand support.
 *
 * Subcommands:
 * - /kenchi connect - Get GitHub App install link
 * - /kenchi status - Check connection status
 * - /kenchi help - Show available commands
 * - /kenchi <text> - AI analysis (default)
 */

import type { SlashCommand, RespondFn, RespondArguments } from "@slack/bolt";
import {
  createLogger,
  findBySlackWorkspace,
  type ActionProposal,
  type ActionType,
} from "@kenchi/shared";
import { formatAnalysisMessage, formatActionButtons, formatErrorMessage } from "../formatters.js";
import { createEventFromCommand, performAnalysis } from "../services/analysisService.js";
import { getGitHubInstallUrl } from "./channelHandler.js";
import type { SlackBlock } from "../types/slackTypes.js";

// Type for Slack blocks compatible with Bolt
type SlackBlocks = NonNullable<RespondArguments["blocks"]>;

const logger = createLogger("slack-bot");

/**
 * Command context passed to subcommand handlers
 */
interface CommandContext {
  readonly command: SlashCommand;
  readonly args: string;
  readonly respond: RespondFn;
}

/**
 * Subcommand handler type
 */
type SubcommandHandler = (ctx: CommandContext) => Promise<void>;

// ==================== Subcommand Handlers ====================

/**
 * Handle /kenchi connect - Show GitHub App install link
 */
const handleConnect: SubcommandHandler = async ({ command, respond }) => {
  const workspaceId = command.team_id;
  const installUrl = getGitHubInstallUrl(workspaceId);

  logger.info("Connect command received", {
    user: command.user_id,
    workspaceId,
  });

  await respond({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Connect GitHub to Kenchi*\n\nClick the link below to install the Kenchi GitHub App on your organization:",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${installUrl}|:github: Install GitHub App>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "After installing, CI failure alerts will automatically be sent to this workspace.",
          },
        ],
      },
    ] as SlackBlocks,
    response_type: "ephemeral",
  });
};

/**
 * Handle /kenchi status - Show connection status
 */
const handleStatus: SubcommandHandler = async ({ command, respond }) => {
  const workspaceId = command.team_id;

  logger.info("Status command received", {
    user: command.user_id,
    workspaceId,
  });

  try {
    const tenant = await findBySlackWorkspace(workspaceId);

    const statusBlocks: SlackBlock[] = tenant
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Kenchi Connection Status*\n\n` +
                `✅ *Slack:* Connected\n` +
                `${tenant.githubInstallationId ? "✅" : "⏳"} *GitHub:* ${tenant.githubInstallationId ? `Connected (${tenant.githubOrg})` : "Not connected"}\n` +
                `📊 *Status:* ${tenant.status}`,
            },
          },
          ...(tenant.githubInstallationId
            ? []
            : [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `<${getGitHubInstallUrl(workspaceId)}|:github: Install GitHub App to complete setup>`,
                  },
                },
              ]),
        ]
      : [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Kenchi Connection Status*\n\n` +
                `⚠️ No tenant found for this workspace.\n\n` +
                `<${getGitHubInstallUrl(workspaceId)}|:github: Install GitHub App to get started>`,
            },
          },
        ];

    await respond({
      blocks: statusBlocks as SlackBlocks,
      response_type: "ephemeral",
    });
  } catch (error) {
    logger.error("Error checking status", {
      error: error instanceof Error ? error.message : "Unknown error",
      workspaceId,
    });

    await respond({
      text: "Failed to check connection status. Please try again later.",
      response_type: "ephemeral",
    });
  }
};

/**
 * Handle /kenchi help - Show available commands
 */
const handleHelp: SubcommandHandler = async ({ respond }) => {
  await respond({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Kenchi DevOps Assistant - Commands*",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "• `/kenchi connect` - Get the GitHub App install link\n" +
            "• `/kenchi status` - Check your GitHub connection status\n" +
            "• `/kenchi help` - Show this help message\n" +
            "• `/kenchi <question>` - Ask Kenchi to analyze a CI issue",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Kenchi automatically analyzes CI failures and posts alerts to this channel.",
          },
        ],
      },
    ] as SlackBlocks,
    response_type: "ephemeral",
  });
};

/**
 * Handle /kenchi <text> - AI analysis (default behavior)
 */
const handleAnalysis: SubcommandHandler = async ({ command, args, respond }) => {
  if (!args.trim()) {
    await handleHelp({ command, args, respond });
    return;
  }

  try {
    const event = createEventFromCommand(command.user_id, command.channel_id, args);
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
    logger.error("Error processing analysis command", {
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

// ==================== Subcommand Router ====================

/**
 * Subcommand handler lookup table
 */
const subcommandHandlers: ReadonlyMap<string, SubcommandHandler> = new Map([
  ["connect", handleConnect],
  ["status", handleStatus],
  ["help", handleHelp],
]);

/**
 * Parse command text into subcommand and arguments
 */
const parseCommand = (text: string): { subcommand: string; args: string } => {
  const trimmed = text.trim();
  const spaceIndex = trimmed.indexOf(" ");

  if (spaceIndex === -1) {
    return { subcommand: trimmed.toLowerCase(), args: "" };
  }

  return {
    subcommand: trimmed.slice(0, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
};

// ==================== Main Handler ====================

/**
 * Handles /kenchi slash command with subcommand routing.
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

  const { subcommand, args } = parseCommand(command.text);

  logger.info("Slack command received", {
    subcommand,
    hasArgs: args.length > 0,
    user: command.user_id,
    channel: command.channel_id,
  });

  const ctx: CommandContext = { command, args, respond };

  // Look up subcommand handler, fall back to analysis
  const handler = subcommandHandlers.get(subcommand) ?? handleAnalysis;

  // For analysis, pass the full text (including what looked like a subcommand)
  if (handler === handleAnalysis && subcommand) {
    await handler({ ...ctx, args: command.text });
  } else {
    await handler(ctx);
  }
};
