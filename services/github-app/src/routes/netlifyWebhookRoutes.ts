/**
 * Netlify Webhook Routes
 *
 * Handles incoming deploy webhooks from Netlify.
 * Endpoint: POST /api/netlify/webhook
 *
 * @module routes/netlifyWebhookRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  getErrorMessage,
  NETLIFY_EVENT_HEADER,
  findWebhookActivityByDeliveryId,
} from "@kenchi/shared";
import { verifyNetlifyWebhook } from "../middleware/verifyNetlify.js";
import { handleNetlifyDeployment } from "../handlers/netlifyDeploymentHandler.js";
import { logWebhookActivity } from "../helpers/webhookActivityLogger.js";
import type { NetlifyDeployPayload } from "../types/netlifyTypes.js";

const router = Router();
const logger = createLogger("github-app");

/**
 * POST /api/netlify/webhook
 * Receives all Netlify webhook events.
 */
router.post(
  "/webhook",
  verifyNetlifyWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body as NetlifyDeployPayload;
    const deliveryId = payload.id ?? "unknown";
    const eventType = (req.headers[NETLIFY_EVENT_HEADER] as string) ?? "unknown";
    const startTime = Date.now();

    logger.info("Received Netlify webhook", {
      eventType,
      deliveryId,
    });

    // Replay protection: skip if already processed
    try {
      const existing = await findWebhookActivityByDeliveryId(deliveryId);
      if (existing) {
        logger.info("Duplicate Netlify webhook, skipping", {
          provider: "netlify",
          operation: "receiveWebhook",
          deliveryId,
          existingId: existing.id,
        });
        res.status(HTTP_STATUS.OK).json({
          status: "duplicate",
          message: "Webhook already processed",
        });
        return;
      }
    } catch (error) {
      // Replay check is best-effort -- proceed with processing if it fails
      logger.warn("Replay protection check failed, proceeding with processing", {
        deliveryId,
        error: getErrorMessage(error),
      });
    }

    try {
      const result = await handleNetlifyDeployment(payload);
      const status = result.handled ? "processed" : "skipped";
      void logWebhookActivity({
        deliveryId,
        eventType,
        source: "netlify",
        status,
        startTime,
      });

      res.status(HTTP_STATUS.OK).json({
        status: result.handled ? "processed" : "skipped",
        message: result.message,
        eventId: result.eventId,
      });
    } catch (error) {
      void logWebhookActivity({
        deliveryId,
        eventType,
        source: "netlify",
        status: "failed",
        startTime,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  })
);

export { router as netlifyWebhookRoutes };
