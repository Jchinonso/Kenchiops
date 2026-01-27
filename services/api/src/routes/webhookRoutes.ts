/**
 * Webhook Routes
 *
 * Handles incoming webhooks from various sources.
 *
 * @module routes/webhookRoutes
 */

import { Router, type Request, type Response } from "express";
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

// ==================== Route Handlers ====================

/**
 * Handles generic webhook requests.
 */
const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { source } = req.params as { source: string };
  const payload = req.body as WebhookPayload;

  logger.info("Webhook processed", {
    source,
    payloadKeys: Object.keys(payload),
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_RESPONSE_STATUS.RECEIVED,
    source,
    message: API_MESSAGES.WEBHOOK_PROCESSING_PENDING,
  });
};

// ==================== Route Definitions ====================

/** POST /webhook/:source - Generic webhook endpoint */
router.post(API_ROUTES.WEBHOOK, asyncHandler(handleWebhook));

export { router as webhookRoutes };
