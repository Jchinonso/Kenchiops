/**
 * Alerting Types
 *
 * Type definitions for per-tenant metric alerting and threshold evaluation.
 *
 * @module observability/alertingTypes
 */

// ==================== Alert Severity & Status ====================

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "firing" | "resolved";

// ==================== Alert ====================

/**
 * A single evaluated alert for a specific tenant and metric.
 */
export interface TenantAlert {
  readonly alertName: string;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly tenantId: string;
  readonly message: string;
  readonly value: number;
  readonly threshold: number;
  readonly evaluatedAt: Date;
}

// ==================== Thresholds ====================

/**
 * Threshold configuration for tenant health alerting.
 * Each value represents the boundary above which an alert fires.
 */
export interface AlertThresholds {
  /** Error rate percentage (0-100). Fires when exceeded. */
  readonly errorRatePercent: number;
  /** P95 latency in seconds. Fires when exceeded. */
  readonly latencyP95Seconds: number;
  /** Maximum active analysis jobs. Fires when exceeded. */
  readonly activeJobsMax: number;
  /** Maximum queue depth. Fires when exceeded. */
  readonly queueDepthMax: number;
}

// ==================== Metric Input ====================

/**
 * Current metric values for a tenant, passed into the alert evaluator.
 * These values are collected from Prometheus or Redis counters.
 */
export interface TenantMetricSnapshot {
  /** Error rate as a percentage (0-100) */
  readonly errorRatePercent: number;
  /** P95 latency in seconds */
  readonly latencyP95Seconds: number;
  /** Number of currently active analysis jobs */
  readonly activeJobs: number;
  /** Current queue depth */
  readonly queueDepth: number;
}
