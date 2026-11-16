/**
 * Metrics Routes
 *
 * Read-only, tenant-scoped reliability metrics for the dashboard.
 * Requires authentication and a linked tenant.
 *
 * @module routes/metricsRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  requireTenantId,
  HTTP_STATUS,
  PARSE_INT_RADIX,
  rateLimitByCategory,
} from "@kenchi/shared";
import { createMetricsService } from "../services/metricsService.js";

const router = Router();

// ==================== Service Wiring ====================

const metricsService = createMetricsService();

// ==================== Constants ====================

const DEFAULT_TREND_DAYS = 30;
const MIN_TREND_DAYS = 1;
const MAX_TREND_DAYS = 365;

// ==================== Helpers ====================

/** Parse and clamp the `days` query param for the trend window. */
const parseTrendDays = (req: Request): number => {
  const raw = parseInt(String(req.query.days ?? DEFAULT_TREND_DAYS), PARSE_INT_RADIX);
  if (Number.isNaN(raw)) {
    return DEFAULT_TREND_DAYS;
  }
  return Math.min(Math.max(raw, MIN_TREND_DAYS), MAX_TREND_DAYS);
};

// ==================== Route Handlers ====================

const handleGetReliabilityMetrics = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const trendDays = parseTrendDays(req);

  const result = await metricsService.getReliabilityMetrics(tenantId, trendDays, context);

  res.status(HTTP_STATUS.OK).json({ data: result });
};

// ==================== Route Registration ====================

router.get(
  "/api/v1/metrics",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetReliabilityMetrics)
);

export { router as metricsRoutes };
