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
 * Patterns for validating and extracting file locations from annotation paths.
 * Used to ensure annotation paths are actual file paths, not error text.
 */
export const FILE_PATH_VALIDATION = {
  /**
   * Pattern to extract path:line from strings.
   * Handles: file.ext:42, file.ext:42:10, path/to/file.ext:42
   */
  LOCATION_PATTERN: /^([^\s:()]+\.[a-zA-Z0-9]{1,10}):(\d+)(?::\d+)?/,
  /**
   * Pattern to validate a string looks like a real file path.
   * Requires: alphanumeric with dots, slashes, underscores, hyphens; ends with extension.
   */
  VALID_PATH_PATTERN: /^[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]{1,10}$/,
  /**
   * Pattern to identify evidence ID prefixes in annotation titles.
   * These should be stripped from display as they're internal identifiers.
   */
  EVIDENCE_TITLE_PATTERN: /^(check|anno|test|dep|cfg|wflog|diff|src|comment)#/i,
  /**
   * Pattern to strip evidence prefixes from messages (e.g., "[anno#1] message").
   */
  EVIDENCE_PREFIX_PATTERN: /^\s*\[[a-z]+#[^\]]+\]\s*/i,
} as const;

/**
 * Limits for log parsing operations.
 */
export const LOG_PARSING_LIMITS = {
  /** Maximum log size for simplified pipeline preprocessing (50KB) */
  MAX_LOG_SIZE: 50000,
  /** Default position when no error indicator is found in logs */
  DEFAULT_ERROR_POSITION: 0,
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
  // Python traceback: File "path/file.py", line 12
  /File\s+["']([^"']+\.[a-zA-Z0-9]+)["'],\s*line\s*(\d+)/gm,
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
  STALE: "stale",
  NEUTRAL: "neutral",
  ACTION_REQUIRED: "action_required",
} as const;

/**
 * GitHub annotation severity levels.
 */
export const GITHUB_ANNOTATION_LEVEL = {
  FAILURE: "failure",
  WARNING: "warning",
  NOTICE: "notice",
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

/**
 * Text sanitization patterns for annotation messages and log preprocessing.
 */
export const TEXT_SANITIZATION_PATTERNS = {
  /**
   * Pattern to match ANSI escape codes for terminal colors/formatting.
   * Matches SGR (Select Graphic Rendition) sequences and other control codes.
   */
  ANSI_ESCAPE_CODES:
    // eslint-disable-next-line no-control-regex -- Intentional: matching ANSI escape sequences
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
  /**
   * Simple ANSI escape pattern for log preprocessing.
   * Matches ESC[...m sequences commonly used for colors.
   */
  // eslint-disable-next-line no-control-regex -- Intentional: matching ANSI escape sequences
  ANSI_SIMPLE: /\x1b\[[0-9;]*m/g,
  /**
   * CI timestamp pattern for GitHub Actions logs.
   * Matches ISO 8601 timestamps at line starts: 2025-12-28T17:31:34.1659529Z
   */
  CI_TIMESTAMP: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm,
} as const;

/**
 * Commit SHA display length for short format.
 * Standard GitHub short SHA length (7 characters).
 */
export const SHORT_COMMIT_SHA_LENGTH = 7;

/**
 * PR context correlation configuration.
 * Controls file correlation scoring and display limits.
 */
export const PR_CONTEXT_CORRELATION = {
  /** Maximum correlated changes to display */
  MAX_CORRELATIONS_DISPLAYED: 3,
  /** Minimum correlation score to include (0-1 scale) */
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
