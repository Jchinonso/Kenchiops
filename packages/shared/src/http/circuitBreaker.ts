/**
 * Generic Circuit Breaker Pattern
 *
 * Provides fault-tolerant execution for any async operation with:
 * - Automatic failure tracking per service
 * - Open/closed/half-open state management
 * - Configurable thresholds and timeouts
 *
 * @module http/circuitBreaker
 */

import { createLogger } from "../core/logger.js";
import { CircuitBreakerOpenError, getErrorMessage } from "../core/errors.js";
import { HTTP_RESILIENCE_DEFAULTS, CIRCUIT_BREAKER_SERVICE_KEYS } from "../constants/index.js";
import type { CircuitStateRecord, CircuitBreakerConfig, CircuitBreakerStatus } from "./types.js";

export type { CircuitBreakerConfig, CircuitBreakerStatus };

/** Re-export service keys for backward compatibility. */
export const SERVICE_KEYS = CIRCUIT_BREAKER_SERVICE_KEYS;

const logger = createLogger("circuit-breaker");

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

  const initial: CircuitStateRecord = {
    state: "closed",
    failures: 0,
    lastFailure: 0,
    successes: 0,
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

  // Closed circuit - always allow
  if (record.state === "closed") {
    return true;
  }

  // Half-open circuit - allow probe request
  if (record.state === "half-open") {
    return true;
  }

  // Open circuit - check if ready for half-open transition
  if (shouldTransitionToHalfOpen(record, config)) {
    stateTransitions.toHalfOpen(record, serviceKey);
    return true;
  }

  return false;
};

/**
 * Records successful execution
 */
const recordSuccess = (serviceKey: string, config: Required<CircuitBreakerConfig>): void => {
  const record = getCircuitRecord(serviceKey);

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
  record.failures += 1;
  record.lastFailure = Date.now();
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

// ==================== Public API ====================

/**
 * Wraps an async operation with circuit breaker protection.
 *
 * @param serviceKey - Unique identifier for the service/operation
 * @param operation - Async function to execute
 * @param config - Optional circuit breaker configuration
 * @returns Result of the operation
 * @throws {ExternalServiceError} If circuit is open
 *
 * @example
 * const result = await withCircuitBreaker("openai", async () => {
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
