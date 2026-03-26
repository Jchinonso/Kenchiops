/**
 * Sentry Webhook Signature Verification Middleware
 *
 * Verifies that incoming webhooks are from Sentry using HMAC-SHA256 signature.
 * The `sentry-hook-signature` header contains a raw hex digest.
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createLogger, config } from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";

const logger = createLogger("sentry-verify");

/** Sentry signature header name */
const SENTRY_SIGNATURE_HEADER = "sentry-hook-signature";

/**
 * Verifies a Sentry HMAC-SHA256 signature.
 */
const verifySignature = (rawBody: Buffer, signature: string, secret: string): boolean => {
  const computedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(computedSignature, "hex")
    );
  } catch {
    // Intentional: hex decode failure means invalid signature format -- return false to reject
    return false;
  }
};

/**
 * Express middleware to verify Sentry webhook signatures.
 *
 * Requires raw body to be captured via express.json({ verify: ... }) in index.ts.
 */
export const verifySentryWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const secret = appConfig.sentryWebhookSecret;

  // Fail closed: reject if no secret configured in production
  if (!secret) {
    const isProduction = config.NODE_ENV === "production";
    if (isProduction) {
      logger.error("Sentry webhook secret not configured in production — rejecting", {
        provider: "sentry",
        operation: "verifySignature",
      });
      res.status(401).json({ error: "Webhook verification not configured" });
      return;
    }
    logger.warn("Sentry webhook secret not configured - skipping verification (non-production)");
    next();
    return;
  }

  const signature = req.headers[SENTRY_SIGNATURE_HEADER];

  if (!signature || typeof signature !== "string") {
    logger.warn("Missing Sentry webhook signature", {
      provider: "sentry",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const { rawBody } = req;

  if (!rawBody) {
    logger.error("Raw body not available for Sentry signature verification", {
      provider: "sentry",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  if (!verifySignature(rawBody, signature, secret)) {
    logger.error("Invalid Sentry webhook signature", {
      provider: "sentry",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  logger.info("Sentry webhook signature verified", {
    provider: "sentry",
    operation: "verifySignature",
    path: req.path,
  });
  next();
};
