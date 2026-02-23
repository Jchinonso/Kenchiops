/**
 * PagerDuty Webhook Signature Verification Middleware
 *
 * Verifies that incoming webhooks are from PagerDuty using HMAC-SHA256 signature.
 * PagerDuty V3 webhooks use the X-PagerDuty-Signature header with format: v1=<hmac>
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createLogger } from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";

const logger = createLogger("pagerduty-verify");

/** PagerDuty signature header name */
const PAGERDUTY_SIGNATURE_HEADER = "x-pagerduty-signature";

/** PagerDuty signature version prefix */
const SIGNATURE_PREFIX = "v1=";

/**
 * Verifies a PagerDuty HMAC-SHA256 signature.
 */
const verifySignature = (payload: string, signature: string, secret: string): boolean => {
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const expectedSignature = signature.slice(SIGNATURE_PREFIX.length);
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(computedSignature, "hex")
    );
  } catch {
    // Intentional: hex decode failure means invalid signature format -- return false to reject
    return false;
  }
};

/**
 * Express middleware to verify PagerDuty webhook signatures.
 *
 * Requires raw body to be captured via express.json({ verify: ... }) in index.ts
 */
export const verifyPagerDutyWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const secret = appConfig.pagerDutyWebhookSecret;

  // Skip verification if no secret configured (development mode)
  if (!secret) {
    logger.warn("PagerDuty webhook secret not configured - skipping verification");
    next();
    return;
  }

  const signature = req.headers[PAGERDUTY_SIGNATURE_HEADER];

  if (!signature || typeof signature !== "string") {
    logger.warn("Missing PagerDuty webhook signature", {
      provider: "pagerduty",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  // Get raw body from the request (captured by express.json verify option)
  const { rawBody } = req;

  if (!rawBody) {
    logger.error("Raw body not available for signature verification", {
      provider: "pagerduty",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  const payload = rawBody.toString("utf8");

  if (!verifySignature(payload, signature, secret)) {
    logger.error("Invalid PagerDuty webhook signature", {
      provider: "pagerduty",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  logger.info("PagerDuty webhook signature verified", {
    provider: "pagerduty",
    operation: "verifySignature",
    path: req.path,
  });
  next();
};
