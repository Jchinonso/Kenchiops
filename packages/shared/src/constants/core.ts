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
  OPENAI_TIMEOUT_MS: 30000,
  GITHUB_APP_SLUG: "kenchi-devops",
  NODE_ENV: "development",
  // Service URLs (Docker Compose DNS names)
  API_URL: "http://api:3000",
  SLACK_BOT_URL: "http://slack-bot:3001",
  GITHUB_APP_URL: "http://github-app:3002",
  // Redis URL
  REDIS_URL: "redis://redis:6379",
} as const;

/**
 * HTTP client resilience defaults
 */
export const HTTP_RESILIENCE_DEFAULTS = {
  /** Request timeout in milliseconds */
  TIMEOUT_MS: 30000,
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
} as const;

/**
 * Valid Node.js environment values
 */
export const VALID_NODE_ENVS = ["development", "production", "test"] as const;

/**
 * Radix for parseInt operations
 */
export const PARSE_INT_RADIX = 10;
