/**
 * Slack-specific constants - verification and API limits.
 */

import { TIME_CONSTANTS } from "./time.js";

/**
 * Slack signature verification constants.
 */
export const SLACK_VERIFICATION = {
  SIGNATURE_PREFIX: "v0",
  LOG_SUBSTRING_LENGTH: 20,
  TIMESTAMP_WINDOW_SECONDS:
    TIME_CONSTANTS.SECONDS_PER_MINUTE * TIME_CONSTANTS.SLACK_TIMESTAMP_WINDOW_MINUTES,
} as const;

/**
 * Slack API limits and pagination.
 */
export const SLACK_API_LIMITS = {
  /** Maximum results per page for conversations.list API */
  CONVERSATIONS_LIST_LIMIT: 1000,
} as const;

/**
 * Patterns to identify transient socket-mode errors that should not crash the app.
 * These errors occur when Slack disconnects during the connecting state.
 */
export const SOCKET_MODE_ERROR_PATTERNS = [
  "Unhandled event",
  "server explicit disconnect",
  "state",
] as const;

/**
 * Check if an error is a transient socket-mode disconnect.
 * Uses functional pattern with every() for pattern matching.
 */
export const isSocketModeDisconnectError = (errorMessage: string | undefined): boolean =>
  errorMessage !== undefined &&
  SOCKET_MODE_ERROR_PATTERNS.every((pattern) => errorMessage.includes(pattern));
