/**
 * Team Invitation Types
 *
 * Type definitions for the team invitation system.
 *
 * @module database/invitation/types
 */

// ==================== Enum Types ====================

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";

export type InvitationRole = "owner" | "admin" | "member" | "viewer";

// ==================== Row Types (snake_case, matches DB) ====================

export interface InvitationRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly role: string;
  readonly token: string;
  readonly status: string;
  readonly invited_by: string | null;
  readonly accepted_by: string | null;
  readonly expires_at: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types (camelCase) ====================

export interface Invitation {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly role: InvitationRole;
  readonly token: string;
  readonly status: InvitationStatus;
  readonly invitedBy: string | null;
  readonly acceptedBy: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ==================== Input Types ====================

export interface CreateInvitationInput {
  readonly tenantId: string;
  readonly email: string;
  readonly role: InvitationRole;
  readonly invitedBy: string;
}
