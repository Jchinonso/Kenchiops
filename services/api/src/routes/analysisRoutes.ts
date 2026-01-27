/**
 * Analysis Routes
 *
 * Handles CI failure analysis endpoints.
 *
 * @module routes/analysisRoutes
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  API_LOG_LIMITS,
} from "@kenchi/shared";
import { performAnalysis } from "../services/analysisService.js";
import type { AnalyzeRequest } from "../types/apiTypes.js";

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

// ==================== Request Builders ====================

/** Builds analyze request from body */
const buildAnalyzeRequest = (body: AnalyzeRequestBody): AnalyzeRequest => ({
  failure_log: body.failure_log,
  repository: body.repository,
  commit: body.commit,
  tenant_id: body.tenant_id,
});

// ==================== Middleware ====================

/** Logs incoming analyze request details for debugging */
const logAnalyzeRequest = (req: Request, _res: Response, next: NextFunction): void => {
  const previewLength = API_LOG_LIMITS.RAW_BODY_PREVIEW_LENGTH;
  logger.debug("Analyze request details", {
    contentType: req.headers["content-type"],
    bodyType: typeof req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    hasFailureLog: !!req.body?.failure_log,
    hasRepository: !!req.body?.repository,
    rawBody:
      typeof req.body === "string"
        ? req.body.substring(0, previewLength)
        : JSON.stringify(req.body).substring(0, previewLength),
  });
  next();
};

// ==================== Route Handlers ====================

/**
 * Handles CI failure analysis requests.
 */
const handleAnalyze = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as AnalyzeRequestBody;

  const request = buildAnalyzeRequest(body);
  const response = await performAnalysis(request);

  logger.info("Analysis completed", {
    repository: body.repository,
    hasCommit: !!body.commit,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json(response);
};

// ==================== Route Definitions ====================

/**
 * CI Failure Analysis endpoint
 * POST /api/analyze
 *
 * Analyzes CI failure logs using OpenAI and returns
 * structured analysis with recommendations
 */
router.post(
  API_ROUTES.ANALYZE,
  logAnalyzeRequest,
  validate({
    body: {
      failure_log: validateRequiredString,
      repository: validateRequiredString,
    },
  }),
  asyncHandler(handleAnalyze)
);

export { router as analysisRoutes };
