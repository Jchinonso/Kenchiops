/**
 * Express Middleware for Per-Tenant Request Metrics
 *
 * Automatically records request count, duration, and status code
 * with tenant_id label for every API request.
 *
 * @module observability/metricsMiddleware
 */

import type { Request, Response, NextFunction } from "express";
import { apiRequestsTotal, apiRequestDuration } from "./metrics.js";

/**
 * Normalize route paths to prevent cardinality explosion.
 * Replaces UUID-like segments and numeric IDs with placeholders.
 */
const normalizeRoute = (path: string): string =>
  path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+/g, "/:id");

/**
 * Express middleware that records per-tenant API metrics.
 *
 * Must be placed after authMiddleware (needs req.context.tenantId).
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();

  res.on("finish", () => {
    const tenantId = req.context?.tenantId ?? "unknown";
    const { method } = req;
    const route = normalizeRoute(req.path);
    const statusCode = String(res.statusCode);
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;

    const labels = { tenant_id: tenantId, method, route, status_code: statusCode };
    apiRequestsTotal.inc(labels);
    apiRequestDuration.observe(labels, durationSeconds);
  });

  next();
};
