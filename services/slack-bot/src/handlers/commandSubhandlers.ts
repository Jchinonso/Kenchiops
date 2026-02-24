/**
 * Command Subhandlers
 *
 * Individual subcommand handlers for /kenchi slash commands.
 */

import type { View } from "@slack/types";
import {
  createLogger,
  config,
  delay,
  findTenantBySlackWorkspace,
  findGitHubAppConnection,
  findAllMappingsForTenant,
  getErrorMessage,
  getSubscriptionByTenant,
  SUBSCRIPTION_STATUS,
  resilientGet,
  resilientPost,
  SLACK_UI_ERROR_MESSAGES,
  type ActionProposal,
  type ActionType,
  type InvestigationRecord,
} from "@kenchi/shared";
import { formatAnalysisMessage, formatActionButtons, formatErrorMessage } from "../formatters.js";
import {
  formatInvestigationStartedBlocks,
  formatInvestigationResultBlocks,
  formatInvestigationErrorBlocks,
  formatInvestigationTimeoutBlocks,
} from "../formatters/investigationFormatter.js";
import {
  INVESTIGATION_POLL_CONFIG,
  type InvestigationApiResponse,
  type InvestigationCreateResponse,
} from "./investigateHandlerTypes.js";
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
import type { SubcommandHandler } from "./commandSubhandlersTypes.js";
import type { SlackBlocks } from "./actionHandlerTypes.js";

export type { CommandContext, SubcommandHandler } from "./commandSubhandlersTypes.js";

const logger = createLogger("slack-bot");

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
    const tenant = await findTenantBySlackWorkspace(workspaceId);
    const ghConn = tenant ? await findGitHubAppConnection(tenant.id) : null;
    const githubConnected = ghConn !== null;

    const statusBlocks: SlackBlock[] = tenant
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Kenchi Connection Status*\n\n` +
                `*Slack:* Connected\n` +
                `${githubConnected ? "" : ""} *GitHub:* ${githubConnected ? `Connected (${tenant.orgName})` : "Not connected"}\n` +
                `*Status:* ${tenant.status}`,
            },
          },
          ...(githubConnected
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
            "• `/kenchi investigate <description>` - Investigate a production issue\n" +
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
    const tenant = await findTenantBySlackWorkspace(workspaceId);
    const ghConn = tenant ? await findGitHubAppConnection(tenant.id) : null;
    const installationId = ghConn?.externalOrgId ? Number(ghConn.externalOrgId) : null;

    if (!tenant || !installationId) {
      await respond({
        text: "Please connect GitHub first using `/kenchi connect`",
        response_type: "ephemeral",
      });
      return;
    }

    // Fetch available repositories from GitHub App API
    const repositories = await getAvailableRepositories(installationId, tenant.id);

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
    const tenant = await findTenantBySlackWorkspace(workspaceId);

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

// ==================== Investigation Helpers ====================

const investigateLogger = createLogger("slack-investigate");

/**
 * Builds the base URL for the incident-triage service.
 */
const getTriageServiceUrl = (): string => config.INCIDENT_TRIAGE_URL;

/**
 * Checks whether an investigation has reached a terminal status.
 */
const isTerminalStatus = (status: string): boolean => status === "completed" || status === "error";

/**
 * Polls the incident-triage service for a completed investigation.
 * Returns the investigation record when complete/errored, or null on timeout.
 */
const pollInvestigation = async (
  investigationId: string,
  tenantId: string
): Promise<InvestigationRecord | null> => {
  // let: loop counter for polling with early-exit
  for (let attempt = 0; attempt < INVESTIGATION_POLL_CONFIG.MAX_ATTEMPTS; attempt++) {
    await delay(INVESTIGATION_POLL_CONFIG.INTERVAL_MS);

    try {
      const response = await resilientGet<InvestigationApiResponse>(
        `${getTriageServiceUrl()}/api/v1/investigations/${investigationId}`,
        {
          timeout: INVESTIGATION_POLL_CONFIG.REQUEST_TIMEOUT_MS,
          headers: { "x-tenant-id": tenantId },
          skipCircuitBreaker: true,
        }
      );

      const investigation = response.data?.data;
      if (investigation && isTerminalStatus(investigation.status)) {
        return investigation;
      }
    } catch (pollError) {
      investigateLogger.warn("Poll attempt failed", {
        investigationId,
        attempt,
        error: getErrorMessage(pollError),
      });
    }
  }

  return null;
};

// ==================== Investigate Handler ====================

/**
 * Handle /kenchi investigate <description> - Start a diagnostic investigation.
 *
 * Flow:
 * 1. Validate args (description required)
 * 2. Resolve tenant from Slack workspace
 * 3. Send immediate ephemeral "starting" message (Slack 3s requirement)
 * 4. POST to incident-triage service to create investigation
 * 5. Poll for results (max ~24s)
 * 6. Update message with results, error, or timeout
 */
export const handleInvestigate: SubcommandHandler = async ({
  command,
  args,
  respond,
}): Promise<void> => {
  if (!args.trim()) {
    await respond({
      text:
        "Please describe the issue to investigate.\n\n" +
        "Usage: `/kenchi investigate <description>`\n" +
        "Example: `/kenchi investigate payment API is returning 500 errors in production`",
      response_type: "ephemeral",
    });
    return;
  }

  const description = args.trim();
  const workspaceId = command.team_id;

  investigateLogger.info("Investigate command received", {
    user: command.user_id,
    workspaceId,
  });

  // Resolve tenant
  const tenant = await findTenantBySlackWorkspace(workspaceId);
  if (!tenant) {
    await respond({
      text: "Workspace not configured. Run `/kenchi connect` first.",
      response_type: "ephemeral",
    });
    return;
  }

  try {
    // Start the investigation via incident-triage service
    const createResponse = await resilientPost<InvestigationCreateResponse>(
      `${getTriageServiceUrl()}/api/v1/investigations`,
      {
        description,
        tenantId: tenant.id,
        initiatedBy: command.user_id,
        initiatedFrom: "slack",
      },
      {
        timeout: INVESTIGATION_POLL_CONFIG.REQUEST_TIMEOUT_MS,
        headers: { "x-tenant-id": tenant.id },
        skipCircuitBreaker: true,
      }
    );

    const investigationId = createResponse.data?.data?.id;
    if (!investigationId) {
      await respond({
        text: "Failed to start investigation. The service returned an unexpected response.",
        response_type: "ephemeral",
      });
      return;
    }

    // Send immediate "started" message within the 3-second Slack window
    await respond({
      blocks: [...formatInvestigationStartedBlocks(investigationId, description)] as SlackBlocks,
      response_type: "ephemeral",
    });

    investigateLogger.info("Investigation started", {
      investigationId,
      tenantId: tenant.id,
      user: command.user_id,
    });

    // Poll for results
    const result = await pollInvestigation(investigationId, tenant.id);

    // Send final message based on result
    if (!result) {
      await respond({
        replace_original: true,
        blocks: [...formatInvestigationTimeoutBlocks(investigationId)] as SlackBlocks,
        response_type: "ephemeral",
      });
      return;
    }

    const { status: resultStatus } = result;
    const resultBlocks =
      resultStatus === "completed"
        ? formatInvestigationResultBlocks(result)
        : formatInvestigationErrorBlocks(
            investigationId,
            result.errorMessage ?? "Unknown error occurred during investigation"
          );

    await respond({
      replace_original: true,
      blocks: [...resultBlocks] as SlackBlocks,
      response_type: "ephemeral",
    });

    investigateLogger.info("Investigation result delivered", {
      investigationId,
      status: resultStatus,
      durationMs: result.durationMs,
    });
  } catch (error) {
    investigateLogger.error("Investigation command failed", {
      error: getErrorMessage(error),
      workspaceId,
      user: command.user_id,
    });

    await respond({
      text: "An error occurred while starting the investigation. Please try again.",
      response_type: "ephemeral",
    });
  }
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
    const tenant = await findTenantBySlackWorkspace(command.team_id);

    // Check subscription status before running analysis (fail-open)
    if (tenant?.id) {
      try {
        const subscription = await getSubscriptionByTenant(tenant.id);
        const blockedStatuses: ReadonlySet<string> = new Set([
          SUBSCRIPTION_STATUS.CANCELED,
          SUBSCRIPTION_STATUS.PAST_DUE,
        ]);
        if (subscription && blockedStatuses.has(subscription.status)) {
          await respond({
            text: `:warning: Your organization's subscription is ${subscription.status.replace("_", " ")}. Please update your subscription to use analysis.`,
          });
          return;
        }
      } catch {
        // Fail-open: proceed if subscription check fails
      }
    }

    const event = createEventFromCommand(command.user_id, command.channel_id, args);
    const { analysis, confidence } = await performAnalysis(event, tenant?.id);

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
