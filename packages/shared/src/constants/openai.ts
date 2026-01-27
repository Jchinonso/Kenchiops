/**
 * OpenAI and text processing constants.
 */

/**
 * OpenAI API configuration defaults.
 */
export const OPENAI_DEFAULTS = {
  TEMPERATURE: 0.1,
  MODEL: "gpt-4-turbo-2024-04-09",
  MAX_TOKENS: 8192,
} as const;

/**
 * OpenAI API configuration constants.
 */
export const OPENAI_CONSTANTS = {
  MAX_PROMPT_TOKENS: 48000, // Increased from 24000 to capture all test failures (GPT-4 has 128K context)
  MAX_RETRIES: 3,
  DEFAULT_TIMEOUT_MS: 90000,
  TOKEN_BUFFER: 1000,
  EXPONENTIAL_BACKOFF_BASE: 2,
  CHARS_PER_TOKEN_ESTIMATE: 4,
  RATE_LIMIT_STATUS_CODE: 429,
  CIRCUIT_BREAKER_THRESHOLD: 3,
  CIRCUIT_BREAKER_RESET_MS: 60000,
} as const;

/**
 * Evidence truncation thresholds (token-based).
 */
export const EVIDENCE_TRUNCATION = {
  MIN_TOKENS_FOR_COMMITS: 500,
  MIN_TOKENS_FOR_DOCS: 1000,
  MIN_TOKENS_FOR_ADDITIONAL_LOGS: 250,
  MIN_TOKENS_FOR_RELATED_EVENTS: 200,
  MAX_ERROR_LOGS: 10,
  MAX_RECENT_COMMITS: 5,
  MAX_HIGH_SIMILARITY_DOCS: 3,
  MAX_ADDITIONAL_LOGS: 20,
} as const;

/**
 * String matching configuration.
 */
export const MATCHING_CONFIG = {
  COMMIT_PREFIX_LENGTH: 7,
  LOG_PREFIX_LENGTH: 50,
  LOG_COMPARISON_PREFIX_LENGTH: 30,
  /** Minimum log message length for alignment matching (short messages can cause false positives) */
  MIN_LOG_MESSAGE_LENGTH: 20,
  SHA_PREFIX_MIN_LENGTH: 6,
  SHA_PREFIX_MAX_LENGTH: 12,
  QUOTED_TEXT_MIN_LENGTH: 10,
} as const;

/**
 * SHA pattern for matching commit hashes (global, case-insensitive).
 * Matches hex strings between 6-40 characters at word boundaries.
 */
export const SHA_PATTERN = /\b[0-9a-f]{6,40}\b/gi;

/**
 * SHA pattern for single match (non-global, case-insensitive).
 * Matches hex strings between 6-40 characters at word boundaries.
 */
export const SHA_PATTERN_SINGLE = /\b[0-9a-f]{6,40}\b/i;

/**
 * Combined pattern for extracting quoted text.
 */
export const QUOTED_TEXT_PATTERN = /["']([^"']+)["']/g;

/**
 * Log normalization patterns for content deduplication.
 * Used to remove volatile data before hashing log content.
 */
export const LOG_NORMALIZATION_PATTERNS = {
  /** ISO 8601 timestamp pattern (YYYY-MM-DDTHH:MM:SS) */
  TIMESTAMP: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g,
  /** Full 40-character git SHA hash */
  FULL_SHA: /\b[0-9a-f]{40}\b/g,
  /** Excessive whitespace normalization */
  WHITESPACE: /\s+/g,
} as const;

/**
 * OpenAI-related error and default messages.
 */
export const OPENAI_MESSAGES = {
  NO_CONTENT: "No content in OpenAI response",
  NO_JSON_FOUND: "No JSON found in response",
  NO_SUMMARY: "No summary provided",
  UNKNOWN_ERROR: "Unknown OpenAI error occurred",
} as const;

/**
 * Tenant prompt configuration limits.
 */
export const TENANT_PROMPT_LIMITS = {
  MAX_RECOMMENDATIONS: 10,
  MIN_RECOMMENDATIONS: 1,
  MAX_CUSTOM_INSTRUCTIONS_LENGTH: 2000,
} as const;

/**
 * Model versioning constants.
 */
export const MODEL_VERSIONING = {
  HASH_MULTIPLIER: 31,
  HASH_MODULO: 100,
  BASELINE_VERSION_ID: "base_v1",
  BASELINE_VERSION_NAME: "Base Model",
  BASELINE_DESCRIPTION: "Default OpenAI model without fine-tuning",
  BASELINE_CREATED_AT: "2024-01-01T00:00:00Z",
} as const;

/**
 * Dataset extraction and validation thresholds.
 */
export const DATASET_THRESHOLDS = {
  MIN_EXAMPLES: 10,
  DEFAULT_EXTRACTION_LIMIT: 1000,
  MIN_POSITIVE_RATIO: 0.2,
  MAX_POSITIVE_RATIO: 0.8,
  MIN_AVG_CONFIDENCE: 0.5,
  DEFAULT_MIN_FEEDBACK: 1,
} as const;

/**
 * Fine-tuning API configuration constants.
 */
export const FINE_TUNING_CONFIG = {
  DEFAULT_BASE_MODEL: "gpt-4o-mini-2024-07-18",
  DEFAULT_EPOCHS: 3,
  POLL_INTERVAL_MS: 30000,
  MAX_POLL_ATTEMPTS: 120,
  TIMESTAMP_MULTIPLIER: 1000,
  DEFAULT_JOB_LIST_LIMIT: 10,
} as const;

/**
 * Fine-tuning job status values.
 */
export const FINE_TUNING_STATUS = {
  VALIDATING_FILES: "validating_files",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

/**
 * Type for fine-tuning job status values.
 * Derived from FINE_TUNING_STATUS constant.
 */
export type FineTuningStatus = (typeof FINE_TUNING_STATUS)[keyof typeof FINE_TUNING_STATUS];

/**
 * Fine-tuning training readiness thresholds.
 */
export const FINE_TUNING_READINESS = {
  /** Minimum feedback samples required before training is recommended */
  MIN_FEEDBACK_FOR_TRAINING: 50,
  /** Days to look back for recent feedback stats */
  RECENT_FEEDBACK_DAYS_7: 7,
  /** Days to look back for monthly feedback stats */
  RECENT_FEEDBACK_DAYS_30: 30,
  /** Milliseconds per day for date calculations */
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  /** Default job list limit for stats */
  STATS_JOB_LIST_LIMIT: 100,
} as const;

/**
 * Fine-tuning scheduler configuration.
 */
export const FINE_TUNING_SCHEDULER = {
  /** Default cleanup age in milliseconds (7 days) */
  CLEANUP_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  /** Maximum number of processed completions to keep before clearing */
  MAX_PROCESSED_COMPLETIONS: 1000,
  /** Default max concurrent polls */
  MAX_CONCURRENT_POLLS: 5,
  /** Enable automatic fine-tuning job triggering */
  AUTO_TRIGGER_ENABLED: true,
  /** How often to check if auto-trigger conditions are met (1 hour) */
  AUTO_TRIGGER_CHECK_INTERVAL_MS: 60 * 60 * 1000,
  /** Minimum days between automatic fine-tuning jobs */
  MIN_DAYS_BETWEEN_JOBS: 7,
  /** Milliseconds per day for calculations */
  MS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;
