/**
 * Tenant Guard Middleware
 *
 * Utilities for enforcing tenant isolation at the route boundary.
 * Regular users are scoped to their own tenant; admin/owner roles
 * can optionally access other tenants' data.
 *
 * @module http/tenantGuard
 */

import type { Request, Response, NextFunction } from "express";
import { AuthorizationError, createLogger } from "../core/index.js";

const logger = createLogger("tenant-guard");

/** Admin/owner roles that can bypass tenant checks */
const ELEVATED_ROLES = ["admin", "owner"] as const;

/**
 * Check if the authenticated user has an elevated role (admin or owner).
 */
const hasElevatedRole = (req: Request): boolean => {
  const role = req.user?.role;
  return role !== undefined && (ELEVATED_ROLES as readonly string[]).includes(role);
};

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
 * Regular users always get their own tenantId from the JWT.
 * Admin/owner can specify a different tenantId via body, params, or query;
 * falls back to their own tenantId if none is specified.
 *
 * Returns undefined only when the user has no tenantId at all
 * (e.g., user not yet associated with a tenant).
 */
export const getEffectiveTenantId = (req: Request): string | undefined => {
  const userTenantId = req.user?.tenantId ?? undefined;

  if (hasElevatedRole(req)) {
    const requestedTenantId =
      extractBodyTenantId(req) ?? extractParamOrQueryTenantId(req, "tenantId");
    return requestedTenantId ?? userTenantId;
  }

  return userTenantId;
};

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
 * Admin/owner roles can access any tenant's data (bypass check).
 * Regular users attempting cross-tenant access receive a 403 error.
 *
 * Checks tenantId in params, query string, AND request body to cover
 * all route patterns (GET with query, DELETE with params, POST with body).
 *
 * @param paramName - Name of the route param containing tenantId (default: "tenantId")
 */
export const requireTenantMatch =
  (paramName: string = "tenantId") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (hasElevatedRole(req)) {
      next();
      return;
    }

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
