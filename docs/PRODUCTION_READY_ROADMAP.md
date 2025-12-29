# Kenchi Production Ready Roadmap

## Executive Summary

This document provides a comprehensive production-ready roadmap for the Kenchi DevOps Assistant platform. Based on a thorough codebase audit, we've identified improvements across six key areas to ensure production readiness:

1. **Observability** - Metrics, tracing, and monitoring
2. **Resilience** - Circuit breakers, graceful degradation, retry patterns
3. **Testing** - Integration tests, mock improvements, coverage
4. **Security** - Input validation, rate limiting, secrets management
5. **Operations** - Health checks, configuration, deployment
6. **Performance** - Caching, batching, query optimization

---

## Table of Contents

1. [Current State Assessment](#current-state-assessment)
2. [Priority Matrix](#priority-matrix)
3. [Observability Improvements](#1-observability-improvements)
4. [Resilience Patterns](#2-resilience-patterns)
5. [Testing Improvements](#3-testing-improvements)
6. [Security Hardening](#4-security-hardening)
7. [Operational Improvements](#5-operational-improvements)
8. [Performance Optimization](#6-performance-optimization)
9. [Implementation Timeline](#implementation-timeline)

---

## Current State Assessment

### Strengths

| Area               | Current State                                            | Score |
| ------------------ | -------------------------------------------------------- | ----- |
| **Architecture**   | Clean monorepo with `@kenchi/shared` for reusable code   | A     |
| **TypeScript**     | Strong typing, explicit interfaces, discriminated unions | A     |
| **Testing**        | 2,457 tests, 66 suites, comprehensive unit tests         | B+    |
| **Error Handling** | Custom error classes, structured error responses         | B+    |
| **Caching**        | Multi-level Redis caching with TTL and invalidation      | B+    |
| **Multi-tenancy**  | Proper tenant isolation in database and services         | B     |
| **CI/CD**          | GitHub Actions with 8 parallel jobs, coverage badges     | B     |

### Gaps Identified

| Area                  | Gap                                                 | Impact                            | Priority |
| --------------------- | --------------------------------------------------- | --------------------------------- | -------- |
| **Metrics**           | No Prometheus/StatsD metrics                        | Cannot monitor performance        | P0       |
| **Tracing**           | No distributed tracing                              | Cannot debug cross-service issues | P0       |
| **Circuit Breakers**  | Only in resilientClient, not for all external calls | Cascading failures                | P1       |
| **Integration Tests** | No end-to-end tests                                 | Regressions in integrations       | P1       |
| **Health Checks**     | Basic only, no deep checks                          | Silent failures                   | P1       |
| **Config Validation** | Runtime crashes on bad config                       | Deployment failures               | P2       |
| **Feature Flags**     | None                                                | Risky deployments                 | P2       |
| **API Documentation** | No OpenAPI spec                                     | Hard to integrate                 | P3       |

---

## Priority Matrix

```
                    HIGH IMPACT
                        │
         P0             │             P1
    ┌───────────────────┼───────────────────┐
    │  • Metrics        │  • Circuit Breakers│
    │  • Tracing        │  • Integration Tests│
    │  • Request IDs    │  • Deep Health Checks│
    │                   │  • Graceful Degradation│
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT│                   │                   │ EFFORT
    │  P3             │             P2      │
    │  • API Docs       │  • Feature Flags  │
    │  • Runbooks       │  • Config Validation│
    │  • Coverage 80%   │  • Batch Operations│
    │                   │                   │
    └───────────────────┴───────────────────┘
                    LOW IMPACT
```

---

## 1. Observability Improvements

### 1.1 Prometheus Metrics

**Problem**: No visibility into service performance, error rates, or resource usage.

**Solution**: Add Prometheus metrics using `prom-client`.

#### Implementation

**File**: `packages/shared/src/observability/metrics.ts`

```typescript
/**
 * Prometheus Metrics Module
 *
 * Provides standardized metrics collection for all services.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

// Singleton registry
const registry = new Registry();

// Collect Node.js default metrics (memory, CPU, event loop)
collectDefaultMetrics({ register: registry, prefix: "kenchi_" });

// ==================== HTTP Metrics ====================

export const httpRequestsTotal = new Counter({
  name: "kenchi_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code", "service"],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: "kenchi_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code", "service"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// ==================== External Service Metrics ====================

export const externalCallsTotal = new Counter({
  name: "kenchi_external_calls_total",
  help: "Total external service calls",
  labelNames: ["service", "operation", "status"],
  registers: [registry],
});

export const externalCallDuration = new Histogram({
  name: "kenchi_external_call_duration_seconds",
  help: "External service call duration",
  labelNames: ["service", "operation"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const circuitBreakerState = new Gauge({
  name: "kenchi_circuit_breaker_state",
  help: "Circuit breaker state (0=closed, 1=open, 0.5=half-open)",
  labelNames: ["service"],
  registers: [registry],
});

// ==================== Cache Metrics ====================

export const cacheOperations = new Counter({
  name: "kenchi_cache_operations_total",
  help: "Cache operations",
  labelNames: ["operation", "result"], // operation: get/set/delete, result: hit/miss/error
  registers: [registry],
});

export const cacheSize = new Gauge({
  name: "kenchi_cache_size_bytes",
  help: "Approximate cache size in bytes",
  labelNames: ["cache_type"],
  registers: [registry],
});

// ==================== Queue Metrics ====================

export const queueDepth = new Gauge({
  name: "kenchi_queue_depth",
  help: "Current queue depth",
  labelNames: ["queue_name"],
  registers: [registry],
});

export const queueProcessingDuration = new Histogram({
  name: "kenchi_queue_processing_duration_seconds",
  help: "Queue item processing duration",
  labelNames: ["queue_name", "status"],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [registry],
});

// ==================== Business Metrics ====================

export const analysisTotal = new Counter({
  name: "kenchi_analysis_total",
  help: "Total CI failure analyses",
  labelNames: ["repository", "result", "cached"],
  registers: [registry],
});

export const analysisConfidence = new Histogram({
  name: "kenchi_analysis_confidence",
  help: "Analysis confidence score distribution",
  labelNames: ["repository"],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  registers: [registry],
});

export const actionsExecuted = new Counter({
  name: "kenchi_actions_executed_total",
  help: "Actions executed",
  labelNames: ["action_type", "result", "gating_decision"],
  registers: [registry],
});

// ==================== Database Metrics ====================

export const dbQueryDuration = new Histogram({
  name: "kenchi_db_query_duration_seconds",
  help: "Database query duration",
  labelNames: ["operation", "table"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [registry],
});

export const dbConnectionPool = new Gauge({
  name: "kenchi_db_connection_pool",
  help: "Database connection pool stats",
  labelNames: ["state"], // active, idle, waiting
  registers: [registry],
});

// ==================== Exports ====================

export const getMetricsRegistry = (): Registry => registry;

export const getMetrics = async (): Promise<string> => {
  return registry.metrics();
};

export const getMetricsContentType = (): string => {
  return registry.contentType;
};
```

#### Metrics Middleware

**File**: `packages/shared/src/observability/metricsMiddleware.ts`

```typescript
/**
 * Express middleware for automatic HTTP metrics collection
 */

import { Request, Response, NextFunction } from "express";
import { httpRequestsTotal, httpRequestDuration } from "./metrics.js";

export interface MetricsMiddlewareOptions {
  serviceName: string;
  excludePaths?: string[];
}

export const metricsMiddleware = (options: MetricsMiddlewareOptions) => {
  const { serviceName, excludePaths = ["/health", "/metrics"] } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      next();
      return;
    }

    const startTime = process.hrtime.bigint();

    // Capture response finish
    res.on("finish", () => {
      const endTime = process.hrtime.bigint();
      const durationSeconds = Number(endTime - startTime) / 1e9;

      const route = req.route?.path || req.path;
      const labels = {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
        service: serviceName,
      };

      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, durationSeconds);
    });

    next();
  };
};
```

#### Metrics Endpoint

**File**: Add to each service's routes

```typescript
import { Router } from "express";
import { getMetrics, getMetricsContentType } from "@kenchi/shared";

const router = Router();

router.get("/metrics", async (_req, res) => {
  try {
    const metrics = await getMetrics();
    res.set("Content-Type", getMetricsContentType());
    res.send(metrics);
  } catch (error) {
    res.status(500).send("Error collecting metrics");
  }
});

export { router as metricsRoutes };
```

---

### 1.2 Distributed Tracing

**Problem**: Cannot trace requests across services (API → GitHub App → Slack Bot).

**Solution**: Implement OpenTelemetry with trace context propagation.

#### Implementation

**File**: `packages/shared/src/observability/tracing.ts`

```typescript
/**
 * OpenTelemetry Tracing Module
 *
 * Provides distributed tracing across all services.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { trace, context, SpanStatusCode, Span, SpanKind, propagation } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

let sdk: NodeSDK | null = null;

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  otlpEndpoint?: string;
  enabled?: boolean;
}

/**
 * Initialize OpenTelemetry tracing
 */
export const initTracing = (config: TracingConfig): void => {
  if (!config.enabled) {
    return;
  }

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion || "1.0.0",
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment || "development",
  });

  const exporter = config.otlpEndpoint
    ? new OTLPTraceExporter({ url: config.otlpEndpoint })
    : undefined;

  sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-http": { enabled: true },
        "@opentelemetry/instrumentation-express": { enabled: true },
        "@opentelemetry/instrumentation-pg": { enabled: true },
        "@opentelemetry/instrumentation-redis": { enabled: true },
      }),
    ],
  });

  // Set up W3C trace context propagation
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  sdk.start();
};

/**
 * Shutdown tracing gracefully
 */
export const shutdownTracing = async (): Promise<void> => {
  if (sdk) {
    await sdk.shutdown();
  }
};

/**
 * Get the current tracer
 */
export const getTracer = (name: string) => trace.getTracer(name);

/**
 * Create a new span for an operation
 */
export const withSpan = async <T>(
  tracerName: string,
  spanName: string,
  operation: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> => {
  const tracer = getTracer(tracerName);

  return tracer.startActiveSpan(
    spanName,
    { kind: options?.kind || SpanKind.INTERNAL },
    async (span) => {
      try {
        if (options?.attributes) {
          span.setAttributes(options.attributes);
        }

        const result = await operation(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
};

/**
 * Extract trace context from incoming request headers
 */
export const extractTraceContext = (headers: Record<string, string | string[] | undefined>) => {
  return propagation.extract(context.active(), headers);
};

/**
 * Inject trace context into outgoing request headers
 */
export const injectTraceContext = (headers: Record<string, string>) => {
  propagation.inject(context.active(), headers);
  return headers;
};

/**
 * Get current trace ID for logging
 */
export const getCurrentTraceId = (): string | undefined => {
  const span = trace.getActiveSpan();
  return span?.spanContext().traceId;
};

/**
 * Get current span ID for logging
 */
export const getCurrentSpanId = (): string | undefined => {
  const span = trace.getActiveSpan();
  return span?.spanContext().spanId;
};
```

---

### 1.3 Request ID Propagation

**Problem**: Cannot correlate logs across services for the same request.

**Solution**: Add request ID middleware that propagates through all calls.

#### Implementation

**File**: `packages/shared/src/observability/requestId.ts`

```typescript
/**
 * Request ID Middleware
 *
 * Generates and propagates request IDs across service boundaries.
 */

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";

// AsyncLocalStorage for request context
const requestContext = new AsyncLocalStorage<RequestContext>();

export interface RequestContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  tenantId?: string;
}

export const REQUEST_ID_HEADER = "x-request-id";
export const TRACE_ID_HEADER = "x-trace-id";

/**
 * Middleware to extract or generate request ID
 */
export const requestIdMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();
    const traceId = req.headers[TRACE_ID_HEADER] as string | undefined;

    // Set response header
    res.setHeader(REQUEST_ID_HEADER, requestId);

    // Create context
    const ctx: RequestContext = {
      requestId,
      traceId,
    };

    // Run next middleware within context
    requestContext.run(ctx, () => {
      next();
    });
  };
};

/**
 * Get current request context
 */
export const getRequestContext = (): RequestContext | undefined => {
  return requestContext.getStore();
};

/**
 * Get current request ID
 */
export const getRequestId = (): string | undefined => {
  return requestContext.getStore()?.requestId;
};

/**
 * Set additional context (e.g., after authentication)
 */
export const setRequestContextValue = <K extends keyof RequestContext>(
  key: K,
  value: RequestContext[K]
): void => {
  const ctx = requestContext.getStore();
  if (ctx) {
    ctx[key] = value;
  }
};

/**
 * Create headers for outgoing requests with context propagation
 */
export const createPropagationHeaders = (): Record<string, string> => {
  const ctx = getRequestContext();
  const headers: Record<string, string> = {};

  if (ctx?.requestId) {
    headers[REQUEST_ID_HEADER] = ctx.requestId;
  }
  if (ctx?.traceId) {
    headers[TRACE_ID_HEADER] = ctx.traceId;
  }

  return headers;
};
```

#### Enhanced Logger with Request Context

**File**: Update `packages/shared/src/core/logger.ts`

```typescript
import { getRequestId, getCurrentTraceId } from '../observability/index.js';

// Add to log method
const enrichWithContext = (meta: Record<string, unknown>): Record<string, unknown> => {
  const requestId = getRequestId();
  const traceId = getCurrentTraceId();

  return {
    ...meta,
    ...(requestId && { requestId }),
    ...(traceId && { traceId }),
  };
};

// Use in each log level
info(message: string, meta?: Record<string, unknown>): void {
  this.log('info', message, enrichWithContext(meta || {}));
}
```

---

## 2. Resilience Patterns

### 2.1 Enhanced Circuit Breaker

**Problem**: Current circuit breaker only exists in `resilientClient.ts`, not for all external calls.

**Solution**: Create a reusable circuit breaker that can wrap any async operation.

#### Implementation

**File**: `packages/shared/src/resilience/circuitBreaker.ts`

```typescript
/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by stopping calls to failing services.
 */

import { circuitBreakerState } from "../observability/metrics.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger("circuit-breaker");

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Name for identification and metrics */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery */
  resetTimeout: number;
  /** Number of successful calls in half-open to close circuit */
  successThreshold: number;
  /** Timeout for each call in ms */
  callTimeout?: number;
  /** Custom failure detection */
  isFailure?: (error: unknown) => boolean;
  /** Called when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalCalls: number;
  totalFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private nextAttempt: Date | null = null;
  private totalCalls = 0;
  private totalFailures = 0;

  constructor(private readonly config: CircuitBreakerConfig) {
    this.updateMetric();
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === "open") {
      if (this.nextAttempt && new Date() < this.nextAttempt) {
        throw new CircuitOpenError(this.config.name, this.nextAttempt);
      }
      // Try half-open
      this.transitionTo("half-open");
    }

    try {
      // Execute with optional timeout
      const result = this.config.callTimeout
        ? await this.withTimeout(operation, this.config.callTimeout)
        : await operation();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Get current circuit breaker stats
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo("closed");
    this.failures = 0;
    this.successes = 0;
  }

  private onSuccess(): void {
    this.lastSuccess = new Date();

    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo("closed");
        this.failures = 0;
        this.successes = 0;
      }
    } else {
      // Reset failure count on success in closed state
      this.failures = 0;
    }
  }

  private onFailure(error: unknown): void {
    const isFailure = this.config.isFailure?.(error) ?? true;
    if (!isFailure) return;

    this.failures++;
    this.totalFailures++;
    this.lastFailure = new Date();

    logger.warn("Circuit breaker recorded failure", {
      name: this.config.name,
      failures: this.failures,
      threshold: this.config.failureThreshold,
      state: this.state,
    });

    if (this.state === "half-open") {
      // Any failure in half-open immediately opens circuit
      this.transitionTo("open");
    } else if (this.failures >= this.config.failureThreshold) {
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    logger.info("Circuit breaker state change", {
      name: this.config.name,
      from: oldState,
      to: newState,
    });

    if (newState === "open") {
      this.nextAttempt = new Date(Date.now() + this.config.resetTimeout);
      this.successes = 0;
    }

    this.updateMetric();
    this.config.onStateChange?.(oldState, newState);
  }

  private updateMetric(): void {
    const stateValue = this.state === "closed" ? 0 : this.state === "open" ? 1 : 0.5;
    circuitBreakerState.set({ service: this.config.name }, stateValue);
  }

  private async withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new TimeoutError(this.config.name, timeoutMs)), timeoutMs);
      }),
    ]);
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfter: Date
  ) {
    super(`Circuit breaker '${circuitName}' is open. Retry after ${retryAfter.toISOString()}`);
    this.name = "CircuitOpenError";
  }
}

export class TimeoutError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly timeoutMs: number
  ) {
    super(`Operation in circuit '${circuitName}' timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

// ==================== Circuit Breaker Registry ====================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker
 */
export const getCircuitBreaker = (config: CircuitBreakerConfig): CircuitBreaker => {
  let breaker = circuitBreakers.get(config.name);
  if (!breaker) {
    breaker = new CircuitBreaker(config);
    circuitBreakers.set(config.name, breaker);
  }
  return breaker;
};

/**
 * Get all circuit breaker stats
 */
export const getAllCircuitBreakerStats = (): Record<string, CircuitBreakerStats> => {
  const stats: Record<string, CircuitBreakerStats> = {};
  circuitBreakers.forEach((breaker, name) => {
    stats[name] = breaker.getStats();
  });
  return stats;
};

// ==================== Pre-configured Circuit Breakers ====================

export const CIRCUIT_BREAKER_CONFIGS = {
  GITHUB_API: {
    name: "github-api",
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    successThreshold: 2,
    callTimeout: 10000,
    isFailure: (error: unknown) => {
      // Don't count 404s as failures
      if (error instanceof Error && "status" in error) {
        return (error as { status: number }).status >= 500;
      }
      return true;
    },
  },
  OPENAI_API: {
    name: "openai-api",
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    successThreshold: 1,
    callTimeout: 30000,
  },
  SLACK_API: {
    name: "slack-api",
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
    callTimeout: 5000,
  },
  DATABASE: {
    name: "database",
    failureThreshold: 3,
    resetTimeout: 10000,
    successThreshold: 1,
    callTimeout: 5000,
  },
  REDIS: {
    name: "redis",
    failureThreshold: 5,
    resetTimeout: 5000,
    successThreshold: 1,
    callTimeout: 1000,
  },
} as const;
```

---

### 2.2 Graceful Degradation

**Problem**: Services don't have fallback behavior when dependencies fail.

**Solution**: Implement graceful degradation strategies.

#### Implementation

**File**: `packages/shared/src/resilience/degradation.ts`

```typescript
/**
 * Graceful Degradation Patterns
 *
 * Provides fallback behavior when services are unavailable.
 */

import { createLogger } from "../core/logger.js";

const logger = createLogger("degradation");

export interface DegradationConfig<T> {
  /** Primary operation */
  primary: () => Promise<T>;
  /** Fallback when primary fails */
  fallback: () => Promise<T> | T;
  /** Whether to use fallback (e.g., when circuit is open) */
  shouldDegrade?: () => boolean;
  /** Name for logging */
  name: string;
  /** Track degradation metrics */
  onDegrade?: (error: unknown) => void;
}

/**
 * Execute with fallback on failure
 */
export const withFallback = async <T>(config: DegradationConfig<T>): Promise<T> => {
  // Check if we should preemptively degrade
  if (config.shouldDegrade?.()) {
    logger.info("Preemptive degradation", { name: config.name });
    config.onDegrade?.(new Error("Preemptive degradation"));
    return config.fallback();
  }

  try {
    return await config.primary();
  } catch (error) {
    logger.warn("Degrading to fallback", {
      name: config.name,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    config.onDegrade?.(error);
    return config.fallback();
  }
};

// ==================== Specific Degradation Strategies ====================

/**
 * Cache-first with database fallback
 */
export const cacheFirstWithDbFallback = async <T>(
  cacheGet: () => Promise<T | null>,
  dbGet: () => Promise<T>,
  cacheSet: (value: T) => Promise<void>
): Promise<T> => {
  // Try cache first
  const cached = await cacheGet().catch(() => null);
  if (cached !== null) {
    return cached;
  }

  // Fall back to database
  const value = await dbGet();

  // Attempt to populate cache (fire and forget)
  cacheSet(value).catch((error) => {
    logger.warn("Failed to populate cache", { error });
  });

  return value;
};

/**
 * Analysis with cached result fallback
 */
export interface AnalysisFallbackConfig {
  repository: string;
  commitSha: string;
  checkName: string;
  getCachedAnalysis: () => Promise<unknown | null>;
  performAnalysis: () => Promise<unknown>;
  cacheAnalysis: (result: unknown) => Promise<void>;
}

export const analysisWithCacheFallback = async (
  config: AnalysisFallbackConfig
): Promise<unknown> => {
  // Try to get cached analysis first
  try {
    const cached = await config.getCachedAnalysis();
    if (cached) {
      logger.info("Using cached analysis", {
        repository: config.repository,
        commitSha: config.commitSha.slice(0, 7),
      });
      return cached;
    }
  } catch (error) {
    logger.warn("Cache lookup failed, proceeding with analysis", { error });
  }

  // Perform analysis
  const result = await config.performAnalysis();

  // Cache result (fire and forget)
  config.cacheAnalysis(result).catch((error) => {
    logger.warn("Failed to cache analysis", { error });
  });

  return result;
};

/**
 * Slack notification with queue fallback
 */
export const slackWithQueueFallback = async (
  sendDirect: () => Promise<void>,
  queueForLater: () => Promise<void>
): Promise<{ sent: boolean; queued: boolean }> => {
  try {
    await sendDirect();
    return { sent: true, queued: false };
  } catch (error) {
    logger.warn("Direct Slack send failed, queueing", { error });
    await queueForLater();
    return { sent: false, queued: true };
  }
};

/**
 * Multi-level fallback chain
 */
export const fallbackChain = async <T>(
  operations: Array<{
    name: string;
    execute: () => Promise<T>;
  }>,
  defaultValue?: T
): Promise<T> => {
  const errors: Array<{ name: string; error: unknown }> = [];

  for (const op of operations) {
    try {
      return await op.execute();
    } catch (error) {
      errors.push({ name: op.name, error });
      logger.warn("Fallback operation failed", {
        name: op.name,
        error: error instanceof Error ? error.message : "Unknown",
      });
    }
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw new Error(`All fallback operations failed: ${errors.map((e) => e.name).join(", ")}`);
};
```

---

### 2.3 Retry with Backoff

**Problem**: Need consistent retry behavior across all operations.

**Solution**: Create a reusable retry utility with exponential backoff.

#### Implementation

**File**: `packages/shared/src/resilience/retry.ts`

```typescript
/**
 * Retry Utilities with Exponential Backoff
 */

import { createLogger } from "../core/logger.js";

const logger = createLogger("retry");

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelay: number;
  /** Maximum delay in ms */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Add jitter to prevent thundering herd */
  jitter: boolean;
  /** Custom retry condition */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: () => true,
};

/**
 * Calculate delay for a given attempt
 */
const calculateDelay = (attempt: number, config: RetryConfig): number => {
  let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, config.maxDelay);

  if (config.jitter) {
    // Add ±25% jitter
    const jitterFactor = 0.75 + Math.random() * 0.5;
    delay *= jitterFactor;
  }

  return Math.round(delay);
};

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute operation with retry
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> => {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === fullConfig.maxAttempts;
      const shouldRetry = fullConfig.shouldRetry?.(error, attempt) ?? true;

      if (isLastAttempt || !shouldRetry) {
        break;
      }

      const delay = calculateDelay(attempt, fullConfig);

      logger.warn("Operation failed, retrying", {
        attempt,
        maxAttempts: fullConfig.maxAttempts,
        delay,
        error: error instanceof Error ? error.message : "Unknown",
      });

      fullConfig.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }

  throw lastError;
};

/**
 * Retry configuration presets
 */
export const RETRY_PRESETS = {
  /** For idempotent API calls */
  API_CALL: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
  },
  /** For database operations */
  DATABASE: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 2000,
    backoffMultiplier: 2,
    jitter: true,
  },
  /** For Redis operations */
  REDIS: {
    maxAttempts: 2,
    initialDelay: 50,
    maxDelay: 500,
    backoffMultiplier: 2,
    jitter: false,
  },
  /** For webhook delivery */
  WEBHOOK: {
    maxAttempts: 5,
    initialDelay: 5000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitter: true,
  },
} as const;

/**
 * Check if error is retryable
 */
export const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  // Network errors
  if ("code" in error) {
    const code = (error as { code: string }).code;
    const retryableCodes = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE"];
    if (retryableCodes.includes(code)) return true;
  }

  // HTTP status codes
  if ("status" in error) {
    const status = (error as { status: number }).status;
    // Retry on 429 (rate limit), 502, 503, 504 (server errors)
    if ([429, 502, 503, 504].includes(status)) return true;
  }

  // OpenAI specific
  if (error.message.includes("Rate limit")) return true;
  if (error.message.includes("timeout")) return true;

  return false;
};
```

---

## 3. Testing Improvements

### 3.1 Integration Test Framework

**Problem**: No end-to-end tests for multi-service flows.

**Solution**: Create integration test infrastructure using Docker Compose.

#### Implementation

**File**: `docker-compose.test.yml`

```yaml
version: "3.8"

services:
  postgres-test:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: kenchi_test
    ports:
      - "5434:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test -d kenchi_test"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Mock external services
  mock-openai:
    build:
      context: ./tests/mocks
      dockerfile: Dockerfile.openai
    ports:
      - "8080:8080"
    environment:
      MOCK_RESPONSE_DELAY: 100

  mock-github:
    build:
      context: ./tests/mocks
      dockerfile: Dockerfile.github
    ports:
      - "8081:8081"

  mock-slack:
    build:
      context: ./tests/mocks
      dockerfile: Dockerfile.slack
    ports:
      - "8082:8082"
```

**File**: `tests/integration/setup.ts`

```typescript
/**
 * Integration Test Setup
 *
 * Configures test environment with Docker services.
 */

import { execSync } from "child_process";
import { initDatabase, closeDatabase } from "@kenchi/shared";

const DOCKER_COMPOSE_FILE = "docker-compose.test.yml";

export const setupIntegrationTests = async (): Promise<void> => {
  // Start Docker services
  console.log("Starting test infrastructure...");
  execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} up -d`, { stdio: "inherit" });

  // Wait for services to be healthy
  await waitForServices();

  // Run database migrations
  await initDatabase({
    connectionString:
      process.env.TEST_DATABASE_URL || "postgresql://test:test@localhost:5434/kenchi_test",
    maxConnections: 5,
    idleTimeoutMs: 10000,
  });
};

export const teardownIntegrationTests = async (): Promise<void> => {
  await closeDatabase();

  console.log("Stopping test infrastructure...");
  execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} down -v`, { stdio: "inherit" });
};

const waitForServices = async (): Promise<void> => {
  const maxWait = 60000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      // Check all services
      await Promise.all([checkPostgres(), checkRedis()]);
      console.log("All services ready");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw new Error("Services did not become ready in time");
};

const checkPostgres = async (): Promise<void> => {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: "postgresql://test:test@localhost:5434/kenchi_test",
  });
  await client.connect();
  await client.query("SELECT 1");
  await client.end();
};

const checkRedis = async (): Promise<void> => {
  const { createClient } = await import("redis");
  const client = createClient({ url: "redis://localhost:6380" });
  await client.connect();
  await client.ping();
  await client.quit();
};
```

**File**: `tests/integration/ci-failure-flow.test.ts`

```typescript
/**
 * Integration Test: CI Failure Analysis Flow
 *
 * Tests the complete flow from GitHub webhook to Slack notification.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import crypto from "crypto";
import { setupIntegrationTests, teardownIntegrationTests } from "./setup";

describe("CI Failure Analysis Flow", () => {
  let githubAppServer: string;
  let slackBotServer: string;
  let apiServer: string;

  beforeAll(async () => {
    await setupIntegrationTests();

    // Start services
    githubAppServer = "http://localhost:3002";
    slackBotServer = "http://localhost:3001";
    apiServer = "http://localhost:3000";
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  it("should process check_run failure and post to Slack", async () => {
    // Create webhook payload
    const payload = createCheckRunPayload({
      conclusion: "failure",
      checkName: "build",
      repository: "test-org/test-repo",
    });

    // Sign webhook
    const signature = signWebhook(payload, process.env.GITHUB_WEBHOOK_SECRET!);

    // Send webhook to GitHub App
    const webhookResponse = await request(githubAppServer)
      .post("/webhook/github")
      .set("X-GitHub-Event", "check_run")
      .set("X-Hub-Signature-256", signature)
      .send(payload);

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body.handled).toBe(true);

    // Wait for aggregation and processing
    await new Promise((r) => setTimeout(r, 5000));

    // Verify Slack message was sent (check mock)
    const slackMessages = await getSlackMockMessages();
    expect(slackMessages.length).toBeGreaterThan(0);

    const message = slackMessages[0];
    expect(message.channel).toBeDefined();
    expect(message.blocks).toBeDefined();
  });

  it("should handle rate limiting correctly", async () => {
    // Send many requests quickly
    const requests = Array.from({ length: 50 }, () =>
      request(apiServer).post("/api/analyze").send({ failure_log: "test", repository: "test/repo" })
    );

    const responses = await Promise.all(requests);

    // Some should be rate limited
    const rateLimited = responses.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});

// Helper functions
const createCheckRunPayload = (options: {
  conclusion: string;
  checkName: string;
  repository: string;
}) => ({
  action: "completed",
  check_run: {
    id: 12345,
    name: options.checkName,
    conclusion: options.conclusion,
    head_sha: "abc123def456",
    output: {
      title: "Build Failed",
      summary: "TypeScript compilation failed",
    },
    pull_requests: [{ number: 1 }],
  },
  repository: {
    full_name: options.repository,
    owner: { login: "test-org" },
    name: "test-repo",
  },
  installation: { id: 12345678 },
});

const signWebhook = (payload: object, secret: string): string => {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${signature}`;
};

const getSlackMockMessages = async (): Promise<Array<{ channel: string; blocks: unknown[] }>> => {
  const response = await fetch("http://localhost:8082/mock/messages");
  return response.json();
};
```

---

### 3.2 Improved Mock Strategy

**Problem**: Test mocks duplicate constants and break when constants change.

**Solution**: Use `jest.requireActual` pattern consistently.

#### Implementation

**File**: `tests/helpers/sharedMock.ts`

```typescript
/**
 * Shared Mock Helper
 *
 * Provides consistent mocking pattern that preserves real constants.
 */

import { jest } from "@jest/globals";

/**
 * Create a mock for @kenchi/shared that preserves constants
 */
export const createSharedMock = (overrides: Record<string, unknown> = {}) => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;

  return {
    // Preserve all constants
    ...actual,

    // Mock infrastructure that makes network calls
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },

    // Mock external clients
    OpenAIClient: jest.fn().mockImplementation(() => ({
      analyzeIncident: jest.fn().mockResolvedValue({
        summary: "Test analysis",
        rootCause: "Test cause",
        recommendations: [],
      }),
    })),

    // Mock database functions
    initDatabase: jest.fn().mockResolvedValue(undefined),
    closeDatabase: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),

    // Mock cache functions
    cacheGet: jest.fn().mockResolvedValue(null),
    cacheSet: jest.fn().mockResolvedValue(undefined),
    cacheDelete: jest.fn().mockResolvedValue(undefined),

    // Mock Redis
    getRedisClient: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1),
    }),
    isRedisHealthy: jest.fn().mockResolvedValue(true),
    closeRedis: jest.fn().mockResolvedValue(undefined),

    // Apply custom overrides
    ...overrides,
  };
};

/**
 * Mock @kenchi/shared with preserved constants
 */
export const mockShared = (overrides: Record<string, unknown> = {}): void => {
  jest.mock("@kenchi/shared", () => createSharedMock(overrides));
};

/**
 * Create mock for Express request
 */
export const createMockRequest = (
  overrides: Partial<{
    method: string;
    path: string;
    body: unknown;
    params: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
  }> = {}
) => ({
  method: "GET",
  path: "/test",
  body: {},
  params: {},
  query: {},
  headers: {},
  ip: "127.0.0.1",
  ...overrides,
});

/**
 * Create mock for Express response
 */
export const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    headersSent: false,
  };
  return res;
};

/**
 * Create mock for Express next function
 */
export const createMockNext = () => jest.fn();
```

#### Usage in Tests

```typescript
// In test file
import {
  createSharedMock,
  createMockRequest,
  createMockResponse,
} from "../../tests/helpers/sharedMock";

jest.mock("@kenchi/shared", () =>
  createSharedMock({
    // Only override what this specific test needs
    findByGitHubInstallation: jest.fn().mockResolvedValue({
      id: "tenant-123",
      githubOrg: "test-org",
    }),
  })
);
```

---

## 4. Security Hardening

### 4.1 Input Validation Enhancement

**Problem**: Current validation is minimal, could allow injection attacks.

**Solution**: Add comprehensive input validation with sanitization.

#### Implementation

**File**: `packages/shared/src/security/inputValidation.ts`

```typescript
/**
 * Input Validation and Sanitization
 */

import { ValidationError } from "../core/errors.js";

// ==================== Sanitization ====================

/**
 * Sanitize string input
 */
export const sanitizeString = (
  input: unknown,
  options: {
    maxLength?: number;
    trim?: boolean;
    lowercase?: boolean;
    removeHtml?: boolean;
  } = {}
): string => {
  if (typeof input !== "string") {
    throw new ValidationError("Expected string input");
  }

  let value = input;

  if (options.trim !== false) {
    value = value.trim();
  }

  if (options.maxLength && value.length > options.maxLength) {
    value = value.slice(0, options.maxLength);
  }

  if (options.lowercase) {
    value = value.toLowerCase();
  }

  if (options.removeHtml) {
    value = value.replace(/<[^>]*>/g, "");
  }

  // Remove null bytes
  value = value.replace(/\0/g, "");

  return value;
};

/**
 * Validate and sanitize repository name (owner/repo)
 */
export const validateRepository = (input: unknown): { owner: string; repo: string } => {
  const value = sanitizeString(input, { maxLength: 200 });

  const match = value.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (!match) {
    throw new ValidationError('Invalid repository format. Expected "owner/repo"');
  }

  return { owner: match[1], repo: match[2] };
};

/**
 * Validate commit SHA
 */
export const validateCommitSha = (input: unknown): string => {
  const value = sanitizeString(input, { maxLength: 40, lowercase: true });

  if (!/^[a-f0-9]{7,40}$/.test(value)) {
    throw new ValidationError("Invalid commit SHA format");
  }

  return value;
};

/**
 * Validate positive integer
 */
export const validatePositiveInteger = (
  input: unknown,
  options: {
    min?: number;
    max?: number;
    name?: string;
  } = {}
): number => {
  const num = typeof input === "string" ? parseInt(input, 10) : input;

  if (typeof num !== "number" || isNaN(num) || !Number.isInteger(num)) {
    throw new ValidationError(`${options.name || "Value"} must be an integer`);
  }

  if (num < (options.min ?? 1)) {
    throw new ValidationError(`${options.name || "Value"} must be at least ${options.min ?? 1}`);
  }

  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(`${options.name || "Value"} must be at most ${options.max}`);
  }

  return num;
};

/**
 * Validate Slack channel ID
 */
export const validateSlackChannelId = (input: unknown): string => {
  const value = sanitizeString(input, { maxLength: 20 });

  if (!/^[A-Z0-9]{9,11}$/.test(value)) {
    throw new ValidationError("Invalid Slack channel ID format");
  }

  return value;
};

/**
 * Validate Slack workspace ID
 */
export const validateSlackWorkspaceId = (input: unknown): string => {
  const value = sanitizeString(input, { maxLength: 20 });

  if (!/^T[A-Z0-9]{8,10}$/.test(value)) {
    throw new ValidationError("Invalid Slack workspace ID format");
  }

  return value;
};

/**
 * Validate URL
 */
export const validateUrl = (
  input: unknown,
  options: {
    protocols?: string[];
    requireHttps?: boolean;
  } = {}
): string => {
  const value = sanitizeString(input, { maxLength: 2000 });

  try {
    const url = new URL(value);
    const protocols = options.protocols || ["http:", "https:"];

    if (!protocols.includes(url.protocol)) {
      throw new ValidationError(`URL must use one of: ${protocols.join(", ")}`);
    }

    if (options.requireHttps && url.protocol !== "https:") {
      throw new ValidationError("URL must use HTTPS");
    }

    return value;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Invalid URL format");
  }
};

// ==================== Validation Schemas ====================

export interface ValidationRule<T> {
  validate: (input: unknown) => T;
  optional?: boolean;
  default?: T;
}

export type ValidationSchema<T> = {
  [K in keyof T]: ValidationRule<T[K]>;
};

/**
 * Validate object against schema
 */
export const validateObject = <T extends Record<string, unknown>>(
  input: unknown,
  schema: ValidationSchema<T>
): T => {
  if (typeof input !== "object" || input === null) {
    throw new ValidationError("Expected object input");
  }

  const result: Partial<T> = {};
  const inputObj = input as Record<string, unknown>;

  for (const [key, rule] of Object.entries(schema)) {
    const value = inputObj[key];

    if (value === undefined || value === null) {
      if (rule.optional) {
        if (rule.default !== undefined) {
          result[key as keyof T] = rule.default;
        }
        continue;
      }
      throw new ValidationError(`Missing required field: ${key}`);
    }

    try {
      result[key as keyof T] = rule.validate(value);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(`Invalid field '${key}': ${error.message}`);
      }
      throw error;
    }
  }

  return result as T;
};
```

---

### 4.2 Rate Limiting Enhancement

**Problem**: Rate limiting exists but lacks per-endpoint granularity and monitoring.

**Solution**: Add endpoint-specific rate limits with metrics.

#### Implementation

**File**: `packages/shared/src/http/advancedRateLimit.ts`

```typescript
/**
 * Advanced Rate Limiting with Per-Endpoint Configuration
 */

import { Request, Response, NextFunction } from "express";
import { createLogger } from "../core/logger.js";
import { getRedisClient } from "../queue/redisClient.js";

const logger = createLogger("rate-limit");

export interface EndpointRateLimitConfig {
  /** Requests per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key generator (default: IP) */
  keyGenerator?: (req: Request) => string;
  /** Skip condition */
  skip?: (req: Request) => boolean;
  /** Custom message */
  message?: string;
  /** Headers to include in response */
  headers?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  total: number;
}

/**
 * Check rate limit using Redis sliding window
 */
export const checkRateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> => {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Use Redis sorted set for sliding window
  const multi = redis.multi();

  // Remove old entries
  multi.zRemRangeByScore(key, 0, windowStart);

  // Add current request
  multi.zAdd(key, { score: now, value: `${now}:${Math.random()}` });

  // Count requests in window
  multi.zCard(key);

  // Set expiry
  multi.expire(key, windowSeconds);

  const results = await multi.exec();
  const count = (results?.[2] as number) || 0;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(now + windowSeconds * 1000),
    total: limit,
  };
};

/**
 * Create rate limit middleware for specific endpoint
 */
export const createEndpointRateLimiter = (
  endpointName: string,
  config: EndpointRateLimitConfig
) => {
  const {
    limit,
    windowSeconds,
    keyGenerator = (req) => req.ip || "unknown",
    skip,
    message = "Too many requests, please try again later",
    headers = true,
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Check skip condition
    if (skip?.(req)) {
      next();
      return;
    }

    const clientKey = keyGenerator(req);
    const rateLimitKey = `ratelimit:${endpointName}:${clientKey}`;

    try {
      const result = await checkRateLimit(rateLimitKey, limit, windowSeconds);

      // Set headers
      if (headers) {
        res.set("X-RateLimit-Limit", String(result.total));
        res.set("X-RateLimit-Remaining", String(result.remaining));
        res.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt.getTime() / 1000)));
      }

      if (!result.allowed) {
        logger.warn("Rate limit exceeded", {
          endpoint: endpointName,
          clientKey,
          limit,
          windowSeconds,
        });

        res.status(429).json({
          error: "rate_limit_exceeded",
          message,
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        });
        return;
      }

      next();
    } catch (error) {
      // On Redis error, allow request (fail open)
      logger.error("Rate limit check failed", { error, endpoint: endpointName });
      next();
    }
  };
};

// ==================== Predefined Rate Limits ====================

export const ENDPOINT_RATE_LIMITS = {
  ANALYZE: {
    limit: 10,
    windowSeconds: 60,
    message: "Analysis rate limit exceeded. Maximum 10 requests per minute.",
  },
  WEBHOOK: {
    limit: 100,
    windowSeconds: 60,
    message: "Webhook rate limit exceeded.",
  },
  SLACK_MESSAGE: {
    limit: 30,
    windowSeconds: 60,
    message: "Slack message rate limit exceeded.",
  },
  GITHUB_COMMENT: {
    limit: 20,
    windowSeconds: 60,
    message: "GitHub comment rate limit exceeded.",
  },
  OAUTH: {
    limit: 5,
    windowSeconds: 300,
    message: "OAuth rate limit exceeded. Please wait before retrying.",
  },
} as const;
```

---

## 5. Operational Improvements

### 5.1 Deep Health Checks

**Problem**: Current health checks are superficial, don't verify actual functionality.

**Solution**: Implement comprehensive health checks with dependency verification.

#### Implementation

**File**: `packages/shared/src/health/healthCheck.ts`

```typescript
/**
 * Comprehensive Health Check System
 */

import { createLogger } from "../core/logger.js";
import { getPool, isDatabaseHealthy } from "../database/client.js";
import { isRedisHealthy, getRedisClient } from "../queue/redisClient.js";

const logger = createLogger("health");

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ComponentHealth {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  components: Record<string, ComponentHealth>;
}

export interface HealthCheckConfig {
  serviceName: string;
  version: string;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  check: () => Promise<ComponentHealth>;
  critical?: boolean; // If critical check fails, overall status is unhealthy
  timeout?: number;
}

/**
 * Run health check with timeout
 */
const runCheck = async (check: HealthCheck): Promise<ComponentHealth> => {
  const timeout = check.timeout || 5000;
  const startTime = Date.now();

  try {
    const result = await Promise.race([
      check.check(),
      new Promise<ComponentHealth>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), timeout)
      ),
    ]);

    return {
      ...result,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - startTime,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Create health check handler
 */
export const createHealthChecker = (config: HealthCheckConfig) => {
  return async (): Promise<SystemHealth> => {
    const startTime = process.hrtime.bigint();
    const components: Record<string, ComponentHealth> = {};

    // Run all checks in parallel
    const results = await Promise.all(
      config.checks.map(async (check) => ({
        name: check.name,
        critical: check.critical ?? false,
        result: await runCheck(check),
      }))
    );

    // Aggregate results
    let overallStatus: HealthStatus = "healthy";

    for (const { name, critical, result } of results) {
      components[name] = result;

      if (result.status === "unhealthy" && critical) {
        overallStatus = "unhealthy";
      } else if (result.status !== "healthy" && overallStatus === "healthy") {
        overallStatus = "degraded";
      }
    }

    const endTime = process.hrtime.bigint();

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.version,
      components,
    };
  };
};

// ==================== Standard Health Checks ====================

export const databaseHealthCheck: HealthCheck = {
  name: "database",
  critical: true,
  timeout: 5000,
  check: async (): Promise<ComponentHealth> => {
    try {
      const pool = getPool();
      if (!pool) {
        return { status: "unhealthy", message: "Database pool not initialized" };
      }

      const startTime = Date.now();
      const result = await pool.query("SELECT 1 as check, NOW() as time");
      const latencyMs = Date.now() - startTime;

      // Check pool stats
      const { totalCount, idleCount, waitingCount } = pool;

      return {
        status: latencyMs < 100 ? "healthy" : "degraded",
        latencyMs,
        details: {
          poolTotal: totalCount,
          poolIdle: idleCount,
          poolWaiting: waitingCount,
          serverTime: result.rows[0]?.time,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Database check failed",
      };
    }
  },
};

export const redisHealthCheck: HealthCheck = {
  name: "redis",
  critical: false, // Redis failure shouldn't make service unhealthy
  timeout: 2000,
  check: async (): Promise<ComponentHealth> => {
    try {
      const client = getRedisClient();
      if (!client) {
        return { status: "degraded", message: "Redis client not initialized" };
      }

      const startTime = Date.now();
      const pong = await client.ping();
      const latencyMs = Date.now() - startTime;

      // Get memory info
      const info = await client.info("memory");
      const memoryMatch = info.match(/used_memory_human:(\S+)/);

      return {
        status: pong === "PONG" ? "healthy" : "degraded",
        latencyMs,
        details: {
          connected: true,
          memoryUsed: memoryMatch?.[1],
        },
      };
    } catch (error) {
      return {
        status: "degraded",
        message: error instanceof Error ? error.message : "Redis check failed",
      };
    }
  },
};

export const memoryHealthCheck: HealthCheck = {
  name: "memory",
  critical: false,
  check: async (): Promise<ComponentHealth> => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const heapPercentage = (usage.heapUsed / usage.heapTotal) * 100;

    let status: HealthStatus = "healthy";
    if (heapPercentage > 90) {
      status = "unhealthy";
    } else if (heapPercentage > 75) {
      status = "degraded";
    }

    return {
      status,
      details: {
        heapUsedMB,
        heapTotalMB,
        heapPercentage: Math.round(heapPercentage),
        rssMB: Math.round(usage.rss / 1024 / 1024),
      },
    };
  },
};

export const eventLoopHealthCheck: HealthCheck = {
  name: "eventLoop",
  critical: false,
  check: async (): Promise<ComponentHealth> => {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();

      setImmediate(() => {
        const lagNs = Number(process.hrtime.bigint() - start);
        const lagMs = lagNs / 1e6;

        let status: HealthStatus = "healthy";
        if (lagMs > 100) {
          status = "unhealthy";
        } else if (lagMs > 50) {
          status = "degraded";
        }

        resolve({
          status,
          details: {
            lagMs: Math.round(lagMs * 100) / 100,
          },
        });
      });
    });
  },
};
```

---

### 5.2 Configuration Validation

**Problem**: Invalid configuration causes runtime crashes.

**Solution**: Validate all configuration at startup with clear error messages.

#### Implementation

**File**: `packages/shared/src/core/configValidation.ts`

```typescript
/**
 * Configuration Validation at Startup
 */

import { createLogger } from "./logger.js";

const logger = createLogger("config");

export interface ConfigValidationRule {
  name: string;
  required?: boolean;
  validator?: (value: string) => boolean;
  transformer?: (value: string) => unknown;
  errorMessage?: string;
  sensitive?: boolean;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: Record<string, unknown>;
}

/**
 * Validate environment configuration
 */
export const validateConfig = (rules: ConfigValidationRule[]): ConfigValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: Record<string, unknown> = {};

  for (const rule of rules) {
    const value = process.env[rule.name];

    // Check required
    if (rule.required && !value) {
      errors.push(`Missing required environment variable: ${rule.name}`);
      continue;
    }

    if (!value) {
      continue;
    }

    // Validate
    if (rule.validator && !rule.validator(value)) {
      errors.push(rule.errorMessage || `Invalid value for ${rule.name}`);
      continue;
    }

    // Transform
    config[rule.name] = rule.transformer ? rule.transformer(value) : value;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config,
  };
};

/**
 * Log configuration status (masking sensitive values)
 */
export const logConfigStatus = (
  rules: ConfigValidationRule[],
  config: Record<string, unknown>
): void => {
  const status: Record<string, string> = {};

  for (const rule of rules) {
    const value = config[rule.name];

    if (value === undefined) {
      status[rule.name] = rule.required ? "MISSING" : "not set";
    } else if (rule.sensitive) {
      status[rule.name] = "****";
    } else {
      status[rule.name] = String(value).slice(0, 50);
    }
  }

  logger.info("Configuration loaded", status);
};

// ==================== Predefined Validation Rules ====================

export const COMMON_CONFIG_RULES: ConfigValidationRule[] = [
  {
    name: "NODE_ENV",
    required: false,
    validator: (v) => ["development", "production", "test"].includes(v),
    errorMessage: "NODE_ENV must be development, production, or test",
  },
  {
    name: "PORT",
    required: false,
    validator: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0 && parseInt(v) < 65536,
    transformer: (v) => parseInt(v),
    errorMessage: "PORT must be a valid port number",
  },
];

export const OPENAI_CONFIG_RULES: ConfigValidationRule[] = [
  {
    name: "OPENAI_API_KEY",
    required: true,
    validator: (v) => v.startsWith("sk-") && v.length > 20,
    errorMessage: "OPENAI_API_KEY must be a valid OpenAI API key",
    sensitive: true,
  },
  {
    name: "OPENAI_MODEL",
    required: false,
    validator: (v) => v.startsWith("gpt-"),
    errorMessage: "OPENAI_MODEL must be a valid GPT model name",
  },
];

export const DATABASE_CONFIG_RULES: ConfigValidationRule[] = [
  {
    name: "DATABASE_URL",
    required: true,
    validator: (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
    errorMessage: "DATABASE_URL must be a valid PostgreSQL connection string",
    sensitive: true,
  },
];

export const REDIS_CONFIG_RULES: ConfigValidationRule[] = [
  {
    name: "REDIS_URL",
    required: false,
    validator: (v) => v.startsWith("redis://") || v.startsWith("rediss://"),
    errorMessage: "REDIS_URL must be a valid Redis connection string",
    sensitive: true,
  },
];

export const SLACK_CONFIG_RULES: ConfigValidationRule[] = [
  {
    name: "SLACK_BOT_TOKEN",
    required: true,
    validator: (v) => v.startsWith("xoxb-"),
    errorMessage: "SLACK_BOT_TOKEN must be a valid Slack bot token",
    sensitive: true,
  },
  {
    name: "SLACK_SIGNING_SECRET",
    required: true,
    validator: (v) => v.length >= 20,
    errorMessage: "SLACK_SIGNING_SECRET must be at least 20 characters",
    sensitive: true,
  },
  {
    name: "SLACK_APP_LEVEL_TOKEN",
    required: true,
    validator: (v) => v.startsWith("xapp-"),
    errorMessage: "SLACK_APP_LEVEL_TOKEN must be a valid Slack app token",
    sensitive: true,
  },
];

export const GITHUB_CONFIG_RULES: ConfigValidationRule[] = [
  {
    name: "GITHUB_APP_ID",
    required: true,
    validator: (v) => !isNaN(parseInt(v)),
    transformer: (v) => parseInt(v),
    errorMessage: "GITHUB_APP_ID must be a number",
  },
  {
    name: "GITHUB_PRIVATE_KEY",
    required: true,
    validator: (v) => v.includes("-----BEGIN"),
    errorMessage: "GITHUB_PRIVATE_KEY must be a valid PEM private key",
    sensitive: true,
  },
  {
    name: "GITHUB_WEBHOOK_SECRET",
    required: true,
    validator: (v) => v.length >= 10,
    errorMessage: "GITHUB_WEBHOOK_SECRET must be at least 10 characters",
    sensitive: true,
  },
];

/**
 * Validate and exit on failure
 */
export const validateConfigOrExit = (
  serviceName: string,
  rules: ConfigValidationRule[]
): Record<string, unknown> => {
  const result = validateConfig(rules);

  if (!result.valid) {
    logger.error("Configuration validation failed", {
      service: serviceName,
      errors: result.errors,
    });

    console.error("\n=== Configuration Errors ===");
    result.errors.forEach((err) => console.error(`  - ${err}`));
    console.error("\nPlease fix the above configuration issues and restart.");

    process.exit(1);
  }

  if (result.warnings.length > 0) {
    logger.warn("Configuration warnings", { warnings: result.warnings });
  }

  logConfigStatus(rules, result.config);
  return result.config;
};
```

---

## 6. Performance Optimization

### 6.1 Database Query Optimization

**Problem**: No query performance monitoring or batch operations.

**Solution**: Add query instrumentation and batch utilities.

#### Implementation

**File**: `packages/shared/src/database/queryOptimization.ts`

```typescript
/**
 * Database Query Optimization Utilities
 */

import { getPool } from "./client.js";
import { dbQueryDuration } from "../observability/metrics.js";
import { createLogger } from "../core/logger.js";
import { withSpan } from "../observability/tracing.js";

const logger = createLogger("db");

const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * Execute query with metrics and tracing
 */
export const instrumentedQuery = async <T>(
  operation: string,
  table: string,
  queryFn: () => Promise<T>
): Promise<T> => {
  const startTime = Date.now();

  try {
    const result = await withSpan("database", `db.${operation}`, async (span) => {
      span.setAttributes({
        "db.operation": operation,
        "db.table": table,
      });
      return queryFn();
    });

    const duration = Date.now() - startTime;
    dbQueryDuration.observe({ operation, table }, duration / 1000);

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn("Slow query detected", {
        operation,
        table,
        durationMs: duration,
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    dbQueryDuration.observe({ operation, table }, duration / 1000);
    throw error;
  }
};

/**
 * Batch insert with chunking
 */
export const batchInsert = async <T extends Record<string, unknown>>(
  table: string,
  records: T[],
  options: {
    chunkSize?: number;
    onConflict?: string;
  } = {}
): Promise<number> => {
  const { chunkSize = 1000, onConflict } = options;
  const pool = getPool();
  if (!pool) throw new Error("Database not initialized");

  let totalInserted = 0;

  // Process in chunks
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);

    if (chunk.length === 0) continue;

    const columns = Object.keys(chunk[0]);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((record, rowIndex) => {
      const rowPlaceholders: string[] = [];
      columns.forEach((col, colIndex) => {
        const paramIndex = rowIndex * columns.length + colIndex + 1;
        rowPlaceholders.push(`$${paramIndex}`);
        values.push(record[col]);
      });
      placeholders.push(`(${rowPlaceholders.join(", ")})`);
    });

    let sql = `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES ${placeholders.join(", ")}
    `;

    if (onConflict) {
      sql += ` ON CONFLICT ${onConflict}`;
    }

    const result = await instrumentedQuery("batch_insert", table, () => pool.query(sql, values));

    totalInserted += result.rowCount ?? 0;
  }

  return totalInserted;
};

/**
 * Batch update with single query
 */
export const batchUpdate = async <T extends { id: string | number }>(
  table: string,
  records: T[],
  updateColumns: (keyof T)[]
): Promise<number> => {
  if (records.length === 0) return 0;

  const pool = getPool();
  if (!pool) throw new Error("Database not initialized");

  // Build VALUES clause
  const values: unknown[] = [];
  const valueRows: string[] = [];

  records.forEach((record, rowIndex) => {
    const rowValues: string[] = [];
    values.push(record.id);
    rowValues.push(`$${values.length}`);

    updateColumns.forEach((col) => {
      values.push(record[col]);
      rowValues.push(`$${values.length}`);
    });

    valueRows.push(`(${rowValues.join(", ")})`);
  });

  const updateSet = updateColumns.map((col) => `${String(col)} = v.${String(col)}`).join(", ");

  const sql = `
    UPDATE ${table} AS t
    SET ${updateSet}
    FROM (VALUES ${valueRows.join(", ")})
    AS v(id, ${updateColumns.join(", ")})
    WHERE t.id = v.id
  `;

  const result = await instrumentedQuery("batch_update", table, () => pool.query(sql, values));

  return result.rowCount ?? 0;
};

/**
 * Parallel fetch with connection pooling
 */
export const parallelFetch = async <T>(
  queries: Array<{
    name: string;
    query: string;
    params?: unknown[];
  }>
): Promise<Record<string, T[]>> => {
  const pool = getPool();
  if (!pool) throw new Error("Database not initialized");

  const results = await Promise.all(
    queries.map(async ({ name, query, params }) => {
      const result = await instrumentedQuery("select", name, () => pool.query(query, params));
      return { name, rows: result.rows as T[] };
    })
  );

  return results.reduce(
    (acc, { name, rows }) => {
      acc[name] = rows;
      return acc;
    },
    {} as Record<string, T[]>
  );
};
```

---

## Implementation Timeline

### Phase 1: Foundation (Week 1-2)

| Task                         | Priority | Effort | Dependencies |
| ---------------------------- | -------- | ------ | ------------ |
| Add Prometheus metrics       | P0       | Medium | None         |
| Add request ID propagation   | P0       | Low    | None         |
| Add configuration validation | P2       | Low    | None         |
| Update test mock strategy    | P1       | Medium | None         |

### Phase 2: Observability (Week 3-4)

| Task                        | Priority | Effort | Dependencies |
| --------------------------- | -------- | ------ | ------------ |
| Add OpenTelemetry tracing   | P0       | High   | Metrics      |
| Add deep health checks      | P1       | Medium | None         |
| Add /metrics endpoint       | P0       | Low    | Metrics      |
| Add circuit breaker metrics | P1       | Low    | Metrics      |

### Phase 3: Resilience (Week 5-6)

| Task                       | Priority | Effort | Dependencies    |
| -------------------------- | -------- | ------ | --------------- |
| Enhanced circuit breaker   | P1       | Medium | Metrics         |
| Graceful degradation       | P1       | Medium | Circuit breaker |
| Retry utilities            | P1       | Low    | None            |
| Rate limiting per-endpoint | P1       | Medium | Metrics         |

### Phase 4: Testing (Week 7-8)

| Task                       | Priority | Effort | Dependencies |
| -------------------------- | -------- | ------ | ------------ |
| Integration test framework | P1       | High   | None         |
| Docker Compose for tests   | P1       | Medium | None         |
| Mock service containers    | P1       | Medium | Docker       |
| E2E test suite             | P1       | High   | All above    |

### Phase 5: Security & Polish (Week 9-10)

| Task                         | Priority | Effort | Dependencies |
| ---------------------------- | -------- | ------ | ------------ |
| Input validation enhancement | P2       | Medium | None         |
| OpenAPI documentation        | P3       | Medium | None         |
| Operational runbook          | P3       | Medium | All above    |
| Coverage increase to 80%     | P3       | High   | None         |

---

## Appendix A: File Structure

```
packages/shared/src/
├── observability/
│   ├── index.ts
│   ├── metrics.ts
│   ├── metricsMiddleware.ts
│   ├── tracing.ts
│   └── requestId.ts
├── resilience/
│   ├── index.ts
│   ├── circuitBreaker.ts
│   ├── degradation.ts
│   └── retry.ts
├── health/
│   ├── index.ts
│   └── healthCheck.ts
├── security/
│   ├── index.ts (existing)
│   ├── redaction.ts (existing)
│   └── inputValidation.ts
└── ...existing modules

tests/
├── integration/
│   ├── setup.ts
│   ├── ci-failure-flow.test.ts
│   └── ...
├── helpers/
│   └── sharedMock.ts
└── mocks/
    ├── Dockerfile.openai
    ├── Dockerfile.github
    └── Dockerfile.slack
```

---

## Appendix B: Metrics Reference

| Metric                                  | Type      | Labels                              | Description             |
| --------------------------------------- | --------- | ----------------------------------- | ----------------------- |
| `kenchi_http_requests_total`            | Counter   | method, route, status_code, service | Total HTTP requests     |
| `kenchi_http_request_duration_seconds`  | Histogram | method, route, status_code, service | Request latency         |
| `kenchi_external_calls_total`           | Counter   | service, operation, status          | External API calls      |
| `kenchi_external_call_duration_seconds` | Histogram | service, operation                  | External call latency   |
| `kenchi_circuit_breaker_state`          | Gauge     | service                             | Circuit state (0/0.5/1) |
| `kenchi_cache_operations_total`         | Counter   | operation, result                   | Cache ops               |
| `kenchi_queue_depth`                    | Gauge     | queue_name                          | Queue size              |
| `kenchi_analysis_total`                 | Counter   | repository, result, cached          | Analyses performed      |
| `kenchi_analysis_confidence`            | Histogram | repository                          | Confidence distribution |
| `kenchi_db_query_duration_seconds`      | Histogram | operation, table                    | DB query latency        |

---

## Appendix C: Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "components": {
    "database": {
      "status": "healthy",
      "latencyMs": 5,
      "details": {
        "poolTotal": 10,
        "poolIdle": 8,
        "poolWaiting": 0
      }
    },
    "redis": {
      "status": "healthy",
      "latencyMs": 2,
      "details": {
        "connected": true,
        "memoryUsed": "15.5M"
      }
    },
    "memory": {
      "status": "healthy",
      "details": {
        "heapUsedMB": 128,
        "heapTotalMB": 256,
        "heapPercentage": 50
      }
    },
    "eventLoop": {
      "status": "healthy",
      "details": {
        "lagMs": 1.5
      }
    }
  }
}
```
