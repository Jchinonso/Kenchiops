/**
 * RAG Alert Dispatcher Module
 *
 * Dispatches drift detection alerts to Slack via the notification queue.
 * Converts RAG-specific alerts to system alerts for delivery.
 *
 * @module rag/alertDispatcher
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { enqueueSystemAlert } from "../queue/slackNotificationProcessor.js";
import { findGitHubAppConnection } from "../database/providerConnection/repository.js";
import type {
  DriftAlert,
  DriftReport,
  AlertDispatchResult,
  BatchAlertDispatchResult,
  AlertDispatchOptions,
} from "./types.js";
import { ALERT_CONSTANTS, type RAGMetricType } from "../constants/index.js";

export type {
  AlertDispatchResult,
  BatchAlertDispatchResult,
  AlertDispatchOptions,
} from "./types.js";

const logger = createLogger("rag-alert-dispatcher");

// ==================== Constants ====================

/**
 * Severity mapping from DriftAlert to SystemAlertPayload
 */
const SEVERITY_MAP: Record<DriftAlert["severity"], "warning" | "critical"> = {
  warning: "warning",
  critical: "critical",
} as const;

// ==================== Helper Functions ====================

/**
 * Builds alert title from metric type and severity
 */
const buildAlertTitle = (metricType: RAGMetricType, severity: DriftAlert["severity"]): string => {
  const severityLabel = severity === "critical" ? "CRITICAL" : "Warning";
  return `${ALERT_CONSTANTS.TITLE_PREFIX}: ${severityLabel} - ${metricType}`;
};

/**
 * Builds alert details from drift alert
 */
const buildAlertDetails = (alert: DriftAlert, tenantId?: string): Record<string, unknown> => ({
  metricType: alert.metricType,
  deviationPercent: alert.deviationPercent,
  tenantId: tenantId ?? "global",
  timestamp: new Date().toISOString(),
});

/**
 * Gets installation ID for a tenant, returning default if not found
 */
const getInstallationIdForTenant = async (tenantId?: string): Promise<number> => {
  if (!tenantId) {
    return ALERT_CONSTANTS.DEFAULT_INSTALLATION_ID;
  }

  try {
    const ghConn = await findGitHubAppConnection(tenantId);
    const installId = ghConn?.externalOrgId ? Number(ghConn.externalOrgId) : null;
    return installId ?? ALERT_CONSTANTS.DEFAULT_INSTALLATION_ID;
  } catch (error) {
    logger.warn("Failed to lookup tenant for alert", {
      tenantId,
      error: getErrorMessage(error),
    });
    return ALERT_CONSTANTS.DEFAULT_INSTALLATION_ID;
  }
};

/**
 * Dispatches a single alert safely
 */
const dispatchSingleAlertSafe = async (
  alert: DriftAlert,
  installationId: number,
  repository: string,
  tenantId?: string
): Promise<AlertDispatchResult> => {
  try {
    const messageId = await enqueueSystemAlert({
      severity: SEVERITY_MAP[alert.severity],
      title: buildAlertTitle(alert.metricType, alert.severity),
      message: alert.message,
      details: buildAlertDetails(alert, tenantId),
      repository,
      installationId,
    });

    logger.info("Dispatched RAG drift alert", {
      messageId,
      metricType: alert.metricType,
      severity: alert.severity,
      tenantId,
    });

    return { success: true, messageId };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to dispatch RAG drift alert", {
      metricType: alert.metricType,
      severity: alert.severity,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
};

// ==================== Public API ====================

/**
 * Dispatches a single drift alert to Slack.
 *
 * @param alert - The drift alert to dispatch
 * @param options - Optional dispatch configuration
 * @returns Dispatch result with success status
 */
export const dispatchDriftAlert = async (
  alert: DriftAlert,
  options: AlertDispatchOptions = {}
): Promise<AlertDispatchResult> => {
  const { tenantId, repository = ALERT_CONSTANTS.DEFAULT_REPOSITORY } = options;

  logger.info("Dispatching drift alert", {
    metricType: alert.metricType,
    severity: alert.severity,
    tenantId,
  });

  const installationId = await getInstallationIdForTenant(tenantId);
  return dispatchSingleAlertSafe(alert, installationId, repository, tenantId);
};

/**
 * Dispatches multiple drift alerts to Slack.
 * Processes alerts sequentially to avoid overwhelming the queue.
 *
 * @param alerts - Array of drift alerts to dispatch
 * @param options - Optional dispatch configuration
 * @returns Batch result with per-alert outcomes
 */
/**
 * Processes alerts sequentially via reduce.
 */
const processAlertsSequentially = (
  alerts: readonly DriftAlert[],
  installationId: number,
  repository: string,
  tenantId?: string
): Promise<readonly AlertDispatchResult[]> =>
  alerts.reduce<Promise<readonly AlertDispatchResult[]>>(async (accPromise, alert) => {
    const acc = await accPromise;
    const result = await dispatchSingleAlertSafe(alert, installationId, repository, tenantId);
    return [...acc, result];
  }, Promise.resolve([]));

export const dispatchDriftAlerts = async (
  alerts: readonly DriftAlert[],
  options: AlertDispatchOptions = {}
): Promise<BatchAlertDispatchResult> => {
  if (alerts.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: Object.freeze([]) };
  }

  const { tenantId, repository = ALERT_CONSTANTS.DEFAULT_REPOSITORY } = options;

  logger.info("Dispatching batch drift alerts", { count: alerts.length, tenantId });

  const installationId = await getInstallationIdForTenant(tenantId);
  const results = await processAlertsSequentially(alerts, installationId, repository, tenantId);
  const successful = results.filter((result) => result.success).length;

  logger.info("Batch alert dispatch complete", {
    total: results.length,
    successful,
    failed: results.length - successful,
  });

  return {
    total: results.length,
    successful,
    failed: results.length - successful,
    results: Object.freeze(results),
  };
};

/**
 * Dispatches all alerts from a drift report.
 * Convenience function for processing complete drift reports.
 *
 * @param report - The drift report containing alerts
 * @param options - Optional dispatch configuration
 * @returns Batch result with per-alert outcomes
 */
export const dispatchDriftReportAlerts = async (
  report: DriftReport,
  options: AlertDispatchOptions = {}
): Promise<BatchAlertDispatchResult> => {
  if (report.alerts.length === 0) {
    logger.debug("No alerts to dispatch from drift report", {
      overallHealth: report.overallHealth,
    });

    return {
      total: 0,
      successful: 0,
      failed: 0,
      results: Object.freeze([]),
    };
  }

  logger.info("Dispatching alerts from drift report", {
    alertCount: report.alerts.length,
    overallHealth: report.overallHealth,
  });

  return dispatchDriftAlerts(report.alerts, options);
};

/**
 * Dispatches a health status alert when system health changes.
 *
 * @param overallHealth - Current health status
 * @param tenantId - Optional tenant ID
 * @returns Dispatch result
 */
export const dispatchHealthStatusAlert = async (
  overallHealth: DriftReport["overallHealth"],
  tenantId?: string
): Promise<AlertDispatchResult> => {
  // Only dispatch for degraded or critical health
  if (overallHealth === "healthy") {
    return { success: true };
  }

  const installationId = await getInstallationIdForTenant(tenantId);

  const severity = overallHealth === "critical" ? "critical" : "warning";
  const title = `RAG System Health: ${overallHealth.toUpperCase()}`;
  const message =
    overallHealth === "critical"
      ? "RAG system has critical metric degradation. Immediate attention required."
      : "RAG system shows metric degradation. Review recommended.";

  try {
    const messageId = await enqueueSystemAlert({
      severity,
      title,
      message,
      details: {
        overallHealth,
        tenantId: tenantId ?? "global",
        timestamp: new Date().toISOString(),
      },
      repository: ALERT_CONSTANTS.DEFAULT_REPOSITORY,
      installationId,
    });

    logger.info("Dispatched health status alert", {
      messageId,
      overallHealth,
      tenantId,
    });

    return { success: true, messageId };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to dispatch health status alert", {
      overallHealth,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
};
