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
import type { UserRole } from "../user/types.js";
import {
  rowToUserOrganization,
  rowToUserOrganizationWithTenant,
  rowToTeamMember,
} from "./helpers.js";
import type {
  UserOrganizationRow,
  UserOrganization,
  UserOrganizationWithTenantRow,
  UserOrganizationWithTenant,
  AddUserOrganizationInput,
  TeamMemberRow,
  TeamMember,
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
  FIND_MEMBERS_BY_TENANT: `
    SELECT
      u.id AS user_id,
      u.display_name,
      u.email,
      u.avatar_url,
      uo.role,
      uo.joined_at,
      COALESCE(
        json_agg(
          json_build_object('provider', oi.provider, 'username', oi.provider_username)
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) AS providers
    FROM user_organizations uo
    JOIN users u ON u.id = uo.user_id
    LEFT JOIN oauth_identities oi ON oi.user_id = u.id
    WHERE uo.tenant_id = $1
    GROUP BY u.id, u.display_name, u.email, u.avatar_url, uo.role, uo.joined_at
    ORDER BY
      CASE uo.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
      uo.joined_at ASC
  `,
  UPDATE_MEMBER_ROLE: `
    UPDATE user_organizations SET role = $1, updated_at = NOW()
    WHERE tenant_id = $2 AND user_id = $3
    RETURNING *
  `,
  REMOVE_MEMBER: `
    DELETE FROM user_organizations
    WHERE tenant_id = $1 AND user_id = $2
    RETURNING *
  `,
  COUNT_OWNERS: `
    SELECT COUNT(*) AS count FROM user_organizations
    WHERE tenant_id = $1 AND role = 'owner'
  `,
  FIND_ROLE_BY_USER_AND_TENANT: `
    SELECT role FROM user_organizations WHERE user_id = $1 AND tenant_id = $2
  `,
  CLEAR_USER_TENANT: `
    UPDATE users SET selected_tenant_id = NULL, updated_at = NOW()
    WHERE id = $1 AND selected_tenant_id = $2
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

/**
 * Find all members of a tenant organization with their linked OAuth identities.
 *
 * @param tenantId - Tenant ID
 * @returns Array of team members sorted by role weight then join date
 */
export const findMembersByTenant = async (tenantId: string): Promise<readonly TeamMember[]> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<TeamMemberRow>(QUERIES.FIND_MEMBERS_BY_TENANT, [tenantId]);
    return result.rows.map(rowToTeamMember);
  } catch (error) {
    logger.error("Failed to find members by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Update a member's role within a tenant organization.
 *
 * @param tenantId - Tenant ID
 * @param userId - Target user ID
 * @param role - New role to assign
 * @returns Updated membership or null if not found
 */
export const updateMemberRole = async (
  tenantId: string,
  userId: string,
  role: string
): Promise<UserOrganization | null> => {
  validateId(tenantId, "tenantId");
  validateId(userId, "userId");

  try {
    const result = await query<UserOrganizationRow>(QUERIES.UPDATE_MEMBER_ROLE, [
      role,
      tenantId,
      userId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const membership = rowToUserOrganization(result.rows[0]);

    logger.info("Member role updated", {
      tenantId,
      userId,
      role,
    });

    return membership;
  } catch (error) {
    logger.error("Failed to update member role", {
      tenantId,
      userId,
      role,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Remove a member from a tenant organization.
 * Also clears the user's selected_tenant_id if it matches the removed tenant.
 *
 * @param tenantId - Tenant ID
 * @param userId - User ID to remove
 * @returns true if the member was removed, false if not found
 */
export const removeMemberFromTenant = async (
  tenantId: string,
  userId: string
): Promise<boolean> => {
  validateId(tenantId, "tenantId");
  validateId(userId, "userId");

  try {
    const removed = await transaction(async (client) => {
      const result = await client.query<UserOrganizationRow>(QUERIES.REMOVE_MEMBER, [
        tenantId,
        userId,
      ]);

      if (result.rows.length === 0) {
        return false;
      }

      // Clear user's selected tenant if it was the removed org
      await client.query(QUERIES.CLEAR_USER_TENANT, [userId, tenantId]);

      return true;
    });

    if (removed) {
      logger.info("Member removed from organization", {
        tenantId,
        userId,
      });
    }

    return removed;
  } catch (error) {
    logger.error("Failed to remove member from tenant", {
      tenantId,
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Count the number of owners in a tenant organization.
 *
 * @param tenantId - Tenant ID
 * @returns Number of owners
 */
export const countOwnersByTenant = async (tenantId: string): Promise<number> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<{ readonly count: string }>(QUERIES.COUNT_OWNERS, [tenantId]);
    return parseDbCount(result.rows);
  } catch (error) {
    logger.error("Failed to count owners by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find the per-organization role for a user in a specific tenant.
 *
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @returns The user's role in the organization, or null if no membership exists
 */
export const findUserOrgRole = async (
  userId: string,
  tenantId: string
): Promise<UserRole | null> => {
  validateId(userId, "userId");
  validateId(tenantId, "tenantId");

  try {
    const result = await query<{ readonly role: string }>(QUERIES.FIND_ROLE_BY_USER_AND_TENANT, [
      userId,
      tenantId,
    ]);
    return result.rows.length > 0 ? (result.rows[0].role as UserRole) : null;
  } catch (error) {
    logger.error("Failed to find user org role", {
      userId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
