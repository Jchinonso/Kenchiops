/**
 * Reliability Metrics Module
 *
 * Tenant-scoped read-only aggregation over incidents, triage results, and
 * analyses for the metrics dashboard.
 *
 * @module database/metrics
 */

// Types
export type {
  ReliabilityMetricsSummary,
  SeverityCount,
  MttrTrendPoint,
  TimeSavedEstimate,
  ReliabilityMetrics,
} from "./types.js";

// Repository operations
export { getReliabilityMetricsSummary, getSeverityBreakdown, getMttrTrend } from "./repository.js";
