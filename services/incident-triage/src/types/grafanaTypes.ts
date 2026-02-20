/**
 * Grafana Alerting Webhook Types
 *
 * Type definitions for Grafana unified alerting webhook payloads.
 * Grafana sends alert groups with common labels, annotations, and individual alerts.
 */

import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Payload Types ====================

/**
 * Individual Grafana alert within a group.
 */
export interface GrafanaAlert {
  readonly status: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly annotations: Readonly<Record<string, string>>;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly fingerprint: string;
  readonly generatorURL?: string;
  readonly silenceURL?: string;
  readonly dashboardURL?: string;
  readonly panelURL?: string;
  readonly values?: Readonly<Record<string, number>>;
}

/**
 * Grafana unified alerting webhook payload.
 */
export interface GrafanaWebhookPayload {
  readonly receiver: string;
  readonly status: string;
  readonly orgId: number;
  readonly alerts: ReadonlyArray<GrafanaAlert>;
  readonly groupLabels: Readonly<Record<string, string>>;
  readonly commonLabels: Readonly<Record<string, string>>;
  readonly commonAnnotations: Readonly<Record<string, string>>;
  readonly externalURL: string;
  readonly version: string;
  readonly groupKey: string;
  readonly truncatedAlerts?: number;
  readonly title?: string;
  readonly state?: string;
  readonly message?: string;
}

// ==================== Severity Mapping ====================

/**
 * Mapping from Grafana severity label values to normalized severity.
 */
export const GRAFANA_SEVERITY_MAP: Readonly<Record<string, AlertSeverity>> = {
  critical: "critical",
  high: "high",
  warning: "medium",
  medium: "medium",
  low: "low",
  info: "info",
  informational: "info",
  none: "info",
} as const;
