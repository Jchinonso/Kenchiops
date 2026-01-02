/**
 * Document Ingestion Handler
 *
 * Handles user-submitted documents via:
 * 1. /kenchi add-doc slash command with modal
 * 2. File uploads with @kenchi mention
 *
 * Documents are ingested into the RAG knowledge base for Q&A retrieval.
 */

import type { SlashCommand, RespondFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { View } from "@slack/types";
import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  ingestKnowledgeDoc,
  SLACK_ACTION_IDS,
  SLACK_BLOCK_IDS,
  KNOWLEDGE_DOC_TYPES,
  DOC_INGESTION_CONFIG,
  DOC_INGESTION_MESSAGES,
  isDocIngestionRequest,
  UI_EMOJI,
  SLACK_UI_ERROR_MESSAGES,
  DOC_INGESTION_ERROR_CODES,
  type KnowledgeDocType,
} from "@kenchi/shared";
import { toSlackSDKView } from "../types/slackTypes.js";
import { buildAddDocumentModal } from "./documentModalBuilder.js";

const logger = createLogger("slack-bot");

// ==================== Types ====================

/**
 * Parsed modal submission values for document ingestion
 */
interface DocumentModalValues {
  readonly title: string;
  readonly docType: KnowledgeDocType;
  readonly content: string;
  readonly description: string;
}

/**
 * File info from Slack API
 */
interface SlackFileInfo {
  readonly id: string;
  readonly name: string;
  readonly filetype: string;
  readonly size: number;
  readonly url_private: string;
}

/**
 * Message with files attached
 */
export interface MessageWithFiles {
  readonly text?: string;
  readonly files?: readonly SlackFileInfo[];
  readonly user?: string;
  readonly channel?: string;
  readonly ts?: string;
}

/**
 * File ingestion result
 */
interface FileIngestionResult {
  readonly filename: string;
  readonly success: boolean;
  readonly error?: string;
  readonly chunks?: number;
}

/**
 * Modal values input type - matches Slack's ViewStateValue
 */
type ModalValuesInput = Record<
  string,
  Record<string, { value?: string | null; selected_option?: { value: string } | null }>
>;

/**
 * Context for file processing
 */
interface FileProcessingContext {
  readonly userId: string;
  readonly botToken: string;
}

/**
 * Say function type for Slack responses
 */
type SayFunction = (text: string) => Promise<void>;

// ==================== Command Handler ====================

/**
 * Handle /kenchi add-doc command - opens the document modal
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
 * Parse modal submission values
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
 * Handle document modal submission
 */
export const handleDocumentModalSubmit = async (
  values: ModalValuesInput,
  userId: string,
  privateMetadata: string
): Promise<{ success: boolean; error?: string }> => {
  const { title, docType, content, description } = parseModalValues(values);

  // Parse private metadata
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

// ==================== File Upload Helpers ====================

/**
 * Check if a file extension is supported
 */
const isSupportedExtension = (filename: string): boolean => {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return DOC_INGESTION_CONFIG.SUPPORTED_EXTENSIONS.includes(
    ext as (typeof DOC_INGESTION_CONFIG.SUPPORTED_EXTENSIONS)[number]
  );
};

/**
 * Extract title from filename
 */
const extractTitleFromFilename = (filename: string): string => {
  const nameWithoutExt = filename.slice(0, filename.lastIndexOf("."));
  return nameWithoutExt
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Download file content from Slack
 */
const downloadFileContent = async (fileUrl: string, botToken: string): Promise<string> => {
  const response = await fetch(fileUrl, {
    headers: {
      Authorization: `Bearer ${botToken}`,
    },
  });

  if (!response.ok) {
    throw new ExternalServiceError("slack", `Failed to download file: ${response.statusText}`);
  }

  return response.text();
};

/**
 * Infer document type from filename
 */
const inferDocTypeFromFilename = (filename: string): KnowledgeDocType => {
  const lowerName = filename.toLowerCase();

  const typePatterns: ReadonlyArray<{ pattern: RegExp; type: KnowledgeDocType }> = [
    { pattern: /runbook|how[-_]?to/i, type: KNOWLEDGE_DOC_TYPES.RUNBOOK },
    { pattern: /postmortem|incident|outage/i, type: KNOWLEDGE_DOC_TYPES.POSTMORTEM },
    { pattern: /troubleshoot|debug|fix/i, type: KNOWLEDGE_DOC_TYPES.TROUBLESHOOTING },
    { pattern: /known[-_]?issue|bug/i, type: KNOWLEDGE_DOC_TYPES.KNOWN_ISSUES },
    { pattern: /sop|procedure|process/i, type: KNOWLEDGE_DOC_TYPES.SOP },
    { pattern: /arch|design|system/i, type: KNOWLEDGE_DOC_TYPES.ARCHITECTURE },
  ];

  const matched = typePatterns.find(({ pattern }) => pattern.test(lowerName));
  return matched?.type ?? KNOWLEDGE_DOC_TYPES.DOCUMENTATION;
};

/**
 * Get user-friendly error message for error code
 */
const getErrorMessageForCode = (errorCode?: string): string => {
  const errorCodeMap = Object.values(DOC_INGESTION_ERROR_CODES);
  const matched = errorCodeMap.find((entry) => entry.code === errorCode);
  return matched?.message ?? "An unexpected error occurred while processing the file.";
};

// ==================== File Processing ====================

/**
 * Process a single file for ingestion
 */
const processFileForIngestion = async (
  file: SlackFileInfo,
  context: FileProcessingContext
): Promise<FileIngestionResult> => {
  // Validate file extension
  if (!isSupportedExtension(file.name)) {
    return {
      filename: file.name,
      success: false,
      error: DOC_INGESTION_ERROR_CODES.UNSUPPORTED_TYPE.code,
    };
  }

  // Validate file size
  if (file.size > DOC_INGESTION_CONFIG.MAX_FILE_SIZE_BYTES) {
    return { filename: file.name, success: false, error: DOC_INGESTION_ERROR_CODES.TOO_LARGE.code };
  }

  try {
    const content = await downloadFileContent(file.url_private, context.botToken);
    const title = extractTitleFromFilename(file.name);
    const docType = inferDocTypeFromFilename(file.name);

    const result = await ingestKnowledgeDoc({
      docType,
      title,
      content,
      filePath: file.name,
      metadata: {
        submittedBy: context.userId,
        submittedAt: new Date().toISOString(),
        slackFileId: file.id,
        source: "slack_file_upload",
      },
    });

    logger.info("File ingested successfully", {
      filename: file.name,
      userId: context.userId,
      chunksCreated: result.chunksCreated,
    });

    return { filename: file.name, success: true, chunks: result.chunksCreated };
  } catch (error) {
    logger.error("Failed to ingest file", {
      filename: file.name,
      error: getErrorMessage(error),
    });

    return {
      filename: file.name,
      success: false,
      error: DOC_INGESTION_ERROR_CODES.PROCESSING_FAILED.code,
    };
  }
};

/**
 * Format ingestion results for Slack response
 */
const formatIngestionResponse = (results: readonly FileIngestionResult[]): string => {
  const successResults = results.filter((result) => result.success);
  const failureResults = results.filter((result) => !result.success);

  if (successResults.length > 0 && failureResults.length === 0) {
    const totalChunks = successResults.reduce((sum, result) => sum + (result.chunks ?? 0), 0);
    const fileList = successResults.map((result) => `• ${result.filename}`).join("\n");
    return `${UI_EMOJI.success} Added ${successResults.length} document(s) to knowledge base (${totalChunks} chunks created):\n${fileList}`;
  }

  if (successResults.length > 0) {
    const successList = successResults
      .map((result) => `${UI_EMOJI.success} ${result.filename}`)
      .join("\n");
    const failList = failureResults
      .map(
        (result) =>
          `${UI_EMOJI.failure} ${result.filename}: ${getErrorMessageForCode(result.error)}`
      )
      .join("\n");
    return `Ingestion results:\n${successList}\n${failList}`;
  }

  const failList = results
    .map((result) => `• ${result.filename}: ${getErrorMessageForCode(result.error)}`)
    .join("\n");
  return `${UI_EMOJI.failure} Failed to ingest files:\n${failList}`;
};

/**
 * Process all files with context
 */
const processAllFilesWithContext = async (
  files: readonly SlackFileInfo[],
  context: FileProcessingContext
): Promise<readonly FileIngestionResult[]> => {
  const promises: Array<Promise<FileIngestionResult>> = [];
  files.forEach((file) => {
    promises.push(processFileForIngestion(file, context));
  });
  return Promise.all(promises);
};

// ==================== File Upload Handler ====================

/**
 * Handle file upload with @kenchi mention for ingestion
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
 * Check if a message contains files and is requesting ingestion
 */
export const shouldHandleFileIngestion = (message: MessageWithFiles, text: string): boolean => {
  const hasFiles = (message.files?.length ?? 0) > 0;
  return hasFiles && isDocIngestionRequest(text);
};

// Re-export modal builder for convenience
export { buildAddDocumentModal } from "./documentModalBuilder.js";
