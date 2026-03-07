// ==================== Domain Types ====================

export interface IncidentAlertRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly source: string;
  readonly sourceAlertId: string;
  readonly deliveryId: string;
  readonly fingerprint: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly severity: string;
  readonly status: string;
  readonly serviceName: string | null;
  readonly environment: string | null;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly labels: Readonly<Record<string, string>>;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlertWithTriageResult {
  readonly alert: IncidentAlertRecord;
  readonly triageResult: Readonly<Record<string, unknown>> | null;
}

export interface PaginatedIncidents {
  readonly items: readonly IncidentAlertRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface SeverityDistributionEntry {
  readonly severityLabel: string;
  readonly count: number;
}

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
    readonly activeAlerts: number;
  };
}

// ==================== Option Types ====================

export interface UseIncidentsOptions {
  readonly tenantId: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly severity?: string;
  readonly status?: string;
  readonly source?: string;
}

// ==================== Per-Source Stats Types ====================

export interface SourceStatsEntry {
  readonly source: string;
  readonly eventCount: number;
  readonly lastReceived: string | null;
}

export interface ActiveCountBySource {
  readonly source: string;
  readonly activeCount: number;
}

export interface SeverityBySourceEntry {
  readonly source: string;
  readonly severityLabel: string;
  readonly count: number;
}
