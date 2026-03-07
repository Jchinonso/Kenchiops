/**
 * Analysis Feedback Routes
 *
 * API endpoints for submitting user feedback on CI failure analyses.
 * When an analysis is marked "correct" (helpful), triggers lesson ingestion
 * into the RAG knowledge base for future retrieval.
 *
 * @module routes/feedbackRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  requireTenantId,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  ValidationError,
  NotFoundError,
  rateLimitByCategory,
  SERVICE_NAMES,
  FEEDBACK_DEFAULTS,
  createOrUpdateAnalysisFeedback,
  getFeedbackByAnalysis,
  getFeedbackByUserAndAnalysis,
  getAnalysisById,
  type FeedbackType,
} from "@kenchi/shared";
import { tryIngestLesson } from "../services/feedbackLessonService.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Constants ====================

const VALID_FEEDBACK_TYPES: ReadonlySet<string> = new Set([
  "correct",
  "incorrect",
  "flaky",
  "needs_more_context",
]);

// ==================== Validators ====================

/**
 * Validates feedbackType is one of the allowed values.
 */
const validateFeedbackType = (value: unknown): boolean | string => {
  const requiredResult = validators.required(value);
  if (requiredResult !== true) {
    return requiredResult;
  }
  const stringResult = validators.string(value);
  if (stringResult !== true) {
    return stringResult;
  }
  return (
    VALID_FEEDBACK_TYPES.has(value as string) ||
    "Must be one of: correct, incorrect, flaky, needs_more_context"
  );
};

/**
 * Validates optional correction field (string, max length).
 */
const validateCorrection = (value: unknown): boolean | string => {
  if (value === undefined || value === null || value === "") {
    return true;
  }
  const stringResult = validators.string(value);
  if (stringResult !== true) {
    return stringResult;
  }
  return validators.maxLength(FEEDBACK_DEFAULTS.MAX_CORRECTION_LENGTH)(value);
};

// ==================== Route Handlers ====================

/**
 * Submits feedback for an analysis.
 * When feedbackType is "correct", also triggers lesson ingestion.
 */
const handleSubmitFeedback = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const tenantId = requireTenantId(req);
  const { analysisId } = req.params;
  const userId = req.user?.userId;

  if (!analysisId) {
    throw new ValidationError("Analysis ID is required", {
      operation: "submitFeedback",
      metadata: { field: "analysisId" },
    });
  }

  if (!userId) {
    throw new ValidationError("User ID is required for feedback", {
      operation: "submitFeedback",
      metadata: { field: "userId" },
    });
  }

  const { feedbackType, correction } = req.body as {
    readonly feedbackType: FeedbackType;
    readonly correction?: string;
  };

  // Verify the analysis belongs to this tenant before writing feedback
  const analysis = await getAnalysisById(analysisId, tenantId);
  if (!analysis) {
    throw new NotFoundError("Analysis not found", {
      metadata: { analysisId },
    });
  }

  const { feedback, wasUpdated } = await createOrUpdateAnalysisFeedback({
    analysisId,
    feedbackType,
    userId,
    tenantId,
    correction,
  });

  // Trigger lesson ingestion for "correct" feedback
  const lessonIngested =
    feedbackType === "correct"
      ? await tryIngestLesson(analysisId, tenantId, userId, req.context)
      : false;

  logger.info("Analysis feedback submitted", {
    analysisId,
    feedbackType,
    wasUpdated,
    lessonIngested,
    durationMs: Date.now() - startTime,
    ...req.context,
  });

  res.status(HTTP_STATUS.OK).json({
    data: { feedback, wasUpdated, lessonIngested },
  });
};

/**
 * Gets the current user's feedback for an analysis.
 */
const handleGetMyFeedback = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { analysisId } = req.params;
  const userId = req.user?.userId;

  if (!analysisId) {
    throw new ValidationError("Analysis ID is required", {
      operation: "getMyFeedback",
      metadata: { field: "analysisId" },
    });
  }

  if (!userId) {
    throw new ValidationError("User ID is required", {
      operation: "getMyFeedback",
      metadata: { field: "userId" },
    });
  }

  const feedback = await getFeedbackByUserAndAnalysis(analysisId, userId, tenantId);
  res.status(HTTP_STATUS.OK).json({ data: feedback });
};

/**
 * Gets all feedback for an analysis.
 */
const handleGetAllFeedback = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { analysisId } = req.params;

  if (!analysisId) {
    throw new ValidationError("Analysis ID is required", {
      operation: "getAllFeedback",
      metadata: { field: "analysisId" },
    });
  }

  const feedback = await getFeedbackByAnalysis(analysisId, tenantId);
  res.status(HTTP_STATUS.OK).json({ data: feedback });
};

// ==================== Route Definitions ====================

/** POST /api/v1/analyses/:analysisId/feedback — Submit analysis feedback */
router.post(
  "/api/v1/analyses/:analysisId/feedback",
  rateLimitByCategory("standard"),
  validate({
    body: {
      feedbackType: validateFeedbackType,
      correction: validateCorrection,
    },
  }),
  asyncHandler(handleSubmitFeedback)
);

/** GET /api/v1/analyses/:analysisId/feedback/mine — Get current user's feedback */
router.get(
  "/api/v1/analyses/:analysisId/feedback/mine",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetMyFeedback)
);

/** GET /api/v1/analyses/:analysisId/feedback — Get all feedback for analysis */
router.get(
  "/api/v1/analyses/:analysisId/feedback",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetAllFeedback)
);

export { router as feedbackRoutes };
