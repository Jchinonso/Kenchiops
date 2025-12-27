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
 * Build configuration files to check for changes.
 */
export const BUILD_CONFIG_FILES = [
  "tsconfig.json",
  "tsconfig.build.json",
  "webpack.config.js",
  "webpack.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "rollup.config.js",
  "esbuild.config.js",
  ".babelrc",
  "babel.config.js",
  "jest.config.js",
  "jest.config.ts",
  ".eslintrc.js",
  ".eslintrc.json",
] as const;

/**
 * Dependency files to check for changes.
 */
export const DEPENDENCY_FILES = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
] as const;

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
  MAX_TEST_FAILURES: 50, // Increased to capture all test failures
  /** Maximum size for build config diff in characters */
  MAX_BUILD_CONFIG_DIFF_SIZE: 5000,
} as const;

/**
 * Paths to exclude when extracting file references from logs.
 */
export const EXCLUDED_PATH_PATTERNS = ["node_modules", ".test.", ".spec.", "internal/"] as const;

/**
 * Error indicators for context-preserving log truncation.
 */
export const ERROR_INDICATORS = ["error", "Error", "ERROR", "failed", "Failed", "FAILED"] as const;

/**
 * Regex patterns for extracting file references from logs.
 * Pre-compiled at module level for performance.
 */
export const FILE_REFERENCE_PATTERNS = [
  // Pattern 1: file.ts:line or file.ts:line:column
  /(?:^|[\s(])([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+)(?::\d+)?/gm,
  // Pattern 2: file.ts(line,column)
  /([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)\((\d+),\d+\)/gm,
  // Pattern 3: at ... (file.ts:line:column)
  /at\s+.*?\(([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+):\d+\)/gm,
] as const;

/**
 * Fields to exclude when parsing package.json dependency changes.
 */
export const EXCLUDED_PACKAGE_JSON_FIELDS: Readonly<Set<string>> = new Set([
  "name",
  "version",
  "description",
  "main",
  "scripts",
]);

/**
 * Regex patterns for parsing dependency changes from git diffs.
 */
export const DEPENDENCY_DIFF_PATTERNS = {
  /** Pattern for added dependencies in package.json diff */
  ADDED: /^\+\s*"([^"]+)":\s*"([^"]+)"/gm,
  /** Pattern for removed dependencies in package.json diff */
  REMOVED: /^-\s*"([^"]+)":\s*"([^"]+)"/gm,
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
