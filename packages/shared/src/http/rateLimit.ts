/**
 * Redis-based distributed rate limiting middleware.
 *
 * Uses Redis sliding window counter for accurate, distributed rate limiting
 * that works across multiple server instances.
 *
 * Falls back to in-memory store if Redis is unavailable.
 *
 * @module http/rateLimit
 */

import type { Request, Response, NextFunction } from "express";
import { AppError, RateLimitError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import {
  RATE_LIMIT_CONSTANTS,
  TIME_CONSTANTS,
  HTTP_RESILIENCE_DEFAULTS,
  REDIS_TTL_VALUES,
  REDIS_SCAN,
  RATE_LIMIT_MESSAGES,
} from "../constants/index.js";
import { getRedisClient } from "../queue/redisClient.js";

const logger = createLogger("rate-limiter");

// ==================== Types ====================

/**
 * Rate limit entry for in-memory fallback.
 */
interface RateLimitEntry {
  readonly resetTime: number;
  count: number;
}

/**
 * Rate limiter configuration options.
 */
interface RateLimitOptions {
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
interface RateLimitInfo {
  readonly current: number;
  readonly remaining: number;
  readonly resetTime: number;
}

// ==================== Rate Limiter Store Interface ====================

/**
 * Abstract store interface for rate limit data.
 */
interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitInfo>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
}

// ==================== Redis Store ====================

/**
 * Redis-based rate limit store using sliding window counter.
 */
class RedisRateLimitStore implements RateLimitStore {
  private readonly keyPrefix: string;
  private readonly max: number;

  constructor(keyPrefix: string, max: number) {
    this.keyPrefix = keyPrefix;
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const redis = getRedisClient();
    const redisKey = `${this.keyPrefix}${key}`;

    // Use MULTI/EXEC for atomic increment and expire
    const pipeline = redis.multi();
    pipeline.incr(redisKey);
    pipeline.pttl(redisKey);

    const results = await pipeline.exec();

    if (!results) {
      throw new Error("Redis pipeline failed");
    }

    const [[incrErr, current], [ttlErr, ttl]] = results as [
      [Error | null, number],
      [Error | null, number],
    ];

    if (incrErr) {
      throw incrErr;
    }
    if (ttlErr) {
      throw ttlErr;
    }

    // Set expiry on first request in window
    if (ttl === REDIS_TTL_VALUES.NO_EXPIRY || ttl === REDIS_TTL_VALUES.KEY_NOT_FOUND) {
      await redis.pexpire(redisKey, windowMs);
    }

    const resetTime = Date.now() + (ttl > 0 ? ttl : windowMs);

    return {
      current: current as number,
      remaining: Math.max(0, this.max - (current as number)),
      resetTime,
    };
  }

  async reset(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${this.keyPrefix}${key}`);
  }

  async resetAll(): Promise<void> {
    const redis = getRedisClient();
    const pattern = `${this.keyPrefix}*`;

    // Use SCAN for efficient key iteration
    let cursor: string = REDIS_SCAN.INITIAL_CURSOR;
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        REDIS_SCAN.BATCH_SIZE
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== REDIS_SCAN.INITIAL_CURSOR);
  }
}

// ==================== In-Memory Store (Fallback) ====================

/**
 * In-memory rate limit store for fallback when Redis is unavailable.
 */
class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const now = Date.now();
    const record = this.store.get(key);

    // Clean up expired entries periodically
    if (Math.random() < RATE_LIMIT_CONSTANTS.CLEANUP_PROBABILITY) {
      this.cleanup(now);
    }

    if (!record || now > record.resetTime) {
      // Create new window
      const resetTime = now + windowMs;
      this.store.set(key, { count: 1, resetTime });
      return { current: 1, remaining: this.max - 1, resetTime };
    }

    record.count++;
    return {
      current: record.count,
      remaining: Math.max(0, this.max - record.count),
      resetTime: record.resetTime,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async resetAll(): Promise<void> {
    this.store.clear();
  }

  private cleanup(now: number): void {
    this.store.forEach((entry, key) => {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    });
  }
}

// ==================== Rate Limiter Class ====================

/**
 * Rate limiter implementation with Redis backend and in-memory fallback.
 */
class RateLimiter {
  private redisStore: RedisRateLimitStore | null = null;
  private memoryStore: InMemoryRateLimitStore;
  private useRedis = true;
  private readonly windowMs: number;
  private readonly max: number;
  private readonly message: string;
  private readonly keyGenerator: (req: Request) => string;
  private readonly keyPrefix: string;
  private readonly skip?: (req: Request) => boolean;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message ?? RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS;
    this.keyGenerator = options.keyGenerator ?? ((req) => req.ip ?? "unknown");
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
        error: error instanceof Error ? error.message : "Unknown error",
      });
      this.useRedis = false;
    }
  }

  private getStore(): RateLimitStore {
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
      } catch {
        logger.warn("Redis connection lost, falling back to in-memory rate limiting");
      }
      this.useRedis = false;
    }
    return this.memoryStore;
  }

  readonly middleware =
    () =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Check if this request should skip rate limiting
      if (this.skip?.(req)) {
        return next();
      }

      const key = this.keyGenerator(req);

      try {
        const store = this.getStore();

        // Add timeout to prevent indefinite hangs on Redis operations
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("Rate limit check timeout")),
            HTTP_RESILIENCE_DEFAULTS.RATE_LIMIT_CHECK_TIMEOUT_MS
          );
        });
        const info = await Promise.race([store.increment(key, this.windowMs), timeoutPromise]);

        // Set rate limit headers
        res.setHeader("X-RateLimit-Limit", this.max);
        res.setHeader("X-RateLimit-Remaining", info.remaining);
        res.setHeader(
          "X-RateLimit-Reset",
          Math.ceil(info.resetTime / TIME_CONSTANTS.MILLISECONDS_PER_SECOND)
        );

        if (info.current > this.max) {
          const retryAfterMs = info.resetTime - Date.now();
          const retryAfterSec = Math.ceil(retryAfterMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND);
          res.setHeader("Retry-After", retryAfterSec);

          throw new RateLimitError(this.message, retryAfterMs);
        }

        next();
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        // Log error but don't block request if rate limiting fails
        logger.error("Rate limiting error, allowing request", {
          error: error instanceof Error ? error.message : "Unknown error",
          key,
        });
        next();
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

// ==================== Sync Rate Limiter (Backward Compatible) ====================

/**
 * Synchronous rate limiter for backward compatibility.
 * Uses in-memory store only but provides sync middleware.
 */
class SyncRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly message: string;
  private readonly keyGenerator: (req: Request) => string;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message ?? RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS;
    this.keyGenerator = options.keyGenerator ?? ((req) => req.ip ?? "unknown");
  }

  readonly middleware =
    () =>
    (req: Request, _res: Response, next: NextFunction): void => {
      const key = this.keyGenerator(req);
      const now = Date.now();
      const record = this.store.get(key);

      // Clean up expired entries periodically
      if (Math.random() < RATE_LIMIT_CONSTANTS.CLEANUP_PROBABILITY) {
        this.cleanup(now);
      }

      if (!record || now > record.resetTime) {
        // Create new window
        this.store.set(key, {
          count: 1,
          resetTime: now + this.windowMs,
        });
        return next();
      }

      if (record.count >= this.max) {
        const retryAfterMs = record.resetTime - now;
        throw new RateLimitError(this.message, retryAfterMs);
      }

      record.count++;
      next();
    };

  private readonly cleanup = (now: number): void => {
    this.store.forEach((entry, key) => {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    });
  };

  readonly reset = (): void => {
    this.store.clear();
  };
}

// ==================== Factory Functions ====================

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

// Re-export types
export type { RateLimitOptions, RateLimitInfo };
