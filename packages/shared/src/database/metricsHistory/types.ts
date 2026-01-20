/**
 * RAG Metrics History Types
 *
 * Type definitions and mappers for metrics history database operations.
 *
 * @module database/metricsHistory/types
 */

import type { RAGMetricType } from "../common.js";

// ==================== Database Row Types ====================

/**
 * Database row for RAG metrics history.
 */
export interface MetricsHistoryRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly metric_type: string;
  readonly metric_value: string;
  readonly sample_size: number;
  readonly metadata: Record<string, unknown> | null;
  readonly recorded_at: string;
  readonly created_at: string;
}

/**
 * Database row for baseline query results.
 */
export interface BaselineRow {
  readonly metric_type: string;
  readonly avg_value: string;
  readonly std_dev: string | null;
  readonly sample_count: string;
}

/**
 * Database row for trend query results.
 */
export interface TrendRow {
  readonly day: string;
  readonly avg_value: string;
}

/**
 * Database row for count query results.
 */
export interface CountRow {
  readonly metric_type: string;
  readonly count: string;
}

// ==================== Domain Types ====================

/**
 * RAG metric history record.
 */
export interface RAGMetricHistory {
  readonly id: string;
  readonly tenantId?: string;
  readonly metricType: RAGMetricType;
  readonly metricValue: number;
  readonly sampleSize: number;
  readonly metadata?: Record<string, unknown>;
  readonly recordedAt: string;
  readonly createdAt: string;
}

/**
 * Input for recording a metric.
 */
export interface RecordMetricInput {
  readonly tenantId?: string;
  readonly metricType: RAGMetricType;
  readonly metricValue: number;
  readonly sampleSize?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Baseline metrics for comparison.
 */
export interface MetricBaseline {
  readonly metricType: RAGMetricType;
  readonly baselineValue: number;
  readonly stdDev: number;
  readonly sampleCount: number;
}

/**
 * Drift detection result.
 */
export interface DriftDetectionResult {
  readonly metricType: RAGMetricType;
  readonly currentValue: number;
  readonly baselineValue: number;
  readonly deviationPercent: number;
  readonly isAnomaly: boolean;
  readonly direction: "increase" | "decrease" | "stable";
}

/**
 * Trend data point for analysis.
 */
export interface TrendDataPoint {
  readonly day: string;
  readonly avgValue: number;
}

// ==================== Validation Types ====================

/**
 * Validation rule for RecordMetricInput.
 */
export interface RecordMetricValidationRule {
  readonly isInvalid: (input: RecordMetricInput) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}
