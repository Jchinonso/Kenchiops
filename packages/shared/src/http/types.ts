/**
 * HTTP Module Type Definitions
 *
 * Centralized types for HTTP utilities including circuit breaker,
 * resilient client, and related patterns.
 *
 * @module http/types
 */

// ==================== Circuit Breaker Types ====================

/** Circuit breaker state enumeration. */
export type CircuitState = "closed" | "open" | "half-open";

/** Circuit breaker state tracking. */
export interface CircuitStateRecord {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  successes: number;
  lastErrorMessage?: string;
  /** Timestamp of last successful or failed operation (for idle eviction). */
  lastActivity: number;
}

/** Circuit breaker configuration options. */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit. */
  readonly threshold?: number;
  /** Time in ms before attempting reset (half-open state). */
  readonly resetTimeout?: number;
  /** Number of successful calls required to close circuit from half-open. */
  readonly successThreshold?: number;
}

/** Circuit breaker status for external monitoring. */
export interface CircuitBreakerStatus {
  readonly state: CircuitState;
  readonly failures: number;
  readonly isOpen: boolean;
  readonly lastFailure: number | null;
}

// ==================== Resilient Client Types ====================

/** HTTP methods supported by the resilient client. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Configuration options for resilient HTTP requests. */
export interface ResilientRequestOptions {
  /** Request timeout in milliseconds. */
  readonly timeout?: number;
  /** Maximum retry attempts. */
  readonly maxRetries?: number;
  /** Initial retry delay in milliseconds. */
  readonly initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds. */
  readonly maxRetryDelay?: number;
  /** Additional headers. */
  readonly headers?: Record<string, string>;
  /** Whether to skip circuit breaker check. */
  readonly skipCircuitBreaker?: boolean;
  /** When true, signs the request with INTERNAL_SERVICE_SECRET (HMAC-SHA256). */
  readonly internalAuth?: boolean;
}

/** Response from resilient HTTP client. */
export interface ResilientResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly retryCount: number;
  readonly duration: number;
}

/** Internal circuit state tracking for resilient client. */
export interface ResilientCircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/** Request context for recursive retry attempts. */
export interface RetryContext {
  readonly url: string;
  readonly method: HttpMethod;
  readonly body?: unknown;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly initialRetryDelay: number;
  readonly maxRetryDelay: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly serviceKey: string;
  readonly startTime: number;
  /** When true, signs the request with INTERNAL_SERVICE_SECRET (HMAC-SHA256). */
  readonly internalAuth?: boolean;
}

// ==================== Validation Types ====================

/**
 * Validator function type.
 * Returns true if valid, or an error message string if invalid.
 */
export type Validator = (value: unknown) => boolean | string;

/**
 * Simple validation schema interface.
 */
export interface ValidationSchema {
  readonly body?: Record<string, Validator>;
  readonly params?: Record<string, Validator>;
  readonly query?: Record<string, Validator>;
}

/**
 * Internal validation source for processing request data.
 */
export interface ValidationSource {
  readonly source: Record<string, unknown>;
  readonly schema: Readonly<Record<string, Validator>>;
  readonly prefix: string;
}
