/**
 * Channel handler for Slack channel-related operations.
 * Handles channel resolution, messaging, broadcasting, and member events.
 */

import { logger, SLACK_CHANNEL_ID_PATTERN, UI_CONSTANTS } from '@kenchi/shared';
import type Bolt from '@slack/bolt';
import type {
  SlackMessageRequest,
  SlackMessagePostResponse,
  SlackBroadcastRequest,
  SlackBroadcastResponse,
  SlackBroadcastChannelResult,
  SlackBlock,
  CIFailureAnalysis,
} from '../types/slackTypes.js';

/**
 * Color codes for Slack attachments based on severity/confidence.
 */
const SLACK_COLORS = {
  DANGER: '#E01E5A',      // Red - critical/low confidence
  WARNING: '#ECB22E',     // Yellow - medium confidence
  SUCCESS: '#2EB67D',     // Green - high confidence
  INFO: '#36C5F0',        // Blue - informational
  PURPLE: '#4A154B',      // Purple - Slack brand color
} as const;

/**
 * Gets the appropriate color based on confidence score.
 */
const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.8) return SLACK_COLORS.SUCCESS;
  if (confidence >= 0.5) return SLACK_COLORS.WARNING;
  return SLACK_COLORS.DANGER;
};

/**
 * Gets confidence level label.
 */
const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
};

/**
 * Gets priority emoji.
 */
const getPriorityEmoji = (priority: string): string => {
  const p = priority.toLowerCase();
  if (p === 'critical' || p === 'high') return ':red_circle:';
  if (p === 'medium') return ':large_orange_circle:';
  return ':white_circle:';
};

/**
 * Formats CI failure analysis into beautiful Slack Block Kit blocks.
 */
export const formatCIFailureBlocks = (analysis: CIFailureAnalysis): SlackBlock[] => {
  const confidencePercent = Math.round(analysis.confidence * 100);
  const confidenceColor = getConfidenceColor(analysis.confidence);
  const confidenceLabel = getConfidenceLabel(analysis.confidence);

  const blocks: SlackBlock[] = [
    // Header
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':rotating_light: CI Failure Analysis',
        emoji: true,
      },
    },
    // Repository and Confidence
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `:package: *Repository*\n\`${analysis.repository}\``,
        },
        {
          type: 'mrkdwn',
          text: `:bar_chart: *Confidence*\n${confidenceLabel} (${confidencePercent}%)`,
        },
      ],
    },
    { type: 'divider' },
    // Summary
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:mag: *Summary*\n${analysis.analysis}`,
      },
    },
  ];

  // Identified Cause (if available)
  if (analysis.identified_cause) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:dart: *Root Cause*\n${analysis.identified_cause}`,
        },
      }
    );
  }

  // Recommended Actions (if available)
  if (analysis.recommended_actions && analysis.recommended_actions.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':hammer_and_wrench: *Recommended Actions*',
        },
      }
    );

    // Format each action
    const actionsText = analysis.recommended_actions
      .map((action, index) => {
        const emoji = getPriorityEmoji(action.priority);
        const priorityLabel = action.priority.charAt(0).toUpperCase() + action.priority.slice(1);
        return `${emoji} *${priorityLabel}:* ${action.description}`;
      })
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: actionsText,
      },
    });
  }

  // Footer with timestamp
  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:clock1: Analyzed at ${new Date().toISOString()} | :robot_face: Kenchi DevOps Assistant`,
        },
      ],
    }
  );

  return blocks;
};

/**
 * Slack attachment type compatible with Slack API.
 */
interface MessageAttachment {
  color: string;
  fallback: string;
  blocks: SlackBlock[];
}

/**
 * Creates Slack attachments with colored border for the analysis.
 */
export const createAnalysisAttachments = (analysis: CIFailureAnalysis): MessageAttachment[] => {
  const color = getConfidenceColor(analysis.confidence);
  return [
    {
      color,
      fallback: `CI Failure Analysis for ${analysis.repository}`,
      blocks: formatCIFailureBlocks(analysis),
    },
  ];
};

type SlackApp = InstanceType<typeof Bolt.App>;
type SlackClient = SlackApp['client'];

/**
 * Channel information from Slack API.
 */
interface SlackChannel {
  readonly id?: string;
  readonly name?: string;
  readonly is_member?: boolean;
}

/**
 * Resolves a channel name to a channel ID.
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
  if (SLACK_CHANNEL_ID_PATTERN.test(channelNameOrId)) {
    return channelNameOrId;
  }

  const channelName = channelNameOrId.replace(/^#/, '');

  try {
    const result = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000,
    });

    const channel = result.channels?.find(
      (c: SlackChannel) => c.name === channelName
    );

    if (!channel?.id) {
      throw new Error(`Channel "${channelName}" not found`);
    }

    logger.info('Resolved channel name to ID', {
      channelName,
      channelId: channel.id,
    });

    return channel.id;
  } catch (error) {
    logger.error('Failed to resolve channel name', {
      channelName,
      error: error instanceof Error ? error.message : 'Unknown error',
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
export const getBotMemberChannels = async (
  client: SlackClient
): Promise<SlackChannel[]> => {
  const result = await client.conversations.list({
    types: 'public_channel,private_channel',
    limit: 1000,
  });

  return (result.channels || []).filter(
    (channel: SlackChannel) => channel.is_member === true
  );
};

/**
 * Posts a message to a Slack channel.
 * Supports plain text, Block Kit blocks, and CI failure analysis formatting.
 *
 * @param client - Slack client instance
 * @param request - Message request with channel, message/blocks/analysis, and optional thread_ts
 * @returns Message response with status and details
 */
export const postMessage = async (
  client: SlackClient,
  request: SlackMessageRequest
): Promise<SlackMessagePostResponse> => {
  const { channel, message, thread_ts, blocks, attachments, analysis } = request;

  logger.info('Slack message request received', {
    channel,
    hasThread: !!thread_ts,
    hasBlocks: !!blocks,
    hasAttachments: !!attachments,
    hasAnalysis: !!analysis,
  });

  try {
    const channelId = await resolveChannelId(client, channel);

    // Build message payload
    let messageBlocks: SlackBlock[] | undefined;
    let messageAttachments: MessageAttachment[] | undefined;
    let fallbackText = message || 'CI Failure Analysis';

    // If analysis data is provided, format it into beautiful blocks
    if (analysis) {
      messageAttachments = createAnalysisAttachments(analysis);
      fallbackText = `CI Failure Analysis for ${analysis.repository}`;
    } else if (blocks) {
      messageBlocks = [...blocks] as SlackBlock[];
    } else if (attachments) {
      // Convert readonly attachments to mutable
      messageAttachments = attachments.map(a => ({
        color: a.color || '',
        fallback: a.fallback || '',
        blocks: a.blocks ? [...a.blocks] as SlackBlock[] : [],
      }));
    }

    const result = await client.chat.postMessage({
      channel: channelId,
      text: fallbackText,
      ...(messageBlocks && { blocks: messageBlocks }),
      ...(messageAttachments && { attachments: messageAttachments }),
      ...(thread_ts && { thread_ts }),
    });

    logger.info('Message posted to Slack', {
      channel,
      channelId,
      timestamp: result.ts,
      thread: thread_ts,
      formatted: !!analysis,
    });

    return {
      status: 'sent',
      channel: channelId,
      timestamp: result.ts,
      thread_ts: result.ts,
    };
  } catch (error) {
    logger.error('Failed to post message to Slack', {
      channel,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to post message',
    };
  }
};

/**
 * Broadcasts a message to all channels the bot is a member of.
 *
 * @param client - Slack client instance
 * @param request - Broadcast request with message
 * @returns Broadcast response with status and channel results
 */
export const broadcastMessage = async (
  client: SlackClient,
  request: SlackBroadcastRequest
): Promise<SlackBroadcastResponse> => {
  const { message } = request;

  logger.info('Slack broadcast request received');

  try {
    const channels = await getBotMemberChannels(client);
    logger.info('Broadcasting to channels where bot is a member', {
      count: channels.length,
    });

    const results = await Promise.allSettled(
      channels.map(async (channel): Promise<SlackBroadcastChannelResult> => {
        if (!channel.id || !channel.name) {
          throw new Error('Invalid channel data');
        }

        try {
          const postResult = await client.chat.postMessage({
            channel: channel.id,
            text: message,
          });

          logger.info('Message posted to channel', {
            channelName: channel.name,
            channelId: channel.id,
            timestamp: postResult.ts,
          });

          return {
            name: channel.name,
            id: channel.id,
            status: 'sent',
          };
        } catch (error) {
          logger.error('Failed to post to channel', {
            channelName: channel.name,
            channelId: channel.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          return {
            name: channel.name,
            id: channel.id,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const channelResults = results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : { name: 'unknown', id: 'unknown', status: 'failed' as const }
    );
    const successCount = channelResults.filter((r) => r.status === 'sent').length;
    const failedCount = channelResults.filter((r) => r.status === 'failed').length;

    const status =
      failedCount === 0 ? 'sent' : successCount > 0 ? 'partial' : 'error';

    logger.info('Broadcast completed', {
      total: channels.length,
      success: successCount,
      failed: failedCount,
    });

    return {
      status,
      channelsCount: channels.length,
      successCount,
      failedCount,
      channels: channelResults,
    };
  } catch (error) {
    logger.error('Failed to broadcast message', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      status: 'error',
      channelsCount: 0,
      successCount: 0,
      failedCount: 0,
      error: error instanceof Error ? error.message : 'Failed to broadcast',
    };
  }
};

/**
 * Handles the member_joined_channel event when the bot joins a channel.
 * Enforces single-channel policy: bot can only be in one channel at a time.
 *
 * @param client - Slack client instance
 * @param channelId - The channel the bot joined
 * @param botId - The bot's user ID
 */
export const handleBotJoinedChannel = async (
  client: SlackClient,
  channelId: string,
  botId: string
): Promise<void> => {
  try {
    const memberChannels = await getBotMemberChannels(client);

    logger.info('Bot joined channel', {
      channel: channelId,
      totalMemberChannels: memberChannels.length,
    });

    if (memberChannels.length > 1) {
      const firstChannel = memberChannels.find((c) => c.id !== channelId);

      await client.chat.postMessage({
        channel: channelId,
        text: `⚠️ **Single Channel Policy**\n\nI'm already active in <#${firstChannel?.id || 'another channel'}>.\n\nI can only be in ONE channel at a time. Please remove me from the other channel first if you want me here.\n\n_Leaving this channel now..._`,
      });

      await new Promise((resolve) =>
        setTimeout(resolve, UI_CONSTANTS.ACTION_TIMEOUT_MS)
      );

      await client.conversations.leave({
        channel: channelId,
      });

      logger.info('Bot left channel due to single-channel policy', {
        leftChannel: channelId,
        activeChannel: firstChannel?.id,
      });
    } else {
      await client.chat.postMessage({
        channel: channelId,
        text: `👋 **Hello! I'm the Kenchi DevOps Assistant**\n\n✅ I'm now active in this channel.\n\nI'll broadcast CI failure analysis and other DevOps alerts here.\n\n_Note: I can only be in ONE channel at a time._`,
      });

      logger.info('Bot successfully joined first channel', {
        channel: channelId,
      });
    }
  } catch (error) {
    // Log full error details for debugging
    const errorDetails = error as { data?: { needed?: string; provided?: string } };
    logger.error('Failed to handle member_joined_channel event', {
      error: error instanceof Error ? error.message : 'Unknown error',
      channel: channelId,
      needed: errorDetails?.data?.needed,
      provided: errorDetails?.data?.provided,
      fullError: JSON.stringify(error),
    });
  }
};
