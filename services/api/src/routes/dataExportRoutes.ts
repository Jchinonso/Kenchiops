/**
 * Data Export Routes
 *
 * API endpoints for GDPR Article 20 data portability.
 * Allows tenant admins/owners to create and retrieve data exports.
 *
 * @module routes/dataExportRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  requireTenantId,
  requirePermission,
  requireFeature,
  NotFoundError,
  HTTP_STATUS,
  AUDIT_ACTIONS,
  logAuditEvent,
  getErrorMessage,
  rateLimitByCategory,
  createExportJob,
  getExportJob,
  listExportJobs,
  type DataExport,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("data-export-routes");

// ==================== DTO Mappers ====================

const mapExportToResponse = (exportJob: DataExport): Record<string, unknown> => ({
  id: exportJob.id,
  status: exportJob.status,
  requestedBy: exportJob.requestedBy,
  downloadUrl: exportJob.downloadUrl,
  expiresAt: exportJob.expiresAt?.toISOString() ?? null,
  errorMessage: exportJob.errorMessage,
  createdAt: exportJob.createdAt.toISOString(),
  completedAt: exportJob.completedAt?.toISOString() ?? null,
});

// ==================== Route Handlers ====================

/**
 * POST /api/v1/tenant/export
 * Create a new data export for the authenticated user's organization.
 * Requires admin or owner role.
 */
const handleCreateExport = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const userId = req.user?.userId ?? "unknown";

  const exportJob = await createExportJob(tenantId, userId);

  logger.info("Data export job created", {
    exportId: exportJob.id,
    tenantId: context.tenantId,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.DELETED, // Closest available audit action for data export
      { exportId: exportJob.id, userId },
      userId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log data export audit event", {
      error: getErrorMessage(auditError),
    });
  }

  res.status(HTTP_STATUS.ACCEPTED).json({
    data: mapExportToResponse(exportJob),
  });
};

/**
 * GET /api/v1/tenant/export/:exportId
 * Poll the status of a specific data export job.
 * Requires admin or owner role.
 */
const handleGetExport = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { exportId } = req.params;

  const exportJob = await getExportJob(exportId, tenantId);

  if (!exportJob) {
    throw new NotFoundError("Export job not found", {
      metadata: { exportId },
    });
  }

  res.status(HTTP_STATUS.OK).json({
    data: mapExportToResponse(exportJob),
  });
};

/**
 * GET /api/v1/tenant/exports
 * List all export jobs for the tenant, most recent first.
 * Requires admin or owner role.
 */
const handleListExports = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const exports = await listExportJobs(tenantId);

  res.status(HTTP_STATUS.OK).json({
    data: exports.map(mapExportToResponse),
  });
};

// ==================== Route Definitions ====================

// SECURITY (VULN-511): Rate limit all data export endpoints
router.post(
  "/api/v1/tenant/export",
  rateLimitByCategory("expensive"),
  requirePermission("settings"),
  requireFeature("apiAccess"),
  asyncHandler(handleCreateExport)
);

router.get(
  "/api/v1/tenant/export/:exportId",
  rateLimitByCategory("readonly"),
  requirePermission("settings"),
  requireFeature("apiAccess"),
  asyncHandler(handleGetExport)
);

router.get(
  "/api/v1/tenant/exports",
  rateLimitByCategory("readonly"),
  requirePermission("settings"),
  requireFeature("apiAccess"),
  asyncHandler(handleListExports)
);

export { router as dataExportRoutes };
