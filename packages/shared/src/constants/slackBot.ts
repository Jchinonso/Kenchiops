/**
 * Slack Bot service constants for timing, modals, OAuth, and configuration.
 * All slack-bot service hardcoded values should be centralized here.
 */

import { TIME_CONSTANTS } from "./time.js";

// ==================== Timing Constants ====================

/**
 * Rate limiting configuration for Slack Bot HTTP endpoints.
 */
export const SLACK_BOT_RATE_LIMITS = {
  /** Rate limit window in milliseconds (1 minute) */
  WINDOW_MS: TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
  /** Maximum requests per window for internal service calls */
  MAX_REQUESTS: 200,
  /** Redis key prefix for rate limiting */
  KEY_PREFIX: "rl:slack-bot:",
} as const;

/**
 * Timeout and interval values for Slack Bot operations.
 */
export const SLACK_BOT_TIMEOUTS = {
  /** Redis connection timeout in milliseconds */
  REDIS_CONNECTION_MS: 10000,
  /** Poll interval for notification queue worker in milliseconds */
  QUEUE_POLL_INTERVAL_MS: 1000,
  /** Maximum concurrent queue workers */
  QUEUE_MAX_CONCURRENT: 3,
  /** Graceful shutdown timeout in milliseconds */
  SHUTDOWN_TIMEOUT_MS: 10000,
  /** Legacy action timeout for backward compatibility in milliseconds */
  LEGACY_ACTION_TIMEOUT_MS: 2000,
} as const;

/**
 * Database connection pool configuration.
 */
export const SLACK_BOT_DB_CONFIG = {
  /** Maximum database connections */
  MAX_CONNECTIONS: 10,
  /** Idle timeout in milliseconds */
  IDLE_TIMEOUT_MS: 30000,
} as const;

// ==================== Modal Constants ====================

/**
 * Modal callback IDs for Slack view submissions.
 */
export const SLACK_MODAL_CALLBACKS = {
  /** Repository selection modal */
  REPO_SELECT: "repo_select_modal",
  /** Unconfigure repository modal */
  UNCONFIGURE: "unconfigure_modal",
  /** No repositories available modal */
  NO_REPOS: "no_repos_modal",
  /** No configured repositories modal */
  NO_CONFIGURED_REPOS: "no_configured_repos_modal",
  /** Add document modal */
  ADD_DOCUMENT: "add_document_modal",
} as const;

/**
 * Action IDs for Slack interactive elements.
 */
export const SLACK_ACTION_IDS = {
  /** Repository selection dropdown */
  REPO_SELECT: "repo_select_action",
  /** Unconfigure selection dropdown */
  UNCONFIGURE_SELECT: "unconfigure_select_action",
  /** Test connection button */
  TEST_CONNECTION: "test_connection",
  /** Refresh home button */
  REFRESH_HOME: "refresh_home",
  /** Connect GitHub button */
  CONNECT_GITHUB: "connect_github",
  /** View docs button */
  VIEW_DOCS: "view_docs",
  /** Get support button */
  GET_SUPPORT: "get_support",
  /** Select repository button */
  SELECT_REPOSITORY: "select_repository_button",
  /** View logs button */
  VIEW_LOGS: "view_logs",
  /** Re-run workflow button */
  RERUN_WORKFLOW: "rerun_workflow",
  /** Feedback helpful button */
  FEEDBACK_HELPFUL: "feedback_helpful",
  /** Feedback not helpful button */
  FEEDBACK_NOT_HELPFUL: "feedback_not_helpful",
  /** RAG feedback helpful button */
  RAG_FEEDBACK_HELPFUL: "rag_feedback_helpful",
  /** RAG feedback not helpful button */
  RAG_FEEDBACK_NOT_HELPFUL: "rag_feedback_not_helpful",
  /** Approve action prefix */
  APPROVE_PREFIX: "approve_action_",
  /** Reject action prefix */
  REJECT_PREFIX: "reject_action_",
  /** Document title input */
  DOC_TITLE: "doc_title_input",
  /** Document type select */
  DOC_TYPE: "doc_type_select",
  /** Document content input */
  DOC_CONTENT: "doc_content_input",
  /** Document description input */
  DOC_DESCRIPTION: "doc_description_input",
} as const;

/**
 * Regex patterns for matching action IDs with dynamic suffixes.
 */
export const SLACK_ACTION_PATTERNS = {
  /** Pattern for approve action buttons */
  APPROVE: /^approve_action_/,
  /** Pattern for reject action buttons */
  REJECT: /^reject_action_/,
} as const;

/**
 * Block IDs for Slack modal inputs.
 */
export const SLACK_BLOCK_IDS = {
  /** Repository selection block */
  REPO_SELECT: "repo_select_block",
  /** Unconfigure selection block */
  UNCONFIGURE_SELECT: "unconfigure_select_block",
  /** Document title input block */
  DOC_TITLE: "doc_title_block",
  /** Document type select block */
  DOC_TYPE: "doc_type_block",
  /** Document content input block */
  DOC_CONTENT: "doc_content_block",
  /** Document description input block */
  DOC_DESCRIPTION: "doc_description_block",
} as const;

// ==================== OAuth Constants ====================

/**
 * OAuth timing and cleanup configuration.
 */
export const SLACK_OAUTH_TIMING = {
  /** OAuth state expiry time in milliseconds (10 minutes) */
  STATE_EXPIRY_MS: 10 * TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
  /** Cleanup interval for expired OAuth states in milliseconds (5 minutes) */
  CLEANUP_INTERVAL_MS: 5 * TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
} as const;

/**
 * Required OAuth scopes for the Slack bot.
 * These scopes define what the bot can access in a workspace.
 */
export const SLACK_OAUTH_SCOPES = [
  "chat:write",
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:history",
  "mpim:history",
  "app_mentions:read",
  "commands",
  "users:read",
] as const;

/** OAuth scopes as comma-separated string for Slack API */
export const SLACK_OAUTH_SCOPES_STRING = SLACK_OAUTH_SCOPES.join(",");

// ==================== Priority Mapping ====================

/**
 * Numeric priority to string priority mapping.
 * 1=critical, 2=high, 3=medium, 4=low
 */
export const PRIORITY_NUMERIC_MAP = {
  1: "critical",
  2: "high",
  3: "medium",
  4: "low",
} as const;

/** Type for numeric priority values */
export type NumericPriority = keyof typeof PRIORITY_NUMERIC_MAP;

/** Type for string priority values from numeric map */
export type StringPriority = (typeof PRIORITY_NUMERIC_MAP)[NumericPriority];

// ==================== Messages ====================

/**
 * Standard messages for Slack Bot responses.
 */
export const SLACK_BOT_MESSAGES = {
  /** Rate limit exceeded message */
  RATE_LIMIT_EXCEEDED: "Too many requests to Slack bot service",
  /** Action queued message template */
  ACTION_QUEUED: (actionType: string): string => `Action *${actionType}* queued for processing`,
  /** Action executing message template */
  ACTION_EXECUTING: (actionType: string): string => `Executing *${actionType}*...`,
  /** Action queued for execution message template */
  ACTION_QUEUED_EXECUTING: (actionType: string): string =>
    `Queued *${actionType}* for execution...`,
  /** Legacy action in progress message */
  LEGACY_ACTION_IN_PROGRESS: "Action approved and executing...",
  /** Legacy action completed message */
  LEGACY_ACTION_COMPLETED: "Action completed successfully",
  /** Action dismissed message template */
  ACTION_DISMISSED: (actionType: string): string => `Action *${actionType}* dismissed by user`,
} as const;

// ==================== Health Check Path ====================

/**
 * Path to skip for rate limiting (health checks).
 */
export const SLACK_BOT_HEALTH_PATH = "/health";

/**
 * Check if a path should skip rate limiting.
 * @param path - The request path to check
 * @returns True if the path should skip rate limiting
 */
export const shouldSkipSlackBotRateLimit = (path: string): boolean =>
  path === SLACK_BOT_HEALTH_PATH;

// ==================== Client Cache ====================

/**
 * Slack client cache configuration.
 */
export const SLACK_CLIENT_CACHE = {
  /** Cache TTL in milliseconds (5 minutes) - clients recreated after TTL to pick up token refreshes */
  TTL_MS: 5 * TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
  /** Cleanup interval in milliseconds (1 minute) */
  CLEANUP_INTERVAL_MS: TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
} as const;

// ==================== Message Store ====================

/**
 * Message store configuration for tracking posted Slack messages.
 */
export const MESSAGE_STORE_CONFIG = {
  /** Max age for stored messages in milliseconds (1 hour) - cleanup stale entries */
  MAX_AGE_MS: TIME_CONSTANTS.MILLISECONDS_PER_MINUTE * 60,
} as const;

// ==================== Resolution Service ====================

/**
 * Resolution service configuration for tracking CI failure threads and detecting resolutions.
 */
export const RESOLUTION_SERVICE_CONFIG = {
  /** Max age for tracked threads in milliseconds (7 days) */
  MAX_THREAD_AGE_MS: TIME_CONSTANTS.MILLISECONDS_PER_DAY * 7,
  /** Minimum messages before checking for resolution */
  MIN_THREAD_MESSAGES: 2,
  /** Cleanup interval in milliseconds (1 hour) */
  CLEANUP_INTERVAL_MS: TIME_CONSTANTS.MILLISECONDS_PER_HOUR,
} as const;

// ==================== Analysis Context Store ====================

/**
 * Analysis context store configuration for lesson extraction from confirmed analyses.
 */
export const ANALYSIS_CONTEXT_STORE_CONFIG = {
  /** Max age for stored context in milliseconds (24 hours) */
  MAX_AGE_MS: TIME_CONSTANTS.MILLISECONDS_PER_DAY,
  /** Cleanup interval in milliseconds (1 hour) */
  CLEANUP_INTERVAL_MS: TIME_CONSTANTS.MILLISECONDS_PER_HOUR,
} as const;

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
