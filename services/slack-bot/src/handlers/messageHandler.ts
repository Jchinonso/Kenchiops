/**
 * Handler for Slack message events.
 * Detects resolutions in CI failure threads and ingests them into RAG.
 */

import { logger, getErrorMessage } from "@kenchi/shared";
import type { MessageEvent } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { isInCIFailureThread, checkAndIngestResolution } from "../services/resolutionService.js";

/**
 * Type guard to check if message has text property.
 *
 * @param message - Slack message event
 * @returns True if message has text property
 */
const hasText = (message: MessageEvent): message is MessageEvent & { text: string } =>
  "text" in message && typeof message.text === "string";

/**
 * Type guard to check if message has channel property.
 */
const hasChannel = (message: MessageEvent): message is MessageEvent & { channel: string } =>
  "channel" in message && typeof message.channel === "string";

/**
 * Type guard to check if message has thread_ts property.
 */
const hasThreadTs = (message: MessageEvent): message is MessageEvent & { thread_ts: string } =>
  "thread_ts" in message && typeof message.thread_ts === "string";

/**
 * Handles resolution check in background (fire-and-forget).
 */
const checkResolutionInBackground = async (
  client: WebClient,
  channelId: string,
  threadTs: string
): Promise<void> => {
  try {
    const result = await checkAndIngestResolution(client, channelId, threadTs);
    if (result.detected) {
      logger.info("Resolution successfully ingested from thread", {
        channelId,
        threadTs,
      });
    }
  } catch (error) {
    logger.warn("Failed to check for resolution", {
      channelId,
      threadTs,
      error: getErrorMessage(error),
    });
  }
};

/**
 * Handles Slack message events.
 * Detects and ingests resolutions from CI failure thread replies.
 *
 * @param message - Slack message event
 * @param client - Slack WebClient for API calls
 */
export const handleMessage = async (message: MessageEvent, client: WebClient): Promise<void> => {
  // Skip bot messages to avoid loops
  if (message.subtype === "bot_message") {
    return;
  }

  if (!hasText(message) || !hasChannel(message)) {
    return;
  }

  logger.debug("Slack message received", {
    text: message.text.substring(0, 100),
    user: "user" in message ? message.user : undefined,
    channel: message.channel,
    hasThread: hasThreadTs(message),
  });

  // Check if this message is in a tracked CI failure thread
  if (hasThreadTs(message)) {
    const threadTs = message.thread_ts;
    const channelId = message.channel;

    if (isInCIFailureThread(channelId, threadTs)) {
      logger.info("Message detected in CI failure thread, checking for resolution", {
        channelId,
        threadTs,
      });

      // Fire-and-forget resolution check
      void checkResolutionInBackground(client, channelId, threadTs);
    }
  }
};
