/**
 * JWT Authentication Middleware
 *
 * Verifies Bearer tokens on protected routes.
 * Skips auth for public routes defined in PUBLIC_ROUTES.
 * Sets req.user (AuthenticatedUser) and updates req.context with actor/tenantId.
 *
 * @module http/authMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../security/jwt.js";
import { PUBLIC_ROUTES } from "../constants/auth.js";
import { AuthenticationError, createLogger } from "../core/index.js";
import type { AuthenticatedUser } from "../database/user/types.js";
import type { RequestContext } from "../core/types.js";

// ==================== Express Augmentation ====================

/**
 * Extend Express Request with `user` from JWT verification.
 *
 * Note: `context` (RequestContext) is NOT added to the global augmentation
 * because existing rate-limit interfaces define incompatible `context` shapes.
 * Instead, the middleware accesses context via a typed cast on the request.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/** Request that carries a RequestContext (set by upstream middleware). */
interface RequestWithRequestContext extends Request {
  readonly context?: RequestContext;
}

// ==================== Helpers ====================

const logger = createLogger("auth-middleware");

/**
 * Check if a request path is public (should skip auth).
 * Matches path prefixes from the PUBLIC_ROUTES array.
 */
const isPublicRoute = (path: string): boolean =>
  PUBLIC_ROUTES.some((prefix) => path.startsWith(prefix));

/**
 * Extract the Bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  return token.length > 0 ? token : null;
};

/**
 * Apply authenticated user info to the Express request.
 * Uses Object.assign because Express middleware must mutate req by design
 * (this is a handler-boundary side effect, allowed per CLAUDE.md rule 3).
 */
const applyAuthToRequest = (req: Request, user: AuthenticatedUser): void => {
  Object.assign(req, { user });

  // Enrich the existing RequestContext if one was set by upstream middleware.
  const reqWithCtx = req as RequestWithRequestContext;
  if (reqWithCtx.context) {
    Object.assign(req, {
      context: {
        ...reqWithCtx.context,
        actor: user.userId,
        ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      },
    });
  }
};

// ==================== Middleware ====================

/**
 * Express middleware that verifies JWT access tokens.
 *
 * - Skips authentication for PUBLIC_ROUTES (health, auth, webhooks)
 * - Extracts Bearer token from Authorization header
 * - Verifies JWT and sets req.user with AuthenticatedUser claims
 * - Updates req.context with actor (userId) and tenantId from JWT
 * - Calls next(AuthenticationError) for missing/invalid tokens
 */
export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  if (isPublicRoute(req.path)) {
    next();
    return;
  }

  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    next(
      new AuthenticationError("Missing or malformed Authorization header", {
        operation: "authMiddleware",
      })
    );
    return;
  }

  try {
    const user = verifyAccessToken(token);

    applyAuthToRequest(req, user);

    next();
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      logger.warn("Authentication failed", {
        operation: "authMiddleware",
        path: req.path,
        message: error.message,
      });
      next(error);
      return;
    }

    next(
      new AuthenticationError("Token verification failed", {
        operation: "authMiddleware",
      })
    );
  }
};
