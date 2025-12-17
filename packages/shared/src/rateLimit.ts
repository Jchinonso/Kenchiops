/**
 * Simple in-memory rate limiting middleware.
 * 
 * NOTE: For production, consider using a more robust solution like express-rate-limit
 * with Redis for distributed rate limiting.
 */

import { Request, Response, NextFunction } from "express";
import { AppError } from "./errors.js";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum number of requests per window
  message?: string;
  keyGenerator?: (req: Request) => string;
}

class RateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private max: number;
  private message: string;
  private keyGenerator: (req: Request) => string;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message || "Too many requests, please try again later";
    this.keyGenerator = options.keyGenerator || ((req) => req.ip || "unknown");
  }

  middleware() {
    return (req: Request, _res: Response, next: NextFunction): void => {
      const key = this.keyGenerator(req);
      const now = Date.now();
      const record = this.store[key];

      // Clean up expired entries periodically
      if (Math.random() < 0.01) {
        this.cleanup(now);
      }

      if (!record || now > record.resetTime) {
        // Create new window
        this.store[key] = {
          count: 1,
          resetTime: now + this.windowMs,
        };
        return next();
      }

      if (record.count >= this.max) {
        throw new AppError(
          this.message,
          "RATE_LIMIT_EXCEEDED",
          429,
          true,
          {
            retryAfter: Math.ceil((record.resetTime - now) / 1000),
          }
        );
      }

      record.count++;
      next();
    };
  }

  private cleanup(now: number): void {
    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    }
  }

  reset(): void {
    this.store = {};
  }
}

/**
 * Create a rate limiter middleware.
 * 
 * @example
 * const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', limiter.middleware());
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  return new RateLimiter(options);
}

/**
 * Default rate limiter: 100 requests per minute per IP.
 */
export const defaultRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: "Too many requests, please try again later",
});

