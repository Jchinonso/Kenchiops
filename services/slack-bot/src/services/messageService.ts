/**
 * Message Service
 *
 * Provides message posting and broadcasting functionality for Slack.
 */

import { logger, getErrorMessage } from "@kenchi/shared";
import type {
  SlackMessageRequest,
  SlackMessagePostResponse,
  SlackBroadcastRequest,
  SlackBroadcastResponse,
  SlackBroadcastChannelResult,
  SlackBlock,
  SlackAttachment,
  CIFailureAnalysis,
} from "../types/slackTypes.js";
import { resolveChannelId, getBotMemberChannels, type SlackClient } from "./channelService.js";
import { createAnalysisAttachments, type MessageAttachment } from "../formatters/ciFailureFormatter.js";

/**
 * Message payload for Slack API
 */
interface MessagePayload {
  readonly fallbackText: string;
  readonly blocks?: SlackBlock[];
  readonly attachments?: MessageAttachment[];
}

/**
 * Build message payload from request options.
 * Prioritizes: analysis > blocks > attachments > plain message
 */
const buildMessagePayload = (
  message: string | undefined,
  analysis: CIFailureAnalysis | undefined,
  blocks: readonly SlackBlock[] | undefined,
  attachments: readonly SlackAttachment[] | undefined
): MessagePayload => {
  // Priority 1: CI failure analysis formatting
  if (analysis) {
    return {
      fallbackText: `CI Failure Analysis for ${analysis.repository}`,
      attachments: createAnalysisAttachments(analysis),
    };
  }

  // Priority 2: Block Kit blocks
  if (blocks) {
    return {
      fallbackText: message || "CI Failure Analysis",
      blocks: [...blocks] as SlackBlock[],
    };
  }

  // Priority 3: Attachments
  if (attachments) {
    return {
      fallbackText: message || "CI Failure Analysis",
      attachments: attachments.map((a) => ({
        color: a.color || "",
        fallback: a.fallback || "",
        blocks: a.blocks ? ([...a.blocks] as SlackBlock[]) : [],
      })),
    };
  }

  // Default: plain text message
  return { fallbackText: message || "CI Failure Analysis" };
};

/**
 * Gets the bot's active channel (the one channel it's a member of).
 * Returns null if bot is not in any channel.
 */
const getActiveChannel = async (client: SlackClient): Promise<string | null> => {
  const channels = await getBotMemberChannels(client);
  if (channels.length === 0) {
    return null;
  }
  // Bot should only be in one channel (single-channel policy)
  return channels[0].id || null;
};

/**
 * Posts a message to a Slack channel.
 *
 * Supports plain text, Block Kit blocks, and CI failure analysis formatting.
 * If no channel is specified, posts to the bot's active channel.
 *
 * @param client - Slack client instance
 * @param request - Message request with optional channel, message/blocks/analysis, and optional thread_ts
 * @returns Message response with status and details
 */
export const postMessage = async (
  client: SlackClient,
  request: SlackMessageRequest
): Promise<SlackMessagePostResponse> => {
  const { channel, message, thread_ts, blocks, attachments, analysis } = request;

  logger.info("Slack message request received", {
    channel: channel || "(using active channel)",
    hasThread: !!thread_ts,
    hasBlocks: !!blocks,
    hasAttachments: !!attachments,
    hasAnalysis: !!analysis,
  });

  try {
    // Use provided channel or fall back to bot's active channel
    let channelId: string;
    if (channel) {
      channelId = await resolveChannelId(client, channel);
    } else {
      const activeChannel = await getActiveChannel(client);
      if (!activeChannel) {
        throw new Error("Bot is not in any channel. Invite the bot to a channel first.");
      }
      channelId = activeChannel;
      logger.info("Using bot's active channel", { channelId });
    }

    const payload = buildMessagePayload(message, analysis, blocks, attachments);

    const result = await client.chat.postMessage({
      channel: channelId,
      text: payload.fallbackText,
      ...(payload.blocks && { blocks: payload.blocks }),
      ...(payload.attachments && { attachments: payload.attachments }),
      ...(thread_ts && { thread_ts }),
    });

    logger.info("Message posted to Slack", {
      channel,
      channelId,
      timestamp: result.ts,
      thread: thread_ts,
      formatted: !!analysis,
    });

    return {
      status: "sent",
      channel: channelId,
      timestamp: result.ts,
      thread_ts: result.ts,
    };
  } catch (error) {
    logger.error("Failed to post message to Slack", {
      channel,
      error: getErrorMessage(error),
    });

    return {
      status: "error",
      error: getErrorMessage(error),
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

  logger.info("Slack broadcast request received");

  try {
    const channels = await getBotMemberChannels(client);
    logger.info("Broadcasting to channels where bot is a member", {
      count: channels.length,
    });

    const results = await Promise.allSettled(
      channels.map(async (channel): Promise<SlackBroadcastChannelResult> => {
        if (!channel.id || !channel.name) {
          throw new Error("Invalid channel data");
        }

        try {
          const postResult = await client.chat.postMessage({
            channel: channel.id,
            text: message,
          });

          logger.info("Message posted to channel", {
            channelName: channel.name,
            channelId: channel.id,
            timestamp: postResult.ts,
          });

          return {
            name: channel.name,
            id: channel.id,
            status: "sent",
          };
        } catch (error) {
          logger.error("Failed to post to channel", {
            channelName: channel.name,
            channelId: channel.id,
            error: getErrorMessage(error),
          });

          return {
            name: channel.name,
            id: channel.id,
            status: "failed",
            error: getErrorMessage(error),
          };
        }
      })
    );

    const channelResults = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { name: "unknown", id: "unknown", status: "failed" as const }
    );
    const successCount = channelResults.filter((r) => r.status === "sent").length;
    const failedCount = channelResults.filter((r) => r.status === "failed").length;

    const status = failedCount === 0 ? "sent" : successCount > 0 ? "partial" : "error";

    logger.info("Broadcast completed", {
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
    logger.error("Failed to broadcast message", {
      error: getErrorMessage(error),
    });

    return {
      status: "error",
      channelsCount: 0,
      successCount: 0,
      failedCount: 0,
      error: getErrorMessage(error),
    };
  }
};
