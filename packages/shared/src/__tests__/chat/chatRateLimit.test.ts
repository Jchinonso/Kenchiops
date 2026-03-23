/**
 * Tests for chat/chatRateLimit — per-user chat rate limiting middleware.
 *
 * Uses jest.mock to mock the failoverStore module. This ensures the three
 * sliding-window stores (minute, hour, day) are controlled by test-provided
 * mock functions. Verifies window-based blocking, error messages, header
 * setting, unauthenticated bypass, and fail-open behavior.
 *
 * @module chat/chatRateLimit.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { RateLimitError } from "../../core/errors.js";

// ==================== Mocks ====================

const mockMinuteIncrement = jest.fn();
const mockHourIncrement = jest.fn();
const mockDayIncrement = jest.fn();

// Track which store is created by order of createFailoverStore calls:
// 1st = minuteStore, 2nd = hourStore, 3rd = dayStore
// let: call counter reassigned in module load
let createStoreCallCount = 0; // let: tracks createFailoverStore invocation order

jest.mock("../../rateLimit/failoverStore.js", () => ({
  createFailoverStore: () => {
    createStoreCallCount++;
    if (createStoreCallCount === 1) {
      return { increment: mockMinuteIncrement };
    }
    if (createStoreCallCount === 2) {
      return { increment: mockHourIncrement };
    }
    return { increment: mockDayIncrement };
  },
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../../core/logger.js", () => ({
  createLogger: () => mockLogger,
}));

// Import AFTER mocks are set up
import { chatUserRateLimit } from "../../chat/chatRateLimit.js";

// ==================== Helpers ====================

const createMockRequest = (userId?: string): Partial<Request> =>
  ({
    user: userId ? { userId } : undefined,
    context: { requestId: "test-request-id", tenantId: "test-tenant" },
  }) as Partial<Request>;

const createMockResponse = (): Partial<Response> & { headers: Record<string, string | number> } => {
  const headers: Record<string, string | number> = {};
  return {
    headers,
    setHeader: jest.fn((name: string, value: string | number) => {
      headers[name] = value;
      return {} as Response;
    }),
  };
};

const createMockNext = (): jest.Mock<NextFunction> => jest.fn();

/** Create a standard rate limit info response. */
const createRateLimitInfo = (current: number, resetTime?: number) => ({
  current,
  resetTime: resetTime ?? Date.now() + 60_000,
});

// ==================== Tests ====================

describe("chatUserRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: all windows under limit
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(1));
    mockHourIncrement.mockResolvedValue(createRateLimitInfo(1));
    mockDayIncrement.mockResolvedValue(createRateLimitInfo(1));
  });

  it("should allow request when under all limits", async () => {
    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);

    // Wait for async applyChatUserRateLimit to complete
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("should block when minute limit exceeded", async () => {
    // Minute returns count > 6 (MAX_MESSAGES_PER_MINUTE)
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(7));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = next.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(RateLimitError);
    expect((errorArg as RateLimitError).message).toContain("too quickly");
  });

  it("should block when hour limit exceeded", async () => {
    // Minute under limit, hour over limit (> 60)
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(3));
    mockHourIncrement.mockResolvedValue(createRateLimitInfo(61));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = next.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(RateLimitError);
    expect((errorArg as RateLimitError).message).toContain("hourly");
  });

  it("should block when day limit exceeded", async () => {
    // Minute and hour under limit, day over limit (> 300)
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(3));
    mockHourIncrement.mockResolvedValue(createRateLimitInfo(30));
    mockDayIncrement.mockResolvedValue(createRateLimitInfo(301));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = next.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(RateLimitError);
    expect((errorArg as RateLimitError).message).toContain("daily");
  });

  it("should skip rate limiting for unauthenticated users", async () => {
    const middleware = chatUserRateLimit();
    const req = createMockRequest(); // no userId
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(mockMinuteIncrement).not.toHaveBeenCalled();
  });

  it("should set rate limit headers on minute limit exceeded", async () => {
    const resetTime = Date.now() + 30_000;
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(7, resetTime));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 6);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 0);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", Math.ceil(resetTime / 1000));
  });

  it("should set Retry-After header in seconds on minute limit exceeded", async () => {
    const resetTime = Date.now() + 45_000; // 45 seconds from now
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(7, resetTime));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    // Retry-After should be set in seconds (not milliseconds)
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(Number));

    // Extract the actual Retry-After value and verify it's in seconds range
    const retryAfterCall = (res.setHeader as jest.Mock).mock.calls.find(
      (call: unknown[]) => call[0] === "Retry-After"
    );
    const retryAfterValue = retryAfterCall?.[1] as number;
    // Should be roughly 45 seconds (ceil of ~45000ms / 1000), not 45000
    expect(retryAfterValue).toBeLessThanOrEqual(46);
    expect(retryAfterValue).toBeGreaterThan(0);
  });

  it("should set Retry-After header in seconds on hour limit exceeded", async () => {
    const resetTime = Date.now() + 120_000; // 2 minutes from now
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(3));
    mockHourIncrement.mockResolvedValue(createRateLimitInfo(61, resetTime));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    const retryAfterCall = (res.setHeader as jest.Mock).mock.calls.find(
      (call: unknown[]) => call[0] === "Retry-After"
    );
    const retryAfterValue = retryAfterCall?.[1] as number;
    // Should be roughly 120 seconds, not 120000
    expect(retryAfterValue).toBeLessThanOrEqual(121);
    expect(retryAfterValue).toBeGreaterThan(0);
  });

  it("should set Retry-After header in seconds on day limit exceeded", async () => {
    const resetTime = Date.now() + 600_000; // 10 minutes from now
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(3));
    mockHourIncrement.mockResolvedValue(createRateLimitInfo(30));
    mockDayIncrement.mockResolvedValue(createRateLimitInfo(301, resetTime));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    const retryAfterCall = (res.setHeader as jest.Mock).mock.calls.find(
      (call: unknown[]) => call[0] === "Retry-After"
    );
    const retryAfterValue = retryAfterCall?.[1] as number;
    // Should be roughly 600 seconds, not 600000
    expect(retryAfterValue).toBeLessThanOrEqual(601);
    expect(retryAfterValue).toBeGreaterThan(0);
  });

  it("should increment minute counter even when hour limit blocks (counter inflation tradeoff)", async () => {
    // Minute passes (returns 3, under limit of 6), but hour blocks (returns 61, over limit of 60).
    // The minute counter was already atomically incremented before hour was checked.
    // This documents the known tradeoff described in the source code comment.
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(3));
    mockHourIncrement.mockResolvedValue(createRateLimitInfo(61));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    // Minute increment WAS called (counter inflated)
    expect(mockMinuteIncrement).toHaveBeenCalledTimes(1);
    // Hour increment WAS called and blocked
    expect(mockHourIncrement).toHaveBeenCalledTimes(1);
    // Day was NOT checked (short-circuit after hour block)
    expect(mockDayIncrement).not.toHaveBeenCalled();
    // Request was blocked
    const errorArg = next.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(RateLimitError);
  });

  it("should set X-Chat-RateLimit-Remaining header when under all limits", async () => {
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(2));
    mockHourIncrement.mockResolvedValue(createRateLimitInfo(10));
    mockDayIncrement.mockResolvedValue(createRateLimitInfo(50));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(res.setHeader).toHaveBeenCalledWith("X-Chat-RateLimit-Remaining", expect.any(Number));
  });

  it("should fail open when store throws an unexpected error", async () => {
    mockMinuteIncrement.mockRejectedValue(new Error("Redis connection lost"));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    // Should call next() without an error (fail open)
    expect(next).toHaveBeenCalledWith();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Chat user rate limit check failed, failing open",
      expect.objectContaining({ userId: "user-1" })
    );
  });

  it("should propagate RateLimitError even in the catch block", async () => {
    // Simulate a RateLimitError being thrown in the try block
    // This tests the `if (error instanceof RateLimitError)` path in the catch
    const rateLimitError = new RateLimitError("Test rate limit", 1000);
    mockMinuteIncrement.mockRejectedValue(rateLimitError);

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(rateLimitError);
  });

  it("should check windows in order: minute first, then hour, then day", async () => {
    const callOrder: string[] = [];
    mockMinuteIncrement.mockImplementation(async () => {
      callOrder.push("minute");
      return createRateLimitInfo(1);
    });
    mockHourIncrement.mockImplementation(async () => {
      callOrder.push("hour");
      return createRateLimitInfo(1);
    });
    mockDayIncrement.mockImplementation(async () => {
      callOrder.push("day");
      return createRateLimitInfo(1);
    });

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(callOrder).toEqual(["minute", "hour", "day"]);
  });

  it("should short-circuit at minute check when minute limit exceeded", async () => {
    mockMinuteIncrement.mockResolvedValue(createRateLimitInfo(7));

    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-1");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    // Hour and day should not be checked
    expect(mockHourIncrement).not.toHaveBeenCalled();
    expect(mockDayIncrement).not.toHaveBeenCalled();
  });

  it("should use userId in the rate limit key", async () => {
    const middleware = chatUserRateLimit();
    const req = createMockRequest("user-42");
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as unknown as Response, next);
    await new Promise(process.nextTick);

    expect(mockMinuteIncrement).toHaveBeenCalledWith("user-42", expect.any(Number));
    expect(mockHourIncrement).toHaveBeenCalledWith("user-42", expect.any(Number));
    expect(mockDayIncrement).toHaveBeenCalledWith("user-42", expect.any(Number));
  });
});
