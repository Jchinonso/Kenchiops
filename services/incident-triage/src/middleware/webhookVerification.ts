/**
 * Webhook Verification Middleware Factory
 *
 * Creates Express middleware for verifying webhook signatures from different
 * monitoring providers. Supports two strategies:
 *
 * - **hmac**: HMAC-based signature verification (e.g., Grafana SHA256 with timestamp)
 * - **shared-secret**: Direct secret comparison via header (e.g., Datadog, Prometheus)
 *
 * Existing PagerDuty verification (verifyPagerDuty.ts) is left untouched.
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createLogger, config } from "@kenchi/shared";

// ==================== Types ====================

interface HmacVerificationConfig {
  readonly strategy: "hmac";
  readonly provider: string;
  readonly signatureHeader: string;
  readonly timestampHeader: string;
  readonly algorithm: string;
  readonly secret: string;
}

interface SharedSecretVerificationConfig {
  readonly strategy: "shared-secret";
  readonly provider: string;
  readonly secretHeader: string;
  readonly secret: string;
}

type WebhookVerificationConfig = HmacVerificationConfig | SharedSecretVerificationConfig;

// ==================== HMAC Verification ====================

/**
 * Verifies an HMAC signature by computing the expected digest from
 * the timestamp + raw body and comparing it to the provided signature.
 */
const verifyHmacSignature = (
  rawBody: Buffer,
  timestamp: string,
  signature: string,
  secret: string,
  algorithm: string
): boolean => {
  const payload = timestamp + rawBody.toString("utf8");
  const computedSignature = crypto
    .createHmac(algorithm, secret)
    .update(payload, "utf8")
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(computedSignature, "hex")
    );
  } catch {
    // Intentional: hex decode failure means invalid signature format — return false to reject
    return false;
  }
};

// ==================== Shared-Secret Verification ====================

/**
 * Timing-safe comparison of two secret strings.
 * Pads to equal length to avoid leaking length info, then rejects if original lengths differ.
 */
const verifySharedSecret = (provided: string, expected: string): boolean => {
  const providedLen = provided.length;
  const expectedLen = expected.length;
  const maxLen = Math.max(providedLen, expectedLen);
  const paddedProvided = provided.padEnd(maxLen, "\0");
  const paddedExpected = expected.padEnd(maxLen, "\0");
  const isEqual = crypto.timingSafeEqual(
    Buffer.from(paddedProvided, "utf8"),
    Buffer.from(paddedExpected, "utf8")
  );
  return isEqual && providedLen === expectedLen;
};

// ==================== HMAC Strategy Handler ====================

const handleHmacVerification = (
  req: Request,
  res: Response,
  next: NextFunction,
  cfg: HmacVerificationConfig,
  verificationLogger: ReturnType<typeof createLogger>
): void => {
  const { provider, signatureHeader, timestampHeader, algorithm, secret } = cfg;
  const signature = req.headers[signatureHeader];
  const timestamp = req.headers[timestampHeader];

  if (!signature || typeof signature !== "string") {
    verificationLogger.warn("Missing webhook signature header", {
      provider,
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  if (!timestamp || typeof timestamp !== "string") {
    verificationLogger.warn("Missing webhook timestamp header", {
      provider,
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Missing webhook timestamp" });
    return;
  }

  const { rawBody } = req;
  if (!rawBody) {
    verificationLogger.error("Raw body not available for signature verification", {
      provider,
      operation: "verifySignature",
      path: req.path,
    });
    res.status(500).json({ error: "Raw body not available for verification" });
    return;
  }

  if (!verifyHmacSignature(rawBody, timestamp, signature, secret, algorithm)) {
    verificationLogger.error("Invalid webhook signature", {
      provider,
      operation: "verifySignature",
      path: req.path,
    });
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  verificationLogger.info("Webhook signature verified", {
    provider,
    operation: "verifySignature",
    path: req.path,
  });
  next();
};

// ==================== Shared-Secret Strategy Handler ====================

const handleSharedSecretVerification = (
  req: Request,
  res: Response,
  next: NextFunction,
  cfg: SharedSecretVerificationConfig,
  verificationLogger: ReturnType<typeof createLogger>
): void => {
  const { provider, secretHeader, secret } = cfg;
  // Check header first, fall back to query parameter (for providers like
  // Alertmanager 0.27 that cannot send custom headers on internal networks).
  const providedSecret =
    req.headers[secretHeader] ?? (req.query.secret as string | undefined) ?? undefined;

  if (!providedSecret || typeof providedSecret !== "string") {
    verificationLogger.warn("Missing webhook secret header", {
      provider,
      operation: "verifySecret",
      path: req.path,
    });
    res.status(401).json({ error: "Missing webhook secret" });
    return;
  }

  if (!verifySharedSecret(providedSecret, secret)) {
    verificationLogger.error("Invalid webhook secret", {
      provider,
      operation: "verifySecret",
      path: req.path,
    });
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  verificationLogger.info("Webhook secret verified", {
    provider,
    operation: "verifySecret",
    path: req.path,
  });
  next();
};

// ==================== Middleware Factory ====================

/**
 * Creates Express middleware that verifies webhook signatures.
 *
 * @param verificationConfig - Configuration for the verification strategy
 * @returns Express middleware function
 */
export const createWebhookVerificationMiddleware = (
  verificationConfig: WebhookVerificationConfig
): ((req: Request, res: Response, next: NextFunction) => void) => {
  const { secret, provider, strategy } = verificationConfig;
  const verificationLogger = createLogger(`${provider}-verify`);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Fail closed: reject if no secret configured in production
    if (!secret) {
      const isProduction = config.NODE_ENV === "production";
      if (isProduction) {
        verificationLogger.error(
          `${provider} webhook secret not configured in production — rejecting`,
          {
            provider,
            operation: "verifySignature",
          }
        );
        res.status(401).json({ error: "Webhook verification not configured" });
        return;
      }
      verificationLogger.warn(
        `${provider} webhook secret not configured - skipping verification (non-production)`
      );
      next();
      return;
    }

    if (strategy === "hmac") {
      handleHmacVerification(
        req,
        res,
        next,
        verificationConfig as HmacVerificationConfig,
        verificationLogger
      );
      return;
    }

    handleSharedSecretVerification(
      req,
      res,
      next,
      verificationConfig as SharedSecretVerificationConfig,
      verificationLogger
    );
  };
};
