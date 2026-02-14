/**
 * Authorization Middleware
 *
 * Express middleware that enforces role-based access control (RBAC).
 * Requires that the authenticated user (set by authMiddleware) has one
 * of the allowed roles before the request proceeds.
 *
 * @module http/authorizationMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { AuthenticationError, AuthorizationError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import type { UserRole } from "../database/user/types.js";

const logger = createLogger("authorization");

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
