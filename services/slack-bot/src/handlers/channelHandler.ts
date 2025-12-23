/**
 * Channel Event Handler
 *
 * Handles Slack channel-related events, specifically when
 * the bot joins or leaves channels.
 */

import { logger, UI_CONSTANTS, config } from "@kenchi/shared";
import {
  getBotMemberChannels,
  type SlackClient,
  type SlackChannel,
} from "../services/channelService.js";

// Re-export commonly used functions for backward compatibility
export { resolveChannelId, getBotMemberChannels } from "../services/channelService.js";
export { postMessage, postConsolidatedMessage, broadcastMessage } from "../services/messageService.js";
export {
  formatCIFailureBlocks,
  createAnalysisAttachments,
} from "../formatters/ciFailureFormatter.js";

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

const SINGLE_CHANNEL_POLICY_MESSAGE = (activeChannelId: string): string =>
  `\u26A0\uFE0F **Single Channel Policy**\n\n` +
  `I'm already active in <#${activeChannelId}>.\n\n` +
  `I can only be in ONE channel at a time. Please remove me from the other channel first if you want me here.\n\n` +
  `_Leaving this channel now..._`;

/**
 * Build welcome message with GitHub install link
 */
const buildWelcomeMessage = (workspaceId: string): string => {
  const githubInstallUrl = getGitHubInstallUrl(workspaceId);
  return (
    `\uD83D\uDC4B *Hello! I'm the Kenchi DevOps Assistant*\n\n` +
    `\u2705 I'm now active in this channel.\n\n` +
    `*Next step:* Connect your GitHub organization to receive CI failure alerts.\n\n` +
    `<${githubInstallUrl}|:github: Install GitHub App>\n\n` +
    `Or type \`/kenchi connect\` anytime to get the install link.\n\n` +
    `_Note: I can only be in ONE channel at a time._`
  );
};

// ==================== Helper Functions ====================

/**
 * Sends welcome message to the first channel the bot joins.
 * Includes GitHub App install link with workspace ID for tenant linking.
 */
const sendWelcomeMessage = async (client: SlackClient, channelId: string): Promise<void> => {
  // Get workspace ID for the GitHub install link
  const authResult = await client.auth.test();
  const workspaceId = authResult.team_id || "unknown";

  const welcomeMessage = buildWelcomeMessage(workspaceId);

  await client.chat.postMessage({
    channel: channelId,
    text: welcomeMessage,
    mrkdwn: true,
  });

  logger.info("Bot successfully joined first channel", {
    channel: channelId,
    workspaceId,
  });
};

/**
 * Handles single-channel policy violation by notifying and leaving.
 */
const enforceChannelPolicy = async (
  client: SlackClient,
  newChannelId: string,
  activeChannel: SlackChannel
): Promise<void> => {
  const activeChannelId = activeChannel.id || "another channel";

  // Notify user about the policy
  await client.chat.postMessage({
    channel: newChannelId,
    text: SINGLE_CHANNEL_POLICY_MESSAGE(activeChannelId),
  });

  // Wait briefly before leaving
  await new Promise((resolve) => setTimeout(resolve, UI_CONSTANTS.ACTION_TIMEOUT_MS));

  // Leave the new channel
  await client.conversations.leave({ channel: newChannelId });

  logger.info("Bot left channel due to single-channel policy", {
    leftChannel: newChannelId,
    activeChannel: activeChannelId,
  });
};

// ==================== Main Handler ====================

/**
 * Handles the member_joined_channel event when the bot joins a channel.
 *
 * Enforces single-channel policy: bot can only be in one channel at a time.
 * If the bot is already in another channel, it will leave the new channel
 * with an explanatory message.
 *
 * @param client - Slack client instance
 * @param channelId - The channel the bot joined
 * @param _botId - The bot's user ID (unused but kept for interface compatibility)
 */
export const handleBotJoinedChannel = async (
  client: SlackClient,
  channelId: string,
  _botId: string
): Promise<void> => {
  try {
    const memberChannels = await getBotMemberChannels(client);

    logger.info("Bot joined channel", {
      channel: channelId,
      totalMemberChannels: memberChannels.length,
    });

    // Single channel - send welcome message
    if (memberChannels.length <= 1) {
      await sendWelcomeMessage(client, channelId);
      return;
    }

    // Multiple channels - enforce policy
    const activeChannel = memberChannels.find((c) => c.id !== channelId);
    if (activeChannel) {
      await enforceChannelPolicy(client, channelId, activeChannel);
    }
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
