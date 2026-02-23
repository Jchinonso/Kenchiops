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
