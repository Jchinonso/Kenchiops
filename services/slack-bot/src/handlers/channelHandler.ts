/**
 * Channel Event Handler
 *
 * Handles Slack channel-related events, specifically when
 * the bot joins or leaves channels. Prompts users to select
 * a repository for CI notifications when joining a channel.
 */

import {
  logger,
  config,
  findBySlackWorkspace,
  findMappingsForChannel,
  deleteMappingsForChannel,
  getMappedRepositories,
  fetchInstallationRepositories,
} from "@kenchi/shared";
import { type SlackClient } from "../services/channelService.js";
import { buildRepoSelectModal, buildNoReposModal, type RepositoryOption } from "./modalBuilders.js";

// Re-export modal constants and builders for backward compatibility
export {
  REPO_SELECT_MODAL_CALLBACK,
  REPO_SELECT_ACTION_ID,
  UNCONFIGURE_MODAL_CALLBACK,
  UNCONFIGURE_SELECT_ACTION_ID,
  buildRepoSelectModal,
  buildNoReposModal,
  buildUnconfigureModal,
  buildNoConfiguredReposModal,
} from "./modalBuilders.js";

// ==================== GitHub Install URL ====================

/**
 * Build GitHub App install URL with workspace ID for linking.
 * The workspace ID is passed as a state parameter so we can link
 * the GitHub installation to the correct Slack workspace after install.
 */
export const getGitHubInstallUrl = (workspaceId: string): string => {
  const appSlug = config.GITHUB_APP_SLUG || "kenchi-devops";
  return `https://github.com/apps/${appSlug}/installations/new?state=${workspaceId}`;
};

// ==================== Message Templates ====================

/**
 * Build message prompting GitHub installation
 */
const buildConnectGitHubMessage = (workspaceId: string): string => {
  const githubInstallUrl = getGitHubInstallUrl(workspaceId);
  return (
    `*Hello! I'm the Kenchi DevOps Assistant*\n\n` +
    `To receive CI failure notifications in this channel, you need to connect GitHub first.\n\n` +
    `<${githubInstallUrl}|Install GitHub App>\n\n` +
    `After installing, add me to this channel again and I'll help you configure which repository to monitor.`
  );
};

/**
 * Build success message after repo selection
 */
export const buildRepoConfiguredMessage = (repository: string, channelName: string): string =>
  `*Repository Connected!*\n\n` +
  `This channel will now receive CI failure notifications for \`${repository}\`.\n\n` +
  `When a CI check fails, I'll:\n` +
  `• Analyze the logs and identify the root cause\n` +
  `• Post a detailed breakdown with fix suggestions\n` +
  `• Highlight the specific files and lines causing issues\n\n` +
  `Notifications will be posted here in #${channelName}.`;

// ==================== Helper Functions ====================

/**
 * Get available repositories from GitHub for the installation.
 * Filters out already-mapped repositories.
 */
export const getAvailableRepositories = async (
  installationId: number,
  tenantId: string
): Promise<RepositoryOption[]> => {
  try {
    const [allRepositories, mappedRepos] = await Promise.all([
      fetchInstallationRepositories(installationId),
      getMappedRepositories(tenantId),
    ]);

    const availableRepositories = allRepositories
      .filter((repo) => !mappedRepos.has(repo.fullName))
      .map((repo) => ({ fullName: repo.fullName, name: repo.name }));

    logger.info("Fetched available repositories", {
      installationId,
      totalRepos: allRepositories.length,
      mappedRepos: mappedRepos.size,
      availableRepos: availableRepositories.length,
    });

    return availableRepositories;
  } catch (error) {
    logger.error("Failed to fetch available repositories", {
      installationId,
      tenantId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
};

/**
 * Get channel info for display
 */
const getChannelName = async (client: SlackClient, channelId: string): Promise<string> => {
  try {
    const result = await client.conversations.info({ channel: channelId });
    return (result.channel as { name?: string })?.name ?? channelId;
  } catch {
    return channelId;
  }
};

/**
 * Build welcome message blocks with repository selection button
 */
const buildWelcomeBlocks = (
  channelId: string,
  channelName: string,
  messageTs: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Welcome!* I'm ready to monitor CI failures for this channel.`,
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "Select which repository should send notifications to this channel:",
    },
    accessory: {
      type: "button",
      text: {
        type: "plain_text",
        text: "Select Repository",
        emoji: true,
      },
      style: "primary",
      action_id: "select_repository_button",
      value: JSON.stringify({ channelId, channelName, messageTs }),
    },
  },
];

// ==================== Main Handler ====================

/**
 * Handles the member_joined_channel event when the bot joins a channel.
 *
 * Flow:
 * 1. Check if GitHub is connected (tenant exists with installation)
 * 2. If not connected, prompt to install GitHub App
 * 3. If connected, clean up any stale mappings and post welcome message
 * 4. User can click button to open repository selection modal
 */
export const handleBotJoinedChannel = async (
  client: SlackClient,
  channelId: string,
  _botId: string,
  triggerId?: string
): Promise<void> => {
  try {
    const authResult = await client.auth.test();
    const workspaceId = authResult.team_id ?? "";

    logger.info("Bot joined channel", { channelId, workspaceId });

    const tenant = await findBySlackWorkspace(workspaceId);

    // GitHub not connected - prompt to install
    if (!tenant?.githubInstallationId) {
      await client.chat.postMessage({
        channel: channelId,
        text: buildConnectGitHubMessage(workspaceId),
        mrkdwn: true,
      });

      logger.info("Prompted user to connect GitHub", {
        channelId,
        workspaceId,
        hasTenant: !!tenant,
      });
      return;
    }

    // Clean up any existing mappings when bot rejoins
    const existingMappings = await findMappingsForChannel(tenant.id, channelId);
    if (existingMappings.length > 0) {
      await deleteMappingsForChannel(tenant.id, channelId);
      logger.info("Cleaned up existing mappings on bot rejoin", {
        channelId,
        deletedCount: existingMappings.length,
      });
    }

    const [repositories, channelName] = await Promise.all([
      getAvailableRepositories(tenant.githubInstallationId, tenant.id),
      getChannelName(client, channelId),
    ]);

    // Post welcome message with button
    const welcomeMessage = await client.chat.postMessage({
      channel: channelId,
      text: "Welcome! Click the button to select a repository for this channel.",
      blocks: buildWelcomeBlocks(channelId, channelName, ""),
    });

    // Update the button value with the message timestamp for later updates
    const messageTs = welcomeMessage.ts;
    if (messageTs) {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: "Welcome! Click the button to select a repository for this channel.",
        blocks: buildWelcomeBlocks(channelId, channelName, messageTs),
      });
    }

    logger.info("Posted welcome message with repository selection button", {
      channelId,
      channelName,
      repositoryCount: repositories.length,
    });

    // Handle trigger_id case for direct modal opening
    if (!triggerId) {
      return;
    }

    // Open modal for repository selection
    const modalView =
      repositories.length === 0
        ? buildNoReposModal(channelName)
        : buildRepoSelectModal(channelId, channelName, repositories);

    await client.views.open({
      trigger_id: triggerId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      view: modalView as any,
    });

    logger.info("Opened repository selection modal", {
      channelId,
      repositoryCount: repositories.length,
    });
  } catch (error) {
    const errorDetails = error as { data?: { needed?: string; provided?: string } };
    logger.error("Failed to handle member_joined_channel event", {
      error: error instanceof Error ? error.message : "Unknown error",
      channel: channelId,
      needed: errorDetails?.data?.needed,
      provided: errorDetails?.data?.provided,
    });
  }
};
