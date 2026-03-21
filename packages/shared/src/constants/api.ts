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
  /** RAG document ingestion endpoint */
  RAG_INGEST: "/api/rag/ingest",
  /** RAG document search endpoint */
  RAG_SEARCH: "/api/rag/search",
  /** RAG statistics endpoint */
  RAG_STATS: "/api/rag/stats",
  /** RAG knowledge documents listing endpoint */
  RAG_DOCUMENTS: "/api/rag/documents",
  /** RAG external source sync endpoint */
  RAG_SYNC: "/api/rag/sync",
  /** RAG tenant data purge endpoint (Express format) */
  RAG_PURGE_TENANT: "/api/rag/tenant/:tenantId",
  /** RAG PR diff chunks purge endpoint (Express format) */
  RAG_PURGE_PR: "/api/rag/pr/:repository/:prNumber",
  /** RAG knowledge doc purge endpoint (Express format) */
  RAG_PURGE_DOC: "/api/rag/doc/:parentId",
  /** RAG single knowledge doc delete endpoint (Express format) */
  RAG_DELETE_DOC_SINGLE: "/api/rag/doc/single/:id",
  /** RAG cost statistics endpoint */
  RAG_COST_STATS: "/api/rag/cost-stats",
  /** RAG tenant tier configuration endpoint (Express format) */
  RAG_TENANT_TIER: "/api/rag/tenant/:tenantId/tier",
  /** RAG test suite execution endpoint */
  RAG_TEST_SUITE: "/api/rag/test-suite",
  /** RAG drift report endpoint */
  RAG_DRIFT_REPORT: "/api/rag/drift-report",
  /** RAG metric bounds check endpoint */
  RAG_CHECK_METRIC: "/api/rag/check-metric",
  /** RAG staleness check endpoint */
  RAG_STALENESS: "/api/rag/staleness",
  /** RAG cleanup endpoint */
  RAG_CLEANUP: "/api/rag/cleanup",
  /** RAG health check endpoint */
  RAG_HEALTH: "/api/rag/health",
  /** RAG metrics endpoint */
  RAG_METRICS: "/api/rag/metrics",
  /** RAG evaluation metrics endpoint */
  RAG_EVALUATION: "/api/rag/evaluation",
  /** RAG embedding cache stats endpoint */
  RAG_CACHE_STATS: "/api/rag/cache/stats",
  /** RAG embedding cache clear endpoint */
  RAG_CACHE_CLEAR: "/api/rag/cache/clear",
  /** RAG cost estimation endpoint */
  RAG_COST_ESTIMATE: "/api/rag/cost/estimate",
  /** RAG re-embedding trigger endpoint */
  RAG_REEMBED: "/api/rag/reembed",
  /** RAG test case seeding endpoint */
  RAG_SEED_TEST_CASES: "/api/rag/seed-test-cases",
  /** RAG relationship detection endpoint */
  RAG_DETECT_RELATIONSHIPS: "/api/rag/detect-relationships",
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

export type { HealthStatus, ApiResponseStatus } from "./types.js";

/**
 * Memory usage threshold percentages for health checks.
 */
export const MEMORY_THRESHOLDS = {
  /** Heap usage percentage that triggers degraded status */
  WARNING: 95,
  /** Heap usage percentage that triggers unhealthy status */
  CRITICAL: 99,
  /** Bytes per megabyte for memory conversions */
  BYTES_PER_MB: 1024 * 1024,
  /** Multiplier to convert decimal to percentage */
  PERCENT_MULTIPLIER: 100,
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

/**
 * Default pagination values for API routes.
 */
export const API_PAGINATION_DEFAULTS = {
  /** Default limit for list queries */
  DEFAULT_LIMIT: 100,
  /** Default offset for list queries */
  DEFAULT_OFFSET: 0,
} as const;

/**
 * Dashboard-specific pagination defaults.
 */
export const DASHBOARD_PAGINATION = {
  /** Default items per page for dashboard list endpoints */
  DEFAULT_LIMIT: 20,
  /** Maximum items per page */
  MAX_LIMIT: 200,
  /** Maximum event IDs in a single batch lookup */
  MAX_BATCH_SIZE: 100,
  /** Minimum length for a valid commit SHA prefix in correlation lookups */
  MIN_COMMIT_SHA_LENGTH: 7,
} as const;

// ==================== Chat Constants ====================

/**
 * Chat Copilot Drawer configuration defaults.
 */
export const CHAT_DEFAULTS = {
  /** Maximum user message length to prevent abuse */
  MAX_MESSAGE_LENGTH: 10_000,
  /** Default limit for conversation listing */
  DEFAULT_CONVERSATIONS_LIMIT: 50,
  /** Default limit for message listing */
  DEFAULT_MESSAGES_LIMIT: 100,
  /** Maximum allowed limit for any chat pagination */
  MAX_LIMIT: 200,
  /** Maximum historical messages to include in LLM context window */
  MAX_HISTORY_MESSAGES: 20,
  /** Maximum length for auto-generated conversation title */
  MAX_TITLE_LENGTH: 80,
  /** Maximum total tokens for conversation context before trimming */
  MAX_CONTEXT_TOKENS: 24_000,
  /** Minimum messages to keep even when trimming (system + last exchange) */
  MIN_MESSAGES_TO_KEEP: 4,
  /** Approximate characters per token for estimation */
  CHARS_PER_TOKEN: 4,
  /** Maximum number of messages to trim per cycle to avoid deleting everything */
  MAX_TRIM_BATCH: 10,
  /** Maximum content length for entity details injected into chat prompt */
  MAX_CONTEXT_DETAILS_LENGTH: 2000,
  /** Maximum RAG results to include in chat context */
  MAX_RAG_RESULTS: 5,
  /** Maximum content length for a single RAG doc in formatted output */
  MAX_RAG_DOC_CONTENT: 500,
  /** Similarity percentage multiplier for display formatting */
  RAG_PERCENTAGE_MULTIPLIER: 100,
} as const;

// ==================== GitHub API Constants ====================

/**
 * GitHub API configuration.
 */
export const GITHUB_API_CONFIG = {
  /** GitHub REST API base URL */
  BASE_URL: "https://api.github.com",
  /** Default issues per page for list requests */
  ISSUES_PER_PAGE: 30,
} as const;
