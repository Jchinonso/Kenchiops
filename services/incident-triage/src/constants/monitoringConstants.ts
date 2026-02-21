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

// ==================== Time Constants ====================

/** Milliseconds in one hour */
export const MS_PER_HOUR = 3_600_000;

/** Seconds in one hour */
export const SECONDS_PER_HOUR = 3_600;

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
  /** Maximum lookback window for any monitoring query (hours) */
  MAX_LOOKBACK_HOURS: 168,
  /** Maximum concurrency for parallel adapter fan-out */
  ADAPTER_CONCURRENCY: 4,
} as const;

// ==================== Service Name Sanitization ====================

/**
 * Allowed characters in service names for metric queries.
 * Only alphanumeric, hyphens, underscores, and dots are permitted.
 * Prevents PromQL injection, Datadog query injection, and other
 * query language escaping attacks.
 */
const allowedServiceNameChars: ReadonlySet<string> = new Set(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.".split("")
);

/**
 * Sanitizes a service name for safe use in PromQL and Datadog metric queries.
 * Strips any characters that could break out of query label matchers.
 * Returns null if the service name is invalid or empty after sanitization.
 */
export const sanitizeServiceName = (serviceName: string | null): string | null => {
  if (serviceName === null) {
    return null;
  }
  const trimmed = serviceName.trim();
  if (trimmed === "") {
    return null;
  }
  const allCharsAllowed = [...trimmed].every((ch) => allowedServiceNameChars.has(ch));
  return allCharsAllowed ? trimmed : null;
};

// ==================== Base URL Validation ====================

/**
 * Validates that a base URL uses HTTPS (or HTTP for local development)
 * and does not contain path traversal or unexpected components.
 * Returns the validated URL or null if invalid.
 */
export const validateBaseUrl = (baseUrl: string): string | null => {
  if (baseUrl === "") {
    return null;
  }
  try {
    const { protocol, pathname, origin } = new URL(baseUrl);
    // Only allow http/https protocols
    const isHttps = protocol === "https:";
    const isHttp = protocol === "http:";
    if (!isHttps && !isHttp) {
      return null;
    }
    // Reject URLs with path traversal
    if (pathname.includes("..")) {
      return null;
    }
    // Return origin + pathname stripped of trailing slashes
    const normalizedPath = pathname === "/" ? "" : pathname;
    return `${origin}${normalizedPath}`.replace(/\/+$/, "");
  } catch {
    // Intentional: invalid URL format
    return null;
  }
};

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
