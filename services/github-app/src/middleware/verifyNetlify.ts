/**
 * Netlify Webhook Signature Verification Middleware
 *
 * Verifies that incoming webhooks are from Netlify using JWS signature.
 * The `x-webhook-signature` header contains a compact JWS token (header.payload.signature).
 *
 * @module middleware/verifyNetlify
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger, NETLIFY_SIGNATURE } from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";
import { netlifyWebhookAdapter } from "../adapters/netlifyWebhookAdapter.js";

const logger = createLogger("github-app");

/**
 * Express middleware to verify Netlify webhook signatures.
 *
 * Delegates JWS verification to netlifyWebhookAdapter.verifySignature()
 * to avoid duplicating crypto logic.
 *
 * Requires raw body to be captured via express.json({ verify: ... }) in index.ts.
 */
export const verifyNetlifyWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const secret = appConfig.netlify.webhookSecret;

  // Skip verification if no secret configured (development mode)
  if (!secret) {
    logger.warn("Netlify webhook secret not configured - skipping verification");
    next();
    return;
  }

  const signature = req.headers[NETLIFY_SIGNATURE.HEADER];

  if (!signature || typeof signature !== "string") {
    logger.warn("Missing Netlify webhook signature", {
      provider: "netlify",
      operation: "verifySignature",
    });
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const { rawBody } = req;

  if (!rawBody) {
    logger.error("Raw body not available for Netlify signature verification", {
      provider: "netlify",
      operation: "verifySignature",
    });
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  if (!netlifyWebhookAdapter.verifySignature(rawBody, signature, secret)) {
    logger.error("Invalid Netlify webhook signature", {
      provider: "netlify",
      operation: "verifySignature",
    });
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  logger.info("Netlify webhook signature verified", { path: req.path });
  next();
};
