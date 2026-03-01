/**
 * Organization Routes
 *
 * Endpoints for listing, switching, and managing user organization memberships.
 * All endpoints require authentication (JWT via auth middleware).
 *
 * @module routes/organizationRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  AuthorizationError,
  ValidationError,
  HTTP_STATUS,
  getErrorMessage,
  findOrganizationsByUser,
  switchUserOrganization,
  setDefaultOrganization,
  findUserById,
  findUserOrgRole,
  generateAccessToken,
  setAccessTokenCookie,
  logAuditEvent,
  AUDIT_ACTIONS,
  TENANT_STATUS,
  rateLimitByCategory,
  findByTenant,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("organization-routes");

// ==================== Route Handlers ====================

/**
 * GET /api/v1/organizations
 * Returns all organizations the authenticated user belongs to.
 */
const handleGetOrganizations = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const userId = req.user?.userId;

  if (!userId) {
    throw new AuthorizationError("Authentication required", {
      operation: "getOrganizations",
    });
  }

  const organizations = await findOrganizationsByUser(userId);

  logger.info("User organizations retrieved", {
    userId,
    count: organizations.length,
    ...context,
  });

  res.status(HTTP_STATUS.OK).json({
    data: organizations.map((org) => ({
      id: org.id,
      tenantId: org.tenantId,
      orgName: org.orgName,
      provider: org.provider,
      role: org.role,
      isDefault: org.isDefault,
      tenantStatus: org.tenantStatus,
      tenantType: org.tenantType,
      joinedAt: org.joinedAt.toISOString(),
    })),
  });
};

/**
 * POST /api/v1/organizations/switch
 * Switch the user's active organization.
 * Body: { organizationId: string }
 */
const handleSwitchOrganization = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const userId = req.user?.userId;

  if (!userId) {
    throw new AuthorizationError("Authentication required", {
      operation: "switchOrganization",
    });
  }

  const body = req.body as { readonly organizationId?: string } | undefined;
  const organizationId = body?.organizationId;

  if (!organizationId || typeof organizationId !== "string" || organizationId.trim().length === 0) {
    throw new ValidationError("organizationId is required", {
      operation: "switchOrganization",
      metadata: { field: "organizationId" },
    });
  }

  // Verify user has membership in this organization
  const organizations = await findOrganizationsByUser(userId);
  const targetOrg = organizations.find((org) => org.tenantId === organizationId);

  if (!targetOrg) {
    throw new AuthorizationError("User is not a member of this organization", {
      operation: "switchOrganization",
      metadata: { organizationId },
    });
  }

  // Reject switching to suspended or deleted tenants
  if (targetOrg.tenantStatus === TENANT_STATUS.SUSPENDED) {
    throw new AuthorizationError(
      "Cannot switch to a suspended organization. Please contact support.",
      { operation: "switchOrganization", metadata: { organizationId } }
    );
  }
  if (targetOrg.tenantStatus === TENANT_STATUS.DELETED) {
    throw new AuthorizationError("Cannot switch to a deactivated organization.", {
      operation: "switchOrganization",
      metadata: { organizationId },
    });
  }

  // Switch the user's selected organization
  await switchUserOrganization(userId, organizationId);
  await setDefaultOrganization(userId, organizationId);

  // Re-fetch user to get updated state for new JWT
  const updatedUser = await findUserById(userId);

  if (!updatedUser) {
    throw new AuthorizationError("User not found after switch", {
      operation: "switchOrganization",
    });
  }

  // Generate new access token with per-org role
  const orgRole = await findUserOrgRole(userId, organizationId);
  const newAccessToken = generateAccessToken(updatedUser, orgRole ?? undefined);

  // Set only the access token cookie — refresh token must stay untouched
  setAccessTokenCookie(res, newAccessToken);

  logger.info("Organization switched", {
    userId,
    newTenantId: organizationId,
    orgName: targetOrg.orgName,
    ...context,
  });

  // Check whether the target org has provider connections (GitHub/GitLab app installed)
  const connections = await findByTenant(organizationId);
  const hasProviderConnection = connections.length > 0;

  // Best-effort audit log
  try {
    await logAuditEvent(
      organizationId,
      AUDIT_ACTIONS.ORG_SWITCHED,
      { userId, previousTenantId: req.user?.tenantId },
      userId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log org switch audit event", {
      ...context,
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.OK).json({
    data: {
      tenantId: targetOrg.tenantId,
      orgName: targetOrg.orgName,
      provider: targetOrg.provider,
      role: orgRole ?? targetOrg.role,
      hasProviderConnection,
    },
  });
};

// ==================== Route Definitions ====================

router.get(
  "/api/v1/organizations",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetOrganizations)
);
router.post(
  "/api/v1/organizations/switch",
  rateLimitByCategory("standard"),
  asyncHandler(handleSwitchOrganization)
);

export { router as organizationRoutes };
