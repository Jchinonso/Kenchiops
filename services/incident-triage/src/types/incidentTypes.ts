/**
 * Incident Triage Core Types
 *
 * Domain types for alert sources, severities, statuses, and normalized alerts.
 */

// ==================== Alert Enums ====================

export type AlertSource =
  | "pagerduty"
  | "datadog"
  | "cloudwatch"
  | "prometheus"
  | "grafana"
  | "vercel"
  | "netlify"
  | "custom";

export type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";

export type AlertStatus =
  | "received"
  | "processing"
  | "deduped"
  | "triaged"
  | "escalated"
  | "acknowledged"
  | "resolved"
  | "closed";

// ==================== Normalized Alert ====================

/**
 * Normalized alert structure produced by source adapters.
 * All monitoring sources (PagerDuty, Datadog, etc.) are mapped to this format.
 */
export interface NormalizedAlert {
  readonly sourceAlertId: string;
  readonly deliveryId: string;
  readonly source: AlertSource;
  readonly title: string;
  readonly description: string | null;
  readonly severity: AlertSeverity;
  readonly fingerprint: string;
  readonly serviceName: string | null;
  readonly environment: string | null;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly labels: Readonly<Record<string, string>>;
  readonly receivedAt: string;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
}
