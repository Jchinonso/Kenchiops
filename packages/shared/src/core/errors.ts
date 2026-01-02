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
} from "../constants/index.js";

// ==================== Types ====================

/**
 * Error context for enriched error reporting.
 */
export interface ErrorContext {
  /** What operation was being performed */
  readonly operation?: string;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Whether the error is retryable */
  readonly retryable?: boolean;
  /** When to retry (milliseconds) */
  readonly retryAfterMs?: number;
  /** User-friendly suggestion */
  readonly suggestion?: string;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

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
  public readonly cause?: Error;

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

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Creates a user-friendly error message including suggestion if available.
   */
  toUserMessage(): string {
    return this.suggestion ? `${this.message}. ${this.suggestion}` : this.message;
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
      suggestion: context.suggestion ?? "Please check your input and try again",
    });
  }
}

/**
 * Error for authentication/authorization failures.
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES.AUTHENTICATION_REQUIRED,
    context: ErrorContext = {}
  ) {
    super(message, ERROR_CODES.AUTHENTICATION_ERROR, HTTP_STATUS.UNAUTHORIZED, true, {
      ...context,
      suggestion: context.suggestion ?? "Please check your credentials and try again",
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
      suggestion: context.suggestion ?? "Contact your administrator for access",
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
      suggestion:
        context.suggestion ?? "Please verify the resource exists and check the identifier.",
    });
  }
}

/**
 * Error for external service failures (e.g., OpenAI API, Slack API).
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string, context: ErrorContext = {}) {
    super(
      `External service error (${service}): ${message}`,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      HTTP_STATUS.BAD_GATEWAY,
      true,
      {
        ...context,
        suggestion:
          context.suggestion ??
          `The ${service} service encountered an issue. Please try again in a few moments.`,
        metadata: { service, ...context.metadata },
      }
    );
    this.service = service;
  }
}

/**
 * Error for LLM-related failures with retry information.
 */
export class LLMError extends ExternalServiceError {
  constructor(message: string, context: ErrorContext = {}) {
    super(EXTERNAL_SERVICE_NAMES.OPENAI, message, {
      ...context,
      operation: context.operation ?? "AI analysis",
      suggestion:
        context.suggestion ??
        "The AI analysis service is temporarily unavailable. Please try again in a few moments.",
    });
  }
}

/**
 * Error for rate limiting.
 */
export class RateLimitError extends AppError {
  constructor(message: string, retryAfterMs: number, context: ErrorContext = {}) {
    super(message, ERROR_CODES.EXTERNAL_SERVICE_ERROR, 429, true, {
      ...context,
      retryable: true,
      retryAfterMs,
      suggestion:
        context.suggestion ?? `Please try again in ${Math.ceil(retryAfterMs / 1000)} seconds`,
    });
  }
}

/**
 * Error for circuit breaker open state.
 */
export class CircuitBreakerOpenError extends ExternalServiceError {
  constructor(service: string, retryAfterMs: number, context: ErrorContext = {}) {
    super(service, `Service temporarily unavailable`, {
      ...context,
      retryable: true,
      retryAfterMs,
      suggestion: `The service is experiencing issues. Please try again in ${Math.ceil(retryAfterMs / 1000)} seconds`,
    });
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
 * Extract error message from unknown error.
 * Safely handles Error instances and unknown types.
 */
export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

/**
 * Extract user-friendly message from error.
 * Uses suggestion if available for AppErrors.
 */
export const getUserFriendlyMessage = (error: unknown): string => {
  if (isAppError(error)) {
    return error.toUserMessage();
  }
  return getErrorMessage(error);
};

/**
 * Extract retry information from error.
 */
export const getRetryInfo = (error: unknown): { retryable: boolean; retryAfterMs?: number } => {
  if (isAppError(error)) {
    return {
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    };
  }
  return { retryable: false };
};

// ==================== Error Formatting ====================

/**
 * Format error for logging with consistent structure.
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
 * Wrap error with context message.
 * Useful for re-throwing with additional context.
 */
export const wrapError = (context: string, error: unknown): string =>
  `${context}: ${getErrorMessage(error)}`;

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
