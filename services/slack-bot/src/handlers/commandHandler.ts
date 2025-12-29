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
import type { WebClient } from "@slack/web-api";
import {
  createLogger,
  findBySlackWorkspace,
  findAllMappingsForTenant,
  type ActionProposal,
  type ActionType,
} from "@kenchi/shared";
import { formatAnalysisMessage, formatActionButtons, formatErrorMessage } from "../formatters.js";
import { createEventFromCommand, performAnalysis } from "../services/analysisService.js";
import {
  getGitHubInstallUrl,
  buildRepoSelectModal,
  buildNoReposModal,
  buildUnconfigureModal,
  buildNoConfiguredReposModal,
  getAvailableRepositories,
} from "./channelHandler.js";
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
  readonly client: WebClient;
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
            "• `/kenchi configure` - Select a repository for this channel\n" +
            "• `/kenchi unconfigure` - Remove the repository from this channel\n" +
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
 * Handle /kenchi configure - Open repository selection modal
 */
const handleConfigure: SubcommandHandler = async ({ command, respond, client }) => {
  const workspaceId = command.team_id;
  const channelId = command.channel_id;
  const channelName = command.channel_name;

  logger.info("Configure command received", {
    user: command.user_id,
    workspaceId,
    channelId,
  });

  try {
    // Check if GitHub is connected
    const tenant = await findBySlackWorkspace(workspaceId);

    if (!tenant || !tenant.githubInstallationId) {
      await respond({
        text: "Please connect GitHub first using `/kenchi connect`",
        response_type: "ephemeral",
      });
      return;
    }

    // Fetch available repositories from GitHub App API
    const repositories = await getAvailableRepositories(tenant.githubInstallationId, tenant.id);

    // Open the appropriate modal based on available repositories
    const view =
      repositories.length > 0
        ? buildRepoSelectModal(channelId, channelName, repositories)
        : buildNoReposModal(channelName);

    await client.views.open({
      trigger_id: command.trigger_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      view: view as any,
    });

    logger.info("Opened repository selection modal", {
      channelId,
      repositoryCount: repositories.length,
    });
  } catch (error) {
    logger.error("Error opening configure modal", {
      error: error instanceof Error ? error.message : "Unknown error",
      workspaceId,
    });

    await respond({
      text: "Failed to open configuration. Please try again.",
      response_type: "ephemeral",
    });
  }
};

/**
 * Handle /kenchi unconfigure - Open modal to select repository to remove
 */
const handleUnconfigure: SubcommandHandler = async ({ command, respond, client }) => {
  const workspaceId = command.team_id;

  logger.info("Unconfigure command received", {
    user: command.user_id,
    workspaceId,
  });

  try {
    const tenant = await findBySlackWorkspace(workspaceId);

    if (!tenant) {
      await respond({
        text: "No configuration found for this workspace.",
        response_type: "ephemeral",
      });
      return;
    }

    // Get all mappings for this tenant
    const mappings = await findAllMappingsForTenant(tenant.id);

    // Open the appropriate modal based on available mappings
    const view =
      mappings.length > 0
        ? buildUnconfigureModal(
            mappings.map((mapping) => ({
              repository: mapping.repository,
              channelId: mapping.slackChannelId,
              channelName: mapping.slackChannelName,
            }))
          )
        : buildNoConfiguredReposModal();

    await client.views.open({
      trigger_id: command.trigger_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      view: view as any,
    });

    logger.info("Opened unconfigure modal", {
      mappingCount: mappings.length,
    });
  } catch (error) {
    logger.error("Error opening unconfigure modal", {
      error: error instanceof Error ? error.message : "Unknown error",
      workspaceId,
    });

    await respond({
      text: "Failed to open configuration. Please try again.",
      response_type: "ephemeral",
    });
  }
};

/**
 * Handle /kenchi <text> - AI analysis (default behavior)
 */
const handleAnalysis: SubcommandHandler = async (ctx) => {
  const { command, args, respond } = ctx;

  if (!args.trim()) {
    await handleHelp(ctx);
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
  ["configure", handleConfigure],
  ["unconfigure", handleUnconfigure],
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
 * @param client - Slack Web API client
 */
export const handleKenchiCommand = async (
  command: SlashCommand,
  ack: () => Promise<void>,
  respond: RespondFn,
  client: WebClient
): Promise<void> => {
  await ack();

  const { subcommand, args } = parseCommand(command.text);

  logger.info("Slack command received", {
    subcommand,
    hasArgs: args.length > 0,
    user: command.user_id,
    channel: command.channel_id,
  });

  const ctx: CommandContext = { command, args, respond, client };

  // Look up subcommand handler, fall back to analysis
  const handler = subcommandHandlers.get(subcommand) ?? handleAnalysis;

  // For analysis, pass the full text (including what looked like a subcommand)
  if (handler === handleAnalysis && subcommand) {
    await handler({ ...ctx, args: command.text });
  } else {
    await handler(ctx);
  }
};
