/**
 * Fine-Tuning Dataset Routes
 *
 * API endpoints for dataset extraction and statistics.
 *
 * @module routes/fineTuningDatasetRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
} from "@kenchi/shared";
import { extractDataset, getFineTuningStats } from "../services/finetuning/index.js";
import type { ExtractDatasetRequestBody } from "../types/apiTypes.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Validation Rules ====================

/** Validation rule: optional string */
const validateOptionalString = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined || validators.string(fieldValue);

/** Validation rule: optional number */
const validateOptionalNumber = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined || validators.number(fieldValue);

// ==================== Response Builders ====================

/** Builds dataset extraction response */
const buildExtractDatasetResponse = (result: {
  readonly stats: {
    readonly totalExamples: number;
    readonly positiveExamples: number;
    readonly negativeExamples: number;
    readonly averageConfidence: number;
  };
  readonly jsonl: string;
  readonly extractedAt: string;
  readonly validation: unknown;
}): object => ({
  exampleCount: result.stats.totalExamples,
  positiveExamples: result.stats.positiveExamples,
  negativeExamples: result.stats.negativeExamples,
  averageConfidence: result.stats.averageConfidence,
  jsonlBytes: result.jsonl.length,
  extractedAt: result.extractedAt,
  validation: result.validation,
});

// ==================== Route Handlers ====================

/**
 * Handles dataset extraction requests.
 */
const handleExtractDataset = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as ExtractDatasetRequestBody;

  const result = await extractDataset({
    tenantId: body.tenantId,
    startDate: body.startDate ? new Date(body.startDate) : undefined,
    endDate: body.endDate ? new Date(body.endDate) : undefined,
    minFeedbackCount: body.minFeedbackCount,
    limit: body.limit,
  });

  logger.info("Dataset extracted", {
    tenantId: body.tenantId,
    exampleCount: result.stats.totalExamples,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildExtractDatasetResponse(result),
  });
};

/**
 * Handles fine-tuning statistics requests.
 */
const handleGetStats = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const tenantId = req.query.tenantId as string | undefined;

  const stats = await getFineTuningStats(tenantId);

  logger.info("Fine-tuning stats retrieved", {
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: stats,
  });
};

// ==================== Route Definitions ====================

/** POST /api/fine-tuning/dataset/extract - Extract training dataset from feedback */
router.post(
  "/api/fine-tuning/dataset/extract",
  validate({
    body: {
      tenantId: validateOptionalString,
      startDate: validateOptionalString,
      endDate: validateOptionalString,
      minFeedbackCount: validateOptionalNumber,
      limit: validateOptionalNumber,
    },
  }),
  asyncHandler(handleExtractDataset)
);

/** GET /api/fine-tuning/stats - Get fine-tuning statistics */
router.get("/api/fine-tuning/stats", asyncHandler(handleGetStats));

export { router as fineTuningDatasetRoutes };
