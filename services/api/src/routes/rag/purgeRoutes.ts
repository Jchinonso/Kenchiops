/**
 * RAG Purge Routes - Privacy & Data Deletion
 *
 * @module routes/rag/purgeRoutes
 */

import { Router } from "express";
import {
  asyncHandler,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  purgeTenantRAGData,
  purgePRDiffChunks,
  purgeKnowledgeDocChunks,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

/**
 * DELETE /api/rag/tenant/:tenantId - Purge all tenant RAG data
 */
router.delete(
  API_ROUTES.RAG_PURGE_TENANT,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;

    if (!tenantId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "tenantId is required",
      });
      return;
    }

    logger.info("Purging tenant RAG data", { tenantId });

    const result = await purgeTenantRAGData(tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        tenantId,
        deletedCount: result.deletedCount,
        errors: result.errors,
      },
    });
  })
);

/**
 * DELETE /api/rag/pr/:repository/:prNumber - Purge PR diff chunks
 */
router.delete(
  API_ROUTES.RAG_PURGE_PR,
  asyncHandler(async (req, res) => {
    const { repository, prNumber } = req.params;

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

    logger.info("Purging PR diff chunks", { repository, prNumber: prNumberInt });

    const result = await purgePRDiffChunks(repository, prNumberInt);

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        repository,
        prNumber: prNumberInt,
        deletedCount: result.deletedCount,
        errors: result.errors,
      },
    });
  })
);

/**
 * DELETE /api/rag/doc/:parentId - Purge a knowledge document
 */
router.delete(
  API_ROUTES.RAG_PURGE_DOC,
  asyncHandler(async (req, res) => {
    const { parentId } = req.params;

    if (!parentId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "parentId is required",
      });
      return;
    }

    logger.info("Purging knowledge document", { parentId });

    const result = await purgeKnowledgeDocChunks(parentId);

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        parentId,
        deletedCount: result.deletedCount,
        errors: result.errors,
      },
    });
  })
);

export { router as ragPurgeRoutes };
