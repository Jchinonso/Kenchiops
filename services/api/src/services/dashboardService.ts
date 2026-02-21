/**
 * Dashboard Service
 *
 * Business logic for the CI/CD dashboard endpoints.
 * Orchestrates tenant lookup, GitHub API calls, and database queries.
 *
 * @module services/dashboardService
 */

import {
  createLogger,
  NotFoundError,
  findById as findTenantById,
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
import type {
  TenantInfo,
  DashboardStats,
  PaginatedResult,
  CorrelationResult,
  CorrelationSummary,
} from "./dashboardServiceTypes.js";

const CICD_FAILURE_TYPE = "CICD_FAILURE";

/**
 * Creates the dashboard service with injected dependencies.
 */
export const createDashboardService = (githubAdapter: GitHubInstallationPort) => {
  const logger = createLogger("dashboard-service");

  return {
    /**
     * Retrieves tenant info including connection status.
     *
     * @throws NotFoundError if tenant does not exist
     */
    getTenantInfo: async (tenantId: string, context: RequestContext): Promise<TenantInfo> => {
      const tenant = await findTenantById(tenantId);

      if (!tenant) {
        throw new NotFoundError("Tenant not found", {
          metadata: { tenantId },
        });
      }

      logger.info("Tenant info retrieved", { ...context });

      return {
        id: tenant.id,
        githubOrg: tenant.githubOrg,
        githubConnected: tenant.githubInstallationId !== null,
        slackConnected: tenant.slackWorkspaceId !== null,
        status: tenant.status,
      };
    },

    /**
     * Retrieves aggregated dashboard statistics for a tenant.
     *
     * @throws NotFoundError if tenant does not exist
     */
    getDashboardStats: async (
      tenantId: string,
      context: RequestContext
    ): Promise<DashboardStats> => {
      const tenant = await findTenantById(tenantId);

      if (!tenant) {
        throw new NotFoundError("Tenant not found", { metadata: { tenantId } });
      }

      const [totalAnalyses, totalFailures, repos] = await Promise.all([
        countAnalysesByTenant(tenantId),
        countEventsByTenant(tenantId, CICD_FAILURE_TYPE),
        tenant.githubInstallationId
          ? githubAdapter.getRepositories(tenant.githubInstallationId, context)
          : Promise.resolve([]),
      ]);

      logger.info("Dashboard stats retrieved", {
        totalAnalyses,
        totalFailures,
        connectedRepos: repos.length,
        ...context,
      });

      return { totalAnalyses, totalFailures, connectedRepos: repos.length };
    },

    /**
     * Retrieves repositories accessible to the tenant's GitHub installation.
     * Returns empty array if no GitHub installation is linked.
     *
     * @throws NotFoundError if tenant does not exist
     */
    getRepositories: async (
      tenantId: string,
      context: RequestContext
    ): Promise<readonly InstallationRepository[]> => {
      const tenant = await findTenantById(tenantId);

      if (!tenant) {
        throw new NotFoundError("Tenant not found", { metadata: { tenantId } });
      }

      if (!tenant.githubInstallationId) {
        return [];
      }

      return githubAdapter.getRepositories(tenant.githubInstallationId, context);
    },

    /**
     * Retrieves paginated analysis records for a tenant.
     */
    getAnalyses: async (
      tenantId: string,
      limit: number,
      offset: number,
      context: RequestContext
    ): Promise<PaginatedResult<AnalysisRecord>> => {
      const [items, total] = await Promise.all([
        getAnalysesByTenant(tenantId, limit, offset),
        countAnalysesByTenant(tenantId),
      ]);

      logger.info("Analyses retrieved", {
        count: items.length,
        total,
        ...context,
      });

      return { items, total, limit, offset };
    },

    /**
     * Retrieves paginated analysis records for a tenant with optional filters.
     */
    getAnalysesFiltered: async (
      tenantId: string,
      repository: string | null,
      minConfidence: number | null,
      maxConfidence: number | null,
      since: string | null,
      until: string | null,
      limit: number,
      offset: number,
      context: RequestContext
    ): Promise<PaginatedResult<AnalysisRecord>> => {
      const [items, total] = await Promise.all([
        getAnalysesByTenantFiltered(
          tenantId,
          repository,
          minConfidence,
          maxConfidence,
          since,
          until,
          limit,
          offset
        ),
        countAnalysesByTenantFiltered(
          tenantId,
          repository,
          minConfidence,
          maxConfidence,
          since,
          until
        ),
      ]);

      logger.info("Filtered analyses retrieved", {
        count: items.length,
        total,
        repository,
        minConfidence,
        maxConfidence,
        since,
        until,
        ...context,
      });

      return { items, total, limit, offset };
    },

    /**
     * Retrieves paginated CI/CD failure events for a tenant with optional filters.
     */
    getFailuresFiltered: async (
      tenantId: string,
      repository: string | null,
      severity: string | null,
      since: string | null,
      until: string | null,
      limit: number,
      offset: number,
      context: RequestContext
    ): Promise<PaginatedResult<EventRecord>> => {
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
        }),
        countEventsByTenantFiltered(
          tenantId,
          CICD_FAILURE_TYPE,
          repository,
          severity,
          since,
          until
        ),
      ]);

      logger.info("Filtered failures retrieved", {
        count: items.length,
        total,
        repository,
        severity,
        since,
        until,
        ...context,
      });

      return { items, total, limit, offset };
    },

    /**
     * Retrieves a single analysis by ID, scoped to the tenant.
     *
     * @throws NotFoundError if analysis does not exist or belongs to another tenant
     */
    getAnalysisDetail: async (
      tenantId: string,
      analysisId: string,
      context: RequestContext
    ): Promise<AnalysisRecord> => {
      const analysis = await getAnalysisById(analysisId);

      if (!analysis || analysis.tenantId !== tenantId) {
        throw new NotFoundError("Analysis not found", {
          metadata: { analysisId },
        });
      }

      logger.info("Analysis detail retrieved", { analysisId, ...context });
      return analysis;
    },

    /**
     * Retrieves paginated CI/CD failure events for a tenant.
     */
    getFailures: async (
      tenantId: string,
      limit: number,
      offset: number,
      context: RequestContext
    ): Promise<PaginatedResult<EventRecord>> => {
      const [items, total] = await Promise.all([
        getEventsByTenant({ tenantId, type: CICD_FAILURE_TYPE, limit, offset }),
        countEventsByTenant(tenantId, CICD_FAILURE_TYPE),
      ]);

      logger.info("Failures retrieved", {
        count: items.length,
        total,
        ...context,
      });

      return { items, total, limit, offset };
    },

    /**
     * Batch lookup: returns analysis status for multiple event IDs.
     */
    getAnalysisStatusByEvents: async (
      tenantId: string,
      eventIds: readonly string[],
      context: RequestContext
    ): Promise<
      ReadonlyMap<string, { readonly analysisId: string; readonly confidence: number }>
    > => {
      const result = await getAnalysesByEventIds(eventIds, tenantId);
      logger.info("Analysis status batch lookup", {
        requestedCount: eventIds.length,
        foundCount: result.size,
        ...context,
      });
      return result;
    },

    /**
     * Returns confidence distribution buckets (high/medium/low) for a tenant.
     */
    getConfidenceDistributionStats: async (
      tenantId: string,
      context: RequestContext
    ): Promise<ReadonlyArray<{ readonly level: string; readonly count: number }>> => {
      const distribution = await getConfidenceDistribution(tenantId);
      logger.info("Confidence distribution retrieved", {
        buckets: distribution.length,
        ...context,
      });
      return distribution;
    },

    /**
     * Retrieves paginated webhook activity for a tenant with optional filters.
     */
    getWebhookActivity: async (
      tenantId: string,
      source: string | null,
      status: string | null,
      limit: number,
      offset: number,
      context: RequestContext
    ): Promise<PaginatedResult<WebhookActivityRecord>> => {
      const [items, total] = await Promise.all([
        getWebhookActivitiesByTenant({
          tenantId,
          source,
          status,
          limit,
          offset,
        }),
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
    },

    /**
     * Returns time-series confidence trend data for a tenant.
     */
    getConfidenceTrendData: async (
      tenantId: string,
      bucket: "day" | "week",
      since: string,
      context: RequestContext
    ): Promise<readonly ConfidenceTrendPoint[]> => {
      const trend = await getConfidenceTrend(tenantId, bucket, since);
      logger.info("Confidence trend retrieved", {
        points: trend.length,
        bucket,
        ...context,
      });
      return trend;
    },

    /**
     * Returns per-repository analysis counts for repo tab filtering.
     */
    getAnalysisCountsByRepo: async (
      tenantId: string,
      context: RequestContext
    ): Promise<readonly AnalysisCountByRepo[]> => {
      const counts = await getAnalysisCountsByRepo(tenantId);
      logger.info("Analysis counts by repo retrieved", {
        repoCount: counts.length,
        ...context,
      });
      return counts;
    },

    /**
     * Finds cross-pipeline correlations for a given commit SHA.
     * Looks up CI/CD analyses and incident alerts that reference the same commit.
     */
    getCorrelations: async (
      tenantId: string,
      commitSha: string,
      context: RequestContext
    ): Promise<CorrelationResult> => {
      const [analyses, incidents] = await Promise.all([
        findAnalysesByCommitSha(tenantId, commitSha),
        findIncidentsByCommitSha(tenantId, commitSha),
      ]);

      const mapAnalysisToSummary = (a: AnalysisRecord): CorrelationSummary => ({
        id: a.id,
        title: a.summary,
        createdAt: a.createdAt.toISOString(),
      });

      const mapIncidentToSummary = (i: {
        readonly id: string;
        readonly title: string;
        readonly createdAt: Date;
      }): CorrelationSummary => ({
        id: i.id,
        title: i.title,
        createdAt: i.createdAt.toISOString(),
      });

      logger.info("Correlations retrieved", {
        analysisCount: analyses.length,
        incidentCount: incidents.length,
        ...context,
      });

      return {
        commitSha,
        analyses: analyses.map(mapAnalysisToSummary),
        incidents: incidents.map(mapIncidentToSummary),
      };
    },
  };
};
