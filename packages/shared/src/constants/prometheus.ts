/**
 * Prometheus Alertmanager Webhook Constants
 *
 * Constants for Prometheus Alertmanager webhook integration including
 * alert statuses and protocol version.
 *
 * @module constants/prometheus
 */

// ==================== Alert Statuses ====================

/**
 * Prometheus Alertmanager webhook status values.
 * These correspond to the top-level `status` field in Alertmanager payloads.
 */
export const PROMETHEUS_ALERT_STATUSES = {
  FIRING: "firing",
  RESOLVED: "resolved",
} as const;

// ==================== Protocol ====================

/**
 * Expected Alertmanager webhook protocol version.
 * Used for payload validation.
 */
export const PROMETHEUS_WEBHOOK_VERSION = "4" as const;
