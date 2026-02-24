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
  AuthorizationError,
  ValidationError,
  NotFoundError,
  requireRole,
  HTTP_STATUS,
  getErrorMessage,
  // Repository functions
  findMembersByTenant,
  updateMemberRole,
  removeMemberFromTenant,
  countOwnersByTenant,
  logAuditEvent,
  AUDIT_ACTIONS,
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

/**
 * Extract tenantId from authenticated user or throw.
 *
 * @throws AuthorizationError if no tenant is linked
 */
const requireTenantId = (req: Request): string => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    throw new AuthorizationError(
      "No organization linked. Connect a GitHub or GitLab account to get started.",
      { operation: "requireTenantId" }
    );
  }

  return tenantId;
};

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

// ==================== Route Definitions ====================

router.get("/api/v1/team/members", asyncHandler(handleListMembers));

router.patch(
  "/api/v1/team/members/:userId/role",
  requireRole("admin", "owner"),
  asyncHandler(handleChangeRole)
);

router.delete(
  "/api/v1/team/members/:userId",
  requireRole("admin", "owner"),
  asyncHandler(handleRemoveMember)
);

export { router as teamRoutes };
