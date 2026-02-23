/**
 * Tenant Lookup Service
 *
 * Read operations for tenant lookup and retrieval.
 * Provider-specific lookups (by GitHub installation, Slack workspace)
 * have moved to providerConnection/repository.
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
  SUBSCRIPTION_QUERIES,
  type Tenant,
} from "../common.js";
import { validateId, rowToTenant, extractTenant } from "./helpers.js";
import type { TenantRow, TenantStatistics } from "./types.js";

const logger = createLogger("tenant-service");

/**
 * Find a tenant by organization name and provider.
 * Provider-scoped lookup that prevents cross-provider collisions.
 *
 * @param orgName - Organization name
 * @param provider - Git provider (e.g., "github", "gitlab")
 * @returns Tenant or null if not found
 */
export const findByOrgNameAndProvider = async (
  orgName: string,
  provider: string
): Promise<Tenant | null> => {
  validateId(orgName, "orgName");

  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_ORG_NAME_AND_PROVIDER, [
      orgName,
      provider,
      TENANT_STATUS.DELETED,
    ]);
    return extractTenant(result.rows);
  } catch (error) {
    logger.error("Failed to find tenant by org name and provider", {
      orgName,
      provider,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find a tenant by organization name.
 *
 * @param org - Organization name
 * @returns Tenant or null if not found
 */
export const findByOrgName = async (org: string): Promise<Tenant | null> => {
  validateId(org, "org");

  try {
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_ORG_NAME, [
      org,
      TENANT_STATUS.DELETED,
    ]);
    return extractTenant(result.rows);
  } catch (error) {
    logger.error("Failed to find tenant by org name", {
      org,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find a tenant by GitLab group path.
 * Searches by org_name since GitLab tenants use group path as org name.
 *
 * @param groupPath - GitLab group/namespace path
 * @returns Tenant or null if not found
 */
export const findByGitLabGroup = async (groupPath: string): Promise<Tenant | null> => {
  validateId(groupPath, "groupPath");

  try {
    // GitLab tenants use the group path as org_name
    const result = await query<TenantRow>(TENANT_QUERIES.FIND_BY_ORG_NAME, [
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
 * Count active users belonging to a tenant.
 * Used to determine if a user is the last member before account deletion.
 *
 * @param tenantId - Tenant ID
 * @returns Number of active members
 */
export const countTenantMembers = async (tenantId: string): Promise<number> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<{ readonly count: string }>(
      SUBSCRIPTION_QUERIES.COUNT_TEAM_MEMBERS,
      [tenantId]
    );
    return parseDbCount(result.rows);
  } catch (error) {
    logger.error("Failed to count tenant members", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
