/**
 * Authorization Middleware
 *
 * Express middleware that enforces role-based, permission-based, and
 * plan-feature-based access control.
 *
 * Three levels of authorization:
 * - `requireRole()` — checks the user's role directly (owner, admin, member, viewer)
 * - `requirePermission()` — checks fine-grained permissions derived from roles
 * - `requireFeature()` — checks plan-level boolean feature flags
 *
 * The ROLE_PERMISSIONS map mirrors the frontend's usePermissions hook to ensure
 * consistent access control across frontend and backend.
 *
 * Must be placed AFTER authMiddleware in the middleware chain.
 *
 * @module http/authorizationMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { AuthenticationError, AuthorizationError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import type { UserRole } from "../database/user/types.js";
import { getSubscriptionWithPlan } from "../database/subscription/repository.js";
import { hasPlanFeature } from "../database/subscription/helpers.js";
import type { PlanFeatureKey } from "../database/subscription/types.js";
import { ERROR_CODES } from "../constants/http.js";

const logger = createLogger("authorization");

// ==================== Permission Types ====================

export type Permission =
  | "team.manage"
  | "billing"
  | "settings"
  | "analyses.read"
  | "analyses.write"
  | "integrations.manage"
  | "members.invite"
  | "members.remove";

// ==================== Permission Map ====================

/**
 * Static role-to-permission mapping.
 * Mirrors the frontend's usePermissions hook (hooks/usePermissions.ts).
 */
const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  owner: new Set<Permission>([
    "team.manage",
    "billing",
    "settings",
    "analyses.read",
    "analyses.write",
    "integrations.manage",
    "members.invite",
    "members.remove",
  ]),
  admin: new Set<Permission>([
    "team.manage",
    "billing",
    "settings",
    "analyses.read",
    "analyses.write",
    "integrations.manage",
    "members.invite",
    "members.remove",
  ]),
  member: new Set<Permission>(["analyses.read", "analyses.write"]),
  viewer: new Set<Permission>(["analyses.read"]),
};

/**
 * Check whether a role holds a given permission.
 * Pure function usable outside of Express middleware context.
 */
export const roleHasPermission = (role: UserRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role]?.has(permission) ?? false;

/**
 * Check whether a role holds at least one of the given permissions.
 */
export const roleHasAnyPermission = (role: UserRole, permissions: readonly Permission[]): boolean =>
  permissions.some((perm) => roleHasPermission(role, perm));

/**
 * Express middleware that enforces role-based access control.
 * Requires that the authenticated user has one of the allowed roles.
 *
 * Must be placed AFTER authMiddleware in the middleware chain so that
 * req.user is populated.
 *
 * @param allowedRoles - Roles permitted to access the route
 */
export const requireRole =
  (...allowedRoles: readonly UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { user } = req;

    if (!user) {
      next(
        new AuthenticationError("Not authenticated", {
          operation: "requireRole",
        })
      );
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      logger.warn("Authorization denied - insufficient role", {
        userId: user.userId,
        actualRole: user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
      });
      next(
        new AuthorizationError("Insufficient permissions for this operation", {
          operation: "requireRole",
          metadata: { requiredRoles: [...allowedRoles] },
        })
      );
      return;
    }

    next();
  };

// ==================== Permission-Based Middleware ====================

/**
 * Express middleware that enforces permission-based access control.
 * Derives permissions from the user's role via ROLE_PERMISSIONS map.
 *
 * Accepts one or more permissions — the user must hold ALL of them.
 * For OR semantics (user needs at least one), use requireAnyPermission().
 *
 * Must be placed AFTER authMiddleware in the middleware chain.
 *
 * @param requiredPermissions - Permissions the user must hold (AND logic)
 */
export const requirePermission =
  (...requiredPermissions: readonly Permission[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { user } = req;

    if (!user) {
      next(
        new AuthenticationError("Not authenticated", {
          operation: "requirePermission",
        })
      );
      return;
    }

    const missingPermissions = requiredPermissions.filter(
      (perm) => !roleHasPermission(user.role, perm)
    );

    if (missingPermissions.length > 0) {
      logger.warn("Authorization denied - missing permissions", {
        userId: user.userId,
        role: user.role,
        requiredPermissions,
        missingPermissions,
        path: req.path,
        method: req.method,
      });
      next(
        new AuthorizationError("Insufficient permissions for this operation", {
          operation: "requirePermission",
          metadata: { requiredPermissions: [...requiredPermissions], missingPermissions },
        })
      );
      return;
    }

    next();
  };

/**
 * Express middleware that enforces permission-based access control with OR semantics.
 * The user must hold at least one of the specified permissions.
 *
 * @param permissions - Permissions to check (OR logic — user needs at least one)
 */
export const requireAnyPermission =
  (...permissions: readonly Permission[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { user } = req;

    if (!user) {
      next(
        new AuthenticationError("Not authenticated", {
          operation: "requireAnyPermission",
        })
      );
      return;
    }

    if (!roleHasAnyPermission(user.role, permissions)) {
      logger.warn("Authorization denied - no matching permission", {
        userId: user.userId,
        role: user.role,
        requiredPermissions: permissions,
        path: req.path,
        method: req.method,
      });
      next(
        new AuthorizationError("Insufficient permissions for this operation", {
          operation: "requireAnyPermission",
          metadata: { requiredPermissions: [...permissions] },
        })
      );
      return;
    }

    next();
  };

// ==================== Feature-Based Middleware ====================

/**
 * Express middleware that enforces plan-feature-based access control.
 * Checks whether the tenant's subscription plan includes the required features.
 *
 * Accepts one or more feature keys — the plan must include ALL of them.
 *
 * Must be placed AFTER authMiddleware in the middleware chain.
 *
 * @param requiredFeatures - Plan feature keys the tenant must have (AND logic)
 */
export const requireFeature =
  (...requiredFeatures: readonly PlanFeatureKey[]) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { user } = req;

    if (!user) {
      next(
        new AuthenticationError("Not authenticated", {
          operation: "requireFeature",
        })
      );
      return;
    }

    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(
        new AuthorizationError("No tenant context", {
          operation: "requireFeature",
        })
      );
      return;
    }

    const subscription = await getSubscriptionWithPlan(tenantId);
    if (!subscription) {
      next(
        new AuthorizationError("No active subscription", {
          operation: "requireFeature",
        })
      );
      return;
    }

    const missingFeatures = requiredFeatures.filter(
      (feature) => !hasPlanFeature(subscription.plan, feature)
    );

    if (missingFeatures.length > 0) {
      logger.warn("Feature gate denied", {
        userId: user.userId,
        tenantId,
        plan: subscription.plan.displayName,
        requiredFeatures,
        missingFeatures,
        path: req.path,
        method: req.method,
      });
      next(
        new AuthorizationError("Feature not available on your current plan", {
          operation: "requireFeature",
          metadata: {
            code: ERROR_CODES.FEATURE_NOT_AVAILABLE,
            requiredFeatures: [...requiredFeatures],
            missingFeatures,
            currentPlan: subscription.plan.displayName,
          },
        })
      );
      return;
    }

    next();
  };
