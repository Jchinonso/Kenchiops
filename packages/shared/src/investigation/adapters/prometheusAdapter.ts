/**
 * Prometheus Monitoring Adapter
 *
 * Queries the Prometheus API for active alerts and metric ranges relevant
 * to an investigation. Uses resilientGet for automatic retry, circuit
 * breaker, and timeout. Returns empty arrays on failure -- never throws.
 *
 * @module investigation/adapters/prometheusAdapter
 */

import { resilientGet } from "../../http/resilientClient.js";
import { createLogger } from "../../core/logger.js";
import { getErrorMessage } from "../../core/errors.js";
import { redactSecrets } from "../../security/redaction.js";
import { truncateText } from "../../formatting/common/uiHelpers.js";
import type { RequestContext } from "../../core/types.js";
import type { InvestigationEvidenceItem } from "../types.js";
import type {
  MonitoringAdapter,
  MonitoringQuery,
  PrometheusAlert,
  PrometheusAlertsResponse,
  PrometheusRangeSample,
  PrometheusQueryRangeResponse,
} from "../monitoringTypes.js";
import { INVESTIGATION_RELEVANCE } from "../constants.js";
import {
  MONITORING_DEFAULTS,
  PROMETHEUS_API,
  SYMPTOM_PROMQL_QUERIES,
  PROMETHEUS_ACTIVE_ALERT_STATES,
  SECONDS_PER_HOUR,
  sanitizeServiceName,
  validateBaseUrl,
} from "../monitoringConstants.js";

const logger = createLogger("prometheus-monitoring-adapter");
const PROMQL_STEP_SECONDS = 60;

// ==================== Internal Helpers ====================

/**
 * Builds a PromQL query string from symptom and service name.
 */
const buildPromqlQuery = (
  symptom: MonitoringQuery["symptom"],
  serviceName: string | null
): string => {
  const template = SYMPTOM_PROMQL_QUERIES[symptom];
  // Sanitize service name to prevent PromQL injection (e.g., closing "} or vector(1))
  const sanitized = sanitizeServiceName(serviceName);
  const service = sanitized ?? ".*";
  return template.replace("$SERVICE", service);
};

/**
 * Checks if a Prometheus alert's labels contain a reference to the target service.
 */
const alertMatchesService = (
  labels: Readonly<Record<string, string>>,
  serviceName: string | null
): boolean => {
  if (!serviceName) {
    return false;
  }
  const lowerService = serviceName.toLowerCase();
  return Object.values(labels).some((value) => value.toLowerCase().includes(lowerService));
};

/**
 * Maps a Prometheus alert to an InvestigationEvidenceItem.
 */
const mapAlertToEvidence = (
  alert: PrometheusAlert,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const { labels, annotations, state, activeAt, value } = alert;
  const alertName = labels.alertname ?? "unknown";
  const serviceMatches = alertMatchesService(labels, serviceName);

  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE;

  const description = annotations.description ?? annotations.summary ?? "";

  return {
    id: `prom-alert-${alertName}-${activeAt}`,
    source: "prometheus_alerts",
    title: truncateText(`Prometheus Alert: ${alertName} (${state})`, 200),
    summary: truncateText(description || `Alert "${alertName}" is ${state} (value: ${value})`, 300),
    relevance,
    timestamp: activeAt,
    metadata: {
      alertName,
      state,
      value,
      labels,
    },
  };
};

/**
 * Maps a Prometheus range sample to an InvestigationEvidenceItem.
 */
const mapRangeSampleToEvidence = (
  sample: PrometheusRangeSample,
  promqlQuery: string,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const { metric, values } = sample;
  const metricName = metric.__name__ ?? promqlQuery;
  const lastPoint = values.length > 0 ? values[values.length - 1] : null;
  const lastTimestamp = lastPoint ? lastPoint[0] * 1000 : Date.now();
  const lastValue = lastPoint ? lastPoint[1] : "N/A";

  const serviceMatches = alertMatchesService(metric, serviceName);
  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.MONITORING_BASE;

  return {
    id: `prom-metric-${metricName}-${String(lastTimestamp)}`,
    source: "prometheus_alerts",
    title: truncateText(`Prometheus Metric: ${metricName}`, 200),
    summary: truncateText(
      `Query "${promqlQuery}" reported latest value ${lastValue} with ${String(values.length)} data points`,
      300
    ),
    relevance,
    timestamp: new Date(lastTimestamp).toISOString(),
    metadata: {
      metricName,
      query: promqlQuery,
      lastValue,
      dataPointCount: values.length,
      labels: metric,
    },
  };
};

/**
 * Fetches active alerts from Prometheus /api/v1/alerts endpoint.
 */
const fetchPrometheusAlerts = async (
  baseUrl: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const url = `${baseUrl}${PROMETHEUS_API.ALERTS}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<PrometheusAlertsResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
    });

    const durationMs = Date.now() - startTime;
    const allAlerts = response.data.data?.alerts ?? [];

    // Filter to only active alerts
    const activeAlerts = allAlerts.filter((alert) =>
      PROMETHEUS_ACTIVE_ALERT_STATES.has(alert.state)
    );

    logger.info("Prometheus alerts fetched", {
      provider: "prometheus",
      operation: "fetchAlerts",
      durationMs,
      statusCode: response.status,
      totalAlerts: allAlerts.length,
      activeAlertCount: activeAlerts.length,
      ...context,
    });

    return activeAlerts
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((alert) => mapAlertToEvidence(alert, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;
    const isRetryable =
      errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

    logger.warn("Prometheus alerts fetch failed", {
      provider: "prometheus",
      operation: "fetchAlerts",
      durationMs,
      statusCode,
      retryable: isRetryable,
      error: redactSecrets(errorMsg),
      ...context,
    });
    return [];
  }
};

/**
 * Fetches metric range data from Prometheus /api/v1/query_range endpoint.
 */
const fetchPrometheusMetrics = async (
  baseUrl: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const promqlQuery = buildPromqlQuery(query.symptom, query.serviceName);
  const now = Math.floor(Date.now() / 1000);
  const start = now - query.hoursBack * SECONDS_PER_HOUR;
  const url = `${baseUrl}${PROMETHEUS_API.QUERY_RANGE}?query=${encodeURIComponent(promqlQuery)}&start=${String(start)}&end=${String(now)}&step=${String(PROMQL_STEP_SECONDS)}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<PrometheusQueryRangeResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
    });

    const durationMs = Date.now() - startTime;
    const samples = response.data.data?.result ?? [];

    logger.info("Prometheus metrics fetched", {
      provider: "prometheus",
      operation: "fetchMetrics",
      durationMs,
      statusCode: response.status,
      sampleCount: samples.length,
      ...context,
    });

    return samples
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((sample) => mapRangeSampleToEvidence(sample, promqlQuery, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;
    const isRetryable =
      errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

    logger.warn("Prometheus metrics fetch failed", {
      provider: "prometheus",
      operation: "fetchMetrics",
      durationMs,
      statusCode,
      retryable: isRetryable,
      error: redactSecrets(errorMsg),
      ...context,
    });
    return [];
  }
};

// ==================== Factory ====================

/**
 * Creates a Prometheus monitoring adapter.
 *
 * @param baseUrl - Prometheus server base URL
 * @returns MonitoringAdapter implementation for Prometheus
 */
export const createPrometheusMonitoringAdapter = (baseUrl: string): MonitoringAdapter => ({
  name: "prometheus",

  isConfigured: (): boolean => validateBaseUrl(baseUrl) !== null,

  fetchEvidence: async (
    query: MonitoringQuery,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    const startTime = Date.now();

    try {
      const [alerts, metrics] = await Promise.all([
        fetchPrometheusAlerts(baseUrl, query, context),
        fetchPrometheusMetrics(baseUrl, query, context),
      ]);

      const evidence = [...alerts, ...metrics];
      const durationMs = Date.now() - startTime;

      logger.info("Prometheus evidence gathered", {
        provider: "prometheus",
        operation: "gatherEvidence",
        durationMs,
        alertCount: alerts.length,
        metricCount: metrics.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const statusCode = (error as { status?: number }).status;
      const isRetryable =
        errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

      logger.warn("Prometheus evidence gathering failed", {
        provider: "prometheus",
        operation: "gatherEvidence",
        durationMs,
        statusCode,
        retryable: isRetryable,
        error: redactSecrets(errorMsg),
        ...context,
      });
      return [];
    }
  },
});
