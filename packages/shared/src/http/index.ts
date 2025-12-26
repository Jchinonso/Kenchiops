/**
 * HTTP module - Express middleware, validation, and resilient client utilities.
 */

// Middleware
export { errorHandler, asyncHandler, requestLogger } from "./middleware.js";

// Validation
export { validate, validators, type Validator, type ValidationSchema } from "./validation.js";

// Rate limiting
export {
  createRateLimiter,
  defaultRateLimiter,
  createRedisRateLimiter,
  defaultRedisRateLimiter,
  type RateLimitOptions,
  type RateLimitInfo,
} from "./rateLimit.js";

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
