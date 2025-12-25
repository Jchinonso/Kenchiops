/**
 * Simple in-memory rate limiting middleware.
 *
 * NOTE: For production, consider using a more robust solution like express-rate-limit
 * with Redis for distributed rate limiting.
 */

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../core/errors.js";
import { RATE_LIMIT_CONSTANTS, TIME_CONSTANTS } from "../constants/index.js";

/**
 * Rate limit entry for tracking request counts per client.
 */
interface RateLimitEntry {
  readonly resetTime: number;
  count: number;
}

interface RateLimitOptions {
  readonly windowMs: number; // Time window in milliseconds
  readonly max: number; // Maximum number of requests per window
  readonly message?: string;
  readonly keyGenerator?: (req: Request) => string;
}

/**
 * Rate limiter implementation using Map for O(1) operations
 * and avoiding prototype pollution.
 */
class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly message: string;
  private readonly keyGenerator: (req: Request) => string;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message ?? "Too many requests, please try again later";
    this.keyGenerator = options.keyGenerator ?? ((req) => req.ip ?? "unknown");
  }

  readonly middleware = () => {
    return (req: Request, _res: Response, next: NextFunction): void => {
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
        throw new AppError(
          this.message,
          "RATE_LIMIT_EXCEEDED",
          RATE_LIMIT_CONSTANTS.RATE_LIMIT_STATUS_CODE,
          true,
          {
            retryAfter: Math.ceil(
              (record.resetTime - now) / TIME_CONSTANTS.MILLISECONDS_PER_SECOND
            ),
          }
        );
      }

      record.count++;
      next();
    };
  };

  private readonly cleanup = (now: number): void => {
    // Find expired keys and delete them
    Array.from(this.store.entries())
      .filter(([, entry]) => entry.resetTime < now)
      .map(([key]) => this.store.delete(key));
  };

  readonly reset = (): void => {
    this.store.clear();
  };
}

/**
 * Create a rate limiter middleware.
 *
 * @example
 * const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', limiter.middleware());
 */
export const createRateLimiter = (options: RateLimitOptions): RateLimiter => {
  return new RateLimiter(options);
};

/**
 * Default rate limiter: 100 requests per minute per IP.
 */
export const defaultRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
  message: "Too many requests, please try again later",
});
