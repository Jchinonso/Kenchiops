/**
 * API Key Validation for Rate Limiting
 *
 * Validates API keys and provides per-key rate limit quotas.
 *
 * SECURITY:
 * - API keys are hashed before storage and lookup (no raw keys in memory)
 * - Full SHA-256 hash used for rate limit keys (no collisions)
 * - Truncated hash prefix used only for logging
 * - Multiple API keys in header rejected as suspicious
 *
 * @module rateLimit/apiKey
 */

import type { Request } from "express";
import crypto from "crypto";
import { createLogger } from "../core/logger.js";
import {
  API_KEY_DEFAULTS,
  KEY_SEPARATOR,
  type ApiKeyConfig,
  type ApiKeyLimit,
  type ApiKeyValidationResult,
} from "./types.js";

const logger = createLogger("api-key");

/** Length of hash prefix for logging (8 hex chars, safe to display but not unique) */
const LOG_HASH_PREFIX_LENGTH = 8;

/** Computes full SHA-256 hash of a key for storage/lookup/rate-limiting. */
const hashKey = (key: string): string => crypto.createHash("sha256").update(key).digest("hex");

/** Computes truncated hash prefix for safe logging. */
const hashKeyForLogging = (key: string): string =>
  `${hashKey(key).slice(0, LOG_HASH_PREFIX_LENGTH)}...`;

export class ApiKeyValidator {
  private readonly headerName: string;
  private readonly validationPattern: RegExp;
  private readonly maxLength: number;
  /** Map of hashed key ID -> limit (no raw keys stored) */
  private readonly keyLimits: Map<string, ApiKeyLimit>;
  private readonly defaultLimit: ApiKeyLimit | null;

  constructor(config: ApiKeyConfig = {}) {
    this.headerName = config.headerName ?? API_KEY_DEFAULTS.HEADER_NAME;
    this.validationPattern = config.validationPattern ?? API_KEY_DEFAULTS.VALIDATION_PATTERN;
    this.maxLength = config.maxLength ?? API_KEY_DEFAULTS.MAX_LENGTH;
    this.defaultLimit = config.defaultLimit ?? null;

    // Store hashed keys in map (no raw keys in memory)
    this.keyLimits = new Map();
    if (config.keyLimits) {
      for (const [rawKey, limit] of Object.entries(config.keyLimits)) {
        this.keyLimits.set(hashKey(rawKey), limit);
      }
    }
  }

  validate(req: Request): ApiKeyValidationResult {
    const headerValue = req.headers[this.headerName.toLowerCase()];

    // SECURITY: Reject multiple API keys as suspicious (header injection)
    if (Array.isArray(headerValue) && headerValue.length > 1) {
      logger.debug("Rejecting multiple API keys in header", { count: headerValue.length });
      return {
        status: "invalid",
        isValid: false,
        keyId: null,
        limit: null,
        error: "Multiple API keys not allowed",
      };
    }

    const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    // No key provided = missing (not invalid, no penalty)
    if (!rawValue || typeof rawValue !== "string") {
      return { status: "missing", isValid: false, keyId: null, limit: null };
    }

    // Trim whitespace (common client mistake)
    const rawKey = rawValue.trim();

    // Empty after trim = missing
    if (rawKey.length === 0) {
      return { status: "missing", isValid: false, keyId: null, limit: null };
    }

    // Key provided but too long = invalid (apply penalty)
    if (rawKey.length > this.maxLength) {
      logger.debug("API key length exceeds maximum", {
        keyHash: hashKeyForLogging(rawKey),
        length: rawKey.length,
        maxLength: this.maxLength,
      });
      return {
        status: "invalid",
        isValid: false,
        keyId: null,
        limit: null,
        error: "API key exceeds maximum length",
      };
    }

    // Key provided but malformed = invalid (apply penalty)
    if (!this.validationPattern.test(rawKey)) {
      logger.debug("API key format validation failed", { keyHash: hashKeyForLogging(rawKey) });
      return {
        status: "invalid",
        isValid: false,
        keyId: null,
        limit: null,
        error: "Invalid API key format",
      };
    }

    // Lookup by hashed key (no raw keys stored or returned)
    const keyId = hashKey(rawKey);
    const keyLimit = this.keyLimits.get(keyId);

    if (keyLimit) {
      return { status: "valid", isValid: true, keyId, limit: keyLimit };
    }

    if (this.defaultLimit) {
      return { status: "valid", isValid: true, keyId, limit: this.defaultLimit };
    }

    return { status: "valid", isValid: true, keyId, limit: null };
  }

  /**
   * Extracts API key from request (for rate limiting).
   * Returns null if multiple keys present (suspicious).
   */
  extractKey(req: Request): string | null {
    const headerValue = req.headers[this.headerName.toLowerCase()];

    // Reject multiple API keys as suspicious
    if (Array.isArray(headerValue) && headerValue.length > 1) {
      return null;
    }

    const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return typeof rawValue === "string" ? rawValue.trim() || null : null;
  }

  /** Gets rate limit for a raw API key (hashes internally). */
  getLimitForKey(key: string): ApiKeyLimit | null {
    return this.keyLimits.get(hashKey(key)) ?? this.defaultLimit;
  }

  /** Sets rate limit for a raw API key (hashes internally). */
  setKeyLimit(key: string, limit: ApiKeyLimit): void {
    this.keyLimits.set(hashKey(key), limit);
  }

  /** Removes rate limit for a raw API key (hashes internally). */
  removeKeyLimit(key: string): boolean {
    return this.keyLimits.delete(hashKey(key));
  }

  /** Checks if a raw API key has a configured limit (hashes internally). */
  hasKeyLimit(key: string): boolean {
    return this.keyLimits.has(hashKey(key));
  }

  /**
   * Returns hashed key IDs (not raw keys) for configured limits.
   * SECURITY: Raw keys are never stored or returned.
   */
  getConfiguredKeyIds(): string[] {
    return Array.from(this.keyLimits.keys());
  }

  /** @deprecated Use getConfiguredKeyIds() instead. Returns hashed IDs, not raw keys. */
  getConfiguredKeys(): string[] {
    return this.getConfiguredKeyIds();
  }
}

export const createApiKeyValidator = (config?: ApiKeyConfig): ApiKeyValidator =>
  new ApiKeyValidator(config);

export const defaultApiKeyValidator = createApiKeyValidator();

export const extractApiKey = (req: Request): string | null =>
  defaultApiKeyValidator.extractKey(req);

/**
 * Generates rate limit key with API key identity.
 * Uses full SHA-256 hash to prevent collisions.
 */
export const apiKeyRateLimitKey = (req: Request, baseKey: string): string => {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return baseKey;
  }
  // Use full hash for rate limiting (no collisions)
  const keyId = hashKey(apiKey);
  return `apikey:${keyId}${KEY_SEPARATOR}${baseKey}`;
};
