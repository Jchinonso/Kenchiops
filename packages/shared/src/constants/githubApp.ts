/**
 * GitHub App service constants for rate limiting, timeouts, and configuration.
 * All github-app service hardcoded values should be centralized here.
 */

import { TIME_CONSTANTS } from "./time.js";

// ==================== Rate Limiting ====================

/**
 * Rate limiting configuration for GitHub App HTTP endpoints.
 * Higher limits since webhooks can come in bursts during CI activity.
 */
export const GITHUB_APP_RATE_LIMITS = {
  /** Rate limit window in milliseconds (1 minute) */
  WINDOW_MS: TIME_CONSTANTS.MILLISECONDS_PER_MINUTE,
  /** Maximum requests per window for webhook bursts */
  MAX_REQUESTS: 500,
  /** Redis key prefix for rate limiting */
  KEY_PREFIX: "rl:github-app:",
} as const;

/**
 * Paths to skip for rate limiting (health checks for monitoring).
 */
export const GITHUB_APP_HEALTH_PATHS: ReadonlySet<string> = new Set(["/health", "/github/health"]);

/**
 * Check if a path should skip rate limiting.
 * @param path - The request path to check
 * @returns True if the path should skip rate limiting
 */
export const shouldSkipGitHubAppRateLimit = (path: string): boolean =>
  GITHUB_APP_HEALTH_PATHS.has(path);

// ==================== Timeouts ====================

/**
 * Timeout and interval values for GitHub App operations.
 */
export const GITHUB_APP_TIMEOUTS = {
  /** Graceful shutdown timeout in milliseconds */
  SHUTDOWN_TIMEOUT_MS: 15000,
} as const;

/**
 * Database connection pool configuration for GitHub App.
 */
export const GITHUB_APP_DB_CONFIG = {
  /** Maximum database connections */
  MAX_CONNECTIONS: 10,
  /** Idle timeout in milliseconds */
  IDLE_TIMEOUT_MS: 30000,
} as const;

// ==================== Setup Page ====================

/**
 * Setup page configuration.
 */
export const GITHUB_SETUP_CONFIG = {
  /** Delay before reloading setup page when installation is processing (ms) */
  RELOAD_DELAY_MS: 3000,
} as const;

// ==================== Messages ====================

/**
 * Standard messages for GitHub App responses.
 */
export const GITHUB_APP_MESSAGES = {
  /** Rate limit exceeded message */
  RATE_LIMIT_EXCEEDED: "Too many requests to GitHub app service",
} as const;
