/**
 * HTTP and error-related constants for the Kenchi codebase.
 */

/**
 * HTTP status codes.
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
} as const;

/**
 * Error codes for application errors.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * Default error messages for common error types.
 */
export const DEFAULT_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: "Authentication required",
  INSUFFICIENT_PERMISSIONS: "Insufficient permissions",
  RESOURCE_NOT_FOUND: "Resource not found",
  UNEXPECTED_ERROR: "An unexpected error occurred",
} as const;

/**
 * External service names.
 */
export const SERVICE_NAMES = {
  OPENAI: "OpenAI",
} as const;
