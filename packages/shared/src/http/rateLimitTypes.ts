/**
 * Rate Limiting Types and Constants
 *
 * Type definitions and security constants for rate limiting middleware.
 *
 * @module http/rateLimitTypes
 */

import type { Request } from "express";

// ==================== Security Constants ====================

/**
 * Headers that may contain tenant/user identification.
 */
export const IDENTITY_HEADERS = {
  TENANT_ID: "x-tenant-id",
  INSTALLATION_ID: "x-installation-id",
  CLIENT_ID: "x-client-id",
} as const;

/**
 * Private/internal IP ranges that should not be used for rate limiting keys.
 */
export const PRIVATE_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 private
  /^fe80:/, // IPv6 link-local
] as const;

/**
 * Maximum length for fingerprint components to prevent memory attacks.
 */
export const FINGERPRINT_MAX_LENGTH = 100;

/**
 * Length of hash prefix to use for fingerprint (256 bits of entropy).
 */
export const FINGERPRINT_HASH_LENGTH = 32;

/**
 * Maximum valid Retry-After header value in seconds (1 hour).
 */
export const MAX_RETRY_AFTER_SECONDS = 3600;

/**
 * Minimum Retry-After header value in seconds.
 */
export const MIN_RETRY_AFTER_SECONDS = 1;

/**
 * Maximum length for secondary fingerprint headers.
 */
export const FINGERPRINT_SECONDARY_LENGTH = 50;

/**
 * Maximum length for short fingerprint headers.
 */
export const FINGERPRINT_SHORT_LENGTH = 20;

/**
 * Maximum entries in the in-memory rate limit store to prevent memory exhaustion.
 */
export const MAX_MEMORY_STORE_ENTRIES = 50000;

/**
 * Pattern for valid tenant/client IDs (alphanumeric, dashes, underscores).
 */
export const VALID_IDENTITY_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Maximum value for an IPv4 octet.
 */
export const IPV4_MAX_OCTET = 255;

/**
 * Number of requests between deterministic cleanups (avoids probabilistic issues).
 */
export const CLEANUP_INTERVAL_REQUESTS = 100;

/**
 * Number of cleanup cycles before request counter resets to prevent overflow.
 */
export const CLEANUP_CYCLES_BEFORE_RESET = 1000;

/**
 * Maximum request count before reset to prevent integer overflow.
 */
export const MAX_REQUEST_COUNT = CLEANUP_INTERVAL_REQUESTS * CLEANUP_CYCLES_BEFORE_RESET;

/**
 * Maximum length for identity headers (tenant ID, installation ID, etc.).
 */
export const IDENTITY_HEADER_MAX_LENGTH = 50;

/**
 * Maximum TTL in milliseconds (24 hours) to prevent integer overflow.
 */
export const MAX_TTL_MS = 86400000;

/**
 * Minimum window size in milliseconds.
 */
export const MIN_WINDOW_MS = 100;

/**
 * Minimum max requests per window.
 */
export const MIN_MAX_REQUESTS = 1;

/**
 * Pattern for valid rate limit keys (prevents Redis injection).
 */
export const VALID_RATE_LIMIT_KEY_PATTERN = /^[a-zA-Z0-9_.:\-|]+$/;

/**
 * Redis retry backoff configuration.
 */
export const REDIS_RETRY_CONFIG = {
  /** Initial delay before retrying Redis in ms */
  INITIAL_DELAY_MS: 5000,
  /** Maximum delay between Redis retries in ms */
  MAX_DELAY_MS: 60000,
  /** Multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,
} as const;

// ==================== Types ====================

/**
 * Rate limit entry for in-memory fallback.
 */
export interface RateLimitEntry {
  readonly resetTime: number;
  count: number;
}

/**
 * Rate limiter configuration options.
 */
export interface RateLimitOptions {
  /** Time window in milliseconds */
  readonly windowMs: number;
  /** Maximum number of requests per window */
  readonly max: number;
  /** Custom error message */
  readonly message?: string;
  /** Function to generate rate limit key from request */
  readonly keyGenerator?: (req: Request) => string;
  /** Key prefix for Redis (default: "rl:") */
  readonly keyPrefix?: string;
  /** Skip rate limiting for certain requests */
  readonly skip?: (req: Request) => boolean;
}

/**
 * Rate limit info returned after checking.
 */
export interface RateLimitInfo {
  readonly current: number;
  readonly remaining: number;
  readonly resetTime: number;
}

/**
 * Abstract store interface for rate limit data.
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitInfo>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
}

/** Socket with optional TLS cipher method */
export interface TLSSocket {
  getCipher?: () => { name?: string };
}
