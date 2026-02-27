# Multi-Tenant Architectural Design Review

**Date**: 2026-02-27
**Scope**: Broad architectural patterns, resilience, observability, and scaling concerns outside of the immediate authentication domain.

---

## Executive Summary

While Kenchi has strong foundational data isolation (Row-Level Security, tenantId scope checking) and authentication primitives, it lacks mature **resilience and observability patterns** necessary for a robust, multi-tenant enterprise architecture. The system currently assumes a "happy path" for external dependencies and background processing, which will lead to cascading failures and difficult-to-debug incidents under load or when integrations fail.

---

## 1. Background Jobs & Queue Resilience

### Missing: Dead Letter Queues (DLQ) and Retry Backoff

**Status**: ❌ Not Implemented
**Finding**: The Redis-based queue implementation (`packages/shared/src/queue/messageQueue.ts`) processes jobs but lacks a sophisticated retry mechanism with exponential backoff and a Dead Letter Queue (DLQ) for permanently failed jobs.

**Impact**:

- If an external API (like GitHub) is down, background jobs processing webhooks or syncing data will fail and either be dropped or retried aggressively, causing stampedes when the service recovers.
- No visibility into "poison pill" jobs that constantly crash workers.

**Recommendation**:

- Migrate from the custom Redis queue to a robust, battle-tested library like **BullMQ**.
- Implement a DLQ routing strategy: after N failed attempts (with exponential backoff), move jobs to a separate DLQ for manual inspection and replay.

### Missing: Fair Scheduling

**Status**: ❌ Built but Unused
**Finding**: A `fairScheduler.ts` exists which implements per-tenant fair scheduling (to prevent one very active tenant from starving the background queue). However, the actual workers (like `analysisWorker.ts`) are still using a standard FIFO queue.

**Recommendation**:

- Wire in `fairScheduler.ts` to the `ciAnalysisQueue` and other high-volume queues. This ensures consistent QoS across tenants.

---

## 2. External Integration Resilience

### Missing: Circuit Breakers and External Timeouts

**Status**: ❌ Not Implemented
**Finding**: Integrations (e.g., calling GitHub, GitLab, Slack endpoints) lack circuit breakers and explicit outbound request timeouts. The standard node-fetch or internal HTTP clients do not employ `AbortController` consistently with bounded timeouts.

**Impact**:

- **Cascading Failures**: If GitHub API slows down, Kenchi's API threads will block waiting for responses. This exhausts the Node.js event loop and the database connection pool, taking down Kenchi entirely.
- **DDoS amplification**: Without circuit breakers, Kenchi will continuously hammer a failing external service.

**Recommendation**:

- Wrap all outbound SDKs and fetch calls using a resilience library like **Opossum** (Circuit Breakers).
- Enforce strict `AbortController` timeouts on all external network requests (e.g., 5s max for API calls).

---

## 3. Database Resilience

### Missing: Statement Timeouts

**Status**: ❌ Not Implemented
**Finding**: The Postgres connection pool (`database/index.ts`) does not enforce `statement_timeout`. Runaway queries or unexpected index misses can run indefinitely.

**Impact**:

- A single bad query from one tenant's dashboard can block a connection pool worker permanently, eventually starving the API of DB connections and causing a complete outage.

**Recommendation**:

- Set a global `statement_timeout` on the Postgres pool (e.g., 10 seconds for API queries, longer for background workers). Allow explicit overrides for known long-running queries.
- Set `idle_in_transaction_session_timeout` to prevent leaked transactions from holding locks.

### Missing: Read Replicas / Write Segregation

**Status**: ⚠️ Not Implemented (Acceptable for now)
**Finding**: All reads and writes go to the primary database.

**Recommendation**:

- As analytical loads (dashboards) increase, implement a read-replica connection pool and route `GET` requests for analytical data to the replica.

---

## 4. Observability and Tracing

### Missing: Distributed Tracing & Correlation IDs

**Status**: ❌ Not Implemented
**Finding**: The `logger.ts` implementation is a simple JSON wrapper. It does not inject or extract `X-Correlation-ID` or `X-Request-ID` headers.

**Impact**:

- When a user initiates a webhook that triggers a background job that calls an external service, there is **no way to trace the log lines** across the API, the Worker, and external layers.
- Troubleshooting a "Slow Dashboard" requires manually guessing which DB queries correspond to which HTTP request.

**Recommendation**:

- Implement `AsyncLocalStorage` in Node.js to implicitly inject a `correlationId` into all logs generated within a single request lifecycle.
- Pass this `correlationId` into the payload of Queue jobs, so the worker logs attach the same ID.
- (Long term) Migrate to **OpenTelemetry** for full distributed tracing (Jaeger/DataDog).

---

## 5. Caching Strategy

### Missing: Cache Stampede (Thundering Herd) Protection

**Status**: ❌ Not Implemented
**Finding**: The cache client (`cacheClient.ts`) uses a generic cache-aside pattern (`cacheGetOrSet`). If a highly requested key expires, multiple concurrent requests will all experience a cache miss and simultaneously query the database.

**Impact**:

- Sudden database load spikes when large payload caches expire (e.g., organizational metrics).

**Recommendation**:

- Implement **Promise coalescing** (if a fetch is already in flight for a key, subsequent requests wait on the same Promise instead of triggering new fetches).
- Implement early TTL refresh (soft expiry) — serve the stale cache while fetching the fresh data asynchronously.

### Missing: Config-Driven Global Invalidation

**Status**: ❌ Not Implemented
**Finding**: No consistent pattern to wipe tenant-specific caches. If a tenant is suspended, all distributed caches must be invalidated.

**Recommendation**:

- Use tag-based caching or a hierarchical key design (e.g., `tenant:{tid}:user:{uid}:profile`) that permits efficient prefix-based deletion.

---

## Summary of Priority Architectural Improvements

| Priority   | Initiative                        | Value / Risk Mitigated                                              | Effort |
| :--------- | :-------------------------------- | :------------------------------------------------------------------ | :----- |
| **High**   | Route timeouts & Circuit Breakers | Prevents complete site outages when out-of-band external APIs fail. | Medium |
| **High**   | DB Statement Timeouts             | Prevents DB connection pool exhaustion.                             | Low    |
| **High**   | Request Correlation IDs           | Transforms debugging from "impossible" to straightforward.          | Medium |
| **Medium** | BullMQ Migration                  | Eliminates lost jobs and provides DLQ out-of-the-box.               | High   |
| **Medium** | Cache Promise Coalescing          | Prevents DB spikes during high concurrent load.                     | Low    |

---
