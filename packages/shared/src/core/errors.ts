/**
 * Custom error classes for better error handling and type safety.
 *
 * All errors include:
 * - Structured metadata for logging
 * - Retry information for transient errors
 * - User-friendly suggestions
 *
 * @module core/errors
 */

import {
  ERROR_CODES,
  HTTP_STATUS,
  DEFAULT_ERROR_MESSAGES,
  EXTERNAL_SERVICE_NAMES,
  TIME_CONSTANTS,
} from "../constants/index.js";
import type { ErrorContext, RetryInfo } from "./types.js";

/** Re-export types for backward compatibility. */
export type { ErrorContext, RetryInfo };

// ==================== Default Suggestions ====================

/** Default user-friendly suggestions for error types. */
const DEFAULT_SUGGESTIONS = {
  VALIDATION: "Please check your input and try again",
  AUTHENTICATION: "Please check your credentials and try again",
  AUTHORIZATION: "Contact your administrator for access",
  NOT_FOUND: "Please verify the resource exists and check the identifier.",
  AI_SERVICE:
    "The AI analysis service is temporarily unavailable. Please try again in a few moments.",
  EXTERNAL_SERVICE: "The service encountered an issue. Please try again in a few moments.",
} as const;

/** Default operation name for LLM errors. */
const DEFAULT_LLM_OPERATION = "AI analysis";

/** Default message for unknown errors. */
const UNKNOWN_ERROR_MESSAGE = "Unknown error";

/** Default retry info for non-retryable errors. */
const DEFAULT_RETRY_INFO: RetryInfo = { retryable: false };

/** Default service name when not provided. */
const DEFAULT_SERVICE_NAME = "external";

// ==================== Validation Helpers ====================

/**
 * Ensures a string value is non-empty, returning default if empty.
 */
const ensureNonEmptyString = (value: string, defaultValue: string): string =>
  value.trim().length > 0 ? value : defaultValue;

/**
 * Safely converts milliseconds to positive seconds, rounded up.
 */
const millisecondsToSeconds = (milliseconds: number): number => {
  const safeMs = Math.max(0, milliseconds);
  return Math.ceil(safeMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND);
};

// ==================== Message Builders ====================

/**
 * Creates a retry suggestion message with the given delay.
 */
const createRetrySuggestion = (retryAfterMs: number): string =>
  `Please try again in ${millisecondsToSeconds(retryAfterMs)} seconds`;

/**
 * Creates a service unavailable suggestion message.
 */
const createServiceUnavailableSuggestion = (retryAfterMs: number): string =>
  `The service is experiencing issues. Please try again in ${millisecondsToSeconds(retryAfterMs)} seconds`;

/**
 * Creates an external service suggestion message.
 */
const createExternalServiceSuggestion = (service: string): string => {
  const safeName = ensureNonEmptyString(service, DEFAULT_SERVICE_NAME);
  return `The ${safeName} service encountered an issue. Please try again in a few moments.`;
};

/**
 * Creates an external service error message.
 */
const createExternalServiceMessage = (service: string, message: string): string => {
  const safeName = ensureNonEmptyString(service, DEFAULT_SERVICE_NAME);
  const safeMessage = ensureNonEmptyString(message, UNKNOWN_ERROR_MESSAGE);
  return `External service error (${safeName}): ${safeMessage}`;
};

// ==================== Stack Trace Helper ====================

/**
 * Captures stack trace if available (V8 environments only).
 * Safely handles environments where captureStackTrace is unavailable.
 */
const captureStackTraceIfAvailable = (error: Error, constructor: NewableFunction): void => {
  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(error, constructor);
  }
};

// ==================== Base Error ====================

/**
 * Base error class for application-specific errors.
 * Enhanced with context for better debugging and user experience.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly operation?: string;
  public readonly correlationId?: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly suggestion?: string;
  public readonly metadata?: Record<string, unknown>;
  public override readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    context: ErrorContext = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.operation = context.operation;
    this.correlationId = context.correlationId;
    this.retryable = context.retryable ?? false;
    this.retryAfterMs = context.retryAfterMs;
    this.suggestion = context.suggestion;
    this.metadata = context.metadata;

    captureStackTraceIfAvailable(this, this.constructor);
  }

  /**
   * Creates a user-friendly error message including suggestion if available.
   */
  toUserMessage(): string {
    return this.suggestion === undefined ? this.message : `${this.message}. ${this.suggestion}`;
  }

  /**
   * Formats the error for structured logging.
   */
  toLogFormat(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      operation: this.operation,
      correlationId: this.correlationId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      suggestion: this.suggestion,
      metadata: this.metadata,
      stack: this.stack,
    };
  }
}

// ==================== Derived Error Classes ====================

/**
 * Error for validation failures.
 */
export class ValidationError extends AppError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, true, {
      ...context,
      suggestion: context.suggestion ?? DEFAULT_SUGGESTIONS.VALIDATION,
    });
  }
}

/**
 * Error for authentication failures.
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES.AUTHENTICATION_REQUIRED,
    context: ErrorContext = {}
  ) {
    super(message, ERROR_CODES.AUTHENTICATION_ERROR, HTTP_STATUS.UNAUTHORIZED, true, {
      ...context,
      suggestion: context.suggestion ?? DEFAULT_SUGGESTIONS.AUTHENTICATION,
    });
  }
}

/**
 * Error for authorization failures.
 */
export class AuthorizationError extends AppError {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
    context: ErrorContext = {}
  ) {
    super(message, ERROR_CODES.AUTHORIZATION_ERROR, HTTP_STATUS.FORBIDDEN, true, {
      ...context,
      suggestion: context.suggestion ?? DEFAULT_SUGGESTIONS.AUTHORIZATION,
    });
  }
}

/**
 * Error for resource not found.
 */
export class NotFoundError extends AppError {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES.RESOURCE_NOT_FOUND,
    context: ErrorContext = {}
  ) {
    super(message, ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, true, {
      ...context,
      suggestion: context.suggestion ?? DEFAULT_SUGGESTIONS.NOT_FOUND,
    });
  }
}

/**
 * Error for external service failures (e.g., OpenAI API, Slack API).
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string, context: ErrorContext = {}) {
    const safeService = ensureNonEmptyString(service, DEFAULT_SERVICE_NAME);
    super(
      createExternalServiceMessage(safeService, message),
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      HTTP_STATUS.BAD_GATEWAY,
      true,
      {
        ...context,
        suggestion: context.suggestion ?? createExternalServiceSuggestion(safeService),
        metadata: { service: safeService, ...context.metadata },
      }
    );
    this.service = safeService;
  }
}

/**
 * Error for LLM-related failures with retry information.
 */
export class LLMError extends ExternalServiceError {
  constructor(message: string, context: ErrorContext = {}) {
    super(EXTERNAL_SERVICE_NAMES.OPENAI, message, {
      ...context,
      operation: context.operation ?? DEFAULT_LLM_OPERATION,
      suggestion: context.suggestion ?? DEFAULT_SUGGESTIONS.AI_SERVICE,
    });
  }
}

/**
 * Error for rate limiting.
 */
export class RateLimitError extends AppError {
  constructor(message: string, retryAfterMs: number, context: ErrorContext = {}) {
    const safeRetryMs = Math.max(0, retryAfterMs);
    super(message, ERROR_CODES.EXTERNAL_SERVICE_ERROR, HTTP_STATUS.TOO_MANY_REQUESTS, true, {
      ...context,
      retryable: true,
      retryAfterMs: safeRetryMs,
      suggestion: context.suggestion ?? createRetrySuggestion(safeRetryMs),
    });
  }
}

/**
 * Error for circuit breaker open state.
 */
export class CircuitBreakerOpenError extends ExternalServiceError {
  constructor(service: string, retryAfterMs: number, context: ErrorContext = {}) {
    const safeRetryMs = Math.max(0, retryAfterMs);
    super(service, "Service temporarily unavailable", {
      ...context,
      retryable: true,
      retryAfterMs: safeRetryMs,
      suggestion: context.suggestion ?? createServiceUnavailableSuggestion(safeRetryMs),
    });
  }
}

/**
 * Error for concurrency queue timeout.
 * Thrown when an operation waits too long for a concurrency slot.
 */
export class QueueTimeoutError extends AppError {
  public readonly queueTimeoutMs: number;
  public readonly queueLength: number;

  constructor(queueTimeoutMs: number, queueLength: number, context: ErrorContext = {}) {
    super(
      `Concurrency limiter queue timeout after ${queueTimeoutMs}ms`,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      true,
      {
        ...context,
        retryable: true,
        retryAfterMs: queueTimeoutMs,
        suggestion:
          context.suggestion ?? "The system is under high load. Please try again in a moment.",
        metadata: { queueTimeoutMs, queueLength, ...context.metadata },
      }
    );
    this.queueTimeoutMs = queueTimeoutMs;
    this.queueLength = queueLength;
  }
}

// ==================== Type Guards ====================

/**
 * Type guard to check if error is an AppError instance.
 */
export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/**
 * Type guard to check if error is retryable.
 */
export const isRetryableAppError = (error: unknown): boolean =>
  isAppError(error) && error.retryable;

/**
 * Type guard to check if error is an ExternalServiceError.
 */
export const isExternalServiceError = (error: unknown): error is ExternalServiceError =>
  error instanceof ExternalServiceError;

// ==================== Error Extraction ====================

/**
 * Extracts error message from unknown error.
 * Safely handles Error instances and unknown types.
 */
export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE;

/**
 * Extracts user-friendly message from error.
 * Uses suggestion if available for AppErrors.
 */
export const getUserFriendlyMessage = (error: unknown): string =>
  isAppError(error) ? error.toUserMessage() : getErrorMessage(error);

/**
 * Extracts retry information from error.
 */
export const getRetryInfo = (error: unknown): RetryInfo => {
  if (isAppError(error)) {
    return {
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    };
  }
  return DEFAULT_RETRY_INFO;
};

// ==================== Error Formatting ====================

/**
 * Formats error for logging with consistent structure.
 * Returns an object suitable for structured logging.
 */
export const formatErrorForLog = (error: unknown): Record<string, unknown> => {
  if (isAppError(error)) {
    return error.toLogFormat();
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return { message: String(error) };
};

/**
 * Wraps error with context message.
 * Useful for re-throwing with additional context.
 */
export const wrapError = (context: string, error: unknown): string => {
  const safeContext = ensureNonEmptyString(context, "Error");
  return `${safeContext}: ${getErrorMessage(error)}`;
};

/**
 * Creates a new AppError from an existing error with additional context.
 */
export const enrichError = (error: unknown, context: ErrorContext): AppError => {
  const message = getErrorMessage(error);

  if (isAppError(error)) {
    return new AppError(message, error.code, error.statusCode, error.isOperational, {
      ...context,
      metadata: { ...error.metadata, ...context.metadata },
    });
  }

  return new AppError(
    message,
    ERROR_CODES.INTERNAL_ERROR,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    true,
    context
  );
};

// ==================== Invariant Assertions ====================

/**
 * Asserts a condition is truthy. Throws plain Error for programmer bugs.
 * Use for "should never happen" conditions that indicate a code defect.
 *
 * @param condition - Condition to check
 * @param message - Error message if condition is falsy
 * @throws Error if condition is falsy
 *
 * @example
 * invariant(user !== null, "User must exist after authentication");
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}

/**
 * Exhaustive type checking helper for switch statements.
 * Ensures all union members are handled at compile time.
 *
 * @param value - Should be `never` if all cases are handled
 * @throws Error at runtime if called (indicates unhandled case)
 *
 * @example
 * function handleStatus(status: "pending" | "active" | "completed"): string {
 *   switch (status) {
 *     case "pending": return "Waiting";
 *     case "active": return "Running";
 *     case "completed": return "Done";
 *     default: assertUnreachable(status);
 *   }
 * }
 */
export function assertUnreachable(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
