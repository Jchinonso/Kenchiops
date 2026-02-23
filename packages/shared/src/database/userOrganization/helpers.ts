/**
 * User Organization Helpers
 *
 * Row mappers for user_organizations entities.
 *
 * @module database/userOrganization/helpers
 */

import type {
  UserOrganizationRow,
  UserOrganization,
  UserOrganizationWithTenantRow,
  UserOrganizationWithTenant,
} from "./types.js";

export const rowToUserOrganization = (row: UserOrganizationRow): UserOrganization => ({
  id: row.id,
  userId: row.user_id,
  tenantId: row.tenant_id,
  role: row.role,
  isDefault: row.is_default,
  joinedAt: row.joined_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const rowToUserOrganizationWithTenant = (
  row: UserOrganizationWithTenantRow
): UserOrganizationWithTenant => ({
  id: row.id,
  userId: row.user_id,
  tenantId: row.tenant_id,
  role: row.role,
  isDefault: row.is_default,
  joinedAt: row.joined_at,
  orgName: row.org_name,
  provider: row.provider,
  tenantStatus: row.tenant_status,
});
