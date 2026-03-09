/**
 * RAG Health Routes - Monitoring, Metrics, Cleanup
 *
 * @module routes/rag/healthRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  requireTenantId,
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
import type { CleanupResponse } from "./types.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Query Parsers ====================

/** Parses windowMinutes from query with default */
const parseWindowMinutes = (queryValue: unknown): number =>
  typeof queryValue === "string"
    ? parseInt(queryValue, 10) || RAG_EVALUATION_CONFIG.DEFAULT_WINDOW_MINUTES
    : RAG_EVALUATION_CONFIG.DEFAULT_WINDOW_MINUTES;

// ==================== Response Builders ====================

/** Builds cleanup response from result */
const buildCleanupResponse = (result: {
  readonly diffChunksDeleted: number;
  readonly knowledgeDocsDeleted: number;
  readonly diffChunksMarkedStale: number;
  readonly knowledgeDocsMarkedStale: number;
}): CleanupResponse => ({
  diffChunksDeleted: result.diffChunksDeleted,
  knowledgeDocsDeleted: result.knowledgeDocsDeleted,
  diffChunksMarkedStale: result.diffChunksMarkedStale,
  knowledgeDocsMarkedStale: result.knowledgeDocsMarkedStale,
});

// ==================== Route Handlers ====================

/**
 * Handles RAG system health check requests.
 */
const handleHealthCheck = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const health = await checkRAGHealth();

  logger.info("RAG health check completed", {
    healthy: health.healthy,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: health,
  });
};

/**
 * Handles RAG metrics snapshot requests.
 */
const handleMetricsSnapshot = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const metrics = getRAGMetricsSnapshot();

  logger.info("RAG metrics snapshot retrieved", {
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: metrics,
  });
};

/**
 * Handles RAG evaluation metrics requests.
 */
const handleEvaluationMetrics = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const tenantId = requireTenantId(req);
  const windowMinutes = parseWindowMinutes(req.query.windowMinutes);

  const metrics = await getRAGEvaluationMetrics(tenantId, windowMinutes);

  logger.info("RAG evaluation metrics retrieved", {
    windowMinutes,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: metrics,
  });
};

/**
 * Handles cleanup of expired documents.
 */
const handleCleanup = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const result = await cleanupExpired();

  logger.info("RAG cleanup completed", {
    diffChunksDeleted: result.diffChunksDeleted,
    knowledgeDocsDeleted: result.knowledgeDocsDeleted,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildCleanupResponse(result),
  });
};

// ==================== Route Definitions ====================

/** GET /api/rag/health - Check RAG system health */
router.get(API_ROUTES.RAG_HEALTH, asyncHandler(handleHealthCheck));

/** GET /api/rag/metrics - Get RAG metrics snapshot */
router.get(API_ROUTES.RAG_METRICS, asyncHandler(handleMetricsSnapshot));

/** GET /api/rag/evaluation - Get RAG evaluation metrics */
router.get(API_ROUTES.RAG_EVALUATION, asyncHandler(handleEvaluationMetrics));

/** POST /api/rag/cleanup - Trigger cleanup of expired documents */
router.post(API_ROUTES.RAG_CLEANUP, asyncHandler(handleCleanup));

export { router as ragHealthRoutes };
