/**
 * Redis Constants
 *
 * Timeout configurations and patterns for Redis operations.
 *
 * @module constants/redis
 */

// ==================== Timeouts ====================

/**
 * Redis operation timeout configuration in milliseconds
 */
export const REDIS_TIMEOUTS = {
  /** Cache operations timeout */
  CACHE_OPERATION_MS: 2000,
  /** Aggregation operations timeout */
  AGGREGATION_OPERATION_MS: 3000,
  /** Queue operations timeout */
  QUEUE_OPERATION_MS: 5000,
} as const;

// ==================== Retryable Patterns ====================

/**
 * Retryable error patterns for Redis and network operations
 */
export const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /network/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /rate limit/i,
  /503/,
  /502/,
  /504/,
] as const;

// ==================== Cache TTL ====================

/**
 * Default TTL values in seconds for cache entries
 */
export const CACHE_TTL_SECONDS = {
  /** Short-lived cache (1 minute) */
  SHORT: 60,
  /** Medium cache (5 minutes) */
  MEDIUM: 300,
  /** Standard cache (15 minutes) */
  STANDARD: 900,
  /** Long cache (1 hour) */
  LONG: 3600,
  /** Extended cache (6 hours) */
  EXTENDED: 21600,
  /** Daily cache (24 hours) */
  DAILY: 86400,
} as const;

// ==================== Key Prefixes ====================

/**
 * Redis key namespace prefixes
 */
export const REDIS_KEY_PREFIXES = {
  /** Cache entries prefix */
  CACHE: "kenchi:cache",
  /** Aggregation entries prefix */
  AGGREGATION: "kenchi:agg",
  /** Queue entries prefix */
  QUEUE: "kenchi:queue",
  /** Rate limiting prefix */
  RATE_LIMIT: "kenchi:ratelimit",
} as const;

/**
 * Cache namespace identifiers
 */
export const CACHE_NAMESPACES = {
  GITHUB: "github",
  TENANT: "tenant",
  MAPPING: "mapping",
  ANALYSIS: "analysis",
  TOKEN: "token",
} as const;

export type CacheNamespace = (typeof CACHE_NAMESPACES)[keyof typeof CACHE_NAMESPACES];

// ==================== Worker Defaults ====================

/**
 * Queue worker default configuration
 */
export const QUEUE_WORKER_DEFAULTS = {
  /** Default poll interval in milliseconds */
  POLL_INTERVAL_MS: 1000,
  /** Aggregator poll interval in milliseconds */
  AGGREGATOR_POLL_INTERVAL_MS: 5000,
  /** Default max concurrent workers */
  MAX_CONCURRENT: 5,
  /** Concurrency throttle delay in milliseconds */
  CONCURRENCY_THROTTLE_MS: 100,
} as const;

// ==================== Aggregation Defaults ====================

/**
 * Aggregation configuration defaults
 */
export const AGGREGATION_DEFAULTS = {
  /** Time to wait after last failure before consolidating (ms) */
  DEBOUNCE_MS: 30_000,
  /** Maximum time to wait for aggregation (ms) */
  MAX_WAIT_MS: 120_000,
  /** Maximum failures to aggregate per commit */
  MAX_FAILURES_PER_COMMIT: 20,
  /** TTL buffer added to max wait for cleanup safety (seconds) */
  TTL_BUFFER_SECONDS: 60,
  /** Debounce marker value stored in Redis */
  DEBOUNCE_MARKER: "1",
} as const;

// ==================== Display Defaults ====================

/**
 * Display formatting constants
 */
export const DISPLAY_DEFAULTS = {
  /** SHA prefix length for display (UI, logs, Slack, GitHub comments) */
  SHA_DISPLAY_LENGTH: 7,
  /** Log hash length for content-based deduplication */
  LOG_HASH_LENGTH: 16,
} as const;

// ==================== Retry Defaults ====================

/**
 * Retry configuration defaults
 */
export const RETRY_DEFAULTS = {
  /** Base delay multiplier for exponential backoff (ms) */
  BASE_DELAY_MS: 200,
  /** Maximum delay between retries (ms) */
  MAX_DELAY_MS: 5000,
} as const;
