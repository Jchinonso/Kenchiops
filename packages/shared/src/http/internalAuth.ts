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

/** Config shape needed for HMAC key resolution. */
interface ServiceSecretConfig {
  readonly INTERNAL_SERVICE_SECRET?: string;
  readonly SERVICE_HMAC_SECRET_API?: string;
  readonly SERVICE_HMAC_SECRET_GITHUB_APP?: string;
  readonly SERVICE_HMAC_SECRET_SLACK_BOT?: string;
  readonly SERVICE_HMAC_SECRET_INCIDENT_TRIAGE?: string;
  readonly SERVICE_NAME?: string;
}

/**
 * Maps service name header values to per-service config property names.
 * Service names are normalized to lowercase for comparison.
 */
const SERVICE_SECRET_KEYS: Readonly<Record<string, keyof ServiceSecretConfig>> = {
  api: "SERVICE_HMAC_SECRET_API",
  "github-app": "SERVICE_HMAC_SECRET_GITHUB_APP",
  "slack-bot": "SERVICE_HMAC_SECRET_SLACK_BOT",
  "incident-triage": "SERVICE_HMAC_SECRET_INCIDENT_TRIAGE",
};

/**
 * Resolve the HMAC secret for a calling service.
 * Tries per-service secret first, then falls back to INTERNAL_SERVICE_SECRET.
 *
 * @param serviceName - The calling service name (from x-kenchi-service header)
 * @param serviceConfig - The application config object
 * @returns The resolved secret, or undefined if none configured
 */
export const resolveServiceSecret = (
  serviceName: string | undefined,
  serviceConfig: ServiceSecretConfig
): string | undefined => {
  if (serviceName) {
    const configKey = SERVICE_SECRET_KEYS[serviceName.toLowerCase()];
    if (configKey) {
      const perServiceSecret = serviceConfig[configKey];
      if (perServiceSecret) {
        return perServiceSecret;
      }
    }
  }
  return serviceConfig.INTERNAL_SERVICE_SECRET;
};

/**
 * Resolve the HMAC secret for the current service (signing side).
 * Uses SERVICE_NAME env var to look up the per-service secret,
 * falling back to INTERNAL_SERVICE_SECRET.
 *
 * @param serviceConfig - The application config object
 * @returns The resolved secret, or undefined if none configured
 */
export const resolveSigningSecret = (serviceConfig: ServiceSecretConfig): string | undefined =>
  resolveServiceSecret(serviceConfig.SERVICE_NAME, serviceConfig);
