/**
 * Triage Routes
 *
 * REST endpoints for querying triage results and pipeline metrics.
 *
 * - GET /api/v1/triage/:id — Single triage result with all enrichment
 * - GET /api/v1/triage/stats — Pipeline metrics (severity distribution, dispatch rates, etc.)
 *
 * @module routes/triageRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  asyncHandler,
  createLogger,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  getTriageResultById,
  getTriageStats,
  getSeverityDistributionBySource,
} from "@kenchi/shared";
import { mapStatsToMetrics } from "../services/metricsService.js";

const router = Router();
const logger = createLogger("triage-routes");

// ==================== Helpers ====================

/**
 * Extract tenantId from authenticated user or throw (VULN-006).
 */
const requireTenantId = (req: Request): string => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    throw new AuthorizationError(
      "No organization linked. Connect a GitHub or GitLab account to get started.",
      { operation: "requireTenantId" }
    );
  }

  return tenantId;
};

// ==================== Handlers ====================

/**
 * GET /api/v1/triage/stats
 * Pipeline metrics aggregated per tenant.
 *
 * NOTE: This route must be registered BEFORE /api/v1/triage/:id
 * to prevent Express from matching "stats" as an :id parameter.
 */
const handleTriageStats = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const stats = await getTriageStats(tenantId);
  const metrics = mapStatsToMetrics(stats);

  logger.info("Retrieved triage stats", {
    tenantId,
    totalTriaged: metrics.pipeline.totalTriaged,
  });

  res.status(HTTP_STATUS.OK).json({ data: metrics });
};

/**
 * GET /api/v1/triage/:id
 * Single triage result with all enrichment data.
 */
const handleGetTriageResult = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id?.trim()) {
    throw new ValidationError("Triage result ID is required");
  }

  const tenantId = requireTenantId(req);
  const result = await getTriageResultById(id);
  if (!result) {
    throw new NotFoundError("Triage result not found", { metadata: { id } });
  }

  // Tenant isolation: verify the record belongs to the authenticated tenant (VULN-006)
  if (result.tenantId !== tenantId) {
    throw new NotFoundError("Triage result not found", { metadata: { id } });
  }

  res.status(HTTP_STATUS.OK).json({ data: result });
};

/**
 * GET /api/v1/triage/stats/severity-by-source
 * Severity distribution grouped by alert source.
 */
const handleSeverityBySource = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const distribution = await getSeverityDistributionBySource(tenantId);

  logger.info("Retrieved severity distribution by source", {
    tenantId,
    entryCount: distribution.length,
  });

  res.status(HTTP_STATUS.OK).json({ data: distribution });
};

// ==================== Route Registration ====================
// Static paths registered before /:id to avoid matching "stats" as an ID

router.get("/api/v1/triage/stats", asyncHandler(handleTriageStats));
router.get("/api/v1/triage/stats/severity-by-source", asyncHandler(handleSeverityBySource));
router.get("/api/v1/triage/:id", asyncHandler(handleGetTriageResult));

export { router as triageRoutes };
