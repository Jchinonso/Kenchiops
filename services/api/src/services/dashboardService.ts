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
  getAnalysesByTenant,
  countAnalysesByTenant,
  getEventsByTenant,
  countEventsByTenant,
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
  };
};
