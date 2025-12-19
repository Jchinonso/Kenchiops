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
  type WebhookEvent,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("api");

/**
 * Event ingestion endpoint
 * POST /events
 *
 * TODO: Store events in database or queue
 * TODO: Trigger analysis workflows
 */
router.post(
  "/events",
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
      status: "accepted",
      message: "TODO: Implement event processing and storage",
    });
  })
);

export { router as eventRoutes };
