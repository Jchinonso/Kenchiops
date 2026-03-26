/**
 * Sentry Context Adapter
 *
 * Fetches enrichment data from the Sentry API for a normalized alert.
 * Retrieves the latest event for an issue, extracting stack traces and
 * breadcrumbs into the AlertContext evidence model.
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
  type StackFrame,
  type BreadcrumbEvent,
} from "@kenchi/shared";
import type { AlertContextPort } from "../ports/alertContextPort.js";
import type { NormalizedAlert } from "../types/incidentTypes.js";
import type {
  SentryEventResponse,
  SentryExceptionValue,
  SentryBreadcrumb,
  SentryStackFrame,
  SentryEventEntry,
} from "../types/sentryTypes.js";
import { MONITORING_DEFAULTS } from "../constants/monitoringConstants.js";

const logger = createLogger("sentry-context-adapter");

/** Sentry API base URL */
const SENTRY_API_BASE_URL = "https://sentry.io";

/** Default time window around alert (hours) */
const CONTEXT_WINDOW_HOURS = 1;

// ==================== Internal Helpers ====================

/**
 * Maps a Sentry stack frame to the shared StackFrame type.
 */
const mapStackFrame = (frame: SentryStackFrame): StackFrame => ({
  filename: frame.filename ?? "",
  function: frame.function ?? "<unknown>",
  lineno: frame.lineNo ?? 0,
  colno: frame.colNo ?? undefined,
  context: frame.context
    ? frame.context.map((ctxLine) => `${String(ctxLine[0])}: ${ctxLine[1]}`)
    : undefined,
  inApp: frame.inApp ?? false,
});

/**
 * Extracts stack frames from Sentry exception entries.
 */
const extractStackTraces = (entries: readonly SentryEventEntry[]): readonly StackFrame[] => {
  const exceptionEntry = entries.find((entry) => entry.type === "exception");
  if (!exceptionEntry) {
    return [];
  }

  const entryData = exceptionEntry.data as { readonly values?: readonly SentryExceptionValue[] };
  const values = entryData.values ?? [];

  return values.flatMap((exceptionValue) => {
    const frames = exceptionValue.stacktrace?.frames ?? [];
    return frames.map(mapStackFrame);
  });
};

/**
 * Maps a Sentry breadcrumb level to the shared BreadcrumbEvent level.
 */
const mapBreadcrumbLevel = (level: string): BreadcrumbEvent["level"] => {
  const levelMap: Readonly<Record<string, BreadcrumbEvent["level"]>> = {
    debug: "debug",
    info: "info",
    warning: "warning",
    error: "error",
    fatal: "error",
  };
  return levelMap[level.toLowerCase()] ?? "info";
};

/**
 * Extracts breadcrumbs from Sentry breadcrumb entries.
 */
const extractBreadcrumbs = (entries: readonly SentryEventEntry[]): readonly BreadcrumbEvent[] => {
  const breadcrumbEntry = entries.find((entry) => entry.type === "breadcrumbs");
  if (!breadcrumbEntry) {
    return [];
  }

  const entryData = breadcrumbEntry.data as { readonly values?: readonly SentryBreadcrumb[] };
  const values = entryData.values ?? [];

  return values.map(
    (breadcrumb): BreadcrumbEvent => ({
      timestamp: breadcrumb.timestamp,
      category: breadcrumb.category ?? "default",
      message: truncateText(breadcrumb.message ?? "", 500),
      level: mapBreadcrumbLevel(breadcrumb.level ?? "info"),
      data: breadcrumb.data,
    })
  );
};

/**
 * Maps Sentry alert severity to AlertContext severity.
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
  source: "sentry",
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

// ==================== Adapter Implementation ====================

/**
 * Creates a Sentry enrichment adapter.
 *
 * @param apiToken - Sentry API auth token
 * @param organizationSlug - Sentry organization slug for API paths
 * @returns AlertContextPort implementation for Sentry
 */
export const createSentryContextAdapter = (
  apiToken: string,
  organizationSlug: string
): AlertContextPort => ({
  fetchContext: async (alert: NormalizedAlert, context: RequestContext): Promise<AlertContext> => {
    const startTime = Date.now();
    const issueId = alert.sourceAlertId;

    if (!apiToken) {
      logger.warn("Sentry token not configured -- skipping enrichment", {
        provider: "sentry",
        operation: "fetchContext",
        ...context,
      });

      return buildEmptyAlertContext(alert);
    }

    try {
      const url = `${SENTRY_API_BASE_URL}/api/0/issues/${encodeURIComponent(issueId)}/events/latest/`;

      const eventData = await resilientGet<SentryEventResponse>(url, {
        timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
        maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });

      const durationMs = Date.now() - startTime;
      const event = eventData.data;

      const stackTraces = extractStackTraces(event.entries);
      const breadcrumbs = extractBreadcrumbs(event.entries);

      logger.info("Sentry enrichment completed", {
        provider: "sentry",
        operation: "fetchContext",
        durationMs,
        statusCode: eventData.status,
        stackFrameCount: stackTraces.length,
        breadcrumbCount: breadcrumbs.length,
        ...context,
      });

      return {
        source: "sentry",
        alertId: alert.sourceAlertId,
        severity: mapAlertContextSeverity(alert.severity),
        title: alert.title,
        description: alert.description ?? "",
        triggeredAt: event.dateCreated ?? alert.receivedAt,
        resolvedAt: null,
        timeWindow: buildTimeWindow(alert.receivedAt),
        evidence: {
          metrics: [],
          logs: [],
          traces: [],
          stackTraces,
          breadcrumbs,
          relatedAlerts: [],
        },
        providerMetadata: {
          eventId: event.eventID,
          organizationSlug,
          tags: event.tags,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const statusCode = (error as { status?: number }).status;
      const isRetryable =
        errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

      logger.warn("Sentry enrichment failed", {
        provider: "sentry",
        operation: "fetchContext",
        durationMs,
        statusCode,
        retryable: isRetryable,
        error: redactSecrets(errorMsg),
        ...context,
      });

      return buildEmptyAlertContext(alert);
    }
  },
});
