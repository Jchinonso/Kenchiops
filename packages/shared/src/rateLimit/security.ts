/**
 * Rate Limiting Security Utilities
 *
 * IP validation, fingerprinting, and secure key generation
 * for rate limiting middleware.
 *
 * Security features:
 * - IP validation to prevent spoofing
 * - Tenant-aware rate limiting for authenticated requests
 * - Fingerprint fallback for requests without valid IP
 * - Suspicious activity logging
 *
 * @module rateLimit/security
 */

import type { Request } from "express";
import crypto from "crypto";
import { createLogger } from "../core/logger.js";
import {
  IDENTITY_HEADERS,
  PRIVATE_IP_PATTERNS,
  FINGERPRINT_MAX_LENGTH,
  FINGERPRINT_HASH_LENGTH,
  FINGERPRINT_SECONDARY_LENGTH,
  FINGERPRINT_SHORT_LENGTH,
  VALID_IDENTITY_PATTERN,
  IPV4_MAX_OCTET,
  IDENTITY_HEADER_MAX_LENGTH,
  type TLSSocket,
} from "./types.js";

const logger = createLogger("rate-limiter");

// ==================== IP Validation Functions ====================

/**
 * Checks if an IP address is a private/internal address.
 */
export const isPrivateIP = (ip: string): boolean =>
  PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));

/**
 * Validates an IPv4 address format and octet values.
 */
export const isValidIPv4 = (ip: string): boolean => {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= IPV4_MAX_OCTET && part === String(num);
  });
};

// ==================== IPv6 Validation Helpers ====================

const IPV6_MAX_GROUPS = 8;
const IPV6_VALID_CHARS = /^[0-9a-fA-F:]+$/;
const IPV6_HEX_ONLY = /^[0-9a-fA-F]+$/;

const hasValidIPv6Structure = (ip: string): boolean =>
  ip.includes(":") && IPV6_VALID_CHARS.test(ip) && !ip.includes(":::");

const countDoubleColons = (ip: string): number => (ip.match(/::/g) ?? []).length;

/**
 * Validates IPv6 group count based on compression.
 */
const hasValidGroupCount = (groups: string[], hasCompression: boolean): boolean => {
  if (hasCompression) {
    return groups.length <= IPV6_MAX_GROUPS;
  }
  return groups.length === IPV6_MAX_GROUPS;
};

/**
 * Validates a single IPv6 group per RFC 5952.
 * Rejects leading zeros to prevent bypass attacks.
 */
const isValidIPv6Group = (group: string): boolean => {
  if (group.length === 0) {
    return true;
  } // Empty allowed for ::
  if (group.length > 4) {
    return false;
  }
  if (group.length > 1 && group[0] === "0") {
    return false;
  } // No leading zeros
  return IPV6_HEX_ONLY.test(group);
};

/**
 * Validates an IPv6 address format (strict validation per RFC 5952).
 */
export const isValidIPv6 = (ip: string): boolean => {
  if (!hasValidIPv6Structure(ip)) {
    return false;
  }

  const doubleColonCount = countDoubleColons(ip);
  if (doubleColonCount > 1) {
    return false;
  }

  const groups = ip.split(":");
  if (!hasValidGroupCount(groups, doubleColonCount === 1)) {
    return false;
  }

  return groups.every(isValidIPv6Group);
};

/**
 * Validates and sanitizes an IP address for use as a rate limit key.
 * Returns null if the IP is invalid or private.
 */
export const validateIP = (ip: string | undefined): string | null => {
  if (!ip) {
    return null;
  }

  // Validate IP format
  const isValid = isValidIPv4(ip) || isValidIPv6(ip);
  if (!isValid) {
    logger.warn("Invalid IP format detected", { ip: ip.slice(0, 50) });
    return null;
  }

  // Reject private IPs for rate limiting (they could be proxies)
  if (isPrivateIP(ip)) {
    return null;
  }

  return ip;
};

// ==================== Fingerprinting Functions ====================

/**
 * Creates a cryptographic fingerprint for rate limiting when IP is unavailable.
 * Uses a SHA hash of multiple request characteristics to create a
 * collision-resistant identifier that's harder to spoof than raw headers.
 *
 * SECURITY: Adds random entropy when headers are missing to prevent
 * collision attacks where attackers send minimal requests.
 */
export const createRequestFingerprint = (req: Request): string => {
  const headers = req.headers ?? {};
  const userAgent = headers["user-agent"]?.slice(0, FINGERPRINT_MAX_LENGTH) ?? "";
  const acceptLang = headers["accept-language"]?.slice(0, FINGERPRINT_SECONDARY_LENGTH) ?? "";
  const acceptEnc = headers["accept-encoding"]?.slice(0, FINGERPRINT_SECONDARY_LENGTH) ?? "";
  const accept = headers.accept?.slice(0, FINGERPRINT_SECONDARY_LENGTH) ?? "";
  const connection = headers.connection?.slice(0, FINGERPRINT_SHORT_LENGTH) ?? "";
  // Include TLS cipher if available for additional entropy
  const tlsCipher = (req.socket as TLSSocket | undefined)?.getCipher?.()?.name ?? "";

  const components = [userAgent, acceptLang, acceptEnc, accept, connection, tlsCipher];

  // SECURITY: If all headers are empty/missing, add random entropy to prevent
  // fingerprint collision attacks where attackers send minimal headers
  const hasEntropy = components.some((component) => component.length > 0);
  if (!hasEntropy) {
    // Add timestamp and random value for unique fingerprint per request
    components.push(`entropy:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`);
  }

  const hash = crypto
    .createHash("sha256")
    .update(components.join("|"))
    .digest("hex")
    .slice(0, FINGERPRINT_HASH_LENGTH);

  return `fp:${hash}`;
};

// ==================== Identity Extraction Functions ====================

/**
 * Validates and sanitizes an identity header value.
 * Only allows alphanumeric characters, dashes, and underscores.
 * SECURITY: Normalizes to lowercase to prevent case-based bypass attacks.
 */
export const sanitizeIdentity = (value: string | string[] | undefined): string | null => {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  // Normalize to lowercase to prevent case-based bypass (HTTP headers are case-insensitive)
  const normalized = value.slice(0, IDENTITY_HEADER_MAX_LENGTH).toLowerCase();
  if (!VALID_IDENTITY_PATTERN.test(normalized)) {
    logger.warn("Invalid identity header format detected");
    return null;
  }
  return normalized;
};

/**
 * Identity header extraction configuration.
 * Order determines priority - first match wins.
 */
const IDENTITY_CONFIG = [
  { header: IDENTITY_HEADERS.TENANT_ID, prefix: "tenant" },
  { header: IDENTITY_HEADERS.INSTALLATION_ID, prefix: "install" },
  { header: IDENTITY_HEADERS.CLIENT_ID, prefix: "client" },
] as const;

/**
 * Extracts tenant/installation identity from request headers.
 * Validates format to prevent Redis key injection.
 * Returns null if no valid identity headers are present.
 */
export const extractIdentity = (req: Request): string | null => {
  const { headers } = req;
  if (!headers) {
    return null;
  }

  for (const { header, prefix } of IDENTITY_CONFIG) {
    const value = sanitizeIdentity(headers[header]);
    if (value) {
      return `${prefix}:${value}`;
    }
  }

  return null;
};

// ==================== Secure Key Generator ====================

/**
 * Builds rate limit key from identity and location components.
 */
const buildRateLimitKey = (identity: string | null, location: string, req: Request): string => {
  if (identity) {
    return `${identity}|${location}`;
  }

  // No identity - log for monitoring if using fingerprint
  if (location.startsWith("fp:")) {
    logger.debug("Using fingerprint for rate limiting - no valid IP", {
      path: req.path,
      hasXForwardedFor: !!req.headers?.["x-forwarded-for"],
    });
  }

  return location;
};

/**
 * Secure key generator that prevents IP spoofing and identity abuse attacks.
 *
 * SECURITY: Identity headers are COMBINED with IP/fingerprint to prevent
 * attackers from abusing arbitrary tenant IDs to exhaust other tenants' quotas.
 *
 * Key structure:
 * - With identity + IP: "tenant:abc|ip:1.2.3.4"
 * - With identity + fingerprint: "tenant:abc|fp:hash"
 * - IP only: "ip:1.2.3.4"
 * - Fingerprint only: "fp:hash"
 */
export const secureKeyGenerator = (req: Request): string => {
  const identity = extractIdentity(req);
  const validatedIP = validateIP(req.ip);

  // Determine location component: prefer validated IP, fallback to fingerprint
  const location = validatedIP ? `ip:${validatedIP}` : createRequestFingerprint(req);

  return buildRateLimitKey(identity, location, req);
};
