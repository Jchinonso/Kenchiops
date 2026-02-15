/**
 * Authentication Middleware (JWT + Internal HMAC)
 *
 * Verifies requests on protected routes using two strategies:
 * 1. HMAC-signed internal service requests (checked first — bypasses JWT)
 * 2. JWT Bearer tokens from browser clients
 *
 * Skips auth for public routes defined in PUBLIC_ROUTES.
 * Sets req.user (AuthenticatedUser) for JWT, or enriches req.context for HMAC.
 *
 * @module http/authMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../security/jwt.js";
import { extractAccessToken } from "../security/cookies.js";
import { PUBLIC_ROUTES } from "../constants/auth.js";
import { AuthenticationError, createLogger } from "../core/index.js";
import { config } from "../core/config.js";
import { INTERNAL_AUTH_HEADERS, verifyInternalSignature } from "./internalAuth.js";
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

/** Request that may carry rawBody captured by express.json verify callback. */
interface RequestWithRawBody extends Request {
  readonly rawBody?: Buffer;
}

// let: tracks whether missing-secret warning was already emitted to avoid log spam
let warnedMissingInternalSecret = false; // let: one-time warning flag

/**
 * Attempt HMAC-based internal service authentication.
 *
 * @returns true if internal auth headers are present and valid (request is authenticated).
 *          false if no internal auth headers are present (fall through to JWT).
 *          Throws AuthenticationError if headers are present but invalid.
 */
const tryInternalAuth = (req: Request): boolean => {
  const signature = req.headers[INTERNAL_AUTH_HEADERS.SIGNATURE] as string | undefined;
  const timestamp = req.headers[INTERNAL_AUTH_HEADERS.TIMESTAMP] as string | undefined;

  // No internal auth headers — fall through to JWT
  if (!signature || !timestamp) {
    return false;
  }

  const secret = config.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    if (!warnedMissingInternalSecret) {
      logger.warn(
        "HMAC headers present but INTERNAL_SERVICE_SECRET not configured — skipping internal auth"
      );
      warnedMissingInternalSecret = true;
    }
    return false;
  }

  // Use raw body if available, otherwise re-serialize parsed body
  const typedReq = req as RequestWithRawBody;
  const rawBody =
    typedReq.rawBody !== undefined && typedReq.rawBody !== null
      ? typedReq.rawBody.toString("utf-8")
      : JSON.stringify(req.body);

  if (!verifyInternalSignature(signature, timestamp, rawBody, secret)) {
    const serviceName = req.headers[INTERNAL_AUTH_HEADERS.SERVICE] as string | undefined;
    logger.warn("Internal auth signature verification failed", {
      path: req.path,
      service: serviceName ?? "unknown",
    });
    throw new AuthenticationError("Invalid internal authentication signature", {
      operation: "internalAuth",
    });
  }

  // Enrich request context with calling service identity
  const serviceName = req.headers[INTERNAL_AUTH_HEADERS.SERVICE] as string | undefined;
  const reqWithCtx = req as RequestWithRequestContext;
  if (serviceName && reqWithCtx.context) {
    Object.assign(req, {
      context: { ...reqWithCtx.context, actor: `service:${serviceName}` },
    });
  }

  logger.debug("Internal service auth verified", {
    path: req.path,
    service: serviceName ?? "unknown",
  });

  return true;
};

/**
 * Check if a request path is public (should skip auth).
 * Matches path prefixes from the PUBLIC_ROUTES array.
 */
const isPublicRoute = (path: string): boolean =>
  PUBLIC_ROUTES.some((prefix) => path.startsWith(prefix));

// Token extraction moved to security/cookies.ts (extractAccessToken)
// which checks Authorization Bearer header first, then falls back to cookie.

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
 * Express middleware that authenticates requests via HMAC or JWT.
 *
 * - Skips authentication for PUBLIC_ROUTES (health, auth, webhooks)
 * - Checks HMAC internal auth headers first (service-to-service calls)
 * - Falls through to JWT verification for browser clients
 * - Sets req.user (JWT) or enriches req.context.actor (HMAC)
 * - Calls next(AuthenticationError) for missing/invalid credentials
 */
export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  if (isPublicRoute(req.path)) {
    next();
    return;
  }

  // Check HMAC-based internal service auth before JWT.
  // If valid HMAC headers are present, bypass JWT entirely.
  try {
    if (tryInternalAuth(req)) {
      next();
      return;
    }
  } catch (error: unknown) {
    next(error);
    return;
  }

  // Fall through to JWT authentication
  const token = extractAccessToken(req);

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
