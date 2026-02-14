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
import { AuthenticationError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import type { RequestContext } from "../core/types.js";
import { INTERNAL_AUTH_HEADERS, verifyInternalSignature } from "./internalAuth.js";

const logger = createLogger("internal-auth-middleware");

// let: tracks whether warning was already emitted to avoid log spam
let warnedMissingSecret = false;

/**
 * Extended Express Request that may carry rawBody (from express.json verify)
 * and context (from upstream RequestContext middleware).
 */
interface InternalAuthRequest extends Request {
  readonly rawBody?: Buffer;
  readonly context?: RequestContext;
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

    const secret = config.INTERNAL_SERVICE_SECRET;
    if (!secret) {
      if (!warnedMissingSecret) {
        logger.warn("INTERNAL_SERVICE_SECRET not configured — internal auth disabled");
        warnedMissingSecret = true;
      }
      next();
      return;
    }

    const signature = req.headers[INTERNAL_AUTH_HEADERS.SIGNATURE] as string | undefined;
    const timestamp = req.headers[INTERNAL_AUTH_HEADERS.TIMESTAMP] as string | undefined;
    const serviceName = req.headers[INTERNAL_AUTH_HEADERS.SERVICE] as string | undefined;

    if (!signature || !timestamp) {
      next(
        new AuthenticationError("Missing internal authentication headers", {
          operation: "internalAuth",
        })
      );
      return;
    }

    // Use raw body if available (Buffer captured by express.json verify), otherwise JSON.stringify
    const typedReq = req as InternalAuthRequest;
    const rawBody =
      typedReq.rawBody !== undefined && typedReq.rawBody !== null
        ? typedReq.rawBody.toString("utf-8")
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
    if (serviceName && typedReq.context) {
      const enrichedContext = { ...typedReq.context, actor: `service:${serviceName}` };
      Object.defineProperty(req, "context", {
        value: enrichedContext,
        writable: true,
        configurable: true,
        enumerable: true,
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
