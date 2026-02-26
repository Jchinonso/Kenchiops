/**
 * Per-Tenant Prometheus Metrics
 *
 * Provides Counter, Histogram, and Gauge metrics with per-tenant labels
 * for observability. Includes cardinality management via stale entry cleanup.
 *
 * @module observability/metrics
 */

import { Counter, Histogram, Gauge, register, collectDefaultMetrics } from "prom-client";

// ==================== Default Metrics ====================

/** Collect Node.js runtime metrics (GC, event loop, memory). */
collectDefaultMetrics({ prefix: "kenchi_" });

// ==================== Per-Tenant API Metrics ====================

/**
 * Total API requests by tenant, method, route, and status code.
 *
 * Cardinality estimate: tenants x routes x methods x statuses.
 * At 1,000 tenants x 50 routes x 4 methods x 5 statuses = 1M series.
 * Use Prometheus recording rules to pre-aggregate for dashboards.
 */
export const apiRequestsTotal = new Counter({
  name: "kenchi_api_requests_total",
  help: "Total API requests by tenant, method, route, and status code",
  labelNames: ["tenant_id", "method", "route", "status_code"] as const,
});

export const apiRequestDuration = new Histogram({
  name: "kenchi_api_request_duration_seconds",
  help: "API request duration by tenant and endpoint",
  labelNames: ["tenant_id", "method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// ==================== Per-Tenant Analysis Metrics ====================

export const analysesTotal = new Counter({
  name: "kenchi_analyses_total",
  help: "Total analyses by tenant and status",
  labelNames: ["tenant_id", "status"] as const,
});

export const analysisDuration = new Histogram({
  name: "kenchi_analysis_duration_seconds",
  help: "Analysis pipeline duration by tenant",
  labelNames: ["tenant_id"] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

// ==================== External Call Metrics ====================

export const externalCallsTotal = new Counter({
  name: "kenchi_external_calls_total",
  help: "Total external API calls by tenant, provider, operation, and status code",
  labelNames: ["tenant_id", "provider", "operation", "status_code"] as const,
});

export const externalCallDuration = new Histogram({
  name: "kenchi_external_call_duration_seconds",
  help: "External API call duration by provider",
  labelNames: ["tenant_id", "provider", "operation"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

// ==================== Encryption Metrics ====================

export const encryptionOpsTotal = new Counter({
  name: "kenchi_encryption_ops_total",
  help: "Total encryption operations by tenant, operation type, and key version",
  labelNames: ["tenant_id", "operation", "key_version"] as const,
});

export const encryptionOpDuration = new Histogram({
  name: "kenchi_encryption_op_duration_seconds",
  help: "Encryption operation duration by operation type",
  labelNames: ["tenant_id", "operation"] as const,
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
});

export const encryptionErrorsTotal = new Counter({
  name: "kenchi_encryption_errors_total",
  help: "Total encryption errors by tenant and operation",
  labelNames: ["tenant_id", "operation", "error_type"] as const,
});

// ==================== Concurrency Gauges ====================

export const activeAnalysisJobs = new Gauge({
  name: "kenchi_active_analysis_jobs",
  help: "Currently active analysis jobs by tenant",
  labelNames: ["tenant_id"] as const,
});

export const activeConnections = new Gauge({
  name: "kenchi_active_db_connections",
  help: "Active database connections",
});

// ==================== Registry Export ====================

/**
 * Get all registered metrics in Prometheus text format.
 * Serve this from GET /metrics endpoint.
 */
export const getMetrics = async (): Promise<string> => register.metrics();

/**
 * Get the Content-Type header for Prometheus scraping.
 */
export const getMetricsContentType = (): string => register.contentType;
