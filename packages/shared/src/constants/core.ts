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
  GITHUB_APP_URL: "http://github-app:3002",
  NODE_ENV: "development",
} as const;

/**
 * Valid Node.js environment values
 */
export const VALID_NODE_ENVS = ["development", "production", "test"] as const;

/**
 * Radix for parseInt operations
 */
export const PARSE_INT_RADIX = 10;
