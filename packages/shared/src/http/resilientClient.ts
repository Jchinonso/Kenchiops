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
import {
  HTTP_RESILIENCE_DEFAULTS,
  RETRYABLE_HTTP_STATUS_CODES,
  RETRYABLE_NETWORK_ERRORS,
} from "../constants/index.js";
import type {
  HttpMethod,
  ResilientCircuitState,
  ResilientRequestOptions,
  ResilientResponse,
  RetryContext,
} from "./types.js";

const logger = createLogger("resilient-http");

// ==================== Circuit Breaker ====================

/**
 * Circuit breaker registry - tracks state per service
 */
const circuitBreakers = new Map<string, ResilientCircuitState>();

/**
 * Gets or creates circuit breaker state for a service
 */
const getCircuitState = (serviceKey: string): ResilientCircuitState => {
  const existing = circuitBreakers.get(serviceKey);
  if (existing) {
    return existing;
  }

  const initial: ResilientCircuitState = { failures: 0, lastFailure: 0, isOpen: false };
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

  if (!state.isOpen) {
    return false;
  }

  // Check if reset timeout has passed
  const timeSinceFailure = Date.now() - state.lastFailure;
  const shouldReset = timeSinceFailure >= HTTP_RESILIENCE_DEFAULTS.CIRCUIT_BREAKER_RESET_MS;

  if (!shouldReset) {
    return true;
  }

  // Half-open state - allow one request through
  state.isOpen = false;
  logger.info("Circuit breaker half-open, allowing request", { serviceKey });
  return false;
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
  const exponentialDelay = initialDelay * 2 ** (attempt - 1);
  const jitter = Math.random() * HTTP_RESILIENCE_DEFAULTS.JITTER_FACTOR * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelay);
};

/**
 * Determines if an error is retryable
 */
const isRetryableError = (status: number, error?: Error): boolean => {
  // Network errors are retryable
  if (error) {
    const message = error.message.toLowerCase();
    const isNetworkError = RETRYABLE_NETWORK_ERRORS.some((errorPattern) =>
      message.includes(errorPattern)
    );
    if (isNetworkError) {
      return true;
    }
  }

  // HTTP status codes that are retryable
  return RETRYABLE_HTTP_STATUS_CODES.includes(
    status as (typeof RETRYABLE_HTTP_STATUS_CODES)[number]
  );
};

/**
 * Waits for specified milliseconds
 */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// ==================== Main Client ====================

/**
 * Safely extracts response body text.
 */
const safeGetResponseText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "Unknown error";
  }
};

/**
 * Executes a single HTTP request attempt.
 */
const executeAttempt = async (
  context: RetryContext
): Promise<
  { success: true; response: Response } | { success: false; error: Error; status: number }
> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), context.timeout);

  try {
    const response = await fetch(context.url, {
      method: context.method,
      headers: { "Content-Type": "application/json", ...context.headers },
      body: context.body ? JSON.stringify(context.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { success: true, response };
  } catch (error) {
    clearTimeout(timeoutId);
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const finalError =
      normalizedError.name === "AbortError"
        ? new Error(`Request timeout after ${context.timeout}ms`)
        : normalizedError;
    return { success: false, error: finalError, status: 0 };
  }
};

/**
 * Logs retry attempt and waits for backoff delay.
 */
const logAndWaitForRetry = async (
  context: RetryContext,
  attempt: number,
  errorInfo: { message: string; status?: number }
): Promise<void> => {
  const delay = calculateBackoff(attempt, context.initialRetryDelay, context.maxRetryDelay);
  const errorDetails =
    errorInfo.status === undefined ? { error: errorInfo.message } : { status: errorInfo.status };
  logger.warn("Request failed, retrying", {
    url: context.url,
    ...errorDetails,
    attempt,
    maxRetries: context.maxRetries,
    retryDelayMs: Math.round(delay),
  });
  await wait(delay);
};

/**
 * Handles exhausted retries - logs and throws.
 */
const handleExhaustedRetries = (context: RetryContext, lastError: Error | undefined): never => {
  recordFailure(context.serviceKey);
  const durationMs = Date.now() - context.startTime;
  logger.error("Request failed after all retries", {
    url: context.url,
    method: context.method,
    error: lastError?.message,
    totalAttempts: context.maxRetries + 1,
    durationMs,
  });
  throw new ExternalServiceError(
    context.serviceKey,
    lastError?.message ?? `Request to ${context.url} failed`
  );
};

/**
 * Handles successful response - parses JSON and returns.
 */
const handleSuccess = async <T>(
  context: RetryContext,
  response: Response,
  attempt: number
): Promise<ResilientResponse<T>> => {
  recordSuccess(context.serviceKey);
  const data = (await response.json()) as T;
  const durationMs = Date.now() - context.startTime;

  logger.debug("Request succeeded", {
    url: context.url,
    method: context.method,
    status: response.status,
    durationMs,
    retryCount: attempt - 1,
  });

  return { data, status: response.status, retryCount: attempt - 1, duration: durationMs };
};

/**
 * Determines if a retry should be attempted.
 */
const shouldRetry = (
  status: number,
  error: Error | undefined,
  attempt: number,
  maxRetries: number
): boolean => isRetryableError(status, error) && attempt <= maxRetries;

/**
 * Recursive retry logic for resilient fetch.
 */
const attemptWithRetry = async <T>(
  context: RetryContext,
  attempt: number,
  lastError: Error | undefined,
  lastStatus: number
): Promise<ResilientResponse<T>> => {
  // Base case: all retries exhausted
  if (attempt > context.maxRetries + 1) {
    return handleExhaustedRetries(context, lastError);
  }

  const result = await executeAttempt(context);

  // Handle network/fetch errors
  if (!result.success) {
    if (shouldRetry(lastStatus, result.error, attempt, context.maxRetries)) {
      await logAndWaitForRetry(context, attempt, { message: result.error.message });
      return attemptWithRetry<T>(context, attempt + 1, result.error, result.status);
    }
    // Non-retryable - skip to exhausted state
    return attemptWithRetry<T>(context, context.maxRetries + 2, result.error, result.status);
  }

  const { response } = result;

  // Handle HTTP errors
  if (!response.ok) {
    if (shouldRetry(response.status, undefined, attempt, context.maxRetries)) {
      await logAndWaitForRetry(context, attempt, { message: "", status: response.status });
      return attemptWithRetry<T>(
        context,
        attempt + 1,
        new Error(`HTTP ${response.status}`),
        response.status
      );
    }
    // Non-retryable HTTP error
    recordFailure(context.serviceKey);
    const errorBody = await safeGetResponseText(response);
    throw new ExternalServiceError(context.serviceKey, `HTTP ${response.status}: ${errorBody}`);
  }

  return handleSuccess<T>(context, response, attempt);
};

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

  // Check circuit breaker
  if (!skipCircuitBreaker && isCircuitOpen(serviceKey)) {
    throw new ExternalServiceError(
      serviceKey,
      `Circuit breaker is open for ${serviceKey}. Service appears to be unavailable.`
    );
  }

  const context: RetryContext = {
    url,
    method,
    body,
    timeout,
    maxRetries,
    initialRetryDelay,
    maxRetryDelay,
    headers,
    serviceKey,
    startTime: Date.now(),
  };

  return attemptWithRetry<T>(context, 1, undefined, 0);
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
