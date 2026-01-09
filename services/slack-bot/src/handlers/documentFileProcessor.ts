/**
 * Document File Processor
 *
 * File processing utilities for document ingestion.
 * Handles validation, download, and ingestion of files.
 */

import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  ingestKnowledgeDoc,
  KNOWLEDGE_DOC_TYPES,
  DOC_INGESTION_CONFIG,
  DOC_INGESTION_ERROR_CODES,
  UI_EMOJI,
  type KnowledgeDocType,
} from "@kenchi/shared";

const logger = createLogger("slack-bot");

// ==================== Types ====================

/**
 * File info from Slack API
 */
export interface SlackFileInfo {
  readonly id: string;
  readonly name: string;
  readonly filetype: string;
  readonly size: number;
  readonly url_private: string;
}

/**
 * File ingestion result
 */
export interface FileIngestionResult {
  readonly filename: string;
  readonly success: boolean;
  readonly error?: string;
  readonly chunks?: number;
}

/**
 * Context for file processing
 */
export interface FileProcessingContext {
  readonly userId: string;
  readonly botToken: string;
}

// ==================== Validation Functions ====================

/**
 * Check if a file extension is supported.
 */
export const isSupportedExtension = (filename: string): boolean => {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return DOC_INGESTION_CONFIG.SUPPORTED_EXTENSIONS.includes(
    ext as (typeof DOC_INGESTION_CONFIG.SUPPORTED_EXTENSIONS)[number]
  );
};

// ==================== Extraction Functions ====================

/**
 * Extract title from filename.
 * Converts kebab-case and snake_case to Title Case.
 */
export const extractTitleFromFilename = (filename: string): string => {
  const nameWithoutExt = filename.slice(0, filename.lastIndexOf("."));
  return nameWithoutExt
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Infer document type from filename patterns.
 */
export const inferDocTypeFromFilename = (filename: string): KnowledgeDocType => {
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

// ==================== Download Functions ====================

/**
 * Download file content from Slack.
 *
 * @param fileUrl - Private URL to download from
 * @param botToken - Bot token for authorization
 * @returns File content as string
 * @throws ExternalServiceError if download fails
 */
export const downloadFileContent = async (fileUrl: string, botToken: string): Promise<string> => {
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

// ==================== Error Handling ====================

/**
 * Get user-friendly error message for error code.
 */
export const getErrorMessageForCode = (errorCode?: string): string => {
  const errorCodeMap = Object.values(DOC_INGESTION_ERROR_CODES);
  const matched = errorCodeMap.find((entry) => entry.code === errorCode);
  return matched?.message ?? "An unexpected error occurred while processing the file.";
};

// ==================== File Processing ====================

/**
 * Process a single file for ingestion.
 *
 * @param file - Slack file info
 * @param context - Processing context with user and bot token
 * @returns Ingestion result with success status
 */
export const processFileForIngestion = async (
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

// ==================== Result Formatting ====================

/**
 * Format ingestion results for Slack response.
 *
 * @param results - Array of file ingestion results
 * @returns Formatted message string
 */
export const formatIngestionResponse = (results: readonly FileIngestionResult[]): string => {
  const successResults = results.filter((result) => result.success);
  const failureResults = results.filter((result) => !result.success);

  if (successResults.length > 0 && failureResults.length === 0) {
    const totalChunks = successResults.reduce(
      (accumulator, result) => accumulator + (result.chunks ?? 0),
      0
    );
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
 * Process all files with context.
 *
 * @param files - Array of Slack files
 * @param context - Processing context
 * @returns Array of ingestion results
 */
export const processAllFilesWithContext = async (
  files: readonly SlackFileInfo[],
  context: FileProcessingContext
): Promise<readonly FileIngestionResult[]> => {
  const promises = files.map((file) => processFileForIngestion(file, context));
  return Promise.all(promises);
};
