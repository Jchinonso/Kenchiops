/**
 * Dashboard Service Helpers
 *
 * Extracted implementation functions for dashboard service methods.
 * Each function is stateless and receives dependencies as arguments.
 *
 * @module services/dashboardServiceHelpers
 */

import {
  createLogger,
  NotFoundError,
  findById as findTenantById,
  findOAuthIdentitiesByUser,
  findGitHubAppConnection,
  findSlackConnection,
  getAnalysisById,
  getAnalysesByTenant,
  countAnalysesByTenant,
  getAnalysesByTenantFiltered,
  countAnalysesByTenantFiltered,
  getAnalysesByEventIds,
  getConfidenceDistribution,
  getConfidenceTrend,
  getEventsByTenant,
  countEventsByTenant,
  getEventsByTenantFiltered,
  countEventsByTenantFiltered,
  getWebhookActivitiesByTenant,
  countWebhookActivitiesByTenant,
  findAnalysesByCommitSha,
  findIncidentsByCommitSha,
  getAnalysisCountsByRepo,
  type RequestContext,
  type AnalysisRecord,
  type AnalysisCountByRepo,
  type EventRecord,
  type WebhookActivityRecord,
  type ConfidenceTrendPoint,
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
  CorrelationSummary,
  AnalysesFilterOptions,
  FailuresFilterOptions,
} from "./dashboardServiceTypes.js";

const CICD_FAILURE_TYPE = "CICD_FAILURE";
const logger = createLogger("dashboard-service");

const getTenantInfoFn = async (
  tenantId: string,
  userId: string | undefined,
  context: RequestContext
): Promise<TenantInfo> => {
  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new NotFoundError("Tenant not found", { metadata: { tenantId } });
  }

  const [ghConn, slackConn, identities] = await Promise.all([
    findGitHubAppConnection(tenantId),
    findSlackConnection(tenantId),
    userId ? findOAuthIdentitiesByUser(userId) : Promise.resolve([]),
  ]);

  const gitlabConnected = identities.some(
    (identity) => identity.provider === "gitlab" && identity.accessToken !== null
  );
  logger.info("Tenant info retrieved", { gitlabConnected, ...context });

  return {
    id: tenant.id,
    orgName: tenant.orgName,
    githubConnected: ghConn !== null,
    gitlabConnected,
    slackConnected: slackConn !== null,
    status: tenant.status,
  };
};

const getDashboardStatsFn = async (
  tenantId: string,
  userId: string | undefined,
  source: string | null,
  githubAdapter: GitHubInstallationPort,
  gitlabPort: GitLabProjectsPort,
  context: RequestContext
): Promise<DashboardStats> => {
  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new NotFoundError("Tenant not found", { metadata: { tenantId } });
  }

  const resolveGitLabProjects = async (): Promise<readonly GitLabProject[]> => {
    if (!userId) {
      return [];
    }
    const identities = await findOAuthIdentitiesByUser(userId);
    const gitlabIdentity = identities.find((identity) => identity.provider === "gitlab");
    if (!gitlabIdentity?.accessToken) {
      return [];
    }
    return gitlabPort.getProjects(gitlabIdentity.accessToken, gitlabIdentity.instanceUrl, context);
  };

  const ghConn = await findGitHubAppConnection(tenantId);
  const installationId = ghConn?.externalOrgId ? Number(ghConn.externalOrgId) : null;

  const [totalAnalyses, totalFailures, repos, gitlabProjects] = await Promise.all([
    source
      ? countAnalysesByTenantFiltered({
          tenantId,
          repository: null,
          minConfidence: null,
          maxConfidence: null,
          source,
        })
      : countAnalysesByTenant(tenantId),
    source
      ? countEventsByTenantFiltered({
          tenantId,
          type: CICD_FAILURE_TYPE,
          repository: null,
          severity: null,
          source,
        })
      : countEventsByTenant(tenantId, CICD_FAILURE_TYPE),
    installationId ? githubAdapter.getRepositories(installationId, context) : Promise.resolve([]),
    resolveGitLabProjects(),
  ]);

  logger.info("Dashboard stats retrieved", {
    totalAnalyses,
    totalFailures,
    connectedRepos: repos.length,
    gitlabProjectCount: gitlabProjects.length,
    source,
    ...context,
  });

  return {
    totalAnalyses,
    totalFailures,
    connectedRepos: repos.length,
    gitlabProjectCount: gitlabProjects.length,
  };
};

const getRepositoriesFn = async (
  tenantId: string,
  githubAdapter: GitHubInstallationPort,
  context: RequestContext
): Promise<readonly InstallationRepository[]> => {
  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new NotFoundError("Tenant not found", { metadata: { tenantId } });
  }

  const ghConn = await findGitHubAppConnection(tenantId);
  const installationId = ghConn?.externalOrgId ? Number(ghConn.externalOrgId) : null;
  if (!installationId) {
    return [];
  }
  return githubAdapter.getRepositories(installationId, context);
};

const getAnalysesFn = async (
  tenantId: string,
  limit: number,
  offset: number,
  context: RequestContext
): Promise<PaginatedResult<AnalysisRecord>> => {
  const [items, total] = await Promise.all([
    getAnalysesByTenant(tenantId, limit, offset),
    countAnalysesByTenant(tenantId),
  ]);
  logger.info("Analyses retrieved", { count: items.length, total, ...context });
  return { items, total, limit, offset };
};

const getAnalysesFilteredFn = async (
  options: AnalysesFilterOptions,
  context: RequestContext
): Promise<PaginatedResult<AnalysisRecord>> => {
  const {
    tenantId,
    repository,
    minConfidence,
    maxConfidence,
    since,
    until,
    limit,
    offset,
    source,
  } = options;

  const [items, total] = await Promise.all([
    getAnalysesByTenantFiltered({
      tenantId,
      repository,
      minConfidence,
      maxConfidence,
      since,
      until,
      limit,
      offset,
      source,
    }),
    countAnalysesByTenantFiltered({
      tenantId,
      repository,
      minConfidence,
      maxConfidence,
      since,
      until,
      source,
    }),
  ]);
  logger.info("Filtered analyses retrieved", {
    count: items.length,
    total,
    repository,
    minConfidence,
    maxConfidence,
    since,
    until,
    source,
    ...context,
  });
  return { items, total, limit, offset };
};

const getFailuresFilteredFn = async (
  options: FailuresFilterOptions,
  context: RequestContext
): Promise<PaginatedResult<EventRecord>> => {
  const { tenantId, repository, severity, since, until, limit, offset, source } = options;

  const [items, total] = await Promise.all([
    getEventsByTenantFiltered({
      tenantId,
      type: CICD_FAILURE_TYPE,
      repository,
      severity,
      since,
      until,
      limit,
      offset,
      source,
    }),
    countEventsByTenantFiltered({
      tenantId,
      type: CICD_FAILURE_TYPE,
      repository,
      severity,
      since,
      until,
      source,
    }),
  ]);
  logger.info("Filtered failures retrieved", {
    count: items.length,
    total,
    repository,
    severity,
    since,
    until,
    source,
    ...context,
  });
  return { items, total, limit, offset };
};

const getAnalysisDetailFn = async (
  tenantId: string,
  analysisId: string,
  context: RequestContext
): Promise<AnalysisRecord> => {
  const analysis = await getAnalysisById(analysisId);
  if (!analysis || analysis.tenantId !== tenantId) {
    throw new NotFoundError("Analysis not found", { metadata: { analysisId } });
  }
  logger.info("Analysis detail retrieved", { analysisId, ...context });
  return analysis;
};

const getFailuresFn = async (
  tenantId: string,
  limit: number,
  offset: number,
  context: RequestContext
): Promise<PaginatedResult<EventRecord>> => {
  const [items, total] = await Promise.all([
    getEventsByTenant({ tenantId, type: CICD_FAILURE_TYPE, limit, offset }),
    countEventsByTenant(tenantId, CICD_FAILURE_TYPE),
  ]);
  logger.info("Failures retrieved", { count: items.length, total, ...context });
  return { items, total, limit, offset };
};

const getAnalysisStatusByEventsFn = async (
  tenantId: string,
  eventIds: readonly string[],
  context: RequestContext
): Promise<ReadonlyMap<string, { readonly analysisId: string; readonly confidence: number }>> => {
  const result = await getAnalysesByEventIds(eventIds, tenantId);
  logger.info("Analysis status batch lookup", {
    requestedCount: eventIds.length,
    foundCount: result.size,
    ...context,
  });
  return result;
};

const getConfidenceDistributionStatsFn = async (
  tenantId: string,
  context: RequestContext
): Promise<ReadonlyArray<{ readonly level: string; readonly count: number }>> => {
  const distribution = await getConfidenceDistribution(tenantId);
  logger.info("Confidence distribution retrieved", { buckets: distribution.length, ...context });
  return distribution;
};

const getWebhookActivityFn = async (
  tenantId: string,
  source: string | null,
  status: string | null,
  limit: number,
  offset: number,
  context: RequestContext
): Promise<PaginatedResult<WebhookActivityRecord>> => {
  const [items, total] = await Promise.all([
    getWebhookActivitiesByTenant({ tenantId, source, status, limit, offset }),
    countWebhookActivitiesByTenant(tenantId, source, status),
  ]);
  logger.info("Webhook activity retrieved", {
    count: items.length,
    total,
    source,
    status,
    ...context,
  });
  return { items, total, limit, offset };
};

const getConfidenceTrendDataFn = async (
  tenantId: string,
  bucket: "day" | "week",
  since: string,
  context: RequestContext
): Promise<readonly ConfidenceTrendPoint[]> => {
  const trend = await getConfidenceTrend(tenantId, bucket, since);
  logger.info("Confidence trend retrieved", { points: trend.length, bucket, ...context });
  return trend;
};

const getAnalysisCountsByRepoFn = async (
  tenantId: string,
  context: RequestContext
): Promise<readonly AnalysisCountByRepo[]> => {
  const counts = await getAnalysisCountsByRepo(tenantId);
  logger.info("Analysis counts by repo retrieved", { repoCount: counts.length, ...context });
  return counts;
};

const getCorrelationsFn = async (
  tenantId: string,
  commitSha: string,
  context: RequestContext
): Promise<CorrelationResult> => {
  const [analyses, incidents] = await Promise.all([
    findAnalysesByCommitSha(tenantId, commitSha),
    findIncidentsByCommitSha(tenantId, commitSha),
  ]);

  const mapToSummary = (
    record: { readonly id: string; readonly createdAt: Date } & (
      | { readonly summary: string }
      | { readonly title: string }
    )
  ): CorrelationSummary => ({
    id: record.id,
    title: "summary" in record ? record.summary : record.title,
    createdAt: record.createdAt.toISOString(),
  });

  logger.info("Correlations retrieved", {
    analysisCount: analyses.length,
    incidentCount: incidents.length,
    ...context,
  });

  return {
    commitSha,
    analyses: analyses.map((analysis) => mapToSummary({ ...analysis, summary: analysis.summary })),
    incidents: incidents.map((incident) => mapToSummary({ ...incident, title: incident.title })),
  };
};

const getGitLabProjectsFn = async (
  userId: string,
  gitlabPort: GitLabProjectsPort,
  context: RequestContext
): Promise<readonly GitLabProject[]> => {
  const identities = await findOAuthIdentitiesByUser(userId);
  const gitlabIdentity = identities.find((identity) => identity.provider === "gitlab");
  if (!gitlabIdentity?.accessToken) {
    return [];
  }
  return gitlabPort.getProjects(gitlabIdentity.accessToken, gitlabIdentity.instanceUrl, context);
};

export {
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
};
