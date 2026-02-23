/**
 * Netlify Webhook Signature Verification Middleware
 *
 * Verifies that incoming webhooks are from Netlify using JWS (HMAC-SHA256) signature.
 * The `x-webhook-signature` header contains a compact JWS token (header.payload.signature).
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createLogger, NETLIFY_SIGNATURE } from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";

const logger = createLogger("netlify-verify");

/** Expected number of parts in a JWS compact serialization */
const JWS_PART_COUNT = 3;

/**
 * Decode a base64url-encoded string to a Buffer.
 * Converts base64url alphabet (-_ instead of +/) and adds padding.
 */
const decodeBase64Url = (input: string): Buffer => {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
};

/**
 * Verify a Netlify JWS token against the webhook secret and raw body.
 *
 * Steps:
 * 1. Split JWS on "." into [headerB64, payloadB64, signatureB64]
 * 2. Compute HMAC-SHA256(secret, "headerB64.payloadB64") and compare to decoded signature
 * 3. Decode payload claims and verify iss === "netlify"
 * 4. Compute SHA-256(rawBody) and verify it matches the sha256 claim
 */
const verifyJWS = (rawBody: Buffer, jwsToken: string, secret: string): boolean => {
  const parts = jwsToken.split(".");
  if (parts.length !== JWS_PART_COUNT) {
    return false;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  // Verify HMAC-SHA256 signature
  const computedSig = crypto.createHmac("sha256", secret).update(signingInput).digest();
  const providedSig = decodeBase64Url(signatureB64);

  try {
    if (!crypto.timingSafeEqual(computedSig, providedSig)) {
      return false;
    }
  } catch {
    // timingSafeEqual throws if buffer lengths differ
    return false;
  }

  // Decode and verify claims
  const claimsJson = decodeBase64Url(payloadB64).toString("utf8");
  const claims = JSON.parse(claimsJson) as { readonly iss?: string; readonly sha256?: string };

  if (claims.iss !== NETLIFY_SIGNATURE.ISSUER) {
    return false;
  }

  // Verify body integrity: SHA-256 of raw body must match claim
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  return bodyHash === claims.sha256;
};

/**
 * Express middleware to verify Netlify webhook signatures.
 *
 * Requires raw body to be captured via express.json({ verify: ... }) in index.ts.
 */
export const verifyNetlifyWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const secret = appConfig.netlifyWebhookSecret;

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
      path: req.path,
    });
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const { rawBody } = req;

  if (!rawBody) {
    logger.error("Raw body not available for Netlify signature verification", {
      provider: "netlify",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  try {
    if (!verifyJWS(rawBody, signature, secret)) {
      logger.error("Invalid Netlify webhook signature", {
        provider: "netlify",
        operation: "verifySignature",
        path: req.path,
      });
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  } catch {
    // JWS parse error — invalid format
    logger.error("Netlify webhook signature verification failed (parse error)", {
      provider: "netlify",
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  logger.info("Netlify webhook signature verified", {
    provider: "netlify",
    operation: "verifySignature",
    path: req.path,
  });
  next();
};
