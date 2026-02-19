/**
 * Vercel Webhook Signature Verification Middleware
 *
 * Verifies that incoming webhooks are from Vercel using HMAC-SHA1 signature.
 * The `x-vercel-signature` header contains a raw hex digest (no prefix).
 *
 * @module middleware/verifyVercel
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger, VERCEL_SIGNATURE } from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";
import { vercelWebhookAdapter } from "../adapters/vercelWebhookAdapter.js";

const logger = createLogger("github-app");

/**
 * Express middleware to verify Vercel webhook signatures.
 *
 * Delegates crypto verification to vercelWebhookAdapter.verifySignature()
 * to avoid duplicating HMAC-SHA1 logic.
 *
 * Requires raw body to be captured via express.json({ verify: ... }) in index.ts.
 */
export const verifyVercelWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const secret = appConfig.vercel.webhookSecret;

  // Skip verification if no secret configured (development mode)
  if (!secret) {
    logger.warn("Vercel webhook secret not configured - skipping verification");
    next();
    return;
  }

  const signature = req.headers[VERCEL_SIGNATURE.HEADER];

  if (!signature || typeof signature !== "string") {
    logger.warn("Missing Vercel webhook signature", {
      provider: "vercel",
      operation: "verifySignature",
    });
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const { rawBody } = req;

  if (!rawBody) {
    logger.error("Raw body not available for Vercel signature verification", {
      provider: "vercel",
      operation: "verifySignature",
    });
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  if (!vercelWebhookAdapter.verifySignature(rawBody, signature, secret)) {
    logger.error("Invalid Vercel webhook signature", {
      provider: "vercel",
      operation: "verifySignature",
    });
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  logger.info("Vercel webhook signature verified", { path: req.path });
  next();
};
