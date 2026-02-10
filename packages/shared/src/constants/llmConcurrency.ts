/**
 * LLM Concurrency Constants
 *
 * Default values for controlling concurrent LLM analysis requests.
 * Prevents rate limiting and manages costs during high-volume CI failures.
 */

/**
 * Default configuration for LLM analysis concurrency control.
 */
export const LLM_CONCURRENCY_DEFAULTS = {
  /** Maximum parallel LLM requests during batch analysis */
  MAX_CONCURRENT_ANALYSIS: 5,
  /** Maximum time to wait in queue before timeout (2 minutes) */
  QUEUE_TIMEOUT_MS: 120000,
  /** Backoff delay after hitting rate limit */
  RATE_LIMIT_BACKOFF_MS: 5000,
  /** Maximum retries after rate limit errors */
  MAX_RATE_LIMIT_RETRIES: 3,
} as const;
