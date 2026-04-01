/**
 * Monitoring Types
 *
 * Type definitions for the monitoring integration feature (Phase 2).
 * Covers the monitoring port, adapter interfaces, query parameters,
 * and external API response shapes for Datadog, Grafana, Prometheus,
 * PagerDuty, Vercel, and Netlify.
 *
 * @module investigation/monitoringTypes
 */

import type { RequestContext } from "../core/types.js";
import type { InvestigationSymptom, InvestigationEvidenceItem } from "./types.js";

// ==================== Monitoring Query ====================

/**
 * Parameters for querying monitoring providers during evidence gathering.
 * Derived from the parsed investigation intent.
 */
export interface MonitoringQuery {
  readonly tenantId: string;
  readonly serviceName: string | null;
  readonly environment: string | null;
  readonly symptom: InvestigationSymptom;
  readonly hoursBack: number;
  readonly limit: number;
}

// ==================== Port & Adapter Interfaces ====================

/**
 * Port interface for gathering monitoring evidence.
 * Internally fans out to all configured monitoring adapters.
 */
export interface MonitoringPort {
  readonly gatherMetrics: (
    query: MonitoringQuery,
    context: RequestContext
  ) => Promise<readonly InvestigationEvidenceItem[]>;
}

/**
 * Individual monitoring adapter interface.
 * Each adapter queries a single monitoring provider.
 */
export interface MonitoringAdapter {
  readonly name: string;
  readonly isConfigured: () => boolean;
  readonly fetchEvidence: (
    query: MonitoringQuery,
    context: RequestContext
  ) => Promise<readonly InvestigationEvidenceItem[]>;
}

// ==================== Datadog API Response Types ====================

/**
 * Datadog metric series data point: [timestamp, value].
 */
export interface DatadogMetricPoint {
  readonly timestamp: number;
  readonly value: number | null;
}

/**
 * Datadog metric series from /api/v1/query response.
 */
export interface DatadogMetricSeries {
  readonly metric: string;
  readonly pointlist: readonly (readonly [number, number | null])[];
  readonly scope: string;
  readonly expression: string;
}

/**
 * Datadog /api/v1/query response envelope.
 */
export interface DatadogMetricsResponse {
  readonly status: string;
  readonly series?: readonly DatadogMetricSeries[];
  readonly query?: string;
}

/**
 * Datadog event from /api/v1/events response.
 */
export interface DatadogEvent {
  readonly id: number;
  readonly title: string;
  readonly text: string;
  readonly date_happened: number;
  readonly alert_type?: string;
  readonly source_type_name?: string;
  readonly tags?: readonly string[];
}

/**
 * Datadog /api/v1/events response envelope.
 */
export interface DatadogEventsResponse {
  readonly events?: readonly DatadogEvent[];
}

// ==================== Grafana API Response Types ====================

/**
 * Grafana alert rule from /api/v1/provisioning/alert-rules response.
 */
export interface GrafanaAlertRule {
  readonly uid: string;
  readonly title: string;
  readonly condition: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
  readonly provenance?: string;
  readonly isPaused?: boolean;
}

/**
 * Extended Grafana alert rule with state information.
 * This combines rule metadata with runtime state.
 */
export interface GrafanaAlertInstance {
  readonly uid: string;
  readonly title: string;
  readonly state: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
  readonly activeAt?: string;
}

/**
 * Grafana /api/prometheus/grafana/api/v1/rules response for alert state.
 */
export interface GrafanaRulesGroupResponse {
  readonly status: string;
  readonly data?: {
    readonly groups?: readonly GrafanaRulesGroup[];
  };
}

/**
 * Single rules group within Grafana rules response.
 */
export interface GrafanaRulesGroup {
  readonly name: string;
  readonly rules?: readonly GrafanaRuleEntry[];
}

/**
 * Single rule entry within a Grafana rules group.
 */
export interface GrafanaRuleEntry {
  readonly name: string;
  readonly state: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
  readonly alerts?: readonly GrafanaAlertInstance[];
}

/**
 * Grafana annotation from /api/annotations response.
 */
export interface GrafanaAnnotation {
  readonly id: number;
  readonly alertId?: number;
  readonly dashboardId?: number;
  readonly panelId?: number;
  readonly text: string;
  readonly tags?: readonly string[];
  readonly created: number;
  readonly updated: number;
  readonly time: number;
  readonly timeEnd: number;
}

// ==================== Vercel API Response Types ====================

/**
 * Vercel deployment from /v6/deployments response.
 */
export interface VercelDeployment {
  readonly uid: string;
  readonly name: string;
  readonly url?: string;
  readonly state: string;
  readonly created: number;
  readonly ready?: number;
  readonly buildingAt?: number;
  readonly meta?: Readonly<Record<string, string>>;
  readonly creator?: {
    readonly uid: string;
    readonly username?: string;
  };
  readonly inspectorUrl?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

/**
 * Vercel /v6/deployments response envelope.
 */
export interface VercelDeploymentsResponse {
  readonly deployments?: readonly VercelDeployment[];
  readonly pagination?: {
    readonly count: number;
    readonly next?: number;
  };
}

// ==================== Prometheus API Response Types ====================

/**
 * Prometheus alert from /api/v1/alerts response.
 */
export interface PrometheusAlert {
  readonly labels: Readonly<Record<string, string>>;
  readonly annotations: Readonly<Record<string, string>>;
  readonly state: string;
  readonly activeAt: string;
  readonly value: string;
}

/**
 * Prometheus /api/v1/alerts response envelope.
 */
export interface PrometheusAlertsResponse {
  readonly status: string;
  readonly data?: {
    readonly alerts?: readonly PrometheusAlert[];
  };
}

/**
 * Prometheus metric sample in a range query result.
 */
export interface PrometheusRangeSample {
  readonly metric: Readonly<Record<string, string>>;
  readonly values: readonly (readonly [number, string])[];
}

/**
 * Prometheus /api/v1/query_range response envelope.
 */
export interface PrometheusQueryRangeResponse {
  readonly status: string;
  readonly data?: {
    readonly resultType: string;
    readonly result?: readonly PrometheusRangeSample[];
  };
}

// ==================== PagerDuty API Response Types ====================

/**
 * PagerDuty incident from /incidents response.
 */
export interface PagerDutyIncident {
  readonly id: string;
  readonly incident_number: number;
  readonly title: string;
  readonly description?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly status: string;
  readonly urgency: string;
  readonly html_url: string;
  readonly service?: {
    readonly id: string;
    readonly summary: string;
  };
  readonly assignments?: readonly {
    readonly assignee: {
      readonly summary: string;
    };
  }[];
}

/**
 * PagerDuty /incidents response envelope.
 */
export interface PagerDutyIncidentsResponse {
  readonly incidents?: readonly PagerDutyIncident[];
  readonly more?: boolean;
  readonly total?: number;
}

// ==================== Netlify API Response Types ====================

/**
 * Netlify deploy from /api/v1/sites/:site_id/deploys response.
 */
export interface NetlifyDeploy {
  readonly id: string;
  readonly site_id: string;
  readonly state: string;
  readonly name?: string;
  readonly url?: string;
  readonly deploy_url?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly error_message?: string;
  readonly branch?: string;
  readonly commit_ref?: string;
  readonly commit_url?: string;
  readonly title?: string;
  readonly context?: string;
}

/**
 * Netlify deploys response -- the API returns an array directly.
 */
export type NetlifyDeploysResponse = readonly NetlifyDeploy[];
