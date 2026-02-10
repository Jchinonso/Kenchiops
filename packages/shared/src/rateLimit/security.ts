/**
 * Rate Limiting Security Utilities
 *
 * Secure key generation for rate limiting middleware with:
 * - IP validation using Node.js net module
 * - Tenant-aware rate limiting via req.context
 * - Conservative fingerprint fallback (no random entropy)
 * - Trusted proxy resolver support
 * - Private socket IP tagging for metrics
 *
 * @module rateLimit/security
 */

import type { Request } from "express";
import crypto from "crypto";
import net from "net";
import { createLogger } from "../core/logger.js";
import {
  PRIVATE_IP_PATTERNS,
  FINGERPRINT_HASH_LENGTH,
  VALID_IDENTITY_PATTERN,
  IDENTITY_HEADER_MAX_LENGTH,
  UNKNOWN_CLIENT_BUCKET,
  KEY_PREFIX,
  KEY_SEPARATOR,
  IPV4_MAPPED_PREFIX,
  FINGERPRINT_HEADERS,
  CONTEXT_IDENTITY_SOURCES,
  HEADER_IDENTITY_SOURCES,
  LOG_HASH_PREFIX_LENGTH,
  type TLSSocket,
  type ClientIPOptions,
  type SecureKeyOptions,
  type RequestWithContext,
  type IPSource,
  type ResolvedIP,
} from "./types.js";

// Re-export types for convenience
export type { ClientIPOptions, SecureKeyOptions, RequestWithContext };

const logger = createLogger("rate-limiter");

/** Hashes a value for privacy-safe logging. Returns truncated SHA-256 hash or "unknown". */
const hashForLog = (value: string | undefined): string => {
  if (!value) {
    return "unknown";
  }
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, LOG_HASH_PREFIX_LENGTH);
};

// ============================================================================
// IP Normalization & Validation
// ============================================================================

/** Strips zone identifiers from IPv6 addresses (e.g., fe80::1%eth0 -> fe80::1). */
const stripZoneIdentifier = (ip: string): string => {
  const zoneIndex = ip.indexOf("%");
  return zoneIndex === -1 ? ip : ip.slice(0, zoneIndex);
};

/** Strips IPv4-mapped IPv6 prefix (e.g., ::ffff:192.168.1.1 -> 192.168.1.1). */
const stripIPv4MappedPrefix = (ip: string): string =>
  ip.startsWith(IPV4_MAPPED_PREFIX) ? ip.slice(IPV4_MAPPED_PREFIX.length) : ip;

/** Normalizes an IP address by stripping zone identifiers and IPv4-mapped prefixes. */
const normalizeIP = (ip: string): string => stripZoneIdentifier(stripIPv4MappedPrefix(ip));

/** Checks if an IP address is private/internal. */
export const isPrivateIP = (ip: string): boolean =>
  PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));

/** Returns the IP version (4 or 6) if valid, 0 if invalid. Uses same normalization as validateIP. */
export const getIPVersion = (ip: string): 0 | 4 | 6 => net.isIP(normalizeIP(ip)) as 0 | 4 | 6;

/** Validates an IPv4 address format. */
export const isValidIPv4 = (ip: string): boolean => getIPVersion(ip) === 4;

/** Validates an IPv6 address format. */
export const isValidIPv6 = (ip: string): boolean => getIPVersion(ip) === 6;

/**
 * Validates and normalizes an IP address for rate limiting.
 * @returns Normalized IP or null if invalid/rejected
 */
export const validateIP = (ip: string | undefined, rejectPrivate = true): string | null => {
  if (!ip) {
    return null;
  }

  const normalized = normalizeIP(ip);
  const isValid = net.isIP(normalized) !== 0;

  if (!isValid) {
    logger.warn("Invalid IP format", { ipHash: hashForLog(ip), source: "validateIP" });
    return null;
  }

  const shouldReject = rejectPrivate && isPrivateIP(normalized);
  return shouldReject ? null : normalized;
};

// ============================================================================
// IP Resolution
// ============================================================================

/** Creates a ResolvedIP object with metadata. */
const createResolvedIP = (ip: string, source: IPSource): ResolvedIP => ({
  ip,
  source,
  isPrivate: isPrivateIP(ip),
});

/** Attempts to validate an IP and create a ResolvedIP if valid. */
const tryResolveIP = (
  ip: string | undefined,
  source: IPSource,
  rejectPrivate: boolean
): ResolvedIP | null => {
  const validated = validateIP(ip, rejectPrivate);
  return validated ? createResolvedIP(validated, source) : null;
};

/** Resolves socket IP with special handling for private IPs. */
const resolveSocketIP = (
  socketAddress: string | undefined,
  rejectPrivate: boolean
): ResolvedIP | null => {
  if (!socketAddress) {
    return null;
  }

  const normalized = normalizeIP(socketAddress);
  if (net.isIP(normalized) === 0) {
    return null;
  }

  const ipIsPrivate = isPrivateIP(normalized);
  if (rejectPrivate && ipIsPrivate) {
    return null;
  }

  return { ip: normalized, source: "socket", isPrivate: ipIsPrivate };
};

/**
 * Resolves client IP from request with source metadata.
 * Priority: clientIP option > req.ip > socket.remoteAddress
 */
const resolveClientIP = (req: Request, options: ClientIPOptions): ResolvedIP | null => {
  const { clientIP, rejectPrivateIP = true, useSocketAddress = false } = options;

  // Try sources in priority order, return first valid result
  return (
    tryResolveIP(clientIP, "client", rejectPrivateIP) ??
    tryResolveIP(req.ip, "express", rejectPrivateIP) ??
    (useSocketAddress ? resolveSocketIP(req.socket?.remoteAddress, rejectPrivateIP) : null)
  );
};

/** Gets the key prefix for an IP based on its source. */
const getIPKeyPrefix = (resolved: ResolvedIP): string =>
  resolved.source === "socket" && resolved.isPrivate ? KEY_PREFIX.PROXY_IP : KEY_PREFIX.IP;

/**
 * Gets the client IP from request.
 * SECURITY: In Express, req.ip depends on trust proxy config.
 */
export const getClientIP = (req: Request, options: ClientIPOptions = {}): string | null =>
  resolveClientIP(req, options)?.ip ?? null;

// ============================================================================
// Fingerprinting
// ============================================================================

/** Extracts a header value with length limit. Handles string[] by joining with comma. */
const extractHeader = (headers: Request["headers"], name: string, maxLength: number): string => {
  const value = headers[name];
  const str = Array.isArray(value) ? value.join(",") : value;
  return typeof str === "string" ? str.slice(0, maxLength) : "";
};

/** Extracts fingerprint components from request headers. */
const extractFingerprintComponents = (req: Request): string[] => {
  const headers = req.headers ?? {};
  const headerComponents = FINGERPRINT_HEADERS.map(({ name, maxLength }) =>
    extractHeader(headers, name, maxLength)
  );
  const tlsCipher = (req.socket as TLSSocket | undefined)?.getCipher?.()?.name ?? "";
  return [...headerComponents, tlsCipher];
};

/** Hashes components into a fingerprint string. */
const hashComponents = (components: string[]): string => {
  const hash = crypto
    .createHash("sha256")
    .update(components.join(KEY_SEPARATOR))
    .digest("hex")
    .slice(0, FINGERPRINT_HASH_LENGTH);
  return `${KEY_PREFIX.FINGERPRINT}:${hash}`;
};

/**
 * Creates a cryptographic fingerprint for rate limiting.
 * SECURITY: Returns shared bucket when no headers present to prevent bypass.
 */
export const createRequestFingerprint = (req: Request): string => {
  const components = extractFingerprintComponents(req);
  const hasEntropy = components.some((component) => component.length > 0);

  if (!hasEntropy) {
    logger.warn("No fingerprint entropy, using shared bucket", {
      path: req.path,
      remoteAddressHash: hashForLog(req.socket?.remoteAddress),
    });
    return UNKNOWN_CLIENT_BUCKET;
  }

  return hashComponents(components);
};

// ============================================================================
// Identity Extraction
// ============================================================================

/**
 * Sanitizes an identity value for use in rate limit keys.
 * SECURITY: Normalizes to lowercase to prevent case-based bypass.
 */
export const sanitizeIdentity = (
  value: string | string[] | undefined,
  source?: string
): string | null => {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const normalized = value.slice(0, IDENTITY_HEADER_MAX_LENGTH).toLowerCase();
  const isValid = VALID_IDENTITY_PATTERN.test(normalized);

  if (!isValid) {
    logger.warn("Invalid identity format", {
      source: source ?? "unknown",
      reason: "pattern_mismatch",
    });
    return null;
  }

  return normalized;
};

/** Formats a sanitized identity value with its prefix. */
const formatIdentity = (
  value: string | string[] | undefined,
  source: string,
  prefix: string
): string | null => {
  const sanitized = sanitizeIdentity(value, source);
  return sanitized ? `${prefix}:${sanitized}` : null;
};

/** Finds the first valid identity from a list of sources. */
const findIdentity = <T extends { prefix: string }>(
  sources: readonly T[],
  getValue: (source: T) => string | string[] | undefined,
  getSource: (source: T) => string
): string | null => {
  for (const source of sources) {
    const identity = formatIdentity(getValue(source), getSource(source), source.prefix);
    if (identity) {
      return identity;
    }
  }
  return null;
};

/**
 * Extracts tenant/user identity from request.
 * Priority: req.context (auth middleware) > headers (webhooks/edge)
 */
export const extractIdentity = (req: RequestWithContext): string | null =>
  findIdentity(
    CONTEXT_IDENTITY_SOURCES,
    (source) => req.context?.[source.field],
    (source) => `context:${source.field}`
  ) ??
  (req.headers
    ? findIdentity(
        HEADER_IDENTITY_SOURCES,
        (source) => req.headers[source.header],
        (source) => `header:${source.header}`
      )
    : null);

// ============================================================================
// Key Generation
// ============================================================================

/** Determines the location component of a rate limit key. */
const resolveLocationKey = (req: Request, options: SecureKeyOptions): string => {
  const resolved = resolveClientIP(req, options);
  return resolved ? `${getIPKeyPrefix(resolved)}:${resolved.ip}` : createRequestFingerprint(req);
};

/** Builds a rate limit key from identity and location. */
const buildKey = (identity: string | null, location: string, req: Request): string => {
  if (identity) {
    return `${identity}${KEY_SEPARATOR}${location}`;
  }

  // Log fingerprint usage for monitoring
  if (location.startsWith(`${KEY_PREFIX.FINGERPRINT}:`)) {
    logger.debug("Rate limiting without identity", {
      path: req.path,
      bucket: location === UNKNOWN_CLIENT_BUCKET ? "unknown" : "fingerprint",
      hasXForwardedFor: !!req.headers?.["x-forwarded-for"],
    });
  }

  return location;
};

/**
 * Generates a secure rate limit key.
 *
 * SECURITY: Combines identity with IP/fingerprint to prevent:
 * - IP spoofing attacks
 * - Tenant quota exhaustion attacks
 *
 * Key formats:
 * - tenant:abc|ip:1.2.3.4 (identity + public IP)
 * - tenant:abc|proxy_ip:10.0.0.1 (identity + private socket IP)
 * - tenant:abc|fp:hash (identity + fingerprint)
 * - ip:1.2.3.4 (IP only)
 * - fp:unknown (no identifiers - conservative bucket)
 */
export const secureKeyGenerator = (req: Request, options: SecureKeyOptions = {}): string =>
  buildKey(extractIdentity(req), resolveLocationKey(req, options), req);

/**
 * Creates a key generator with pre-configured options.
 *
 * @example
 * const keyGenerator = createKeyGenerator({
 *   clientIP: resolvedClientIP,
 *   rejectPrivateIP: false,
 * });
 */
export const createKeyGenerator =
  (options: SecureKeyOptions): ((req: Request) => string) =>
  (req) =>
    secureKeyGenerator(req, options);
