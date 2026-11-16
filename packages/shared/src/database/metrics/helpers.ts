/**
 * Reliability Metrics Helpers
 *
 * Pure row mappers that coerce Postgres numeric/bigint strings into numbers,
 * preserving null for "no data" so the UI can distinguish zero from absent.
 *
 * @module database/metrics/helpers
 */

import type {
  MttrTrendPoint,
  MttrTrendRow,
  ReliabilityMetricsSummary,
  ReliabilityMetricsSummaryRow,
  SeverityCount,
  SeverityCountRow,
} from "./types.js";

/** Coerce a pg numeric/bigint value to a number, or 0 when null/invalid. */
export const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Coerce a pg numeric value to a number, preserving null for "no data". */
export const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Round a nullable number to the given decimal places. */
export const roundNullable = (value: number | null, decimals: number): number | null => {
  if (value === null) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Map the summary aggregation row to the domain summary. */
export const mapSummaryRow = (row: ReliabilityMetricsSummaryRow): ReliabilityMetricsSummary => {
  const aiCount = toNumber(row.ai_count);
  const summarizedCount = toNumber(row.summarized_count);
  return {
    incidentsTotal: toNumber(row.incidents_total),
    incidentsTriaged: toNumber(row.incidents_triaged),
    medianTimeToTriageSeconds: roundNullable(toNullableNumber(row.median_ttt_seconds), 1),
    p90TimeToTriageSeconds: roundNullable(toNullableNumber(row.p90_ttt_seconds), 1),
    avgPipelineDurationMs: roundNullable(toNullableNumber(row.avg_pipeline_ms), 0),
    aiSuccessRate: summarizedCount > 0 ? roundNullable(aiCount / summarizedCount, 4) : null,
    avgConfidence: roundNullable(toNullableNumber(row.avg_confidence), 4),
    analysesTotal: toNumber(row.analyses_total),
  };
};

/** Map a severity count row to the domain shape. */
export const mapSeverityRow = (row: SeverityCountRow): SeverityCount => ({
  severity: row.severity_label ?? "unknown",
  count: toNumber(row.count),
});

/** Map a daily trend row to the domain point. */
export const mapTrendRow = (row: MttrTrendRow): MttrTrendPoint => ({
  date: row.day,
  triagedCount: toNumber(row.triaged_count),
  medianTimeToTriageSeconds: roundNullable(toNullableNumber(row.median_ttt_seconds), 1),
});
