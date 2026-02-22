/**
 * Tenant Lookup Service
 *
 * Read operations for tenant lookup and retrieval.
 *
 * @module database/tenant/serviceLookup
 */

import {
  query,
  createLogger,
  getErrorMessage,
  parseDbCount,
  TENANT_STATUS,
  TENANT_QUERIES,
  type Tenant,
} from "../common.js";
import { validateId, validateInstallationId, rowToTenant, extractTenant } from "./helpers.js";
import type { TenantRow, TenantStatistics } from "./types.js";

const logger = createLogger("tenant-service");

/**
 * Find a tenant by GitHub installation ID.
 *
 * @param installationId - GitHub App installation ID
 * @returns Tenant or null if not found
 */
export const findByGitHubInstallation = async (installationId: number): Promise<Tenant | null> => {
  validateInstallationId(installationId);

  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_GITHUB_INSTALLATION, [
      installationId,
      TENANT_STATUS.DELETED,
    ]);
    return extractTenant(result.rows);
  } catch (error) {
    logger.error("Failed to find tenant by GitHub installation", {
      installationId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find a tenant by GitHub organization name.
 *
 * @param org - GitHub organization name
 * @returns Tenant or null if not found
 */
export const findByGitHubOrg = async (org: string): Promise<Tenant | null> => {
  validateId(org, "org");

  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_GITHUB_ORG, [
      org,
      TENANT_STATUS.DELETED,
    ]);
    return extractTenant(result.rows);
  } catch (error) {
    logger.error("Failed to find tenant by GitHub org", {
      org,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find a tenant by GitLab group path.
 *
 * @param groupPath - GitLab group/namespace path
 * @returns Tenant or null if not found
 */
export const findByGitLabGroup = async (groupPath: string): Promise<Tenant | null> => {
  validateId(groupPath, "groupPath");

  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_GITLAB_GROUP, [
      groupPath,
      TENANT_STATUS.DELETED,
    ]);
    return extractTenant(result.rows);
  } catch (error) {
    logger.error("Failed to find tenant by GitLab group", {
      groupPath,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find a tenant by Slack workspace ID.
 *
 * @param workspaceId - Slack workspace ID
 * @returns Tenant or null if not found
 */
export const findBySlackWorkspace = async (workspaceId: string): Promise<Tenant | null> => {
  validateId(workspaceId, "workspaceId");

  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_SLACK_WORKSPACE, [
      workspaceId,
      TENANT_STATUS.DELETED,
    ]);
    return extractTenant(result.rows);
  } catch (error) {
    logger.error("Failed to find tenant by Slack workspace", {
      workspaceId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find a tenant by ID.
 *
 * @param id - Tenant ID
 * @returns Tenant or null if not found
 */
export const findById = async (id: string): Promise<Tenant | null> => {
  validateId(id, "id");

  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_ID, [id]);
    return extractTenant(result.rows);
  } catch (error) {
    logger.error("Failed to find tenant by ID", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find tenants that have GitHub installed but no Slack workspace linked.
 * Used for auto-reconciliation when orphaned tenants exist.
 *
 * @returns Array of tenants pending Slack connection
 */
export const findPendingSlackTenants = async (): Promise<readonly Tenant[]> => {
  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_PENDING_SLACK, [
      TENANT_STATUS.PENDING_SLACK,
    ]);
    return result.rows.map(rowToTenant);
  } catch (error) {
    logger.error("Failed to find pending Slack tenants", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get all active tenants.
 *
 * @returns Array of active tenants
 */
export const getActiveTenants = async (): Promise<readonly Tenant[]> => {
  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_ACTIVE, [TENANT_STATUS.ACTIVE]);
    return result.rows.map(rowToTenant);
  } catch (error) {
    logger.error("Failed to get active tenants", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get activity statistics for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Tenant statistics
 */
export const getTenantStatistics = async (tenantId: string): Promise<TenantStatistics> => {
  validateId(tenantId, "tenantId");

  try {
    const [analysesToday, alertsTotal, lastAlert] = await Promise.all([
      query<{ count: string }>(TENANT_QUERIES.STATS_ANALYSES_TODAY, [tenantId]),
      query<{ count: string }>(TENANT_QUERIES.STATS_ALERTS_TOTAL, [tenantId]),
      query<{ created_at: Date }>(TENANT_QUERIES.STATS_LAST_ALERT, [tenantId]),
    ]);

    return {
      failuresAnalyzedToday: parseDbCount(analysesToday.rows),
      totalAlertsSent: parseDbCount(alertsTotal.rows),
      lastAlertTime: lastAlert.rows.length > 0 ? lastAlert.rows[0].created_at : null,
    };
  } catch (error) {
    logger.error("Failed to get tenant statistics", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get Slack credentials for a tenant by GitHub installation ID.
 *
 * @param installationId - GitHub App installation ID
 * @returns Slack credentials or null if not found
 */
export const getSlackCredentials = async (
  installationId: number
): Promise<{ token: string; workspaceId: string; botUserId: string | null } | null> => {
  validateInstallationId(installationId);

  try {
    const tenant = await findByGitHubInstallation(installationId);

    if (tenant === null || tenant.slackBotToken === null || tenant.slackWorkspaceId === null) {
      return null;
    }

    return {
      token: tenant.slackBotToken,
      workspaceId: tenant.slackWorkspaceId,
      botUserId: tenant.slackBotUserId,
    };
  } catch (error) {
    logger.error("Failed to get Slack credentials", {
      installationId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
