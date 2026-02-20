/**
 * Prometheus Alertmanager Webhook Types
 *
 * Type definitions for Prometheus Alertmanager webhook payloads.
 * Nearly identical to Grafana (same Alertmanager format) but without
 * Grafana-specific fields (orgId, dashboardURL, values).
 */

import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Payload Types ====================

/**
 * Individual Prometheus alert within a group.
 */
export interface PrometheusAlert {
  readonly status: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly annotations: Readonly<Record<string, string>>;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly fingerprint: string;
  readonly generatorURL?: string;
}

/**
 * Prometheus Alertmanager webhook payload.
 */
export interface PrometheusAlertmanagerPayload {
  readonly version: string;
  readonly groupKey: string;
  readonly status: string;
  readonly receiver: string;
  readonly alerts: ReadonlyArray<PrometheusAlert>;
  readonly groupLabels: Readonly<Record<string, string>>;
  readonly commonLabels: Readonly<Record<string, string>>;
  readonly commonAnnotations: Readonly<Record<string, string>>;
  readonly externalURL: string;
  readonly truncatedAlerts?: number;
}

// ==================== Severity Mapping ====================

/**
 * Mapping from Prometheus severity label values to normalized severity.
 */
export const PROMETHEUS_SEVERITY_MAP: Readonly<Record<string, AlertSeverity>> = {
  critical: "critical",
  high: "high",
  warning: "medium",
  medium: "medium",
  low: "low",
  info: "info",
  informational: "info",
  none: "info",
} as const;
