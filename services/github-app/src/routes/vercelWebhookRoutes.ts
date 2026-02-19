/**
 * Vercel Webhook Routes
 *
 * Handles incoming deployment webhooks from Vercel.
 * Endpoint: POST /api/vercel/webhook
 *
 * @module routes/vercelWebhookRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  getErrorMessage,
  createWebhookActivity,
  findWebhookActivityByDeliveryId,
} from "@kenchi/shared";
import { verifyVercelWebhook } from "../middleware/verifyVercel.js";
import { handleVercelDeployment } from "../handlers/vercelDeploymentHandler.js";
import type { VercelWebhook } from "../types/vercelTypes.js";

const router = Router();
const logger = createLogger("github-app");

/**
 * Safely log webhook activity — failures must never break webhook processing.
 */
const logWebhookActivity = async (
  deliveryId: string,
  eventType: string,
  status: string,
  startTime: number,
  errorMessage?: string | null,
  metadata?: Readonly<Record<string, unknown>> | null
): Promise<void> => {
  try {
    await createWebhookActivity({
      deliveryId,
      eventType,
      source: "vercel",
      status,
      tenantId: null,
      processingTimeMs: Date.now() - startTime,
      errorMessage: errorMessage ?? null,
      metadata,
    });
  } catch (error) {
    logger.warn("Failed to log Vercel webhook activity", {
      deliveryId,
      error: getErrorMessage(error),
    });
  }
};

/**
 * POST /api/vercel/webhook
 * Receives all Vercel webhook events.
 */
router.post(
  "/webhook",
  verifyVercelWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = req.body as VercelWebhook;
    const deliveryId = webhook.id ?? "unknown";
    const startTime = Date.now();

    logger.info("Received Vercel webhook", {
      eventType: webhook.type,
      deliveryId,
    });

    // Replay protection: skip if already processed
    try {
      const existing = await findWebhookActivityByDeliveryId(deliveryId);
      if (existing) {
        logger.info("Duplicate Vercel webhook, skipping", {
          provider: "vercel",
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
      // Replay check is best-effort — proceed with processing if it fails
      logger.warn("Replay protection check failed, proceeding with processing", {
        deliveryId,
        error: getErrorMessage(error),
      });
    }

    try {
      const result = await handleVercelDeployment(webhook);
      const status = result.handled ? "processed" : "skipped";
      void logWebhookActivity(deliveryId, webhook.type, status, startTime);

      res.status(HTTP_STATUS.OK).json({
        status: result.handled ? "processed" : "skipped",
        message: result.message,
        eventId: result.eventId,
      });
    } catch (error) {
      void logWebhookActivity(
        deliveryId,
        webhook.type,
        "failed",
        startTime,
        getErrorMessage(error)
      );
      throw error;
    }
  })
);

export { router as vercelWebhookRoutes };
