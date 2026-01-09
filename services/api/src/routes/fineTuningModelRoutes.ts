/**
 * Fine-Tuning Model Routes
 *
 * API endpoints for managing model versions, evaluation, and A/B testing.
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
  activateModel,
  rollbackToBaseline,
  getModelVersions,
  getActiveModel,
  configureABTest,
  evaluateModel,
  compareModels,
} from "../services/finetuning/index.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

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

export { router as fineTuningModelRoutes };
