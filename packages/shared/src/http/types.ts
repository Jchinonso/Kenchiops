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
