/**
 * HTTP module - Express middleware, validation, and resilient client utilities.
 */

// Types (all type exports from the canonical types.ts)
export type {
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  HttpMethod,
  ResilientRequestOptions,
  ResilientResponse,
  Validator,
  ValidationSchema,
  ValidationSource,
} from "./types.js";

// Middleware
export { errorHandler, asyncHandler, requestLogger } from "./middleware.js";

// Validation
export { validate, validators } from "./validation.js";

// Rate limiting (re-exported from rateLimit module)
export {
  createRateLimiter,
  defaultRateLimiter,
  createRedisRateLimiter,
  defaultRedisRateLimiter,
  createRateLimitMiddleware,
  createProductionRateLimitMiddleware,
  secureKeyGenerator,
  type RateLimitOptions,
  type RateLimitInfo,
  type RateLimitMiddlewareConfig,
} from "../rateLimit/index.js";

// Generic circuit breaker pattern
export {
  withCircuitBreaker,
  getCircuitStatus,
  resetCircuit,
  resetAllCircuits,
  getAllCircuitStatus,
  SERVICE_KEYS,
} from "./circuitBreaker.js";

// Resilient HTTP client with retry and circuit breaker
export {
  resilientFetch,
  resilientGet,
  resilientPost,
  resilientPut,
  resilientPatch,
  resilientDelete,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
} from "./resilientClient.js";
