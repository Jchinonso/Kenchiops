/**
 * Monitoring Constants
 *
 * Configuration constants for monitoring adapters (Datadog, Grafana, Prometheus,
 * PagerDuty, Vercel, Netlify). Includes API endpoint paths, timeout/retry defaults,
 * and symptom-to-metric query mappings.
 *
 * @module constants/monitoringConstants
 */

import type { InvestigationSymptom } from "../types/investigationTypes.js";

// ==================== Defaults ====================

/**
 * Default configuration for monitoring adapter requests.
 */
export const MONITORING_DEFAULTS = {
  /** Per-provider request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 15000,
  /** Maximum retry attempts per request */
  MAX_RETRIES: 2,
  /** Maximum results to return per monitoring provider */
  MAX_RESULTS_PER_PROVIDER: 10,
  /** Datadog API hard limit: query window must be < 24 hours */
  DATADOG_MAX_QUERY_WINDOW_HOURS: 24,
} as const;

// ==================== Datadog API Endpoints ====================

/**
 * Datadog API endpoint paths.
 */
export const DATADOG_API = {
  METRICS_QUERY: "/api/v1/query",
  EVENTS_LIST: "/api/v1/events",
} as const;

// ==================== Grafana API Endpoints ====================

/**
 * Grafana API endpoint paths.
 */
export const GRAFANA_API = {
  RULES: "/api/prometheus/grafana/api/v1/rules",
  ANNOTATIONS: "/api/annotations",
} as const;

// ==================== Prometheus API Endpoints ====================

/**
 * Prometheus API endpoint paths.
 */
export const PROMETHEUS_API = {
  ALERTS: "/api/v1/alerts",
  QUERY_RANGE: "/api/v1/query_range",
} as const;

// ==================== PagerDuty API Endpoints ====================

/**
 * PagerDuty API endpoint paths and base URL.
 */
export const PAGERDUTY_API = {
  INCIDENTS: "/incidents",
  BASE_URL: "https://api.pagerduty.com",
} as const;

// ==================== Vercel API Endpoints ====================

/**
 * Vercel API endpoint paths.
 */
export const VERCEL_API = {
  DEPLOYMENTS: "/v6/deployments",
} as const;

// ==================== Netlify API Endpoints ====================

/**
 * Netlify API base URL and deploy endpoint template.
 */
export const NETLIFY_API = {
  BASE_URL: "https://api.netlify.com",
  DEPLOYS_PATH_PREFIX: "/api/v1/sites/",
  DEPLOYS_PATH_SUFFIX: "/deploys",
} as const;

// ==================== Symptom-to-Metric Mapping ====================

/**
 * Maps investigation symptoms to Datadog metric query templates.
 * `$SERVICE` is replaced with the actual service name at query time.
 */
export const SYMPTOM_METRIC_QUERIES: Readonly<Record<InvestigationSymptom, string>> = {
  slow_response: "avg:trace.http.request.duration{service:$SERVICE}",
  errors: "sum:trace.http.request.errors{service:$SERVICE}.as_count()",
  high_latency: "avg:trace.http.request.duration{service:$SERVICE}",
  cpu_spike: "avg:system.cpu.user{service:$SERVICE}",
  memory_leak: "avg:system.mem.used{service:$SERVICE}",
  downtime: "avg:http.can_connect{service:$SERVICE}",
  deployment_failure: "count:deployment.status{service:$SERVICE,status:failure}",
  data_inconsistency: "sum:trace.http.request.errors{service:$SERVICE}.as_count()",
  unknown: "avg:trace.http.request.duration{service:$SERVICE}",
} as const;

/**
 * Grafana alert states that indicate an active problem.
 */
export const GRAFANA_ACTIVE_ALERT_STATES: ReadonlySet<string> = new Set([
  "firing",
  "pending",
]) as ReadonlySet<string>;

/**
 * Vercel deployment states that indicate failure or error.
 */
export const VERCEL_ERROR_DEPLOYMENT_STATES: ReadonlySet<string> = new Set([
  "ERROR",
  "CANCELED",
]) as ReadonlySet<string>;

// ==================== Prometheus Symptom-to-PromQL Mapping ====================

/**
 * Maps investigation symptoms to PromQL query templates.
 * `$SERVICE` is replaced with the actual service name at query time.
 */
export const SYMPTOM_PROMQL_QUERIES: Readonly<Record<InvestigationSymptom, string>> = {
  slow_response:
    'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service="$SERVICE"}[5m]))',
  errors: 'rate(http_requests_total{service="$SERVICE",code=~"5.."}[5m])',
  high_latency:
    'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="$SERVICE"}[5m]))',
  cpu_spike: 'rate(process_cpu_seconds_total{service="$SERVICE"}[5m])',
  memory_leak: 'process_resident_memory_bytes{service="$SERVICE"}',
  downtime: 'up{service="$SERVICE"}',
  deployment_failure: 'kube_deployment_status_replicas_unavailable{deployment="$SERVICE"}',
  data_inconsistency: 'rate(http_requests_total{service="$SERVICE",code=~"5.."}[5m])',
  unknown: 'rate(http_requests_total{service="$SERVICE"}[5m])',
} as const;

/**
 * Prometheus alert states that indicate an active problem.
 */
export const PROMETHEUS_ACTIVE_ALERT_STATES: ReadonlySet<string> = new Set([
  "firing",
  "pending",
]) as ReadonlySet<string>;

/**
 * PagerDuty incident statuses that indicate an active problem.
 */
export const PAGERDUTY_ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  "triggered",
  "acknowledged",
]) as ReadonlySet<string>;

/**
 * Netlify deploy states that indicate failure or error.
 */
export const NETLIFY_ERROR_DEPLOY_STATES: ReadonlySet<string> = new Set([
  "error",
  "build_failed",
]) as ReadonlySet<string>;
