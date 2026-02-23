/**
 * Service-to-Service HMAC Authentication
 *
 * Provides HMAC-SHA256 request signing and verification for internal
 * service-to-service communication within the Kenchi monorepo.
 *
 * Signature covers "timestamp.body" to prevent replay attacks.
 * Verification includes clock skew checking and timing-safe comparison.
 *
 * @module http/internalAuth
 */

import crypto from "node:crypto";
import { createLogger } from "../core/logger.js";

const logger = createLogger("internal-auth");

/**
 * Header names used for internal service authentication.
 */
export const INTERNAL_AUTH_HEADERS = {
  SIGNATURE: "x-kenchi-signature",
  TIMESTAMP: "x-kenchi-timestamp",
  SERVICE: "x-kenchi-service",
} as const;

/** Maximum allowed clock skew in seconds (5 minutes). */
const MAX_CLOCK_SKEW_SECONDS = 300;

/** Prefix for HMAC-SHA256 signatures. */
const SIGNATURE_PREFIX = "sha256=";

/** Radix for parsing timestamp integers. */
const TIMESTAMP_RADIX = 10;

/** Number of milliseconds per second for timestamp conversion. */
const MS_PER_SECOND = 1000;

/**
 * Builds the HMAC signing payload from timestamp and body.
 * Format: "timestamp.body" — the dot separator prevents length-extension attacks.
 */
const buildSigningPayload = (timestamp: string, body: string): string => `${timestamp}.${body}`;

/**
 * Sign a request body with HMAC-SHA256.
 * Signature covers "timestamp.body" to prevent replay.
 *
 * @param body - The request body string to sign
 * @param secret - The shared secret for HMAC computation
 * @returns Object with signature and timestamp strings
 */
export const signInternalRequest = (
  body: string,
  secret: string
): { readonly signature: string; readonly timestamp: string } => {
  const timestamp = Math.floor(Date.now() / MS_PER_SECOND).toString();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(buildSigningPayload(timestamp, body));
  return {
    signature: SIGNATURE_PREFIX + hmac.digest("hex"),
    timestamp,
  };
};

/**
 * Verify an HMAC signature with timing-safe comparison and clock skew check.
 *
 * @param signature - The signature header value (e.g., "sha256=abc123...")
 * @param timestamp - The timestamp header value (Unix seconds)
 * @param rawBody - The raw request body string
 * @param secret - The shared secret for HMAC verification
 * @returns true if signature is valid and within clock skew tolerance
 */
export const verifyInternalSignature = (
  signature: string,
  timestamp: string,
  rawBody: string,
  secret: string
): boolean => {
  // Check clock skew
  const requestTime = parseInt(timestamp, TIMESTAMP_RADIX);
  if (isNaN(requestTime)) {
    return false;
  }

  const now = Math.floor(Date.now() / MS_PER_SECOND);
  const skewSeconds = Math.abs(now - requestTime);
  if (skewSeconds > MAX_CLOCK_SKEW_SECONDS) {
    logger.warn("Internal auth timestamp outside allowed skew", {
      skewSeconds,
      maxSkew: MAX_CLOCK_SKEW_SECONDS,
    });
    return false;
  }

  // Verify signature prefix
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const receivedSig = signature.slice(SIGNATURE_PREFIX.length);

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(buildSigningPayload(timestamp, rawBody));
  const expectedSig = hmac.digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(receivedSig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    // Intentional: timingSafeEqual throws if buffer lengths differ (invalid signature format)
    return false;
  }
};
