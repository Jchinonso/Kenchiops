/**
 * PagerDuty Monitoring Adapter
 *
 * Queries the PagerDuty API for recent active incidents relevant to an
 * investigation. Uses resilientGet for automatic retry, circuit breaker,
 * and timeout. Returns empty arrays on failure -- never throws.
 *
 * @module adapters/pagerdutyMonitoringAdapter
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
  PagerDutyIncident,
  PagerDutyIncidentsResponse,
} from "../types/monitoringTypes.js";
import { INVESTIGATION_RELEVANCE } from "../constants/investigationConstants.js";
import {
  MONITORING_DEFAULTS,
  PAGERDUTY_API,
  PAGERDUTY_ACTIVE_STATUSES,
} from "../constants/monitoringConstants.js";

const MS_PER_HOUR = 3600000;

// ==================== Internal Helpers ====================

/**
 * Checks if a PagerDuty incident's service matches the target service name.
 */
const incidentMatchesService = (
  incident: PagerDutyIncident,
  serviceName: string | null
): boolean => {
  if (!serviceName) {
    return false;
  }
  const lowerService = serviceName.toLowerCase();
  const pdServiceName = incident.service?.summary ?? "";
  return (
    pdServiceName.toLowerCase().includes(lowerService) ||
    incident.title.toLowerCase().includes(lowerService)
  );
};

/**
 * Maps a PagerDuty incident to an InvestigationEvidenceItem.
 */
const mapIncidentToEvidence = (
  incident: PagerDutyIncident,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const {
    id,
    title,
    description,
    created_at: createdAt,
    status,
    urgency,
    html_url: htmlUrl,
    service: pdService,
    assignments,
    incident_number: incidentNumber,
  } = incident;

  const serviceMatches = incidentMatchesService(incident, serviceName);
  const isActive = PAGERDUTY_ACTIVE_STATUSES.has(status);

  const relevance = serviceMatches
    ? isActive
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH
      : INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH
    : isActive
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE
      : INVESTIGATION_RELEVANCE.MONITORING_BASE;

  const assigneeNames = (assignments ?? []).map((assignment) => assignment.assignee.summary);
  const summaryParts = [
    `PagerDuty #${String(incidentNumber)} (${status}, ${urgency})`,
    pdService ? `Service: ${pdService.summary}` : null,
    description ? truncateText(description, 150) : null,
    assigneeNames.length > 0 ? `Assigned: ${assigneeNames.join(", ")}` : null,
  ].filter((part): part is string => part !== null);

  return {
    id: `pd-incident-${id}`,
    source: "pagerduty_incidents",
    title: truncateText(`PagerDuty Incident: ${title}`, 200),
    summary: truncateText(summaryParts.join(" | "), 300),
    relevance,
    timestamp: createdAt,
    metadata: {
      incidentId: id,
      incidentNumber,
      status,
      urgency,
      serviceName: pdService?.summary ?? null,
      serviceId: pdService?.id ?? null,
      htmlUrl,
      assignees: assigneeNames,
    },
  };
};

/**
 * Fetches recent incidents from PagerDuty /incidents endpoint.
 */
const fetchPagerDutyIncidents = async (
  apiToken: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const adapterLogger = createLogger("pagerduty-monitoring-adapter");
  const now = new Date();
  const since = new Date(now.getTime() - query.hoursBack * MS_PER_HOUR);

  const params = new URLSearchParams();
  params.append("since", since.toISOString());
  params.append("until", now.toISOString());
  params.append("statuses[]", "triggered");
  params.append("statuses[]", "acknowledged");
  params.append("limit", String(query.limit));
  params.append("sort_by", "created_at:desc");

  const url = `${PAGERDUTY_API.BASE_URL}${PAGERDUTY_API.INCIDENTS}?${params.toString()}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<PagerDutyIncidentsResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: {
        Authorization: `Token token=${apiToken}`,
        "Content-Type": "application/json",
      },
    });

    const durationMs = Date.now() - startTime;
    const incidents = response.data.incidents ?? [];

    adapterLogger.info("PagerDuty incidents fetched", {
      provider: "pagerduty",
      operation: "fetchIncidents",
      durationMs,
      statusCode: response.status,
      incidentCount: incidents.length,
      ...context,
    });

    return incidents
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((incident) => mapIncidentToEvidence(incident, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    adapterLogger.warn("PagerDuty incidents fetch failed", {
      provider: "pagerduty",
      operation: "fetchIncidents",
      durationMs,
      error: getErrorMessage(error),
      ...context,
    });
    return [];
  }
};

// ==================== Factory ====================

/**
 * Creates a PagerDuty monitoring adapter.
 *
 * @param apiToken - PagerDuty API token for authentication
 * @returns MonitoringAdapter implementation for PagerDuty
 */
export const createPagerDutyMonitoringAdapter = (apiToken: string): MonitoringAdapter => ({
  name: "pagerduty",

  isConfigured: (): boolean => apiToken.length > 0,

  fetchEvidence: async (
    query: MonitoringQuery,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    const adapterLogger = createLogger("pagerduty-monitoring-adapter");
    const startTime = Date.now();

    try {
      const evidence = await fetchPagerDutyIncidents(apiToken, query, context);
      const durationMs = Date.now() - startTime;

      adapterLogger.info("PagerDuty evidence gathered", {
        provider: "pagerduty",
        operation: "gatherEvidence",
        durationMs,
        incidentCount: evidence.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      adapterLogger.warn("PagerDuty evidence gathering failed", {
        provider: "pagerduty",
        operation: "gatherEvidence",
        durationMs,
        error: getErrorMessage(error),
        ...context,
      });
      return [];
    }
  },
});
