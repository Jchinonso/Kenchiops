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
 * - rateLimitTypes.ts: Type definitions and constants
 * - rateLimitSecurity.ts: IP validation, fingerprinting, key generation
 * - rateLimitStores.ts: Redis and in-memory storage backends
 *
 * @module http/rateLimit
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
  type RateLimitEntry,
} from "./rateLimitTypes.js";
import { secureKeyGenerator } from "./rateLimitSecurity.js";
import { RedisRateLimitStore, InMemoryRateLimitStore } from "./rateLimitStores.js";

// Re-export types and utilities
export type { RateLimitOptions, RateLimitInfo } from "./rateLimitTypes.js";
export { secureKeyGenerator } from "./rateLimitSecurity.js";

const logger = createLogger("rate-limiter");

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
      // Set flag to prevent concurrent retry attempts
      this.isRetryingRedis = true;
      try {
        const redis = getRedisClient();
        if (redis.status === "ready") {
          logger.info("Redis connection restored for rate limiting");
          this.useRedis = true;
          this.redisRetryDelay = REDIS_RETRY_CONFIG.INITIAL_DELAY_MS;
          this.isRetryingRedis = false;
          if (!this.redisStore) {
            this.redisStore = new RedisRateLimitStore(this.keyPrefix, this.max);
          }
          return this.redisStore;
        }
      } catch (error) {
        this.handleRedisRetryFailure(error);
      } finally {
        this.isRetryingRedis = false;
      }
    }

    if (this.useRedis && this.redisStore) {
      try {
        // Check Redis client status synchronously (no ping, faster)
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
    }
    return this.memoryStore;
  }

  readonly middleware =
    () =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (this.skip?.(req)) {
        return next();
      }

      const key = this.keyGenerator(req);
      let timeoutHandle: NodeJS.Timeout | null = null;

      try {
        const store = this.getStore();

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new ExternalServiceError("rate-limit-store", "Rate limit check timeout")),
            HTTP_RESILIENCE_DEFAULTS.RATE_LIMIT_CHECK_TIMEOUT_MS
          );
        });
        const info = await Promise.race([store.increment(key, this.windowMs), timeoutPromise]);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        // SECURITY: Validate rate limit info values are finite before setting headers
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

        // SECURITY: Validate and bound response header values
        res.setHeader("X-RateLimit-Limit", this.max);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, info.remaining));

        // Clamp reset time to reasonable bounds (within 24 hours from now)
        const maxResetTime = Date.now() + MAX_TTL_MS;
        const boundedResetTime = Math.min(Math.max(Date.now(), info.resetTime), maxResetTime);
        res.setHeader(
          "X-RateLimit-Reset",
          Math.ceil(boundedResetTime / TIME_CONSTANTS.MILLISECONDS_PER_SECOND)
        );

        if (info.current > this.max) {
          const retryAfterMs = Math.max(0, info.resetTime - Date.now());
          const retryAfterSec = Math.min(
            Math.max(
              MIN_RETRY_AFTER_SECONDS,
              Math.ceil(retryAfterMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND)
            ),
            MAX_RETRY_AFTER_SECONDS
          );
          res.setHeader("Retry-After", retryAfterSec);

          throw new RateLimitError(this.message, retryAfterMs);
        }

        next();
      } catch (error) {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const keyHash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);
        const errorMessage = getErrorMessage(error);

        if (error instanceof RateLimitError) {
          throw error;
        }

        if (error instanceof AppError) {
          logger.error("Rate limiting error", {
            error: errorMessage,
            keyHash,
          });
          throw error;
        }

        logger.error("Rate limiting error, denying request for security", {
          error: errorMessage,
          keyHash,
        });
        throw new RateLimitError(
          "Service temporarily unavailable, please try again",
          TIME_CONSTANTS.MILLISECONDS_PER_SECOND
        );
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

      if (record && now <= record.resetTime) {
        // Existing valid window
        if (record.count >= this.max) {
          const retryAfterMs = record.resetTime - now;
          throw new RateLimitError(this.message, retryAfterMs);
        }
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
    this.store.forEach((entry, entryKey) => {
      if (entry.resetTime < now) {
        keysToDelete.push(entryKey);
      }
    });
    keysToDelete.forEach((keyToDelete) => this.store.delete(keyToDelete));
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
