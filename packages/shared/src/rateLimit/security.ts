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

/**
 * Validates an IPv6 address format (strict validation).
 * SECURITY: Rejects leading zeros per RFC 5952 to prevent bypass attacks.
 */
export const isValidIPv6 = (ip: string): boolean => {
  // Must contain at least one colon and only valid hex chars and colons
  if (!ip.includes(":") || !/^[0-9a-fA-F:]+$/.test(ip)) {
    return false;
  }
  // Reject triple colons
  if (ip.includes(":::")) {
    return false;
  }
  // SECURITY: Only ONE double-colon allowed in IPv6
  const doubleColonMatches = ip.match(/::/g);
  const doubleColonCount = doubleColonMatches ? doubleColonMatches.length : 0;
  if (doubleColonCount > 1) {
    return false;
  }
  // Split and validate groups
  const groups = ip.split(":");
  // IPv6 has max 8 groups, but :: can represent missing groups
  const hasDoubleColon = doubleColonCount === 1;
  if (!hasDoubleColon && groups.length !== 8) {
    return false;
  }
  if (hasDoubleColon && groups.length > 8) {
    return false;
  }
  // Each group must be 1-4 hex chars (empty allowed for ::)
  // SECURITY: Reject leading zeros (except single "0") per RFC 5952
  // This prevents bypass attacks like "0fe80::1" vs "fe80::1"
  return groups.every((group) => {
    if (group.length === 0) {
      return true; // Empty group allowed for ::
    }
    if (group.length > 4) {
      return false;
    }
    // Reject leading zeros (e.g., "01", "001") but allow single "0"
    if (group.length > 1 && group[0] === "0") {
      return false;
    }
    return /^[0-9a-fA-F]+$/.test(group);
  });
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
const IDENTITY_EXTRACTORS = [
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
  if (!req.headers) {
    return null;
  }

  const matched = IDENTITY_EXTRACTORS.find(({ header }) => {
    const value = sanitizeIdentity(req.headers[header]);
    return value !== null;
  });

  if (!matched) {
    return null;
  }

  const value = sanitizeIdentity(req.headers[matched.header]);
  return value ? `${matched.prefix}:${value}` : null;
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
