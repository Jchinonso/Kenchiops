/**
 * Message Service
 *
 * Provides message posting and broadcasting functionality for Slack.
 */

import { logger, getErrorMessage, ValidationError } from "@kenchi/shared";
import type {
  SlackMessageRequest,
  SlackMessagePostResponse,
  SlackBroadcastRequest,
  SlackBroadcastResponse,
  SlackBroadcastChannelResult,
  SlackBlock,
  SlackAttachment,
  CIFailureAnalysis,
  ConsolidatedMessageRequest,
} from "../types/slackTypes.js";
import { resolveChannelId, getBotMemberChannels, type SlackClient } from "./channelService.js";
import {
  createAnalysisAttachments,
  type MessageAttachment,
} from "../formatters/ciFailureFormatter.js";

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
 * Resolve the target channel for a message request.
 *
 * Priority:
 * 1. Explicit channel ID/name if provided
 * 2. Bot's active channel (fallback)
 *
 * Note: In multi-tenant mode, the channel should be provided explicitly
 * or determined by the tenant's configuration.
 *
 * @param client - Slack client instance
 * @param channel - Optional explicit channel
 * @returns Resolved channel ID
 * @throws Error if no channel can be determined
 */
const resolveTargetChannel = async (
  client: SlackClient,
  channel: string | undefined
): Promise<string> => {
  // Priority 1: Explicit channel provided
  if (channel) {
    const channelId = await resolveChannelId(client, channel);
    logger.info("Using explicitly provided channel", { channel, channelId });
    return channelId;
  }

  // Priority 2: Bot's active channel
  const activeChannel = await getActiveChannel(client);
  if (!activeChannel) {
    throw new ValidationError(
      "Cannot determine target channel. " +
        "Either provide a channel or invite the bot to a channel."
    );
  }

  logger.info("Using bot's active channel", { channelId: activeChannel });
  return activeChannel;
};

/**
 * Posts a message to a Slack channel.
 *
 * Supports plain text, Block Kit blocks, and CI failure analysis formatting.
 *
 * Channel resolution priority:
 * 1. Explicit channel ID/name if provided
 * 2. Bot's active channel (fallback)
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
    channel: channel || "(auto-detect)",
    hasThread: !!thread_ts,
    hasBlocks: !!blocks,
    hasAttachments: !!attachments,
    hasAnalysis: !!analysis,
  });

  try {
    // Resolve target channel using priority-based logic
    const channelId = await resolveTargetChannel(client, channel);

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
 * Posts a consolidated CI failure message to Slack.
 *
 * Uses pre-built Block Kit payload from the GitHub App's aggregation service.
 * This creates a single consolidated message for all failures in a commit.
 *
 * @param client - Slack client instance
 * @param request - Consolidated message request with pre-built payload
 * @returns Message response with status and details
 */
export const postConsolidatedMessage = async (
  client: SlackClient,
  request: ConsolidatedMessageRequest
): Promise<SlackMessagePostResponse> => {
  const { payload, repository, commit_sha, failure_count, channel } = request;

  logger.info("Consolidated Slack message request received", {
    repository,
    commitSha: commit_sha.substring(0, 7),
    failureCount: failure_count,
    channel: channel || "(auto-detect)",
    blockCount: payload.blocks.length,
  });

  try {
    // Resolve target channel using priority-based logic
    const channelId = await resolveTargetChannel(client, channel);

    const result = await client.chat.postMessage({
      channel: channelId,
      text: payload.text,
      blocks: [...payload.blocks] as SlackBlock[],
    });

    logger.info("Consolidated message posted to Slack", {
      repository,
      channelId,
      timestamp: result.ts,
      failureCount: failure_count,
    });

    return {
      status: "sent",
      channel: channelId,
      timestamp: result.ts,
      thread_ts: result.ts,
    };
  } catch (error) {
    logger.error("Failed to post consolidated message to Slack", {
      repository,
      failureCount: failure_count,
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
          throw new ValidationError("Invalid channel data");
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
