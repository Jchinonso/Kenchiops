/**
 * RAG Metrics History Repository
 *
 * Database operations for storing and analyzing RAG performance metrics.
 * Supports drift detection through baseline comparisons and trend analysis.
 *
 * @module database/metricsHistoryRepository
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import {
  DRIFT_DETECTION_THRESHOLDS,
  RAG_METRIC_TYPES,
  type RAGMetricType,
} from "../constants/index.js";

const logger = createLogger("metrics-history-repository");

// ==================== Types ====================

/**
 * Database row for RAG metrics history.
 */
interface MetricsHistoryRow {
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

// ==================== SQL Queries ====================

const METRICS_QUERIES = {
  INSERT: `
    INSERT INTO rag_metrics_history (
      id, tenant_id, metric_type, metric_value, sample_size, metadata, recorded_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING *
  `,

  GET_RECENT: `
    SELECT * FROM rag_metrics_history
    WHERE metric_type = $1
      AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
    ORDER BY recorded_at DESC
    LIMIT $3
  `,

  GET_BASELINE: `
    SELECT
      metric_type,
      AVG(metric_value::numeric) as avg_value,
      STDDEV(metric_value::numeric) as std_dev,
      COUNT(*) as sample_count
    FROM rag_metrics_history
    WHERE metric_type = $1
      AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
      AND recorded_at >= NOW() - ($3 || ' days')::INTERVAL
    GROUP BY metric_type
  `,

  GET_ALL_BASELINES: `
    SELECT
      metric_type,
      AVG(metric_value::numeric) as avg_value,
      STDDEV(metric_value::numeric) as std_dev,
      COUNT(*) as sample_count
    FROM rag_metrics_history
    WHERE (tenant_id = $1 OR ($1 IS NULL AND tenant_id IS NULL))
      AND recorded_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY metric_type
  `,

  GET_TREND: `
    SELECT
      DATE_TRUNC('day', recorded_at) as day,
      AVG(metric_value::numeric) as avg_value
    FROM rag_metrics_history
    WHERE metric_type = $1
      AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
      AND recorded_at >= NOW() - ($3 || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', recorded_at)
    ORDER BY day ASC
  `,

  DELETE_OLD: `
    DELETE FROM rag_metrics_history
    WHERE recorded_at < NOW() - ($1 || ' days')::INTERVAL
  `,

  COUNT_BY_TYPE: `
    SELECT metric_type, COUNT(*) as count
    FROM rag_metrics_history
    WHERE (tenant_id = $1 OR ($1 IS NULL AND tenant_id IS NULL))
    GROUP BY metric_type
  `,
} as const;

// ==================== Mappers ====================

/**
 * Maps database row to RAGMetricHistory.
 */
const mapRowToMetric = (row: MetricsHistoryRow): RAGMetricHistory => ({
  id: row.id,
  tenantId: row.tenant_id ?? undefined,
  metricType: row.metric_type as RAGMetricType,
  metricValue: parseFloat(row.metric_value),
  sampleSize: row.sample_size,
  metadata: row.metadata ?? undefined,
  recordedAt: row.recorded_at,
  createdAt: row.created_at,
});

// ==================== Deviation Calculation ====================

/**
 * Calculates percentage deviation from baseline.
 * Returns MAX_DEVIATION_WHEN_ZERO_BASELINE when baseline is zero to avoid division by zero.
 */
const calculateDeviation = (current: number, baseline: number): number => {
  const { PERCENTAGE_MULTIPLIER, MAX_DEVIATION_WHEN_ZERO_BASELINE } = DRIFT_DETECTION_THRESHOLDS;

  if (baseline === 0) {
    return current === 0 ? 0 : MAX_DEVIATION_WHEN_ZERO_BASELINE;
  }
  return ((current - baseline) / baseline) * PERCENTAGE_MULTIPLIER;
};

/**
 * Determines direction of change.
 */
const getDirection = (deviation: number): "increase" | "decrease" | "stable" => {
  if (deviation > 1) {
    return "increase";
  }
  if (deviation < -1) {
    return "decrease";
  }
  return "stable";
};

// ==================== Public API ====================

/**
 * Records a metric value.
 */
export const recordMetric = async (input: RecordMetricInput): Promise<RAGMetricHistory> => {
  const id = generateEventId();

  const result = await query<MetricsHistoryRow>(METRICS_QUERIES.INSERT, [
    id,
    input.tenantId ?? null,
    input.metricType,
    input.metricValue.toString(),
    input.sampleSize ?? 1,
    input.metadata ? JSON.stringify(input.metadata) : null,
  ]);

  logger.debug("Recorded RAG metric", {
    metricType: input.metricType,
    value: input.metricValue,
  });

  return mapRowToMetric(result.rows[0]);
};

/**
 * Gets recent metrics of a specific type.
 */
export const getRecentMetrics = async (
  metricType: RAGMetricType,
  tenantId?: string,
  limit: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<readonly RAGMetricHistory[]> => {
  const result = await query<MetricsHistoryRow>(METRICS_QUERIES.GET_RECENT, [
    metricType,
    tenantId ?? null,
    limit,
  ]);
  return Object.freeze(result.rows.map(mapRowToMetric));
};

/**
 * Gets baseline metrics for a specific metric type.
 */
export const getMetricBaseline = async (
  metricType: RAGMetricType,
  tenantId?: string,
  windowDays: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<MetricBaseline | null> => {
  const result = await query<{
    metric_type: string;
    avg_value: string;
    std_dev: string | null;
    sample_count: string;
  }>(METRICS_QUERIES.GET_BASELINE, [metricType, tenantId ?? null, windowDays]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    metricType: row.metric_type as RAGMetricType,
    baselineValue: parseFloat(row.avg_value),
    stdDev: parseFloat(row.std_dev ?? "0"),
    sampleCount: parseInt(row.sample_count, 10),
  };
};

/**
 * Gets all baselines for a tenant.
 */
export const getAllBaselines = async (
  tenantId?: string,
  windowDays: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<readonly MetricBaseline[]> => {
  const result = await query<{
    metric_type: string;
    avg_value: string;
    std_dev: string | null;
    sample_count: string;
  }>(METRICS_QUERIES.GET_ALL_BASELINES, [tenantId ?? null, windowDays]);

  return Object.freeze(
    result.rows.map((row) => ({
      metricType: row.metric_type as RAGMetricType,
      baselineValue: parseFloat(row.avg_value),
      stdDev: parseFloat(row.std_dev ?? "0"),
      sampleCount: parseInt(row.sample_count, 10),
    }))
  );
};

/**
 * Detects drift by comparing current value to baseline.
 */
export const detectDrift = async (
  metricType: RAGMetricType,
  currentValue: number,
  tenantId?: string
): Promise<DriftDetectionResult> => {
  const baseline = await getMetricBaseline(metricType, tenantId);

  if (!baseline || baseline.sampleCount < DRIFT_DETECTION_THRESHOLDS.MIN_SAMPLE_SIZE) {
    // Insufficient data for drift detection
    return {
      metricType,
      currentValue,
      baselineValue: baseline?.baselineValue ?? currentValue,
      deviationPercent: 0,
      isAnomaly: false,
      direction: "stable",
    };
  }

  const deviation = calculateDeviation(currentValue, baseline.baselineValue);
  const stdDevThreshold = DRIFT_DETECTION_THRESHOLDS.ANOMALY_STDDEV_THRESHOLD * baseline.stdDev;
  const isAnomaly = Math.abs(currentValue - baseline.baselineValue) > stdDevThreshold;

  return {
    metricType,
    currentValue,
    baselineValue: baseline.baselineValue,
    deviationPercent: deviation,
    isAnomaly,
    direction: getDirection(deviation),
  };
};

/**
 * Gets metric trend data for analysis.
 */
export const getMetricTrend = async (
  metricType: RAGMetricType,
  tenantId?: string,
  windowDays: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<ReadonlyArray<{ day: string; avgValue: number }>> => {
  const result = await query<{ day: string; avg_value: string }>(METRICS_QUERIES.GET_TREND, [
    metricType,
    tenantId ?? null,
    windowDays,
  ]);

  return Object.freeze(
    result.rows.map((row) => ({
      day: row.day,
      avgValue: parseFloat(row.avg_value),
    }))
  );
};

/**
 * Cleans up old metrics data.
 */
export const cleanupOldMetrics = async (retentionDays: number = 90): Promise<number> => {
  const result = await query(METRICS_QUERIES.DELETE_OLD, [retentionDays]);
  logger.info("Cleaned up old metrics", { deleted: result.rowCount });
  return result.rowCount;
};

/**
 * Gets metric counts by type.
 */
export const getMetricCounts = async (
  tenantId?: string
): Promise<Record<RAGMetricType, number>> => {
  const result = await query<{ metric_type: string; count: string }>(
    METRICS_QUERIES.COUNT_BY_TYPE,
    [tenantId ?? null]
  );

  const counts = Object.values(RAG_METRIC_TYPES).reduce(
    (acc, metricType) => ({ ...acc, [metricType]: 0 }),
    {} as Record<RAGMetricType, number>
  );

  result.rows.forEach((row) => {
    counts[row.metric_type as RAGMetricType] = parseInt(row.count, 10);
  });

  return counts;
};
