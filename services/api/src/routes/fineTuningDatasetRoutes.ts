/**
 * Fine-Tuning Dataset Routes
 *
 * API endpoints for dataset extraction and statistics.
 */

import { Router } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
} from "@kenchi/shared";
import { extractDataset, getFineTuningStats } from "../services/finetuning/index.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Dataset Endpoints ====================

/**
 * Extract training dataset from feedback
 * POST /api/fine-tuning/dataset/extract
 */
router.post(
  "/api/fine-tuning/dataset/extract",
  validate({
    body: {
      tenantId: (value) => !value || validators.string(value),
      startDate: (value) => !value || validators.string(value),
      endDate: (value) => !value || validators.string(value),
      minFeedbackCount: (value) => !value || validators.number(value),
      limit: (value) => !value || validators.number(value),
    },
  }),
  asyncHandler(async (req, res) => {
    logger.info("Extracting training dataset", {
      tenantId: req.body.tenantId,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
    });

    const result = await extractDataset({
      tenantId: req.body.tenantId,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      minFeedbackCount: req.body.minFeedbackCount,
      limit: req.body.limit,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        exampleCount: result.stats.totalExamples,
        positiveExamples: result.stats.positiveExamples,
        negativeExamples: result.stats.negativeExamples,
        averageConfidence: result.stats.averageConfidence,
        jsonlBytes: result.jsonl.length,
        extractedAt: result.extractedAt,
        validation: result.validation,
      },
    });
  })
);

// ==================== Statistics Endpoints ====================

/**
 * Get fine-tuning statistics
 * GET /api/fine-tuning/stats
 */
router.get(
  "/api/fine-tuning/stats",
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;

    logger.info("Getting fine-tuning stats", { tenantId });

    const stats = await getFineTuningStats(tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats,
    });
  })
);

export { router as fineTuningDatasetRoutes };
