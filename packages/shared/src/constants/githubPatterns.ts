/**
 * GitHub Patterns and Regular Expressions
 *
 * Regex patterns for CI failures, file references, path validation, and text sanitization.
 *
 * @module constants/githubPatterns
 */

// ==================== Signature Verification ====================

/**
 * GitHub webhook signature verification constants.
 */
export const GITHUB_SIGNATURE = {
  HEADER: "x-hub-signature-256",
  PREFIX: "sha256=",
} as const;

// ==================== File Path Validation ====================

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

// ==================== Error Indicators ====================

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

// ==================== File Reference Patterns ====================

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
 * Pattern to extract a file reference with directory path from unstructured error text.
 * Matches patterns like `path/to/file.ts:123` or `(path/file.ts:45:12)`.
 * High confidence — requires a `/` (real path structure) and `.ext` (any file extension).
 *
 * Groups: [filePath, lineNumber?]
 */
export const TEST_FAILURE_FILE_INFERENCE_PATTERN =
  /(?:^|\s|[(])([a-zA-Z][^\s()]*\/[^\s():]+\.\w{1,4})(?::(\d+))?/;

/**
 * Fallback pattern for bare filenames without directory path.
 * Matches patterns like `file.ts:123`, `MyTest.java:45`, `app-config.yml:10`.
 * Lower confidence — requires `:line` suffix and restricts to realistic file extensions.
 *
 * Rejects version numbers (`v1.2.3:45`), Java packages (`java.lang.null:123`),
 * error codes (`error.code:404`), and numeric suffixes (`config.123:456`)
 * by disallowing dots in the filename body and requiring extensions to start
 * with a letter and be 1-3 characters (e.g., `.ts`, `.py`, `.yml`).
 *
 * Groups: [filename, lineNumber]
 */
export const TEST_FAILURE_BARE_FILE_PATTERN = /(?:^|\s|[(])([\w][\w-]*\.[a-zA-Z]\w{0,2}):(\d+)/;

/**
 * NOTE: Dependency change detection is now handled by AI.
 * Previous regex-based patterns were removed as part of language-agnostic migration.
 * AI can parse diffs from any package manager format without maintenance.
 * See docs/LANGUAGE_AGNOSTIC_MIGRATION.md for details.
 */

// ==================== Path Processing Constants ====================

/**
 * Directory prefixes to skip when extracting module name from file paths.
 * These are generic patterns found across many languages and project structures.
 */
export const SKIP_DIRECTORY_PREFIXES = new Set([
  ".",
  "..",
  "src",
  "lib",
  "test",
  "tests",
  "spec",
  "specs",
  "__tests__",
  "__mocks__",
  "e2e",
  "integration",
  "unit",
  "fixtures",
  "mocks",
  "dist",
  "build",
  "out",
  "bin",
]);

/**
 * Directories to skip when stripping absolute paths.
 * These are user/system directories that should be removed.
 */
export const ABSOLUTE_PATH_SKIP_DIRS = new Set([
  "home",
  "Users",
  "var",
  "tmp",
  "opt",
  "usr",
  "Projects",
  "Dev",
  "Documents",
  "workspace",
]);

/**
 * Pattern to match common absolute path prefixes.
 * Handles Unix (/home/, /Users/, /var/, /tmp/) and Windows (C:\, D:\) paths.
 */
export const ABSOLUTE_PATH_PATTERN =
  /(?:\/(?:home|Users|var|tmp|opt|usr)\/[^\s:]+\/|[A-Z]:\\(?:Users|Projects|Dev)\\[^\s:]+\\)/g;

// ==================== CI Infrastructure Filtering ====================

/**
 * Pattern to identify CI infrastructure messages that should never become lint errors.
 * These are process exit notifications from CI runners, not actual source code issues.
 */
export const CI_INFRASTRUCTURE_MESSAGE = /^Process completed with exit code \d+/;

// ==================== CI Job Classification ====================

/**
 * Pattern to identify lint/format/typecheck CI job names.
 * Only these jobs should contribute deterministic lint errors — test/build/deploy
 * jobs produce false positives from CI infrastructure output (e.g., `##[error]`).
 */
export const LINT_JOB_KEYWORDS =
  /\b(?:lint|format|style|eslint|biome|tsc|typecheck|type[\s-]check|check[\s-]types|compile|prettier|stylelint|rubocop|clippy|flake8|pylint|golangci)\b/i;

// ==================== Action Review Patterns ====================

/**
 * Patterns for action review text processing.
 */
export const ACTION_REVIEW_PATTERNS = {
  /** Pattern to match service prefix in action descriptions */
  SERVICE_PREFIX: /^\[([^\]]+)\]\s*/,
  /** Pattern to match evidence tags in action text */
  EVIDENCE_TAG: /\s*\[(?:test|anno|check|log|diff|dep|cfg|wflog|src|comment)#[^\]]+\]\s*/gi,
  /** Pattern to match evidence in parentheses */
  EVIDENCE_PAREN: /\s*\(evidence:\s*[a-z]+#[^)]+\)\s*/gi,
  /** Pattern to match evidence IDs */
  EVIDENCE_ID: /\b(?:test|anno|check|log|diff|dep|cfg|wflog|src|comment)#\d+\b/gi,
  /** Pattern to match review action prefixes */
  REVIEW_PREFIX:
    /^(review|inspect|check|verify|investigate|address|start with|confirm|ensure|re-?run|run|align|compare|consider|look into|fix|correct|update|change|set|add|remove|replace|adjust|rename)\b/i,
  /** Pattern to match title prefix to strip */
  TITLE_PREFIX: /^start with[:\s]*/i,
} as const;
