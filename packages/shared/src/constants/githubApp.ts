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
 *
 * Design: Clean, professional look with clear visual hierarchy.
 * - Headers use consistent branding with visual separator
 * - Sections use semantic icons for quick scanning
 * - Footer is subtle to not distract from content
 */
export const GITHUB_COMMENT_TEMPLATES = {
  /** Failure analysis header - bold, attention-grabbing */
  FAILURE_HEADER: (emoji: string): string =>
    `## ${emoji} KenchiOps — CI Failure Analysis\n\n<!-- ${KENCHI_BRANDING.COMMENT_MARKER} -->\n<sub>AI-powered root cause analysis</sub>\n`,
  /** Success analysis header - positive, reassuring */
  SUCCESS_HEADER: (emoji: string): string =>
    `## ${emoji} KenchiOps — CI Analysis Complete\n\n<!-- ${KENCHI_BRANDING.COMMENT_MARKER} -->\n<sub>All checks passed</sub>\n`,
  /** Comment footer with branding - subtle, professional */
  FOOTER: (emoji: string): string =>
    `\n---\n<sub>${emoji} Powered by <a href="https://github.com/kenchi/devops">KenchiOps</a> — AI-driven DevOps Assistant</sub>`,
  /** User education tip - encouraging, actionable */
  RESOLUTION_TIP:
    "\n> 💡 **Share your fix:** When you resolve this, reply with what worked — it helps the team learn faster.\n",
  /** Section divider for visual separation */
  SECTION_DIVIDER: "\n---\n",
  /** Placeholder comment while analysis is in progress */
  ANALYZING_PLACEHOLDER: (checkNames: readonly string[]): string =>
    `## ⏳ KenchiOps — Analyzing CI Failure\n\n<!-- ${KENCHI_BRANDING.COMMENT_MARKER} -->\n\n🔍 **Analyzing ${checkNames.length} failed check${checkNames.length > 1 ? "s" : ""}:**\n${checkNames.map((name) => `- \`${name}\``).join("\n")}\n\n_This may take a few minutes for large logs. This comment will be replaced with the full analysis._\n\n---\n<sub>🤖 Powered by <a href="https://github.com/kenchi/devops">KenchiOps</a></sub>`,
} as const;

/**
 * Slack notification header templates for CI failures.
 *
 * Design: Optimized for Slack Block Kit with attention to:
 * - Immediate visual impact with clear status
 * - Scannable layout with consistent iconography
 * - Contextual colors via attachment sidebar
 */
export const SLACK_FAILURE_TEMPLATES = {
  /** CI failure header text - immediate attention */
  HEADER: "❌ KenchiOps — CI Failure Detected",
  /** CI failure notification header with build status */
  BUILD_FAILED: "🚨 CI Build Failed",
  /** Footer branding - subtle but present */
  FOOTER: "🤖 KenchiOps",
  /** User education tip for resolution tracking */
  RESOLUTION_TIP: "💡 _Reply in thread when you fix this — helps Kenchi learn for next time._",
  /** Section labels with consistent formatting */
  SECTION_WHY: "*🔍 Why:*",
  SECTION_RECOMMENDED: "*🛠️ Recommended:*",
  SECTION_ERRORS: "*📋 Errors:*",
  SECTION_CONFIDENCE: "*📊 Confidence:*",
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
  /** Minimum confidence threshold for displaying suggested fixes (0.0 to 1.0) */
  MIN_FIX_CONFIDENCE: 0.7,
  /** Maximum characters per display line in Slack to prevent overflow */
  SLACK_MAX_LINE_CHARS: 100,
  /** Maximum characters for check names line to prevent Slack overflow */
  SLACK_CHECK_NAMES_MAX_CHARS: 200,
  /** Maximum root causes to display (top N highest confidence) */
  MAX_ROOT_CAUSES: 5,
  /** Maximum characters per root cause line */
  MAX_CAUSE_LINE_CHARS: 200,
  /** Maximum annotations to display per service in GitHub comments */
  MAX_ANNOTATIONS_PER_SERVICE: 5,
  /** Maximum next steps to display in formatted output */
  MAX_NEXT_STEPS_DISPLAY: 5,
  /** Maximum top issues to display in Slack messages */
  MAX_TOP_ISSUES_DISPLAY: 3,
  /** Maximum quick actions to display in Slack messages */
  MAX_QUICK_ACTIONS_DISPLAY: 3,
} as const;

/**
 * Confidence level descriptions for human-readable output.
 */
export const CONFIDENCE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  high: "high certainty",
  medium: "moderate certainty",
  low: "low certainty",
  unknown: "uncertain",
} as const;

/**
 * Category emoji mapping for visual indicators.
 */
export const CATEGORY_EMOJI: Readonly<Record<string, string>> = {
  test: "🧪",
  build: "🔨",
  dependency: "📦",
  config: "⚙️",
  infra: "🏗️",
  runtime: "💥",
  unknown: "❓",
} as const;

// ==================== Message Variant Configuration ====================

/**
 * Message variant configurations for different failure complexity levels.
 * Determines how much detail to show based on failure count and service spread.
 */
export const MESSAGE_VARIANT_CONFIG = {
  /** Compact format: ≤5 failures, single service - minimal, focused output */
  COMPACT: {
    MAX_FAILURES: 5,
    MAX_SERVICES: 1,
    MAX_LINES: 20,
    MAX_ROOT_CAUSES: 2,
    MAX_FILES_PER_SERVICE: 3,
    INCLUDE_FULL_REPORT_LINK: false,
  },
  /** Standard format: 6-20 failures, 2-3 services - balanced detail */
  STANDARD: {
    MAX_FAILURES: 20,
    MAX_SERVICES: 3,
    MAX_LINES: 50,
    MAX_ROOT_CAUSES: 3,
    MAX_FILES_PER_SERVICE: 5,
    INCLUDE_FULL_REPORT_LINK: false,
  },
  /** Expanded format: 20+ failures, 4+ services - comprehensive with link */
  EXPANDED: {
    MAX_FAILURES: Infinity,
    MAX_SERVICES: Infinity,
    MAX_LINES: 60,
    MAX_ROOT_CAUSES: 3,
    MAX_FILES_PER_SERVICE: 5,
    INCLUDE_FULL_REPORT_LINK: true,
  },
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
