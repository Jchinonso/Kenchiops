/**
 * RAG Health Routes - Monitoring, Metrics, Cleanup
 *
 * @module routes/rag/healthRoutes
 */

import { Router } from "express";
import {
  asyncHandler,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  RAG_EVALUATION_CONFIG,
  checkRAGHealth,
  getRAGMetricsSnapshot,
  getRAGEvaluationMetrics,
  cleanupExpired,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

/**
 * GET /api/rag/health - Check RAG system health
 */
router.get(
  API_ROUTES.RAG_HEALTH,
  asyncHandler(async (_req, res) => {
    logger.info("Checking RAG system health");

    const health = await checkRAGHealth();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: health,
    });
  })
);

/**
 * GET /api/rag/metrics - Get RAG metrics snapshot
 */
router.get(
  API_ROUTES.RAG_METRICS,
  asyncHandler(async (_req, res) => {
    logger.info("Fetching RAG metrics snapshot");

    const metrics = getRAGMetricsSnapshot();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * GET /api/rag/evaluation - Get RAG evaluation metrics
 */
router.get(
  API_ROUTES.RAG_EVALUATION,
  asyncHandler(async (req, res) => {
    const windowMinutes = req.query.windowMinutes
      ? parseInt(req.query.windowMinutes as string, 10)
      : RAG_EVALUATION_CONFIG.DEFAULT_WINDOW_MINUTES;

    logger.info("Fetching RAG evaluation metrics", { windowMinutes });

    const metrics = await getRAGEvaluationMetrics(windowMinutes);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * POST /api/rag/cleanup - Trigger cleanup of expired documents
 */
router.post(
  API_ROUTES.RAG_CLEANUP,
  asyncHandler(async (_req, res) => {
    logger.info("Starting RAG cleanup");

    const result = await cleanupExpired();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        diffChunksDeleted: result.diffChunksDeleted,
        knowledgeDocsDeleted: result.knowledgeDocsDeleted,
        diffChunksMarkedStale: result.diffChunksMarkedStale,
        knowledgeDocsMarkedStale: result.knowledgeDocsMarkedStale,
      },
    });
  })
);

export { router as ragHealthRoutes };
