/**
 * HTTP and error-related constants for the Kenchi codebase.
 */

/**
 * HTTP status codes.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
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
 * These are used in API JSON responses and should be clear but concise.
 */
export const DEFAULT_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: "Authentication required. Please provide valid credentials.",
  INSUFFICIENT_PERMISSIONS: "Insufficient permissions to perform this action.",
  RESOURCE_NOT_FOUND: "The requested resource was not found.",
  UNEXPECTED_ERROR:
    "An unexpected error occurred. Please try again or contact support if the issue persists.",
  UNKNOWN_ERROR: "An unknown error occurred. Please try again.",
  OPERATION_TIMEOUT:
    "The operation timed out. Please try again with a smaller request or check your connection.",
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
  OPENROUTER: "OpenRouter",
} as const;

/**
 * Internal service identifiers for logging and configuration.
 */
export const SERVICE_NAMES = {
  API: "api",
  SLACK_BOT: "slack-bot",
  GITHUB_APP: "github-app",
  INCIDENT_TRIAGE: "incident-triage",
} as const;

/**
 * Service version strings for health checks.
 */
export const SERVICE_VERSIONS = {
  API: "1.0.0",
  SLACK_BOT: "1.0.0",
  GITHUB_APP: "1.0.0",
  INCIDENT_TRIAGE: "1.0.0",
} as const;

/**
 * Express middleware configuration.
 */
export const EXPRESS_CONFIG = {
  /** Maximum JSON body size for large CI context payloads */
  JSON_BODY_LIMIT: "5mb",
  /** Maximum JSON body size for Slack bot (smaller to prevent abuse) */
  SLACK_BOT_JSON_LIMIT: "1mb",
} as const;

/**
 * Server timeout configuration for slowloris attack protection.
 * These values should match or slightly exceed your load balancer timeouts.
 */
export const SERVER_TIMEOUTS = {
  /** Keep-alive timeout in milliseconds (65 seconds - slightly above typical LB timeout) */
  KEEP_ALIVE_MS: 65000,
  /** Headers timeout in milliseconds (must be greater than keep-alive) */
  HEADERS_MS: 66000,
  /** Request timeout in milliseconds (2 minutes for long-running requests) */
  REQUEST_MS: 120000,
} as const;
