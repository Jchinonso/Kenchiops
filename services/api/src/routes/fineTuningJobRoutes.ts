/**
 * Fine-Tuning Job Routes
 *
 * API endpoints for managing fine-tuning jobs and the scheduler.
 *
 * @module routes/fineTuningJobRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  FINE_TUNING_CONFIG,
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
import type { StartJobRequestBody } from "../types/apiTypes.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Validation Rules ====================

/** Validation rule: optional string */
const validateOptionalString = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined || validators.string(fieldValue);

/** Validation rule: optional number */
const validateOptionalNumber = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined || validators.number(fieldValue);

/** Validation rule: optional boolean */
const validateOptionalBoolean = (fieldValue: unknown): boolean | string =>
  fieldValue === undefined || typeof fieldValue === "boolean" || "Must be a boolean";

// ==================== Route Handlers ====================

/**
 * Handles starting a fine-tuning job.
 */
const handleStartJob = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as StartJobRequestBody;

  const result = await startFineTuningJob({
    tenantId: body.tenantId,
    epochs: body.epochs,
    suffix: body.suffix,
    dryRun: body.dryRun ?? false,
  });

  if (!result.success) {
    logger.info("Fine-tuning job start failed", {
      tenantId: body.tenantId,
      error: result.error,
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: result.error,
      validationIssues: result.validationIssues,
    });
    return;
  }

  logger.info("Fine-tuning job started", {
    tenantId: body.tenantId,
    jobId: result.jobId,
    durationMs: Date.now() - startTime,
  });

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
};

/**
 * Handles getting fine-tuning job status.
 */
const handleGetJobStatus = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { jobId } = req.params;

  const result = await getJobStatus(jobId);

  if (!result) {
    logger.info("Fine-tuning job not found", {
      jobId,
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: "Job not found",
    });
    return;
  }

  logger.info("Fine-tuning job status retrieved", {
    jobId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
};

/**
 * Handles cancelling a fine-tuning job.
 */
const handleCancelJob = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { jobId } = req.params;

  const success = await cancelJob(jobId);

  if (!success) {
    logger.info("Fine-tuning job cancel failed", {
      jobId,
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Failed to cancel job",
    });
    return;
  }

  logger.info("Fine-tuning job cancelled", {
    jobId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Job cancelled",
  });
};

/**
 * Handles listing fine-tuning jobs.
 */
const handleListJobs = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const limit = req.query.limit
    ? parseInt(req.query.limit as string, 10)
    : FINE_TUNING_CONFIG.API_DEFAULT_JOBS_LIMIT;

  const jobs = await listJobs(limit);

  logger.info("Fine-tuning jobs listed", {
    limit,
    count: jobs.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: jobs,
  });
};

/**
 * Handles getting scheduler status.
 */
const handleGetSchedulerStatus = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const status = getSchedulerStatus();

  logger.info("Scheduler status retrieved", {
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: status,
  });
};

/**
 * Handles starting the scheduler.
 */
const handleStartScheduler = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  startScheduler();

  logger.info("Scheduler started", {
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Scheduler started",
  });
};

/**
 * Handles stopping the scheduler.
 */
const handleStopScheduler = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  stopScheduler();

  logger.info("Scheduler stopped", {
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Scheduler stopped",
  });
};

// ==================== Route Definitions ====================

/** POST /api/fine-tuning/jobs - Start a fine-tuning job */
router.post(
  "/api/fine-tuning/jobs",
  validate({
    body: {
      tenantId: validateOptionalString,
      epochs: validateOptionalNumber,
      suffix: validateOptionalString,
      dryRun: validateOptionalBoolean,
    },
  }),
  asyncHandler(handleStartJob)
);

/** GET /api/fine-tuning/jobs/:jobId - Get fine-tuning job status */
router.get("/api/fine-tuning/jobs/:jobId", asyncHandler(handleGetJobStatus));

/** POST /api/fine-tuning/jobs/:jobId/cancel - Cancel a fine-tuning job */
router.post("/api/fine-tuning/jobs/:jobId/cancel", asyncHandler(handleCancelJob));

/** GET /api/fine-tuning/jobs - List fine-tuning jobs */
router.get("/api/fine-tuning/jobs", asyncHandler(handleListJobs));

/** GET /api/fine-tuning/scheduler/status - Get scheduler status */
router.get("/api/fine-tuning/scheduler/status", asyncHandler(handleGetSchedulerStatus));

/** POST /api/fine-tuning/scheduler/start - Start the scheduler */
router.post("/api/fine-tuning/scheduler/start", asyncHandler(handleStartScheduler));

/** POST /api/fine-tuning/scheduler/stop - Stop the scheduler */
router.post("/api/fine-tuning/scheduler/stop", asyncHandler(handleStopScheduler));

export { router as fineTuningJobRoutes };
