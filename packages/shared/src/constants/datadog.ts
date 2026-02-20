/**
 * Datadog Webhook Constants
 *
 * Constants for Datadog webhook integration including alert statuses
 * and failure classifications.
 *
 * @module constants/datadog
 */

// ==================== Alert Statuses ====================

/**
 * Datadog monitor alert status values.
 * These correspond to the `$ALERT_STATUS` variable in Datadog webhook payloads.
 */
export const DATADOG_ALERT_STATUSES = {
  TRIGGERED: "Triggered",
  WARN: "Warn",
  RECOVERED: "Recovered",
  NO_DATA: "No Data",
  RE_NOTIFIED: "Re-Notified",
} as const;

/**
 * Datadog alert statuses that represent active failures we should triage.
 */
export const DATADOG_FAILURE_STATUSES: ReadonlySet<string> = new Set([
  DATADOG_ALERT_STATUSES.TRIGGERED,
  DATADOG_ALERT_STATUSES.WARN,
  DATADOG_ALERT_STATUSES.RE_NOTIFIED,
]);
