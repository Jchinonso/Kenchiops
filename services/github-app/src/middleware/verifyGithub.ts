/**
 * GitHub Webhook Signature Verification Middleware
 *
 * Verifies that incoming webhooks are from GitHub using HMAC signature
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createLogger, GITHUB_SIGNATURE } from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";

const logger = createLogger("github-app");

/**
 * Verifies GitHub webhook signature
 */
const verifySignature = (payload: string, signature: string, secret: string): boolean => {
  if (!signature.startsWith(GITHUB_SIGNATURE.PREFIX)) {
    return false;
  }

  const expectedSignature = signature.slice(GITHUB_SIGNATURE.PREFIX.length);
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
    return false;
  }
};

/**
 * Express middleware to verify GitHub webhook signatures
 *
 * Requires raw body to be captured via express.json({ verify: ... }) in index.ts
 */
export const verifyGitHubWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const secret = appConfig.github.webhookSecret;

  // SECURITY (VULN-502): Fail-closed -- reject all webhooks if secret is missing.
  // The secret is now a required startup config field; this guard is defense-in-depth.
  if (!secret) {
    logger.error("Webhook secret not configured, denying inbound webhook", {
      provider: "github",
      operation: "verifyGitHubWebhook",
    });
    res.status(401).json({ error: "Webhook verification not configured" });
    return;
  }

  const signature = req.headers[GITHUB_SIGNATURE.HEADER];

  if (!signature || typeof signature !== "string") {
    logger.warn("Missing GitHub webhook signature", {
      path: req.path,
      headers: Object.keys(req.headers),
    });
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  // Get raw body from the request (captured by express.json verify option)
  const { rawBody } = req;

  if (!rawBody) {
    logger.error("Raw body not available for signature verification", {
      path: req.path,
    });
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  const payload = rawBody.toString("utf8");

  if (!verifySignature(payload, signature, secret)) {
    logger.error("Invalid GitHub webhook signature", {
      path: req.path,
      signaturePrefix: signature.substring(0, 20),
    });
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  logger.info("GitHub webhook signature verified", { path: req.path });
  next();
};
