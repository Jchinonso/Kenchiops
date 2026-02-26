/**
 * Tenant Alert Evaluation
 *
 * Pure functions that evaluate metric snapshots against thresholds and
 * produce alert objects. This module has NO side effects -- metrics
 * collection and alert dispatch are separate concerns.
 *
 * @module observability/alerting
 */

import { ALERT_THRESHOLDS_WARNING, ALERT_THRESHOLDS_CRITICAL } from "../constants/alerting.js";
import type {
  AlertSeverity,
  AlertThresholds,
  TenantAlert,
  TenantMetricSnapshot,
} from "./alertingTypes.js";

export type {
  AlertSeverity,
  AlertStatus,
  AlertThresholds,
  TenantAlert,
  TenantMetricSnapshot,
} from "./alertingTypes.js";

// ==================== Default Threshold Configs ====================

/**
 * Default thresholds for warning severity.
 */
export const DEFAULT_WARNING_THRESHOLDS: AlertThresholds = {
  errorRatePercent: ALERT_THRESHOLDS_WARNING.ERROR_RATE_PERCENT,
  latencyP95Seconds: ALERT_THRESHOLDS_WARNING.LATENCY_P95_SECONDS,
  activeJobsMax: ALERT_THRESHOLDS_WARNING.ACTIVE_JOBS_MAX,
  queueDepthMax: ALERT_THRESHOLDS_WARNING.QUEUE_DEPTH_MAX,
} as const;

/**
 * Default thresholds for critical severity.
 */
export const DEFAULT_CRITICAL_THRESHOLDS: AlertThresholds = {
  errorRatePercent: ALERT_THRESHOLDS_CRITICAL.ERROR_RATE_PERCENT,
  latencyP95Seconds: ALERT_THRESHOLDS_CRITICAL.LATENCY_P95_SECONDS,
  activeJobsMax: ALERT_THRESHOLDS_CRITICAL.ACTIVE_JOBS_MAX,
  queueDepthMax: ALERT_THRESHOLDS_CRITICAL.QUEUE_DEPTH_MAX,
} as const;

// ==================== Alert Rule Definitions ====================

/**
 * Internal definition of an alert rule that maps a metric to a threshold field.
 */
interface AlertRule {
  readonly alertName: string;
  readonly getValue: (metrics: TenantMetricSnapshot) => number;
  readonly getThreshold: (thresholds: AlertThresholds) => number;
  readonly formatMessage: (tenantId: string, value: number, threshold: number) => string;
}

const ALERT_RULES: readonly AlertRule[] = [
  {
    alertName: "TenantHighErrorRate",
    getValue: (metrics) => metrics.errorRatePercent,
    getThreshold: (thresholds) => thresholds.errorRatePercent,
    formatMessage: (tenantId, value, threshold) =>
      `Tenant ${tenantId} error rate ${value.toFixed(1)}% exceeds threshold ${threshold}%`,
  },
  {
    alertName: "TenantHighLatency",
    getValue: (metrics) => metrics.latencyP95Seconds,
    getThreshold: (thresholds) => thresholds.latencyP95Seconds,
    formatMessage: (tenantId, value, threshold) =>
      `Tenant ${tenantId} P95 latency ${value.toFixed(2)}s exceeds threshold ${threshold}s`,
  },
  {
    alertName: "TenantAnalysisBacklog",
    getValue: (metrics) => metrics.activeJobs,
    getThreshold: (thresholds) => thresholds.activeJobsMax,
    formatMessage: (tenantId, value, threshold) =>
      `Tenant ${tenantId} has ${value} active jobs (threshold: ${threshold})`,
  },
  {
    alertName: "TenantQueueDepth",
    getValue: (metrics) => metrics.queueDepth,
    getThreshold: (thresholds) => thresholds.queueDepthMax,
    formatMessage: (tenantId, value, threshold) =>
      `Tenant ${tenantId} queue depth ${value} exceeds threshold ${threshold}`,
  },
] as const;

// ==================== Evaluation Functions ====================

/**
 * Evaluate a single alert rule against the given metrics and thresholds.
 * Pure function: no side effects.
 */
const evaluateRule = (
  rule: AlertRule,
  tenantId: string,
  metrics: TenantMetricSnapshot,
  thresholds: AlertThresholds,
  severity: AlertSeverity,
  evaluatedAt: Date
): TenantAlert | null => {
  const value = rule.getValue(metrics);
  const threshold = rule.getThreshold(thresholds);

  if (value <= threshold) {
    return null;
  }

  return {
    alertName: rule.alertName,
    severity,
    status: "firing",
    tenantId,
    message: rule.formatMessage(tenantId, value, threshold),
    value,
    threshold,
    evaluatedAt,
  };
};

/**
 * Evaluate all alert rules for a single tenant against a metric snapshot.
 *
 * Checks both warning and critical thresholds. If a metric exceeds the
 * critical threshold, only the critical alert is returned (not the warning).
 *
 * @param tenantId - The tenant being evaluated.
 * @param metrics - Current metric values for the tenant.
 * @param warningThresholds - Warning-level thresholds (defaults provided).
 * @param criticalThresholds - Critical-level thresholds (defaults provided).
 * @returns Array of firing alerts (may be empty if all metrics are healthy).
 */
export const evaluateTenantAlerts = (
  tenantId: string,
  metrics: TenantMetricSnapshot,
  warningThresholds: AlertThresholds = DEFAULT_WARNING_THRESHOLDS,
  criticalThresholds: AlertThresholds = DEFAULT_CRITICAL_THRESHOLDS
): readonly TenantAlert[] => {
  const evaluatedAt = new Date();

  return ALERT_RULES.flatMap((rule) => {
    const criticalAlert = evaluateRule(
      rule,
      tenantId,
      metrics,
      criticalThresholds,
      "critical",
      evaluatedAt
    );

    // If critical fires, skip the warning for this rule to avoid duplicate noise
    if (criticalAlert !== null) {
      return [criticalAlert];
    }

    const warningAlert = evaluateRule(
      rule,
      tenantId,
      metrics,
      warningThresholds,
      "warning",
      evaluatedAt
    );

    return warningAlert !== null ? [warningAlert] : [];
  });
};

// ==================== Formatting ====================

/**
 * Format an alert into a human-readable message string.
 * Suitable for Slack notifications or structured log output.
 */
export const formatAlertMessage = (alert: TenantAlert): string => {
  const severityTag = alert.severity === "critical" ? "[CRITICAL]" : "[WARNING]";
  const statusTag = alert.status === "firing" ? "FIRING" : "RESOLVED";
  return `${severityTag} ${statusTag} ${alert.alertName}: ${alert.message}`;
};
