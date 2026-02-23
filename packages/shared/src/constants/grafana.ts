/**
 * Grafana Webhook Constants
 *
 * Constants for Grafana alerting webhook integration including
 * signature verification and alert statuses.
 *
 * @module constants/grafana
 */

// ==================== Signature Verification ====================

/**
 * Grafana alerting webhook signature verification constants.
 * Grafana uses HMAC-SHA256 with a separate timestamp header.
 */
export const GRAFANA_SIGNATURE = {
  HEADER: "x-grafana-alerting-signature",
  TIMESTAMP_HEADER: "x-grafana-alerting-timestamp",
  ALGORITHM: "sha256",
} as const;

// ==================== Alert Statuses ====================

/**
 * Grafana alerting webhook status values.
 * These correspond to the top-level `status` field in Grafana alert payloads.
 */
export const GRAFANA_ALERT_STATUSES = {
  FIRING: "firing",
  RESOLVED: "resolved",
} as const;
