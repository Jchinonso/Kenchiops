/**
 * OpenAI and text processing constants.
 */

/**
 * OpenAI API configuration defaults.
 */
export const OPENAI_DEFAULTS = {
  TEMPERATURE: 0.1,
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
