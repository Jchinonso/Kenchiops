/**
 * OpsGenie Context Adapter
 *
 * Fetches enrichment data from the OpsGenie API for a normalized alert.
 * Retrieves alert details, timeline logs, and team notes to build
 * AlertContext evidence.
 *
 * Returns empty evidence on failure -- never throws.
 */

import {
  resilientGet,
  createLogger,
  getErrorMessage,
  redactSecrets,
  truncateText,
  type RequestContext,
  type AlertContext,
  type LogSnippet,
} from "@kenchi/shared";
import type { AlertContextPort } from "../ports/alertContextPort.js";
import type { NormalizedAlert } from "../types/incidentTypes.js";
import type {
  OpsGenieAlertDetailResponse,
  OpsGenieAlertLogsResponse,
  OpsGenieAlertNotesResponse,
  OpsGenieAlertLogEntry,
  OpsGenieAlertNote,
} from "../types/opsgenieTypes.js";
import { MONITORING_DEFAULTS } from "../constants/monitoringConstants.js";

const logger = createLogger("opsgenie-context-adapter");

/** OpsGenie API base URL */
const OPSGENIE_API_BASE_URL = "https://api.opsgenie.com";

/** Default time window around alert (hours) */
const CONTEXT_WINDOW_HOURS = 1;

// ==================== Internal Helpers ====================

/**
 * Maps OpsGenie log entries to LogSnippet evidence.
 */
const mapLogEntriesToSnippets = (logs: readonly OpsGenieAlertLogEntry[]): readonly LogSnippet[] =>
  logs.map(
    (logEntry): LogSnippet => ({
      timestamp: logEntry.createdAt,
      level: "info",
      message: truncateText(logEntry.log, 500),
      source: logEntry.owner || "opsgenie",
      metadata: { type: logEntry.type },
    })
  );

/**
 * Maps OpsGenie notes to LogSnippet evidence (treated as human-authored logs).
 */
const mapNotesToSnippets = (notes: readonly OpsGenieAlertNote[]): readonly LogSnippet[] =>
  notes.map(
    (note): LogSnippet => ({
      timestamp: note.createdAt,
      level: "info",
      message: truncateText(note.note, 500),
      source: note.owner || "opsgenie-note",
      metadata: { type: "note" },
    })
  );

/**
 * Maps alert severity to AlertContext severity.
 */
const mapAlertContextSeverity = (
  severity: NormalizedAlert["severity"]
): AlertContext["severity"] => {
  const severityMap: Readonly<Record<string, AlertContext["severity"]>> = {
    critical: "critical",
    high: "warning",
    medium: "warning",
    low: "info",
    info: "info",
  };
  return severityMap[severity] ?? "info";
};

/**
 * Builds a time window around the alert timestamp.
 */
const buildTimeWindow = (receivedAt: string): AlertContext["timeWindow"] => {
  const received = new Date(receivedAt);
  const start = new Date(received.getTime() - CONTEXT_WINDOW_HOURS * 3_600_000);
  return {
    start: start.toISOString(),
    end: received.toISOString(),
  };
};

/**
 * Builds an empty AlertContext with no evidence.
 */
const buildEmptyAlertContext = (alert: NormalizedAlert): AlertContext => ({
  source: "opsgenie",
  alertId: alert.sourceAlertId,
  severity: mapAlertContextSeverity(alert.severity),
  title: alert.title,
  description: alert.description ?? "",
  triggeredAt: alert.receivedAt,
  resolvedAt: null,
  timeWindow: buildTimeWindow(alert.receivedAt),
  evidence: {
    metrics: [],
    logs: [],
    traces: [],
    stackTraces: [],
    breadcrumbs: [],
    relatedAlerts: [],
  },
  providerMetadata: {},
});

/**
 * Fetches alert details from OpsGenie.
 */
const fetchAlertDetails = async (
  alertId: string,
  apiKey: string,
  context: RequestContext
): Promise<OpsGenieAlertDetailResponse | null> => {
  const startTime = Date.now();
  const url = `${OPSGENIE_API_BASE_URL}/v2/alerts/${encodeURIComponent(alertId)}`;

  try {
    const result = await resilientGet<OpsGenieAlertDetailResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: { Authorization: `GenieKey ${apiKey}` },
    });

    const durationMs = Date.now() - startTime;
    logger.info("OpsGenie alert details fetched", {
      provider: "opsgenie",
      operation: "fetchAlertDetails",
      durationMs,
      statusCode: result.status,
      ...context,
    });

    return result.data;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;

    logger.warn("OpsGenie alert details fetch failed", {
      provider: "opsgenie",
      operation: "fetchAlertDetails",
      durationMs,
      statusCode,
      retryable: errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500),
      error: redactSecrets(errorMsg),
      ...context,
    });
    return null;
  }
};

/**
 * Fetches alert timeline logs from OpsGenie.
 */
const fetchAlertLogs = async (
  alertId: string,
  apiKey: string,
  context: RequestContext
): Promise<readonly OpsGenieAlertLogEntry[]> => {
  const startTime = Date.now();
  const url = `${OPSGENIE_API_BASE_URL}/v2/alerts/${encodeURIComponent(alertId)}/logs`;

  try {
    const result = await resilientGet<OpsGenieAlertLogsResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: { Authorization: `GenieKey ${apiKey}` },
    });

    const durationMs = Date.now() - startTime;
    logger.info("OpsGenie alert logs fetched", {
      provider: "opsgenie",
      operation: "fetchAlertLogs",
      durationMs,
      statusCode: result.status,
      logCount: result.data.data.length,
      ...context,
    });

    return result.data.data;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;

    logger.warn("OpsGenie alert logs fetch failed", {
      provider: "opsgenie",
      operation: "fetchAlertLogs",
      durationMs,
      statusCode,
      retryable: errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500),
      error: redactSecrets(errorMsg),
      ...context,
    });
    return [];
  }
};

/**
 * Fetches alert notes from OpsGenie.
 */
const fetchAlertNotes = async (
  alertId: string,
  apiKey: string,
  context: RequestContext
): Promise<readonly OpsGenieAlertNote[]> => {
  const startTime = Date.now();
  const url = `${OPSGENIE_API_BASE_URL}/v2/alerts/${encodeURIComponent(alertId)}/notes`;

  try {
    const result = await resilientGet<OpsGenieAlertNotesResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: { Authorization: `GenieKey ${apiKey}` },
    });

    const durationMs = Date.now() - startTime;
    logger.info("OpsGenie alert notes fetched", {
      provider: "opsgenie",
      operation: "fetchAlertNotes",
      durationMs,
      statusCode: result.status,
      noteCount: result.data.data.length,
      ...context,
    });

    return result.data.data;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;

    logger.warn("OpsGenie alert notes fetch failed", {
      provider: "opsgenie",
      operation: "fetchAlertNotes",
      durationMs,
      statusCode,
      retryable: errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500),
      error: redactSecrets(errorMsg),
      ...context,
    });
    return [];
  }
};

// ==================== Adapter Implementation ====================

/**
 * Creates an OpsGenie enrichment adapter.
 *
 * @param apiKey - OpsGenie API key (GenieKey)
 * @returns AlertContextPort implementation for OpsGenie
 */
export const createOpsGenieContextAdapter = (apiKey: string): AlertContextPort => ({
  fetchContext: async (alert: NormalizedAlert, context: RequestContext): Promise<AlertContext> => {
    const alertId = alert.sourceAlertId;

    if (!apiKey) {
      logger.warn("OpsGenie token not configured -- skipping enrichment", {
        provider: "opsgenie",
        operation: "fetchContext",
        ...context,
      });

      return buildEmptyAlertContext(alert);
    }

    const startTime = Date.now();

    try {
      const [details, logs, notes] = await Promise.all([
        fetchAlertDetails(alertId, apiKey, context),
        fetchAlertLogs(alertId, apiKey, context),
        fetchAlertNotes(alertId, apiKey, context),
      ]);

      const durationMs = Date.now() - startTime;
      const logSnippets = [...mapLogEntriesToSnippets(logs), ...mapNotesToSnippets(notes)];

      logger.info("OpsGenie enrichment completed", {
        provider: "opsgenie",
        operation: "fetchContext",
        durationMs,
        logSnippetCount: logSnippets.length,
        hasDetails: details !== null,
        ...context,
      });

      const detailData = details?.data;

      return {
        source: "opsgenie",
        alertId: alert.sourceAlertId,
        severity: mapAlertContextSeverity(alert.severity),
        title: alert.title,
        description: detailData?.description ?? alert.description ?? "",
        triggeredAt: detailData?.createdAt ?? alert.receivedAt,
        resolvedAt: null,
        timeWindow: buildTimeWindow(alert.receivedAt),
        evidence: {
          metrics: [],
          logs: logSnippets,
          traces: [],
          stackTraces: [],
          breadcrumbs: [],
          relatedAlerts: [],
        },
        providerMetadata: {
          acknowledged: detailData?.acknowledged ?? false,
          eventCount: detailData?.count ?? 0,
          teams: detailData?.teams ?? [],
          ackTime: detailData?.report?.ackTime ?? null,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const statusCode = (error as { status?: number }).status;

      logger.warn("OpsGenie enrichment failed", {
        provider: "opsgenie",
        operation: "fetchContext",
        durationMs,
        statusCode,
        retryable: errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500),
        error: redactSecrets(errorMsg),
        ...context,
      });

      return buildEmptyAlertContext(alert);
    }
  },
});
