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

// ==================== Team Member Types ====================

/** Row shape returned by the FIND_MEMBERS_BY_TENANT query (joins users + oauth_identities). */
export interface TeamMemberRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly email: string | null;
  readonly avatar_url: string | null;
  readonly role: string;
  readonly joined_at: Date;
  readonly providers: ReadonlyArray<{
    readonly provider: string;
    readonly username: string | null;
  }>;
}

export interface TeamMember {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly role: string;
  readonly joinedAt: Date;
  readonly providers: ReadonlyArray<{
    readonly provider: string;
    readonly username: string | null;
  }>;
}
