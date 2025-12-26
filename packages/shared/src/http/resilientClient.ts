/**
 * Resilient HTTP Client
 *
 * Provides a fault-tolerant HTTP client with:
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern to prevent cascade failures
 * - Configurable timeouts
 * - Request/response logging
 *
 * @module http/resilientClient
 */

import { createLogger } from "../core/logger.js";
import { ExternalServiceError } from "../core/errors.js";
import { HTTP_RESILIENCE_DEFAULTS } from "../constants/index.js";

const logger = createLogger("resilient-http");

// ==================== Types ====================

/**
 * HTTP methods supported by the client
 */
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Configuration options for resilient HTTP requests
 */
export interface ResilientRequestOptions {
  /** Request timeout in milliseconds */
  readonly timeout?: number;
  /** Maximum retry attempts */
  readonly maxRetries?: number;
  /** Initial retry delay in milliseconds */
  readonly initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds */
  readonly maxRetryDelay?: number;
  /** Additional headers */
  readonly headers?: Record<string, string>;
  /** Whether to skip circuit breaker check */
  readonly skipCircuitBreaker?: boolean;
}

/**
 * Response from resilient HTTP client
 */
export interface ResilientResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly retryCount: number;
  readonly duration: number;
}

/**
 * Circuit breaker state
 */
interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// ==================== Circuit Breaker ====================

/**
 * Circuit breaker registry - tracks state per service
 */
const circuitBreakers = new Map<string, CircuitState>();

/**
 * Gets or creates circuit breaker state for a service
 */
const getCircuitState = (serviceKey: string): CircuitState => {
  const existing = circuitBreakers.get(serviceKey);
  if (existing) return existing;

  const initial: CircuitState = { failures: 0, lastFailure: 0, isOpen: false };
  circuitBreakers.set(serviceKey, initial);
  return initial;
};

/**
 * Extracts service key from URL for circuit breaker tracking
 */
const getServiceKey = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
};

/**
 * Checks if circuit breaker allows request
 */
const isCircuitOpen = (serviceKey: string): boolean => {
  const state = getCircuitState(serviceKey);

  if (!state.isOpen) return false;

  // Check if reset timeout has passed
  const timeSinceFailure = Date.now() - state.lastFailure;
  if (timeSinceFailure >= HTTP_RESILIENCE_DEFAULTS.CIRCUIT_BREAKER_RESET_MS) {
    // Half-open state - allow one request through
    state.isOpen = false;
    logger.info("Circuit breaker half-open, allowing request", { serviceKey });
    return false;
  }

  return true;
};

/**
 * Records a successful request - resets circuit breaker
 */
const recordSuccess = (serviceKey: string): void => {
  const state = getCircuitState(serviceKey);
  state.failures = 0;
  state.isOpen = false;
};

/**
 * Records a failed request - may trip circuit breaker
 */
const recordFailure = (serviceKey: string): void => {
  const state = getCircuitState(serviceKey);
  state.failures += 1;
  state.lastFailure = Date.now();

  if (state.failures >= HTTP_RESILIENCE_DEFAULTS.CIRCUIT_BREAKER_THRESHOLD) {
    state.isOpen = true;
    logger.warn("Circuit breaker opened", {
      serviceKey,
      failures: state.failures,
      resetMs: HTTP_RESILIENCE_DEFAULTS.CIRCUIT_BREAKER_RESET_MS,
    });
  }
};

/**
 * Resets circuit breaker for a service (for testing)
 */
export const resetCircuitBreaker = (serviceKey: string): void => {
  circuitBreakers.delete(serviceKey);
};

/**
 * Gets circuit breaker status for a service
 */
export const getCircuitBreakerStatus = (
  serviceKey: string
): { isOpen: boolean; failures: number } => {
  const state = getCircuitState(serviceKey);
  return { isOpen: state.isOpen, failures: state.failures };
};

// ==================== Retry Logic ====================

/**
 * Calculates exponential backoff delay with jitter
 */
const calculateBackoff = (attempt: number, initialDelay: number, maxDelay: number): number => {
  const exponentialDelay = initialDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
};

/**
 * Determines if an error is retryable
 */
const isRetryableError = (status: number, error?: Error): boolean => {
  // Network errors are retryable
  if (error) {
    const message = error.message.toLowerCase();
    const retryableNetworkErrors = [
      "econnrefused",
      "econnreset",
      "etimedout",
      "enotfound",
      "eai_again",
      "socket hang up",
      "network",
      "fetch failed",
    ];
    if (retryableNetworkErrors.some((e) => message.includes(e))) return true;
  }

  // HTTP status codes that are retryable
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  return retryableStatuses.includes(status);
};

/**
 * Waits for specified milliseconds
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ==================== Main Client ====================

/**
 * Makes a resilient HTTP request with retry and circuit breaker
 */
export const resilientFetch = async <T>(
  url: string,
  method: HttpMethod,
  body?: unknown,
  options: ResilientRequestOptions = {}
): Promise<ResilientResponse<T>> => {
  const {
    timeout = HTTP_RESILIENCE_DEFAULTS.TIMEOUT_MS,
    maxRetries = HTTP_RESILIENCE_DEFAULTS.MAX_RETRIES,
    initialRetryDelay = HTTP_RESILIENCE_DEFAULTS.INITIAL_RETRY_DELAY_MS,
    maxRetryDelay = HTTP_RESILIENCE_DEFAULTS.MAX_RETRY_DELAY_MS,
    headers = {},
    skipCircuitBreaker = false,
  } = options;

  const serviceKey = getServiceKey(url);
  const startTime = Date.now();

  // Check circuit breaker
  if (!skipCircuitBreaker && isCircuitOpen(serviceKey)) {
    throw new ExternalServiceError(
      serviceKey,
      `Circuit breaker is open for ${serviceKey}. Service appears to be unavailable.`
    );
  }

  let lastError: Error | undefined;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      lastStatus = response.status;

      if (!response.ok) {
        // Check if retryable
        if (isRetryableError(response.status) && attempt <= maxRetries) {
          const delay = calculateBackoff(attempt, initialRetryDelay, maxRetryDelay);
          logger.warn("Request failed, retrying", {
            url,
            status: response.status,
            attempt,
            maxRetries,
            retryDelayMs: Math.round(delay),
          });
          await wait(delay);
          continue;
        }

        // Non-retryable error
        recordFailure(serviceKey);
        const errorBody = await response.text().catch(() => "Unknown error");
        throw new ExternalServiceError(serviceKey, `HTTP ${response.status}: ${errorBody}`);
      }

      // Success - reset circuit breaker
      recordSuccess(serviceKey);

      const data = (await response.json()) as T;
      const duration = Date.now() - startTime;

      logger.debug("Request succeeded", {
        url,
        method,
        status: response.status,
        duration,
        retryCount: attempt - 1,
      });

      return {
        data,
        status: response.status,
        retryCount: attempt - 1,
        duration,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Handle abort (timeout)
      if (lastError.name === "AbortError") {
        lastError = new Error(`Request timeout after ${timeout}ms`);
      }

      // Check if retryable
      if (isRetryableError(lastStatus, lastError) && attempt <= maxRetries) {
        const delay = calculateBackoff(attempt, initialRetryDelay, maxRetryDelay);
        logger.warn("Request error, retrying", {
          url,
          error: lastError.message,
          attempt,
          maxRetries,
          retryDelayMs: Math.round(delay),
        });
        await wait(delay);
        continue;
      }

      // Non-retryable or max retries exceeded
      break;
    }
  }

  // All retries exhausted
  recordFailure(serviceKey);
  const duration = Date.now() - startTime;

  logger.error("Request failed after all retries", {
    url,
    method,
    error: lastError?.message,
    totalAttempts: maxRetries + 1,
    duration,
  });

  throw new ExternalServiceError(serviceKey, lastError?.message ?? `Request to ${url} failed`);
};

// ==================== Convenience Methods ====================

/**
 * Makes a resilient GET request
 */
export const resilientGet = async <T>(
  url: string,
  options?: ResilientRequestOptions
): Promise<ResilientResponse<T>> => resilientFetch<T>(url, "GET", undefined, options);

/**
 * Makes a resilient POST request
 */
export const resilientPost = async <T>(
  url: string,
  body: unknown,
  options?: ResilientRequestOptions
): Promise<ResilientResponse<T>> => resilientFetch<T>(url, "POST", body, options);

/**
 * Makes a resilient PUT request
 */
export const resilientPut = async <T>(
  url: string,
  body: unknown,
  options?: ResilientRequestOptions
): Promise<ResilientResponse<T>> => resilientFetch<T>(url, "PUT", body, options);

/**
 * Makes a resilient PATCH request
 */
export const resilientPatch = async <T>(
  url: string,
  body: unknown,
  options?: ResilientRequestOptions
): Promise<ResilientResponse<T>> => resilientFetch<T>(url, "PATCH", body, options);

/**
 * Makes a resilient DELETE request
 */
export const resilientDelete = async <T>(
  url: string,
  options?: ResilientRequestOptions
): Promise<ResilientResponse<T>> => resilientFetch<T>(url, "DELETE", undefined, options);
