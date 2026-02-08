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
import { findById } from "../database/index.js";
import type {
  DriftAlert,
  DriftReport,
  AlertDispatchResult,
  BatchAlertDispatchResult,
  AlertDispatchOptions,
} from "./types.js";
import type { RAGMetricType } from "../constants/index.js";

export type {
  AlertDispatchResult,
  BatchAlertDispatchResult,
  AlertDispatchOptions,
} from "./types.js";

const logger = createLogger("rag-alert-dispatcher");

// ==================== Constants ====================

/**
 * Alert configuration constants
 */
const ALERT_CONSTANTS = {
  /** Default repository name for system-level alerts */
  DEFAULT_REPOSITORY: "system",
  /** Default installation ID for global alerts */
  DEFAULT_INSTALLATION_ID: 0,
  /** Alert title prefix */
  TITLE_PREFIX: "RAG Drift Alert",
} as const;

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
    const tenant = await findById(tenantId);
    return tenant?.githubInstallationId ?? ALERT_CONSTANTS.DEFAULT_INSTALLATION_ID;
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
export const dispatchDriftAlerts = async (
  alerts: readonly DriftAlert[],
  options: AlertDispatchOptions = {}
): Promise<BatchAlertDispatchResult> => {
  if (alerts.length === 0) {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      results: Object.freeze([]),
    };
  }

  const { tenantId, repository = ALERT_CONSTANTS.DEFAULT_REPOSITORY } = options;

  logger.info("Dispatching batch drift alerts", {
    count: alerts.length,
    tenantId,
  });

  const installationId = await getInstallationIdForTenant(tenantId);

  // Process alerts recursively to avoid loops
  const processAlerts = async (
    index: number,
    accumulated: readonly AlertDispatchResult[]
  ): Promise<readonly AlertDispatchResult[]> => {
    if (index >= alerts.length) {
      return accumulated;
    }

    const result = await dispatchSingleAlertSafe(
      alerts[index],
      installationId,
      repository,
      tenantId
    );

    return processAlerts(index + 1, [...accumulated, result]);
  };

  const results = await processAlerts(0, []);

  const successful = results.filter((result) => result.success).length;
  const failed = results.length - successful;

  logger.info("Batch alert dispatch complete", {
    total: results.length,
    successful,
    failed,
  });

  return {
    total: results.length,
    successful,
    failed,
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
