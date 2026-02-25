/**
 * Alerting Constants
 *
 * Default thresholds for per-tenant metric alerting.
 *
 * @module constants/alerting
 */

/**
 * Default alert thresholds for "warning" severity.
 * Intended for early detection of degraded tenant health.
 */
export const ALERT_THRESHOLDS_WARNING = {
  ERROR_RATE_PERCENT: 10,
  LATENCY_P95_SECONDS: 5,
  ACTIVE_JOBS_MAX: 10,
  QUEUE_DEPTH_MAX: 50,
} as const;

/**
 * Default alert thresholds for "critical" severity.
 * Intended for immediate attention / paging.
 */
export const ALERT_THRESHOLDS_CRITICAL = {
  ERROR_RATE_PERCENT: 25,
  LATENCY_P95_SECONDS: 15,
  ACTIVE_JOBS_MAX: 25,
  QUEUE_DEPTH_MAX: 200,
} as const;
