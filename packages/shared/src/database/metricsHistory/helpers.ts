/**
 * Metrics History Repository Helpers
 *
 * Validation functions, helpers, and row mappers for metrics history operations.
 *
 * @module database/metricsHistory/helpers
 */

import {
  ValidationError,
  DRIFT_DETECTION_THRESHOLDS,
  RAG_METRIC_TYPES,
  METRICS_HISTORY_DEFAULTS,
  type RAGMetricType,
} from "../common.js";
import type {
  BaselineRow,
  CountRow,
  DriftDetectionResult,
  MetricBaseline,
  MetricsHistoryRow,
  RAGMetricHistory,
  RecordMetricInput,
  RecordMetricValidationRule,
  TrendDataPoint,
  TrendRow,
} from "./types.js";

// ==================== Validation Rules ====================

/** Validation rules for metric recording. */
const RECORD_METRIC_VALIDATION_RULES: readonly RecordMetricValidationRule[] = [
  {
    isInvalid: (input) => !Object.values(RAG_METRIC_TYPES).includes(input.metricType),
    getMessage: () => "Invalid metric type",
    field: "metricType",
  },
  {
    isInvalid: (input) => !Number.isFinite(input.metricValue),
    getMessage: () => "Metric value must be a finite number",
    field: "metricValue",
  },
  {
    isInvalid: (input) =>
      input.sampleSize !== undefined &&
      (!Number.isInteger(input.sampleSize) ||
        input.sampleSize < METRICS_HISTORY_DEFAULTS.MIN_QUERY_LIMIT),
    getMessage: () => `Sample size must be a positive integer`,
    field: "sampleSize",
  },
  {
    isInvalid: (input) => input.tenantId !== undefined && input.tenantId.trim().length === 0,
    getMessage: () => "Tenant ID cannot be empty when provided",
    field: "tenantId",
  },
];

// ==================== Input Validation ====================

/**
 * Validates RecordMetricInput using handler pattern.
 *
 * @param input - Input to validate
 * @throws ValidationError if input is invalid
 */
export const validateRecordMetricInput = (input: RecordMetricInput): void => {
  const failedRule = RECORD_METRIC_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateRecordMetricInput",
    metadata: { field: failedRule.field },
  });
};

/**
 * Validates that a metric type is valid.
 *
 * @param metricType - Metric type to validate
 * @throws ValidationError if metric type is invalid
 */
export const validateMetricType = (metricType: RAGMetricType): void => {
  if (!Object.values(RAG_METRIC_TYPES).includes(metricType)) {
    throw new ValidationError("Invalid metric type", {
      operation: "validateMetricType",
      metadata: { metricType },
    });
  }
};

/**
 * Validates that a value is a positive integer.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error message
 * @throws ValidationError if value is invalid
 */
export const validatePositiveInteger = (value: number, fieldName: string): void => {
  if (!Number.isInteger(value) || value < METRICS_HISTORY_DEFAULTS.MIN_QUERY_LIMIT) {
    throw new ValidationError(`${fieldName} must be a positive integer`, {
      operation: "validatePositiveInteger",
      metadata: { field: fieldName, value },
    });
  }
};

/**
 * Validates that a number is finite.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error message
 * @throws ValidationError if value is not finite
 */
export const validateFiniteNumber = (value: number, fieldName: string): void => {
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${fieldName} must be a finite number`, {
      operation: "validateFiniteNumber",
      metadata: { field: fieldName, value },
    });
  }
};

// ==================== Deviation Calculation ====================

/**
 * Calculates percentage deviation from baseline.
 * Returns MAX_DEVIATION_WHEN_ZERO_BASELINE when baseline is zero to avoid division by zero.
 *
 * @param current - Current metric value
 * @param baseline - Baseline value for comparison
 * @returns Percentage deviation from baseline
 */
export const calculateDeviation = (current: number, baseline: number): number => {
  const { PERCENTAGE_MULTIPLIER, MAX_DEVIATION_WHEN_ZERO_BASELINE } = DRIFT_DETECTION_THRESHOLDS;

  if (baseline === 0) {
    return current === 0 ? 0 : MAX_DEVIATION_WHEN_ZERO_BASELINE;
  }
  return ((current - baseline) / baseline) * PERCENTAGE_MULTIPLIER;
};

/**
 * Determines direction of change based on deviation percentage.
 *
 * @param deviation - Deviation percentage
 * @returns Direction of change: "increase", "decrease", or "stable"
 */
export const getDirection = (deviation: number): "increase" | "decrease" | "stable" => {
  const { STABLE_DIRECTION_THRESHOLD } = METRICS_HISTORY_DEFAULTS;

  if (deviation > STABLE_DIRECTION_THRESHOLD) {
    return "increase";
  }
  if (deviation < -STABLE_DIRECTION_THRESHOLD) {
    return "decrease";
  }
  return "stable";
};

// ==================== Helper Functions ====================

/**
 * Creates initial counts object with all metric types set to zero.
 *
 * @returns Record with all metric types initialized to 0
 */
export const createInitialCounts = (): Record<RAGMetricType, number> =>
  Object.values(RAG_METRIC_TYPES).reduce(
    (accumulator, metricType) => ({ ...accumulator, [metricType]: 0 }),
    {} as Record<RAGMetricType, number>
  );

/**
 * Creates a drift result for insufficient data scenario.
 *
 * @param metricType - Type of metric being analyzed
 * @param currentValue - Current value being compared
 * @param baseline - Optional baseline (may be null if no data)
 * @returns DriftDetectionResult indicating no drift due to insufficient data
 */
export const createInsufficientDataResult = (
  metricType: RAGMetricType,
  currentValue: number,
  baseline: MetricBaseline | null
): DriftDetectionResult => ({
  metricType,
  currentValue,
  baselineValue: baseline?.baselineValue ?? currentValue,
  deviationPercent: 0,
  isAnomaly: false,
  direction: "stable",
});

// ==================== Row Mappers ====================

/**
 * Maps database row to RAGMetricHistory domain object.
 *
 * @param row - Database row from rag_metrics_history table
 * @returns Domain object with camelCase properties
 */
export const mapRowToMetric = (row: MetricsHistoryRow): RAGMetricHistory => ({
  id: row.id,
  tenantId: row.tenant_id ?? undefined,
  metricType: row.metric_type as RAGMetricType,
  metricValue: parseFloat(row.metric_value),
  sampleSize: row.sample_size,
  metadata: row.metadata ?? undefined,
  recordedAt: row.recorded_at,
  createdAt: row.created_at,
});

/**
 * Maps baseline row to MetricBaseline domain object.
 *
 * @param row - Database row from baseline query
 * @param radix - Parse integer radix (default 10)
 * @returns MetricBaseline domain object
 */
export const mapRowToBaseline = (row: BaselineRow, radix: number): MetricBaseline => ({
  metricType: row.metric_type as RAGMetricType,
  baselineValue: parseFloat(row.avg_value),
  stdDev: parseFloat(row.std_dev ?? "0"),
  sampleCount: parseInt(row.sample_count, radix),
});

/**
 * Maps trend row to TrendDataPoint domain object.
 *
 * @param row - Database row from trend query
 * @returns TrendDataPoint domain object
 */
export const mapRowToTrendPoint = (row: TrendRow): TrendDataPoint => ({
  day: row.day,
  avgValue: parseFloat(row.avg_value),
});

/**
 * Maps count rows to a record of metric type to count.
 *
 * @param rows - Database rows from count query
 * @param initialCounts - Initial counts object with all metric types set to 0
 * @param radix - Parse integer radix
 * @returns Record mapping metric types to their counts
 */
export const mapRowsToCounts = (
  rows: readonly CountRow[],
  initialCounts: Record<RAGMetricType, number>,
  radix: number
): Record<RAGMetricType, number> =>
  rows.reduce(
    (accumulator, row) => ({
      ...accumulator,
      [row.metric_type]: parseInt(row.count, radix),
    }),
    initialCounts
  );
