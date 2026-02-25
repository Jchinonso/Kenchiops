/**
 * Usage Alert Constants
 *
 * Thresholds and configuration for usage threshold alerting.
 *
 * @module constants/usageAlerts
 */

// ==================== Threshold Levels ====================

export const USAGE_ALERT_THRESHOLDS = {
  APPROACHING: 0.75,
  WARNING: 0.9,
  CRITICAL: 0.95,
  EXCEEDED: 1.0,
} as const;

export const USAGE_ALERT_LEVELS = {
  NONE: "none",
  APPROACHING: "approaching",
  WARNING: "warning",
  CRITICAL: "critical",
  EXCEEDED: "exceeded",
} as const;

// ==================== Deduplication ====================

export const USAGE_ALERT_DEDUP = {
  /** Reset deduplication state after this many milliseconds (24 hours). */
  RESET_INTERVAL_MS: 86_400_000,
} as const;

// ==================== Scheduler ====================

export const USAGE_ALERT_SCHEDULER = {
  /** Usage threshold check interval: 15 minutes */
  CHECK_INTERVAL_MS: 900_000,
} as const;
