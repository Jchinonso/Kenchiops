/**
 * Investigation Module
 *
 * Shared investigation pipeline: intent parsing, evidence gathering,
 * correlation, diagnosis, and monitoring adapter integrations.
 *
 * @module investigation
 */

// Types
export type {
  InvestigationSymptom,
  EvidenceSourceType,
  InvestigationIntent,
  InvestigationEvidenceItem,
  TimelineEvent,
  InvestigationCorrelation,
  SuggestedInvestigationAction,
  InvestigationDiagnosis,
  InvestigationSearchPort,
  InvestigationService,
  LLMCompletionOptions,
  LLMCompletionPort,
  InvestigationServiceOptions,
} from "./types.js";
export { INVESTIGATION_LLM_TIMEOUT_MS } from "./types.js";

export type {
  MonitoringQuery,
  MonitoringPort,
  MonitoringAdapter,
  DatadogMetricPoint,
  DatadogMetricSeries,
  DatadogMetricsResponse,
  DatadogEvent,
  DatadogEventsResponse,
  GrafanaAlertRule,
  GrafanaAlertInstance,
  GrafanaRulesGroupResponse,
  GrafanaRulesGroup,
  GrafanaRuleEntry,
  GrafanaAnnotation,
  VercelDeployment,
  VercelDeploymentsResponse,
  PrometheusAlert,
  PrometheusAlertsResponse,
  PrometheusRangeSample,
  PrometheusQueryRangeResponse,
  PagerDutyIncident,
  PagerDutyIncidentsResponse,
  NetlifyDeploy,
  NetlifyDeploysResponse,
} from "./monitoringTypes.js";

// Service factory
export { createInvestigationService } from "./service.js";

// Port/adapter factories
export { createMonitoringPort } from "./monitoringPort.js";
export { createInvestigationSearchAdapter } from "./searchAdapter.js";
export { createLLMCompletionAdapter } from "./llmCompletionAdapter.js";

// Monitoring adapter factories
export { createDatadogMonitoringAdapter } from "./adapters/datadogAdapter.js";
export { createGrafanaMonitoringAdapter } from "./adapters/grafanaAdapter.js";
export { createPrometheusMonitoringAdapter } from "./adapters/prometheusAdapter.js";
export { createPagerDutyMonitoringAdapter } from "./adapters/pagerdutyAdapter.js";
export { createVercelMonitoringAdapter } from "./adapters/vercelAdapter.js";
export { createNetlifyMonitoringAdapter } from "./adapters/netlifyAdapter.js";

// Constants (needed by both services)
export {
  INVESTIGATION_PIPELINE_DEFAULTS,
  INVESTIGATION_RELEVANCE,
  INVESTIGATION_PATTERN_THRESHOLDS,
  VALID_SYMPTOMS,
  FALLBACK_ACTIONS_BY_SYMPTOM,
  FALLBACK_DIAGNOSIS_CONFIDENCE,
  COMMON_FACTOR_CONFIG,
} from "./constants.js";
export {
  MONITORING_DEFAULTS,
  MS_PER_HOUR,
  SECONDS_PER_HOUR,
  sanitizeServiceName,
  validateBaseUrl,
  DATADOG_API,
  GRAFANA_API,
  PROMETHEUS_API,
  PAGERDUTY_API,
  VERCEL_API,
  NETLIFY_API,
  SYMPTOM_METRIC_QUERIES,
  GRAFANA_ACTIVE_ALERT_STATES,
  VERCEL_ERROR_DEPLOYMENT_STATES,
  SYMPTOM_PROMQL_QUERIES,
  PROMETHEUS_ACTIVE_ALERT_STATES,
  PAGERDUTY_ACTIVE_STATUSES,
  NETLIFY_ERROR_DEPLOY_STATES,
} from "./monitoringConstants.js";

// Prompts
export {
  INVESTIGATION_INTENT_SYSTEM_PROMPT,
  buildIntentUserPrompt,
} from "./prompts/intentPrompt.js";
export {
  INVESTIGATION_DIAGNOSIS_SYSTEM_PROMPT,
  buildDiagnosisUserPrompt,
} from "./prompts/diagnosisPrompt.js";

// Helpers (needed for testing and shared validation)
export {
  FALLBACK_INTENT,
  validateParsedIntent,
  compareEvidence,
  extractServiceNames,
  detectPatterns,
  buildTimeline,
  extractCommonFactors,
  validateParsedDiagnosis,
  generateFallbackDiagnosis,
  getLookbackHours,
} from "./helpers.js";
