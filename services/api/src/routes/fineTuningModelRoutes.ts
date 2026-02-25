/**
 * Fine-Tuning Model Routes
 *
 * API endpoints for managing model versions, evaluation, and A/B testing.
 *
 * @module routes/fineTuningModelRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  requirePermission,
} from "@kenchi/shared";
import {
  activateModel,
  rollbackToBaseline,
  getModelVersions,
  getActiveModel,
  configureABTest,
  evaluateModel,
  compareModels,
} from "../services/finetuning/index.js";
import type { ABTestConfigRequestBody, CompareModelsRequestBody } from "../types/apiTypes.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

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
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return validators.number(fieldValue);
};

// ==================== Route Handlers ====================

/**
 * Handles getting all model versions.
 */
const handleGetModelVersions = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const versions = await getModelVersions();

  logger.info("Model versions retrieved", {
    count: versions.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: versions,
  });
};

/**
 * Handles getting active model for a tenant.
 */
const handleGetActiveModel = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.context;

  const result = await getActiveModel(tenantId);

  logger.info("Active model retrieved", {
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
};

/**
 * Handles activating a model version.
 */
const handleActivateModel = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { versionId } = req.params;

  const success = await activateModel(versionId);

  if (!success) {
    logger.info("Model activation failed", {
      versionId,
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Failed to activate model",
    });
    return;
  }

  logger.info("Model activated", {
    versionId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Model activated",
  });
};

/**
 * Handles rolling back to baseline model.
 */
const handleRollbackToBaseline = async (_req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  const success = await rollbackToBaseline();

  if (!success) {
    logger.info("Rollback to baseline failed", {
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Failed to rollback",
    });
    return;
  }

  logger.info("Rolled back to baseline model", {
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Rolled back to baseline model",
  });
};

/**
 * Handles configuring an A/B test.
 */
const handleConfigureABTest = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as ABTestConfigRequestBody;

  const success = await configureABTest({
    controlVersion: body.controlVersion,
    treatmentVersion: body.treatmentVersion,
    treatmentPercentage: body.treatmentPercentage,
  });

  if (!success) {
    logger.info("A/B test configuration failed", {
      controlVersion: body.controlVersion,
      treatmentVersion: body.treatmentVersion,
      durationMs: Date.now() - startTime,
    });

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Failed to configure A/B test",
    });
    return;
  }

  logger.info("A/B test configured", {
    controlVersion: body.controlVersion,
    treatmentVersion: body.treatmentVersion,
    treatmentPercentage: body.treatmentPercentage,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "A/B test configured",
  });
};

/**
 * Handles evaluating a model version.
 */
const handleEvaluateModel = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { versionId } = req.params;
  const { tenantId } = req.context;

  const metrics = await evaluateModel({
    modelVersionId: versionId,
    tenantId,
  });

  logger.info("Model evaluated", {
    versionId,
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: metrics,
  });
};

/**
 * Handles comparing two model versions.
 */
const handleCompareModels = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as CompareModelsRequestBody;

  const { tenantId } = req.context;

  const comparison = await compareModels(body.controlVersionId, body.treatmentVersionId, tenantId);

  logger.info("Models compared", {
    controlVersionId: body.controlVersionId,
    treatmentVersionId: body.treatmentVersionId,
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: comparison,
  });
};

// ==================== Route Definitions ====================

/** GET /api/fine-tuning/models - Get all model versions */
router.get("/api/fine-tuning/models", asyncHandler(handleGetModelVersions));

/** GET /api/fine-tuning/models/active - Get active model for tenant */
router.get("/api/fine-tuning/models/active", asyncHandler(handleGetActiveModel));

/** POST /api/fine-tuning/models/:versionId/activate - Activate a model version */
router.post(
  "/api/fine-tuning/models/:versionId/activate",
  requirePermission("settings"),
  asyncHandler(handleActivateModel)
);

/** POST /api/fine-tuning/models/rollback - Rollback to baseline model */
router.post(
  "/api/fine-tuning/models/rollback",
  requirePermission("settings"),
  asyncHandler(handleRollbackToBaseline)
);

/** POST /api/fine-tuning/models/ab-test - Configure A/B test */
router.post(
  "/api/fine-tuning/models/ab-test",
  requirePermission("settings"),
  validate({
    body: {
      controlVersion: validateRequiredString,
      treatmentVersion: validateRequiredString,
      treatmentPercentage: validateRequiredNumber,
    },
  }),
  asyncHandler(handleConfigureABTest)
);

/** GET /api/fine-tuning/evaluate/:versionId - Evaluate a model version */
router.get("/api/fine-tuning/evaluate/:versionId", asyncHandler(handleEvaluateModel));

/** POST /api/fine-tuning/compare - Compare two model versions */
router.post(
  "/api/fine-tuning/compare",
  validate({
    body: {
      controlVersionId: validateRequiredString,
      treatmentVersionId: validateRequiredString,
    },
  }),
  asyncHandler(handleCompareModels)
);

export { router as fineTuningModelRoutes };
