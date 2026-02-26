/**
 * RAG Purge Routes - Privacy & Data Deletion
 *
 * @module routes/rag/purgeRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  requireTenantId,
  requireTenantMatch,
  requirePermission,
  rateLimitByCategory,
  purgeTenantRAGData,
  purgePRDiffChunks,
  purgeKnowledgeDocChunks,
} from "@kenchi/shared";
import type { TenantPurgeResponse, PRPurgeResponse, DocPurgeResponse } from "./types.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Response Builders ====================

/** Builds tenant purge response */
const buildTenantPurgeResponse = (
  tenantId: string,
  result: { readonly deletedCount: number; readonly errors: readonly string[] }
): TenantPurgeResponse => ({
  tenantId,
  deletedCount: result.deletedCount,
  errors: result.errors,
});

/** Builds PR purge response */
const buildPRPurgeResponse = (
  repository: string,
  prNumber: number,
  result: { readonly deletedCount: number; readonly errors: readonly string[] }
): PRPurgeResponse => ({
  repository,
  prNumber,
  deletedCount: result.deletedCount,
  errors: result.errors,
});

/** Builds document purge response */
const buildDocPurgeResponse = (
  parentId: string,
  result: { readonly deletedCount: number; readonly errors: readonly string[] }
): DocPurgeResponse => ({
  parentId,
  deletedCount: result.deletedCount,
  errors: result.errors,
});

// ==================== Route Handlers ====================

/**
 * Handles tenant RAG data purge.
 */
const handlePurgeTenant = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.params;

  if (!tenantId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "tenantId is required",
    });
    return;
  }

  const result = await purgeTenantRAGData(tenantId);

  logger.info("Tenant RAG data purged", {
    tenantId,
    deletedCount: result.deletedCount,
    errorCount: result.errors.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: result.success,
    data: buildTenantPurgeResponse(tenantId, result),
  });
};

/**
 * Handles PR diff chunks purge.
 */
const handlePurgePR = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { repository, prNumber } = req.params;
  const tenantId = requireTenantId(req);

  if (!repository || !prNumber) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "repository and prNumber are required",
    });
    return;
  }

  const prNumberInt = parseInt(prNumber, 10);
  if (isNaN(prNumberInt)) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "prNumber must be a valid number",
    });
    return;
  }

  const result = await purgePRDiffChunks(repository, prNumberInt, tenantId);

  logger.info("PR diff chunks purged", {
    repository,
    prNumber: prNumberInt,
    deletedCount: result.deletedCount,
    errorCount: result.errors.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: result.success,
    data: buildPRPurgeResponse(repository, prNumberInt, result),
  });
};

/**
 * Handles knowledge document purge.
 */
const handlePurgeDoc = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { parentId } = req.params;
  const tenantId = requireTenantId(req);

  if (!parentId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "parentId is required",
    });
    return;
  }

  const result = await purgeKnowledgeDocChunks(parentId, tenantId);

  logger.info("Knowledge document purged", {
    parentId,
    deletedCount: result.deletedCount,
    errorCount: result.errors.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: result.success,
    data: buildDocPurgeResponse(parentId, result),
  });
};

// ==================== Route Definitions ====================

/** DELETE /api/rag/tenant/:tenantId - Purge all tenant RAG data (expensive) */
router.delete(
  API_ROUTES.RAG_PURGE_TENANT,
  rateLimitByCategory("expensive"),
  requirePermission("settings"),
  requireTenantMatch(),
  asyncHandler(handlePurgeTenant)
);

/** DELETE /api/rag/pr/:repository/:prNumber - Purge PR diff chunks (expensive) */
router.delete(
  API_ROUTES.RAG_PURGE_PR,
  rateLimitByCategory("expensive"),
  requirePermission("settings"),
  requireTenantMatch(),
  asyncHandler(handlePurgePR)
);

/** DELETE /api/rag/doc/:parentId - Purge a knowledge document (expensive) */
router.delete(
  API_ROUTES.RAG_PURGE_DOC,
  rateLimitByCategory("expensive"),
  requirePermission("settings"),
  requireTenantMatch(),
  asyncHandler(handlePurgeDoc)
);

export { router as ragPurgeRoutes };
