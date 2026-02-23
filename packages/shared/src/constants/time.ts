/**
 * Time, rate limiting, and service configuration constants.
 */

/**
 * Time constants (in various units).
 */
export const TIME_CONSTANTS = {
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
  DAYS_PER_WEEK: 7,
  MILLISECONDS_PER_SECOND: 1000,
  MILLISECONDS_PER_MINUTE: 60 * 1000,
  MILLISECONDS_PER_HOUR: 60 * 60 * 1000,
  MILLISECONDS_PER_DAY: 24 * 60 * 60 * 1000,
  SLACK_TIMESTAMP_WINDOW_MINUTES: 5,
} as const;

/**
 * Service port defaults.
 */
export const SERVICE_PORTS = {
  API: 3000,
  SLACK_BOT_HTTP: 3001,
  SLACK_BOT_WEBHOOK: 3002,
  GITHUB_APP: 3003,
  INCIDENT_TRIAGE: 3004,
} as const;

/**
 * Rate limiting constants.
 */
export const RATE_LIMIT_CONSTANTS = {
  DEFAULT_WINDOW_MS: TIME_CONSTANTS.SECONDS_PER_MINUTE * TIME_CONSTANTS.MILLISECONDS_PER_SECOND, // 1 minute
  DEFAULT_MAX_REQUESTS: 100,
  CLEANUP_PROBABILITY: 0.01, // 1% chance to cleanup on each request
  RATE_LIMIT_STATUS_CODE: 429,
} as const;
