/**
 * Health Check Utilities
 *
 * Provides comprehensive health check functionality for all services.
 * Includes checks for:
 * - Database connectivity
 * - Redis connectivity
 * - External service circuit breakers
 * - Memory usage
 * - System resources
 *
 * @module health/healthCheck
 */

import { isDatabaseHealthy } from "../database/client.js";
import { isRedisHealthy } from "../queue/redisClient.js";
import { getCircuitStatus, SERVICE_KEYS } from "../http/circuitBreaker.js";
import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { HEALTH_STATUS, MEMORY_THRESHOLDS } from "../constants/index.js";

const logger = createLogger("health-check");

// ==================== Types ====================

/**
 * Health status values (healthy, degraded, unhealthy)
 */
export type HealthStatus =
  | typeof HEALTH_STATUS.HEALTHY
  | typeof HEALTH_STATUS.DEGRADED
  | typeof HEALTH_STATUS.UNHEALTHY;

/**
 * Individual component health check result
 */
export interface ComponentHealth {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly latencyMs?: number;
  readonly details?: Record<string, unknown>;
}

/**
 * Overall service health response
 */
export interface ServiceHealth {
  readonly status: HealthStatus;
  readonly service: string;
  readonly version: string;
  readonly timestamp: string;
  readonly uptime: number;
  readonly environment: string;
  readonly components: ComponentHealth[];
  readonly memory: MemoryHealth;
}

/**
 * Memory health information
 */
export interface MemoryHealth {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly heapUsedPercent: number;
  readonly rss: number;
  readonly external: number;
}

// ==================== Memory Health ====================

/**
 * Gets current memory usage information.
 *
 * @returns Memory health metrics including heap usage percentages
 */
export const getMemoryHealth = (): MemoryHealth => {
  const usage = process.memoryUsage();
  const heapUsedPercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);

  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    heapUsedPercent,
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
};

/**
 * Converts memory health to record for component details.
 */
const memoryToRecord = (memory: MemoryHealth): Record<string, unknown> => ({
  heapUsed: memory.heapUsed,
  heapTotal: memory.heapTotal,
  heapUsedPercent: memory.heapUsedPercent,
  rss: memory.rss,
  external: memory.external,
});

/**
 * Checks if memory usage is healthy based on heap usage thresholds.
 *
 * @returns Component health status for memory
 */
export const checkMemoryStatus = (): ComponentHealth => {
  const memory = getMemoryHealth();

  if (memory.heapUsedPercent >= MEMORY_THRESHOLDS.CRITICAL) {
    return {
      name: "memory",
      status: HEALTH_STATUS.UNHEALTHY,
      message: `Heap usage critical: ${memory.heapUsedPercent}%`,
      details: memoryToRecord(memory),
    };
  }

  if (memory.heapUsedPercent >= MEMORY_THRESHOLDS.WARNING) {
    return {
      name: "memory",
      status: HEALTH_STATUS.DEGRADED,
      message: `Heap usage high: ${memory.heapUsedPercent}%`,
      details: memoryToRecord(memory),
    };
  }

  return {
    name: "memory",
    status: HEALTH_STATUS.HEALTHY,
    message: `Heap usage: ${memory.heapUsedPercent}%`,
    details: memoryToRecord(memory),
  };
};

// ==================== Database Health ====================

/**
 * Checks database connectivity with latency measurement.
 *
 * @returns Component health status for database
 */
export const checkDatabaseHealth = async (): Promise<ComponentHealth> => {
  const startTime = Date.now();

  try {
    const isHealthy = await isDatabaseHealthy();
    const latencyMs = Date.now() - startTime;

    if (isHealthy) {
      return {
        name: "database",
        status: HEALTH_STATUS.HEALTHY,
        message: "PostgreSQL connection OK",
        latencyMs,
      };
    }

    return {
      name: "database",
      status: HEALTH_STATUS.UNHEALTHY,
      message: "PostgreSQL connection failed",
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      name: "database",
      status: HEALTH_STATUS.UNHEALTHY,
      message: getErrorMessage(error),
      latencyMs,
    };
  }
};

// ==================== Redis Health ====================

/**
 * Checks Redis connectivity with latency measurement.
 * Returns degraded (not unhealthy) since Redis is optional with fallback.
 *
 * @returns Component health status for Redis
 */
export const checkRedisHealth = async (): Promise<ComponentHealth> => {
  const startTime = Date.now();

  try {
    const isHealthy = await isRedisHealthy();
    const latencyMs = Date.now() - startTime;

    if (isHealthy) {
      return {
        name: "redis",
        status: HEALTH_STATUS.HEALTHY,
        message: "Redis connection OK",
        latencyMs,
      };
    }

    return {
      name: "redis",
      status: HEALTH_STATUS.DEGRADED,
      message: "Redis connection failed, using fallback",
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      name: "redis",
      status: HEALTH_STATUS.DEGRADED,
      message: getErrorMessage(error),
      latencyMs,
    };
  }
};

// ==================== Circuit Breaker Health ====================

/**
 * Checks circuit breaker status for a specific service.
 *
 * @param serviceKey - The service identifier used in circuit breaker registry
 * @param displayName - Human-readable name for the component
 * @returns Component health status for the circuit breaker
 */
export const checkCircuitBreakerHealth = (
  serviceKey: string,
  displayName: string
): ComponentHealth => {
  const status = getCircuitStatus(serviceKey);

  if (status.isOpen) {
    return {
      name: `circuit:${displayName.toLowerCase()}`,
      status: HEALTH_STATUS.DEGRADED,
      message: `Circuit breaker open (${status.failures} failures)`,
      details: {
        state: status.state,
        failures: status.failures,
        lastFailure: status.lastFailure,
      },
    };
  }

  if (status.failures > 0) {
    return {
      name: `circuit:${displayName.toLowerCase()}`,
      status: HEALTH_STATUS.HEALTHY,
      message: `Circuit closed (${status.failures} recent failures)`,
      details: {
        state: status.state,
        failures: status.failures,
      },
    };
  }

  return {
    name: `circuit:${displayName.toLowerCase()}`,
    status: HEALTH_STATUS.HEALTHY,
    message: "Circuit breaker closed",
    details: { state: status.state },
  };
};

/**
 * Checks all known circuit breakers (OpenAI, GitHub, Slack).
 *
 * @returns Array of component health statuses for each circuit breaker
 */
export const checkAllCircuitBreakers = (): ComponentHealth[] => [
  checkCircuitBreakerHealth(SERVICE_KEYS.OPENAI, "OpenAI"),
  checkCircuitBreakerHealth(SERVICE_KEYS.GITHUB, "GitHub"),
  checkCircuitBreakerHealth(SERVICE_KEYS.SLACK, "Slack"),
];

// ==================== Aggregate Health Check ====================

/**
 * Configuration for health check.
 */
export interface HealthCheckConfig {
  readonly serviceName: string;
  readonly version: string;
  readonly environment: string;
  readonly includeDatabase?: boolean;
  readonly includeRedis?: boolean;
  readonly includeCircuitBreakers?: boolean;
}

/**
 * Determines overall status from component statuses.
 */
const aggregateStatus = (components: ComponentHealth[]): HealthStatus => {
  const hasUnhealthy = components.some((component) => component.status === HEALTH_STATUS.UNHEALTHY);
  if (hasUnhealthy) {
    return HEALTH_STATUS.UNHEALTHY;
  }

  const hasDegraded = components.some((component) => component.status === HEALTH_STATUS.DEGRADED);
  if (hasDegraded) {
    return HEALTH_STATUS.DEGRADED;
  }

  return HEALTH_STATUS.HEALTHY;
};

/**
 * Performs a comprehensive health check for the service.
 */
export const performHealthCheck = async (config: HealthCheckConfig): Promise<ServiceHealth> => {
  const startTime = Date.now();
  const components: ComponentHealth[] = [];

  // Always check memory
  components.push(checkMemoryStatus());

  // Check database if enabled
  if (config.includeDatabase !== false) {
    try {
      components.push(await checkDatabaseHealth());
    } catch (error) {
      logger.error("Database health check failed", { error });
      components.push({
        name: "database",
        status: HEALTH_STATUS.UNHEALTHY,
        message: "Health check failed",
      });
    }
  }

  // Check Redis if enabled
  if (config.includeRedis !== false) {
    try {
      components.push(await checkRedisHealth());
    } catch (error) {
      logger.error("Redis health check failed", { error });
      components.push({
        name: "redis",
        status: HEALTH_STATUS.DEGRADED,
        message: "Health check failed",
      });
    }
  }

  // Check circuit breakers if enabled
  if (config.includeCircuitBreakers !== false) {
    components.push(...checkAllCircuitBreakers());
  }

  const totalLatency = Date.now() - startTime;
  const status = aggregateStatus(components);

  logger.debug("Health check completed", {
    status,
    latencyMs: totalLatency,
    componentCount: components.length,
  });

  return {
    status,
    service: config.serviceName,
    version: config.version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.environment,
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
  config: Omit<HealthCheckConfig, "includeCircuitBreakers">
): Promise<{ ready: boolean; reason?: string }> => {
  const health = await performHealthCheck({
    ...config,
    includeCircuitBreakers: false, // Don't include circuit breakers for readiness
  });

  if (health.status === HEALTH_STATUS.UNHEALTHY) {
    const unhealthyComponents = health.components
      .filter((component) => component.status === HEALTH_STATUS.UNHEALTHY)
      .map((component) => component.name);

    return {
      ready: false,
      reason: `Unhealthy components: ${unhealthyComponents.join(", ")}`,
    };
  }

  return { ready: true };
};
