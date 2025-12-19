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
  MEDIUM: 0.60,
  LOW: 0.40,
  VERY_LOW: 0.20,
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
} as const;

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
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Default error messages for common error types.
 */
export const DEFAULT_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: 'Authentication required',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  RESOURCE_NOT_FOUND: 'Resource not found',
  UNEXPECTED_ERROR: 'An unexpected error occurred',
} as const;

/**
 * External service names.
 */
export const SERVICE_NAMES = {
  OPENAI: 'OpenAI',
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
  SIGNATURE_PREFIX: 'v0',
  LOG_SUBSTRING_LENGTH: 20,
  TIMESTAMP_WINDOW_SECONDS: TIME_CONSTANTS.SECONDS_PER_MINUTE * TIME_CONSTANTS.SLACK_TIMESTAMP_WINDOW_MINUTES,
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
export const DEFAULT_VALIDATION_ERROR_MESSAGE = 'validation failed' as const;

// ==================== OpenAI Validation Constants ====================

/**
 * Dangerous keywords that should not appear in LLM-recommended actions.
 */
export const DANGEROUS_KEYWORDS = [
  'delete',
  'drop',
  'truncate',
  'force',
  'disable',
  'remove all',
  'destroy',
  '--force',
  'rm -rf',
] as const;

/**
 * Compiled regex pattern for dangerous keywords (memoized).
 * Created once at module load time for performance.
 */
export const DANGEROUS_KEYWORDS_PATTERN = ((): RegExp => {
  const escapedKeywords = DANGEROUS_KEYWORDS.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'i');
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
    pattern: /\b(not sure|unclear|cannot determine|insufficient information|unable to identify|unknown)\b/gi,
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
  'cpu',
  'memory',
  'error rate',
  'latency',
]);

/**
 * Invalid cause keywords that indicate an invalid root cause identification.
 */
export const INVALID_CAUSE_KEYWORDS: Readonly<Set<string>> = new Set(['unknown']);

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
    causeKeywords: ['secret', 'env'],
    actionKeywords: ['environment'],
  },
  {
    causeKeywords: ['deploy'],
    actionKeywords: ['rollback'],
  },
  {
    causeKeywords: ['config'],
    actionKeywords: ['configuration'],
  },
  {
    causeKeywords: ['test'],
    actionKeywords: ['rerun', 'test'],
  },
  {
    causeKeywords: ['pipeline'],
    actionKeywords: ['rerun', 'pipeline'],
  },
] as const;

/**
 * Safety levels that allow auto-approval with high confidence.
 */
export const AUTO_APPROVABLE_SAFETY_LEVELS: Readonly<Set<string>> = new Set([
  'safe',
  'low_risk',
]);

/**
 * Valid safety levels for runtime validation.
 */
export const VALID_SAFETY_LEVELS: Readonly<Set<string>> = new Set([
  'safe',
  'low_risk',
  'medium_risk',
  'high_risk',
  'dangerous',
]);

/**
 * Confidence range type for decision matrix.
 */
export type ConfidenceRange = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

/**
 * Message templates for different confidence ranges.
 */
export const CONFIDENCE_MESSAGES: Readonly<Record<ConfidenceRange, string>> = {
  very_low: 'Very low confidence. Manual review required before any action.',
  low: 'Low confidence. Careful review recommended.',
  medium: 'Medium confidence. Approval required.',
  high: 'High confidence',
  very_high: 'Very high confidence',
} as const;

