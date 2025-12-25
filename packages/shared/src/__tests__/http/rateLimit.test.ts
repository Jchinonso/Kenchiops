/**
 * Unit tests for rate limiting middleware.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { createRateLimiter, defaultRateLimiter } from "../../http/rateLimit.js";
import { AppError } from "../../core/errors.js";
import { RATE_LIMIT_CONSTANTS } from "../../constants/index.js";

describe("Rate Limiting", () => {
  // Mock Express objects
  const createMockRequest = (ip = "127.0.0.1"): Request =>
    ({
      ip,
      method: "GET",
      path: "/test",
    }) as Request;

  const createMockResponse = (): Response => ({}) as Response;

  const createMockNext = (): NextFunction => jest.fn() as unknown as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createRateLimiter", () => {
    describe("basic rate limiting", () => {
      it("should allow requests within limit", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 5 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // Make 5 requests (all should pass)
        Array.from({ length: 5 }).forEach(() => {
          middleware(req, res, next);
        });

        expect(next).toHaveBeenCalledTimes(5);
      });

      it("should block requests exceeding limit", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // Make 3 requests (should pass)
        Array.from({ length: 3 }).forEach(() => {
          middleware(req, res, next);
        });

        expect(next).toHaveBeenCalledTimes(3);

        // 4th request should be blocked
        expect(() => middleware(req, res, next)).toThrow(AppError);
        expect(next).toHaveBeenCalledTimes(3); // Still only 3 successful calls
      });

      it("should throw AppError with rate limit exceeded message", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next); // First request passes

        try {
          middleware(req, res, next); // Second request should fail
          throw new Error("Should have thrown AppError");
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.message).toContain("Too many requests");
          expect(appError.statusCode).toBe(RATE_LIMIT_CONSTANTS.RATE_LIMIT_STATUS_CODE);
        }
      });

      it("should include retryAfter in error metadata", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown AppError");
        } catch (error) {
          const appError = error as AppError;
          expect(appError.metadata).toHaveProperty("retryAfter");
          expect(typeof appError.metadata?.retryAfter).toBe("number");
          expect(appError.metadata?.retryAfter).toBeGreaterThan(0);
        }
      });
    });

    describe("IP-based rate limiting", () => {
      it("should track requests per IP address", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
        const middleware = limiter.middleware();

        const req1 = createMockRequest("192.168.1.1");
        const req2 = createMockRequest("192.168.1.2");
        const res = createMockResponse();
        const next = createMockNext();

        // Each IP can make 2 requests
        middleware(req1, res, next);
        middleware(req1, res, next);
        middleware(req2, res, next);
        middleware(req2, res, next);

        expect(next).toHaveBeenCalledTimes(4);

        // Both IPs should be blocked on 3rd request
        expect(() => middleware(req1, res, next)).toThrow(AppError);
        expect(() => middleware(req2, res, next)).toThrow(AppError);
      });

      it("should handle missing IP address", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
        const middleware = limiter.middleware();

        const req = createMockRequest(undefined);
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);
        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(2);

        // Should use "unknown" as key and block
        expect(() => middleware(req, res, next)).toThrow(AppError);
      });
    });

    describe("custom key generator", () => {
      it("should use custom key generator function", () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 2,
          keyGenerator: (req) => req.path || "default",
        });
        const middleware = limiter.middleware();

        const req1 = { ...createMockRequest(), path: "/api/users" } as Request;
        const req2 = { ...createMockRequest(), path: "/api/posts" } as Request;
        const res = createMockResponse();
        const next = createMockNext();

        // Each path can make 2 requests
        middleware(req1, res, next);
        middleware(req1, res, next);
        middleware(req2, res, next);
        middleware(req2, res, next);

        expect(next).toHaveBeenCalledTimes(4);
      });

      it("should rate limit per user ID from header", () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 1,
          keyGenerator: (req) => (req as any).headers?.userId || "anonymous",
        });
        const middleware = limiter.middleware();

        const req1 = {
          ...createMockRequest(),
          headers: { userId: "user-123" },
        } as unknown as Request;
        const req2 = {
          ...createMockRequest(),
          headers: { userId: "user-456" },
        } as unknown as Request;
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req1, res, next);
        middleware(req2, res, next);

        expect(next).toHaveBeenCalledTimes(2);

        // Each user should be blocked individually
        expect(() => middleware(req1, res, next)).toThrow(AppError);
        expect(() => middleware(req2, res, next)).toThrow(AppError);
      });
    });

    describe("time window behavior", () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it("should reset rate limit after window expires", () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // Use up the limit
        middleware(req, res, next);
        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(2);

        // Should be blocked
        expect(() => middleware(req, res, next)).toThrow(AppError);

        // Advance time past window
        jest.advanceTimersByTime(1001);

        // Should allow requests again
        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(3);
      });

      it("should not reset before window expires", () => {
        const limiter = createRateLimiter({ windowMs: 5000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        // Advance time but not past window
        jest.advanceTimersByTime(4999);

        // Should still be blocked
        expect(() => middleware(req, res, next)).toThrow(AppError);
      });

      it("should calculate correct retryAfter time", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        jest.advanceTimersByTime(15000); // 15 seconds pass

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown AppError");
        } catch (error) {
          const appError = error as AppError;
          const retryAfter = appError.metadata?.retryAfter as number;
          // Should be approximately 45 seconds (60 - 15)
          expect(retryAfter).toBeGreaterThan(40);
          expect(retryAfter).toBeLessThan(50);
        }
      });
    });

    describe("custom message", () => {
      it("should use custom error message when provided", () => {
        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 1,
          message: "API rate limit exceeded",
        });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown AppError");
        } catch (error) {
          const appError = error as AppError;
          expect(appError.message).toBe("API rate limit exceeded");
        }
      });

      it("should use default message when not provided", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown AppError");
        } catch (error) {
          const appError = error as AppError;
          expect(appError.message).toBe("Too many requests, please try again later");
        }
      });
    });

    describe("cleanup mechanism", () => {
      beforeEach(() => {
        jest.useFakeTimers();
        // Mock Math.random to control cleanup probability
        jest.spyOn(Math, "random");
      });

      afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
      });

      it("should trigger cleanup when random probability is met", () => {
        // Force cleanup to trigger (random < 0.01)
        (Math.random as jest.Mock).mockReturnValue(0.005);

        const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // Make request to create entry
        middleware(req, res, next);

        // Advance time to expire the entry
        jest.advanceTimersByTime(1001);

        // This request should trigger cleanup
        middleware(req, res, next);

        // Verify it still works (cleanup shouldn't break functionality)
        expect(next).toHaveBeenCalledTimes(2);
      });

      it("should not trigger cleanup when random probability not met", () => {
        // Prevent cleanup from triggering (random >= 0.01)
        (Math.random as jest.Mock).mockReturnValue(0.5);

        const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        // Cleanup won't trigger, but functionality should still work
        expect(next).toHaveBeenCalledTimes(1);
      });

      it("should remove expired entries during cleanup", () => {
        // Force cleanup to trigger
        (Math.random as jest.Mock).mockReturnValue(0.001);

        const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
        const middleware = limiter.middleware();

        const req1 = createMockRequest("192.168.1.1");
        const req2 = createMockRequest("192.168.1.2");
        const res = createMockResponse();
        const next = createMockNext();

        // Create entries for two IPs
        middleware(req1, res, next);
        middleware(req2, res, next);

        // Expire the entries
        jest.advanceTimersByTime(1001);

        // Trigger cleanup with a third IP
        const req3 = createMockRequest("192.168.1.3");
        middleware(req3, res, next);

        // After cleanup, old IPs should be able to make new requests
        middleware(req1, res, next);
        middleware(req2, res, next);

        expect(next).toHaveBeenCalledTimes(5);
      });
    });

    describe("reset method", () => {
      it("should clear all rate limit data", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // Use up the limit
        middleware(req, res, next);

        // Should be blocked
        expect(() => middleware(req, res, next)).toThrow(AppError);

        // Reset the limiter
        limiter.reset();

        // Should allow requests again
        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(2);
      });

      it("should reset all IP addresses independently", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
        const middleware = limiter.middleware();

        const req1 = createMockRequest("192.168.1.1");
        const req2 = createMockRequest("192.168.1.2");
        const res = createMockResponse();
        const next = createMockNext();

        // Both IPs use up their limit
        middleware(req1, res, next);
        middleware(req2, res, next);

        expect(next).toHaveBeenCalledTimes(2);

        // Both should be blocked
        expect(() => middleware(req1, res, next)).toThrow(AppError);
        expect(() => middleware(req2, res, next)).toThrow(AppError);

        // Reset
        limiter.reset();

        // Both should work again
        middleware(req1, res, next);
        middleware(req2, res, next);

        expect(next).toHaveBeenCalledTimes(4);
      });
    });

    describe("edge cases", () => {
      it("should handle very low rate limit (max: 1)", () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);

        expect(() => middleware(req, res, next)).toThrow(AppError);
      });

      it("should handle very high rate limit", () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 10000 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // Make many requests
        Array.from({ length: 100 }).forEach(() => {
          middleware(req, res, next);
        });

        expect(next).toHaveBeenCalledTimes(100);
      });

      it("should handle very short time window", () => {
        jest.useFakeTimers();

        const limiter = createRateLimiter({ windowMs: 10, max: 2 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);
        middleware(req, res, next);

        expect(() => middleware(req, res, next)).toThrow(AppError);

        jest.advanceTimersByTime(11);

        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(3);

        jest.useRealTimers();
      });

      it("should handle concurrent requests from same IP", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
        const middleware = limiter.middleware();

        const req = createMockRequest();
        const res = createMockResponse();

        const next1 = createMockNext();
        const next2 = createMockNext();
        const next3 = createMockNext();
        const next4 = createMockNext();

        // Simulate concurrent requests
        middleware(req, res, next1);
        middleware(req, res, next2);
        middleware(req, res, next3);

        expect(next1).toHaveBeenCalled();
        expect(next2).toHaveBeenCalled();
        expect(next3).toHaveBeenCalled();

        // 4th should fail
        expect(() => middleware(req, res, next4)).toThrow(AppError);
      });

      it("should handle empty string IP", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
        const middleware = limiter.middleware();

        const req = createMockRequest("");
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);

        expect(() => middleware(req, res, next)).toThrow(AppError);
      });
    });
  });

  describe("defaultRateLimiter", () => {
    beforeEach(() => {
      // Reset the default rate limiter before each test
      defaultRateLimiter.reset();
    });

    it("should be pre-configured with default values", () => {
      const middleware = defaultRateLimiter.middleware();

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Should allow at least one request
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("should use default window of 1 minute", () => {
      jest.useFakeTimers();

      const middleware = defaultRateLimiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Make max requests (100)
      Array.from({ length: 100 }).forEach(() => {
        middleware(req, res, next);
      });

      // Should be blocked
      expect(() => middleware(req, res, next)).toThrow(AppError);

      // Advance time by 1 minute
      jest.advanceTimersByTime(60001);

      // Should work again
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(101);

      jest.useRealTimers();
    });

    it("should use default max of 100 requests", () => {
      const middleware = defaultRateLimiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Make 100 requests
      Array.from({ length: 100 }).forEach(() => {
        middleware(req, res, next);
      });

      expect(next).toHaveBeenCalledTimes(100);

      // 101st request should fail
      expect(() => middleware(req, res, next)).toThrow(AppError);
    });

    it("should have default error message", () => {
      const middleware = defaultRateLimiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Use up the limit
      Array.from({ length: 100 }).forEach(() => {
        middleware(req, res, next);
      });

      try {
        middleware(req, res, next);
        throw new Error("Should have thrown AppError");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.message).toBe("Too many requests, please try again later");
      }
    });
  });

  describe("multiple limiters", () => {
    it("should allow using multiple independent rate limiters", () => {
      const strictLimiter = createRateLimiter({ windowMs: 60000, max: 1 });
      const lenientLimiter = createRateLimiter({ windowMs: 60000, max: 10 });

      const strictMiddleware = strictLimiter.middleware();
      const lenientMiddleware = lenientLimiter.middleware();

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Strict limiter blocks after 1
      strictMiddleware(req, res, next);
      expect(() => strictMiddleware(req, res, next)).toThrow(AppError);

      // Lenient limiter still allows more
      Array.from({ length: 9 }).forEach(() => {
        lenientMiddleware(req, res, next);
      });

      expect(next).toHaveBeenCalledTimes(10);
    });

    it("should track state separately for each limiter", () => {
      const limiter1 = createRateLimiter({ windowMs: 60000, max: 2 });
      const limiter2 = createRateLimiter({ windowMs: 60000, max: 2 });

      const middleware1 = limiter1.middleware();
      const middleware2 = limiter2.middleware();

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Each limiter tracks independently
      middleware1(req, res, next);
      middleware1(req, res, next);

      middleware2(req, res, next);
      middleware2(req, res, next);

      expect(next).toHaveBeenCalledTimes(4);

      // Both should block their own 3rd request
      expect(() => middleware1(req, res, next)).toThrow(AppError);
      expect(() => middleware2(req, res, next)).toThrow(AppError);
    });
  });

  describe("integration scenarios", () => {
    it("should work with authentication-based rate limiting", () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 5,
        keyGenerator: (req) => {
          // Rate limit by authenticated user ID, or IP for anonymous
          return (req as any).user?.id || req.ip || "anonymous";
        },
      });

      const middleware = limiter.middleware();

      const authenticatedReq = {
        ...createMockRequest(),
        user: { id: "user-123" },
      } as unknown as Request;

      const anonymousReq = createMockRequest("192.168.1.1");

      const res = createMockResponse();
      const next = createMockNext();

      // Each should have separate limits
      Array.from({ length: 5 }).forEach(() => {
        middleware(authenticatedReq, res, next);
      });

      Array.from({ length: 5 }).forEach(() => {
        middleware(anonymousReq, res, next);
      });

      expect(next).toHaveBeenCalledTimes(10);
    });

    it("should work with endpoint-specific rate limiting", () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 3,
        keyGenerator: (req) => `${req.ip}:${req.path}`,
      });

      const middleware = limiter.middleware();

      const req1 = { ...createMockRequest(), path: "/api/users" } as unknown as Request;
      const req2 = { ...createMockRequest(), path: "/api/posts" } as unknown as Request;

      const res = createMockResponse();
      const next = createMockNext();

      // Each endpoint has separate limit
      Array.from({ length: 3 }).forEach(() => {
        middleware(req1, res, next);
        middleware(req2, res, next);
      });

      expect(next).toHaveBeenCalledTimes(6);
    });
  });
});
