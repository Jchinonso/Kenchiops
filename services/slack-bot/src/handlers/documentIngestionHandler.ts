/**
 * Document Ingestion Handler
 *
 * Handles user-submitted documents via:
 * 1. /kenchi add-doc slash command with modal
 * 2. File uploads with @kenchi mention
 *
 * Documents are ingested into the RAG knowledge base for Q&A retrieval.
 *
 * This is the public API that re-exports from focused modules:
 * - documentFileProcessor.ts: File processing utilities
 * - documentModalBuilder.ts: Modal building
 */

import type { SlashCommand, RespondFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { View } from "@slack/types";
import {
  createLogger,
  getErrorMessage,
  ingestKnowledgeDoc,
  SLACK_ACTION_IDS,
  SLACK_BLOCK_IDS,
  KNOWLEDGE_DOC_TYPES,
  DOC_INGESTION_CONFIG,
  DOC_INGESTION_MESSAGES,
  isDocIngestionRequest,
  SLACK_UI_ERROR_MESSAGES,
  type KnowledgeDocType,
} from "@kenchi/shared";
import { toSlackSDKView } from "../types/slackTypes.js";
import { buildAddDocumentModal } from "./documentModalBuilder.js";
import {
  type FileProcessingContext,
  processAllFilesWithContext,
  formatIngestionResponse,
} from "./documentFileProcessor.js";
import type {
  DocumentModalValues,
  MessageWithFiles,
  ModalValuesInput,
  SayFunction,
} from "./documentIngestionHandlerTypes.js";

export type { MessageWithFiles } from "./documentIngestionHandlerTypes.js";

// Re-export types and utilities for consumers
export type {
  SlackFileInfo,
  FileIngestionResult,
  FileProcessingContext,
} from "./documentFileProcessor.js";
export { buildAddDocumentModal } from "./documentModalBuilder.js";

const logger = createLogger("slack-bot");

// ==================== Command Handler ====================

/**
 * Handle /kenchi add-doc command - opens the document modal.
 */
export const handleAddDocCommand = async (
  command: SlashCommand,
  respond: RespondFn,
  client: WebClient
): Promise<void> => {
  logger.info("Add-doc command received", {
    user: command.user_id,
    channel: command.channel_id,
  });

  try {
    const view = buildAddDocumentModal(command.channel_id);

    await client.views.open({
      trigger_id: command.trigger_id,
      view: toSlackSDKView(view) as View,
    });

    logger.info("Opened add document modal", {
      user: command.user_id,
      channel: command.channel_id,
    });
  } catch (error) {
    logger.error("Failed to open add document modal", {
      error: getErrorMessage(error),
      user: command.user_id,
    });

    await respond({
      text: SLACK_UI_ERROR_MESSAGES.DOC_MODAL_FAILED,
      response_type: "ephemeral",
    });
  }
};

// ==================== Modal Submission Handler ====================

/**
 * Parse modal submission values.
 */
const parseModalValues = (values: ModalValuesInput): DocumentModalValues => {
  const title = values[SLACK_BLOCK_IDS.DOC_TITLE]?.[SLACK_ACTION_IDS.DOC_TITLE]?.value ?? "";
  const docType =
    (values[SLACK_BLOCK_IDS.DOC_TYPE]?.[SLACK_ACTION_IDS.DOC_TYPE]?.selected_option
      ?.value as KnowledgeDocType) ?? KNOWLEDGE_DOC_TYPES.DOCUMENTATION;
  const content = values[SLACK_BLOCK_IDS.DOC_CONTENT]?.[SLACK_ACTION_IDS.DOC_CONTENT]?.value ?? "";
  const description =
    values[SLACK_BLOCK_IDS.DOC_DESCRIPTION]?.[SLACK_ACTION_IDS.DOC_DESCRIPTION]?.value ?? "";

  return { title, docType, content, description };
};

/**
 * Handle document modal submission.
 */
export const handleDocumentModalSubmit = async (
  values: ModalValuesInput,
  userId: string,
  privateMetadata: string
): Promise<{ success: boolean; error?: string }> => {
  const { title, docType, content, description } = parseModalValues(values);

  // Parse private metadata
  // let: conditionally assigned from JSON.parse in try block
  let channelId: string | undefined;
  try {
    const metadata = JSON.parse(privateMetadata) as { channelId?: string };
    channelId = metadata.channelId;
  } catch {
    // Ignore parse errors
  }

  logger.info("Document modal submitted", {
    userId,
    title,
    docType,
    contentLength: content.length,
    hasDescription: description.length > 0,
    channelId,
  });

  // Validate inputs
  if (title.length < DOC_INGESTION_CONFIG.MIN_TITLE_LENGTH) {
    return {
      success: false,
      error: `Title must be at least ${DOC_INGESTION_CONFIG.MIN_TITLE_LENGTH} characters`,
    };
  }

  if (content.length < DOC_INGESTION_CONFIG.MIN_CONTENT_LENGTH) {
    return {
      success: false,
      error: `Content must be at least ${DOC_INGESTION_CONFIG.MIN_CONTENT_LENGTH} characters`,
    };
  }

  try {
    // Prepend description to content as metadata context
    const enrichedContent = description
      ? `## Context\n${description}\n\n---\n\n${content}`
      : content;

    const result = await ingestKnowledgeDoc({
      docType,
      title,
      content: enrichedContent,
      metadata: {
        submittedBy: userId,
        submittedAt: new Date().toISOString(),
        description,
        source: "slack_modal",
      },
    });

    logger.info("Document ingested from modal", {
      userId,
      title,
      docType,
      chunksCreated: result.chunksCreated,
      parentId: result.parentId,
    });

    return { success: true };
  } catch (error) {
    logger.error("Failed to ingest document from modal", {
      error: getErrorMessage(error),
      userId,
      title,
    });

    return {
      success: false,
      error: SLACK_UI_ERROR_MESSAGES.DOC_SAVE_FAILED,
    };
  }
};

// ==================== File Upload Handler ====================

/**
 * Handle file upload with @kenchi mention for ingestion.
 */
export const handleFileUploadIngestion = async (
  message: MessageWithFiles,
  botToken: string,
  say: SayFunction
): Promise<void> => {
  const text = message.text ?? "";
  const files = message.files ?? [];
  const userId = message.user ?? "unknown";

  if (!isDocIngestionRequest(text)) {
    return;
  }

  logger.info("File upload ingestion request detected", {
    userId,
    fileCount: files.length,
    text,
  });

  if (files.length === 0) {
    await say(DOC_INGESTION_MESSAGES.NO_FILE);
    return;
  }

  // Process all files
  const context: FileProcessingContext = { userId, botToken };
  const results = await processAllFilesWithContext(files, context);

  // Send formatted response
  const response = formatIngestionResponse(results);
  await say(response);
};

// ==================== Check Functions ====================

/**
 * Check if a message contains files and is requesting ingestion.
 */
export const shouldHandleFileIngestion = (message: MessageWithFiles, text: string): boolean => {
  const hasFiles = (message.files?.length ?? 0) > 0;
  return hasFiles && isDocIngestionRequest(text);
};
