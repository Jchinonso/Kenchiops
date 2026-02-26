/**
 * Internal Service Authentication Middleware
 *
 * Express middleware factory that verifies HMAC-signed internal service requests.
 * When INTERNAL_SERVICE_SECRET is not configured, passes through (dev mode).
 *
 * @module http/internalAuthMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../core/config.js";
import { AuthenticationError, invariant } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import {
  INTERNAL_AUTH_HEADERS,
  verifyInternalSignature,
  resolveServiceSecret,
} from "./internalAuth.js";

const logger = createLogger("internal-auth-middleware");

// let: tracks whether warning was already emitted to avoid log spam
let warnedMissingSecret = false;

/**
 * Extended Express Request that may carry rawBody (from express.json verify).
 * `req.context` is globally augmented by requestContextMiddleware.
 */
interface InternalAuthRequest extends Request {
  readonly rawBody?: Buffer;
}

/** Configuration options for the internal auth middleware. */
interface InternalAuthOptions {
  /** Path prefixes that skip authentication (e.g., "/health", "/ready"). */
  readonly publicPaths?: readonly string[];
}

/**
 * Creates Express middleware that verifies HMAC-signed internal service requests.
 * When INTERNAL_SERVICE_SECRET is not configured, passes through (dev mode).
 *
 * @param options - Optional configuration for public paths
 * @returns Express middleware function
 */
export const createInternalAuthMiddleware = (
  options?: InternalAuthOptions
): ((req: Request, res: Response, next: NextFunction) => void) => {
  const publicPaths = options?.publicPaths ?? [];

  return (req: Request, _res: Response, next: NextFunction): void => {
    // Skip public paths
    if (publicPaths.some((prefix) => req.path.startsWith(prefix))) {
      next();
      return;
    }

    const signature = req.headers[INTERNAL_AUTH_HEADERS.SIGNATURE] as string | undefined;
    const timestamp = req.headers[INTERNAL_AUTH_HEADERS.TIMESTAMP] as string | undefined;
    const serviceName = req.headers[INTERNAL_AUTH_HEADERS.SERVICE] as string | undefined;

    // Resolve per-service secret first, then fall back to INTERNAL_SERVICE_SECRET
    const secret = resolveServiceSecret(serviceName, config);
    if (!secret) {
      // Fail fast in production — unauthenticated internal requests are not acceptable
      invariant(
        config.NODE_ENV !== "production",
        "INTERNAL_SERVICE_SECRET must be configured in production"
      );
      if (!warnedMissingSecret) {
        logger.warn("No service HMAC secret configured — internal auth disabled (dev only)");
        warnedMissingSecret = true;
      }
      next();
      return;
    }

    if (!signature || !timestamp) {
      next(
        new AuthenticationError("Missing internal authentication headers", {
          operation: "internalAuth",
        })
      );
      return;
    }

    // Use raw body if available (Buffer captured by express.json verify), otherwise JSON.stringify.
    // For GET requests with no body, rawBody and req.body are both undefined — use "" to match signing side.
    const typedReq = req as InternalAuthRequest;
    const rawBody =
      typedReq.rawBody !== undefined && typedReq.rawBody !== null
        ? typedReq.rawBody.toString("utf-8")
        : req.body === undefined
          ? ""
          : JSON.stringify(req.body);

    if (!verifyInternalSignature(signature, timestamp, rawBody, secret)) {
      logger.warn("Internal auth signature verification failed", {
        path: req.path,
        service: serviceName ?? "unknown",
      });
      next(
        new AuthenticationError("Invalid internal authentication signature", {
          operation: "internalAuth",
        })
      );
      return;
    }

    // Enrich request context with calling service info
    if (serviceName) {
      Object.assign(req, {
        context: { ...req.context, actor: `service:${serviceName}` },
      });
    }

    // For internal service calls, propagate tenant_id from request body (POST) or
    // x-kenchi-tenant-id header (GET/bodyless methods) to req.user
    // so that requireTenantId() can authorize the request.
    const bodyTenantId =
      (req.body as Record<string, unknown> | undefined)?.tenant_id ??
      (req.headers[INTERNAL_AUTH_HEADERS.TENANT_ID] as string | undefined);
    if (typeof bodyTenantId === "string" && bodyTenantId) {
      Object.assign(req, {
        user: { ...req.user, tenantId: bodyTenantId, role: "service" },
      });
    }

    next();
  };
};

/**
 * Reset the warning flag for testing purposes.
 * @internal
 */
export const resetInternalAuthWarning = (): void => {
  warnedMissingSecret = false;
};
