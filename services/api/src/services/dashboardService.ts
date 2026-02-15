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
  getEventsByTenant,
  countEventsByTenant,
  getEventsByTenantFiltered,
  countEventsByTenantFiltered,
  type RequestContext,
  type AnalysisRecord,
  type EventRecord,
} from "@kenchi/shared";
import type {
  GitHubInstallationPort,
  InstallationRepository,
} from "../ports/githubInstallationPort.js";
import type { TenantInfo, DashboardStats, PaginatedResult } from "./dashboardServiceTypes.js";

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
          limit,
          offset
        ),
        countAnalysesByTenantFiltered(tenantId, repository, minConfidence, maxConfidence),
      ]);

      logger.info("Filtered analyses retrieved", {
        count: items.length,
        total,
        repository,
        minConfidence,
        maxConfidence,
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
          limit,
          offset,
        }),
        countEventsByTenantFiltered(tenantId, CICD_FAILURE_TYPE, repository, severity),
      ]);

      logger.info("Filtered failures retrieved", {
        count: items.length,
        total,
        repository,
        severity,
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
  };
};
