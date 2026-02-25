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
  encryptionOpsTotal,
  encryptionOpDuration,
  encryptionErrorsTotal,
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

// Tenant metric alerting (pure evaluation)
export {
  evaluateTenantAlerts,
  formatAlertMessage,
  DEFAULT_WARNING_THRESHOLDS,
  DEFAULT_CRITICAL_THRESHOLDS,
} from "./alerting.js";

export type {
  AlertSeverity,
  AlertStatus,
  AlertThresholds,
  TenantAlert,
  TenantMetricSnapshot,
} from "./alertingTypes.js";
