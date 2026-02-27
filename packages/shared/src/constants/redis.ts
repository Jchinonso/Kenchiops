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

// ==================== Lua Scripts ====================

/**
 * Lua script for atomic rate limit increment.
 * SECURITY: Prevents TTL race condition by atomically incrementing and setting expiry.
 * Returns: [current_count, ttl_in_ms]
 */
export const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

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
  /**
   * JWT access token lifetime (must match JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS).
   * Used for membership/user/tenant revocation flags that must outlast the JWT.
   * Set to 5 minutes (300s) to match the reduced JWT expiry (FLAW-06).
   */
  JWT_LIFETIME: 300,
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
  /** User status flags for real-time auth checks (suspended/revoked/deleted) */
  USER_STATUS: "kenchi:user-status",
  /** Tenant status flags for blocking suspended/deleted organizations */
  TENANT_STATUS: "kenchi:tenant-status",
  /** Membership revocation flags for blocking removed members during JWT lifetime */
  MEMBERSHIP_REVOKED: "kenchi:membership-revoked",
  /** Webhook dedup fast-path for replay protection */
  WEBHOOK_DEDUP: "kenchi:webhook-dedup",
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

export type { CacheNamespace } from "./types.js";

// ==================== Cache Algorithm Constants ====================

/** Hash algorithm used for log content deduplication in analysis cache. */
export const ANALYSIS_HASH_ALGORITHM = "sha256";

/** Analysis cache key version for schema changes. */
export const ANALYSIS_CACHE_VERSION = "v2";

// ==================== Cache Key Parsing Constants ====================

/**
 * Index positions in cache key segments.
 * Key format: "kenchi:cache:namespace:part1:part2:..."
 */
export const CACHE_KEY_SEGMENT_INDICES = {
  ROOT_PREFIX: 0,
  CACHE_PREFIX: 1,
  NAMESPACE: 2,
  PARTS_START: 3,
} as const;

/** Minimum number of segments for a valid cache key (root:cache:namespace). */
export const MIN_CACHE_KEY_SEGMENTS = 3;

/** Separator used in cache keys. */
export const CACHE_KEY_SEPARATOR = ":";

/** Replacement character for slashes in repository names. */
export const REPO_SLASH_REPLACEMENT = "-";

/** Pattern to normalize whitespace in check names. */
export const CHECK_NAME_WHITESPACE_PATTERN = /\s+/g;

// ==================== Cache Client Constants ====================

/** Expected Redis client status when ready for operations. */
export const REDIS_READY_STATUS = "ready";

/** Redis EXISTS command returns 1 when key exists. */
export const REDIS_KEY_EXISTS = 1;

/** Default TTL return value on error or when client not ready. */
export const CACHE_TTL_ERROR_DEFAULT = -1;

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
  /** Analysis queue processor max concurrent */
  ANALYSIS_MAX_CONCURRENT: 3,
  /** Concurrency throttle delay in milliseconds */
  CONCURRENCY_THROTTLE_MS: 100,
} as const;

// ==================== Aggregation Defaults ====================

/**
 * Aggregation configuration defaults
 */
export const AGGREGATION_DEFAULTS = {
  /** Time to wait after last failure before consolidating (ms).
   * CI checks finish at different times (lint ~1min, tests ~3-4min).
   * This is the minimum quiet period — if new failures arrive, the timer resets.
   * The aggregation worker also checks GitHub for in-progress checks before processing. */
  DEBOUNCE_MS: 30_000,
  /** Maximum time to wait for aggregation (ms).
   * Hard ceiling regardless of in-progress checks. */
  MAX_WAIT_MS: 300_000,
  /** Maximum failures to aggregate per commit */
  MAX_FAILURES_PER_COMMIT: 20,
  /** TTL buffer added to max wait for cleanup safety (seconds) */
  TTL_BUFFER_SECONDS: 60,
  /** Debounce marker value stored in Redis */
  DEBOUNCE_MARKER: "1",
  /** Default installation ID when not provided in metadata */
  DEFAULT_INSTALLATION_ID: "0",
} as const;

/**
 * Regex pattern for parsing aggregation metadata keys.
 * Matches format: kenchi:agg:{provider}:{repo}:{sha}:meta
 * Provider is a lowercase identifier (e.g., "github_actions", "vercel").
 * Repo is in "owner/repo" format (contains "/").
 */
export const AGGREGATION_KEY_PATTERN = new RegExp(
  `^${REDIS_KEY_PREFIXES.AGGREGATION.replace(":", "\\:")}:([a-z_]+):(.+):([a-f0-9]+):meta$`
);

/**
 * Aggregation metadata field names for Redis hash operations.
 */
export const AGGREGATION_METADATA_FIELDS = {
  FIRST_FAILURE_AT: "firstFailureAt",
  LAST_FAILURE_AT: "lastFailureAt",
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
  /** Incident triage queue max retries */
  INCIDENT_TRIAGE: 3,
  /** Investigation queue max retries */
  INVESTIGATION: 3,
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
  /** Incident triage visibility timeout (2 minutes for enrichment pipeline) */
  INCIDENT_TRIAGE: 120,
  /** Investigation visibility timeout (3 minutes for full diagnostic pipeline) */
  INVESTIGATION: 180,
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
  /** Incident triage jobs queue */
  INCIDENT_TRIAGE: "kenchi:incident-triage",
  /** Investigation jobs queue */
  INVESTIGATION: "kenchi:investigation",
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
  /** Dashboard real-time events (SSE) */
  DASHBOARD: "kenchi:events:dashboard",
  /** Incident triage events */
  INCIDENT_TRIAGE: "kenchi:events:incident-triage",
  /** Investigation events */
  INVESTIGATION: "kenchi:events:investigation",
} as const;
