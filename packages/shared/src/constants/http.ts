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
  UNKNOWN_ERROR: "Unknown error",
  OPERATION_TIMEOUT: "Operation timed out",
} as const;

/**
 * Validation error messages.
 */
export const VALIDATION_MESSAGES = {
  REQUIRED: "is required",
  MUST_BE_STRING: "must be a string",
  MUST_BE_NUMBER: "must be a number",
  MUST_BE_EMAIL: "must be a valid email",
} as const;

/**
 * Rate limiting messages.
 */
export const RATE_LIMIT_MESSAGES = {
  TOO_MANY_REQUESTS: "Too many requests, please try again later",
} as const;

/**
 * External service names.
 */
export const EXTERNAL_SERVICE_NAMES = {
  OPENAI: "OpenAI",
} as const;

/**
 * Internal service identifiers for logging and configuration.
 */
export const SERVICE_NAMES = {
  API: "api",
  SLACK_BOT: "slack-bot",
  GITHUB_APP: "github-app",
} as const;

/**
 * Express middleware configuration.
 */
export const EXPRESS_CONFIG = {
  /** Maximum JSON body size for large CI context payloads */
  JSON_BODY_LIMIT: "5mb",
} as const;
