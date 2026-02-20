/**
 * Datadog Monitoring Adapter
 *
 * Queries the Datadog API for metrics and events relevant to an investigation.
 * Uses resilientGet for automatic retry, circuit breaker, and timeout.
 * Returns empty arrays on failure -- never throws.
 *
 * @module adapters/datadogMonitoringAdapter
 */

import {
  resilientGet,
  createLogger,
  getErrorMessage,
  truncateText,
  type RequestContext,
} from "@kenchi/shared";
import type { InvestigationEvidenceItem } from "../types/investigationTypes.js";
import type {
  MonitoringAdapter,
  MonitoringQuery,
  DatadogMetricSeries,
  DatadogMetricsResponse,
  DatadogEvent,
  DatadogEventsResponse,
} from "../types/monitoringTypes.js";
import { INVESTIGATION_RELEVANCE } from "../constants/investigationConstants.js";
import {
  MONITORING_DEFAULTS,
  DATADOG_API,
  SYMPTOM_METRIC_QUERIES,
} from "../constants/monitoringConstants.js";

const SECONDS_PER_HOUR = 3600;

// ==================== Internal Helpers ====================

/**
 * Builds a Datadog metric query string from symptom and service name.
 */
const buildMetricQuery = (
  symptom: MonitoringQuery["symptom"],
  serviceName: string | null
): string => {
  const template = SYMPTOM_METRIC_QUERIES[symptom];
  const service = serviceName ?? "*";
  return template.replace("$SERVICE", service);
};

/**
 * Computes epoch-second boundaries clamped to the Datadog 24h window limit.
 */
const computeTimeRange = (hoursBack: number): { readonly from: number; readonly to: number } => {
  const now = Math.floor(Date.now() / 1000);
  const clampedHours = Math.min(hoursBack, MONITORING_DEFAULTS.DATADOG_MAX_QUERY_WINDOW_HOURS);
  const from = now - clampedHours * SECONDS_PER_HOUR;
  return { from, to: now };
};

/**
 * Maps a Datadog metric series to an InvestigationEvidenceItem.
 */
const mapMetricSeriesToEvidence = (
  series: DatadogMetricSeries,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const { pointlist, metric, scope, expression } = series;
  const lastPoint = pointlist.length > 0 ? pointlist[pointlist.length - 1] : null;
  const lastTimestamp = lastPoint ? lastPoint[0] : Date.now();
  const lastValue = lastPoint ? lastPoint[1] : null;

  const serviceMatches =
    serviceName !== null && scope.toLowerCase().includes(serviceName.toLowerCase());
  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.MONITORING_BASE;

  return {
    id: `dd-metric-${metric}-${String(lastTimestamp)}`,
    source: "datadog_metrics",
    title: `Datadog Metric: ${metric}`,
    summary: truncateText(
      `Metric ${expression} reported value ${lastValue === null ? "N/A" : String(lastValue)} (scope: ${scope})`,
      300
    ),
    relevance,
    timestamp: new Date(lastTimestamp).toISOString(),
    metadata: {
      metric,
      scope,
      expression,
      lastValue,
      dataPointCount: pointlist.length,
    },
  };
};

/**
 * Maps a Datadog event to an InvestigationEvidenceItem.
 */
const mapEventToEvidence = (
  event: DatadogEvent,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const { id, title, text, date_happened: dateHappened, alert_type: alertType, tags } = event;
  const tagsArray = tags ?? [];

  const serviceMatches =
    serviceName !== null &&
    tagsArray.some((tag) => tag.toLowerCase().includes(serviceName.toLowerCase()));
  const isAlert = alertType === "error" || alertType === "warning";

  const relevance = serviceMatches
    ? isAlert
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH
      : INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH
    : isAlert
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE
      : INVESTIGATION_RELEVANCE.MONITORING_BASE;

  return {
    id: `dd-event-${String(id)}`,
    source: "datadog_events",
    title: truncateText(title, 200),
    summary: truncateText(text, 300),
    relevance,
    timestamp: new Date(dateHappened * 1000).toISOString(),
    metadata: {
      eventId: id,
      alertType: alertType ?? null,
      sourceTypeName: event.source_type_name ?? null,
      tags: tagsArray,
    },
  };
};

/**
 * Fetches metric data from Datadog /api/v1/query endpoint.
 */
const fetchDatadogMetrics = async (
  baseUrl: string,
  apiKey: string,
  appKey: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const adapterLogger = createLogger("datadog-monitoring-adapter");
  const metricQuery = buildMetricQuery(query.symptom, query.serviceName);
  const { from, to } = computeTimeRange(query.hoursBack);
  const url = `${baseUrl}${DATADOG_API.METRICS_QUERY}?query=${encodeURIComponent(metricQuery)}&from=${String(from)}&to=${String(to)}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<DatadogMetricsResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: {
        "DD-API-KEY": apiKey,
        "DD-APPLICATION-KEY": appKey,
      },
    });

    const durationMs = Date.now() - startTime;
    const seriesList = response.data.series ?? [];

    adapterLogger.info("Datadog metrics fetched", {
      provider: "datadog",
      operation: "fetchMetrics",
      durationMs,
      statusCode: response.status,
      seriesCount: seriesList.length,
      ...context,
    });

    return seriesList
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((series) => mapMetricSeriesToEvidence(series, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    adapterLogger.warn("Datadog metrics fetch failed", {
      provider: "datadog",
      operation: "fetchMetrics",
      durationMs,
      error: getErrorMessage(error),
      ...context,
    });
    return [];
  }
};

/**
 * Fetches events from Datadog /api/v1/events endpoint.
 */
const fetchDatadogEvents = async (
  baseUrl: string,
  apiKey: string,
  appKey: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const adapterLogger = createLogger("datadog-monitoring-adapter");
  const { from, to } = computeTimeRange(query.hoursBack);
  const tagsParam = query.serviceName
    ? `&tags=service:${encodeURIComponent(query.serviceName)}`
    : "";
  const url = `${baseUrl}${DATADOG_API.EVENTS_LIST}?start=${String(from)}&end=${String(to)}${tagsParam}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<DatadogEventsResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: {
        "DD-API-KEY": apiKey,
        "DD-APPLICATION-KEY": appKey,
      },
    });

    const durationMs = Date.now() - startTime;
    const events = response.data.events ?? [];

    adapterLogger.info("Datadog events fetched", {
      provider: "datadog",
      operation: "fetchEvents",
      durationMs,
      statusCode: response.status,
      eventCount: events.length,
      ...context,
    });

    return events
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((event) => mapEventToEvidence(event, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    adapterLogger.warn("Datadog events fetch failed", {
      provider: "datadog",
      operation: "fetchEvents",
      durationMs,
      error: getErrorMessage(error),
      ...context,
    });
    return [];
  }
};

// ==================== Factory ====================

/**
 * Creates a Datadog monitoring adapter.
 *
 * @param apiKey - Datadog API key
 * @param appKey - Datadog Application key
 * @param baseUrl - Datadog API base URL
 * @returns MonitoringAdapter implementation for Datadog
 */
export const createDatadogMonitoringAdapter = (
  apiKey: string,
  appKey: string,
  baseUrl: string
): MonitoringAdapter => ({
  name: "datadog",

  isConfigured: (): boolean => apiKey.length > 0 && appKey.length > 0,

  fetchEvidence: async (
    query: MonitoringQuery,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    const adapterLogger = createLogger("datadog-monitoring-adapter");
    const startTime = Date.now();

    try {
      const [metrics, events] = await Promise.all([
        fetchDatadogMetrics(baseUrl, apiKey, appKey, query, context),
        fetchDatadogEvents(baseUrl, apiKey, appKey, query, context),
      ]);

      const evidence = [...metrics, ...events];
      const durationMs = Date.now() - startTime;

      adapterLogger.info("Datadog evidence gathered", {
        provider: "datadog",
        operation: "gatherEvidence",
        durationMs,
        metricsCount: metrics.length,
        eventsCount: events.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      adapterLogger.warn("Datadog evidence gathering failed", {
        provider: "datadog",
        operation: "gatherEvidence",
        durationMs,
        error: getErrorMessage(error),
        ...context,
      });
      return [];
    }
  },
});
