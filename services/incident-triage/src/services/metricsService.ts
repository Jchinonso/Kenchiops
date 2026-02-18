/**
 * Metrics Service
 *
 * Computes triage pipeline metrics by querying aggregated statistics
 * from the triage result and alert repositories.
 *
 * This is a factory function returning a service object (no classes for business logic).
 *
 * @module services/metricsService
 */

import type { TriageStats } from "@kenchi/shared";
import type { PipelineMetricsResponse } from "../types/metricsTypes.js";

// ==================== Helpers ====================

/** Safely computes a rate as a fraction (0-1), or null if denominator is zero */
const safeRate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

// ==================== Mapping ====================

/**
 * Maps raw triage stats to the pipeline metrics response DTO.
 * Pure function -- no I/O.
 */
export const mapStatsToMetrics = (stats: TriageStats): PipelineMetricsResponse => {
  const summaryTotal = stats.aiSummaryCount + stats.fallbackSummaryCount;

  return {
    severityDistribution: stats.severityDistribution,
    pipeline: {
      totalTriaged: stats.totalTriaged,
      avgDurationMs: stats.avgDurationMs,
      p50DurationMs: stats.p50DurationMs,
      p95DurationMs: stats.p95DurationMs,
    },
    summarySource: {
      aiCount: stats.aiSummaryCount,
      fallbackCount: stats.fallbackSummaryCount,
      aiRate: safeRate(stats.aiSummaryCount, summaryTotal),
    },
    dispatch: {
      dispatchedCount: stats.dispatchedCount,
      routedCount: stats.routedCount,
      dispatchRate: safeRate(stats.dispatchedCount, stats.routedCount),
    },
    dedup: {
      totalAlerts: stats.totalAlerts,
      dedupedCount: stats.dedupedCount,
      dedupRate: safeRate(stats.dedupedCount, stats.totalAlerts),
    },
  };
};
