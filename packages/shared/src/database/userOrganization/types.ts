/**
 * User Organization Types
 *
 * Type definitions for the user_organizations join table.
 * Enables many-to-many relationships between users and tenants.
 *
 * @module database/userOrganization/types
 */

// ==================== Row Types ====================

export interface UserOrganizationRow {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly role: string;
  readonly is_default: boolean;
  readonly joined_at: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types ====================

export interface UserOrganization {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly role: string;
  readonly isDefault: boolean;
  readonly joinedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Row shape returned by the FIND_BY_USER query (joins with tenants table). */
export interface UserOrganizationWithTenantRow {
  readonly id: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly role: string;
  readonly is_default: boolean;
  readonly joined_at: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly org_name: string;
  readonly provider: string;
  readonly tenant_status: string;
}

export interface UserOrganizationWithTenant {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly role: string;
  readonly isDefault: boolean;
  readonly joinedAt: Date;
  readonly orgName: string;
  readonly provider: string;
  readonly tenantStatus: string;
}

// ==================== Input Types ====================

export interface AddUserOrganizationInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly role?: string;
  readonly isDefault?: boolean;
}
