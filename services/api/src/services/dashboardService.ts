/**
 * Dashboard Service
 *
 * Business logic for the CI/CD dashboard endpoints.
 * Orchestrates tenant lookup, GitHub API calls, and database queries.
 *
 * @module services/dashboardService
 */

import type {
  RequestContext,
  AnalysisRecord,
  AnalysisCountByRepo,
  EventRecord,
  WebhookActivityRecord,
  ConfidenceTrendPoint,
} from "@kenchi/shared";
import type {
  GitHubInstallationPort,
  InstallationRepository,
} from "../ports/githubInstallationPort.js";
import type { GitLabProjectsPort, GitLabProject } from "../ports/gitlabProjectsPort.js";
import type {
  TenantInfo,
  DashboardStats,
  PaginatedResult,
  CorrelationResult,
  AnalysesFilterOptions,
  FailuresFilterOptions,
} from "./dashboardServiceTypes.js";
import {
  getTenantInfoFn,
  getDashboardStatsFn,
  getRepositoriesFn,
  getAnalysesFn,
  getAnalysesFilteredFn,
  getFailuresFilteredFn,
  getAnalysisDetailFn,
  getFailuresFn,
  getAnalysisStatusByEventsFn,
  getConfidenceDistributionStatsFn,
  getWebhookActivityFn,
  getConfidenceTrendDataFn,
  getAnalysisCountsByRepoFn,
  getCorrelationsFn,
  getGitLabProjectsFn,
} from "./dashboardServiceHelpers.js";

// ==================== Service Interface ====================

interface DashboardService {
  readonly getTenantInfo: (
    tenantId: string,
    userId: string | undefined,
    context: RequestContext
  ) => Promise<TenantInfo>;
  readonly getDashboardStats: (
    tenantId: string,
    userId: string | undefined,
    source: string | null,
    context: RequestContext
  ) => Promise<DashboardStats>;
  readonly getRepositories: (
    tenantId: string,
    context: RequestContext
  ) => Promise<readonly InstallationRepository[]>;
  readonly getAnalyses: (
    tenantId: string,
    limit: number,
    offset: number,
    context: RequestContext
  ) => Promise<PaginatedResult<AnalysisRecord>>;
  readonly getAnalysesFiltered: (
    options: AnalysesFilterOptions,
    context: RequestContext
  ) => Promise<PaginatedResult<AnalysisRecord>>;
  readonly getFailuresFiltered: (
    options: FailuresFilterOptions,
    context: RequestContext
  ) => Promise<PaginatedResult<EventRecord>>;
  readonly getAnalysisDetail: (
    tenantId: string,
    analysisId: string,
    context: RequestContext
  ) => Promise<AnalysisRecord>;
  readonly getFailures: (
    tenantId: string,
    limit: number,
    offset: number,
    context: RequestContext
  ) => Promise<PaginatedResult<EventRecord>>;
  readonly getAnalysisStatusByEvents: (
    tenantId: string,
    eventIds: readonly string[],
    context: RequestContext
  ) => Promise<ReadonlyMap<string, { readonly analysisId: string; readonly confidence: number }>>;
  readonly getConfidenceDistributionStats: (
    tenantId: string,
    context: RequestContext
  ) => Promise<ReadonlyArray<{ readonly level: string; readonly count: number }>>;
  readonly getWebhookActivity: (
    tenantId: string,
    source: string | null,
    status: string | null,
    limit: number,
    offset: number,
    context: RequestContext
  ) => Promise<PaginatedResult<WebhookActivityRecord>>;
  readonly getConfidenceTrendData: (
    tenantId: string,
    bucket: "day" | "week",
    since: string,
    context: RequestContext
  ) => Promise<readonly ConfidenceTrendPoint[]>;
  readonly getAnalysisCountsByRepo: (
    tenantId: string,
    context: RequestContext
  ) => Promise<readonly AnalysisCountByRepo[]>;
  readonly getCorrelations: (
    tenantId: string,
    commitSha: string,
    context: RequestContext
  ) => Promise<CorrelationResult>;
  readonly getGitLabProjects: (
    userId: string,
    context: RequestContext
  ) => Promise<readonly GitLabProject[]>;
}

// ==================== Service Factory ====================

/**
 * Creates the dashboard service with injected dependencies.
 */
export const createDashboardService = (
  githubAdapter: GitHubInstallationPort,
  gitlabProjectsPort: GitLabProjectsPort
): DashboardService => ({
  getTenantInfo: getTenantInfoFn,

  getDashboardStats: (
    tenantId: string,
    userId: string | undefined,
    source: string | null,
    context: RequestContext
  ): Promise<DashboardStats> =>
    getDashboardStatsFn(tenantId, userId, source, githubAdapter, gitlabProjectsPort, context),

  getRepositories: (
    tenantId: string,
    context: RequestContext
  ): Promise<readonly InstallationRepository[]> =>
    getRepositoriesFn(tenantId, githubAdapter, context),

  getAnalyses: getAnalysesFn,

  getAnalysesFiltered: getAnalysesFilteredFn,
  getFailuresFiltered: getFailuresFilteredFn,

  getAnalysisDetail: getAnalysisDetailFn,
  getFailures: getFailuresFn,
  getAnalysisStatusByEvents: getAnalysisStatusByEventsFn,
  getConfidenceDistributionStats: getConfidenceDistributionStatsFn,
  getWebhookActivity: getWebhookActivityFn,
  getConfidenceTrendData: getConfidenceTrendDataFn,
  getAnalysisCountsByRepo: getAnalysisCountsByRepoFn,
  getCorrelations: getCorrelationsFn,

  getGitLabProjects: (userId: string, context: RequestContext): Promise<readonly GitLabProject[]> =>
    getGitLabProjectsFn(userId, gitlabProjectsPort, context),
});
