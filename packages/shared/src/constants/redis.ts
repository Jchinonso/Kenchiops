/**
 * Redis Constants
 *
 * Timeout configurations and patterns for Redis operations.
 *
 * @module constants/redis
 */

// ==================== Redis API Constants ====================

/**
 * Redis client status values
 */
export const REDIS_STATUS = {
  /** Client is connected and ready */
  READY: "ready",
  /** Client is connecting */
  CONNECTING: "connecting",
  /** Client is disconnected */
  DISCONNECTED: "end",
} as const;

/**
 * Redis command responses
 */
export const REDIS_RESPONSES = {
  /** Expected response from PING command */
  PONG: "PONG",
  /** Success response from commands */
  OK: "OK",
} as const;

/**
 * Redis list operation parameters
 */
export const REDIS_LIST_OPS = {
  /** Remove first matching element (LREM count parameter) */
  REMOVE_FIRST_MATCH: 1,
} as const;

/**
 * Redis TTL special return values
 */
export const REDIS_TTL_VALUES = {
  /** Key exists but has no expiry */
  NO_EXPIRY: -1,
  /** Key does not exist */
  KEY_NOT_FOUND: -2,
} as const;

/**
 * Redis SCAN cursor values and configuration
 */
export const REDIS_SCAN = {
  /** Initial cursor for SCAN iteration */
  INITIAL_CURSOR: "0",
  /** Default batch size for SCAN COUNT parameter */
  BATCH_SIZE: 100,
} as const;

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

// ==================== Connection Defaults ====================

/**
 * Redis connection configuration defaults
 */
export const REDIS_CONNECTION_DEFAULTS = {
  /** Connection timeout in milliseconds */
  CONNECT_TIMEOUT_MS: 10000,
  /** Maximum retry attempts for connection */
  MAX_RETRIES: 10,
  /** Enable offline queue (buffer commands while disconnected) */
  ENABLE_OFFLINE_QUEUE: false,
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

/**
 * Retryable error patterns specific to Slack API
 */
export const SLACK_RETRYABLE_ERROR_PATTERNS = [
  ...RETRYABLE_ERROR_PATTERNS,
  /channel_not_found/i,
  /not_in_channel/i,
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
  /** PR failure tracking prefix (for linked commit ingestion) */
  PR_FAILURES: "kenchi:pr-failures",
} as const;

/**
 * Key structure components for parsing cache keys
 */
export const CACHE_KEY_STRUCTURE = {
  /** Root namespace prefix for all Kenchi keys */
  ROOT_PREFIX: "kenchi",
  /** Cache namespace identifier */
  CACHE_PREFIX: "cache",
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
  /** Slack notification worker max concurrent */
  SLACK_MAX_CONCURRENT: 3,
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
  /** Decimal precision for score display */
  SCORE_DECIMAL_PRECISION: 2,
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

// ==================== Message Queue Configuration ====================

/**
 * Queue processing configuration
 */
export const QUEUE_CONFIG = {
  /** Suffix for processing queue */
  PROCESSING_SUFFIX: ":processing",
  /** Suffix for dead letter queue */
  DEAD_LETTER_SUFFIX: ":dead",
  /** Default max retries before dead letter */
  DEFAULT_MAX_RETRIES: 3,
  /** Message ID prefix */
  MESSAGE_ID_PREFIX: "msg",
  /** Initial retry count for new messages */
  INITIAL_RETRY_COUNT: 0,
} as const;

/**
 * Queue-specific retry configurations
 */
export const QUEUE_RETRY_CONFIG = {
  /** CI analysis queue max retries */
  CI_ANALYSIS: 3,
  /** Slack notification queue max retries */
  SLACK_NOTIFICATION: 5,
  /** GitHub action queue max retries */
  GITHUB_ACTION: 3,
} as const;

/**
 * Queue visibility timeout in seconds (how long a job is hidden while processing)
 */
export const QUEUE_VISIBILITY_TIMEOUT = {
  /** CI analysis visibility timeout */
  CI_ANALYSIS: 60,
  /** Slack notification visibility timeout */
  SLACK_NOTIFICATION: 30,
  /** GitHub action visibility timeout */
  GITHUB_ACTION: 120,
} as const;

/**
 * Pre-defined queue names
 */
export const QUEUE_NAMES = {
  /** CI analysis jobs queue */
  CI_ANALYSIS: "kenchi:ci-analysis",
  /** Slack notification jobs queue */
  SLACK_NOTIFICATIONS: "kenchi:slack-notifications",
  /** GitHub action jobs queue */
  GITHUB_ACTIONS: "kenchi:github-actions",
} as const;

/**
 * Pre-defined pub/sub channel names
 */
export const PUBSUB_CHANNELS = {
  /** CI failure events */
  CI_FAILURES: "kenchi:events:ci-failures",
  /** Action execution events */
  ACTION_EVENTS: "kenchi:events:actions",
  /** System health events */
  HEALTH_EVENTS: "kenchi:events:health",
} as const;
