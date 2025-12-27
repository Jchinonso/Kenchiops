/**
 * Event Routes
 *
 * Handles event ingestion and processing
 */

import { Router } from "express";
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

/**
 * Event ingestion endpoint
 * POST /events
 *
 * TODO: Store events in database or queue
 * TODO: Trigger analysis workflows
 */
router.post(
  API_ROUTES.EVENTS,
  validate({
    body: {
      source: (v) => validators.required(v) && validators.string(v),
      type: (v) => validators.required(v) && validators.string(v),
    },
  }),
  asyncHandler(async (req, res) => {
    const event = req.body as WebhookEvent;

    logger.info("Event received", {
      source: event.source,
      type: event.type,
      timestamp: event.timestamp,
    });

    // TODO: Validate event schema
    // TODO: Store in database/vector store
    // TODO: Trigger appropriate analysis workflow

    res.status(HTTP_STATUS.OK).json({
      status: API_RESPONSE_STATUS.ACCEPTED,
      message: API_MESSAGES.EVENT_PROCESSING_PENDING,
    });
  })
);

export { router as eventRoutes };
