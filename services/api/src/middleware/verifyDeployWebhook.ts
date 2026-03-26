/**
 * Deploy Webhook Signature Verification Middleware
 *
 * Express middleware that verifies webhook signatures for deployment platforms.
 * Uses the adapter's verifySignature method (from DeployLogSourcePort).
 * Fails closed: rejects with 401 if signature is missing or invalid.
 *
 * Requires raw body captured via express.json({ verify: ... }) in index.ts.
 *
 * @module middleware/verifyDeployWebhook
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  createLogger,
  config,
  VERCEL_SIGNATURE,
  type DeployLogSourcePort,
  type DeployPlatform,
} from "@kenchi/shared";

const logger = createLogger("deploy-webhook-verify");

/** Signature header per platform. */
const SIGNATURE_HEADERS: Readonly<Record<DeployPlatform, string>> = {
  vercel: VERCEL_SIGNATURE.HEADER,
  railway: "x-railway-signature",
  render: "x-render-signature",
  netlify: "x-webhook-signature",
};

/** Webhook secret per platform from shared config. */
const getWebhookSecret = (platform: DeployPlatform): string => {
  const secrets: Readonly<Record<DeployPlatform, string | undefined>> = {
    vercel: config.VERCEL_WEBHOOK_SECRET,
    railway: config.RAILWAY_WEBHOOK_SECRET,
    render: config.RENDER_WEBHOOK_SECRET,
    netlify: config.NETLIFY_WEBHOOK_SECRET,
  };

  return secrets[platform] ?? "";
};

/**
 * Creates verification middleware for a specific deploy platform.
 *
 * @param platform - The deployment platform to verify signatures for
 * @param adapter - The platform's adapter implementing DeployLogSourcePort
 * @returns Express middleware that verifies the webhook signature
 */
export const createDeployWebhookVerifier = (
  platform: DeployPlatform,
  adapter: DeployLogSourcePort
): RequestHandler => {
  const signatureHeader = SIGNATURE_HEADERS[platform];

  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = getWebhookSecret(platform);

    // Fail closed: reject if no secret configured in production
    if (!secret) {
      const isProduction = config.NODE_ENV === "production";
      if (isProduction) {
        logger.error("Deploy webhook secret not configured in production — rejecting", {
          provider: platform,
          operation: "verifySignature",
        });
        res.status(401).json({ error: "Webhook verification not configured" });
        return;
      }
      logger.warn("Deploy webhook secret not configured — skipping verification (non-production)", {
        provider: platform,
        operation: "verifySignature",
      });
      next();
      return;
    }

    const signature = req.headers[signatureHeader];

    if (!signature || typeof signature !== "string") {
      logger.warn("Missing deploy webhook signature", {
        provider: platform,
        operation: "verifySignature",
        path: req.path,
      });
      res.status(401).json({ error: "Missing webhook signature" });
      return;
    }

    const { rawBody } = req;

    if (!rawBody) {
      logger.error("Raw body not available for signature verification", {
        provider: platform,
        operation: "verifySignature",
        path: req.path,
      });
      res.status(500).json({ error: "Raw body not available for verification" });
      return;
    }

    if (!adapter.verifySignature(rawBody, signature, secret)) {
      logger.error("Invalid deploy webhook signature", {
        provider: platform,
        operation: "verifySignature",
        path: req.path,
      });
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    logger.info("Deploy webhook signature verified", {
      provider: platform,
      operation: "verifySignature",
      path: req.path,
    });
    next();
  };
};
