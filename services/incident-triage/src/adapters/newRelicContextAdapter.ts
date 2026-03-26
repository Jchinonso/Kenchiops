/**
 * New Relic Context Adapter
 *
 * Fetches enrichment data from the New Relic NerdGraph API for a normalized alert.
 * Uses NRQL queries to retrieve error events and transaction data around the
 * alert time window.
 *
 * Returns empty evidence on failure -- never throws.
 */

import {
  resilientPost,
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
import type { NerdGraphResponse, NerdGraphNrqlResult } from "../types/newRelicTypes.js";
import { MONITORING_DEFAULTS } from "../constants/monitoringConstants.js";

const logger = createLogger("newrelic-context-adapter");

/** New Relic NerdGraph API endpoint */
const NERDGRAPH_URL = "https://api.newrelic.com/graphql";

/** New Relic context adapter constants */
const NEWRELIC_CONTEXT = {
  /** Default time window around alert (hours) */
  WINDOW_HOURS: 1,
  /** Maximum NRQL results to fetch */
  MAX_RESULTS: 50,
} as const;

// ==================== Internal Helpers ====================

/**
 * Builds NRQL query for recent error events.
 */
/**
 * Sanitizes a NRQL value to prevent injection.
 * Strips single quotes and backslashes, limits length.
 */
const sanitizeNrqlValue = (value: string): string => value.replace(/['\\]/g, "").slice(0, 200);

const buildErrorNrql = (serviceName: string | null, sinceMinutes: number): string => {
  const baseQuery =
    "SELECT timestamp, error.message, error.class, transactionName, host FROM TransactionError";
  const serviceFilter = serviceName ? ` WHERE appName = '${sanitizeNrqlValue(serviceName)}'` : "";
  return `${baseQuery}${serviceFilter} SINCE ${String(sinceMinutes)} minutes ago LIMIT ${String(NEWRELIC_CONTEXT.MAX_RESULTS)}`;
};

/**
 * Executes a NRQL query via NerdGraph.
 */
const executeNrqlQuery = async (
  apiKey: string,
  accountId: string,
  nrql: string,
  context: RequestContext
): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> => {
  const startTime = Date.now();
  // Sanitize accountId to prevent GraphQL injection (must be numeric)
  const safeAccountId = accountId.replace(/\D/g, "");
  const query = `{ actor { account(id: ${safeAccountId}) { nrql(query: "${nrql.replace(/"/g, '\\"')}") { results } } } }`;

  try {
    const result = await resilientPost<NerdGraphResponse<NerdGraphNrqlResult>>(
      NERDGRAPH_URL,
      { query },
      {
        timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
        maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
        headers: {
          "API-Key": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const durationMs = Date.now() - startTime;
    const nrqlResults = result.data.data?.actor?.account?.nrql?.results ?? [];
    const graphqlErrors = result.data.errors;

    if (graphqlErrors && graphqlErrors.length > 0) {
      logger.warn("NerdGraph returned partial errors", {
        provider: "newrelic",
        operation: "executeNrqlQuery",
        durationMs,
        statusCode: result.status,
        errorCount: graphqlErrors.length,
        ...context,
      });
    }

    logger.info("NerdGraph NRQL executed", {
      provider: "newrelic",
      operation: "executeNrqlQuery",
      durationMs,
      statusCode: result.status,
      resultCount: nrqlResults.length,
      ...context,
    });

    return nrqlResults;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;

    logger.warn("NerdGraph NRQL query failed", {
      provider: "newrelic",
      operation: "executeNrqlQuery",
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
 * Maps NRQL error results to LogSnippet evidence.
 */
const mapErrorResultsToSnippets = (
  results: ReadonlyArray<Readonly<Record<string, unknown>>>
): readonly LogSnippet[] =>
  results.map((row): LogSnippet => {
    const timestamp =
      typeof row.timestamp === "number"
        ? new Date(row.timestamp).toISOString()
        : new Date().toISOString();

    const errorMessage =
      typeof row["error.message"] === "string" ? row["error.message"] : "Unknown error";

    const errorClass = typeof row["error.class"] === "string" ? row["error.class"] : undefined;

    const transactionName =
      typeof row.transactionName === "string" ? row.transactionName : undefined;

    return {
      timestamp,
      level: "error",
      message: truncateText(errorMessage, 500),
      source: "newrelic",
      metadata: {
        ...(errorClass ? { errorClass } : {}),
        ...(transactionName ? { transactionName } : {}),
        host: typeof row.host === "string" ? row.host : undefined,
      },
    };
  });

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
  const start = new Date(received.getTime() - NEWRELIC_CONTEXT.WINDOW_HOURS * 3_600_000);
  return {
    start: start.toISOString(),
    end: received.toISOString(),
  };
};

/**
 * Builds an empty AlertContext with no evidence.
 */
const buildEmptyAlertContext = (alert: NormalizedAlert): AlertContext => ({
  source: "newrelic",
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
 * Creates a New Relic enrichment adapter.
 *
 * @param apiKey - New Relic User API key for NerdGraph
 * @param accountId - New Relic account ID for NRQL queries
 * @returns AlertContextPort implementation for New Relic
 */
export const createNewRelicContextAdapter = (
  apiKey: string,
  accountId: string
): AlertContextPort => ({
  fetchContext: async (alert: NormalizedAlert, context: RequestContext): Promise<AlertContext> => {
    if (!apiKey || !accountId) {
      logger.warn("New Relic credentials not configured -- skipping enrichment", {
        provider: "newrelic",
        operation: "fetchContext",
        ...context,
      });

      return buildEmptyAlertContext(alert);
    }

    const startTime = Date.now();
    const sinceMinutes = NEWRELIC_CONTEXT.WINDOW_HOURS * 60;

    try {
      const errorNrql = buildErrorNrql(alert.serviceName, sinceMinutes);
      const errorResults = await executeNrqlQuery(apiKey, accountId, errorNrql, context);
      const errorLogs = mapErrorResultsToSnippets(errorResults);

      const durationMs = Date.now() - startTime;

      logger.info("New Relic enrichment completed", {
        provider: "newrelic",
        operation: "fetchContext",
        durationMs,
        errorLogCount: errorLogs.length,
        ...context,
      });

      return {
        source: "newrelic",
        alertId: alert.sourceAlertId,
        severity: mapAlertContextSeverity(alert.severity),
        title: alert.title,
        description: alert.description ?? "",
        triggeredAt: alert.receivedAt,
        resolvedAt: null,
        timeWindow: buildTimeWindow(alert.receivedAt),
        evidence: {
          metrics: [],
          logs: errorLogs,
          traces: [],
          stackTraces: [],
          breadcrumbs: [],
          relatedAlerts: [],
        },
        providerMetadata: {
          accountId,
          conditionId: alert.labels.nr_condition_id ?? null,
          policyName: alert.labels.nr_policy_name ?? null,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const statusCode = (error as { status?: number }).status;

      logger.warn("New Relic enrichment failed", {
        provider: "newrelic",
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
