/**
 * GitHub-related constants - context limits, patterns, and display settings.
 */

/**
 * Maximum size limits for GitHub context data.
 */
export const GITHUB_CONTEXT_LIMITS = {
  MAX_LOG_SIZE: 200000, // 200KB of logs - increased to capture all test failures
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
  /** Maximum log size for simplified pipeline preprocessing (200KB) */
  MAX_LOG_SIZE: 200000,
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

/**
 * Tier-aware truncation window configuration.
 *
 * Maps anchor tier to the fraction of maxSize to allocate BEFORE the anchor.
 * The remaining fraction goes AFTER the anchor.
 *
 * WHY TIER-BASED WEIGHTS:
 * - CI boundary markers (tier 1/2): Actual error is BEFORE "exit code 1". Need 70% before.
 * - Stack traces (tier 3): Exception at anchor, some context needed before. 40% before.
 * - Generic errors (tier 4): Could be anywhere, balanced 50/50.
 * - Test summaries (tier 0): Summary at end, failures listed above. 85% before to capture all.
 *
 * Keys correspond to ANCHOR_TIERS values from anchorSelection.ts:
 * 0=SUMMARY, 1=CI_BOUNDARY, 2=INFRA_KILLER, 3=STACK_TRACE, 4=GENERIC_ERROR, -1=FALLBACK
 */
export const TRUNCATION_WINDOW_CONFIG = {
  /** Fraction of window before anchor for test summary (tier 0) - high to capture all failures */
  SUMMARY_BEFORE_FRACTION: 0.85,
  /** Fraction of window before anchor for CI boundary markers (tier 1) */
  CI_BOUNDARY_BEFORE_FRACTION: 0.7,
  /** Fraction of window before anchor for infra killers (tier 2) */
  INFRA_KILLER_BEFORE_FRACTION: 0.7,
  /** Fraction of window before anchor for stack traces (tier 3) */
  STACK_TRACE_BEFORE_FRACTION: 0.4,
  /** Fraction of window before anchor for generic errors (tier 4) */
  GENERIC_ERROR_BEFORE_FRACTION: 0.5,
  /** Fraction of window before anchor for fallback (-1) */
  FALLBACK_BEFORE_FRACTION: 0.5,
  /** Default fraction if tier not found */
  DEFAULT_BEFORE_FRACTION: 0.5,
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
 * Generic error terms - used as fallback when no test failures found.
 */
export const ERROR_INDICATORS = ["error", "Error", "ERROR", "failed", "Failed", "FAILED"] as const;

// ==================== Tiered CI Failure Patterns ====================
//
// ANCHOR SELECTION STRATEGY (Language-Agnostic):
// We use a tiered approach where higher tiers represent more definitive failure signals.
// For ties within a tier, we prefer the LATEST match (closer to end of logs) because:
// - CI systems append output chronologically
// - Final failure summaries appear at the end
// - Early matches are often warnings, retries, or non-fatal errors
//
// HOW TO EXTEND PATTERNS SAFELY:
// 1. Add new patterns to the appropriate tier based on their signal strength
// 2. Keep patterns language-agnostic (no framework-specific syntax)
// 3. Prefer patterns that match structural markers, not content
// 4. Test with logs that have early benign matches to ensure tiering works
// 5. Avoid patterns that could match in success messages (e.g., "PASS" alone)

/**
 * Tier 1: Explicit CI failure boundary markers.
 * These indicate the CI system itself has determined failure.
 * Highest priority - most reliable signal that something failed.
 */
export const CI_FAILURE_TIER1_PATTERNS = [
  // GitHub Actions error annotation
  /##\[error\]/g,
  // GitHub Actions step failure
  /Process completed with exit code [1-9]\d*/g,
  // Generic CI job failure markers
  /Job failed|Build failed|Pipeline failed/gi,
  // GitLab CI failure marker
  /ERROR: Job failed:/g,
  // Azure DevOps failure
  /##vso\[task\.complete result=Failed/g,
  // CircleCI failure
  /Exited with code exit status [1-9]/g,
] as const;

/**
 * Tier 2: Infrastructure killer markers.
 * These indicate system-level failures that are always fatal.
 * Language-agnostic infrastructure issues.
 */
export const CI_FAILURE_TIER2_PATTERNS = [
  // Out of memory / killed by OOM killer (exit 137 = 128 + SIGKILL(9))
  /(?:Out of memory|OOM|Killed|exit(?:ed)?\s*(?:code\s*)?137|signal:\s*killed|Cannot allocate memory)/gi,
  // Timeout / deadline exceeded
  /(?:timeout|timed?\s*out|deadline exceeded|context deadline exceeded|execution expired)/gi,
  // Disk full / no space
  /(?:No space left|disk full|ENOSPC|cannot write|write failed.*space)/gi,
  // Network failures (DNS, TLS, connection)
  /(?:ECONNRESET|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|DNS.*failed|getaddrinfo|certificate.*(?:expired|invalid|error)|TLS.*(?:error|failed)|SSL.*(?:error|failed))/gi,
  // Permission / auth failures
  /(?:permission denied|EACCES|EPERM|access denied|401 Unauthorized|403 Forbidden|authentication failed|auth.*error)/gi,
  // Rate limiting
  /(?:rate limit|429 Too Many|throttled|API rate limit exceeded)/gi,
  // Segmentation fault / core dump
  /(?:Segmentation fault|SIGSEGV|core dumped|signal 11)/gi,
] as const;

/**
 * Tier 3: Stack traces and exception markers.
 * These indicate application-level errors with diagnostic information.
 */
export const CI_FAILURE_TIER3_PATTERNS = [
  // Stack traces with file:line (universal pattern)
  /(?:at\s+.+:\d+:\d*|File\s+["'].+["'],\s*line\s*\d+)/g,
  // Common exception/error type markers
  /(?:Error:|Exception:|Traceback \(most recent call last\)|panic:|panicked at|fatal error:)/g,
  // Assertion failures (universal)
  /(?:AssertionError|assert(?:ion)? failed|ASSERT|Assertion .+ failed)/gi,
  // Test failure summary lines (with counts)
  /(?:\d+\s+(?:failed|errors?|failures?)(?:\s*,|\s+\d|\s*$))/gi,
  // Exit codes indicating failure (non-zero, but not 137 which is Tier 2)
  /(?:exit(?:ed)?\s*(?:code\s*)?(?:[1-9]|[1-9]\d|1[0-2]\d|13[0-68-9]|1[4-9]\d|[2-9]\d{2})(?:\s|$))/gi,
] as const;

/**
 * Tier 4: Generic error indicators.
 * Fallback patterns when more specific markers aren't found.
 * Lower priority to avoid false positives from warnings/retries.
 */
export const CI_FAILURE_TIER4_PATTERNS = [
  // Error level markers in structured logs (must be at line start or in brackets)
  /(?:^\s*\[?(?:ERROR|FATAL|CRITICAL)\]?:?\s|"level"\s*:\s*"(?:error|fatal|critical)")/gim,
  // Build system failure markers
  /(?:BUILD FAILED|FAILED:|npm ERR!|yarn error|pip.*error:|cargo.*error\[)/gi,
  // Compiler/linter errors (generic)
  /(?:error\s*(?:TS|CS|RS|C)\d+:|error:.*expected|undefined reference to)/gi,
] as const;

/**
 * Combined CI failure patterns for backward compatibility.
 * @deprecated Use tiered patterns (CI_FAILURE_TIER*_PATTERNS) for better anchor selection.
 */
export const CI_FAILURE_PATTERNS = [
  ...CI_FAILURE_TIER1_PATTERNS,
  ...CI_FAILURE_TIER2_PATTERNS,
  ...CI_FAILURE_TIER3_PATTERNS,
  ...CI_FAILURE_TIER4_PATTERNS,
] as const;

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
   * Comprehensive pattern to match ANSI escape codes for terminal colors/formatting.
   * Matches SGR (Select Graphic Rendition) sequences and other control codes.
   * Use this for thorough ANSI removal.
   */
  ANSI_ESCAPE_CODES:
    // eslint-disable-next-line no-control-regex -- Intentional: matching ANSI escape sequences
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
  /**
   * Simple ANSI escape pattern for basic log preprocessing.
   * Matches ESC[...m sequences commonly used for colors.
   * @deprecated Use ANSI_ESCAPE_CODES for more thorough removal.
   */
  // eslint-disable-next-line no-control-regex -- Intentional: matching ANSI escape sequences
  ANSI_SIMPLE: /\x1b\[[0-9;]*m/g,
  /**
   * CI timestamp pattern for GitHub Actions logs.
   * Matches ISO 8601 timestamps at line starts: 2025-12-28T17:31:34.1659529Z
   * Safe to strip as these are CI-injected, not application output.
   */
  CI_TIMESTAMP: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm,
  /**
   * GitHub Actions group markers that can be stripped.
   * These are CI presentation markers, not error content.
   */
  CI_GROUP_MARKERS: /^##\[(?:group|endgroup)\].*$/gm,
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
