/**
 * GitHub-related constants - context limits, patterns, and display settings.
 */

/**
 * Maximum size limits for GitHub context data.
 */
export const GITHUB_CONTEXT_LIMITS = {
  MAX_LOG_SIZE: 100000, // 100KB of logs - increased for full context
  MAX_DIFF_SIZE: 50000, // 50KB of diff - increased for full context
  MAX_FILE_SIZE: 15000, // 15KB per file
  MAX_FILES: 10, // Maximum number of source files to fetch
  MAX_ANNOTATIONS: 50, // Maximum number of annotations - increased for full context
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

/**
 * GitHub webhook signature verification constants.
 */
export const GITHUB_SIGNATURE = {
  HEADER: "x-hub-signature-256",
  PREFIX: "sha256=",
} as const;

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
  /** Maximum length for annotation message */
  MAX_ANNOTATION_MESSAGE_LENGTH: 80,
  /** Maximum length for error line in code block */
  MAX_ERROR_LINE_LENGTH: 120,
  /** Maximum recommended actions to display */
  MAX_ACTIONS: 3,
} as const;

/**
 * Maximum number of test failures to extract from logs.
 */
export const LOG_PARSING_LIMITS = {
  /** Maximum test failures to extract - high limit to capture all before deduplication */
  MAX_TEST_FAILURES: 300,
  /** Maximum size for build config diff in characters */
  MAX_BUILD_CONFIG_DIFF_SIZE: 5000,
} as const;

/**
 * Paths to exclude when extracting file references from logs.
 * These are universal patterns for vendor/generated code across languages.
 * Kept minimal - AI handles language-specific filtering.
 */
export const EXCLUDED_PATH_PATTERNS = [
  // Universal vendor directories
  "node_modules",
  "vendor",
  ".venv",
  "site-packages",
  // Build output directories
  "dist/",
  "build/",
  "target/",
  // Version control
  ".git/",
  // Test files (don't fetch source for test files - focus on source code)
  ".test.",
  ".spec.",
  // Internal/generated code
  "internal/",
] as const;

/**
 * Error indicators for context-preserving log truncation.
 */
export const ERROR_INDICATORS = ["error", "Error", "ERROR", "failed", "Failed", "FAILED"] as const;

/**
 * Basic regex patterns for extracting file references from logs.
 * Uses minimal patterns - AI handles complex/language-specific extraction.
 * Pre-compiled at module level for performance.
 */
export const FILE_REFERENCE_PATTERNS = [
  // Universal: path/file.ext:line or path/file.ext:line:column
  // Works for most languages: TypeScript, Python, Go, Rust, Ruby, Java, etc.
  /(?:^|[\s("'])([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+)(?::\d+)?/gm,
  // TypeScript/C# compiler: path/file.ext(line,column)
  /([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)\((\d+),\d+\)/gm,
] as const;

/**
 * NOTE: Dependency change detection is now handled by AI.
 * Previous regex-based patterns were removed as part of language-agnostic migration.
 * AI can parse diffs from any package manager format without maintenance.
 * See docs/LANGUAGE_AGNOSTIC_MIGRATION.md for details.
 */

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
 * GitHub check run and workflow status values.
 */
export const GITHUB_STATUS = {
  COMPLETED: "completed",
  IN_PROGRESS: "in_progress",
  QUEUED: "queued",
} as const;

/**
 * GitHub check run conclusion values.
 */
export const GITHUB_CONCLUSION = {
  SUCCESS: "success",
  FAILURE: "failure",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
  TIMED_OUT: "timed_out",
} as const;

/**
 * GitHub annotation severity levels.
 */
export const GITHUB_ANNOTATION_LEVEL = {
  FAILURE: "failure",
  WARNING: "warning",
  NOTICE: "notice",
} as const;
