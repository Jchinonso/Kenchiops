/**
 * Tenant Guard Middleware
 *
 * Utilities for enforcing tenant isolation at the route boundary.
 * All users are strictly scoped to their own tenant (from JWT).
 * Cross-tenant access is denied regardless of role.
 *
 * @module http/tenantGuard
 */

import type { Request, Response, NextFunction } from "express";
import { AuthorizationError, createLogger } from "../core/index.js";

/**
 * Extract tenantId from authenticated user or throw.
 * Used by route handlers that require a linked tenant.
 *
 * @throws AuthorizationError if no tenant is linked
 */
export const requireTenantId = (req: Request): string => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new AuthorizationError(
      "No organization linked. Connect a GitHub or GitLab account to get started.",
      { operation: "requireTenantId" }
    );
  }
  return tenantId;
};

const logger = createLogger("tenant-guard");

/**
 * Extract the tenantId from the request body safely.
 */
const extractBodyTenantId = (req: Request): string | undefined => {
  const parsed = req.body as Record<string, unknown> | undefined;
  const value = parsed?.tenantId;
  return typeof value === "string" ? value : undefined;
};

/**
 * Extract the tenantId from route params or query string.
 */
const extractParamOrQueryTenantId = (req: Request, paramName: string): string | undefined =>
  req.params[paramName] ??
  (typeof req.query[paramName] === "string" ? (req.query[paramName] as string) : undefined);

/**
 * Get the effective tenantId for the request.
 *
 * All users are scoped to their own tenant from the JWT.
 * No cross-tenant override is allowed regardless of role.
 *
 * Returns undefined only when the user has no tenantId at all
 * (e.g., user not yet associated with a tenant).
 */
export const getEffectiveTenantId = (req: Request): string | undefined =>
  req.user?.tenantId ?? undefined;

/**
 * Extract tenantId from all request sources (params, query, body).
 * Checks in order: params/query first, then body.
 */
const extractRequestedTenantId = (req: Request, paramName: string): string | undefined =>
  extractParamOrQueryTenantId(req, paramName) ?? extractBodyTenantId(req);

/**
 * Express middleware that validates the requested tenantId matches the
 * authenticated user's tenant.
 *
 * All users are strictly scoped — cross-tenant access is denied regardless
 * of role. This prevents horizontal privilege escalation where an admin
 * of tenant A could access tenant B's data.
 *
 * Checks tenantId in params, query string, AND request body to cover
 * all route patterns (GET with query, DELETE with params, POST with body).
 *
 * @param paramName - Name of the route param containing tenantId (default: "tenantId")
 */
export const requireTenantMatch =
  (paramName: string = "tenantId") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const userTenantId = req.user?.tenantId ?? undefined;
    const requestedTenantId = extractRequestedTenantId(req, paramName);

    if (requestedTenantId && requestedTenantId !== userTenantId) {
      logger.warn("Tenant access denied", {
        requestedTenantId,
        userTenantId,
        path: req.path,
        operation: "tenantGuard",
      });
      next(
        new AuthorizationError("Cannot access another tenant's data", {
          operation: "tenantGuard",
        })
      );
      return;
    }

    next();
  };
