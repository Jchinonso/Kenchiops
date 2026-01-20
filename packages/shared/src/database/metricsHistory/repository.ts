/**
 * RAG Metrics History Repository
 *
 * Database operations for storing and analyzing RAG performance metrics.
 * Supports drift detection through baseline comparisons and trend analysis.
 *
 * Security: All queries use parameterized statements to prevent SQL injection.
 * Input validation ensures only valid data types and ranges are accepted.
 *
 * @module database/metricsHistory/repository
 */

import {
  query,
  createLogger,
  getErrorMessage,
  generateEventId,
  DRIFT_DETECTION_THRESHOLDS,
  PARSE_INT_RADIX,
  METRICS_HISTORY_DEFAULTS,
  METRICS_HISTORY_QUERIES,
  type RAGMetricType,
} from "../common.js";
import type {
  MetricsHistoryRow,
  BaselineRow,
  TrendRow,
  CountRow,
  RAGMetricHistory,
  RecordMetricInput,
  MetricBaseline,
  DriftDetectionResult,
  TrendDataPoint,
} from "./types.js";
import {
  mapRowToMetric,
  mapRowToBaseline,
  mapRowToTrendPoint,
  mapRowsToCounts,
  validateRecordMetricInput,
  validateMetricType,
  validatePositiveInteger,
  validateFiniteNumber,
  calculateDeviation,
  getDirection,
  createInitialCounts,
  createInsufficientDataResult,
} from "./helpers.js";

const logger = createLogger("metrics-history-repository");

// ==================== Public API ====================

/**
 * Records a metric value in the database.
 *
 * @param input - Metric data to record
 * @returns The created metric history record
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const recordMetric = async (input: RecordMetricInput): Promise<RAGMetricHistory> => {
  validateRecordMetricInput(input);

  const id = generateEventId();

  try {
    const result = await query<MetricsHistoryRow>(METRICS_HISTORY_QUERIES.INSERT, [
      id,
      input.tenantId ?? null,
      input.metricType,
      input.metricValue.toString(),
      input.sampleSize ?? METRICS_HISTORY_DEFAULTS.DEFAULT_SAMPLE_SIZE,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]);

    logger.debug("Recorded RAG metric", {
      metricType: input.metricType,
      value: input.metricValue,
    });

    return mapRowToMetric(result.rows[0]);
  } catch (error) {
    logger.error("Failed to record RAG metric", {
      metricType: input.metricType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets recent metrics of a specific type.
 *
 * @param metricType - Type of metric to retrieve
 * @param tenantId - Optional tenant ID filter
 * @param limit - Maximum number of records to return
 * @returns Array of metric history records
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const getRecentMetrics = async (
  metricType: RAGMetricType,
  tenantId?: string,
  limit: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<readonly RAGMetricHistory[]> => {
  validateMetricType(metricType);
  validatePositiveInteger(limit, "limit");

  try {
    const result = await query<MetricsHistoryRow>(METRICS_HISTORY_QUERIES.GET_RECENT, [
      metricType,
      tenantId ?? null,
      limit,
    ]);

    return Object.freeze(result.rows.map(mapRowToMetric));
  } catch (error) {
    logger.error("Failed to get recent metrics", {
      metricType,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets baseline metrics for a specific metric type.
 *
 * @param metricType - Type of metric to analyze
 * @param tenantId - Optional tenant ID filter
 * @param windowDays - Number of days to include in baseline calculation
 * @returns Baseline metrics or null if insufficient data
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const getMetricBaseline = async (
  metricType: RAGMetricType,
  tenantId?: string,
  windowDays: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<MetricBaseline | null> => {
  validateMetricType(metricType);
  validatePositiveInteger(windowDays, "windowDays");

  try {
    const result = await query<BaselineRow>(METRICS_HISTORY_QUERIES.GET_BASELINE, [
      metricType,
      tenantId ?? null,
      windowDays,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToBaseline(result.rows[0], PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to get metric baseline", {
      metricType,
      tenantId,
      windowDays,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets all baselines for a tenant.
 *
 * @param tenantId - Optional tenant ID filter
 * @param windowDays - Number of days to include in baseline calculation
 * @returns Array of baseline metrics for all metric types with data
 * @throws ValidationError if windowDays is invalid
 * @throws Error if database operation fails
 */
export const getAllBaselines = async (
  tenantId?: string,
  windowDays: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<readonly MetricBaseline[]> => {
  validatePositiveInteger(windowDays, "windowDays");

  try {
    const result = await query<BaselineRow>(METRICS_HISTORY_QUERIES.GET_ALL_BASELINES, [
      tenantId ?? null,
      windowDays,
    ]);

    return Object.freeze(result.rows.map((row) => mapRowToBaseline(row, PARSE_INT_RADIX)));
  } catch (error) {
    logger.error("Failed to get all baselines", {
      tenantId,
      windowDays,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Detects drift by comparing current value to baseline.
 *
 * @param metricType - Type of metric to analyze
 * @param currentValue - Current metric value to compare
 * @param tenantId - Optional tenant ID filter
 * @returns Drift detection result with deviation analysis
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const detectDrift = async (
  metricType: RAGMetricType,
  currentValue: number,
  tenantId?: string
): Promise<DriftDetectionResult> => {
  validateMetricType(metricType);
  validateFiniteNumber(currentValue, "currentValue");

  try {
    const baseline = await getMetricBaseline(metricType, tenantId);

    if (baseline === null || baseline.sampleCount < DRIFT_DETECTION_THRESHOLDS.MIN_SAMPLE_SIZE) {
      return createInsufficientDataResult(metricType, currentValue, baseline);
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
  } catch (error) {
    logger.error("Failed to detect drift", {
      metricType,
      currentValue,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets metric trend data for analysis.
 *
 * @param metricType - Type of metric to analyze
 * @param tenantId - Optional tenant ID filter
 * @param windowDays - Number of days to include in trend
 * @returns Array of trend data points with daily averages
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const getMetricTrend = async (
  metricType: RAGMetricType,
  tenantId?: string,
  windowDays: number = DRIFT_DETECTION_THRESHOLDS.TREND_WINDOW_SIZE
): Promise<readonly TrendDataPoint[]> => {
  validateMetricType(metricType);
  validatePositiveInteger(windowDays, "windowDays");

  try {
    const result = await query<TrendRow>(METRICS_HISTORY_QUERIES.GET_TREND, [
      metricType,
      tenantId ?? null,
      windowDays,
    ]);

    return Object.freeze(result.rows.map(mapRowToTrendPoint));
  } catch (error) {
    logger.error("Failed to get metric trend", {
      metricType,
      tenantId,
      windowDays,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Cleans up old metrics data beyond retention period.
 *
 * @param retentionDays - Number of days to retain (default 90)
 * @returns Number of deleted records
 * @throws ValidationError if retentionDays is invalid
 * @throws Error if database operation fails
 */
export const cleanupOldMetrics = async (
  retentionDays: number = METRICS_HISTORY_DEFAULTS.DEFAULT_RETENTION_DAYS
): Promise<number> => {
  validatePositiveInteger(retentionDays, "retentionDays");

  try {
    const result = await query(METRICS_HISTORY_QUERIES.DELETE_OLD, [retentionDays]);

    logger.info("Cleaned up old metrics", { deleted: result.rowCount });

    return result.rowCount;
  } catch (error) {
    logger.error("Failed to cleanup old metrics", {
      retentionDays,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets metric counts by type for a tenant.
 *
 * @param tenantId - Optional tenant ID filter
 * @returns Record mapping metric types to their counts
 * @throws Error if database operation fails
 */
export const getMetricCounts = async (
  tenantId?: string
): Promise<Record<RAGMetricType, number>> => {
  try {
    const result = await query<CountRow>(METRICS_HISTORY_QUERIES.COUNT_BY_TYPE, [tenantId ?? null]);

    return mapRowsToCounts(result.rows, createInitialCounts(), PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to get metric counts", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
