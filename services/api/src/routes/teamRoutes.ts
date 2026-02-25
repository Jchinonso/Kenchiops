/**
 * Team Management Routes
 *
 * API endpoints for team member management within an organization.
 * All endpoints require authentication and a linked tenant.
 * Role modification and removal require admin or owner role.
 *
 * @module routes/teamRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  requireTenantId,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  requireRole,
  HTTP_STATUS,
  getErrorMessage,
  rateLimitByCategory,
  // Repository functions
  findMembersByTenant,
  updateMemberRole,
  removeMemberFromTenant,
  countOwnersByTenant,
  revokeAllTokensByUser,
  revokeAllTenantTokens,
  logAuditEvent,
  AUDIT_ACTIONS,
  setUserStatusFlag,
  setTenantStatusFlag,
  softDeleteTenant,
  activate,
  findById,
  findByTenant,
  clearTenantStatusFlag,
  getSubscriptionWithPlan,
  TENANT_STATUS,
  type TeamMember,
  type UserRole,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("team-routes");

// ==================== Constants ====================

const VALID_ROLES: ReadonlySet<string> = new Set<UserRole>(["owner", "admin", "member", "viewer"]);

const ROLE_WEIGHT: Readonly<Record<string, number>> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

// ==================== Helpers ====================

/** Check whether the actor's role outranks or equals the target's role. */
const canModifyTarget = (actorRole: string, targetRole: string): boolean =>
  (ROLE_WEIGHT[actorRole] ?? 0) >= (ROLE_WEIGHT[targetRole] ?? 0);

// ==================== DTO Mappers ====================

const mapTeamMemberToResponse = (member: TeamMember): Record<string, unknown> => ({
  userId: member.userId,
  displayName: member.displayName,
  email: member.email,
  avatarUrl: member.avatarUrl,
  role: member.role,
  joinedAt: member.joinedAt.toISOString(),
  providers: member.providers,
});

// ==================== Route Handlers ====================

/**
 * GET /api/v1/team/members
 * Returns all members of the authenticated user's organization.
 */
const handleListMembers = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  const members = await findMembersByTenant(tenantId);

  logger.info("Team members listed", { ...context, count: members.length });
  res.status(HTTP_STATUS.OK).json({
    data: members.map(mapTeamMemberToResponse),
  });
};

/**
 * PATCH /api/v1/team/members/:userId/role
 * Change a member's role within the organization.
 * Requires admin or owner role. Enforces role hierarchy and last-owner protection.
 */
const handleChangeRole = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const actorUserId = req.user?.userId;
  const actorRole = req.user?.role ?? "member";
  const targetUserId = req.params.userId;

  if (!targetUserId) {
    throw new ValidationError("userId parameter is required", {
      operation: "handleChangeRole",
      metadata: { field: "userId" },
    });
  }

  const { role: newRole } = req.body as { readonly role?: string };

  if (!newRole || typeof newRole !== "string") {
    throw new ValidationError("role is required in request body", {
      operation: "handleChangeRole",
      metadata: { field: "role" },
    });
  }

  if (!VALID_ROLES.has(newRole)) {
    throw new ValidationError(
      `Invalid role: ${newRole}. Valid roles: owner, admin, member, viewer`,
      {
        operation: "handleChangeRole",
        metadata: { field: "role", value: newRole },
      }
    );
  }

  // Cannot change own role
  if (actorUserId === targetUserId) {
    throw new ValidationError("Cannot change your own role", {
      operation: "handleChangeRole",
    });
  }

  // Fetch target member to check current role
  const members = await findMembersByTenant(tenantId);
  const targetMember = members.find((member) => member.userId === targetUserId);

  if (!targetMember) {
    throw new NotFoundError("Member not found in this organization", {
      metadata: { userId: targetUserId },
    });
  }

  // Role hierarchy: actor must outrank or equal target's current role
  if (!canModifyTarget(actorRole, targetMember.role)) {
    throw new AuthorizationError("Cannot modify a member with a higher or equal role", {
      operation: "handleChangeRole",
    });
  }

  // Last owner protection: if demoting an owner, ensure at least one owner remains
  if (targetMember.role === "owner" && newRole !== "owner") {
    const ownerCount = await countOwnersByTenant(tenantId);
    if (ownerCount <= 1) {
      throw new ValidationError(
        "Cannot change the role of the last owner. Promote another member to owner first.",
        { operation: "handleChangeRole" }
      );
    }
  }

  const updated = await updateMemberRole(tenantId, targetUserId, newRole);

  if (!updated) {
    throw new NotFoundError("Member not found in this organization", {
      metadata: { userId: targetUserId },
    });
  }

  logger.info("Member role changed", {
    ...context,
    targetUserId,
    previousRole: targetMember.role,
    newRole,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
      { targetUserId, previousRole: targetMember.role, newRole },
      actorUserId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log role change audit event", {
      ...context,
      error: getErrorMessage(auditError),
    });
  }

  // Re-fetch to get the full team member shape with providers
  const updatedMembers = await findMembersByTenant(tenantId);
  const updatedMember = updatedMembers.find((member) => member.userId === targetUserId);

  res.status(HTTP_STATUS.OK).json({
    data: updatedMember
      ? mapTeamMemberToResponse(updatedMember)
      : { userId: targetUserId, role: newRole },
  });
};

/**
 * DELETE /api/v1/team/members/:userId
 * Remove a member from the organization.
 * Requires admin or owner role. Enforces role hierarchy and last-owner protection.
 */
const handleRemoveMember = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const actorUserId = req.user?.userId;
  const actorRole = req.user?.role ?? "member";
  const targetUserId = req.params.userId;

  if (!targetUserId) {
    throw new ValidationError("userId parameter is required", {
      operation: "handleRemoveMember",
      metadata: { field: "userId" },
    });
  }

  // Cannot remove self
  if (actorUserId === targetUserId) {
    throw new ValidationError("Cannot remove yourself from the organization", {
      operation: "handleRemoveMember",
    });
  }

  // Fetch target member to check current role
  const members = await findMembersByTenant(tenantId);
  const targetMember = members.find((member) => member.userId === targetUserId);

  if (!targetMember) {
    throw new NotFoundError("Member not found in this organization", {
      metadata: { userId: targetUserId },
    });
  }

  // Role hierarchy: actor must outrank or equal target's role
  if (!canModifyTarget(actorRole, targetMember.role)) {
    throw new AuthorizationError("Cannot remove a member with a higher or equal role", {
      operation: "handleRemoveMember",
    });
  }

  // Last owner protection
  if (targetMember.role === "owner") {
    const ownerCount = await countOwnersByTenant(tenantId);
    if (ownerCount <= 1) {
      throw new ValidationError(
        "Cannot remove the last owner. Promote another member to owner first.",
        { operation: "handleRemoveMember" }
      );
    }
  }

  const removed = await removeMemberFromTenant(tenantId, targetUserId);

  if (!removed) {
    throw new NotFoundError("Member not found in this organization", {
      metadata: { userId: targetUserId },
    });
  }

  logger.info("Member removed from organization", {
    ...context,
    targetUserId,
    removedRole: targetMember.role,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.MEMBER_REMOVED,
      { targetUserId, removedRole: targetMember.role },
      actorUserId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log member removal audit event", {
      ...context,
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.NO_CONTENT).send();
};

/**
 * POST /api/v1/team/members/:userId/revoke-sessions
 * Revoke all sessions for a team member (force-logout).
 * Revokes all refresh tokens in the database and sets a Redis status
 * flag to block JWT-based access for the remainder of the token lifetime.
 * Requires admin or owner role. Enforces role hierarchy.
 */
const handleRevokeUserSessions = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const actorUserId = req.user?.userId;
  const actorRole = req.user?.role ?? "member";
  const targetUserId = req.params.userId;

  if (!targetUserId) {
    throw new ValidationError("userId parameter is required", {
      operation: "handleRevokeUserSessions",
      metadata: { field: "userId" },
    });
  }

  // Cannot revoke own sessions via this admin endpoint
  if (actorUserId === targetUserId) {
    throw new ValidationError("Cannot revoke your own sessions. Use the logout endpoint instead.", {
      operation: "handleRevokeUserSessions",
    });
  }

  // Verify target is a member of this organization
  const members = await findMembersByTenant(tenantId);
  const targetMember = members.find((member) => member.userId === targetUserId);

  if (!targetMember) {
    throw new NotFoundError("Member not found in this organization", {
      metadata: { userId: targetUserId },
    });
  }

  // Role hierarchy: actor must outrank or equal target's role
  if (!canModifyTarget(actorRole, targetMember.role)) {
    throw new AuthorizationError(
      "Cannot revoke sessions for a member with a higher or equal role",
      {
        operation: "handleRevokeUserSessions",
      }
    );
  }

  // 1. Revoke all refresh tokens in the database
  const revokedCount = await revokeAllTokensByUser(targetUserId);

  // 2. Set Redis status flag to block JWT-based access
  await setUserStatusFlag(targetUserId, "revoked");

  logger.info("User sessions revoked", {
    ...context,
    targetUserId,
    targetRole: targetMember.role,
    revokedTokenCount: revokedCount,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.MEMBER_SESSIONS_REVOKED,
      { targetUserId, targetRole: targetMember.role, revokedTokenCount: revokedCount },
      actorUserId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log session revocation audit event", {
      ...context,
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.OK).json({
    data: {
      userId: targetUserId,
      revokedTokenCount: revokedCount,
      status: "revoked",
    },
  });
};

/**
 * POST /api/v1/team/revoke-all-sessions
 * Revoke all sessions for every member of the organization (tenant-wide force-logout).
 * Revokes all refresh tokens for all users in the org and sets a Redis tenant
 * status flag to block JWT-based access for the remainder of the token lifetime.
 * Requires owner role.
 */
const handleRevokeTenantSessions = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const actorUserId = req.user?.userId;

  // 1. Revoke all refresh tokens for all users in the tenant
  const revokedCount = await revokeAllTenantTokens(tenantId);

  // 2. Set Redis tenant status flag to block JWT-based access
  await setTenantStatusFlag(tenantId, "revoked");

  logger.info("All tenant sessions revoked", {
    ...context,
    revokedTokenCount: revokedCount,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.TENANT_SESSIONS_REVOKED,
      { revokedTokenCount: revokedCount },
      actorUserId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log tenant session revocation audit event", {
      ...context,
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.OK).json({
    data: {
      tenantId,
      revokedTokenCount: revokedCount,
      status: "revoked",
    },
  });
};

/** Grace period in days before hard deletion */
const DELETION_GRACE_PERIOD_DAYS = 30;

/**
 * DELETE /api/v1/tenant
 * Soft-delete the tenant (marks as deleted, revokes sessions).
 * A 30-day grace period applies before hard deletion.
 * Requires owner role.
 */
const handleDeleteTenant = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const actorUserId = req.user?.userId;
  const { reason } = req.body as { readonly reason?: string };

  const { tokensRevoked } = await softDeleteTenant(tenantId, reason);

  logger.info("Tenant soft-deleted", {
    tenantId: context.tenantId,
    tokensRevoked,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.DELETED,
      { reason: reason ?? "Owner-initiated deletion", tokensRevoked },
      actorUserId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log tenant deletion audit event", {
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.OK).json({
    data: {
      tenantId,
      status: "deleted",
      gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
      tokensRevoked,
    },
  });
};

/**
 * POST /api/v1/tenant/reactivate
 * Reactivate a suspended tenant after validating prerequisites.
 * Checks that:
 *  1. The tenant is currently suspended (not deleted)
 *  2. At least one provider connection is still active
 *  3. The subscription is not past_due or canceled
 * On success, sets status to active and clears Redis blocking flags.
 * Requires owner role.
 */
const handleReactivateTenant = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const actorUserId = req.user?.userId;

  // 1. Verify tenant is currently suspended
  const tenant = await findById(tenantId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found", {
      metadata: { tenantId },
    });
  }

  if (tenant.status === TENANT_STATUS.DELETED) {
    throw new ValidationError("Cannot reactivate a deleted tenant. Contact support.", {
      operation: "handleReactivateTenant",
      metadata: { currentStatus: tenant.status },
    });
  }

  if (tenant.status === TENANT_STATUS.ACTIVE) {
    throw new ValidationError("Tenant is already active", {
      operation: "handleReactivateTenant",
      metadata: { currentStatus: tenant.status },
    });
  }

  // 2. Validate at least one provider connection exists
  const connections = await findByTenant(tenantId);
  if (connections.length === 0) {
    throw new ValidationError(
      "Cannot reactivate: no provider connections found. Re-install the GitHub App or OAuth integration first.",
      { operation: "handleReactivateTenant" }
    );
  }

  // 3. Validate subscription is not past_due or canceled
  const subscriptionWithPlan = await getSubscriptionWithPlan(tenantId);
  if (subscriptionWithPlan) {
    const { subscription } = subscriptionWithPlan;
    if (subscription.status === "past_due" || subscription.status === "canceled") {
      throw new ValidationError(
        `Cannot reactivate: subscription status is "${subscription.status}". Please resolve billing first.`,
        {
          operation: "handleReactivateTenant",
          metadata: { subscriptionStatus: subscription.status },
        }
      );
    }
  }

  // 4. Reactivate: update DB status and clear Redis flag
  await activate(tenantId);
  await clearTenantStatusFlag(tenantId);

  logger.info("Tenant reactivated", {
    ...context,
    previousStatus: tenant.status,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.ACTIVATED,
      { previousStatus: tenant.status, reactivatedBy: actorUserId },
      actorUserId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log reactivation audit event", {
      ...context,
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.OK).json({
    data: {
      tenantId,
      status: "active",
      previousStatus: tenant.status,
      connectionsCount: connections.length,
    },
  });
};

// ==================== Route Definitions ====================

router.get(
  "/api/v1/team/members",
  rateLimitByCategory("readonly"),
  asyncHandler(handleListMembers)
);

router.patch(
  "/api/v1/team/members/:userId/role",
  rateLimitByCategory("standard"),
  requireRole("admin", "owner"),
  asyncHandler(handleChangeRole)
);

router.delete(
  "/api/v1/team/members/:userId",
  rateLimitByCategory("standard"),
  requireRole("admin", "owner"),
  asyncHandler(handleRemoveMember)
);

router.post(
  "/api/v1/team/members/:userId/revoke-sessions",
  rateLimitByCategory("standard"),
  requireRole("admin", "owner"),
  asyncHandler(handleRevokeUserSessions)
);

router.post(
  "/api/v1/team/revoke-all-sessions",
  rateLimitByCategory("standard"),
  requireRole("owner"),
  asyncHandler(handleRevokeTenantSessions)
);

router.delete(
  "/api/v1/tenant",
  rateLimitByCategory("standard"),
  requireRole("owner"),
  asyncHandler(handleDeleteTenant)
);

router.post(
  "/api/v1/tenant/reactivate",
  rateLimitByCategory("standard"),
  requireRole("owner"),
  asyncHandler(handleReactivateTenant)
);

export { router as teamRoutes };
