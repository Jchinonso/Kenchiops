/**
 * Health Check Module
 *
 * Provides comprehensive health check utilities for all services.
 */

export {
  // Types (HealthStatus is re-exported from constants for consistency)
  type ComponentHealth,
  type ServiceHealth,
  type MemoryHealth,
  type HealthCheckConfig,
  // Health check functions
  getMemoryHealth,
  checkMemoryStatus,
  checkDatabaseHealth,
  checkRedisHealth,
  checkCircuitBreakerHealth,
  checkAllCircuitBreakers,
  performHealthCheck,
  livenessCheck,
  readinessCheck,
} from "./healthCheck.js";
