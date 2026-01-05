/**
 * Fine-Tuning Job Routes
 *
 * API endpoints for managing fine-tuning jobs and the scheduler.
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
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
} from "../services/finetuning/index.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

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

export { router as fineTuningJobRoutes };
