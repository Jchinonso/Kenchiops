/**
 * Core Module Constants
 *
 * Default values and configuration for logger and config modules.
 */

// ==================== Logger Defaults ====================

/**
 * Default logger configuration
 */
export const LOGGER_DEFAULTS = {
  SERVICE_NAME: "kenchi",
} as const;

// ==================== Config Defaults ====================

/**
 * Default configuration values
 */
export const CONFIG_DEFAULTS = {
  PORT: 3000,
  OPENAI_MAX_TOKENS: 4096,
  OPENAI_TIMEOUT_MS: 90000,
  GITHUB_APP_SLUG: "kenchi-devops",
  NODE_ENV: "development",
  // Service URLs (Docker Compose DNS names)
  API_URL: "http://api:3000",
  SLACK_BOT_URL: "http://slack-bot:3001",
  GITHUB_APP_URL: "http://github-app:3002",
  INCIDENT_TRIAGE_URL: "http://incident-triage:3004",
  // Redis URL
  REDIS_URL: "redis://redis:6379",
} as const;

/**
 * HTTP client resilience defaults
 */
export const HTTP_RESILIENCE_DEFAULTS = {
  /** Request timeout in milliseconds */
  TIMEOUT_MS: 90000,
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
  /** Initial retry delay in milliseconds */
  INITIAL_RETRY_DELAY_MS: 1000,
  /** Maximum retry delay in milliseconds */
  MAX_RETRY_DELAY_MS: 10000,
  /** Circuit breaker failure threshold */
  CIRCUIT_BREAKER_THRESHOLD: 5,
  /** Circuit breaker reset timeout in milliseconds */
  CIRCUIT_BREAKER_RESET_MS: 30000,
  /** Successes required to close circuit from half-open */
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD: 1,
  /** Jitter factor for exponential backoff (0-30%) */
  JITTER_FACTOR: 0.3,
  /** Rate limit check timeout in milliseconds */
  RATE_LIMIT_CHECK_TIMEOUT_MS: 3000,
} as const;

/** Service keys for circuit breaker integrations. */
export const CIRCUIT_BREAKER_SERVICE_KEYS = {
  OPENAI: "openai",
  GITHUB: "github",
  SLACK: "slack",
} as const;

/**
 * Circuit breaker idle eviction configuration.
 * Entries with no activity for longer than this TTL are evicted
 * to prevent unbounded memory growth from per-tenant keys.
 */
export const CIRCUIT_BREAKER_CLEANUP = {
  /** Idle TTL before eviction (1 hour). */
  IDLE_TTL_MS: 60 * 60 * 1000,
  /** How often to run the cleanup sweep (5 minutes). */
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
} as const;

/**
 * Retryable HTTP status codes
 */
export const RETRYABLE_HTTP_STATUS_CODES = [408, 429, 500, 502, 503, 504] as const;

/**
 * Retryable network error patterns (lowercase)
 */
export const RETRYABLE_NETWORK_ERRORS = [
  "econnrefused",
  "econnreset",
  "etimedout",
  "enotfound",
  "eai_again",
  "socket hang up",
  "network",
  "fetch failed",
] as const;

/**
 * Valid Node.js environment values
 */
export const VALID_NODE_ENVS = ["development", "production", "test"] as const;

/**
 * Radix for parseInt operations
 */
export const PARSE_INT_RADIX = 10;

/**
 * Radix for hex string conversion
 */
export const HEX_RADIX = 16;

/**
 * Byte width for hex string padding (2 chars per byte)
 */
export const HEX_BYTE_WIDTH = 2;

/**
 * ID generation configuration
 */
export const ID_GENERATION = {
  /** Start index for extracting random part from base36 string (skip "0.") */
  RANDOM_START_INDEX: 2,
  /** End index for extracting random part (9 characters) */
  RANDOM_END_INDEX: 11,
  /** Default prefix for event IDs */
  DEFAULT_PREFIX: "evt",
} as const;
