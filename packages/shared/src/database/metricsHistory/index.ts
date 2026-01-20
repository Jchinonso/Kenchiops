/**
 * Metrics History Module
 *
 * Database operations for RAG metrics history and drift detection.
 *
 * @module database/metricsHistory
 */

// Types
export type {
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

// Helpers (includes row mappers and validation)
export {
  // Row mappers
  mapRowToMetric,
  mapRowToBaseline,
  mapRowToTrendPoint,
  mapRowsToCounts,
  // Validation
  validateRecordMetricInput,
  validateMetricType,
  validatePositiveInteger,
  validateFiniteNumber,
  // Deviation helpers
  calculateDeviation,
  getDirection,
  createInitialCounts,
  createInsufficientDataResult,
} from "./helpers.js";

// Repository operations
export {
  recordMetric,
  getRecentMetrics,
  getMetricBaseline,
  getAllBaselines,
  detectDrift,
  getMetricTrend,
  cleanupOldMetrics,
  getMetricCounts,
} from "./repository.js";
