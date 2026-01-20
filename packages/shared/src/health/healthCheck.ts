/**
 * Health Check Utilities
 *
 * Provides comprehensive health check functionality for all services.
 * Includes checks for database, Redis, circuit breakers, and memory.
 *
 * @module health/healthCheck
 */

import { isDatabaseHealthy } from "../database/client/index.js";
import { isRedisHealthy } from "../queue/redisClient.js";
import { getCircuitStatus, SERVICE_KEYS } from "../http/circuitBreaker.js";
import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { HEALTH_STATUS, MEMORY_THRESHOLDS } from "../constants/index.js";
import type {
  HealthStatus,
  ComponentHealth,
  MemoryHealth,
  ServiceHealth,
  HealthCheckConfig,
} from "../core/types.js";

export type { HealthStatus, ComponentHealth, MemoryHealth, ServiceHealth, HealthCheckConfig };

// ==================== Constants ====================

const BYTES_PER_MB = 1024 * 1024;
const PERCENT_MULTIPLIER = 100;

// ==================== Memory Health ====================

/**
 * Gets current memory usage information.
 */
export const getMemoryHealth = (): MemoryHealth => {
  const usage = process.memoryUsage();
  const heapUsedPercent = Math.round((usage.heapUsed / usage.heapTotal) * PERCENT_MULTIPLIER);

  return {
    heapUsed: Math.round(usage.heapUsed / BYTES_PER_MB),
    heapTotal: Math.round(usage.heapTotal / BYTES_PER_MB),
    heapUsedPercent,
    rss: Math.round(usage.rss / BYTES_PER_MB),
    external: Math.round(usage.external / BYTES_PER_MB),
  };
};

/**
 * Checks if memory usage is healthy based on heap usage thresholds.
 */
export const checkMemoryStatus = (): ComponentHealth => {
  const memory = getMemoryHealth();
  const details: Record<string, unknown> = { ...memory };

  if (memory.heapUsedPercent >= MEMORY_THRESHOLDS.CRITICAL) {
    return {
      name: "memory",
      status: HEALTH_STATUS.UNHEALTHY,
      message: `Heap usage critical: ${memory.heapUsedPercent}%`,
      details,
    };
  }

  if (memory.heapUsedPercent >= MEMORY_THRESHOLDS.WARNING) {
    return {
      name: "memory",
      status: HEALTH_STATUS.DEGRADED,
      message: `Heap usage high: ${memory.heapUsedPercent}%`,
      details,
    };
  }

  return {
    name: "memory",
    status: HEALTH_STATUS.HEALTHY,
    message: `Heap usage: ${memory.heapUsedPercent}%`,
    details,
  };
};

// ==================== Database Health ====================

/**
 * Checks database connectivity with latency measurement.
 */
export const checkDatabaseHealth = async (): Promise<ComponentHealth> => {
  const startTime = Date.now();

  try {
    const isHealthy = await isDatabaseHealthy();
    const latencyMs = Date.now() - startTime;

    return {
      name: "database",
      status: isHealthy ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.UNHEALTHY,
      message: isHealthy ? "PostgreSQL connection OK" : "PostgreSQL connection failed",
      latencyMs,
    };
  } catch (error) {
    return {
      name: "database",
      status: HEALTH_STATUS.UNHEALTHY,
      message: getErrorMessage(error),
      latencyMs: Date.now() - startTime,
    };
  }
};

// ==================== Redis Health ====================

/**
 * Checks Redis connectivity with latency measurement.
 * Returns degraded (not unhealthy) since Redis is optional with fallback.
 */
export const checkRedisHealth = async (): Promise<ComponentHealth> => {
  const startTime = Date.now();

  try {
    const isHealthy = await isRedisHealthy();
    const latencyMs = Date.now() - startTime;

    return {
      name: "redis",
      status: isHealthy ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.DEGRADED,
      message: isHealthy ? "Redis connection OK" : "Redis connection failed, using fallback",
      latencyMs,
    };
  } catch (error) {
    return {
      name: "redis",
      status: HEALTH_STATUS.DEGRADED,
      message: getErrorMessage(error),
      latencyMs: Date.now() - startTime,
    };
  }
};

// ==================== Circuit Breaker Health ====================

/**
 * Checks circuit breaker status for a specific service.
 */
export const checkCircuitBreakerHealth = (
  serviceKey: string,
  displayName: string
): ComponentHealth => {
  const status = getCircuitStatus(serviceKey);
  const name = `circuit:${displayName.toLowerCase()}`;

  if (status.isOpen) {
    return {
      name,
      status: HEALTH_STATUS.DEGRADED,
      message: `Circuit breaker open (${status.failures} failures)`,
      details: { state: status.state, failures: status.failures, lastFailure: status.lastFailure },
    };
  }

  if (status.failures > 0) {
    return {
      name,
      status: HEALTH_STATUS.HEALTHY,
      message: `Circuit closed (${status.failures} recent failures)`,
      details: { state: status.state, failures: status.failures },
    };
  }

  return {
    name,
    status: HEALTH_STATUS.HEALTHY,
    message: "Circuit breaker closed",
    details: { state: status.state },
  };
};

/**
 * Checks all known circuit breakers (OpenAI, GitHub, Slack).
 */
export const checkAllCircuitBreakers = (): ComponentHealth[] => [
  checkCircuitBreakerHealth(SERVICE_KEYS.OPENAI, "OpenAI"),
  checkCircuitBreakerHealth(SERVICE_KEYS.GITHUB, "GitHub"),
  checkCircuitBreakerHealth(SERVICE_KEYS.SLACK, "Slack"),
];

// ==================== Aggregate Health Check ====================

/**
 * Determines overall status from component statuses.
 */
const aggregateStatus = (components: readonly ComponentHealth[]): HealthStatus => {
  const hasUnhealthy = components.some((c) => c.status === HEALTH_STATUS.UNHEALTHY);
  if (hasUnhealthy) {
    return HEALTH_STATUS.UNHEALTHY;
  }

  const hasDegraded = components.some((c) => c.status === HEALTH_STATUS.DEGRADED);
  if (hasDegraded) {
    return HEALTH_STATUS.DEGRADED;
  }

  return HEALTH_STATUS.HEALTHY;
};

/**
 * Creates a fallback component health for failed checks.
 */
const createFallbackHealth = (
  name: string,
  status: HealthStatus,
  error: unknown
): ComponentHealth => ({
  name,
  status,
  message: `Health check failed: ${getErrorMessage(error)}`,
});

/**
 * Safely executes a health check with error handling.
 */
const safeHealthCheck = async (
  check: () => Promise<ComponentHealth>,
  fallbackName: string,
  fallbackStatus: HealthStatus
): Promise<ComponentHealth> => {
  try {
    return await check();
  } catch (error) {
    return createFallbackHealth(fallbackName, fallbackStatus, error);
  }
};

/**
 * Performs a comprehensive health check for the service.
 */
export const performHealthCheck = async (
  healthConfig: HealthCheckConfig
): Promise<ServiceHealth> => {
  const startTime = Date.now();
  const logger = createLogger("health-check");

  // Determine which checks to run (default to true if not specified)
  const shouldCheckDatabase = healthConfig.includeDatabase ?? true;
  const shouldCheckRedis = healthConfig.includeRedis ?? true;
  const shouldCheckCircuitBreakers = healthConfig.includeCircuitBreakers ?? true;

  // Run async checks in parallel
  const [databaseResult, redisResult] = await Promise.all([
    shouldCheckDatabase
      ? safeHealthCheck(checkDatabaseHealth, "database", HEALTH_STATUS.UNHEALTHY)
      : null,
    shouldCheckRedis ? safeHealthCheck(checkRedisHealth, "redis", HEALTH_STATUS.DEGRADED) : null,
  ]);

  // Build sync checks based on config
  const circuitBreakerChecks = shouldCheckCircuitBreakers ? checkAllCircuitBreakers() : [];
  const syncChecks = [checkMemoryStatus(), ...circuitBreakerChecks];

  // Combine all components (filter out null results)
  const asyncResults = [databaseResult, redisResult].filter(
    (result): result is ComponentHealth => result !== null
  );
  const components = [...syncChecks, ...asyncResults];
  const status = aggregateStatus(components);

  const totalLatency = Date.now() - startTime;

  logger.debug("Health check completed", {
    status,
    latencyMs: totalLatency,
    componentCount: components.length,
  });

  return {
    status,
    service: healthConfig.serviceName,
    version: healthConfig.version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: healthConfig.environment,
    components,
    memory: getMemoryHealth(),
  };
};

/**
 * Simple liveness check - just confirms process is running.
 */
export const livenessCheck = (): { status: "ok"; timestamp: string } => ({
  status: "ok",
  timestamp: new Date().toISOString(),
});

/**
 * Readiness check - confirms service can accept requests.
 * Returns false if any critical component is unhealthy.
 */
export const readinessCheck = async (
  readinessConfig: Omit<HealthCheckConfig, "includeCircuitBreakers">
): Promise<{ ready: boolean; reason?: string }> => {
  const health = await performHealthCheck({
    ...readinessConfig,
    includeCircuitBreakers: false,
  });

  if (health.status === HEALTH_STATUS.UNHEALTHY) {
    const unhealthyNames = health.components
      .filter((component) => component.status === HEALTH_STATUS.UNHEALTHY)
      .map((component) => component.name);

    return {
      ready: false,
      reason: `Unhealthy components: ${unhealthyNames.join(", ")}`,
    };
  }

  return { ready: true };
};
