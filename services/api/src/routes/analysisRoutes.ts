/**
 * Analysis Routes
 *
 * Handles CI failure analysis endpoints.
 *
 * @module routes/analysisRoutes
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
} from "@kenchi/shared";
import { performAnalysis } from "../services/analysisService.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Request Types ====================

/** Shape of analyze request body */
interface AnalyzeRequestBody {
  readonly failure_log: string;
  readonly repository: string;
  readonly commit?: string;
  readonly tenant_id?: string;
}

// ==================== Validation Rules ====================

/** Validation rule: required string */
const validateRequiredString = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return validators.string(fieldValue);
};

// ==================== Route Handlers ====================

/**
 * Handles CI failure analysis requests.
 */
const handleAnalyze = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as AnalyzeRequestBody;

  const response = await performAnalysis({
    failure_log: body.failure_log,
    repository: body.repository,
    commit: body.commit,
    tenant_id: body.tenant_id,
  });

  logger.info("Analysis completed", {
    repository: body.repository,
    hasCommit: !!body.commit,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json(response);
};

// ==================== Route Definitions ====================

/** POST /api/analyze - CI failure analysis endpoint */
router.post(
  API_ROUTES.ANALYZE,
  validate({
    body: {
      failure_log: validateRequiredString,
      repository: validateRequiredString,
    },
  }),
  asyncHandler(handleAnalyze)
);

export { router as analysisRoutes };
