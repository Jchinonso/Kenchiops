/**
 * Webhook Routes
 *
 * Handles incoming webhooks from various sources
 */

import { Router } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  SERVICE_NAMES,
  API_ROUTES,
  API_RESPONSE_STATUS,
  API_MESSAGES,
} from "@kenchi/shared";
import type { WebhookPayload } from "../types/apiTypes.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

/**
 * Generic webhook endpoint
 * POST /webhook/:source
 *
 * TODO: Implement routing to appropriate handlers based on event type
 * TODO: Add authentication/authorization
 */
router.post(
  API_ROUTES.WEBHOOK,
  asyncHandler(async (req, res) => {
    const { source } = req.params as { source: string };
    const payload = req.body as WebhookPayload;

    logger.info("Webhook received", {
      source,
      payloadKeys: Object.keys(payload),
    });

    // TODO: Route to appropriate handler based on source
    // TODO: Validate payload
    // TODO: Trigger appropriate workflow or service

    res.status(HTTP_STATUS.OK).json({
      status: API_RESPONSE_STATUS.RECEIVED,
      source,
      message: API_MESSAGES.WEBHOOK_PROCESSING_PENDING,
    });
  })
);

export { router as webhookRoutes };
