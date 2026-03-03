/**
 * Team Invitation Routes
 *
 * API endpoints for creating, listing, accepting, declining,
 * and revoking team invitations.
 *
 * @module routes/invitationRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  requireTenantId,
  requirePermission,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  HTTP_STATUS,
  getErrorMessage,
  rateLimitByCategory,
  createInvitation,
  findInvitationByToken,
  findPendingInvitationsByTenant,
  findPendingInvitationsByEmail,
  acceptInvitation,
  declineInvitation,
  revokeInvitation,
  logAuditEvent,
  AUDIT_ACTIONS,
  enforcePlanLimit,
  addUserOrganization,
  findUserById,
  findById as findTenantById,
  findOrganizationsByUser,
  publish,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  type InvitationRole,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("invitation-routes");

// ==================== DTO Mappers ====================

const mapInvitationToResponse = (invitation: {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}): Record<string, unknown> => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt.toISOString(),
  createdAt: invitation.createdAt.toISOString(),
});

// ==================== Route Handlers ====================

/**
 * POST /api/v1/invitations
 * Create a new team invitation. Requires admin or owner role.
 */
const handleCreateInvitation = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const actorUserId = req.user?.userId;
  const { email, role } = req.body as {
    readonly email?: string;
    readonly role?: string;
  };

  if (!email || typeof email !== "string") {
    throw new ValidationError("email is required", {
      operation: "handleCreateInvitation",
      metadata: { field: "email" },
    });
  }

  const invitationRole = (role ?? "member") as InvitationRole;

  // Personal tenants are single-user — no team invitations
  const tenant = await findTenantById(tenantId);
  if (tenant?.tenantType === "personal") {
    throw new ValidationError("Personal accounts cannot invite team members", {
      operation: "handleCreateInvitation",
      metadata: { tenantId },
    });
  }

  // Enforce plan limit on team members before creating invitation
  await enforcePlanLimit(tenantId, "max_team_members");

  const invitation = await createInvitation({
    tenantId,
    email,
    role: invitationRole,
    invitedBy: actorUserId ?? "unknown",
  });

  logger.info("Invitation created", {
    ...context,
    invitationId: invitation.id,
    invitedEmail: email,
    role: invitationRole,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.MEMBER_ADDED,
      { invitationId: invitation.id, email, role: invitationRole },
      actorUserId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log invitation audit event", {
      ...context,
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.CREATED).json({
    data: mapInvitationToResponse(invitation),
  });
};

/**
 * GET /api/v1/invitations
 * List pending invitations for the current tenant.
 */
const handleListInvitations = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const invitations = await findPendingInvitationsByTenant(tenantId);

  res.status(HTTP_STATUS.OK).json({
    data: invitations.map(mapInvitationToResponse),
  });
};

/**
 * POST /api/v1/invitations/accept
 * Accept an invitation by token. The authenticated user joins the tenant.
 */
const handleAcceptInvitation = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const userId = req.user?.userId;
  const { token } = req.body as { readonly token?: string };

  if (!token || typeof token !== "string") {
    throw new ValidationError("token is required", {
      operation: "handleAcceptInvitation",
      metadata: { field: "token" },
    });
  }

  if (!userId) {
    throw new AuthorizationError("Authentication required to accept an invitation", {
      operation: "handleAcceptInvitation",
    });
  }

  // Look up invitation
  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    throw new NotFoundError("Invitation not found or has expired", {
      operation: "handleAcceptInvitation",
    });
  }

  if (invitation.status !== "pending") {
    throw new ValidationError(`Invitation is ${invitation.status} and cannot be accepted`, {
      operation: "handleAcceptInvitation",
      metadata: { status: invitation.status },
    });
  }

  if (invitation.expiresAt < new Date()) {
    throw new ValidationError("Invitation has expired", {
      operation: "handleAcceptInvitation",
    });
  }

  // Accept the invitation in DB
  // SECURITY: tenantId from the looked-up invitation is passed to the SQL WHERE clause
  // to enforce tenant isolation at the data layer.
  const accepted = await acceptInvitation(invitation.id, userId, invitation.tenantId);
  if (!accepted) {
    throw new ValidationError("Could not accept invitation. It may have expired or been revoked.", {
      operation: "handleAcceptInvitation",
    });
  }

  // Re-check team size limit at acceptance time — capacity may have changed
  // since the invitation was created
  await enforcePlanLimit(invitation.tenantId, "max_team_members");

  // Fetch user's existing orgs BEFORE adding so we can notify all of them via SSE
  const existingOrgs = await findOrganizationsByUser(userId);

  // Add user to the organization with the invited role
  await addUserOrganization({
    userId,
    tenantId: invitation.tenantId,
    role: invitation.role,
  });

  // Notify all of the user's tenants so the frontend org list refreshes in realtime
  const tenantIdsToNotify = [...existingOrgs.map((org) => org.tenantId), invitation.tenantId];
  for (const notifyTenantId of tenantIdsToNotify) {
    try {
      await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.ORGANIZATION_UPDATED, {
        tenantId: notifyTenantId,
      });
    } catch {
      // Best-effort notification — don't block invitation acceptance
    }
  }

  logger.info("Invitation accepted, user added to organization", {
    ...context,
    invitationId: invitation.id,
    tenantId: invitation.tenantId,
    role: invitation.role,
  });

  res.status(HTTP_STATUS.OK).json({
    data: {
      invitationId: invitation.id,
      tenantId: invitation.tenantId,
      role: invitation.role,
      status: "accepted",
    },
  });
};

/**
 * POST /api/v1/invitations/decline
 * Decline an invitation by token.
 */
const handleDeclineInvitation = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body as { readonly token?: string };

  if (!token || typeof token !== "string") {
    throw new ValidationError("token is required", {
      operation: "handleDeclineInvitation",
      metadata: { field: "token" },
    });
  }

  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    throw new NotFoundError("Invitation not found", {
      operation: "handleDeclineInvitation",
    });
  }

  if (invitation.status !== "pending") {
    throw new ValidationError(`Invitation is ${invitation.status} and cannot be declined`, {
      operation: "handleDeclineInvitation",
      metadata: { status: invitation.status },
    });
  }

  // SECURITY: tenantId from the looked-up invitation is passed to the SQL WHERE clause
  // to enforce tenant isolation at the data layer.
  await declineInvitation(invitation.id, invitation.tenantId);

  res.status(HTTP_STATUS.OK).json({
    data: { invitationId: invitation.id, status: "declined" },
  });
};

/**
 * DELETE /api/v1/invitations/:invitationId
 * Revoke a pending invitation. Requires admin or owner role.
 */
const handleRevokeInvitation = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const { invitationId } = req.params;

  if (!invitationId) {
    throw new ValidationError("invitationId parameter is required", {
      operation: "handleRevokeInvitation",
      metadata: { field: "invitationId" },
    });
  }

  // SECURITY: tenantId is passed to the SQL WHERE clause to enforce tenant isolation
  // at the data layer, preventing cross-tenant invitation revocation (VULN-101).
  const invitation = await revokeInvitation(invitationId, tenantId);

  if (!invitation) {
    throw new NotFoundError("Invitation not found", {
      metadata: { invitationId },
    });
  }

  logger.info("Invitation revoked", {
    ...context,
    invitationId,
  });

  res.status(HTTP_STATUS.OK).json({
    data: { invitationId, status: "revoked" },
  });
};

/**
 * GET /api/v1/invitations/pending
 * List pending invitations for the authenticated user's email.
 */
const handleMyPendingInvitations = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(HTTP_STATUS.OK).json({ data: [] });
    return;
  }

  // Look up user email from database since AuthenticatedUser (JWT) doesn't carry it
  const user = await findUserById(userId);
  const userEmail = user?.email;

  if (!userEmail) {
    res.status(HTTP_STATUS.OK).json({ data: [] });
    return;
  }

  const invitations = await findPendingInvitationsByEmail(userEmail);

  res.status(HTTP_STATUS.OK).json({
    data: invitations.map(mapInvitationToResponse),
  });
};

// ==================== Route Definitions ====================

// Permission-gated routes
router.post(
  "/api/v1/invitations",
  rateLimitByCategory("standard"),
  requirePermission("members.invite"),
  asyncHandler(handleCreateInvitation)
);

router.get(
  "/api/v1/invitations",
  rateLimitByCategory("readonly"),
  requirePermission("members.invite"),
  asyncHandler(handleListInvitations)
);

router.delete(
  "/api/v1/invitations/:invitationId",
  rateLimitByCategory("standard"),
  requirePermission("members.remove"),
  asyncHandler(handleRevokeInvitation)
);

// Any authenticated user routes
router.post(
  "/api/v1/invitations/accept",
  rateLimitByCategory("standard"),
  asyncHandler(handleAcceptInvitation)
);

router.post(
  "/api/v1/invitations/decline",
  rateLimitByCategory("standard"),
  asyncHandler(handleDeclineInvitation)
);

router.get(
  "/api/v1/invitations/pending",
  rateLimitByCategory("readonly"),
  asyncHandler(handleMyPendingInvitations)
);

export { router as invitationRoutes };
