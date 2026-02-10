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
  type MetricBaseline,
  type DriftDetectionResult,
} from "../database/index.js";

// Import from metrics sub-module
import { METRIC_ALERT_THRESHOLDS, runTestCasesRecursive } from "./driftDetectionMetrics.js";

import type {
  TestSuiteResult,
  DriftReport,
  DriftMetricReport,
  DriftAlert,
  DriftDetectionWithAlertsResult,
  MetricAlertThreshold,
  HealthStatus,
  MetricStatus,
  MetricTrend,
  AlertSeverity,
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

// ==================== Drift Report Helpers ====================

/**
 * Checks whether a deviation in the given direction is bad for the metric.
 */
const isDeviationBad = (
  threshold: MetricAlertThreshold,
  direction: DriftDetectionResult["direction"]
): boolean => (threshold.higherIsBetter ? direction === "decrease" : direction === "increase");

/**
 * Determines metric status based on deviation severity.
 */
const determineMetricStatus = (
  deviation: number,
  threshold: MetricAlertThreshold,
  badDeviation: boolean
): MetricStatus => {
  if (!badDeviation) {
    return "ok";
  }
  if (deviation >= threshold.criticalThreshold) {
    return "alert";
  }
  if (deviation >= threshold.warningThreshold) {
    return "warning";
  }
  return "ok";
};

/**
 * Determines metric trend from deviation direction.
 */
const determineTrend = (
  badDeviation: boolean,
  direction: DriftDetectionResult["direction"]
): MetricTrend => {
  if (badDeviation) {
    return "degrading";
  }
  if (direction === "stable") {
    return "stable";
  }
  return "improving";
};

/**
 * Builds a drift alert for a metric that exceeded a threshold.
 */
const buildDriftAlert = (
  status: MetricStatus,
  threshold: MetricAlertThreshold,
  deviation: number
): DriftAlert | null => {
  if (status === "ok") {
    return null;
  }

  const severity: AlertSeverity = status === "alert" ? "critical" : "warning";
  const verb = severity === "critical" ? "has degraded by" : "shows";
  const suffix = severity === "critical" ? "" : " degradation";

  return {
    severity,
    metricType: threshold.metricType,
    message: `${threshold.metricType} ${verb} ${deviation.toFixed(1)}%${suffix}`,
    deviationPercent: deviation,
  };
};

/**
 * Evaluates a single metric threshold against its baseline.
 * Returns the metric report and an optional alert, or null if no baseline.
 */
const evaluateMetricThreshold = async (
  threshold: MetricAlertThreshold,
  baselines: readonly MetricBaseline[],
  tenantId?: string
): Promise<{ report: DriftMetricReport; alert: DriftAlert | null } | null> => {
  const baseline = baselines.find(
    (baselineItem) => baselineItem.metricType === threshold.metricType
  );
  if (!baseline || baseline.sampleCount < DRIFT_DETECTION_THRESHOLDS.MIN_SAMPLE_SIZE) {
    return null;
  }

  const driftResult = await detectDrift(threshold.metricType, baseline.baselineValue, tenantId);
  const deviation = Math.abs(driftResult.deviationPercent);
  const badDeviation = isDeviationBad(threshold, driftResult.direction);

  const status = determineMetricStatus(deviation, threshold, badDeviation);
  const trend = determineTrend(badDeviation, driftResult.direction);
  const alert = buildDriftAlert(status, threshold, deviation);

  return {
    report: {
      metricType: threshold.metricType,
      currentValue: driftResult.currentValue,
      baselineValue: driftResult.baselineValue,
      deviationPercent: driftResult.deviationPercent,
      status,
      trend,
    },
    alert,
  };
};

/**
 * Determines overall system health from the collected alerts.
 */
const determineOverallHealth = (alerts: readonly DriftAlert[]): HealthStatus => {
  if (alerts.some((alert) => alert.severity === "critical")) {
    return "critical";
  }
  if (alerts.some((alert) => alert.severity === "warning")) {
    return "degraded";
  }
  return "healthy";
};

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
 * Generates a drift detection report by evaluating all monitored metrics.
 */
export const generateDriftReport = async (tenantId?: string): Promise<DriftReport> => {
  const baselines = await getAllBaselines(tenantId);
  const metricReports: DriftMetricReport[] = [];
  const alerts: DriftAlert[] = [];

  // Evaluate each metric threshold sequentially (each calls detectDrift)
  for (const threshold of METRIC_ALERT_THRESHOLDS) {
    const evaluation = await evaluateMetricThreshold(threshold, baselines, tenantId);
    if (!evaluation) {
      continue;
    }

    metricReports.push(evaluation.report);
    if (evaluation.alert) {
      alerts.push(evaluation.alert);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    overallHealth: determineOverallHealth(alerts),
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
