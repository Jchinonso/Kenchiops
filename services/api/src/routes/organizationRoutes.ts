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
  findOrganizationsByUser,
  switchUserOrganization,
  setDefaultOrganization,
  findUserById,
  generateAccessToken,
  setAccessTokenCookie,
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

  // Generate new access token with the updated tenantId
  const newAccessToken = generateAccessToken(updatedUser);

  // Set only the access token cookie — refresh token must stay untouched
  setAccessTokenCookie(res, newAccessToken);

  logger.info("Organization switched", {
    userId,
    newTenantId: organizationId,
    orgName: targetOrg.orgName,
    ...context,
  });

  res.status(HTTP_STATUS.OK).json({
    data: {
      tenantId: targetOrg.tenantId,
      orgName: targetOrg.orgName,
      provider: targetOrg.provider,
      role: targetOrg.role,
    },
  });
};

// ==================== Route Definitions ====================

router.get("/api/v1/organizations", asyncHandler(handleGetOrganizations));
router.post("/api/v1/organizations/switch", asyncHandler(handleSwitchOrganization));

export { router as organizationRoutes };
