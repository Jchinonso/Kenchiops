/**
 * Dashboard Service Types
 *
 * @module services/dashboardServiceTypes
 */

export interface TenantInfo {
  readonly id: string;
  readonly githubOrg: string;
  readonly githubConnected: boolean;
  readonly slackConnected: boolean;
  readonly status: string;
}

export interface DashboardStats {
  readonly totalAnalyses: number;
  readonly totalFailures: number;
  readonly connectedRepos: number;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
