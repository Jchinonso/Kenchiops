/**
 * Centralized constants for the Kenchi codebase.
 * All numeric thresholds, scores, and configuration values should be defined here.
 */

/**
 * Confidence score thresholds for gating decisions.
 */
export const CONFIDENCE_THRESHOLDS = {
  VERY_LOW: 0.3,
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.85,
} as const;

/**
 * Base confidence scores mapped to LLM confidence levels.
 */
export const BASE_CONFIDENCE_SCORES = {
  VERY_HIGH: 0.85,
  HIGH: 0.75,
  MEDIUM: 0.6,
  LOW: 0.4,
  VERY_LOW: 0.2,
  DEFAULT: 0.5, // Default when confidence level is not specified
} as const;

/**
 * Default confidence threshold for action decisions.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Placeholder confidence score for backward compatibility.
 */
export const PLACEHOLDER_CONFIDENCE_SCORE = 0.5;

/**
 * Uncertainty detection penalties.
 */
export const UNCERTAINTY_PENALTIES = {
  STRONG: -0.15,
  MODERATE: -0.1,
  MILD: -0.05,
  MAX: -0.3,
} as const;

/**
 * Evidence alignment adjustments.
 */
export const ALIGNMENT_ADJUSTMENTS = {
  LOG_REFERENCE: 0.15,
  COMMIT_REFERENCE: 0.1,
  HIGH_SIMILARITY_INCIDENT: 0.15,
  METRICS_REFERENCE: 0.05,
  NO_ALIGNMENT_PENALTY: -0.15,
  MAX: 0.2,
} as const;

/**
 * Completeness assessment adjustments.
 */
export const COMPLETENESS_ADJUSTMENTS = {
  CAUSE_IDENTIFIED: 0.03,
  SUBSTANTIAL_REASONING: 0.03,
  MULTIPLE_ACTIONS: 0.02,
  IMPACT_ASSESSMENT: 0.02,
  UNCERTAINTIES_LISTED: 0.03,
  MINIMAL_ANALYSIS_PENALTY: -0.15,
} as const;

/**
 * Knowledge base validation adjustments.
 */
export const VALIDATION_ADJUSTMENTS = {
  STRONG: 0.1,
  MODERATE: 0.05,
  NONE: 0,
} as const;

/**
 * Consistency checking adjustments.
 */
export const CONSISTENCY_ADJUSTMENTS = {
  HIGH_RELEVANCE: 0.05,
  NO_RELEVANCE: -0.1,
  DEFAULT: 0,
} as const;

/**
 * Similarity thresholds for knowledge base matching.
 */
export const SIMILARITY_THRESHOLDS = {
  STRONG: 0.85,
  MODERATE: 0.7,
  MINIMUM_FOR_FILTERING: 0.7, // Used in prompts.ts for filtering docs
} as const;

/**
 * Relevance ratio thresholds.
 */
export const RELEVANCE_THRESHOLDS = {
  MIN_FOR_POSITIVE: 0.5, // Minimum ratio for positive consistency adjustment
} as const;

/**
 * Minimum lengths for completeness checks.
 */
export const MIN_LENGTHS = {
  CAUSE: 20,
  REASONING: 100,
} as const;

/**
 * Minimum number of actions for bonus.
 */
export const MIN_ACTIONS_FOR_BONUS = 2;

/**
 * String matching configuration.
 */
export const MATCHING_CONFIG = {
  COMMIT_PREFIX_LENGTH: 7,
  LOG_PREFIX_LENGTH: 50,
  LOG_COMPARISON_PREFIX_LENGTH: 30,
  SHA_PREFIX_MIN_LENGTH: 6,
  SHA_PREFIX_MAX_LENGTH: 12,
  QUOTED_TEXT_MIN_LENGTH: 10,
} as const;

/**
 * SHA pattern for matching commit hashes (6-40 hex characters).
 * Pre-compiled for reuse across validation functions.
 */
export const SHA_PATTERN = /\b[0-9a-f]{6,40}\b/gi;
export const SHA_PATTERN_SINGLE = /\b[0-9a-f]{6,40}\b/i;

/**
 * Combined pattern for extracting quoted text (single and double quotes).
 * Captures content inside quotes without the quotes themselves.
 */
export const QUOTED_TEXT_PATTERN = /["']([^"']+)["']/g;

/**
 * OpenAI API configuration defaults.
 */
export const OPENAI_DEFAULTS = {
  TEMPERATURE: 0.1,
} as const;

/**
 * UI/Display thresholds for confidence score visualization.
 * Used in Slack formatters and other UI components.
 */
export const UI_CONFIDENCE_THRESHOLDS = {
  VERY_HIGH: 0.85,
  HIGH: 0.7,
  MEDIUM: 0.5,
  LOW: 0.3,
} as const;

/**
 * Evidence truncation thresholds (token-based).
 */
export const EVIDENCE_TRUNCATION = {
  MIN_TOKENS_FOR_COMMITS: 500,
  MIN_TOKENS_FOR_DOCS: 1000,
  MAX_ERROR_LOGS: 10,
  MAX_RECENT_COMMITS: 5,
  MAX_HIGH_SIMILARITY_DOCS: 3,
} as const;

/**
 * HTTP status codes.
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
} as const;

// ==================== Error Constants ====================

/**
 * Error codes for application errors.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * Default error messages for common error types.
 */
export const DEFAULT_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: "Authentication required",
  INSUFFICIENT_PERMISSIONS: "Insufficient permissions",
  RESOURCE_NOT_FOUND: "Resource not found",
  UNEXPECTED_ERROR: "An unexpected error occurred",
} as const;

/**
 * External service names.
 */
export const SERVICE_NAMES = {
  OPENAI: "OpenAI",
} as const;

/**
 * Time constants (in seconds).
 */
export const TIME_CONSTANTS = {
  SECONDS_PER_MINUTE: 60,
  MILLISECONDS_PER_SECOND: 1000,
  SLACK_TIMESTAMP_WINDOW_MINUTES: 5,
} as const;

/**
 * Slack signature verification constants.
 */
export const SLACK_VERIFICATION = {
  SIGNATURE_PREFIX: "v0",
  LOG_SUBSTRING_LENGTH: 20,
  TIMESTAMP_WINDOW_SECONDS:
    TIME_CONSTANTS.SECONDS_PER_MINUTE * TIME_CONSTANTS.SLACK_TIMESTAMP_WINDOW_MINUTES,
} as const;

/**
 * Service port defaults.
 */
export const SERVICE_PORTS = {
  API: 3000,
  SLACK_BOT_HTTP: 3001,
  SLACK_BOT_WEBHOOK: 3002,
  GITHUB_APP: 3003,
} as const;

/**
 * UI/Display constants.
 */
export const UI_CONSTANTS = {
  PERCENTAGE_MULTIPLIER: 100,
  MAX_ACTIONS_TO_DISPLAY: 3,
  ACTION_TIMEOUT_MS: 2000,
} as const;

/**
 * OpenAI API configuration constants.
 */
export const OPENAI_CONSTANTS = {
  MAX_PROMPT_TOKENS: 8000, // Leave room for response
  MAX_RETRIES: 3,
  DEFAULT_TIMEOUT_MS: 30000,
  TOKEN_BUFFER: 1000, // Buffer for event and instructions
  EXPONENTIAL_BACKOFF_BASE: 2, // Base for exponential backoff: 2^attempt
  CHARS_PER_TOKEN_ESTIMATE: 4, // Rough estimate: ~4 chars per token
  RATE_LIMIT_STATUS_CODE: 429,
} as const;

/**
 * Rate limiting constants.
 */
export const RATE_LIMIT_CONSTANTS = {
  DEFAULT_WINDOW_MS: TIME_CONSTANTS.SECONDS_PER_MINUTE * TIME_CONSTANTS.MILLISECONDS_PER_SECOND, // 1 minute
  DEFAULT_MAX_REQUESTS: 100,
  CLEANUP_PROBABILITY: 0.01, // 1% chance to cleanup on each request
  RATE_LIMIT_STATUS_CODE: 429,
} as const;

// ==================== Validation Constants ====================

/**
 * Email validation regex pattern.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ==================== Slack Constants ====================

/**
 * Slack channel ID regex pattern.
 * Matches channel IDs that start with C (public), D (DM), or G (private/group).
 * Example: C0A4FFS1086, D01234567, G0ABCDEFG
 */
export const SLACK_CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]+$/;

/**
 * Default error message for validation failures.
 */
export const DEFAULT_VALIDATION_ERROR_MESSAGE = "validation failed" as const;

// ==================== OpenAI Validation Constants ====================

/**
 * Dangerous keywords that should not appear in LLM-recommended actions.
 */
export const DANGEROUS_KEYWORDS = [
  "delete",
  "drop",
  "truncate",
  "force",
  "disable",
  "remove all",
  "destroy",
  "--force",
  "rm -rf",
] as const;

/**
 * Compiled regex pattern for dangerous keywords (memoized).
 * Created once at module load time for performance.
 */
export const DANGEROUS_KEYWORDS_PATTERN = ((): RegExp => {
  const escapedKeywords = DANGEROUS_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escapedKeywords.join("|")})\\b`, "i");
})();

// ==================== Safety Constants ====================

/**
 * Uncertainty pattern configuration type.
 */
export type UncertaintyPattern = {
  readonly pattern: RegExp;
  readonly penalty: number;
};

/**
 * Compiled uncertainty patterns with penalties.
 * Ordered by severity (strongest first).
 */
export const UNCERTAINTY_PATTERNS: Readonly<UncertaintyPattern[]> = [
  {
    pattern:
      /\b(not sure|unclear|cannot determine|insufficient information|unable to identify|unknown)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.STRONG,
  },
  {
    pattern: /\b(possibly|might be|could be|may be|potentially|perhaps)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MODERATE,
  },
  {
    pattern: /\b(appears to|seems like|suggests that|probably)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MILD,
  },
] as const;

/**
 * Metric keywords to detect in reasoning.
 */
export const METRIC_KEYWORDS: Readonly<Set<string>> = new Set([
  "cpu",
  "memory",
  "error rate",
  "latency",
]);

/**
 * Invalid cause keywords that indicate an invalid root cause identification.
 */
export const INVALID_CAUSE_KEYWORDS: Readonly<Set<string>> = new Set(["unknown"]);

/**
 * Cause-action relevance mapping configuration type.
 */
export type RelevanceRule = {
  readonly causeKeywords: readonly string[];
  readonly actionKeywords: readonly string[];
};

/**
 * Relevance rules for matching causes to actions.
 */
export const RELEVANCE_RULES: Readonly<RelevanceRule[]> = [
  {
    causeKeywords: ["secret", "env"],
    actionKeywords: ["environment"],
  },
  {
    causeKeywords: ["deploy"],
    actionKeywords: ["rollback"],
  },
  {
    causeKeywords: ["config"],
    actionKeywords: ["configuration"],
  },
  {
    causeKeywords: ["test"],
    actionKeywords: ["rerun", "test"],
  },
  {
    causeKeywords: ["pipeline"],
    actionKeywords: ["rerun", "pipeline"],
  },
] as const;

/**
 * Safety levels that allow auto-approval with high confidence.
 */
export const AUTO_APPROVABLE_SAFETY_LEVELS: Readonly<Set<string>> = new Set(["safe", "low_risk"]);

// ==================== GitHub Context Constants ====================

/**
 * Maximum size limits for GitHub context data.
 */
export const GITHUB_CONTEXT_LIMITS = {
  MAX_LOG_SIZE: 50000, // 50KB of logs
  MAX_DIFF_SIZE: 30000, // 30KB of diff
  MAX_FILE_SIZE: 10000, // 10KB per file
  MAX_FILES: 5, // Maximum number of source files to fetch
  MAX_ANNOTATIONS: 20, // Maximum number of annotations
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

// ==================== GitHub Webhook Constants ====================

/**
 * GitHub webhook signature verification constants.
 */
export const GITHUB_SIGNATURE = {
  HEADER: "x-hub-signature-256",
  PREFIX: "sha256=",
} as const;

// ==================== Slack UI Constants ====================

/**
 * Color codes for Slack attachments based on severity/confidence.
 */
export const SLACK_COLORS = {
  DANGER: "#E01E5A", // Red - critical/low confidence
  WARNING: "#ECB22E", // Yellow - medium confidence
  SUCCESS: "#2EB67D", // Green - high confidence
  INFO: "#36C5F0", // Blue - informational
  PURPLE: "#4A154B", // Purple - Slack brand color
} as const;

/**
 * Status emoji for Slack progress updates.
 */
export const SLACK_STATUS_EMOJI = {
  pending: ":hourglass_flowing_sand:",
  in_progress: ":gear:",
  completed: ":white_check_mark:",
  failed: ":x:",
} as const;

/**
 * Priority emoji for Slack messages.
 */
export const PRIORITY_EMOJI = {
  critical: ":red_circle:",
  high: ":red_circle:",
  medium: ":large_orange_circle:",
  low: ":white_circle:",
} as const;

/**
 * Valid safety levels for runtime validation.
 */
export const VALID_SAFETY_LEVELS: Readonly<Set<string>> = new Set([
  "safe",
  "low_risk",
  "medium_risk",
  "high_risk",
  "dangerous",
]);

// ==================== Git Display Constants ====================

/**
 * Git-related display constants.
 */
export const GIT_DISPLAY = {
  /** Standard length for displaying truncated commit SHA */
  SHA_DISPLAY_LENGTH: 7,
} as const;

// ==================== Slack API Constants ====================

/**
 * Slack API limits and pagination.
 */
export const SLACK_API_LIMITS = {
  /** Maximum results per page for conversations.list API */
  CONVERSATIONS_LIST_LIMIT: 1000,
} as const;

// ==================== CI Failure Display Constants ====================

/**
 * Display limits for CI failure notifications (Slack and GitHub).
 */
export const CI_FAILURE_DISPLAY = {
  /** Maximum number of errors to display in notifications */
  MAX_ERRORS_DISPLAYED: 2,
  /** Maximum length for truncated error messages */
  MAX_ERROR_MESSAGE_LENGTH: 100,
} as const;

// ==================== GitHub Log Parsing Constants ====================

/**
 * Maximum number of test failures to extract from logs.
 */
export const LOG_PARSING_LIMITS = {
  MAX_TEST_FAILURES: 10,
  /** Maximum size for build config diff in characters */
  MAX_BUILD_CONFIG_DIFF_SIZE: 5000,
} as const;

/**
 * Paths to exclude when extracting file references from logs.
 */
export const EXCLUDED_PATH_PATTERNS = [
  "node_modules",
  ".test.",
  ".spec.",
  "internal/",
] as const;

/**
 * Error indicators for context-preserving log truncation.
 */
export const ERROR_INDICATORS = [
  "error",
  "Error",
  "ERROR",
  "failed",
  "Failed",
  "FAILED",
] as const;

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

// ==================== Dependency Parsing Constants ====================

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
 * Confidence range type for decision matrix.
 */
export type ConfidenceRange = "very_low" | "low" | "medium" | "high" | "very_high";

/**
 * Message templates for different confidence ranges.
 */
export const CONFIDENCE_MESSAGES: Readonly<Record<ConfidenceRange, string>> = {
  very_low: "Very low confidence. Manual review required before any action.",
  low: "Low confidence. Careful review recommended.",
  medium: "Medium confidence. Approval required.",
  high: "High confidence",
  very_high: "Very high confidence",
} as const;

// ==================== Secret Redaction Constants ====================

/**
 * Placeholder text used to replace redacted secrets.
 */
export const REDACTION_PLACEHOLDER = "[REDACTED]" as const;

/**
 * Secret pattern configuration type.
 */
export type SecretPattern = {
  readonly name: string;
  readonly pattern: RegExp;
};

/**
 * Compiled regex patterns for detecting secrets in text.
 * These patterns are designed to catch common secret formats
 * with high precision to avoid false positives.
 */
export const SECRET_PATTERNS: Readonly<SecretPattern[]> = [
  // AWS Keys
  {
    name: "AWS Access Key ID",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
  },
  {
    name: "AWS Secret Access Key",
    pattern: /\b([A-Za-z0-9/+=]{40})(?=\s|$|"|')/g,
  },
  // GitHub Tokens
  {
    name: "GitHub Personal Access Token",
    pattern: /\b(ghp_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub OAuth Token",
    pattern: /\b(gho_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub App Token",
    pattern: /\b(ghu_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub Server Token",
    pattern: /\b(ghs_[A-Za-z0-9]{36})\b/g,
  },
  {
    name: "GitHub Refresh Token",
    pattern: /\b(ghr_[A-Za-z0-9]{36})\b/g,
  },
  // Slack Tokens
  {
    name: "Slack Bot Token",
    pattern: /\b(xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
  },
  {
    name: "Slack User Token",
    pattern: /\b(xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
  },
  {
    name: "Slack App Token",
    pattern: /\b(xapp-[0-9]-[A-Z0-9]{10,13}-[0-9]{13}-[a-f0-9]{64})\b/g,
  },
  // API Keys (generic patterns)
  {
    name: "Generic API Key",
    pattern: /\b(api[_-]?key|apikey)[=:]["']?([A-Za-z0-9_\-]{20,})["']?/gi,
  },
  {
    name: "Generic Secret Key",
    pattern: /\b(secret[_-]?key|secretkey)[=:]["']?([A-Za-z0-9_\-]{20,})["']?/gi,
  },
  {
    name: "Generic Access Token",
    pattern: /\b(access[_-]?token|accesstoken)[=:]["']?([A-Za-z0-9_\-]{20,})["']?/gi,
  },
  // Private Keys
  {
    name: "RSA Private Key",
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
  },
  {
    name: "Private Key",
    pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
  },
  {
    name: "EC Private Key",
    pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/g,
  },
  {
    name: "OpenSSH Private Key",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
  },
  // Database Connection Strings
  {
    name: "PostgreSQL Connection String",
    pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s]+/gi,
  },
  {
    name: "MySQL Connection String",
    pattern: /mysql:\/\/[^:]+:[^@]+@[^\s]+/gi,
  },
  {
    name: "MongoDB Connection String",
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s]+/gi,
  },
  {
    name: "Redis Connection String",
    pattern: /redis:\/\/[^:]*:[^@]+@[^\s]+/gi,
  },
  // OpenAI / Anthropic API Keys
  {
    name: "OpenAI API Key",
    pattern: /\b(sk-[A-Za-z0-9]{20,})\b/g,
  },
  {
    name: "OpenAI Project Key",
    pattern: /\b(sk-proj-[A-Za-z0-9]{20,})\b/g,
  },
  {
    name: "Anthropic API Key",
    pattern: /\b(sk-ant-[A-Za-z0-9\-]{80,})\b/g,
  },
  // JWT Tokens
  {
    name: "JWT Token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  // NPM Tokens
  {
    name: "NPM Token",
    pattern: /\b(npm_[A-Za-z0-9]{36})\b/g,
  },
  // Stripe Keys
  {
    name: "Stripe Secret Key",
    pattern: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,
  },
  {
    name: "Stripe Test Key",
    pattern: /\b(sk_test_[A-Za-z0-9]{24,})\b/g,
  },
  // SendGrid
  {
    name: "SendGrid API Key",
    pattern: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g,
  },
  // Twilio
  {
    name: "Twilio Auth Token",
    pattern: /\b(SK[a-f0-9]{32})\b/g,
  },
  // Password patterns in config/env files
  {
    name: "Password Assignment",
    pattern: /\b(password|passwd|pwd)[=:]["']?([^\s"']{8,})["']?/gi,
  },
  // Bearer tokens in headers
  {
    name: "Bearer Token",
    pattern: /\bBearer\s+([A-Za-z0-9_\-.]{20,})\b/g,
  },
  // Basic Auth
  {
    name: "Basic Auth",
    pattern: /\bBasic\s+([A-Za-z0-9+/=]{20,})\b/g,
  },
] as const;

/**
 * Field names that should be completely excluded from any output.
 * These fields often contain sensitive data regardless of pattern matching.
 */
export const FORBIDDEN_FIELDS: Readonly<Set<string>> = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "accesstoken",
  "access-token",
  "auth_token",
  "authtoken",
  "auth-token",
  "private_key",
  "privatekey",
  "private-key",
  "secret_key",
  "secretkey",
  "secret-key",
  "encryption_key",
  "encryptionkey",
  "signing_key",
  "signingkey",
  "bearer",
  "authorization",
  // Note: "credentials" and "token" removed - too aggressive, often used for nested objects
]);
