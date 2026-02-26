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
import {
  AuthenticationError,
  AuthorizationError,
  createLogger,
  getErrorMessage,
} from "../core/index.js";
import { config } from "../core/config.js";
import {
  INTERNAL_AUTH_HEADERS,
  verifyInternalSignature,
  resolveServiceSecret,
} from "./internalAuth.js";
import { SERVICE_NAMES } from "../constants/http.js";
import { isUserBlocked, isTenantBlocked } from "../cache/userStatusCache.js";
import type { AuthenticatedUser } from "../database/user/types.js";
import { authenticateApiKey } from "../database/apiKey/repository.js";

/**
 * Set of known internal service names for HMAC actor validation.
 * Prevents arbitrary actor injection via the x-kenchi-service header.
 */
const KNOWN_SERVICE_NAMES: ReadonlySet<string> = new Set(Object.values(SERVICE_NAMES));

/** Maximum allowed length for service name header (defense-in-depth). */
const MAX_SERVICE_NAME_LENGTH = 64;

/**
 * Validate and sanitize a service name from the x-kenchi-service header.
 * Returns the validated name, or "unknown" if invalid/missing.
 */
const validateServiceName = (raw: string | undefined): string => {
  if (!raw || raw.length === 0 || raw.length > MAX_SERVICE_NAME_LENGTH) {
    return "unknown";
  }
  if (KNOWN_SERVICE_NAMES.has(raw)) {
    return raw;
  }
  // Unknown service name — log-safe sanitization (alphanumeric + hyphens only)
  const sanitized = raw.replace(/[^a-zA-Z0-9-]/g, "").slice(0, MAX_SERVICE_NAME_LENGTH);
  return sanitized.length > 0 ? sanitized : "unknown";
};

// ==================== Express Augmentation ====================

/**
 * Extend Express Request with `user` from JWT verification.
 *
 * Note: `req.context` (RequestContext) is augmented globally by
 * requestContextMiddleware.ts — registered before this middleware runs.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ==================== Constants ====================

/** Prefix that identifies API key tokens vs JWT tokens. */
const API_KEY_PREFIX = "kak_";

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

  const rawServiceName = req.headers[INTERNAL_AUTH_HEADERS.SERVICE] as string | undefined;
  const serviceName = validateServiceName(rawServiceName);

  // Resolve per-service secret first, then fall back to INTERNAL_SERVICE_SECRET
  const secret = resolveServiceSecret(rawServiceName, config);
  if (!secret) {
    if (!warnedMissingInternalSecret) {
      logger.warn(
        "HMAC headers present but no service HMAC secret configured — skipping internal auth"
      );
      warnedMissingInternalSecret = true;
    }
    return false;
  }

  // Use raw body buffer when available (captured by express.json verify callback).
  // For bodyless methods (GET/HEAD/DELETE/OPTIONS), express.json initializes the
  // parsed body to an empty object even though nothing was sent. Use empty string
  // for those methods to match the signing side (resilientClient signs "" for no body).
  const reqWithBody = req as RequestWithRawBody;
  const capturedRaw = reqWithBody.rawBody;
  const { method } = req;
  const hasRequestBody = method === "POST" || method === "PUT" || method === "PATCH";
  const rawBody =
    capturedRaw !== undefined && capturedRaw !== null
      ? capturedRaw.toString("utf-8")
      : hasRequestBody
        ? JSON.stringify(req.body)
        : "";

  if (!verifyInternalSignature(signature, timestamp, rawBody, secret)) {
    logger.warn("Internal auth signature verification failed", {
      path: req.path,
      service: serviceName,
    });
    throw new AuthenticationError("Invalid internal authentication signature", {
      operation: "internalAuth",
    });
  }

  // Enrich request context with validated service identity.
  // Object.assign is required because Express middleware must mutate req by design
  // (this is a handler-boundary side effect, allowed per CLAUDE.md rule 3).
  if (serviceName !== "unknown") {
    Object.assign(req, {
      context: { ...req.context, actor: `service:${serviceName}` },
    });
  }

  // For internal service calls, propagate tenant_id from request body to req.user
  // so that requireTenantId() can authorize the request
  const bodyTenantId = (req.body as Record<string, unknown> | undefined)?.tenant_id;
  if (typeof bodyTenantId === "string" && bodyTenantId) {
    Object.assign(req, {
      user: { ...req.user, tenantId: bodyTenantId, role: "service" },
    });
  }

  logger.debug("Internal service auth verified", {
    path: req.path,
    service: serviceName,
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
 * Attempt API key authentication when Bearer token starts with "kak_".
 *
 * @returns AuthenticatedUser if API key is valid, null if token is not an API key,
 *          throws AuthenticationError if API key is invalid/expired.
 */
const tryApiKeyAuth = async (token: string): Promise<AuthenticatedUser | null> => {
  if (!token.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const startTime = Date.now();
  const apiKey = await authenticateApiKey(token);

  if (!apiKey) {
    logger.warn("API key authentication failed", {
      operation: "apiKeyAuth",
      durationMs: Date.now() - startTime,
    });
    throw new AuthenticationError("Invalid or expired API key", {
      operation: "apiKeyAuth",
    });
  }

  return {
    userId: apiKey.userId,
    tenantId: apiKey.tenantId,
    role: apiKey.role as AuthenticatedUser["role"],
    tokenId: `apikey:${apiKey.id}`,
  };
};

/**
 * Apply authenticated user info to the Express request.
 * Uses Object.assign because Express middleware must mutate req by design
 * (this is a handler-boundary side effect, allowed per CLAUDE.md rule 3).
 */
const applyAuthToRequest = (req: Request, user: AuthenticatedUser): void => {
  Object.assign(req, { user });

  // Enrich the existing RequestContext (set by requestContextMiddleware)
  // with the authenticated user's identity and tenant.
  Object.assign(req, {
    context: {
      ...req.context,
      actor: user.userId,
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    },
  });
};

// ==================== Middleware ====================

/**
 * Express middleware that authenticates via HMAC or JWT.
 *
 * - Skips authentication for PUBLIC_ROUTES (health, auth, webhooks)
 * - Checks HMAC internal auth headers first (service-to-service calls)
 * - Falls through to JWT verification for browser clients
 * - Sets req.user (JWT) or enriches req.context.actor (HMAC)
 * - After JWT auth, checks Redis for real-time user status (fail-open)
 * - Calls next(AuthenticationError) for missing/invalid credentials
 */
export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (isPublicRoute(req.path)) {
      next();
      return;
    }

    // Check HMAC-based internal service auth before JWT.
    // If valid HMAC headers are present, bypass JWT entirely.
    // Internal HMAC auth skips user status check (service-to-service).
    try {
      if (tryInternalAuth(req)) {
        next();
        return;
      }
    } catch (error: unknown) {
      next(error);
      return;
    }

    // Fall through to token-based authentication (API key or JWT)
    const token = extractAccessToken(req);

    if (!token) {
      next(
        new AuthenticationError("Missing or malformed Authorization header", {
          operation: "authMiddleware",
        })
      );
      return;
    }

    // Check API key auth first (tokens starting with "kak_").
    // If valid, apply auth and proceed. If not an API key, fall through to JWT.
    try {
      const apiKeyUser = await tryApiKeyAuth(token);
      if (apiKeyUser) {
        applyAuthToRequest(req, apiKeyUser);

        // API key auth still checks tenant status (org-level block)
        if (apiKeyUser.tenantId) {
          const tenantBlocked = await isTenantBlocked(apiKeyUser.tenantId);
          if (tenantBlocked) {
            next(
              new AuthorizationError("Organization is suspended or deactivated", {
                operation: "authMiddleware",
              })
            );
            return;
          }
        }

        next();
        return;
      }
    } catch (error: unknown) {
      next(error);
      return;
    }

    // Fall through to JWT verification
    // let: user is assigned in try/catch for JWT verification and used after
    let user: AuthenticatedUser; // let: assigned in try block, read after
    try {
      user = verifyAccessToken(token);
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) {
        logger.warn("Authentication token rejected", {
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
      return;
    }

    applyAuthToRequest(req, user);

    // Check real-time user status in Redis (fail-open on Redis errors).
    // This prevents suspended/deleted users from using the API during
    // the remainder of their JWT lifetime (~15 minutes).
    const userBlocked = await isUserBlocked(user.userId);
    if (userBlocked) {
      logger.warn("Blocked suspended or revoked user", {
        operation: "authMiddleware",
        path: req.path,
        userId: user.userId,
      });
      next(
        new AuthenticationError("User account is suspended or revoked", {
          operation: "authMiddleware",
        })
      );
      return;
    }

    // Check real-time tenant status in Redis (fail-open on Redis errors).
    // This prevents all users of suspended/deleted organizations from
    // accessing the API during the remainder of their JWT lifetime.
    if (user.tenantId) {
      const tenantBlocked = await isTenantBlocked(user.tenantId);
      if (tenantBlocked) {
        logger.warn("Blocked suspended or deactivated organization", {
          operation: "authMiddleware",
          path: req.path,
          userId: user.userId,
          tenantId: user.tenantId,
        });
        next(
          new AuthorizationError("Organization is suspended or deactivated", {
            operation: "authMiddleware",
          })
        );
        return;
      }
    }

    next();
  } catch (error: unknown) {
    // Catch-all for unexpected errors (e.g., unhandled Redis edge cases).
    // Must not swallow — forward to Express error handler.
    logger.error("Unexpected auth middleware issue", {
      operation: "authMiddleware",
      path: req.path,
      error: getErrorMessage(error),
    });
    next(error);
  }
};
