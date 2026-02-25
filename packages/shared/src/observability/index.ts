/**
 * Observability Module
 *
 * Per-tenant Prometheus metrics, middleware, usage alerting, and types.
 *
 * @module observability
 */

export {
  apiRequestsTotal,
  apiRequestDuration,
  analysesTotal,
  analysisDuration,
  externalCallsTotal,
  externalCallDuration,
  activeAnalysisJobs,
  activeConnections,
  getMetrics,
  getMetricsContentType,
} from "./metrics.js";

export { metricsMiddleware } from "./metricsMiddleware.js";

export type { ApiRequestLabels, AnalysisLabels, ExternalCallLabels } from "./types.js";

// Usage threshold alerting
export { checkUsageThresholds, resetUsageAlertDedup } from "./usageAlerts.js";

export type {
  UsageAlertLevel,
  UsageResource,
  UsageAlert,
  TenantUsageAlertResult,
} from "./usageAlertTypes.js";
