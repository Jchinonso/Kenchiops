/**
 * Tenant Status Middleware
 *
 * Checks if the authenticated tenant is active before allowing the request
 * through. Returns 403 for suspended or deactivated tenants.
 *
 * Design:
 * - Reads tenantId from req.context (set by authMiddleware)
 * - Caches tenant status in-memory with 60s TTL to avoid DB hit on every request
 * - Fail-open on DB errors: logs warning, allows request through
 * - Skips health/ready endpoints and "system" tenant (background jobs)
 *
 * @module middleware/tenantStatusMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger, findById, TENANT_STATUS, getErrorMessage } from "@kenchi/shared";

const logger = createLogger("tenant-status-middleware");

// ==================== Cache Configuration ====================

/** Cache TTL in milliseconds (60 seconds) */
const CACHE_TTL_MS = 60_000;

/** Tenant status cached entry */
interface CachedStatus {
  readonly status: string;
  readonly expiresAt: number;
}

/** In-memory tenant status cache */
const statusCache: Map<string, CachedStatus> = new Map();

/** Routes that skip tenant status checks */
const SKIP_PREFIXES: readonly string[] = ["/health", "/live", "/ready"];

/** Tenant ID used by background jobs -- always allowed */
const SYSTEM_TENANT_ID = "system";

// ==================== Cache Helpers ====================

const getCachedStatus = (tenantId: string): string | null => {
  const cached = statusCache.get(tenantId);
  if (!cached) {
    return null;
  }
  if (Date.now() > cached.expiresAt) {
    statusCache.delete(tenantId);
    return null;
  }
  return cached.status;
};

const setCachedStatus = (tenantId: string, status: string): void => {
  statusCache.set(tenantId, {
    status,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

const shouldSkipCheck = (path: string): boolean =>
  SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));

// ==================== Middleware ====================

/**
 * Express middleware that rejects requests from suspended/deactivated tenants.
 *
 * Must be registered AFTER authMiddleware so req.context.tenantId is available.
 * Fail-open: if the DB lookup fails, the request is allowed through with a warning log.
 */
export const tenantStatusMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (shouldSkipCheck(req.path)) {
    next();
    return;
  }

  const tenantId = req.context?.tenantId;

  // No tenantId means auth didn't resolve one (public route, internal call, etc.)
  if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
    next();
    return;
  }

  // Check cache first
  const cachedStatus = getCachedStatus(tenantId);
  const status = cachedStatus ?? (await lookupTenantStatus(tenantId));

  if (status === null) {
    // Fail-open: DB lookup failed or tenant not found, allow through
    next();
    return;
  }

  // Cache the result
  if (!cachedStatus) {
    setCachedStatus(tenantId, status);
  }

  if (status === TENANT_STATUS.SUSPENDED) {
    res.status(403).json({
      error: {
        code: "TENANT_SUSPENDED",
        message: "Your organization has been suspended. Please contact support.",
        requestId: req.context?.requestId,
      },
    });
    return;
  }

  if (status === TENANT_STATUS.DELETED) {
    res.status(403).json({
      error: {
        code: "TENANT_DEACTIVATED",
        message: "Your organization has been deactivated. Please contact support.",
        requestId: req.context?.requestId,
      },
    });
    return;
  }

  next();
};

// ==================== Internals ====================

/**
 * Look up tenant status from the database.
 * Returns null on any failure (fail-open).
 */
const lookupTenantStatus = async (tenantId: string): Promise<string | null> => {
  const startTime = Date.now();
  try {
    const tenant = await findById(tenantId);
    const durationMs = Date.now() - startTime;
    logger.debug("Tenant status lookup completed", {
      provider: "postgres",
      operation: "findTenantById",
      tenantId,
      durationMs,
      status: tenant?.status ?? "not_found",
    });
    return tenant?.status ?? null;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.warn("Failed to look up tenant status, allowing request through", {
      provider: "postgres",
      operation: "findTenantById",
      tenantId,
      durationMs,
      error: getErrorMessage(error),
    });
    return null;
  }
};
