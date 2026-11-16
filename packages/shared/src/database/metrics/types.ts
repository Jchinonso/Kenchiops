/**
 * Reliability Metrics Types
 *
 * Domain types for tenant-scoped reliability/MTTR metrics aggregated over
 * incident alerts and triage results.
 *
 * @module database/metrics/types
 */

/** Raw row returned by the summary aggregation query. */
export interface ReliabilityMetricsSummaryRow {
  readonly incidents_total: string | number | null;
  readonly incidents_triaged: string | number | null;
  readonly median_ttt_seconds: string | number | null;
  readonly p90_ttt_seconds: string | number | null;
  readonly avg_pipeline_ms: string | number | null;
  readonly avg_confidence: string | number | null;
  readonly ai_count: string | number | null;
  readonly summarized_count: string | number | null;
  readonly analyses_total: string | number | null;
}

/** Aggregated reliability summary for a tenant. */
export interface ReliabilityMetricsSummary {
  /** Total incident alerts ingested. */
  readonly incidentsTotal: number;
  /** Incidents that completed triage (have a triage result). */
  readonly incidentsTriaged: number;
  /** Median wall-clock seconds from alert received to triage complete (null if none). */
  readonly medianTimeToTriageSeconds: number | null;
  /** 90th-percentile time-to-triage seconds (null if none). */
  readonly p90TimeToTriageSeconds: number | null;
  /** Average triage pipeline processing time in ms (null if none). */
  readonly avgPipelineDurationMs: number | null;
  /** Share of triaged incidents whose AI summary was used (0-1, null if none). */
  readonly aiSuccessRate: number | null;
  /** Average AI confidence across triaged incidents (0-1, null if none). */
  readonly avgConfidence: number | null;
  /** Total CI/CD analyses run for the tenant. */
  readonly analysesTotal: number;
}

/** Raw row for the severity breakdown query. */
export interface SeverityCountRow {
  readonly severity_label: string | null;
  readonly count: string | number | null;
}

/** Count of triaged incidents by severity label. */
export interface SeverityCount {
  readonly severity: string;
  readonly count: number;
}

/** Raw row for the daily MTTR trend query. */
export interface MttrTrendRow {
  readonly day: string;
  readonly triaged_count: string | number | null;
  readonly median_ttt_seconds: string | number | null;
}

/** One day of triage volume + median time-to-triage. */
export interface MttrTrendPoint {
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  /** Incidents triaged that day. */
  readonly triagedCount: number;
  /** Median time-to-triage seconds that day (null if none). */
  readonly medianTimeToTriageSeconds: number | null;
}

/**
 * Estimated human time saved. This is a DERIVED ESTIMATE, not a measurement:
 * it assumes a manual-triage baseline and credits the gap between that baseline
 * and Kenchi's measured median time-to-triage, per triaged incident.
 */
export interface TimeSavedEstimate {
  /** Assumed minutes a human would spend triaging one incident manually. */
  readonly assumedManualMinutesPerIncident: number;
  /** Kenchi's measured median minutes-to-triage (null if no data). */
  readonly kenchiMedianMinutesPerIncident: number | null;
  /** Estimated total hours saved across all triaged incidents. */
  readonly estimatedHoursSaved: number;
}

/**
 * Full reliability metrics payload returned by the API metrics endpoint.
 */
export interface ReliabilityMetrics {
  readonly summary: ReliabilityMetricsSummary;
  readonly severityBreakdown: ReadonlyArray<SeverityCount>;
  readonly mttrTrend: ReadonlyArray<MttrTrendPoint>;
  readonly timeSaved: TimeSavedEstimate;
  /** ISO timestamp the metrics were computed. */
  readonly generatedAt: string;
}
