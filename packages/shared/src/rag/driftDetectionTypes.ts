/**
 * Drift Detection Types
 *
 * Type definitions for RAG drift detection and monitoring.
 *
 * @module rag/driftDetectionTypes
 */

import type { RAGMetricType } from "../constants/index.js";
import type { MetricBaseline } from "../database/metricsHistoryRepository.js";

/**
 * Test suite execution result.
 */
export interface TestSuiteResult {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly avgRecall: number;
  readonly avgMRR: number;
  readonly duration: number;
  readonly testResults: readonly TestCaseResult[];
}

/**
 * Single test case result.
 */
export interface TestCaseResult {
  readonly testCaseId: string;
  readonly name: string;
  readonly passed: boolean;
  readonly recall: number;
  readonly mrr: number;
  readonly retrievedDocIds: readonly string[];
  readonly skipped?: boolean;
  readonly skipReason?: string;
  readonly missingDocIds?: readonly string[];
  readonly error?: string;
}

/**
 * Drift report for monitoring.
 */
export interface DriftReport {
  readonly timestamp: string;
  readonly overallHealth: HealthStatus;
  readonly metrics: readonly DriftMetricReport[];
  readonly alerts: readonly DriftAlert[];
  readonly baselines: readonly MetricBaseline[];
}

/**
 * Health status values.
 */
export type HealthStatus = "healthy" | "degraded" | "critical";

/**
 * Alert severity values.
 */
export type AlertSeverity = "warning" | "critical";

/**
 * Metric status values.
 */
export type MetricStatus = "ok" | "warning" | "alert";

/**
 * Metric trend values.
 */
export type MetricTrend = "improving" | "stable" | "degrading";

/**
 * Individual metric drift report.
 */
export interface DriftMetricReport {
  readonly metricType: RAGMetricType;
  readonly currentValue: number;
  readonly baselineValue: number;
  readonly deviationPercent: number;
  readonly status: MetricStatus;
  readonly trend: MetricTrend;
}

/**
 * Drift alert for notifications.
 */
export interface DriftAlert {
  readonly severity: AlertSeverity;
  readonly metricType: RAGMetricType;
  readonly message: string;
  readonly deviationPercent: number;
}

/**
 * Result of running drift detection with alert dispatch.
 */
export interface DriftDetectionWithAlertsResult {
  readonly report: DriftReport;
  readonly alertsDispatched: number;
  readonly dispatchErrors: number;
}

/**
 * Metric bounds check result.
 */
export interface MetricBoundsResult {
  readonly withinBounds: boolean;
  readonly deviation: number;
  readonly threshold: number;
}

/**
 * Metric alert threshold configuration.
 */
export interface MetricAlertThreshold {
  readonly metricType: RAGMetricType;
  readonly warningThreshold: number;
  readonly criticalThreshold: number;
  readonly higherIsBetter: boolean;
}
