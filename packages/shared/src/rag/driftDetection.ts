/**
 * Drift Detection Module
 *
 * Monitors RAG quality metrics for degradation and anomalies.
 * Runs test cases, tracks metrics, and alerts on drift.
 *
 * @module rag/driftDetection
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  DRIFT_DETECTION_THRESHOLDS,
  RAG_METRIC_TYPES,
  type RAGMetricType,
} from "../constants/index.js";
import {
  getActiveTestCases,
  updateTestCaseResult,
  validateExpectedDocIds,
  type RAGTestCase,
  type TestResultInput,
} from "../database/testCaseRepository.js";
import {
  recordMetric,
  detectDrift,
  getAllBaselines,
} from "../database/metricsHistoryRepository.js";
import { searchDiffChunks, searchKnowledgeDocs } from "./search.js";
import { calculateRecallAtK, calculateMRR, type RetrievalResult } from "./evaluation.js";
import type {
  TestSuiteResult,
  TestCaseResult,
  DriftReport,
  DriftMetricReport,
  DriftAlert,
  DriftDetectionWithAlertsResult,
  MetricAlertThreshold,
} from "./driftDetectionTypes.js";

// Re-export types for consumers
export type {
  TestSuiteResult,
  TestCaseResult,
  DriftReport,
  DriftMetricReport,
  DriftAlert,
  DriftDetectionWithAlertsResult,
} from "./driftDetectionTypes.js";

const logger = createLogger("rag-drift-detection");

// ==================== Metric Thresholds ====================

/**
 * Maps metric types to their alert thresholds.
 */
const METRIC_ALERT_THRESHOLDS: readonly MetricAlertThreshold[] = [
  {
    metricType: RAG_METRIC_TYPES.RECALL_AT_5,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_5_DROP_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_5_DROP_PERCENT * 2,
    higherIsBetter: true,
  },
  {
    metricType: RAG_METRIC_TYPES.RECALL_AT_10,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_10_DROP_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.RECALL_AT_10_DROP_PERCENT * 2,
    higherIsBetter: true,
  },
  {
    metricType: RAG_METRIC_TYPES.MRR,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.MRR_DROP_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.MRR_DROP_PERCENT * 2,
    higherIsBetter: true,
  },
  {
    metricType: RAG_METRIC_TYPES.EMBEDDING_ERROR_RATE,
    warningThreshold: DRIFT_DETECTION_THRESHOLDS.ERROR_RATE_THRESHOLD_PERCENT,
    criticalThreshold: DRIFT_DETECTION_THRESHOLDS.ERROR_RATE_THRESHOLD_PERCENT * 2,
    higherIsBetter: false,
  },
];

// ==================== Test Execution ====================

/**
 * Builds retrieval results with relevance labels.
 */
const buildRetrievalResults = (
  retrievedDocIds: readonly string[],
  expectedDocIds: readonly string[]
): readonly RetrievalResult[] => {
  const expectedSet = new Set(expectedDocIds);
  return retrievedDocIds.map((docId, index) => ({
    docId,
    similarity: 1 - index * 0.1, // Approximate similarity decay
    rank: index + 1,
    isRelevant: expectedSet.has(docId),
  }));
};

/**
 * Executes a single RAG test case.
 * Validates expectedDocIds exist before running the test.
 */
const executeTestCase = async (testCase: RAGTestCase): Promise<TestCaseResult> => {
  const startTime = Date.now();

  try {
    // Validate expected document IDs exist before running test
    if (testCase.expectedDocIds.length > 0) {
      const validation = await validateExpectedDocIds(testCase.expectedDocIds);

      if (!validation.valid) {
        logger.warn("Test case skipped - missing expected documents", {
          testCaseId: testCase.id,
          name: testCase.name,
          missingCount: validation.missingIds.length,
          missingIds: validation.missingIds.slice(0, 5), // Log first 5
        });

        return {
          testCaseId: testCase.id,
          name: testCase.name,
          passed: false,
          recall: 0,
          mrr: 0,
          retrievedDocIds: Object.freeze([]),
          skipped: true,
          skipReason: `Missing ${validation.missingIds.length} expected document(s)`,
          missingDocIds: validation.missingIds,
        };
      }
    }

    // Search for relevant documents using the test query
    const [diffResponse, docResponse] = await Promise.all([
      searchDiffChunks({ queryText: testCase.queryText, topK: 10 }),
      searchKnowledgeDocs({ queryText: testCase.queryText, topK: 10 }),
    ]);

    // Combine results by document ID
    const retrievedDocIds = [
      ...diffResponse.results.map((result) => result.item.id),
      ...docResponse.results.map((result) => result.item.id),
    ];

    // Build retrieval results for metrics calculation
    const expectedDocIds = [...testCase.expectedDocIds];
    const retrievalResults = buildRetrievalResults(retrievedDocIds, expectedDocIds);

    // Calculate metrics
    const recall = calculateRecallAtK(retrievalResults, 5);
    const mrr = calculateMRR([retrievalResults]);
    const passed = recall >= testCase.expectedMinRecall;

    // Record test result
    const testResult: TestResultInput = {
      passed,
      recall,
      retrievedDocIds: Object.freeze(retrievedDocIds),
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    await updateTestCaseResult(testCase.id, testResult);

    return {
      testCaseId: testCase.id,
      name: testCase.name,
      passed,
      recall,
      mrr,
      retrievedDocIds: Object.freeze(retrievedDocIds),
    };
  } catch (error) {
    logger.error("Test case execution failed", {
      testCaseId: testCase.id,
      error: getErrorMessage(error),
    });

    return {
      testCaseId: testCase.id,
      name: testCase.name,
      passed: false,
      recall: 0,
      mrr: 0,
      retrievedDocIds: Object.freeze([]),
      error: getErrorMessage(error),
    };
  }
};

/**
 * Runs test cases recursively to avoid loops.
 */
const runTestCasesRecursive = async (
  testCases: readonly RAGTestCase[],
  index: number,
  results: readonly TestCaseResult[]
): Promise<readonly TestCaseResult[]> => {
  if (index >= testCases.length) {
    return results;
  }

  const result = await executeTestCase(testCases[index]);
  return runTestCasesRecursive(testCases, index + 1, [...results, result]);
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
