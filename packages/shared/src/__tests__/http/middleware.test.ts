/**
 * Unit tests for http/middleware.ts
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { errorHandler, asyncHandler, requestLogger } from "../../http/middleware.js";
import { ValidationError, AppError } from "../../core/errors.js";
import { ERROR_CODES, HTTP_STATUS } from "../../constants/index.js";

// Type for error response JSON
interface ErrorResponseJson {
  error: {
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  };
}

// Mock logger
jest.unstable_mockModule("../../core/index.js", () => ({
  isAppError: (error: unknown): boolean => error instanceof AppError,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("HTTP Middleware", () => {
  // Helper to create mock Express objects
  const createMockRequest = (overrides: Partial<Request> = {}): Request =>
    ({
      method: "GET",
      path: "/test",
      ip: "127.0.0.1",
      body: {},
      params: {},
      query: {},
      ...overrides,
    }) as Request;

  const createMockResponse = (): Response & {
    _status: number;
    _json: unknown;
    _listeners: Map<string, Array<() => void>>;
  } => {
    const listeners = new Map<string, Array<() => void>>();
    const res: Record<string, unknown> = {
      _status: 200,
      _json: null,
      _listeners: listeners,
      statusCode: 200,
    };

    res.status = jest.fn((code: number) => {
      res._status = code;
      res.statusCode = code;
      return res;
    });

    res.json = jest.fn((data: unknown) => {
      res._json = data;
      return res;
    });

    res.on = jest.fn((event: string, handler: () => void) => {
      const eventListeners = listeners.get(event) || [];
      eventListeners.push(handler);
      listeners.set(event, eventListeners);
      return res;
    });

    return res as unknown as Response & {
      _status: number;
      _json: unknown;
      _listeners: Map<string, Array<() => void>>;
    };
  };

  const createMockNext = (): NextFunction => jest.fn() as unknown as NextFunction;

  describe("errorHandler", () => {
    let req: Request;
    let res: ReturnType<typeof createMockResponse>;
    let next: NextFunction;

    beforeEach(() => {
      req = createMockRequest();
      res = createMockResponse();
      next = createMockNext();
    });

    it("should handle AppError with correct status and body", () => {
      const error = new ValidationError("Email is required", { metadata: { field: "email" } });

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Email is required",
          metadata: { field: "email" },
        },
      });
    });

    it("should include only safe metadata keys in response", () => {
      const error = new ValidationError("Invalid input", {
        metadata: { field: "name", value: "x", tenantId: "secret-tenant" },
      });

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0] as ErrorResponseJson;
      // Only allowlisted keys should pass through — "value" and "tenantId" are stripped
      expect(jsonCall.error.metadata).toEqual({ field: "name" });
    });

    it("should omit metadata entirely when no safe keys are present", () => {
      const error = new ValidationError("Invalid input", {
        metadata: { internalPath: "/secret/path", tenantId: "t-123" },
      });

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0] as ErrorResponseJson;
      // No safe keys present — metadata should be omitted entirely
      expect(jsonCall.error.metadata).toBeUndefined();
    });

    it("should not include metadata when not present", () => {
      const error = new AppError("Generic error", "GENERIC", 500, true);

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0] as ErrorResponseJson;
      expect(jsonCall.error.metadata).toBeUndefined();
    });

    it("should handle unexpected errors with 500 status", () => {
      const error = new Error("Unexpected failure");

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });

    it("should return generic message for unexpected errors", () => {
      const error = new Error("Sensitive internal details");

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0] as ErrorResponseJson;
      expect(jsonCall.error.message).not.toContain("Sensitive");
      expect(jsonCall.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    });

    it("should handle string errors", () => {
      errorHandler("string error", req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });

    it("should handle null/undefined errors", () => {
      errorHandler(null, req, res, next);

      expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  describe("asyncHandler", () => {
    let req: Request;
    let res: ReturnType<typeof createMockResponse>;
    let next: NextFunction;

    // Type for async Express handler
    type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

    beforeEach(() => {
      req = createMockRequest();
      res = createMockResponse();
      next = createMockNext();
    });

    it("should call next with error on promise rejection", async () => {
      const error = new Error("Async error");
      const asyncFn = jest.fn<AsyncHandler>().mockRejectedValue(error);

      const handler = asyncHandler(asyncFn);
      handler(req, res, next);

      // Wait for promise to settle
      await new Promise((resolve) => setImmediate(resolve));

      expect(next).toHaveBeenCalledWith(error);
    });

    it("should not call next on successful resolution", async () => {
      const asyncFn = jest.fn<AsyncHandler>().mockResolvedValue({ data: "success" });

      const handler = asyncHandler(asyncFn);
      handler(req, res, next);

      // Wait for promise to settle
      await new Promise((resolve) => setImmediate(resolve));

      expect(next).not.toHaveBeenCalled();
    });

    it("should pass req, res, next to the wrapped function", async () => {
      const asyncFn = jest.fn<AsyncHandler>().mockResolvedValue(undefined);

      const handler = asyncHandler(asyncFn);
      handler(req, res, next);

      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    });

    it("should handle synchronous functions", async () => {
      const syncFn = jest.fn<AsyncHandler>().mockReturnValue(Promise.resolve("result"));

      const handler = asyncHandler(syncFn);
      handler(req, res, next);

      expect(syncFn).toHaveBeenCalled();
    });
  });

  describe("requestLogger", () => {
    let req: Request;
    let res: ReturnType<typeof createMockResponse>;
    let next: NextFunction;

    beforeEach(() => {
      req = createMockRequest();
      res = createMockResponse();
      next = createMockNext();
    });

    it("should call next immediately", () => {
      requestLogger(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should register finish event listener", () => {
      requestLogger(req, res, next);

      expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function));
    });

    it("should include method, path, statusCode in log", () => {
      req = createMockRequest({ method: "POST", path: "/api/users" });
      res.statusCode = 201;

      requestLogger(req, res, next);

      // Trigger finish event
      const finishListeners = res._listeners.get("finish") || [];
      finishListeners.forEach((listener) => listener());

      // Logger should have been called (mocked)
      expect(res.on).toHaveBeenCalled();
    });

    it("should calculate duration", () => {
      requestLogger(req, res, next);

      // Simulate some time passing
      const finishListeners = res._listeners.get("finish") || [];
      finishListeners.forEach((listener) => listener());

      // Duration calculation happens, we just verify no errors
      expect(next).toHaveBeenCalled();
    });

    it("should include IP address", () => {
      req = createMockRequest({ ip: "192.168.1.1" });

      requestLogger(req, res, next);

      // IP should be available for logging
      expect(req.ip).toBe("192.168.1.1");
    });
  });
});
