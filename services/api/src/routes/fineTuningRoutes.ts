/**
 * Fine-Tuning Routes
 *
 * API endpoints for managing fine-tuning jobs, datasets, and model versions.
 * Provides full lifecycle management for model improvement.
 *
 * @module routes/fineTuningRoutes
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
import {
  startFineTuningJob,
  getJobStatus,
  cancelJob,
  listJobs,
  extractDataset,
  activateModel,
  rollbackToBaseline,
  getModelVersions,
  getActiveModel,
  configureABTest,
  getFineTuningStats,
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  evaluateModel,
  compareModels,
} from "../services/finetuning/index.js";

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

// ==================== Job Endpoints ====================

/**
 * Start a fine-tuning job
 * POST /api/fine-tuning/jobs
 */
router.post(
  "/api/fine-tuning/jobs",
  validate({
    body: {
      tenantId: (value) => !value || validators.string(value),
      epochs: (value) => !value || validators.number(value),
      suffix: (value) => !value || validators.string(value),
      dryRun: (value) => value === undefined || typeof value === "boolean",
    },
  }),
  asyncHandler(async (req, res) => {
    logger.info("Starting fine-tuning job", {
      tenantId: req.body.tenantId,
      epochs: req.body.epochs,
      dryRun: req.body.dryRun,
    });

    const result = await startFineTuningJob({
      tenantId: req.body.tenantId,
      epochs: req.body.epochs,
      suffix: req.body.suffix,
      dryRun: req.body.dryRun ?? false,
    });

    if (!result.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: result.error,
        validationIssues: result.validationIssues,
      });
      return;
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        jobId: result.jobId,
        status: result.status,
        fileId: result.fileId,
        model: result.model,
        datasetStats: result.datasetStats,
      },
    });
  })
);

/**
 * Get fine-tuning job status
 * GET /api/fine-tuning/jobs/:jobId
 */
router.get(
  "/api/fine-tuning/jobs/:jobId",
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    logger.info("Getting fine-tuning job status", { jobId });

    const result = await getJobStatus(jobId);

    if (!result) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: "Job not found",
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  })
);

/**
 * Cancel a fine-tuning job
 * POST /api/fine-tuning/jobs/:jobId/cancel
 */
router.post(
  "/api/fine-tuning/jobs/:jobId/cancel",
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    logger.info("Cancelling fine-tuning job", { jobId });

    const success = await cancelJob(jobId);

    if (!success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Failed to cancel job",
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Job cancelled",
    });
  })
);

/**
 * List fine-tuning jobs
 * GET /api/fine-tuning/jobs
 */
router.get(
  "/api/fine-tuning/jobs",
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    logger.info("Listing fine-tuning jobs", { limit });

    const jobs = await listJobs(limit);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: jobs,
    });
  })
);

// ==================== Model Version Endpoints ====================

/**
 * Get all model versions
 * GET /api/fine-tuning/models
 */
router.get(
  "/api/fine-tuning/models",
  asyncHandler(async (req, res) => {
    logger.info("Getting model versions");

    const versions = await getModelVersions();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: versions,
    });
  })
);

/**
 * Get active model for tenant
 * GET /api/fine-tuning/models/active
 */
router.get(
  "/api/fine-tuning/models/active",
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;

    logger.info("Getting active model", { tenantId });

    const result = await getActiveModel(tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  })
);

/**
 * Activate a model version
 * POST /api/fine-tuning/models/:versionId/activate
 */
router.post(
  "/api/fine-tuning/models/:versionId/activate",
  asyncHandler(async (req, res) => {
    const { versionId } = req.params;

    logger.info("Activating model version", { versionId });

    const success = await activateModel(versionId);

    if (!success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Failed to activate model",
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Model activated",
    });
  })
);

/**
 * Rollback to baseline model
 * POST /api/fine-tuning/models/rollback
 */
router.post(
  "/api/fine-tuning/models/rollback",
  asyncHandler(async (req, res) => {
    logger.info("Rolling back to baseline model");

    const success = await rollbackToBaseline();

    if (!success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Failed to rollback",
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Rolled back to baseline model",
    });
  })
);

/**
 * Configure A/B test
 * POST /api/fine-tuning/models/ab-test
 */
router.post(
  "/api/fine-tuning/models/ab-test",
  validate({
    body: {
      controlVersion: (value) => validators.required(value) && validators.string(value),
      treatmentVersion: (value) => validators.required(value) && validators.string(value),
      treatmentPercentage: (value) => validators.required(value) && validators.number(value),
    },
  }),
  asyncHandler(async (req, res) => {
    logger.info("Configuring A/B test", {
      controlVersion: req.body.controlVersion,
      treatmentVersion: req.body.treatmentVersion,
      treatmentPercentage: req.body.treatmentPercentage,
    });

    const success = await configureABTest({
      controlVersion: req.body.controlVersion,
      treatmentVersion: req.body.treatmentVersion,
      treatmentPercentage: req.body.treatmentPercentage,
    });

    if (!success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Failed to configure A/B test",
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "A/B test configured",
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

// ==================== Scheduler Endpoints ====================

/**
 * Get scheduler status
 * GET /api/fine-tuning/scheduler/status
 */
router.get(
  "/api/fine-tuning/scheduler/status",
  asyncHandler(async (req, res) => {
    const status = getSchedulerStatus();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: status,
    });
  })
);

/**
 * Start the scheduler
 * POST /api/fine-tuning/scheduler/start
 */
router.post(
  "/api/fine-tuning/scheduler/start",
  asyncHandler(async (req, res) => {
    logger.info("Starting fine-tuning scheduler");

    startScheduler();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Scheduler started",
    });
  })
);

/**
 * Stop the scheduler
 * POST /api/fine-tuning/scheduler/stop
 */
router.post(
  "/api/fine-tuning/scheduler/stop",
  asyncHandler(async (req, res) => {
    logger.info("Stopping fine-tuning scheduler");

    stopScheduler();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Scheduler stopped",
    });
  })
);

// ==================== Evaluation Endpoints ====================

/**
 * Evaluate a model version
 * GET /api/fine-tuning/evaluate/:versionId
 */
router.get(
  "/api/fine-tuning/evaluate/:versionId",
  asyncHandler(async (req, res) => {
    const { versionId } = req.params;
    const tenantId = req.query.tenantId as string | undefined;

    logger.info("Evaluating model version", { versionId, tenantId });

    const metrics = await evaluateModel({
      modelVersionId: versionId,
      tenantId,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * Compare two model versions (A/B test)
 * POST /api/fine-tuning/compare
 */
router.post(
  "/api/fine-tuning/compare",
  validate({
    body: {
      controlVersionId: (value) => validators.required(value) && validators.string(value),
      treatmentVersionId: (value) => validators.required(value) && validators.string(value),
      tenantId: (value) => !value || validators.string(value),
    },
  }),
  asyncHandler(async (req, res) => {
    const { controlVersionId, treatmentVersionId, tenantId } = req.body;

    logger.info("Comparing model versions", {
      controlVersionId,
      treatmentVersionId,
      tenantId,
    });

    const comparison = await compareModels(controlVersionId, treatmentVersionId, tenantId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: comparison,
    });
  })
);

export { router as fineTuningRoutes };
