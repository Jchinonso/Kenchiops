/**
 * RAG Drift Routes - Drift Detection, Staleness, Re-embedding
 *
 * @module routes/rag/driftRoutes
 */

import { Router } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  type RAGMetricType,
  runTestSuite,
  generateDriftReport,
  checkMetricBounds,
  runDriftDetectionWithAlerts,
  checkStaleness,
  getStaleDocuments,
  triggerReembedding,
  seedTestCases,
  getSeedCategories,
  detectAndCreateRelationships,
  type DocumentContext,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

/**
 * POST /api/rag/test-suite - Run RAG test suite
 */
router.post(
  API_ROUTES.RAG_TEST_SUITE,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.body as { tenantId?: string };

    logger.info("Running RAG test suite", { tenantId });

    const result = await runTestSuite(tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/rag/drift-report - Generate drift report
 */
router.get(
  API_ROUTES.RAG_DRIFT_REPORT,
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;

    logger.info("Generating drift report", { tenantId });

    const report = await generateDriftReport(tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: report,
    });
  })
);

/**
 * POST /api/rag/drift-report - Run drift detection with alerts
 */
router.post(
  API_ROUTES.RAG_DRIFT_REPORT,
  asyncHandler(async (req, res) => {
    const { tenantId, skipAlertDispatch } = req.body as {
      tenantId?: string;
      skipAlertDispatch?: boolean;
    };

    logger.info("Running drift detection with alerts", { tenantId });

    const result = await runDriftDetectionWithAlerts(tenantId, {
      skipAlertDispatch: skipAlertDispatch ?? false,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        report: result.report,
        alertsDispatched: result.alertsDispatched,
        dispatchErrors: result.dispatchErrors,
      },
    });
  })
);

/**
 * POST /api/rag/check-metric - Check metric bounds
 */
router.post(
  API_ROUTES.RAG_CHECK_METRIC,
  validate({
    body: {
      metricType: (value) => validators.required(value) && validators.string(value),
      currentValue: (value) => validators.required(value) && typeof value === "number",
    },
  }),
  asyncHandler(async (req, res) => {
    const { metricType, currentValue, tenantId } = req.body as {
      metricType: RAGMetricType;
      currentValue: number;
      tenantId?: string;
    };

    logger.info("Checking metric bounds", { metricType, currentValue });

    const result = await checkMetricBounds(metricType, currentValue, tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { metricType, currentValue, ...result },
    });
  })
);

/**
 * GET /api/rag/staleness - Get staleness statistics
 */
router.get(
  API_ROUTES.RAG_STALENESS,
  asyncHandler(async (_req, res) => {
    logger.info("Checking staleness");

    const stats = await checkStaleness();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats,
    });
  })
);

/**
 * GET /api/rag/staleness/documents - Get stale documents
 */
router.get(
  `${API_ROUTES.RAG_STALENESS}/documents`,
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    logger.info("Fetching stale documents", { limit });

    const docs = await getStaleDocuments(limit);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        diffChunkCount: docs.diffChunks.length,
        knowledgeDocCount: docs.knowledgeDocs.length,
        diffChunks: docs.diffChunks,
        knowledgeDocs: docs.knowledgeDocs,
      },
    });
  })
);

/**
 * POST /api/rag/reembed - Trigger re-embedding
 */
router.post(
  API_ROUTES.RAG_REEMBED,
  asyncHandler(async (req, res) => {
    const { tenantId, batchSize } = req.body as {
      tenantId?: string;
      batchSize?: number;
    };

    logger.info("Triggering re-embedding", { tenantId, batchSize });

    const result = await triggerReembedding({ tenantId, batchSize });

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        processedCount: result.processedCount,
        errors: result.errors,
      },
    });
  })
);

/**
 * POST /api/rag/seed-test-cases - Seed test cases
 */
router.post(
  API_ROUTES.RAG_SEED_TEST_CASES,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.body as { tenantId?: string };

    logger.info("Seeding test cases", { tenantId });

    const result = await seedTestCases(tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        created: result.created,
        skipped: result.skipped,
        categories: getSeedCategories(),
        errors: result.errors,
      },
    });
  })
);

/**
 * POST /api/rag/detect-relationships - Detect document relationships
 */
router.post(
  API_ROUTES.RAG_DETECT_RELATIONSHIPS,
  validate({
    body: {
      docId: (value) => validators.required(value) && validators.string(value),
      docType: (value) => validators.required(value) && validators.string(value),
      title: (value) => validators.required(value) && validators.string(value),
      content: (value) => validators.required(value) && validators.string(value),
    },
  }),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      docId: string;
      docType: string;
      title: string;
      content: string;
      repository?: string;
      filePath?: string;
      tenantId?: string;
    };

    logger.info("Detecting relationships", { docId: body.docId });

    const context: DocumentContext = {
      docId: body.docId,
      docType: body.docType,
      title: body.title,
      content: body.content,
      repository: body.repository,
      filePath: body.filePath,
      tenantId: body.tenantId,
    };

    const result = await detectAndCreateRelationships(context);

    res.status(HTTP_STATUS.OK).json({
      success: result.errors.length === 0,
      data: {
        detected: result.detected,
        created: result.created,
        errors: result.errors,
      },
    });
  })
);

export { router as ragDriftRoutes };
