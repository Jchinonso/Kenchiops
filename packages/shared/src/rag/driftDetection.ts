/**
 * Drift Detection Module
 *
 * Monitors RAG quality metrics for degradation and anomalies.
 * Runs test cases, tracks metrics, and alerts on drift.
 *
 * @module rag/driftDetection
 */

import { createLogger } from "../core/logger.js";
import {
  DRIFT_DETECTION_THRESHOLDS,
  RAG_METRIC_TYPES,
  type RAGMetricType,
} from "../constants/index.js";
import {
  getActiveTestCases,
  recordMetric,
  detectDrift,
  getAllBaselines,
} from "../database/index.js";

// Import from metrics sub-module
import { METRIC_ALERT_THRESHOLDS, runTestCasesRecursive } from "./driftDetectionMetrics.js";

import type {
  TestSuiteResult,
  DriftReport,
  DriftMetricReport,
  DriftAlert,
  DriftDetectionWithAlertsResult,
} from "./types.js";

// Re-export types and utilities for consumers
export type {
  TestSuiteResult,
  TestCaseResult,
  DriftReport,
  DriftMetricReport,
  DriftAlert,
  DriftDetectionWithAlertsResult,
} from "./types.js";

export {
  METRIC_ALERT_THRESHOLDS,
  buildRetrievalResults,
  executeTestCase,
  runTestCasesRecursive,
} from "./driftDetectionMetrics.js";

const logger = createLogger("rag-drift-detection");

// ==================== Public API ====================

/**
 * Runs all active test cases and returns results.
 */
export const runTestSuite = async (tenantId?: string): Promise<TestSuiteResult> => {
  const startTime = Date.now();

  const testCases = await getActiveTestCases();
  const filteredCases = tenantId
    ? testCases.filter((testCase) => !testCase.tenantId || testCase.tenantId === tenantId)
    : testCases;

  logger.info("Running RAG test suite", { testCount: filteredCases.length, tenantId });

  if (filteredCases.length === 0) {
    return {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      avgRecall: 0,
      avgMRR: 0,
      duration: Date.now() - startTime,
      testResults: Object.freeze([]),
    };
  }

  const testResults = await runTestCasesRecursive(filteredCases, 0, []);

  // Calculate aggregates
  const passedTests = testResults.filter((result) => result.passed);
  const failedTests = testResults.filter((result) => !result.passed && !result.error);
  const skippedTests = testResults.filter((result) => result.error);

  const avgRecall =
    testResults.reduce((sum, result) => sum + result.recall, 0) / testResults.length;
  const avgMRR = testResults.reduce((sum, result) => sum + result.mrr, 0) / testResults.length;

  // Record metrics
  await Promise.all([
    recordMetric({ tenantId, metricType: RAG_METRIC_TYPES.RECALL_AT_5, metricValue: avgRecall }),
    recordMetric({ tenantId, metricType: RAG_METRIC_TYPES.MRR, metricValue: avgMRR }),
  ]);

  logger.info("Test suite completed", {
    passed: passedTests.length,
    failed: failedTests.length,
    avgRecall,
    avgMRR,
    duration: Date.now() - startTime,
  });

  return {
    totalTests: testResults.length,
    passed: passedTests.length,
    failed: failedTests.length,
    skipped: skippedTests.length,
    avgRecall,
    avgMRR,
    duration: Date.now() - startTime,
    testResults: Object.freeze(testResults),
  };
};

/**
 * Generates a drift detection report.
 */
export const generateDriftReport = async (tenantId?: string): Promise<DriftReport> => {
  const baselines = await getAllBaselines(tenantId);
  const alerts: DriftAlert[] = [];
  const metricReports: DriftMetricReport[] = [];

  // Check each monitored metric
  const checkMetric = async (
    threshold: (typeof METRIC_ALERT_THRESHOLDS)[number]
  ): Promise<DriftMetricReport | null> => {
    const baseline = baselines.find(
      (baselineItem) => baselineItem.metricType === threshold.metricType
    );
    if (!baseline || baseline.sampleCount < DRIFT_DETECTION_THRESHOLDS.MIN_SAMPLE_SIZE) {
      return null;
    }

    const driftResult = await detectDrift(threshold.metricType, baseline.baselineValue, tenantId);
    const deviation = Math.abs(driftResult.deviationPercent);

    // Determine status based on direction and thresholds
    const isBadDeviation = threshold.higherIsBetter
      ? driftResult.direction === "decrease"
      : driftResult.direction === "increase";

    let status: "ok" | "warning" | "alert" = "ok";
    if (isBadDeviation) {
      if (deviation >= threshold.criticalThreshold) {
        status = "alert";
        alerts.push({
          severity: "critical",
          metricType: threshold.metricType,
          message: `${threshold.metricType} has degraded by ${deviation.toFixed(1)}%`,
          deviationPercent: deviation,
        });
      } else if (deviation >= threshold.warningThreshold) {
        status = "warning";
        alerts.push({
          severity: "warning",
          metricType: threshold.metricType,
          message: `${threshold.metricType} shows ${deviation.toFixed(1)}% degradation`,
          deviationPercent: deviation,
        });
      }
    }

    const trend = isBadDeviation
      ? "degrading"
      : driftResult.direction === "stable"
        ? "stable"
        : "improving";

    return {
      metricType: threshold.metricType,
      currentValue: driftResult.currentValue,
      baselineValue: driftResult.baselineValue,
      deviationPercent: driftResult.deviationPercent,
      status,
      trend,
    };
  };

  // Process all metrics
  const processMetrics = async (
    index: number,
    reports: readonly DriftMetricReport[]
  ): Promise<readonly DriftMetricReport[]> => {
    if (index >= METRIC_ALERT_THRESHOLDS.length) {
      return reports;
    }

    const report = await checkMetric(METRIC_ALERT_THRESHOLDS[index]);
    const newReports = report ? [...reports, report] : reports;
    return processMetrics(index + 1, newReports);
  };

  const reports = await processMetrics(0, []);
  reports.forEach((report) => metricReports.push(report));

  // Determine overall health
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical");
  const warningAlerts = alerts.filter((alert) => alert.severity === "warning");

  let overallHealth: "healthy" | "degraded" | "critical" = "healthy";
  if (criticalAlerts.length > 0) {
    overallHealth = "critical";
  } else if (warningAlerts.length > 0) {
    overallHealth = "degraded";
  }

  return {
    timestamp: new Date().toISOString(),
    overallHealth,
    metrics: Object.freeze(metricReports),
    alerts: Object.freeze(alerts),
    baselines: Object.freeze([...baselines]),
  };
};

/**
 * Checks if metrics are within acceptable bounds.
 */
export const checkMetricBounds = async (
  metricType: RAGMetricType,
  currentValue: number,
  tenantId?: string
): Promise<{
  withinBounds: boolean;
  deviation: number;
  threshold: number;
}> => {
  const driftResult = await detectDrift(metricType, currentValue, tenantId);
  const threshold = METRIC_ALERT_THRESHOLDS.find(
    (thresholdConfig) => thresholdConfig.metricType === metricType
  );

  if (!threshold) {
    return { withinBounds: true, deviation: 0, threshold: 0 };
  }

  const absDeviation = Math.abs(driftResult.deviationPercent);
  const withinBounds = absDeviation < threshold.warningThreshold;

  return {
    withinBounds,
    deviation: driftResult.deviationPercent,
    threshold: threshold.warningThreshold,
  };
};

/**
 * Generates a drift report and dispatches any alerts to Slack.
 * Combines report generation with alert delivery for convenience.
 *
 * @param tenantId - Optional tenant ID for filtering
 * @param options - Optional configuration
 * @returns Report with dispatch statistics
 */
export const runDriftDetectionWithAlerts = async (
  tenantId?: string,
  options: { skipAlertDispatch?: boolean } = {}
): Promise<DriftDetectionWithAlertsResult> => {
  const report = await generateDriftReport(tenantId);

  // Skip dispatch if requested or no alerts
  if (options.skipAlertDispatch || report.alerts.length === 0) {
    return {
      report,
      alertsDispatched: 0,
      dispatchErrors: 0,
    };
  }

  // Lazy import to avoid circular dependency
  const { dispatchDriftReportAlerts, dispatchHealthStatusAlert } =
    await import("./alertDispatcher.js");

  // Dispatch alerts and health status in parallel
  const [alertResult, healthResult] = await Promise.all([
    dispatchDriftReportAlerts(report, { tenantId }),
    dispatchHealthStatusAlert(report.overallHealth, tenantId),
  ]);

  const totalDispatched = alertResult.successful + (healthResult.success ? 1 : 0);
  const totalErrors = alertResult.failed + (healthResult.success ? 0 : 1);

  logger.info("Drift detection with alerts complete", {
    tenantId,
    overallHealth: report.overallHealth,
    alertsGenerated: report.alerts.length,
    alertsDispatched: totalDispatched,
    dispatchErrors: totalErrors,
  });

  return {
    report,
    alertsDispatched: totalDispatched,
    dispatchErrors: totalErrors,
  };
};
