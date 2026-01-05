/**
 * Command Subhandlers
 *
 * Individual subcommand handlers for /kenchi slash commands.
 */

import type { SlashCommand, RespondFn, RespondArguments } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { View } from "@slack/types";
import {
  createLogger,
  findBySlackWorkspace,
  findAllMappingsForTenant,
  getErrorMessage,
  SLACK_UI_ERROR_MESSAGES,
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
import { handleAddDocCommand } from "./documentIngestionHandler.js";
import { toSlackSDKView, type SlackBlock } from "../types/slackTypes.js";

// Type for Slack blocks compatible with Bolt
type SlackBlocks = NonNullable<RespondArguments["blocks"]>;

const logger = createLogger("slack-bot");

// ==================== Types ====================

/**
 * Command context passed to subcommand handlers
 */
export interface CommandContext {
  readonly command: SlashCommand;
  readonly args: string;
  readonly respond: RespondFn;
  readonly client: WebClient;
}

/**
 * Subcommand handler type
 */
export type SubcommandHandler = (ctx: CommandContext) => Promise<void>;

// ==================== Subcommand Handlers ====================

/**
 * Handle /kenchi connect - Show GitHub App install link.
 */
export const handleConnect: SubcommandHandler = async ({ command, respond }): Promise<void> => {
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
 * Handle /kenchi status - Show connection status.
 */
export const handleStatus: SubcommandHandler = async ({ command, respond }): Promise<void> => {
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
                `*Slack:* Connected\n` +
                `${tenant.githubInstallationId ? "" : ""} *GitHub:* ${tenant.githubInstallationId ? `Connected (${tenant.githubOrg})` : "Not connected"}\n` +
                `*Status:* ${tenant.status}`,
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
                `No tenant found for this workspace.\n\n` +
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
      error: getErrorMessage(error),
      workspaceId,
    });

    await respond({
      text: SLACK_UI_ERROR_MESSAGES.STATUS_CHECK_FAILED,
      response_type: "ephemeral",
    });
  }
};

/**
 * Handle /kenchi help - Show available commands.
 */
export const handleHelp: SubcommandHandler = async ({ respond }): Promise<void> => {
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
            "• `/kenchi add-doc` - Add a document to the knowledge base\n" +
            "• `/kenchi help` - Show this help message\n" +
            "• `/kenchi <question>` - Ask Kenchi a question or analyze a CI issue",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Kenchi automatically analyzes CI failures and posts alerts to this channel. You can also upload a file and mention @kenchi to add it to the knowledge base.",
          },
        ],
      },
    ] as SlackBlocks,
    response_type: "ephemeral",
  });
};

/**
 * Handle /kenchi configure - Open repository selection modal.
 */
export const handleConfigure: SubcommandHandler = async ({
  command,
  respond,
  client,
}): Promise<void> => {
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
      view: toSlackSDKView(view) as View,
    });

    logger.info("Opened repository selection modal", {
      channelId,
      repositoryCount: repositories.length,
    });
  } catch (error) {
    logger.error("Error opening configure modal", {
      error: getErrorMessage(error),
      workspaceId,
    });

    await respond({
      text: SLACK_UI_ERROR_MESSAGES.CONFIG_MODAL_FAILED,
      response_type: "ephemeral",
    });
  }
};

/**
 * Handle /kenchi unconfigure - Open modal to select repository to remove.
 */
export const handleUnconfigure: SubcommandHandler = async ({
  command,
  respond,
  client,
}): Promise<void> => {
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
      view: toSlackSDKView(view) as View,
    });

    logger.info("Opened unconfigure modal", {
      mappingCount: mappings.length,
    });
  } catch (error) {
    logger.error("Error opening unconfigure modal", {
      error: getErrorMessage(error),
      workspaceId,
    });

    await respond({
      text: SLACK_UI_ERROR_MESSAGES.CONFIG_MODAL_FAILED,
      response_type: "ephemeral",
    });
  }
};

/**
 * Handle /kenchi add-doc - Open document ingestion modal.
 */
export const handleAddDoc: SubcommandHandler = async ({
  command,
  respond,
  client,
}): Promise<void> => {
  await handleAddDocCommand(command, respond, client);
};

/**
 * Handle /kenchi <text> - AI analysis (default behavior).
 */
export const handleAnalysis: SubcommandHandler = async (ctx): Promise<void> => {
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
        (action, actionIndex): ActionProposal => ({
          id: `action_${actionIndex}`,
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
      error: getErrorMessage(error),
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
