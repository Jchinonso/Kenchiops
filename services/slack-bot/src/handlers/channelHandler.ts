/**
 * Channel Event Handler
 *
 * Handles Slack channel-related events, specifically when
 * the bot joins or leaves channels.
 */

import { logger, UI_CONSTANTS } from "@kenchi/shared";
import { getBotMemberChannels, type SlackClient, type SlackChannel } from "../services/channelService.js";

// Re-export commonly used functions for backward compatibility
export { resolveChannelId, getBotMemberChannels } from "../services/channelService.js";
export { postMessage, broadcastMessage } from "../services/messageService.js";
export { formatCIFailureBlocks, createAnalysisAttachments } from "../formatters/ciFailureFormatter.js";

// ==================== Message Templates ====================

const SINGLE_CHANNEL_POLICY_MESSAGE = (activeChannelId: string): string =>
  `\u26A0\uFE0F **Single Channel Policy**\n\n` +
  `I'm already active in <#${activeChannelId}>.\n\n` +
  `I can only be in ONE channel at a time. Please remove me from the other channel first if you want me here.\n\n` +
  `_Leaving this channel now..._`;

const WELCOME_MESSAGE =
  `\uD83D\uDC4B **Hello! I'm the Kenchi DevOps Assistant**\n\n` +
  `\u2705 I'm now active in this channel.\n\n` +
  `I'll broadcast CI failure analysis and other DevOps alerts here.\n\n` +
  `_Note: I can only be in ONE channel at a time._`;

// ==================== Helper Functions ====================

/**
 * Sends welcome message to the first channel the bot joins.
 */
const sendWelcomeMessage = async (
  client: SlackClient,
  channelId: string
): Promise<void> => {
  await client.chat.postMessage({
    channel: channelId,
    text: WELCOME_MESSAGE,
  });

  logger.info("Bot successfully joined first channel", { channel: channelId });
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
