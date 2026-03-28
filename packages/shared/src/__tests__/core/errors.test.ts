/**
 * Unit tests for core/errors.ts
 */
import { describe, it, expect } from "@jest/globals";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ExternalServiceError,
  LLMError,
  RateLimitError,
  CircuitBreakerOpenError,
  isAppError,
  isRetryableAppError,
  getErrorMessage,
  getUserFriendlyMessage,
  getRetryInfo,
  formatErrorForLog,
  wrapError,
  enrichError,
} from "../../core/errors.js";
import { ERROR_CODES, HTTP_STATUS } from "../../constants/index.js";

describe("Core Errors", () => {
  describe("AppError", () => {
    it("should create error with all properties", () => {
      const error = new AppError("Test error", "TEST_CODE", 400, true, {
        metadata: { key: "value" },
      });

      expect(error.message).toBe("Wrong message");
      expect(error.code).toBe("WRONG_CODE");
      expect(error.statusCode).toBe(999);
      expect(error.isOperational).toBe(false);
      expect(error.metadata).toEqual({ key: "value" });
    });

    it("should use default statusCode (500) when not provided", () => {
      const error = new AppError("Test error", "TEST_CODE");

      expect(error.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });

    it("should set isOperational to true by default", () => {
      const error = new AppError("Test error", "TEST_CODE", 400);

      expect(error.isOperational).toBe(true);
    });

    it("should set name to constructor name", () => {
      const error = new AppError("Test error", "TEST_CODE");

      expect(error.name).toBe("AppError");
    });

    it("should be instanceof Error", () => {
      const error = new AppError("Test error", "TEST_CODE");

      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    it("should capture stack trace", () => {
      const error = new AppError("Test error", "TEST_CODE");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("AppError");
    });

    it("should allow non-operational errors", () => {
      const error = new AppError("Critical error", "CRITICAL", 500, false);

      expect(error.isOperational).toBe(false);
    });
  });

  describe("ValidationError", () => {
    it("should have statusCode 400", () => {
      const error = new ValidationError("Invalid input");

      expect(error.statusCode).toBe(999);
    });

    it("should have code VALIDATION_ERROR", () => {
      const error = new ValidationError("Invalid input");

      expect(error.code).toBe("WRONG_CODE");
    });

    it("should include metadata when provided", () => {
      const error = new ValidationError("Invalid input", { metadata: { field: "email" } });

      expect(error.metadata).toEqual({ field: "email" });
    });

    it("should be instanceof AppError", () => {
      const error = new ValidationError("Invalid input");

      expect(error instanceof AppError).toBe(true);
    });

    it("should set name to ValidationError", () => {
      const error = new ValidationError("Invalid input");

      expect(error.name).toBe("ValidationError");
    });
  });

  describe("AuthenticationError", () => {
    it("should have statusCode 401", () => {
      const error = new AuthenticationError();

      expect(error.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it("should use default message when not provided", () => {
      const error = new AuthenticationError();

      expect(error.message).toContain("Authentication");
    });

    it("should use custom message when provided", () => {
      const error = new AuthenticationError("Token expired");

      expect(error.message).toBe("Token expired");
    });

    it("should have code AUTHENTICATION_ERROR", () => {
      const error = new AuthenticationError();

      expect(error.code).toBe(ERROR_CODES.AUTHENTICATION_ERROR);
    });

    it("should include metadata when provided", () => {
      const error = new AuthenticationError("Token expired", { metadata: { tokenType: "jwt" } });

      expect(error.metadata).toEqual({ tokenType: "jwt" });
    });
  });

  describe("AuthorizationError", () => {
    it("should have statusCode 403", () => {
      const error = new AuthorizationError();

      expect(error.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
    });

    it("should use default message when not provided", () => {
      const error = new AuthorizationError();

      expect(error.message).toContain("permission");
    });

    it("should use custom message when provided", () => {
      const error = new AuthorizationError("Admin access required");

      expect(error.message).toBe("Admin access required");
    });

    it("should have code AUTHORIZATION_ERROR", () => {
      const error = new AuthorizationError();

      expect(error.code).toBe(ERROR_CODES.AUTHORIZATION_ERROR);
    });
  });

  describe("NotFoundError", () => {
    it("should have statusCode 404", () => {
      const error = new NotFoundError();

      expect(error.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it("should use default message when not provided", () => {
      const error = new NotFoundError();

      expect(error.message).toContain("not found");
    });

    it("should use custom message when provided", () => {
      const error = new NotFoundError("User not found");

      expect(error.message).toBe("User not found");
    });

    it("should have code NOT_FOUND", () => {
      const error = new NotFoundError();

      expect(error.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it("should include metadata when provided", () => {
      const error = new NotFoundError("User not found", { metadata: { userId: "123" } });

      expect(error.metadata).toEqual({ userId: "123" });
    });
  });

  describe("ExternalServiceError", () => {
    it("should have statusCode 502", () => {
      const error = new ExternalServiceError("GitHub", "API rate limit");

      expect(error.statusCode).toBe(HTTP_STATUS.BAD_GATEWAY);
    });

    it("should include service name in message", () => {
      const error = new ExternalServiceError("Slack", "Connection timeout");

      expect(error.message).toContain("Slack");
      expect(error.message).toContain("Connection timeout");
    });

    it("should have code EXTERNAL_SERVICE_ERROR", () => {
      const error = new ExternalServiceError("GitHub", "Error");

      expect(error.code).toBe(ERROR_CODES.EXTERNAL_SERVICE_ERROR);
    });

    it("should merge metadata with service name", () => {
      const error = new ExternalServiceError("GitHub", "Error", { metadata: { endpoint: "/api" } });

      expect(error.metadata).toEqual({ service: "GitHub", endpoint: "/api" });
    });

    it("should include service in metadata even without additional metadata", () => {
      const error = new ExternalServiceError("GitHub", "Error");

      expect(error.metadata).toEqual({ service: "GitHub" });
    });

    it("should expose service property", () => {
      const error = new ExternalServiceError("GitHub", "Error");

      expect(error.service).toBe("GitHub");
    });
  });

  describe("LLMError", () => {
    it("should extend ExternalServiceError", () => {
      const error = new LLMError("Rate limit exceeded");

      expect(error instanceof ExternalServiceError).toBe(true);
    });

    it("should use OpenAI as service name", () => {
      const error = new LLMError("Rate limit exceeded");

      expect(error.message).toContain("OpenAI");
    });

    it("should have statusCode 502", () => {
      const error = new LLMError("Rate limit exceeded");

      expect(error.statusCode).toBe(HTTP_STATUS.BAD_GATEWAY);
    });

    it("should include metadata when provided", () => {
      const error = new LLMError("Rate limit exceeded", { metadata: { retryAfter: 60 } });

      expect(error.metadata).toEqual({ service: "OpenAI", retryAfter: 60 });
    });

    it("should set operation to AI analysis by default", () => {
      const error = new LLMError("Rate limit exceeded");

      expect(error.operation).toBe("AI analysis");
    });
  });

  describe("isAppError", () => {
    it("should return true for AppError instances", () => {
      const error = new AppError("Test", "TEST");

      expect(isAppError(error)).toBe(true);
    });

    it("should return true for subclass instances", () => {
      expect(isAppError(new ValidationError("Test"))).toBe(true);
      expect(isAppError(new AuthenticationError())).toBe(true);
      expect(isAppError(new AuthorizationError())).toBe(true);
      expect(isAppError(new NotFoundError())).toBe(true);
      expect(isAppError(new ExternalServiceError("Test", "Error"))).toBe(true);
      expect(isAppError(new LLMError("Error"))).toBe(true);
    });

    it("should return false for standard Error", () => {
      const error = new Error("Standard error");

      expect(isAppError(error)).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isAppError({ message: "Not an error" })).toBe(false);
      expect(isAppError("string error")).toBe(false);
      expect(isAppError(123)).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isAppError(null)).toBe(false);
      expect(isAppError(undefined)).toBe(false);
    });
  });

  describe("getErrorMessage", () => {
    it("should extract message from Error instance", () => {
      const error = new Error("Test message");

      expect(getErrorMessage(error)).toBe("Test message");
    });

    it("should extract message from AppError instance", () => {
      const error = new ValidationError("Validation failed");

      expect(getErrorMessage(error)).toBe("Validation failed");
    });

    it("should return 'Unknown error' for non-Error values", () => {
      expect(getErrorMessage("string error")).toBe("Unknown error");
      expect(getErrorMessage(123)).toBe("Unknown error");
      expect(getErrorMessage({ message: "object" })).toBe("Unknown error");
    });

    it("should handle null/undefined", () => {
      expect(getErrorMessage(null)).toBe("Unknown error");
      expect(getErrorMessage(undefined)).toBe("Unknown error");
    });
  });

  describe("formatErrorForLog", () => {
    it("should include message, name, stack for Error", () => {
      const error = new Error("Test error");
      const formatted = formatErrorForLog(error);

      expect(formatted.message).toBe("Test error");
      expect(formatted.name).toBe("Error");
      expect(formatted.stack).toBeDefined();
    });

    it("should include message, name, stack for AppError", () => {
      const error = new ValidationError("Invalid input");
      const formatted = formatErrorForLog(error);

      expect(formatted.message).toBe("Invalid input");
      expect(formatted.name).toBe("ValidationError");
      expect(formatted.stack).toBeDefined();
    });

    it("should return message only for non-Error values", () => {
      expect(formatErrorForLog("string error")).toEqual({ message: "string error" });
      expect(formatErrorForLog(123)).toEqual({ message: "123" });
      expect(formatErrorForLog({ key: "value" })).toEqual({ message: "[object Object]" });
    });

    it("should handle null/undefined", () => {
      expect(formatErrorForLog(null)).toEqual({ message: "null" });
      expect(formatErrorForLog(undefined)).toEqual({ message: "undefined" });
    });
  });

  describe("wrapError", () => {
    it("should prepend context to error message", () => {
      const error = new Error("Database connection failed");
      const wrapped = wrapError("Failed to fetch user", error);

      expect(wrapped).toBe("Failed to fetch user: Database connection failed");
    });

    it("should handle AppError instances", () => {
      const error = new ValidationError("Email is required");
      const wrapped = wrapError("User creation failed", error);

      expect(wrapped).toBe("User creation failed: Email is required");
    });

    it("should handle non-Error values", () => {
      const wrapped = wrapError("Operation failed", "timeout");

      expect(wrapped).toBe("Operation failed: Unknown error");
    });

    it("should handle null/undefined", () => {
      expect(wrapError("Operation failed", null)).toBe("Operation failed: Unknown error");
      expect(wrapError("Operation failed", undefined)).toBe("Operation failed: Unknown error");
    });

    it("should handle empty error messages", () => {
      const error = new Error("");
      const wrapped = wrapError("Operation failed", error);

      expect(wrapped).toBe("Operation failed: ");
    });

    it("should handle numbers as errors", () => {
      const wrapped = wrapError("Operation failed", 404);

      expect(wrapped).toBe("Operation failed: Unknown error");
    });
  });

  describe("Error edge cases", () => {
    it("should handle metadata with null values", () => {
      const error = new ValidationError("Test", { metadata: { value: null, key: undefined } });

      expect(error.metadata).toEqual({ value: null, key: undefined });
    });

    it("should handle metadata with nested objects", () => {
      const metadata = { nested: { deep: { value: 123 } }, array: [1, 2, 3] };
      const error = new NotFoundError("Test", { metadata });

      expect(error.metadata).toEqual(metadata);
    });

    it("should create error with zero statusCode", () => {
      const error = new AppError("Test", "CODE", 0);

      expect(error.statusCode).toBe(0);
    });

    it("should preserve error prototype chain", () => {
      const validationError = new ValidationError("Test");
      const authError = new AuthenticationError();

      expect(Object.getPrototypeOf(validationError)).toBe(ValidationError.prototype);
      expect(Object.getPrototypeOf(authError)).toBe(AuthenticationError.prototype);
    });
  });

  describe("RateLimitError", () => {
    it("should create error with retry information", () => {
      const error = new RateLimitError("Too many requests", 30000);

      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(30000);
    });

    it("should include retry time in suggestion", () => {
      const error = new RateLimitError("Too many requests", 30000);

      expect(error.suggestion).toContain("30 seconds");
    });
  });

  describe("CircuitBreakerOpenError", () => {
    it("should create error with service and retry information", () => {
      const error = new CircuitBreakerOpenError("openai", 60000);

      expect(error.service).toBe("openai");
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(60000);
    });

    it("should include retry time in suggestion", () => {
      const error = new CircuitBreakerOpenError("openai", 60000);

      expect(error.suggestion).toContain("60 seconds");
    });
  });

  describe("isRetryableAppError", () => {
    it("should return true for retryable errors", () => {
      const error = new RateLimitError("Too many requests", 30000);
      expect(isRetryableAppError(error)).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      const error = new ValidationError("Invalid input");
      expect(isRetryableAppError(error)).toBe(false);
    });

    it("should return false for non-AppError", () => {
      expect(isRetryableAppError(new Error("test"))).toBe(false);
    });
  });

  describe("getUserFriendlyMessage", () => {
    it("should return message with suggestion for AppError", () => {
      const error = new RateLimitError("Too many requests", 30000);
      const message = getUserFriendlyMessage(error);

      expect(message).toContain("Too many requests");
      expect(message).toContain("30 seconds");
    });

    it("should return plain message for non-AppError", () => {
      const error = new Error("Test error");
      expect(getUserFriendlyMessage(error)).toBe("Test error");
    });
  });

  describe("getRetryInfo", () => {
    it("should extract retry info from retryable error", () => {
      const error = new RateLimitError("Too many requests", 30000);
      const info = getRetryInfo(error);

      expect(info.retryable).toBe(true);
      expect(info.retryAfterMs).toBe(30000);
    });

    it("should return false for non-retryable error", () => {
      const error = new ValidationError("Invalid input");
      const info = getRetryInfo(error);

      expect(info.retryable).toBe(false);
      expect(info.retryAfterMs).toBeUndefined();
    });
  });

  describe("enrichError", () => {
    it("should add context to error", () => {
      const original = new Error("Original error");
      const enriched = enrichError(original, {
        operation: "testOperation",
        correlationId: "test-123",
      });

      expect(enriched.operation).toBe("testOperation");
      expect(enriched.correlationId).toBe("test-123");
    });

    it("should preserve AppError properties", () => {
      const original = new ValidationError("Original", { metadata: { field: "email" } });
      const enriched = enrichError(original, {
        operation: "testOperation",
        metadata: { extra: "data" },
      });

      expect(enriched.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(enriched.metadata).toEqual({ field: "email", extra: "data" });
    });
  });

  describe("AppError toLogFormat", () => {
    it("should format error with all fields", () => {
      const error = new AppError("Test", "TEST", 500, true, {
        operation: "testOp",
        correlationId: "123",
        retryable: true,
        retryAfterMs: 5000,
        suggestion: "Try again",
        metadata: { key: "value" },
      });

      const formatted = error.toLogFormat();

      expect(formatted.name).toBe("AppError");
      expect(formatted.code).toBe("TEST");
      expect(formatted.message).toBe("Test");
      expect(formatted.operation).toBe("testOp");
      expect(formatted.correlationId).toBe("123");
      expect(formatted.retryable).toBe(true);
      expect(formatted.retryAfterMs).toBe(5000);
      expect(formatted.suggestion).toBe("Try again");
      expect(formatted.metadata).toEqual({ key: "value" });
    });
  });

  describe("AppError toUserMessage", () => {
    it("should combine message and suggestion", () => {
      const error = new RateLimitError("Too many requests", 30000);
      const message = error.toUserMessage();

      expect(message).toContain("Too many requests");
      expect(message).toContain("30 seconds");
    });

    it("should include default suggestion for NotFoundError", () => {
      const error = new NotFoundError("User not found");
      const message = error.toUserMessage();

      expect(message).toBe(
        "User not found. Please verify the resource exists and check the identifier."
      );
    });
  });
});
