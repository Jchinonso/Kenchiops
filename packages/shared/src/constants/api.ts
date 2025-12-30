/**
 * API service constants for routes, response messages, and status values.
 * All API-related hardcoded strings should be centralized here.
 */

/**
 * API route paths for consistent routing across the codebase.
 */
export const API_ROUTES = {
  /** Health check endpoint */
  HEALTH: "/health",
  /** Alternative health check path */
  API_HEALTH: "/api/health",
  /** CI failure analysis endpoint */
  ANALYZE: "/api/analyze",
  /** Event ingestion endpoint */
  EVENTS: "/events",
  /** Generic webhook endpoint with source parameter (Express format) */
  WEBHOOK: "/webhook/:source",
} as const;

/**
 * API route paths in OpenAPI/Swagger format (uses {param} instead of :param).
 */
export const SWAGGER_ROUTES = {
  HEALTH: API_ROUTES.HEALTH,
  API_HEALTH: API_ROUTES.API_HEALTH,
  ANALYZE: API_ROUTES.ANALYZE,
  EVENTS: API_ROUTES.EVENTS,
  /** Webhook endpoint in Swagger format */
  WEBHOOK: "/webhook/{source}",
} as const;

/**
 * Set of paths to skip for rate limiting (health checks for monitoring).
 */
export const RATE_LIMIT_SKIP_PATHS: ReadonlySet<string> = new Set([
  API_ROUTES.HEALTH,
  API_ROUTES.API_HEALTH,
]);

/**
 * Health check response status values.
 */
export const HEALTH_STATUS = {
  OK: "ok",
  ERROR: "error",
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNHEALTHY: "unhealthy",
} as const;

/** Type for health status values (legacy: "ok" | "error", new: "healthy" | "degraded" | "unhealthy") */
export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

/**
 * Memory usage threshold percentages for health checks.
 */
export const MEMORY_THRESHOLDS = {
  /** Heap usage percentage that triggers degraded status */
  WARNING: 95,
  /** Heap usage percentage that triggers unhealthy status */
  CRITICAL: 99,
} as const;

/**
 * API response status values for webhook and event endpoints.
 */
export const API_RESPONSE_STATUS = {
  ACCEPTED: "accepted",
  RECEIVED: "received",
  SUCCESS: "success",
  ERROR: "error",
} as const;

/** Type for API response status values */
export type ApiResponseStatus = (typeof API_RESPONSE_STATUS)[keyof typeof API_RESPONSE_STATUS];

/**
 * API response messages for standard responses.
 */
export const API_MESSAGES = {
  /** Event processing placeholder */
  EVENT_PROCESSING_PENDING: "TODO: Implement event processing and storage",
  /** Webhook processing placeholder */
  WEBHOOK_PROCESSING_PENDING: "TODO: Implement webhook processing logic",
  /** Rate limit exceeded message for API service */
  RATE_LIMIT_EXCEEDED: "Too many requests to API, please try again later",
} as const;

/**
 * Redis key prefixes for API service.
 */
export const API_REDIS_PREFIXES = {
  RATE_LIMIT: "rl:api:",
} as const;

/**
 * Logging context keys for structured logging.
 */
export const API_LOG_CONTEXT = {
  CONTENT_TYPE: "contentType",
  BODY_TYPE: "bodyType",
  BODY_KEYS: "bodyKeys",
  HAS_FAILURE_LOG: "hasFailureLog",
  HAS_REPOSITORY: "hasRepository",
  RAW_BODY: "rawBody",
  SOURCE: "source",
  PAYLOAD_KEYS: "payloadKeys",
  TYPE: "type",
  TIMESTAMP: "timestamp",
} as const;

/**
 * Maximum length for raw body preview in logs.
 * Set to high value to capture full payloads during development.
 * Adjust based on observed log output to balance debugging vs. log size.
 */
export const API_LOG_LIMITS = {
  /** No truncation - capture full payload for debugging */
  RAW_BODY_PREVIEW_LENGTH: 10000,
} as const;

/**
 * Request body field names.
 */
export const API_REQUEST_FIELDS = {
  FAILURE_LOG: "failure_log",
  REPOSITORY: "repository",
  COMMIT: "commit",
  SOURCE: "source",
  TYPE: "type",
} as const;

/**
 * Check if a path should skip rate limiting.
 * @param path - The request path to check
 * @returns True if the path should skip rate limiting
 */
export const shouldSkipRateLimit = (path: string): boolean => RATE_LIMIT_SKIP_PATHS.has(path);
