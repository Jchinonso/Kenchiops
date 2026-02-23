/**
 * Dashboard Service Types
 *
 * @module services/dashboardServiceTypes
 */

export interface TenantInfo {
  readonly id: string;
  readonly orgName: string;
  readonly githubConnected: boolean;
  readonly gitlabConnected: boolean;
  readonly slackConnected: boolean;
  readonly status: string;
}

export interface DashboardStats {
  readonly totalAnalyses: number;
  readonly totalFailures: number;
  readonly connectedRepos: number;
  readonly gitlabProjectCount: number;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface CorrelationSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

export interface CorrelationResult {
  readonly commitSha: string;
  readonly analyses: readonly CorrelationSummary[];
  readonly incidents: readonly CorrelationSummary[];
}

/** Options for filtered analysis queries (replaces long parameter lists). */
export interface AnalysesFilterOptions {
  readonly tenantId: string;
  readonly repository: string | null;
  readonly minConfidence: number | null;
  readonly maxConfidence: number | null;
  readonly since: string | null;
  readonly until: string | null;
  readonly limit: number;
  readonly offset: number;
  readonly source: string | null;
}

/** Options for filtered failure queries (replaces long parameter lists). */
export interface FailuresFilterOptions {
  readonly tenantId: string;
  readonly repository: string | null;
  readonly severity: string | null;
  readonly since: string | null;
  readonly until: string | null;
  readonly limit: number;
  readonly offset: number;
  readonly source: string | null;
}
