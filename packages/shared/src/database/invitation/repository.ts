/**
 * Team Invitation Repository
 *
 * Database operations for team invitations.
 *
 * @module database/invitation/repository
 */

import { query, createLogger, generateEventId, getErrorMessage, NotFoundError } from "../common.js";
import type { InvitationRow, Invitation, CreateInvitationInput } from "./types.js";
import {
  rowToInvitation,
  generateInvitationToken,
  calculateExpiresAt,
  validateCreateInvitationInput,
} from "./helpers.js";

const logger = createLogger("invitation-repository");

const INVITATION_ID_PREFIX = "inv";

// ==================== SQL Queries ====================

const QUERIES = {
  INSERT: `
    INSERT INTO team_invitations (id, tenant_id, email, role, token, status, invited_by, expires_at)
    VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
    RETURNING *
  `,
  FIND_BY_TOKEN: `
    SELECT * FROM team_invitations WHERE token = $1
  `,
  FIND_BY_TENANT: `
    SELECT * FROM team_invitations
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `,
  FIND_PENDING_BY_TENANT: `
    SELECT * FROM team_invitations
    WHERE tenant_id = $1 AND status = 'pending' AND expires_at > NOW()
    ORDER BY created_at DESC
  `,
  UPDATE_STATUS: `
    UPDATE team_invitations
    SET status = $1, updated_at = NOW()
    WHERE id = $2 AND tenant_id = $3
    RETURNING *
  `,
  ACCEPT: `
    UPDATE team_invitations
    SET status = 'accepted', accepted_by = $1, updated_at = NOW()
    WHERE id = $2 AND tenant_id = $3 AND status = 'pending' AND expires_at > NOW()
    RETURNING *
  `,
  EXPIRE_STALE: `
    UPDATE team_invitations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expires_at <= NOW()
    RETURNING id
  `,
  FIND_PENDING_BY_EMAIL: `
    SELECT * FROM team_invitations
    WHERE email = $1 AND status = 'pending' AND expires_at > NOW()
    ORDER BY created_at DESC
  `,
} as const;

// ==================== Public API ====================

/**
 * Create a new team invitation.
 * Generates a unique token and sets expiration.
 */
export const createInvitation = async (input: CreateInvitationInput): Promise<Invitation> => {
  validateCreateInvitationInput(input);

  const id = generateEventId(INVITATION_ID_PREFIX);
  const token = generateInvitationToken();
  const expiresAt = calculateExpiresAt();

  try {
    const result = await query<InvitationRow>(QUERIES.INSERT, [
      id,
      input.tenantId,
      input.email.toLowerCase().trim(),
      input.role,
      token,
      input.invitedBy,
      expiresAt.toISOString(),
    ]);

    const invitation = rowToInvitation(result.rows[0]);
    logger.info("Invitation created", {
      invitationId: id,
      tenantId: input.tenantId,
      role: input.role,
    });
    return invitation;
  } catch (error) {
    // Handle unique constraint violation (duplicate pending invite)
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("idx_team_invitations_unique_pending")) {
      throw new NotFoundError(
        "A pending invitation already exists for this email in this organization",
        { operation: "createInvitation", metadata: { email: input.email } }
      );
    }

    logger.error("Failed to create invitation", {
      tenantId: input.tenantId,
      error: errorMessage,
    });
    throw error;
  }
};

/**
 * Find an invitation by its token.
 */
export const findInvitationByToken = async (token: string): Promise<Invitation | null> => {
  try {
    const result = await query<InvitationRow>(QUERIES.FIND_BY_TOKEN, [token]);
    return result.rows.length > 0 ? rowToInvitation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to find invitation by token", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * List all pending (non-expired) invitations for a tenant.
 */
export const findPendingInvitationsByTenant = async (
  tenantId: string
): Promise<readonly Invitation[]> => {
  try {
    const result = await query<InvitationRow>(QUERIES.FIND_PENDING_BY_TENANT, [tenantId]);
    return result.rows.map(rowToInvitation);
  } catch (error) {
    logger.error("Failed to find pending invitations", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find all pending invitations for a given email address.
 */
export const findPendingInvitationsByEmail = async (
  email: string
): Promise<readonly Invitation[]> => {
  try {
    const result = await query<InvitationRow>(QUERIES.FIND_PENDING_BY_EMAIL, [
      email.toLowerCase().trim(),
    ]);
    return result.rows.map(rowToInvitation);
  } catch (error) {
    logger.error("Failed to find invitations by email", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Accept an invitation. Updates status and records the accepting user.
 * Only works on pending, non-expired invitations.
 * SECURITY: Requires tenantId to enforce tenant isolation at the SQL level.
 * Returns null if the invitation cannot be accepted.
 */
export const acceptInvitation = async (
  invitationId: string,
  acceptedByUserId: string,
  tenantId: string
): Promise<Invitation | null> => {
  try {
    const result = await query<InvitationRow>(QUERIES.ACCEPT, [
      acceptedByUserId,
      invitationId,
      tenantId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const invitation = rowToInvitation(result.rows[0]);
    logger.info("Invitation accepted", {
      invitationId,
      tenantId: invitation.tenantId,
      acceptedBy: acceptedByUserId,
    });
    return invitation;
  } catch (error) {
    logger.error("Failed to accept invitation", {
      invitationId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Decline an invitation. Updates status to 'declined'.
 * SECURITY: Requires tenantId to enforce tenant isolation at the SQL level.
 */
export const declineInvitation = async (
  invitationId: string,
  tenantId: string
): Promise<Invitation | null> => {
  try {
    const result = await query<InvitationRow>(QUERIES.UPDATE_STATUS, [
      "declined",
      invitationId,
      tenantId,
    ]);
    return result.rows.length > 0 ? rowToInvitation(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to decline invitation", {
      invitationId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Revoke an invitation (admin action). Updates status to 'revoked'.
 * SECURITY: Requires tenantId to enforce tenant isolation at the SQL level.
 */
export const revokeInvitation = async (
  invitationId: string,
  tenantId: string
): Promise<Invitation | null> => {
  try {
    const result = await query<InvitationRow>(QUERIES.UPDATE_STATUS, [
      "revoked",
      invitationId,
      tenantId,
    ]);

    if (result.rows.length > 0) {
      const invitation = rowToInvitation(result.rows[0]);
      logger.info("Invitation revoked", {
        invitationId,
        tenantId: invitation.tenantId,
      });
      return invitation;
    }

    return null;
  } catch (error) {
    logger.error("Failed to revoke invitation", {
      invitationId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Expire all stale invitations (past their expires_at).
 * Meant to be called from a periodic scheduler.
 * Returns the count of expired invitations.
 */
export const expireStaleInvitations = async (): Promise<number> => {
  try {
    const result = await query<{ readonly id: string }>(QUERIES.EXPIRE_STALE, []);
    const expiredCount = result.rows.length;

    if (expiredCount > 0) {
      logger.info("Expired stale invitations", { expiredCount });
    }

    return expiredCount;
  } catch (error) {
    logger.error("Failed to expire stale invitations", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};
