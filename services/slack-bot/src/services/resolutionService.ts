/**
 * Resolution Service
 *
 * Tracks CI failure threads and detects resolutions from Slack conversations.
 * Integrates with RAG ingestion to capture knowledge from resolved issues.
 *
 * @module services/resolutionService
 */

import type { WebClient } from "@slack/web-api";
import {
  logger,
  getErrorMessage,
  ingestSlackResolution,
  RESOLUTION_SERVICE_CONFIG,
  type SlackThread,
  type SlackMessage,
  type SlackReaction,
  type IngestSlackResolutionInput,
  type SlackResolutionFailureContext,
} from "@kenchi/shared";
import type {
  SlackAPIMessage,
  CIFailureThreadInfo,
  TrackCIFailureThreadInput,
} from "./resolutionServiceTypes.js";

export type { TrackCIFailureThreadInput } from "./resolutionServiceTypes.js";

// ==================== Store ====================

/**
 * In-memory store for tracked CI failure threads.
 * Key format: "channelId:threadTs"
 */
const ciFailureThreads = new Map<string, CIFailureThreadInfo>();

/**
 * Build thread store key from channel and thread timestamp
 */
const buildThreadKey = (channelId: string, threadTs: string): string => `${channelId}:${threadTs}`;

// ==================== Cleanup ====================

/**
 * Cleanup old tracked threads
 */
const cleanupOldThreads = (): void => {
  const now = Date.now();
  const keysToDelete = Array.from(ciFailureThreads.entries())
    .filter(
      ([, info]) => now - info.trackedAt.getTime() > RESOLUTION_SERVICE_CONFIG.MAX_THREAD_AGE_MS
    )
    .map(([key]) => key);

  keysToDelete.forEach((key) => ciFailureThreads.delete(key));

  if (keysToDelete.length > 0) {
    logger.info("Cleaned up old CI failure thread entries", {
      deletedCount: keysToDelete.length,
      remainingCount: ciFailureThreads.size,
    });
  }
};

// Start periodic cleanup
setInterval(cleanupOldThreads, RESOLUTION_SERVICE_CONFIG.CLEANUP_INTERVAL_MS);

// ==================== Thread Message Fetching ====================

/**
 * Convert Slack API reaction to our SlackReaction type
 */
const convertReaction = (reaction: {
  readonly name?: string;
  readonly count?: number;
  readonly users?: readonly string[];
}): SlackReaction => ({
  name: reaction.name ?? "",
  count: reaction.count ?? 0,
  users: reaction.users,
});

/**
 * Convert Slack API message to our SlackMessage type
 */
const convertToSlackMessage = (msg: SlackAPIMessage): SlackMessage => ({
  ts: msg.ts ?? "",
  userId: msg.user ?? "",
  username: msg.username,
  text: msg.text ?? "",
  reactions: msg.reactions?.map(convertReaction),
  isBot: msg.bot_id !== undefined,
  threadTs: msg.thread_ts,
});

/**
 * Fetch all messages in a thread from Slack
 */
const fetchThreadMessages = async (
  client: WebClient,
  channelId: string,
  threadTs: string
): Promise<readonly SlackMessage[]> => {
  try {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
    });

    if (!result.messages || result.messages.length === 0) {
      return [];
    }

    // Cast to our local type since Slack API types are complex
    const messages = result.messages as readonly SlackAPIMessage[];
    return messages.map(convertToSlackMessage);
  } catch (error) {
    logger.error("Failed to fetch thread messages", {
      channelId,
      threadTs,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Build SlackThread object from stored info and fetched messages
 */
const buildSlackThread = (
  info: CIFailureThreadInfo,
  messages: readonly SlackMessage[]
): SlackThread => ({
  channelId: info.channelId,
  channelName: info.channelName,
  threadTs: info.threadTs,
  messages,
  originalIssue: info.errorMessage,
  repository: info.repository,
});

/**
 * Build failure context from stored info
 */
const buildFailureContext = (info: CIFailureThreadInfo): SlackResolutionFailureContext => ({
  checkName: info.checkNames[0],
  errorMessage: info.errorMessage,
});

// ==================== Public API ====================

/**
 * Track a CI failure thread for resolution detection.
 * Called when a CI failure message is posted to Slack.
 */
export const trackCIFailureThread = (input: TrackCIFailureThreadInput): void => {
  const key = buildThreadKey(input.channelId, input.threadTs);

  const info: CIFailureThreadInfo = {
    ...input,
    trackedAt: new Date(),
  };

  ciFailureThreads.set(key, info);

  logger.info("Tracking CI failure thread for resolution", {
    channelId: input.channelId,
    threadTs: input.threadTs,
    repository: input.repository,
    checkNames: input.checkNames.slice(0, 3),
    totalTracked: ciFailureThreads.size,
  });
};

/**
 * Check if a message is in a tracked CI failure thread.
 */
export const isInCIFailureThread = (channelId: string, threadTs?: string): boolean => {
  if (!threadTs) {
    return false;
  }
  const key = buildThreadKey(channelId, threadTs);
  return ciFailureThreads.has(key);
};

/**
 * Get tracked thread info if it exists.
 */
export const getTrackedThread = (
  channelId: string,
  threadTs: string
): CIFailureThreadInfo | undefined => {
  const key = buildThreadKey(channelId, threadTs);
  return ciFailureThreads.get(key);
};

/**
 * Check for and ingest resolution from a CI failure thread.
 * Called when a message is detected in a tracked thread.
 */
export const checkAndIngestResolution = async (
  client: WebClient,
  channelId: string,
  threadTs: string
): Promise<{ detected: boolean; error?: string }> => {
  const key = buildThreadKey(channelId, threadTs);
  const info = ciFailureThreads.get(key);

  if (!info) {
    return { detected: false, error: "Thread not tracked" };
  }

  try {
    // Fetch thread messages
    const messages = await fetchThreadMessages(client, channelId, threadTs);

    // Need at least 2 messages (original + at least one reply)
    if (messages.length < RESOLUTION_SERVICE_CONFIG.MIN_THREAD_MESSAGES) {
      logger.debug("Thread too short for resolution detection", {
        channelId,
        threadTs,
        messageCount: messages.length,
      });
      return { detected: false };
    }

    // Build thread object and detect resolution
    const thread = buildSlackThread(info, messages);
    const failureContext = buildFailureContext(info);

    const input: IngestSlackResolutionInput = {
      thread,
      tenantId: info.tenantId,
      repository: info.repository,
      failureContext,
    };

    const result = await ingestSlackResolution(input);

    if (result.resolutionDetected) {
      logger.info("Resolution detected and ingested from CI failure thread", {
        channelId,
        threadTs,
        repository: info.repository,
        confidence: result.resolution?.confidence,
        chunksCreated: result.ingestionResult?.chunksCreated,
      });

      // Remove from tracking after successful ingestion
      ciFailureThreads.delete(key);
    }

    return { detected: result.resolutionDetected };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    logger.error("Failed to check/ingest resolution", {
      channelId,
      threadTs,
      error: errorMsg,
    });
    return { detected: false, error: errorMsg };
  }
};

/**
 * Get statistics about tracked threads (for debugging/monitoring).
 */
export const getResolutionServiceStats = (): {
  trackedThreads: number;
  oldestThreadAge?: number;
} => {
  if (ciFailureThreads.size === 0) {
    return { trackedThreads: 0 };
  }

  const now = Date.now();
  const ages = Array.from(ciFailureThreads.values()).map((info) => now - info.trackedAt.getTime());
  const oldestAge = Math.max(...ages);

  return {
    trackedThreads: ciFailureThreads.size,
    oldestThreadAge: oldestAge,
  };
};
