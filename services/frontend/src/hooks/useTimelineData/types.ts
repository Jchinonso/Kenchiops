// ==================== Domain Types ====================

export interface TimelineEntry {
  readonly id: string;
  readonly type: "incident" | "ci_failure" | "analysis";
  readonly title: string;
  readonly description: string | null;
  readonly severity: string;
  readonly source: string;
  readonly status: string;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PaginatedTimeline {
  readonly items: readonly TimelineEntry[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ==================== Option Types ====================

export type TimeRange = "24h" | "7d" | "30d" | "all";

export interface UseTimelineOptions {
  readonly tenantId: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly timeRange?: TimeRange;
  readonly source?: string;
}
