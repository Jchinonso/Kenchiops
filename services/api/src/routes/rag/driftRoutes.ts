/**
 * RAG Drift Routes - Drift Detection, Staleness, Re-embedding
 *
 * @module routes/rag/driftRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  RAG_QUERY_DEFAULTS,
  requireTenantMatch,
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
import type {
  TestSuiteRequestBody,
  DriftDetectionRequestBody,
  CheckMetricRequestBody,
  ReembedRequestBody,
  SeedTestCasesRequestBody,
  DetectRelationshipsRequestBody,
  DriftDetectionResponse,
  StaleDocumentsResponse,
  ReembedResponse,
  SeedTestCasesResponse,
  DetectRelationshipsResponse,
} from "./types.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Query Parsers ====================

/** Parses limit from query with default */
const parseLimit = (queryValue: unknown, defaultValue: number): number =>
  typeof queryValue === "string" ? parseInt(queryValue, 10) || defaultValue : defaultValue;

// ==================== Validation Rules ====================

/** Validation rule: required string */
const validateRequiredString = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return validators.string(fieldValue);
};

/** Validation rule: required number */
const validateRequiredNumber = (fieldValue: unknown): boolean | string => {
  if (!validators.required(fieldValue)) {
    return "Field is required";
  }
  return typeof fieldValue === "number" || "Must be a number";
};

// ==================== Response Builders ====================

/** Builds drift detection response */
const buildDriftDetectionResponse = (result: {
  readonly report: unknown;
  readonly alertsDispatched: number;
  readonly dispatchErrors: number;
}): DriftDetectionResponse => ({
  report: result.report,
  alertsDispatched: result.alertsDispatched,
  dispatchErrors: result.dispatchErrors,
});

/** Builds stale documents response */
const buildStaleDocumentsResponse = (docs: {
  readonly diffChunks: readonly unknown[];
  readonly knowledgeDocs: readonly unknown[];
}): StaleDocumentsResponse => ({
  diffChunkCount: docs.diffChunks.length,
  knowledgeDocCount: docs.knowledgeDocs.length,
  diffChunks: docs.diffChunks,
  knowledgeDocs: docs.knowledgeDocs,
});

/** Builds re-embed response */
const buildReembedResponse = (result: {
  readonly processedCount: number;
  readonly errors: readonly string[];
}): ReembedResponse => ({
  processedCount: result.processedCount,
  errors: result.errors,
});

/** Builds seed test cases response */
const buildSeedTestCasesResponse = (result: {
  readonly created: number;
  readonly skipped: number;
  readonly errors: readonly string[];
}): SeedTestCasesResponse => ({
  created: result.created,
  skipped: result.skipped,
  categories: getSeedCategories(),
  errors: result.errors,
});

/** Builds detect relationships response */
const buildDetectRelationshipsResponse = (result: {
  readonly detected: number;
  readonly created: number;
  readonly errors: readonly string[];
}): DetectRelationshipsResponse => ({
  detected: result.detected,
  created: result.created,
  errors: result.errors,
});

/** Builds document context from request body */
const buildDocumentContext = (body: DetectRelationshipsRequestBody): DocumentContext => ({
  docId: body.docId,
  docType: body.docType,
  title: body.title,
  content: body.content,
  repository: body.repository,
  filePath: body.filePath,
  tenantId: body.tenantId,
});

// ==================== Route Handlers ====================

/**
 * Handles RAG test suite execution.
 */
const handleTestSuite = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as TestSuiteRequestBody;

  const result = await runTestSuite(body.tenantId);

  logger.info("RAG test suite completed", {
    tenantId: body.tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
};

/**
 * Handles drift report generation.
 */
const handleGetDriftReport = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const tenantId = req.query.tenantId as string | undefined;

  const report = await generateDriftReport(tenantId);

  logger.info("Drift report generated", {
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: report,
  });
};

/**
 * Handles drift detection with alerts.
 */
const handleDriftDetection = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as DriftDetectionRequestBody;

  const result = await runDriftDetectionWithAlerts(body.tenantId, {
    skipAlertDispatch: body.skipAlertDispatch ?? false,
  });

  logger.info("Drift detection completed", {
    tenantId: body.tenantId,
    alertsDispatched: result.alertsDispatched,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildDriftDetectionResponse(result),
  });
};

/**
 * Handles metric bounds check.
 */
const handleCheckMetric = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as CheckMetricRequestBody;

  const result = await checkMetricBounds(
    body.metricType as RAGMetricType,
    body.currentValue,
    body.tenantId
  );

  logger.info("Metric bounds checked", {
    metricType: body.metricType,
    currentValue: body.currentValue,
    withinBounds: result.withinBounds,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: { metricType: body.metricType, currentValue: body.currentValue, ...result },
  });
};

/**
 * Handles staleness statistics request.
 */
const handleStaleness = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const stats = await checkStaleness();

  logger.info("Staleness check completed", {
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: stats,
  });
};

/**
 * Handles stale documents query.
 */
const handleStaleDocuments = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const limit = parseLimit(req.query.limit, RAG_QUERY_DEFAULTS.STALE_DOCS_LIMIT);

  const docs = await getStaleDocuments(limit);

  logger.info("Stale documents retrieved", {
    limit,
    diffChunkCount: docs.diffChunks.length,
    knowledgeDocCount: docs.knowledgeDocs.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildStaleDocumentsResponse(docs),
  });
};

/**
 * Handles re-embedding trigger.
 */
const handleReembed = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as ReembedRequestBody;

  const result = await triggerReembedding({
    tenantId: body.tenantId,
    batchSize: body.batchSize,
  });

  logger.info("Re-embedding completed", {
    tenantId: body.tenantId,
    processedCount: result.processedCount,
    errorCount: result.errors.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: result.success,
    data: buildReembedResponse(result),
  });
};

/**
 * Handles test case seeding.
 */
const handleSeedTestCases = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as SeedTestCasesRequestBody;

  const result = await seedTestCases(body.tenantId);

  logger.info("Test cases seeded", {
    tenantId: body.tenantId,
    created: result.created,
    skipped: result.skipped,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: result.success,
    data: buildSeedTestCasesResponse(result),
  });
};

/**
 * Handles relationship detection.
 */
const handleDetectRelationships = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as DetectRelationshipsRequestBody;

  const context = buildDocumentContext(body);
  const result = await detectAndCreateRelationships(context);

  logger.info("Relationships detected", {
    docId: body.docId,
    detected: result.detected,
    created: result.created,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: result.errors.length === 0,
    data: buildDetectRelationshipsResponse(result),
  });
};

// ==================== Route Definitions ====================

/** POST /api/rag/test-suite - Run RAG test suite */
router.post(API_ROUTES.RAG_TEST_SUITE, requireTenantMatch(), asyncHandler(handleTestSuite));

/** GET /api/rag/drift-report - Generate drift report */
router.get(API_ROUTES.RAG_DRIFT_REPORT, requireTenantMatch(), asyncHandler(handleGetDriftReport));

/** POST /api/rag/drift-report - Run drift detection with alerts */
router.post(API_ROUTES.RAG_DRIFT_REPORT, requireTenantMatch(), asyncHandler(handleDriftDetection));

/** POST /api/rag/check-metric - Check metric bounds */
router.post(
  API_ROUTES.RAG_CHECK_METRIC,
  requireTenantMatch(),
  validate({
    body: {
      metricType: validateRequiredString,
      currentValue: validateRequiredNumber,
    },
  }),
  asyncHandler(handleCheckMetric)
);

/** GET /api/rag/staleness - Get staleness statistics */
router.get(API_ROUTES.RAG_STALENESS, asyncHandler(handleStaleness));

/** GET /api/rag/staleness/documents - Get stale documents */
router.get(`${API_ROUTES.RAG_STALENESS}/documents`, asyncHandler(handleStaleDocuments));

/** POST /api/rag/reembed - Trigger re-embedding */
router.post(API_ROUTES.RAG_REEMBED, requireTenantMatch(), asyncHandler(handleReembed));

/** POST /api/rag/seed-test-cases - Seed test cases */
router.post(
  API_ROUTES.RAG_SEED_TEST_CASES,
  requireTenantMatch(),
  asyncHandler(handleSeedTestCases)
);

/** POST /api/rag/detect-relationships - Detect document relationships */
router.post(
  API_ROUTES.RAG_DETECT_RELATIONSHIPS,
  requireTenantMatch(),
  validate({
    body: {
      docId: validateRequiredString,
      docType: validateRequiredString,
      title: validateRequiredString,
      content: validateRequiredString,
    },
  }),
  asyncHandler(handleDetectRelationships)
);

export { router as ragDriftRoutes };
