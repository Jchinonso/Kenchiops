/**
 * Generic Circuit Breaker Pattern
 *
 * Provides fault-tolerant execution for any async operation with:
 * - Automatic failure tracking per service
 * - Open/closed/half-open state management
 * - Configurable thresholds and timeouts
 * - Per-tenant isolation via composite service keys
 * - Idle entry eviction to prevent unbounded memory growth
 *
 * @module http/circuitBreaker
 */

import { createLogger } from "../core/logger.js";
import { CircuitBreakerOpenError, getErrorMessage } from "../core/errors.js";
import {
  HTTP_RESILIENCE_DEFAULTS,
  CIRCUIT_BREAKER_SERVICE_KEYS,
  CIRCUIT_BREAKER_CLEANUP,
} from "../constants/index.js";
import type { CircuitStateRecord, CircuitBreakerConfig, CircuitBreakerStatus } from "./types.js";

/** Re-export service keys for backward compatibility. */
export const SERVICE_KEYS = CIRCUIT_BREAKER_SERVICE_KEYS;

const logger = createLogger("circuit-breaker");

// ==================== Per-Tenant Key Builder ====================

/**
 * Builds a per-tenant circuit breaker key.
 * Falls back to the base service key when tenantId is not provided
 * for backward compatibility with non-tenant-scoped callers.
 *
 * @param baseKey - Base service key (e.g., "openai", "github")
 * @param tenantId - Optional tenant identifier for isolation
 * @returns Composite key like "openai:tenant_123" or plain "openai"
 */
export const buildTenantCircuitKey = (baseKey: string, tenantId?: string): string =>
  tenantId ? `${baseKey}:${tenantId}` : baseKey;

// ==================== Circuit State Management ====================

/**
 * Circuit breaker registry - tracks state per service key
 */
const circuits = new Map<string, CircuitStateRecord>();

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
  threshold: HTTP_RESILIENCE_DEFAULTS.CIRCUIT_BREAKER_THRESHOLD,
  resetTimeout: HTTP_RESILIENCE_DEFAULTS.CIRCUIT_BREAKER_RESET_MS,
  successThreshold: HTTP_RESILIENCE_DEFAULTS.CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
} as const;

/**
 * State transition handlers for clean state machine logic
 */
const stateTransitions = {
  toOpen: (
    record: CircuitStateRecord,
    serviceKey: string,
    config: Required<CircuitBreakerConfig>
  ): void => {
    record.state = "open";
    logger.warn("Circuit breaker opened", {
      serviceKey,
      failures: record.failures,
      resetMs: config.resetTimeout,
    });
  },

  toHalfOpen: (record: CircuitStateRecord, serviceKey: string): void => {
    record.state = "half-open";
    logger.info("Circuit breaker half-open, allowing probe request", { serviceKey });
  },

  toClosed: (record: CircuitStateRecord, serviceKey: string): void => {
    record.state = "closed";
    record.failures = 0;
    record.successes = 0;
    logger.info("Circuit breaker closed", { serviceKey });
  },
} as const;

/**
 * Gets or creates circuit state for a service
 */
const getCircuitRecord = (serviceKey: string): CircuitStateRecord => {
  const existing = circuits.get(serviceKey);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const initial: CircuitStateRecord = {
    state: "closed",
    failures: 0,
    lastFailure: 0,
    successes: 0,
    lastActivity: now,
  };
  circuits.set(serviceKey, initial);
  return initial;
};

/**
 * Checks if circuit should transition from open to half-open
 */
const shouldTransitionToHalfOpen = (
  record: CircuitStateRecord,
  config: Required<CircuitBreakerConfig>
): boolean => {
  if (record.state !== "open") {
    return false;
  }

  const timeSinceFailure = Date.now() - record.lastFailure;
  return timeSinceFailure >= config.resetTimeout;
};

/**
 * Determines if circuit allows request execution
 */
const canExecute = (serviceKey: string, config: Required<CircuitBreakerConfig>): boolean => {
  const record = getCircuitRecord(serviceKey);

  // Closed or half-open circuits allow execution
  if (record.state === "closed" || record.state === "half-open") {
    return true;
  }

  // Open circuit - check if ready for half-open transition
  if (!shouldTransitionToHalfOpen(record, config)) {
    return false;
  }

  stateTransitions.toHalfOpen(record, serviceKey);
  return true;
};

/**
 * Records successful execution
 */
const recordSuccess = (serviceKey: string, config: Required<CircuitBreakerConfig>): void => {
  const record = getCircuitRecord(serviceKey);
  record.lastActivity = Date.now();

  // In closed state, reset failure count
  if (record.state !== "half-open") {
    record.failures = 0;
    return;
  }

  // In half-open state, track successes for potential close
  record.successes += 1;
  const shouldClose = record.successes >= config.successThreshold;
  if (shouldClose) {
    stateTransitions.toClosed(record, serviceKey);
  }
};

/**
 * Records failed execution
 */
const recordFailure = (
  serviceKey: string,
  config: Required<CircuitBreakerConfig>,
  error?: unknown
): void => {
  const record = getCircuitRecord(serviceKey);
  const now = Date.now();
  record.failures += 1;
  record.lastFailure = now;
  record.lastActivity = now;
  record.successes = 0;
  record.lastErrorMessage = error ? getErrorMessage(error) : undefined;

  // In half-open state, immediately open circuit
  if (record.state === "half-open") {
    stateTransitions.toOpen(record, serviceKey, config);
    return;
  }

  // In closed state, check threshold
  if (record.failures >= config.threshold) {
    stateTransitions.toOpen(record, serviceKey, config);
  }
};

// ==================== Idle Entry Cleanup ====================

/**
 * Reference to the cleanup interval timer.
 * Stored for shutdown/test cleanup via stopIdleCleanup().
 */
// let: mutable reference to interval timer, reassigned on start/stop
let cleanupTimer: ReturnType<typeof setInterval> | null = null; // let: timer reference reassigned on start/stop

/**
 * Evicts circuit breaker entries that have been idle (no activity)
 * for longer than the configured TTL. Prevents unbounded memory growth
 * when per-tenant keys create many short-lived entries.
 *
 * Only evicts entries in the "closed" state with zero failures.
 * Open or degraded circuits are kept until they naturally recover.
 */
export const evictIdleCircuits = (
  idleTtlMs: number = CIRCUIT_BREAKER_CLEANUP.IDLE_TTL_MS
): number => {
  const now = Date.now();
  const keysToEvict = Array.from(circuits.entries())
    .filter(([, record]) => {
      const idleDuration = now - record.lastActivity;
      const isIdle = idleDuration >= idleTtlMs;
      // Only evict closed circuits with no recent failures
      const isSafeToEvict = record.state === "closed" && record.failures === 0;
      return isIdle && isSafeToEvict;
    })
    .map(([key]) => key);

  keysToEvict.forEach((key) => circuits.delete(key));

  if (keysToEvict.length > 0) {
    logger.info("Evicted idle circuit breaker entries", {
      evictedCount: keysToEvict.length,
      remainingCount: circuits.size,
    });
  }

  return keysToEvict.length;
};

/**
 * Starts the periodic idle circuit cleanup timer.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export const startIdleCleanup = (
  intervalMs: number = CIRCUIT_BREAKER_CLEANUP.CLEANUP_INTERVAL_MS
): void => {
  if (cleanupTimer !== null) {
    return;
  }

  cleanupTimer = setInterval(() => {
    evictIdleCircuits();
  }, intervalMs);

  // Allow process to exit even if cleanup timer is running
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }

  logger.info("Circuit breaker idle cleanup started", { intervalMs });
};

/**
 * Stops the periodic idle circuit cleanup timer.
 * Safe to call when no timer is running.
 */
export const stopIdleCleanup = (): void => {
  if (cleanupTimer === null) {
    return;
  }

  clearInterval(cleanupTimer);
  cleanupTimer = null;
  logger.info("Circuit breaker idle cleanup stopped");
};

// ==================== Public API ====================

/**
 * Wraps an async operation with circuit breaker protection.
 *
 * For per-tenant isolation, use `buildTenantCircuitKey()` to construct
 * the service key:
 *
 * @param serviceKey - Unique identifier for the service/operation
 * @param operation - Async function to execute
 * @param config - Optional circuit breaker configuration
 * @returns Result of the operation
 * @throws {CircuitBreakerOpenError} If circuit is open
 *
 * @example
 * // Per-tenant circuit breaker
 * const key = buildTenantCircuitKey("openai", tenantId);
 * const result = await withCircuitBreaker(key, async () => {
 *   return openai.chat.completions.create(params);
 * });
 */
export const withCircuitBreaker = async <T>(
  serviceKey: string,
  operation: () => Promise<T>,
  config: CircuitBreakerConfig = {}
): Promise<T> => {
  const mergedConfig: Required<CircuitBreakerConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Check if circuit allows execution
  if (!canExecute(serviceKey, mergedConfig)) {
    const record = getCircuitRecord(serviceKey);
    const timeUntilRetry = Math.max(
      0,
      mergedConfig.resetTimeout - (Date.now() - record.lastFailure)
    );

    logger.warn("Circuit breaker blocked request", {
      serviceKey,
      state: record.state,
      failures: record.failures,
      timeUntilRetryMs: timeUntilRetry,
      lastError: record.lastErrorMessage,
    });

    throw new CircuitBreakerOpenError(serviceKey, timeUntilRetry, {
      operation: `${serviceKey} request`,
      metadata: {
        failures: record.failures,
        lastError: record.lastErrorMessage,
      },
    });
  }

  try {
    const result = await operation();
    recordSuccess(serviceKey, mergedConfig);
    return result;
  } catch (error) {
    recordFailure(serviceKey, mergedConfig, error);
    throw error;
  }
};

/**
 * Gets the current status of a circuit breaker.
 *
 * @param serviceKey - Service identifier
 * @returns Current circuit breaker status
 */
export const getCircuitStatus = (serviceKey: string): CircuitBreakerStatus => {
  const record = getCircuitRecord(serviceKey);
  return {
    state: record.state,
    failures: record.failures,
    isOpen: record.state === "open",
    lastFailure: record.lastFailure > 0 ? record.lastFailure : null,
  };
};

/**
 * Resets a circuit breaker to closed state (for testing/recovery).
 *
 * @param serviceKey - Service identifier to reset
 */
export const resetCircuit = (serviceKey: string): void => {
  circuits.delete(serviceKey);
  logger.info("Circuit breaker reset", { serviceKey });
};

/**
 * Resets all circuit breakers (for testing).
 */
export const resetAllCircuits = (): void => {
  circuits.clear();
  logger.info("All circuit breakers reset");
};

/**
 * Gets status of all circuit breakers.
 *
 * @returns Map of service keys to their circuit status
 */
export const getAllCircuitStatus = (): Map<string, CircuitBreakerStatus> =>
  new Map(
    Array.from(circuits.keys()).map((serviceKey) => [serviceKey, getCircuitStatus(serviceKey)])
  );

/**
 * Gets the number of tracked circuit breaker entries.
 * Useful for monitoring memory growth of per-tenant circuits.
 */
export const getCircuitCount = (): number => circuits.size;
