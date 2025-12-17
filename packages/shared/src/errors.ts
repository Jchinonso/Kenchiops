/**
 * Custom error classes for better error handling and type safety.
 */

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
    statusCode: number = 500,
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
    super(message, "VALIDATION_ERROR", 400, true, metadata);
  }
}

/**
 * Error for authentication/authorization failures.
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required", metadata?: Record<string, unknown>) {
    super(message, "AUTHENTICATION_ERROR", 401, true, metadata);
  }
}

/**
 * Error for authorization failures.
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Insufficient permissions", metadata?: Record<string, unknown>) {
    super(message, "AUTHORIZATION_ERROR", 403, true, metadata);
  }
}

/**
 * Error for resource not found.
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found", metadata?: Record<string, unknown>) {
    super(message, "NOT_FOUND", 404, true, metadata);
  }
}

/**
 * Error for external service failures (e.g., OpenAI API, Slack API).
 */
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      `External service error (${service}): ${message}`,
      "EXTERNAL_SERVICE_ERROR",
      502,
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
    super("OpenAI", message, metadata);
  }
}

/**
 * Error handler utility for Express.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

