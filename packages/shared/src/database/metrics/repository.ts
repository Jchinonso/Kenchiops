/**
 * Reliability Metrics Repository
 *
 * Tenant-scoped aggregation queries over incident_alerts, incident_triage_results,
 * and analyses. Read-only; returns domain objects (never raw rows).
 *
 * @module database/metrics/repository
 */

import { query, createLogger, getErrorMessage, ValidationError } from "../common.js";
import { mapSeverityRow, mapSummaryRow, mapTrendRow } from "./helpers.js";
import type {
  MttrTrendPoint,
  MttrTrendRow,
  ReliabilityMetricsSummary,
  ReliabilityMetricsSummaryRow,
  SeverityCount,
  SeverityCountRow,
} from "./types.js";

const logger = createLogger("metrics-repository");

/** Default lookback window (days) for the MTTR trend. */
const DEFAULT_TREND_DAYS = 30;

const SUMMARY_QUERY = `
  WITH triaged AS (
    SELECT
      EXTRACT(EPOCH FROM (tr.updated_at - a.received_at)) AS ttt_seconds,
      tr.pipeline_duration_ms,
      tr.confidence,
      tr.summary_source
    FROM incident_alerts a
    JOIN incident_triage_results tr ON tr.alert_id = a.id
    WHERE a.tenant_id = $1
  )
  SELECT
    (SELECT count(*) FROM incident_alerts WHERE tenant_id = $1) AS incidents_total,
    (SELECT count(*) FROM analyses WHERE tenant_id = $1) AS analyses_total,
    count(*) AS incidents_triaged,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ttt_seconds) AS median_ttt_seconds,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ttt_seconds) AS p90_ttt_seconds,
    avg(pipeline_duration_ms) AS avg_pipeline_ms,
    avg(confidence) AS avg_confidence,
    count(*) FILTER (WHERE summary_source = 'ai') AS ai_count,
    count(*) FILTER (WHERE summary_source IN ('ai', 'fallback')) AS summarized_count
  FROM triaged
`;

const SEVERITY_QUERY = `
  SELECT severity_label, count(*) AS count
  FROM incident_triage_results
  WHERE tenant_id = $1 AND severity_label IS NOT NULL
  GROUP BY severity_label
  ORDER BY count DESC
`;

const TREND_QUERY = `
  SELECT
    to_char(date_trunc('day', a.received_at), 'YYYY-MM-DD') AS day,
    count(*) AS triaged_count,
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (tr.updated_at - a.received_at))
    ) AS median_ttt_seconds
  FROM incident_alerts a
  JOIN incident_triage_results tr ON tr.alert_id = a.id
  WHERE a.tenant_id = $1
    AND a.received_at >= now() - make_interval(days => $2)
  GROUP BY day
  ORDER BY day ASC
`;

const assertTenantId = (tenantId: string): void => {
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new ValidationError("tenantId is required", { operation: "getReliabilityMetrics" });
  }
};

/**
 * Aggregate reliability summary metrics for a tenant.
 *
 * @param tenantId - Tenant to scope all aggregates to
 * @returns Summary counts, MTTR percentiles, AI success rate, confidence
 */
export const getReliabilityMetricsSummary = async (
  tenantId: string
): Promise<ReliabilityMetricsSummary> => {
  assertTenantId(tenantId);
  try {
    const result = await query<ReliabilityMetricsSummaryRow>(SUMMARY_QUERY, [tenantId]);
    return mapSummaryRow(result.rows[0] as ReliabilityMetricsSummaryRow);
  } catch (error) {
    logger.error("Failed to aggregate reliability summary", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Count triaged incidents by severity label for a tenant.
 *
 * @param tenantId - Tenant to scope to
 * @returns Severity → count, descending
 */
export const getSeverityBreakdown = async (tenantId: string): Promise<readonly SeverityCount[]> => {
  assertTenantId(tenantId);
  try {
    const result = await query<SeverityCountRow>(SEVERITY_QUERY, [tenantId]);
    return result.rows.map(mapSeverityRow);
  } catch (error) {
    logger.error("Failed to aggregate severity breakdown", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Daily triage volume + median time-to-triage over a lookback window.
 *
 * @param tenantId - Tenant to scope to
 * @param days - Lookback window in days (default 30)
 * @returns One point per day that had triaged incidents, ascending by date
 */
export const getMttrTrend = async (
  tenantId: string,
  days: number = DEFAULT_TREND_DAYS
): Promise<readonly MttrTrendPoint[]> => {
  assertTenantId(tenantId);
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_TREND_DAYS;
  try {
    const result = await query<MttrTrendRow>(TREND_QUERY, [tenantId, safeDays]);
    return result.rows.map(mapTrendRow);
  } catch (error) {
    logger.error("Failed to aggregate MTTR trend", {
      tenantId,
      days: safeDays,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
