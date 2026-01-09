/**
 * Handler for Slack message events.
 * Detects resolutions in CI failure threads and ingests them into RAG.
 * Also handles file uploads for document ingestion when bot is mentioned.
 */

import { logger, getErrorMessage, isDocIngestionRequest, config } from "@kenchi/shared";
import type { MessageEvent } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { isInCIFailureThread, checkAndIngestResolution } from "../services/resolutionService.js";
import { handleFileUploadIngestion, type MessageWithFiles } from "./documentIngestionHandler.js";

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
 * Type guard to check if message has files attached.
 */
const hasFiles = (
  message: MessageEvent
): message is MessageEvent & {
  files: ReadonlyArray<{
    id: string;
    name: string;
    filetype: string;
    size: number;
    url_private: string;
  }>;
} => "files" in message && Array.isArray((message as { files?: unknown[] }).files);

/**
 * Type guard to check if message mentions the bot.
 */
const mentionsBot = (text: string): boolean =>
  // Check if message contains a bot mention pattern
  /<@[A-Z0-9]+>/.test(text);
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
 * Handles file upload ingestion in background.
 */
const handleFileIngestionInBackground = async (
  message: MessageEvent & {
    files: ReadonlyArray<{
      id: string;
      name: string;
      filetype: string;
      size: number;
      url_private: string;
    }>;
  },
  client: WebClient
): Promise<void> => {
  const text = hasText(message) ? message.text : "";
  const userId = "user" in message ? (message.user as string) : "unknown";
  const channelId = hasChannel(message) ? message.channel : "";

  const messageWithFiles: MessageWithFiles = {
    text,
    files: message.files,
    user: userId,
    channel: channelId,
    ts: message.ts,
  };

  const botToken = config.SLACK_BOT_TOKEN ?? "";

  const say = async (responseText: string): Promise<void> => {
    await client.chat.postMessage({
      channel: channelId,
      text: responseText,
      thread_ts: message.ts,
    });
  };

  await handleFileUploadIngestion(messageWithFiles, botToken, say);
};

/**
 * Handles Slack message events.
 * Detects and ingests resolutions from CI failure thread replies.
 * Also handles file uploads for document ingestion when bot is mentioned.
 *
 * @param message - Slack message event
 * @param client - Slack WebClient for API calls
 */
export const handleMessage = async (message: MessageEvent, client: WebClient): Promise<void> => {
  // Skip bot messages to avoid loops
  if (message.subtype === "bot_message") {
    return;
  }

  // Check for file uploads with bot mention for document ingestion
  if (hasFiles(message) && hasText(message) && mentionsBot(message.text)) {
    const cleanText = message.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (isDocIngestionRequest(cleanText)) {
      logger.info("File upload with ingestion request detected", {
        fileCount: message.files.length,
        user: "user" in message ? message.user : undefined,
      });

      // Handle file ingestion in background
      void handleFileIngestionInBackground(message, client);
      return;
    }
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
