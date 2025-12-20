/**
 * Custom error classes for better error handling and type safety.
 */

import { ERROR_CODES, HTTP_STATUS, DEFAULT_ERROR_MESSAGES, SERVICE_NAMES } from "./constants.js";

/**
 * Base error class for application-specific errors.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error for validation failures.
 */
export class ValidationError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, true, metadata);
  }
}

/**
 * Error for authentication/authorization failures.
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES.AUTHENTICATION_REQUIRED,
    metadata?: Record<string, unknown>
  ) {
    super(message, ERROR_CODES.AUTHENTICATION_ERROR, HTTP_STATUS.UNAUTHORIZED, true, metadata);
  }
}

/**
 * Error for authorization failures.
 */
export class AuthorizationError extends AppError {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
    metadata?: Record<string, unknown>
  ) {
    super(message, ERROR_CODES.AUTHORIZATION_ERROR, HTTP_STATUS.FORBIDDEN, true, metadata);
  }
}

/**
 * Error for resource not found.
 */
export class NotFoundError extends AppError {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES.RESOURCE_NOT_FOUND,
    metadata?: Record<string, unknown>
  ) {
    super(message, ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND, true, metadata);
  }
}

/**
 * Error for external service failures (e.g., OpenAI API, Slack API).
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, metadata?: Record<string, unknown>) {
    super(
      `External service error (${service}): ${message}`,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      HTTP_STATUS.BAD_GATEWAY,
      true,
      { service, ...metadata }
    );
  }
}

/**
 * Error for LLM-related failures.
 */
export class LLMError extends ExternalServiceError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(SERVICE_NAMES.OPENAI, message, metadata);
  }
}

/**
 * Type guard to check if error is an AppError instance.
 */
export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError;
};

/**
 * Extract error message from unknown error.
 * Safely handles Error instances and unknown types.
 */
export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

/**
 * Format error for logging with consistent structure.
 * Returns an object suitable for structured logging.
 */
export const formatErrorForLog = (
  error: unknown
): { message: string; name?: string; stack?: string } => {
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
