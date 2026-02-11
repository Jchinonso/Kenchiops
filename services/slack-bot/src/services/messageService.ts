/**
 * Message Service
 *
 * Provides message posting and broadcasting functionality for Slack.
 * Routes messages to the correct channel based on repository-channel mappings.
 */

import {
  logger,
  getErrorMessage,
  ValidationError,
  findByGitHubInstallation,
  findChannelForRepository,
} from "@kenchi/shared";
import { trackCIFailureThread } from "./resolutionService.js";
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
import { createAnalysisAttachments } from "../formatters/ciFailureFormatter.js";
import {
  buildMessageKey,
  getMessage,
  setMessage,
  deleteMessage,
  cleanupMessageStore,
} from "./messageStore.js";
import type { MessagePayload } from "./messageServiceTypes.js";

// ==================== Payload Builders ====================

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
      fallbackText: message ?? "CI Failure Analysis",
      blocks: [...blocks] as SlackBlock[],
    };
  }

  // Priority 3: Attachments
  if (attachments) {
    return {
      fallbackText: message ?? "CI Failure Analysis",
      attachments: attachments.map((attachment) => ({
        color: attachment.color ?? "",
        fallback: attachment.fallback ?? "",
        blocks: attachment.blocks ? ([...attachment.blocks] as SlackBlock[]) : [],
      })),
    };
  }

  // Default: plain text message
  return { fallbackText: message ?? "CI Failure Analysis" };
};

// ==================== Channel Resolution ====================

/**
 * Gets the bot's active channel (the one channel it's a member of).
 */
const getActiveChannel = async (client: SlackClient): Promise<string | null> => {
  const channels = await getBotMemberChannels(client);
  return channels.length > 0 ? (channels[0].id ?? null) : null;
};

/**
 * Resolve the target channel for a message request.
 */
const resolveTargetChannel = async (
  client: SlackClient,
  channel: string | undefined
): Promise<string> => {
  if (channel) {
    const channelId = await resolveChannelId(client, channel);
    logger.info("Using explicitly provided channel", { channel, channelId });
    return channelId;
  }

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
 * Resolve channel for a repository using the channel mapping.
 */
const resolveChannelByRepository = async (
  installationId: number,
  repository: string
): Promise<string | null> => {
  const tenant = await findByGitHubInstallation(installationId);
  if (!tenant) {
    logger.warn("No tenant found for installation", { installationId });
    return null;
  }

  const mapping = await findChannelForRepository(tenant.id, repository);
  if (!mapping) {
    logger.warn("No channel mapping found for repository", {
      repository,
      tenantId: tenant.id,
      installationId,
    });
    return null;
  }

  return mapping.slackChannelId;
};

// ==================== Slack API Operations ====================

/**
 * Delete an existing Slack message
 */
const deleteSlackMessage = async (
  client: SlackClient,
  channelId: string,
  timestamp: string
): Promise<boolean> => {
  try {
    await client.chat.delete({ channel: channelId, ts: timestamp });
    return true;
  } catch (error) {
    logger.warn("Failed to delete old Slack message", {
      channelId,
      timestamp,
      error: getErrorMessage(error),
    });
    return false;
  }
};

// ==================== Public API ====================

/**
 * Posts a message to a Slack channel.
 * Supports plain text, Block Kit blocks, and CI failure analysis formatting.
 */
export const postMessage = async (
  client: SlackClient,
  request: SlackMessageRequest
): Promise<SlackMessagePostResponse> => {
  const { channel, message, thread_ts, blocks, attachments, analysis } = request;

  logger.info("Slack message request received", {
    channel: channel ?? "(auto-detect)",
    hasThread: !!thread_ts,
    hasBlocks: !!blocks,
    hasAttachments: !!attachments,
    hasAnalysis: !!analysis,
  });

  try {
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

    return { status: "error", error: getErrorMessage(error) };
  }
};

/**
 * Posts a consolidated CI failure message to Slack.
 * Uses pre-built Block Kit payload from the GitHub App's aggregation service.
 */
export const postConsolidatedMessage = async (
  client: SlackClient,
  request: ConsolidatedMessageRequest
): Promise<SlackMessagePostResponse> => {
  const { payload, repository, commit_sha, failure_count, channel, installation_id } = request;

  logger.info("Consolidated Slack message request received", {
    repository,
    commitSha: commit_sha.substring(0, 7),
    failureCount: failure_count,
    channel: channel ?? "(repository-based)",
    blockCount: payload.blocks.length,
    blocksPreview: JSON.stringify(payload.blocks).slice(0, 3000),
  });

  // Cleanup old message store entries periodically
  cleanupMessageStore();

  try {
    // Resolve target channel: explicit channel > repository mapping
    const channelId = channel
      ? await resolveChannelId(client, channel)
      : await resolveChannelByRepository(installation_id, repository);

    if (!channelId) {
      logger.warn("Skipping Slack notification - no channel mapping for repository", {
        repository,
        installationId: installation_id,
        failureCount: failure_count,
      });

      return { status: "error", error: `No channel mapping for repository: ${repository}` };
    }

    // Check for existing message and delete it
    const messageKey = buildMessageKey(repository, commit_sha);
    const existingMessage = getMessage(messageKey);

    if (existingMessage) {
      logger.info("Deleting existing Slack message for same commit", {
        repository,
        commitSha: commit_sha.substring(0, 7),
        oldTimestamp: existingMessage.timestamp,
      });

      await deleteSlackMessage(client, existingMessage.channelId, existingMessage.timestamp);
      deleteMessage(messageKey);
    }

    // Post new message
    const result = await client.chat.postMessage({
      channel: channelId,
      text: payload.text,
      blocks: [...payload.blocks] as SlackBlock[],
    });

    // Store message info for future updates
    if (result.ts) {
      setMessage(messageKey, {
        channelId,
        timestamp: result.ts,
        postedAt: new Date(),
      });

      // Track thread for resolution detection
      trackCIFailureThread({
        channelId,
        threadTs: result.ts,
        repository,
        commitSha: commit_sha,
        checkNames: payload.metadata.checkNames,
      });
    }

    logger.info("Consolidated message posted to Slack", {
      repository,
      channelId,
      timestamp: result.ts,
      failureCount: failure_count,
      replacedExisting: !!existingMessage,
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

    return { status: "error", error: getErrorMessage(error) };
  }
};

/**
 * Broadcasts a message to all channels the bot is a member of.
 */
export const broadcastMessage = async (
  client: SlackClient,
  request: SlackBroadcastRequest
): Promise<SlackBroadcastResponse> => {
  const { message } = request;

  logger.info("Slack broadcast request received");

  try {
    const channels = await getBotMemberChannels(client);
    logger.info("Broadcasting to channels where bot is a member", { count: channels.length });

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

          return { name: channel.name, id: channel.id, status: "sent" };
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

    const channelResults = results.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { name: "unknown", id: "unknown", status: "failed" as const }
    );

    const successCount = channelResults.filter(
      (channelResult) => channelResult.status === "sent"
    ).length;
    const failedCount = channelResults.filter(
      (channelResult) => channelResult.status === "failed"
    ).length;
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
    logger.error("Failed to broadcast message", { error: getErrorMessage(error) });

    return {
      status: "error",
      channelsCount: 0,
      successCount: 0,
      failedCount: 0,
      error: getErrorMessage(error),
    };
  }
};
