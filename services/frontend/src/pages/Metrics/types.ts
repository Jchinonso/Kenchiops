/**
 * Types for the reliability metrics dashboard page.
 * Mirrors the API `/api/v1/metrics` response shape.
 */

export interface ReliabilityMetricsSummary {
  readonly incidentsTotal: number;
  readonly incidentsTriaged: number;
  readonly medianTimeToTriageSeconds: number | null;
  readonly p90TimeToTriageSeconds: number | null;
  readonly avgPipelineDurationMs: number | null;
  readonly aiSuccessRate: number | null;
  readonly avgConfidence: number | null;
  readonly analysesTotal: number;
}

export interface SeverityCount {
  readonly severity: string;
  readonly count: number;
}

export interface MttrTrendPoint {
  readonly date: string;
  readonly triagedCount: number;
  readonly medianTimeToTriageSeconds: number | null;
}

export interface TimeSavedEstimate {
  readonly assumedManualMinutesPerIncident: number;
  readonly kenchiMedianMinutesPerIncident: number | null;
  readonly estimatedHoursSaved: number;
}

export interface ReliabilityMetrics {
  readonly summary: ReliabilityMetricsSummary;
  readonly severityBreakdown: ReadonlyArray<SeverityCount>;
  readonly mttrTrend: ReadonlyArray<MttrTrendPoint>;
  readonly timeSaved: TimeSavedEstimate;
  readonly generatedAt: string;
}
