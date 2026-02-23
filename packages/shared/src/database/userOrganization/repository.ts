/**
 * User Organization Repository
 *
 * Database operations for the user_organizations join table.
 * Manages many-to-many relationships between users and tenants.
 *
 * @module database/userOrganization/repository
 */

import {
  query,
  transaction,
  createLogger,
  getErrorMessage,
  validateId,
  parseDbCount,
} from "../common.js";
import { rowToUserOrganization, rowToUserOrganizationWithTenant } from "./helpers.js";
import type {
  UserOrganizationRow,
  UserOrganization,
  UserOrganizationWithTenantRow,
  UserOrganizationWithTenant,
  AddUserOrganizationInput,
} from "./types.js";

const logger = createLogger("user-organization");

// ==================== Query Constants ====================

const QUERIES = {
  FIND_BY_USER: `
    SELECT uo.*, t.org_name, t.provider, t.status AS tenant_status
    FROM user_organizations uo
    JOIN tenants t ON t.id = uo.tenant_id
    WHERE uo.user_id = $1
    ORDER BY uo.is_default DESC, uo.joined_at ASC
  `,
  ADD: `
    INSERT INTO user_organizations (user_id, tenant_id, role, is_default)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, tenant_id) DO NOTHING
    RETURNING *
  `,
  CLEAR_DEFAULTS: `
    UPDATE user_organizations SET is_default = false, updated_at = NOW()
    WHERE user_id = $1
  `,
  SET_DEFAULT: `
    UPDATE user_organizations SET is_default = true, updated_at = NOW()
    WHERE user_id = $1 AND tenant_id = $2
    RETURNING *
  `,
  COUNT_MEMBERS: `
    SELECT COUNT(*) AS count FROM user_organizations WHERE tenant_id = $1
  `,
} as const;

// ==================== Repository Functions ====================

/**
 * Find all organizations a user belongs to, with tenant details.
 *
 * @param userId - User ID
 * @returns Array of organizations with tenant info, default org first
 */
export const findOrganizationsByUser = async (
  userId: string
): Promise<readonly UserOrganizationWithTenant[]> => {
  validateId(userId, "userId");

  try {
    const result = await query<UserOrganizationWithTenantRow>(QUERIES.FIND_BY_USER, [userId]);
    return result.rows.map(rowToUserOrganizationWithTenant);
  } catch (error) {
    logger.error("Failed to find organizations by user", {
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Add a user to an organization. Idempotent (ON CONFLICT DO NOTHING).
 *
 * @param input - User organization membership data
 * @returns Created membership or null if already exists
 */
export const addUserOrganization = async (
  input: AddUserOrganizationInput
): Promise<UserOrganization | null> => {
  validateId(input.userId, "userId");
  validateId(input.tenantId, "tenantId");

  try {
    const result = await query<UserOrganizationRow>(QUERIES.ADD, [
      input.userId,
      input.tenantId,
      input.role ?? "member",
      input.isDefault ?? false,
    ]);

    if (result.rows.length === 0) {
      // Already exists (ON CONFLICT DO NOTHING)
      return null;
    }

    const membership = rowToUserOrganization(result.rows[0]);

    logger.info("User added to organization", {
      userId: input.userId,
      tenantId: input.tenantId,
      role: membership.role,
    });

    return membership;
  } catch (error) {
    logger.error("Failed to add user to organization", {
      userId: input.userId,
      tenantId: input.tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Set an organization as the user's default.
 * Clears existing defaults first, then sets the specified org.
 *
 * @param userId - User ID
 * @param tenantId - Tenant ID to set as default
 * @returns Updated membership or null if not found
 */
export const setDefaultOrganization = async (
  userId: string,
  tenantId: string
): Promise<UserOrganization | null> => {
  validateId(userId, "userId");
  validateId(tenantId, "tenantId");

  try {
    const result = await transaction(async (client) => {
      // Clear all defaults for this user
      await client.query(QUERIES.CLEAR_DEFAULTS, [userId]);

      // Set the specified org as default
      const updated = await client.query<UserOrganizationRow>(QUERIES.SET_DEFAULT, [
        userId,
        tenantId,
      ]);

      return updated.rows.length > 0 ? updated.rows[0] : null;
    });

    if (!result) {
      return null;
    }

    const membership = rowToUserOrganization(result);

    logger.info("Default organization set", {
      userId,
      tenantId,
    });

    return membership;
  } catch (error) {
    logger.error("Failed to set default organization", {
      userId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Count the number of members in an organization.
 *
 * @param tenantId - Tenant ID
 * @returns Number of members
 */
export const countMembersByTenant = async (tenantId: string): Promise<number> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<{ readonly count: string }>(QUERIES.COUNT_MEMBERS, [tenantId]);
    return parseDbCount(result.rows);
  } catch (error) {
    logger.error("Failed to count members by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
