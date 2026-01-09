/**
 * Slack Bot Feature Constants
 *
 * Configuration for Q&A and document ingestion features.
 *
 * @module constants/slackBotFeatures
 */

// ==================== Q&A Configuration ====================

/**
 * Q&A feature configuration for RAG-powered question answering.
 */
export const QA_CONFIG = {
  /** Minimum query length to trigger Q&A search */
  MIN_QUERY_LENGTH: 10,
  /** Maximum results to show in response */
  MAX_RESULTS_TO_SHOW: 3,
  /** Minimum similarity score for results (0-1) */
  MIN_SIMILARITY_THRESHOLD: 0.65,
  /** Maximum snippet length in characters */
  MAX_SNIPPET_LENGTH: 500,
  /** Top K results to fetch before filtering */
  SEARCH_TOP_K: 10,
  /** Minimum word boundary position ratio for truncation */
  TRUNCATION_WORD_BOUNDARY_RATIO: 0.7,
  /** Maximum title length extracted from content */
  MAX_EXTRACTED_TITLE_LENGTH: 100,
  /** Maximum query length to display in context */
  MAX_DISPLAY_QUERY_LENGTH: 50,
} as const;

/**
 * Patterns to detect question-like messages.
 * Order matters - more specific patterns first.
 */
export const QA_QUESTION_PATTERNS = [
  /^(how|what|why|when|where|who|which|can|does|is|are|should|would|could)\s/i,
  /\?$/,
  /^(explain|describe|show|tell|help|find)\s/i,
] as const;

/**
 * Action IDs for Q&A feedback buttons.
 */
export const QA_ACTION_IDS = {
  /** Q&A result helpful button */
  QA_HELPFUL: "qa_feedback_helpful",
  /** Q&A result not helpful button */
  QA_NOT_HELPFUL: "qa_feedback_not_helpful",
} as const;

/**
 * Q&A response messages.
 */
export const QA_MESSAGES = {
  /** No results found message */
  NO_RESULTS: "I couldn't find any relevant information in our knowledge base for that question.",
  /** Query too short message */
  QUERY_TOO_SHORT: "Please provide a more detailed question (at least 10 characters).",
  /** Searching message */
  SEARCHING: "Searching our knowledge base...",
  /** Error message */
  SEARCH_ERROR: "Sorry, I encountered an error while searching. Please try again.",
} as const;

/**
 * Checks if a message looks like a question that should trigger Q&A.
 *
 * @param text - The message text to check
 * @returns True if the message appears to be a question
 */
export const isQuestionLike = (text: string): boolean => {
  const trimmedText = text.trim();
  return QA_QUESTION_PATTERNS.some((pattern) => pattern.test(trimmedText));
};

// ==================== Document Ingestion Configuration ====================

/**
 * Document ingestion configuration for user-submitted documents.
 */
export const DOC_INGESTION_CONFIG = {
  /** Minimum title length */
  MIN_TITLE_LENGTH: 5,
  /** Maximum title length */
  MAX_TITLE_LENGTH: 200,
  /** Minimum content length */
  MIN_CONTENT_LENGTH: 50,
  /** Maximum content length for modal input */
  MAX_CONTENT_LENGTH: 3000,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 500,
  /** Supported file extensions for upload */
  SUPPORTED_EXTENSIONS: [".md", ".txt", ".mdx"] as const,
  /** Maximum file size in bytes (100KB) */
  MAX_FILE_SIZE_BYTES: 100 * 1024,
} as const;

/**
 * Patterns to detect document ingestion requests in mentions.
 */
export const DOC_INGESTION_PATTERNS = [
  /^(add|ingest|upload|save)\s+(this|document|doc|file)/i,
  /^(add|save)\s+to\s+(knowledge|kb)/i,
  /ingest\s+this/i,
] as const;

/**
 * Checks if a message is requesting document ingestion.
 *
 * @param text - The message text to check
 * @returns True if the message is requesting document ingestion
 */
export const isDocIngestionRequest = (text: string): boolean => {
  const trimmedText = text.trim();
  return DOC_INGESTION_PATTERNS.some((pattern) => pattern.test(trimmedText));
};

/**
 * Document ingestion messages.
 */
export const DOC_INGESTION_MESSAGES = {
  /** Success message */
  SUCCESS: (title: string, chunks: number): string =>
    `Document "${title}" added to knowledge base (${chunks} chunks created)`,
  /** No file attached message */
  NO_FILE:
    "Please attach a file (.md, .txt) to ingest, or use `/kenchi add-doc` to add content directly.",
  /** File too large message */
  FILE_TOO_LARGE: "File is too large. Maximum size is 100KB.",
  /** Unsupported file type message */
  UNSUPPORTED_TYPE: "Unsupported file type. Please use .md, .txt, or .mdx files.",
  /** Ingestion error message - generic fallback */
  ERROR: "Failed to ingest document. Please try again.",
  /** Modal success message */
  MODAL_SUCCESS: "Document submitted successfully and is being processed.",
  /** File processing error - more specific than generic ERROR */
  PROCESSING_ERROR:
    "Failed to process file content. The file may be corrupted or contain invalid characters.",
} as const;

// ==================== UI Error Messages ====================

/**
 * User-facing error messages for Slack Bot UI interactions.
 * These messages are designed to be helpful and actionable.
 */
export const SLACK_UI_ERROR_MESSAGES = {
  /** Configuration modal failed to open */
  CONFIG_MODAL_FAILED:
    "Failed to open configuration. This may be due to a temporary connection issue. Please try again in a few seconds.",
  /** Status check failed */
  STATUS_CHECK_FAILED:
    "Failed to check connection status. Please verify your network connection and try again later.",
  /** Document modal failed to open */
  DOC_MODAL_FAILED:
    "Failed to open the document form. Please ensure you have the necessary permissions and try again.",
  /** Document save failed */
  DOC_SAVE_FAILED:
    "Failed to save document to knowledge base. The content may be too large or contain unsupported formatting. Please check your input and try again.",
  /** App Home dashboard failed to load */
  DASHBOARD_LOAD_FAILED: "Failed to load dashboard. Please refresh or check back in a moment.",
  /** Repository fetch failed */
  REPO_FETCH_FAILED:
    "Failed to fetch available repositories. Please ensure the GitHub App is installed and has access to your repositories.",
  /** Generic modal open error */
  MODAL_OPEN_FAILED: "Failed to open dialog. Please try again in a few seconds.",
} as const;

/**
 * Error codes for document ingestion with user-friendly messages.
 * Used for mapping internal error codes to display messages.
 */
export const DOC_INGESTION_ERROR_CODES = {
  UNSUPPORTED_TYPE: {
    code: "unsupported_type",
    message: "Unsupported file type. Please use .md, .txt, or .mdx files.",
  },
  TOO_LARGE: {
    code: "too_large",
    message: "File too large. Maximum size is 100KB.",
  },
  PROCESSING_FAILED: {
    code: "ingestion_failed",
    message: "Failed to process file. The content may be corrupted or unreadable.",
  },
  DOWNLOAD_FAILED: {
    code: "download_failed",
    message: "Failed to download file from Slack. Please try uploading again.",
  },
  VALIDATION_FAILED: {
    code: "validation_failed",
    message: "File content validation failed. Please check the file format.",
  },
} as const;
