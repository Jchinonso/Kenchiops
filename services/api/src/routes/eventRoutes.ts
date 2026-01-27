/**
 * Event Routes
 *
 * Handles event ingestion and processing.
 *
 * @module routes/eventRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  validate,
  validators,
  HTTP_STATUS,
  SERVICE_NAMES,
  API_ROUTES,
  API_RESPONSE_STATUS,
  API_MESSAGES,
  type WebhookEvent,
} from "@kenchi/shared";

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

// ==================== Route Handlers ====================

/**
 * Handles event ingestion requests.
 */
const handleEventIngestion = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const event = req.body as WebhookEvent;

  logger.info("Event ingested", {
    source: event.source,
    type: event.type,
    timestamp: event.timestamp,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_RESPONSE_STATUS.ACCEPTED,
    message: API_MESSAGES.EVENT_PROCESSING_PENDING,
  });
};

// ==================== Route Definitions ====================

/** POST /events - Event ingestion endpoint */
router.post(
  API_ROUTES.EVENTS,
  validate({
    body: {
      source: validateRequiredString,
      type: validateRequiredString,
    },
  }),
  asyncHandler(handleEventIngestion)
);

export { router as eventRoutes };
