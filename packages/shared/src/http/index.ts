/**
 * HTTP module - Express middleware, validation, and resilient client utilities.
 */

// Types
export type { CircuitBreakerConfig, CircuitBreakerStatus } from "./types.js";

// Middleware
export { errorHandler, asyncHandler, requestLogger } from "./middleware.js";

// Validation
export { validate, validators, type Validator, type ValidationSchema } from "./validation.js";

// Rate limiting (re-exported from rateLimit module)
export {
  createRateLimiter,
  defaultRateLimiter,
  createRedisRateLimiter,
  defaultRedisRateLimiter,
  secureKeyGenerator,
  type RateLimitOptions,
  type RateLimitInfo,
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
  type ResilientRequestOptions,
  type ResilientResponse,
} from "./resilientClient.js";
