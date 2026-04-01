/**
 * Grafana Monitoring Adapter
 *
 * Queries the Grafana API for active alert rules and annotations relevant
 * to an investigation. Uses resilientGet for automatic retry, circuit
 * breaker, and timeout. Returns empty arrays on failure -- never throws.
 *
 * @module investigation/adapters/grafanaAdapter
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
  GrafanaRulesGroupResponse,
  GrafanaAlertInstance,
  GrafanaAnnotation,
} from "../monitoringTypes.js";
import { INVESTIGATION_RELEVANCE } from "../constants.js";
import {
  MONITORING_DEFAULTS,
  GRAFANA_API,
  GRAFANA_ACTIVE_ALERT_STATES,
  MS_PER_HOUR,
  validateBaseUrl,
} from "../monitoringConstants.js";

const logger = createLogger("grafana-monitoring-adapter");

// ==================== Internal Helpers ====================

/**
 * Checks if a Grafana label set contains a reference to the target service.
 */
const labelsMatchService = (
  labels: Readonly<Record<string, string>> | undefined,
  serviceName: string | null
): boolean => {
  if (!labels || !serviceName) {
    return false;
  }
  const lowerService = serviceName.toLowerCase();
  return Object.values(labels).some((value) => value.toLowerCase().includes(lowerService));
};

/**
 * Extracts active alert instances from the Grafana rules response.
 * Filters to only "firing" and "pending" states.
 */
const extractActiveAlerts = (
  response: GrafanaRulesGroupResponse
): readonly GrafanaAlertInstance[] => {
  const groups = response.data?.groups ?? [];
  return groups.flatMap((group) => {
    const rules = group.rules ?? [];
    return rules.flatMap((rule) => {
      if (!GRAFANA_ACTIVE_ALERT_STATES.has(rule.state)) {
        return [];
      }
      const alerts = rule.alerts ?? [];
      return alerts
        .filter((alert) => GRAFANA_ACTIVE_ALERT_STATES.has(alert.state))
        .map((alert) => ({
          uid: alert.uid,
          title: alert.title || rule.name,
          state: alert.state,
          labels: { ...rule.labels, ...alert.labels },
          annotations: { ...rule.annotations, ...alert.annotations },
          activeAt: alert.activeAt,
        }));
    });
  });
};

/**
 * Maps a Grafana active alert to an InvestigationEvidenceItem.
 */
const mapAlertToEvidence = (
  alert: GrafanaAlertInstance,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const { uid, title, state, labels, annotations, activeAt } = alert;
  const serviceMatches = labelsMatchService(labels, serviceName);

  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE;

  const description = annotations?.description ?? annotations?.summary ?? "";
  const timestamp = activeAt ?? new Date().toISOString();

  return {
    id: `grafana-alert-${uid}`,
    source: "grafana_alerts",
    title: truncateText(`Grafana Alert: ${title} (${state})`, 200),
    summary: truncateText(description || `Alert "${title}" is ${state}`, 300),
    relevance,
    timestamp,
    metadata: {
      alertUid: uid,
      state,
      labels: labels ?? {},
    },
  };
};

/**
 * Maps a Grafana annotation to an InvestigationEvidenceItem.
 */
const mapAnnotationToEvidence = (
  annotation: GrafanaAnnotation,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const { id, text, tags, time } = annotation;
  const annotationTags = tags ?? [];

  const serviceMatches =
    serviceName !== null &&
    annotationTags.some((tag) => tag.toLowerCase().includes(serviceName.toLowerCase()));

  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.MONITORING_BASE;

  return {
    id: `grafana-annotation-${String(id)}`,
    source: "grafana_alerts",
    title: truncateText(`Grafana Annotation: ${text}`, 200),
    summary: truncateText(text, 300),
    relevance,
    timestamp: new Date(time).toISOString(),
    metadata: {
      annotationId: id,
      tags: annotationTags,
      dashboardId: annotation.dashboardId ?? null,
    },
  };
};

/**
 * Fetches active Grafana alert rules.
 */
const fetchGrafanaAlerts = async (
  baseUrl: string,
  apiToken: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const url = `${baseUrl}${GRAFANA_API.RULES}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<GrafanaRulesGroupResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    const durationMs = Date.now() - startTime;
    const activeAlerts = extractActiveAlerts(response.data);

    logger.info("Grafana alerts fetched", {
      provider: "grafana",
      operation: "fetchAlerts",
      durationMs,
      statusCode: response.status,
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

    logger.warn("Grafana alerts fetch failed", {
      provider: "grafana",
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
 * Fetches Grafana annotations within the investigation time range.
 */
const fetchGrafanaAnnotations = async (
  baseUrl: string,
  apiToken: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const now = Date.now();
  const from = now - query.hoursBack * MS_PER_HOUR;
  const tagsParam = query.serviceName ? `&tags=${encodeURIComponent(query.serviceName)}` : "";
  const url = `${baseUrl}${GRAFANA_API.ANNOTATIONS}?from=${String(from)}&to=${String(now)}${tagsParam}&limit=${String(query.limit)}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<readonly GrafanaAnnotation[]>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    const durationMs = Date.now() - startTime;
    const annotations = response.data;

    logger.info("Grafana annotations fetched", {
      provider: "grafana",
      operation: "fetchAnnotations",
      durationMs,
      statusCode: response.status,
      annotationCount: annotations.length,
      ...context,
    });

    return annotations
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((annotation) => mapAnnotationToEvidence(annotation, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;
    const isRetryable =
      errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

    logger.warn("Grafana annotations fetch failed", {
      provider: "grafana",
      operation: "fetchAnnotations",
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
 * Creates a Grafana monitoring adapter.
 *
 * @param apiToken - Grafana API token for authentication
 * @param baseUrl - Grafana instance base URL
 * @returns MonitoringAdapter implementation for Grafana
 */
export const createGrafanaMonitoringAdapter = (
  apiToken: string,
  baseUrl: string
): MonitoringAdapter => ({
  name: "grafana",

  isConfigured: (): boolean => apiToken.length > 0 && validateBaseUrl(baseUrl) !== null,

  fetchEvidence: async (
    query: MonitoringQuery,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    const startTime = Date.now();

    try {
      const [alerts, annotations] = await Promise.all([
        fetchGrafanaAlerts(baseUrl, apiToken, query, context),
        fetchGrafanaAnnotations(baseUrl, apiToken, query, context),
      ]);

      const evidence = [...alerts, ...annotations];
      const durationMs = Date.now() - startTime;

      logger.info("Grafana evidence gathered", {
        provider: "grafana",
        operation: "gatherEvidence",
        durationMs,
        alertCount: alerts.length,
        annotationCount: annotations.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const statusCode = (error as { status?: number }).status;
      const isRetryable =
        errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

      logger.warn("Grafana evidence gathering failed", {
        provider: "grafana",
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
