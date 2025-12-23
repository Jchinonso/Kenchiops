/**
 * Channel Service
 *
 * Provides channel resolution and lookup functionality for Slack.
 */

import { logger, SLACK_CHANNEL_ID_PATTERN, SLACK_API_LIMITS, NotFoundError } from "@kenchi/shared";
import type Bolt from "@slack/bolt";

type SlackApp = InstanceType<typeof Bolt.App>;
export type SlackClient = SlackApp["client"];

/**
 * Channel information from Slack API.
 */
export interface SlackChannel {
  readonly id?: string;
  readonly name?: string;
  readonly is_member?: boolean;
}

/**
 * Resolves a channel name to a channel ID.
 *
 * If already an ID (starts with C, D, or G), returns as-is.
 * Otherwise, looks up the channel by name.
 *
 * @param client - Slack client instance
 * @param channelNameOrId - Channel name (e.g., "general") or ID (e.g., "C0A4FFS1086")
 * @returns Channel ID
 * @throws Error if channel is not found
 */
export const resolveChannelId = async (
  client: SlackClient,
  channelNameOrId: string
): Promise<string> => {
  // If already a channel ID, return as-is
  if (SLACK_CHANNEL_ID_PATTERN.test(channelNameOrId)) {
    return channelNameOrId;
  }

  // Remove leading # if present
  const channelName = channelNameOrId.replace(/^#/, "");

  try {
    const result = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: SLACK_API_LIMITS.CONVERSATIONS_LIST_LIMIT,
    });

    const channel = result.channels?.find((c: SlackChannel) => c.name === channelName);

    if (!channel?.id) {
      throw new NotFoundError(`Channel "${channelName}" not found`);
    }

    logger.info("Resolved channel name to ID", {
      channelName,
      channelId: channel.id,
    });

    return channel.id;
  } catch (error) {
    logger.error("Failed to resolve channel name", {
      channelName,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
};

/**
 * Gets all channels the bot is a member of.
 *
 * @param client - Slack client instance
 * @returns Array of channels where bot is a member
 */
export const getBotMemberChannels = async (client: SlackClient): Promise<SlackChannel[]> => {
  const result = await client.conversations.list({
    types: "public_channel,private_channel",
    limit: SLACK_API_LIMITS.CONVERSATIONS_LIST_LIMIT,
  });

  return (result.channels || []).filter((channel: SlackChannel) => channel.is_member === true);
};
