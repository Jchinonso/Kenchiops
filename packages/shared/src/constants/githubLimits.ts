/**
 * GitHub Limits and Display Configuration
 *
 * Size limits, display constraints, and parsing configuration for GitHub operations.
 *
 * @module constants/githubLimits
 */

// ==================== Context Size Limits ====================

/**
 * Maximum size limits for GitHub context data.
 */
export const GITHUB_CONTEXT_LIMITS = {
  MAX_LOG_SIZE: 10000000, // 10MB - no truncation, let chunking pipeline handle large logs
  MAX_DIFF_SIZE: 50000, // 50KB of diff - increased for full context
  MAX_FILE_SIZE: 15000, // 15KB per file
  MAX_FILES: 10, // Maximum number of source files to fetch
  MAX_ANNOTATIONS: 50, // Maximum number of annotations - increased for full context
  MAX_COMMENT_BODY_LENGTH: 2000, // 2KB per comment body for context extraction
  MAX_RECENT_COMMENTS: 5, // Maximum recent comments to include in context
} as const;

/**
 * NOTE: Build configuration and dependency file detection is now handled by AI.
 * These constants were removed as part of the language-agnostic migration.
 * See docs/LANGUAGE_AGNOSTIC_MIGRATION.md for details.
 *
 * Previous constants removed:
 * - BUILD_CONFIG_FILES (14 JS-only files)
 * - DEPENDENCY_FILES (4 npm-only files)
 *
 * AI-based detection provides universal language support without maintenance.
 */

// ==================== Display Limits ====================

/**
 * GitHub comment formatting display limits.
 */
export const GITHUB_COMMENT_DISPLAY = {
  /** Maximum items to show in truncated lists (test failures, annotations, deps) */
  MAX_LIST_ITEMS: 3,
  /** Maximum error details to show in code block */
  MAX_ERROR_DETAILS: 5,
  /** Maximum length for test name truncation */
  MAX_TEST_NAME_LENGTH: 60,
  /** Maximum length for first test in summary */
  MAX_SUMMARY_TEST_LENGTH: 40,
  /** Maximum length for annotation message (increased for better context) */
  MAX_ANNOTATION_MESSAGE_LENGTH: 150,
  /** Maximum length for error line in code block */
  MAX_ERROR_LINE_LENGTH: 120,
  /** Maximum recommended actions to display */
  MAX_ACTIONS: 3,
  /** Maximum length for a valid file path in annotations */
  MAX_FILE_PATH_LENGTH: 200,
  /** Maximum assertions to show per file in grouped display */
  MAX_ASSERTIONS_PER_FILE: 2,
} as const;

/**
 * Display limits for CI failure notifications (Slack and GitHub).
 */
export const CI_FAILURE_DISPLAY = {
  /** Maximum number of errors to display in notifications */
  MAX_ERRORS_DISPLAYED: 2,
  /** Maximum length for truncated error messages */
  MAX_ERROR_MESSAGE_LENGTH: 100,
} as const;

/**
 * GitHub annotation display limits.
 */
export const GITHUB_ANNOTATION_LIMITS = {
  /** Maximum title length for annotations */
  MAX_TITLE_LENGTH: 100,
  /** Maximum annotations per check run */
  MAX_PER_CHECK_RUN: 50,
  /** Maximum valid line number for annotations (reasonable upper bound) */
  MAX_LINE_NUMBER: 1000000,
} as const;

// ==================== Log Parsing Limits ====================

/**
 * Limits for log parsing operations.
 */
export const LOG_PARSING_LIMITS = {
  /** Maximum log size for preprocessing - set high to avoid truncation (10MB) */
  MAX_LOG_SIZE: 10000000,
  /** Default position when no error indicator is found in logs */
  DEFAULT_ERROR_POSITION: 0,
  /** How far back to look from anchor point to capture context */
  CONTEXT_BEFORE_ANCHOR: 25000,
  /** Maximum test failures to extract - high limit to capture all before deduplication */
  MAX_TEST_FAILURES: 300,
  /** Maximum size for build config diff in characters */
  MAX_BUILD_CONFIG_DIFF_SIZE: 5000,
  /** Minimum remaining characters to include a truncated line in error body */
  MIN_TRUNCATION_CHARS: 20,
  /** Maximum characters to capture for error body (default pass) */
  DEFAULT_ERROR_BODY_CHARS: 2000,
  /** Maximum characters to capture for error body when fallback is generic */
  EXTENDED_ERROR_BODY_CHARS: 4000,
  /** Number of lines to scan after a failure marker for error context (default pass) */
  DEFAULT_ERROR_CONTEXT_LINES: 50,
  /** Number of lines to scan when fallback is generic */
  EXTENDED_ERROR_CONTEXT_LINES: 100,
} as const;

// ==================== Truncation Configuration ====================

/**
 * Tier-aware truncation window configuration.
 *
 * Maps anchor tier to the fraction of maxSize to allocate BEFORE the anchor.
 * The remaining fraction goes AFTER the anchor.
 *
 * WHY TIER-BASED WEIGHTS:
 * - CI boundary markers (tier one/two): Actual error is BEFORE "exit code 1". Need 70% before.
 * - Stack traces (tier three): Exception at anchor, some context needed before. 40% before.
 * - Generic errors (tier four): Could be anywhere, balanced 50/50.
 * - Test summaries (tier zero): Summary at end, failures listed above. 85% before to capture all.
 *
 * Keys correspond to ANCHOR_TIERS values from anchorSelection.ts:
 * zero=SUMMARY, one=CI_BOUNDARY, two=INFRA_KILLER, three=STACK_TRACE, four=GENERIC_ERROR, negative_one=FALLBACK
 */
export const TRUNCATION_WINDOW_CONFIG = {
  /** Fraction of window before anchor for test summary (tier zero) - high to capture all failures */
  SUMMARY_BEFORE_FRACTION: 0.85,
  /** Fraction of window before anchor for CI boundary markers (tier one) */
  CI_BOUNDARY_BEFORE_FRACTION: 0.7,
  /** Fraction of window before anchor for infra killers (tier two) */
  INFRA_KILLER_BEFORE_FRACTION: 0.7,
  /** Fraction of window before anchor for stack traces (tier three) */
  STACK_TRACE_BEFORE_FRACTION: 0.4,
  /** Fraction of window before anchor for generic errors (tier four) */
  GENERIC_ERROR_BEFORE_FRACTION: 0.5,
  /** Fraction of window before anchor for fallback (negative one) */
  FALLBACK_BEFORE_FRACTION: 0.5,
  /** Default fraction if tier not found */
  DEFAULT_BEFORE_FRACTION: 0.5,
} as const;

// ==================== PR Context ====================

/**
 * PR context correlation configuration.
 * Controls file correlation scoring and display limits.
 */
export const PR_CONTEXT_CORRELATION = {
  /** Maximum correlated changes to display */
  MAX_CORRELATIONS_DISPLAYED: 3,
  /** Minimum correlation score to include (zero to one scale) */
  MIN_CORRELATION_SCORE: 0.1,
  /** Score weight for matching base file names */
  SCORE_SAME_BASE_NAME: 0.6,
  /** Score weight for same directory */
  SCORE_SAME_DIRECTORY: 0.3,
  /** Score weight for parent/child directory relationship */
  SCORE_PARENT_CHILD_DIR: 0.15,
  /** Score weight for same service */
  SCORE_SAME_SERVICE: 0.1,
  /** Maximum correlation score cap */
  MAX_SCORE: 1,
  /** Percentage multiplier for display */
  PERCENTAGE_MULTIPLIER: 100,
} as const;

// ==================== Miscellaneous ====================

/**
 * Commit SHA display length for short format.
 * Standard GitHub short SHA length.
 */
export const SHORT_COMMIT_SHA_LENGTH = 7 as const;
