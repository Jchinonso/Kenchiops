/**
 * Team Invitation Helpers
 *
 * Pure functions for invitation row mapping and validation.
 *
 * @module database/invitation/helpers
 */

import crypto from "node:crypto";
import { ValidationError } from "../../core/errors.js";
import type { InvitationRow, Invitation, InvitationRole, CreateInvitationInput } from "./types.js";

// ==================== Constants ====================

/** Invitation token length in bytes (generates 64 hex chars). */
const TOKEN_BYTE_LENGTH = 32;

/** Invitation validity period: 7 days in milliseconds. */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const VALID_ROLES: ReadonlySet<string> = new Set<InvitationRole>([
  "owner",
  "admin",
  "member",
  "viewer",
]);

/** Simple email format check (not exhaustive — real validation happens at provider). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ==================== Row Mapper ====================

export const rowToInvitation = (row: InvitationRow): Invitation => ({
  id: row.id,
  tenantId: row.tenant_id,
  email: row.email,
  role: row.role as InvitationRole,
  token: row.token,
  status: row.status as Invitation["status"],
  invitedBy: row.invited_by,
  acceptedBy: row.accepted_by,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ==================== Token Generation ====================

/** Generate a cryptographically random invitation token. */
export const generateInvitationToken = (): string =>
  crypto.randomBytes(TOKEN_BYTE_LENGTH).toString("hex");

/** Calculate the expiration date for a new invitation. */
export const calculateExpiresAt = (): Date => new Date(Date.now() + INVITATION_TTL_MS);

// ==================== Validation ====================

export const validateCreateInvitationInput = (input: CreateInvitationInput): void => {
  if (!input.tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "validateCreateInvitationInput",
      metadata: { field: "tenantId" },
    });
  }

  if (!input.email?.trim() || !EMAIL_PATTERN.test(input.email)) {
    throw new ValidationError("A valid email address is required", {
      operation: "validateCreateInvitationInput",
      metadata: { field: "email" },
    });
  }

  if (!VALID_ROLES.has(input.role)) {
    throw new ValidationError(`Invalid role: ${input.role}. Valid: owner, admin, member, viewer`, {
      operation: "validateCreateInvitationInput",
      metadata: { field: "role", value: input.role },
    });
  }

  if (!input.invitedBy?.trim()) {
    throw new ValidationError("invitedBy (user ID) is required", {
      operation: "validateCreateInvitationInput",
      metadata: { field: "invitedBy" },
    });
  }
};
