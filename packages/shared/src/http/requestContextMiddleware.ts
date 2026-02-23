/**
 * Request Context Middleware
 *
 * Express middleware that attaches a {@link RequestContext} to every incoming
 * request. Downstream middleware (e.g. authMiddleware) can enrich the context
 * with actor/tenantId once identity is established.
 *
 * Must be registered before authMiddleware so that `req.context` is always
 * available when auth enrichment runs.
 *
 * @module http/requestContextMiddleware
 */

import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { RequestContext } from "../core/types.js";

// ==================== Express Augmentation ====================

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

// ==================== Middleware ====================

/**
 * Express middleware that creates a {@link RequestContext} on every request.
 *
 * Sets `req.context` with a unique `requestId` (UUID v4) and a default
 * `tenantId` of `"anonymous"`. Auth middleware running later enriches the
 * context with the real tenant and actor identity.
 *
 * Uses `Object.assign` because Express middleware must mutate `req` by design
 * (this is a handler-boundary side effect, allowed per CLAUDE.md rule 3).
 */
export const requestContextMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const context: RequestContext = {
    requestId: crypto.randomUUID(),
    tenantId: "anonymous",
  };

  // Object.assign is required because Express middleware must mutate req by design
  Object.assign(req, { context });

  next();
};
