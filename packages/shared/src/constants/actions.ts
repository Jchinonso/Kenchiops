/**
 * Action Constants
 *
 * Centralized configuration for action execution, storage, and validation.
 *
 * @module constants/actions
 */

import { TIME_CONSTANTS } from "./time.js";

// ==================== Action Messages ====================

/**
 * Action execution error and status messages.
 */
export const ACTION_MESSAGES = {
  MISSING_WORKFLOW_CONTEXT: "Cannot rerun pipeline: No workflow run ID or check run ID provided",
  MISSING_PR_NUMBER: "Cannot post comment: No PR number provided",
  EXECUTION_FAILED: "Action execution failed",
  ACTION_COMPLETED: "Action completed",
  RERUN_REQUEST_FAILED: "Rerun request failed",
} as const;

// ==================== Action Payload Store ====================

/**
 * Payload store configuration for TTL, cleanup, and capacity.
 */
export const ACTION_STORE_CONFIG = {
  /** Time-to-live for stored payloads (1 hour) */
  PAYLOAD_TTL_MS: TIME_CONSTANTS.MILLISECONDS_PER_HOUR,
  /** Interval between cleanup runs (5 minutes) */
  CLEANUP_INTERVAL_MS: TIME_CONSTANTS.MILLISECONDS_PER_MINUTE * 5,
  /** Maximum number of payloads to store */
  MAX_PAYLOADS: 10000,
  /** Percentage of entries to evict when at capacity (10%) */
  EVICTION_RATIO: 0.1,
} as const;

/**
 * Token and ID generation configuration.
 */
export const ACTION_TOKEN_CONFIG = {
  /** Length of the full verification token */
  VERIFICATION_LENGTH: 8,
  /** Length of the verification prefix sent to client */
  PREFIX_LENGTH: 4,
  /** Number of segments in short ID (xxxx-xxxx-xxxx) */
  SEGMENT_COUNT: 3,
  /** Length of each segment in short ID */
  SEGMENT_LENGTH: 4,
} as const;

/**
 * Character sets for random string generation.
 */
export const ACTION_CHAR_SETS = {
  /** Lowercase alphanumeric for IDs */
  LOWER: "abcdefghijklmnopqrstuvwxyz0123456789",
  /** Mixed case alphanumeric for tokens */
  MIXED: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
} as const;
