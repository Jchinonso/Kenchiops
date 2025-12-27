/**
 * GitHub App service constants for rate limiting, timeouts, and configuration.
 * All github-app service hardcoded values should be centralized here.
 */

import { TIME_CONSTANTS } from "./time.js";

// ==================== Rate Limiting ====================

/**
 * Rate limiting configuration for GitHub App HTTP endpoints.
 * Higher limits since webhooks can come in bursts during CI activity.
 */
export const GITHUB_APP_RATE_LIMITS = {
  /** Rate limit window in milliseconds (1 minute) */
  WINDOW_MS: TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
  /** Maximum requests per window for webhook bursts */
  MAX_REQUESTS: 500,
  /** Redis key prefix for rate limiting */
  KEY_PREFIX: "rl:github-app:",
} as const;

/**
 * Paths to skip for rate limiting (health checks for monitoring).
 */
export const GITHUB_APP_HEALTH_PATHS: ReadonlySet<string> = new Set(["/health", "/github/health"]);

/**
 * Check if a path should skip rate limiting.
 * @param path - The request path to check
 * @returns True if the path should skip rate limiting
 */
export const shouldSkipGitHubAppRateLimit = (path: string): boolean =>
  GITHUB_APP_HEALTH_PATHS.has(path);

// ==================== Timeouts ====================

/**
 * Timeout and interval values for GitHub App operations.
 */
export const GITHUB_APP_TIMEOUTS = {
  /** Graceful shutdown timeout in milliseconds */
  SHUTDOWN_TIMEOUT_MS: 15000,
} as const;

/**
 * Database connection pool configuration for GitHub App.
 */
export const GITHUB_APP_DB_CONFIG = {
  /** Maximum database connections */
  MAX_CONNECTIONS: 10,
  /** Idle timeout in milliseconds */
  IDLE_TIMEOUT_MS: 30000,
} as const;

// ==================== Setup Page ====================

/**
 * Setup page configuration.
 */
export const GITHUB_SETUP_CONFIG = {
  /** Delay before reloading setup page when installation is processing (ms) */
  RELOAD_DELAY_MS: 3000,
} as const;

// ==================== Messages ====================

/**
 * Standard messages for GitHub App responses.
 */
export const GITHUB_APP_MESSAGES = {
  /** Rate limit exceeded message */
  RATE_LIMIT_EXCEEDED: "Too many requests to GitHub app service",
} as const;

// ==================== Branding ====================

/**
 * KenchiOps branding constants for consistent identity across comments and checks.
 */
export const KENCHI_BRANDING = {
  /** Application name */
  APP_NAME: "KenchiOps",
  /** Comment marker for identifying KenchiOps comments on PRs */
  COMMENT_MARKER: "KenchiOps CI Failure Analysis",
  /** Check run name for GitHub status checks */
  CHECK_RUN_NAME: "KenchiOps Analysis",
  /** GitHub project URL */
  PROJECT_URL: "https://github.com/kenchi/devops",
  /** Brand description */
  TAGLINE: "AI-driven DevOps Assistant",
} as const;

/**
 * GitHub comment header and footer templates.
 * These use template functions to allow dynamic emoji insertion.
 */
export const GITHUB_COMMENT_TEMPLATES = {
  /** Failure analysis header */
  FAILURE_HEADER: (emoji: string): string => `## ${emoji} KenchiOps — CI Failure Analysis\n`,
  /** Success analysis header */
  SUCCESS_HEADER: (emoji: string): string => `## ${emoji} KenchiOps — CI Analysis Complete\n`,
  /** Comment footer with branding */
  FOOTER: (emoji: string): string =>
    `---\n*${emoji} Powered by [KenchiOps](https://github.com/kenchi/devops) — AI-driven DevOps Assistant*`,
} as const;

/**
 * Slack notification header templates for CI failures.
 */
export const SLACK_FAILURE_TEMPLATES = {
  /** CI failure header text */
  HEADER: "❌ KenchiOps — CI Failure Detected",
  /** CI failure notification header with build status */
  BUILD_FAILED: "🚨 CI Build Failed",
  /** Footer branding */
  FOOTER: "🤖 KenchiOps",
} as const;

// ==================== Formatter Configuration ====================

/**
 * Display limits for formatters to prevent overly long output.
 */
export const FORMATTER_DISPLAY_LIMITS = {
  /** Maximum test name length in Slack notifications */
  SLACK_TEST_NAME_LENGTH: 40,
  /** Maximum test name length in detailed views */
  DETAILED_TEST_NAME_LENGTH: 50,
  /** Maximum number of action buttons to display */
  MAX_ACTION_BUTTONS: 3,
  /** Maximum number of errors to display in summary */
  MAX_ERRORS_DISPLAYED: 5,
  /** Confidence percentage multiplier */
  CONFIDENCE_MULTIPLIER: 100,
} as const;

// ==================== Retry Configuration ====================

/**
 * Retry configuration for GitHub API calls.
 */
export const GITHUB_RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  MAX_RETRIES: 3,
  /** Base delay in milliseconds for exponential backoff */
  BASE_DELAY_MS: 1000,
  /** Exponential backoff base (delay = BASE_DELAY_MS * BACKOFF_BASE^attempt) */
  BACKOFF_BASE: 2,
} as const;

/**
 * GitHub API pagination configuration.
 */
export const GITHUB_PAGINATION = {
  /** Default items per page for list operations */
  DEFAULT_PER_PAGE: 100,
  /** Maximum annotations per API call (GitHub limit) */
  MAX_ANNOTATIONS_PER_CALL: 50,
} as const;

/**
 * Context fetching configuration for code snippets.
 */
export const CONTEXT_FETCH_CONFIG = {
  /** Number of lines to include before/after error line */
  CONTEXT_LINES: 10,
} as const;
