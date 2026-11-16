/**
 * Metrics Service
 *
 * Composes tenant-scoped reliability metrics for the dashboard: incident MTTR,
 * AI success rate, severity mix, a daily trend, and a derived "time saved"
 * estimate. Read-only orchestration over shared aggregation repositories.
 *
 * @module services/metricsService
 */

import {
  createLogger,
  getReliabilityMetricsSummary,
  getSeverityBreakdown,
  getMttrTrend,
  type RequestContext,
  type ReliabilityMetrics,
  type TimeSavedEstimate,
} from "@kenchi/shared";

/**
 * Assumed minutes a human spends manually triaging one incident (reading the
 * alert, checking dashboards, identifying owner). Used only for the clearly
 * labelled "estimated time saved" figure — it is an assumption, not a
 * measurement. Tune to match your team's reality before quoting it.
 */
const ASSUMED_MANUAL_TRIAGE_MINUTES = 25;

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

const logger = createLogger("metrics-service");

/**
 * Derive an estimated time-saved figure from triage volume and measured MTTR.
 * Credits the gap between the manual baseline and Kenchi's median time, floored
 * at zero so a slow pipeline never shows "negative savings".
 */
const computeTimeSaved = (
  incidentsTriaged: number,
  medianTimeToTriageSeconds: number | null
): TimeSavedEstimate => {
  const kenchiMedianMinutes =
    medianTimeToTriageSeconds === null
      ? null
      : Math.round((medianTimeToTriageSeconds / SECONDS_PER_MINUTE) * 100) / 100;

  const perIncidentSavedMinutes = Math.max(
    0,
    ASSUMED_MANUAL_TRIAGE_MINUTES - (kenchiMedianMinutes ?? ASSUMED_MANUAL_TRIAGE_MINUTES)
  );

  const estimatedHoursSaved =
    Math.round(((incidentsTriaged * perIncidentSavedMinutes) / MINUTES_PER_HOUR) * 10) / 10;

  return {
    assumedManualMinutesPerIncident: ASSUMED_MANUAL_TRIAGE_MINUTES,
    kenchiMedianMinutesPerIncident: kenchiMedianMinutes,
    estimatedHoursSaved,
  };
};

export interface MetricsService {
  readonly getReliabilityMetrics: (
    tenantId: string,
    trendDays: number,
    context: RequestContext
  ) => Promise<ReliabilityMetrics>;
}

/**
 * Create the metrics service.
 */
export const createMetricsService = (): MetricsService => ({
  getReliabilityMetrics: async (tenantId, trendDays, context): Promise<ReliabilityMetrics> => {
    const [summary, severityBreakdown, mttrTrend] = await Promise.all([
      getReliabilityMetricsSummary(tenantId),
      getSeverityBreakdown(tenantId),
      getMttrTrend(tenantId, trendDays),
    ]);

    const timeSaved = computeTimeSaved(summary.incidentsTriaged, summary.medianTimeToTriageSeconds);

    logger.info("Reliability metrics computed", {
      incidentsTotal: summary.incidentsTotal,
      incidentsTriaged: summary.incidentsTriaged,
      trendPoints: mttrTrend.length,
      ...context,
    });

    return {
      summary,
      severityBreakdown,
      mttrTrend,
      timeSaved,
      generatedAt: new Date().toISOString(),
    };
  },
});
