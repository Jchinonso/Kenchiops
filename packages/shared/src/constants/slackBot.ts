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
  /** Search knowledge base button */
  SEARCH_KNOWLEDGE: "search_knowledge",
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

// ==================== Feature Configurations (re-exported) ====================

// Re-export Q&A and Document Ingestion configs from features module
export {
  QA_CONFIG,
  QA_QUESTION_PATTERNS,
  QA_ACTION_IDS,
  QA_MESSAGES,
  isQuestionLike,
  DOC_INGESTION_CONFIG,
  DOC_INGESTION_PATTERNS,
  isDocIngestionRequest,
  DOC_INGESTION_MESSAGES,
  SLACK_UI_ERROR_MESSAGES,
  DOC_INGESTION_ERROR_CODES,
} from "./slackBotFeatures.js";
