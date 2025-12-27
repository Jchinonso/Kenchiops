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
} as const;

/**
 * Block IDs for Slack modal inputs.
 */
export const SLACK_BLOCK_IDS = {
  /** Repository selection block */
  REPO_SELECT: "repo_select_block",
  /** Unconfigure selection block */
  UNCONFIGURE_SELECT: "unconfigure_select_block",
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
