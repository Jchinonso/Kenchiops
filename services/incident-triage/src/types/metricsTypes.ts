/**
 * Metrics Service Type Definitions
 *
 * Types for triage pipeline metrics and observability.
 *
 * @module types/metricsTypes
 */

import type { SeverityDistributionEntry } from "@kenchi/shared";

/**
 * Pipeline metrics response DTO for the stats endpoint.
 */
export interface PipelineMetricsResponse {
  readonly severityDistribution: readonly SeverityDistributionEntry[];
  readonly pipeline: {
    readonly totalTriaged: number;
    readonly avgDurationMs: number | null;
    readonly p50DurationMs: number | null;
    readonly p95DurationMs: number | null;
  };
  readonly summarySource: {
    readonly aiCount: number;
    readonly fallbackCount: number;
    readonly aiRate: number | null;
  };
  readonly dispatch: {
    readonly dispatchedCount: number;
    readonly routedCount: number;
    readonly dispatchRate: number | null;
  };
  readonly dedup: {
    readonly totalAlerts: number;
    readonly dedupedCount: number;
    readonly dedupRate: number | null;
  };
}
