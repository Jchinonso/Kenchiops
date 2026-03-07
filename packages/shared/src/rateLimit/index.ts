/**
 * Redis-based distributed rate limiting middleware.
 *
 * Uses Redis sliding window counter for accurate, distributed rate limiting
 * that works across multiple server instances.
 *
 * Falls back to in-memory store if Redis is unavailable.
 *
 * Security features:
 * - IP validation to prevent spoofing
 * - Tenant-aware rate limiting for authenticated requests
 * - Fingerprint fallback for requests without valid IP
 * - Suspicious activity logging
 *
 * This module re-exports from focused sub-modules:
 * - types.ts: Type definitions and constants
 * - security.ts: IP validation, fingerprinting, key generation
 * - stores.ts: Redis and in-memory storage backends
 *
 * @module rateLimit
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  AppError,
  RateLimitError,
  ExternalServiceError,
  ValidationError,
  getErrorMessage,
} from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import {
  RATE_LIMIT_CONSTANTS,
  TIME_CONSTANTS,
  HTTP_RESILIENCE_DEFAULTS,
  RATE_LIMIT_MESSAGES,
} from "../constants/index.js";
import { getRedisClient } from "../queue/redisClient.js";

// Import from sub-modules
import {
  REDIS_RETRY_CONFIG,
  MAX_RETRY_AFTER_SECONDS,
  MIN_RETRY_AFTER_SECONDS,
  MAX_TTL_MS,
  MIN_WINDOW_MS,
  MIN_MAX_REQUESTS,
  MAX_MEMORY_STORE_ENTRIES,
  MAX_REQUEST_COUNT,
  CLEANUP_INTERVAL_REQUESTS,
  type RateLimitOptions,
  type RateLimitStore,
  type RateLimitInfo,
  type RateLimitEntry,
} from "./types.js";
import { secureKeyGenerator } from "./security.js";
import { RedisRateLimitStore, InMemoryRateLimitStore } from "./stores.js";

// Re-export types and utilities
export type {
  RateLimitOptions,
  RateLimitInfo,
  FallbackBehavior,
  TrustedProxyConfig,
  TenantRateLimitConfig,
  BurstDetectionConfig,
  BurstDetectionResult,
  BotDetectionConfig,
  BotDetectionResult,
  BotCategory,
  GeoRestrictionConfig,
  GeoRestrictionResult,
  GeoCategory,
  GeoReasonCode,
  ApiKeyConfig,
  ApiKeyLimit,
  ApiKeyValidationResult,
  EndpointLimitConfig,
  EndpointLimitsConfig,
  EndpointLimitResult,
  EndpointMatchMode,
  SignatureConfig,
  SignatureVerificationResult,
  SignedField,
  SignatureAlgorithm,
  PathSource,
  SignaturePayloadOptions,
  SignOptions,
} from "./types.js";

export {
  BURST_DETECTION_DEFAULTS,
  BOT_PATTERNS,
  BOT_DETECTION_DEFAULTS,
  GEO_RESTRICTION_DEFAULTS,
  API_KEY_DEFAULTS,
  ENDPOINT_LIMIT_DEFAULTS,
  SIGNATURE_DEFAULTS,
  CLOUDFLARE_IPV4_CIDRS,
  ALLOWED_SIGNATURE_ALGORITHMS,
  SIGNATURE_HEX_LENGTHS,
} from "./types.js";

export {
  secureKeyGenerator,
  createKeyGenerator,
  getClientIP,
  validateIP,
  isValidIPv4,
  isValidIPv6,
  getIPVersion,
  isPrivateIP,
  createRequestFingerprint,
  extractIdentity,
  sanitizeIdentity,
  type ClientIPOptions,
  type SecureKeyOptions,
} from "./security.js";

// Burst Detection
export { BurstDetector, createBurstDetector, defaultBurstDetector } from "./burstDetection.js";

// Bot Detection
export {
  BotDetector,
  createBotDetector,
  defaultBotDetector,
  isBot,
  isSuspiciousBot,
  shouldBlockBot,
} from "./botDetection.js";

// Geographic Restrictions
export {
  GeoRestriction,
  createGeoAllowlist,
  createGeoBlocklist,
  getCountryCode,
} from "./geoRestriction.js";

// API Key Validation
export {
  ApiKeyValidator,
  createApiKeyValidator,
  defaultApiKeyValidator,
  extractApiKey,
  apiKeyRateLimitKey,
} from "./apiKey.js";

// Per-Endpoint Limits
export {
  EndpointLimiter,
  createEndpointLimiter,
  createEndpointLimiterWithDefaults,
  COMMON_ENDPOINT_LIMITS,
} from "./endpointLimits.js";

// Request Signature Verification
export {
  SignatureVerifier,
  createSignatureVerifier,
  createSimpleSignatureVerifier,
  captureRawBody,
} from "./requestSignature.js";

// Composable Rate Limit Middleware
export {
  createRateLimitMiddleware,
  createProductionRateLimitMiddleware,
  type RateLimitMiddlewareConfig,
  type SecurityContext,
} from "./middleware.js";

// Failover Store (Redis with in-memory fallback, decoupled from Express)
export { FailoverRateLimitStore, createFailoverStore } from "./failoverStore.js";

const logger = createLogger("rate-limiter");

// ==================== Middleware Helper Functions ====================

/**
 * Increment the rate limit store with a timeout guard.
 * Rejects with ExternalServiceError if the store doesn't respond in time.
 */
const incrementWithTimeout = async (
  store: RateLimitStore,
  key: string,
  windowMs: number
): Promise<RateLimitInfo> => {
  let timeoutHandle: NodeJS.Timeout | null = null; // let: cleared in finally

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new ExternalServiceError("rate-limit-store", "Rate limit check timeout")),
        HTTP_RESILIENCE_DEFAULTS.RATE_LIMIT_CHECK_TIMEOUT_MS
      );
    });
    return await Promise.race([store.increment(key, windowMs), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

/**
 * Validate that rate limit info values are finite numbers.
 * SECURITY: Prevents setting NaN/Infinity in response headers.
 */
const validateRateLimitInfo = (info: RateLimitInfo): void => {
  if (
    !Number.isFinite(info.current) ||
    !Number.isFinite(info.remaining) ||
    !Number.isFinite(info.resetTime)
  ) {
    throw new ExternalServiceError(
      "rate-limit-store",
      "Rate limit store returned non-finite values"
    );
  }
};

/**
 * Set standard rate limit response headers.
 * Clamps reset time to reasonable bounds (within 24 hours from now).
 */
const setRateLimitHeaders = (
  res: Response,
  effectiveMax: number,
  effectiveRemaining: number,
  resetTime: number
): void => {
  res.setHeader("X-RateLimit-Limit", effectiveMax);
  res.setHeader("X-RateLimit-Remaining", effectiveRemaining);

  const now = Date.now();
  const maxResetTime = now + MAX_TTL_MS;
  const boundedResetTime = Math.min(Math.max(now, resetTime), maxResetTime);
  res.setHeader(
    "X-RateLimit-Reset",
    Math.ceil(boundedResetTime / TIME_CONSTANTS.MILLISECONDS_PER_SECOND)
  );
};

/**
 * Compute clamped Retry-After header value in seconds from a reset timestamp.
 */
const computeRetryAfterSeconds = (resetTime: number): number => {
  const retryAfterMs = Math.max(0, resetTime - Date.now());
  return Math.min(
    Math.max(
      MIN_RETRY_AFTER_SECONDS,
      Math.ceil(retryAfterMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND)
    ),
    MAX_RETRY_AFTER_SECONDS
  );
};

/**
 * Handle errors from the rate limit middleware.
 * Re-throws known errors; wraps unknown errors as RateLimitError for security.
 */
const handleMiddlewareError = (error: unknown, key: string): never => {
  const keyHash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);
  const errorMessage = getErrorMessage(error);

  if (error instanceof RateLimitError) {
    throw error;
  }

  if (error instanceof AppError) {
    logger.error("Rate limiting failed", {
      error: errorMessage,
      keyHash,
    });
    throw error;
  }

  logger.error("Rate limiting failed, denying for security", {
    error: errorMessage,
    keyHash,
  });
  throw new RateLimitError(
    "Service temporarily unavailable, please try again",
    TIME_CONSTANTS.MILLISECONDS_PER_SECOND
  );
};

// ==================== Rate Limiter Classes ====================

/**
 * Rate limiter implementation with Redis backend and in-memory fallback.
 * Includes automatic Redis reconnection with exponential backoff.
 */
class RateLimiter {
  private redisStore: RedisRateLimitStore | null = null;
  private memoryStore: InMemoryRateLimitStore;
  private useRedis = true;
  private redisFailedAt = 0;
  private redisRetryDelay: number = REDIS_RETRY_CONFIG.INITIAL_DELAY_MS;
  /** Flag to prevent concurrent Redis retry attempts */
  private isRetryingRedis = false;
  private readonly windowMs: number;
  private readonly max: number;
  private readonly maxResolver?: (req: Request) => number;
  private readonly message: string;
  private readonly keyGenerator: (req: Request) => string;
  private readonly keyPrefix: string;
  private readonly skip?: (req: Request) => boolean;

  constructor(options: RateLimitOptions) {
    // SECURITY: Validate configuration to prevent misconfiguration attacks
    if (options.windowMs < MIN_WINDOW_MS) {
      throw new ValidationError(`windowMs must be at least ${MIN_WINDOW_MS}ms`);
    }
    if (options.windowMs > MAX_TTL_MS) {
      throw new ValidationError(`windowMs must not exceed ${MAX_TTL_MS}ms`);
    }
    if (options.max < MIN_MAX_REQUESTS) {
      throw new ValidationError(`max must be at least ${MIN_MAX_REQUESTS}`);
    }

    this.windowMs = options.windowMs;
    this.max = options.max;
    this.maxResolver = options.maxResolver;
    this.message = options.message ?? RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS;
    this.keyGenerator = options.keyGenerator ?? secureKeyGenerator;
    this.keyPrefix = options.keyPrefix ?? "rl:";
    this.skip = options.skip;

    // Initialize stores
    this.memoryStore = new InMemoryRateLimitStore(this.max);

    // Try to initialize Redis store
    this.initRedisStore();
  }

  private initRedisStore(): void {
    try {
      this.redisStore = new RedisRateLimitStore(this.keyPrefix, this.max);
    } catch (error) {
      logger.warn("Redis unavailable for rate limiting, using in-memory fallback", {
        error: getErrorMessage(error),
      });
      this.markRedisFailed();
    }
  }

  private markRedisFailed(): void {
    this.useRedis = false;
    this.redisFailedAt = Date.now();
  }

  private shouldRetryRedis(): boolean {
    // SECURITY: Prevent concurrent retry attempts (race condition fix)
    if (this.useRedis || this.isRetryingRedis) {
      return false;
    }
    const timeSinceFailure = Date.now() - this.redisFailedAt;
    return timeSinceFailure >= this.redisRetryDelay;
  }

  private handleRedisRetryFailure(error: unknown): void {
    // Increase backoff delay for next retry
    this.redisRetryDelay = Math.min(
      this.redisRetryDelay * REDIS_RETRY_CONFIG.BACKOFF_MULTIPLIER,
      REDIS_RETRY_CONFIG.MAX_DELAY_MS
    );
    this.redisFailedAt = Date.now();
    logger.debug("Redis retry failed, next attempt scheduled", {
      delay: this.redisRetryDelay,
      error: getErrorMessage(error),
    });
  }

  private getStore(): RateLimitStore {
    // Try to reconnect to Redis with exponential backoff
    if (!this.useRedis && this.shouldRetryRedis()) {
      const store = this.tryReconnectRedis();
      if (store) {
        return store;
      }
    }

    // Check if Redis is available
    if (this.useRedis && this.redisStore) {
      const store = this.tryGetRedisStore();
      if (store) {
        return store;
      }
    }

    return this.memoryStore;
  }

  private tryReconnectRedis(): RateLimitStore | null {
    this.isRetryingRedis = true;
    try {
      const redis = getRedisClient();
      if (redis.status !== "ready") {
        return null;
      }

      logger.info("Redis connection restored for rate limiting");
      this.useRedis = true;
      this.redisRetryDelay = REDIS_RETRY_CONFIG.INITIAL_DELAY_MS;

      if (!this.redisStore) {
        this.redisStore = new RedisRateLimitStore(this.keyPrefix, this.max);
      }
      return this.redisStore;
    } catch (error) {
      this.handleRedisRetryFailure(error);
      return null;
    } finally {
      this.isRetryingRedis = false;
    }
  }

  private tryGetRedisStore(): RateLimitStore | null {
    try {
      const redis = getRedisClient();
      if (redis.status === "ready") {
        return this.redisStore;
      }

      logger.warn("Redis not ready, falling back to in-memory rate limiting", {
        status: redis.status,
      });
    } catch (error) {
      logger.warn("Redis connection lost, falling back to in-memory rate limiting", {
        error: getErrorMessage(error),
      });
    }

    this.markRedisFailed();
    return null;
  }

  readonly middleware =
    () =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (this.skip?.(req)) {
        return next();
      }

      const key = this.keyGenerator(req);

      // SECURITY: Clamp to minimum of 1 to prevent bypass
      const effectiveMax = Math.max(1, this.maxResolver ? this.maxResolver(req) : this.max);

      try {
        const store = this.getStore();
        const info = await incrementWithTimeout(store, key, this.windowMs);

        validateRateLimitInfo(info);

        const effectiveRemaining = Math.max(0, effectiveMax - info.current);
        setRateLimitHeaders(res, effectiveMax, effectiveRemaining, info.resetTime);

        if (info.current > effectiveMax) {
          const retryAfterSec = computeRetryAfterSeconds(info.resetTime);
          res.setHeader("Retry-After", retryAfterSec);

          const retryAfterMs = Math.max(0, info.resetTime - Date.now());
          throw new RateLimitError(this.message, retryAfterMs);
        }

        next();
      } catch (error) {
        handleMiddlewareError(error, key);
      }
    };

  readonly reset = async (key?: string): Promise<void> => {
    const store = this.getStore();

    if (key) {
      await store.reset(key);
    } else {
      await store.resetAll();
    }
  };

  /**
   * Force use of in-memory store (for testing).
   */
  readonly useMemoryStore = (): void => {
    this.useRedis = false;
  };

  /**
   * Try to reconnect to Redis.
   */
  readonly reconnectRedis = (): void => {
    this.useRedis = true;
    this.initRedisStore();
  };
}

/**
 * Synchronous rate limiter for backward compatibility (in-memory only).
 * Uses in-memory store only but provides sync middleware.
 * Includes deterministic cleanup and max size protection.
 */
class SyncRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly message: string;
  private readonly keyGenerator: (req: Request) => string;
  private requestCount = 0;

  constructor(options: RateLimitOptions) {
    // SECURITY: Validate configuration to prevent misconfiguration attacks
    if (options.windowMs < MIN_WINDOW_MS) {
      throw new ValidationError(`windowMs must be at least ${MIN_WINDOW_MS}ms`);
    }
    if (options.windowMs > MAX_TTL_MS) {
      throw new ValidationError(`windowMs must not exceed ${MAX_TTL_MS}ms`);
    }
    if (options.max < MIN_MAX_REQUESTS) {
      throw new ValidationError(`max must be at least ${MIN_MAX_REQUESTS}`);
    }

    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message ?? RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS;
    this.keyGenerator = options.keyGenerator ?? secureKeyGenerator;
  }

  readonly middleware =
    () =>
    (req: Request, _res: Response, next: NextFunction): void => {
      const key = this.keyGenerator(req);
      const now = Date.now();
      // SECURITY: Use modulo to prevent integer overflow on long-running servers
      this.requestCount = (this.requestCount + 1) % MAX_REQUEST_COUNT;

      // Deterministic cleanup every N requests
      const shouldCleanup =
        this.requestCount % CLEANUP_INTERVAL_REQUESTS === 0 ||
        this.store.size >= MAX_MEMORY_STORE_ENTRIES;

      if (shouldCleanup) {
        this.cleanup(now);
      }

      // Check existing record first (handles existing keys even at capacity)
      const record = this.store.get(key);
      const hasValidRecord = record && now <= record.resetTime;

      // Check rate limit for valid existing record
      if (hasValidRecord && record.count >= this.max) {
        const retryAfterMs = record.resetTime - now;
        throw new RateLimitError(this.message, retryAfterMs);
      }

      // Increment existing valid record
      if (hasValidRecord) {
        record.count++;
        return next();
      }

      // Need new window - check capacity for new keys only
      if (this.store.size >= MAX_MEMORY_STORE_ENTRIES && !record) {
        // Store full and this is a new key - deny to prevent DoS
        throw new RateLimitError("Service temporarily unavailable", this.windowMs);
      }

      // Create new window
      // SECURITY: Clamp resetTime to prevent integer overflow
      this.store.set(key, {
        count: 1,
        resetTime: Math.min(now + this.windowMs, Number.MAX_SAFE_INTEGER),
      });
      next();
    };

  private readonly cleanup = (now: number): void => {
    const keysToDelete: string[] = [];
    for (const [entryKey, entry] of this.store) {
      if (entry.resetTime < now) {
        keysToDelete.push(entryKey);
      }
    }
    for (const keyToDelete of keysToDelete) {
      this.store.delete(keyToDelete);
    }
  };

  readonly reset = (): void => {
    this.store.clear();
    this.requestCount = 0;
  };
}

/**
 * Create a Redis-backed rate limiter middleware.
 *
 * @example
 * const limiter = createRedisRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', limiter.middleware());
 */
export const createRedisRateLimiter = (options: RateLimitOptions): RateLimiter =>
  new RateLimiter(options);

/**
 * Create a rate limiter middleware.
 * Uses synchronous in-memory store for backward compatibility.
 *
 * @example
 * const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', limiter.middleware());
 */
export const createRateLimiter = (options: RateLimitOptions): SyncRateLimiter =>
  new SyncRateLimiter(options);

/**
 * Default rate limiter: 100 requests per minute per IP.
 * Uses synchronous in-memory store.
 */
export const defaultRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
  message: RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS,
});

/**
 * Default Redis-backed rate limiter: 100 requests per minute per IP.
 * Falls back to in-memory if Redis is unavailable.
 */
export const defaultRedisRateLimiter = createRedisRateLimiter({
  windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
  message: RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS,
  keyPrefix: "rl:default:",
});
