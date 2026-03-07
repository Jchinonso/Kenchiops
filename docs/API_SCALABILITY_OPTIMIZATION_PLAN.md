# API Scalability Optimization Plan

Comprehensive audit of all API call patterns across the Kenchi monorepo, with tiered recommendations for improving resilience, performance, and horizontal scalability.

**Last updated:** 2026-03-06
**Status:** 20 of 22 optimizations implemented ✅ — only Tier 4 future-scale items (17–20) remain

---

## Table of Contents

- [Current State Summary](#current-state-summary)
- [Tier 1 — High Impact](#tier-1--high-impact)
- [Tier 2 — Medium Impact](#tier-2--medium-impact)
- [Tier 3 — Important for Scale](#tier-3--important-for-scale)
- [Tier 4 — Future Scale](#tier-4--future-scale)
- [Quick Wins](#quick-wins)
- [Current Configuration Reference](#current-configuration-reference)
- [Measurement Plan](#measurement-plan)

---

## Current State Summary

| Layer                   | Pattern                                                                                                                                                                                                                                 | Key Gaps                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend HTTP**        | Resilient client with 90s timeout, 3x retry, circuit breaker, `rawBody` support, `responseType: "text"` support (`packages/shared/src/http/resilientClient.ts`). All OAuth and integration adapters fully migrated to resilient client. | None — all adapters use `resilientGet`/`resilientPost`/`resilientFetch`                                                                             |
| **GitHub SDK**          | Per-installation Octokit cache + circuit breaker + explicit 30s timeouts on all Octokits. Redis caching via `cacheGetOrSet` for repository lists. Annotation batches and parallel calls bounded with `mapWithConcurrency`.              | None                                                                                                                                                |
| **GitLab SDK**          | All GitLab adapters use resilient client: log fetcher uses `resilientGet` with `responseType: "text"` for traces, token refresh uses `resilientPost`, projects adapter uses `resilientGet`/`resilientPost`/`resilientDelete`.           | None                                                                                                                                                |
| **Database**            | Parameterized queries, cache-aside via Redis, `STATEMENT_TIMEOUT_MS: 30_000`, `DB_POOL_SIZE` env var wired to all 4 services. Server-side request coalescing (`coalesce`) on hot dashboard endpoints.                                   | Replica routing for read-heavy workloads (Tier 4)                                                                                                   |
| **Redis**               | 2–5s timeouts, fail-open, MGET batch support. Distributed rate limiting via `createFailoverStore` with native Redis scripts across category, plan, and webhook stores.                                                                  | None                                                                                                                                                |
| **Frontend**            | TanStack Query fully adopted with `QueryClientProvider`, prefetching, `staleTime`, and robust caching. Investigation status updates via SSE push with 30s polling fallback.                                                             | None                                                                                                                                                |
| **SSE**                 | 6 event types + heartbeat every 30s + retry hint. Client implements exponential backoff + jitter + heartbeat detection. Investigation status changes pushed via SSE.                                                                    | No event batching for high-volume streams                                                                                                           |
| **Additional Services** | `incident-triage`: all 6 monitoring adapters + 2 dispatch adapters use `resilientGet`/`resilientPost`. `slack-bot`: OAuth + file download use `resilientFetch`/`resilientGet`.                                                          | Slack WebClient SDK used directly in handlers (not behind adapter boundary). SDK has built-in retry/rate-limit but lacks Kenchi structured logging. |

---

## Tier 1 — High Impact

### 1. Migrate OAuth and Integration Adapters to Resilient Client ✅ COMPLETED

**Status:** Successfully implemented. All six adapters migrated from raw `fetch()` to `resilientGet`/`resilientPost`/`resilientFetch`.

| Adapter             | File                                                     | Client Used                                        |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| GitHub OAuth        | `services/api/src/adapters/githubOAuthAdapter.ts`        | `resilientGet`, `resilientPost`                    |
| GitLab OAuth        | `services/api/src/adapters/gitlabOAuthAdapter.ts`        | `resilientGet`, `resilientPost`                    |
| Bitbucket OAuth     | `services/api/src/adapters/bitbucketOAuthAdapter.ts`     | `resilientGet`, `resilientPost`                    |
| Azure DevOps OAuth  | `services/api/src/adapters/azureDevOpsOAuthAdapter.ts`   | `resilientGet`, `resilientPost`                    |
| Netlify Integration | `services/api/src/adapters/netlifyIntegrationAdapter.ts` | `resilientGet`, `resilientPost`, `resilientDelete` |
| Vercel Integration  | `services/api/src/adapters/vercelIntegrationAdapter.ts`  | `resilientGet`, `resilientPost`, `resilientDelete` |

**Impact:** Automatic retry on 5xx/network errors, circuit breaker protection, consistent structured logging and observability across all OAuth flows. Org membership role fetches bounded with `mapWithConcurrency`.

---

### 2. Adopt TanStack Query on Frontend ✅ COMPLETED

**Status:** Successfully implemented.

- 🏆 **`react-query` installed**: `QueryClientProvider` added to `App.tsx`
- 🏆 **Query client configured**: Shared client with sensible defaults (`staleTime: 30_000`, `staleTime` tuning per-hook)
- 🏆 **Hooks migrated**: Dashboard hooks, invitations, team members, tenant info, prefetching
- 🏆 **Prefetching added**: Hover-based prefetching implemented in `DashboardSidebar.tsx`

**Impact:** Eliminated redundant fetches, added intelligent caching, and reduced server load. Stale-while-revalidate means users see cached data instantly while fresh data loads in the background.

---

### 3. Distribute Rate Limiting to Redis ✅ COMPLETED

**Status:** Successfully implemented.

The in-memory `Map` was replaced with a `createFailoverStore` that uses Redis atomic `INCR` + `PEXPIRE` via Lua scripts, with an automatic in-memory fallback if Redis is unavailable.

- 🏆 **Category Store**: Migrated to `createFailoverStore`
- 🏆 **Plan Store**: Migrated to `createFailoverStore`
- 🏆 **Webhook Store**: Migrated to `createFailoverStore`
- 🏆 **Comment Accuracy**: The incorrect free tier comment was updated to accurately reflect `free: 200/min`.

**Impact:** Correct rate limiting across all instances. Horizontal scaling is unblocked.

---

### 4. Add Database Query Timeouts ✅ COMPLETED

**Problem:** No per-query `statement_timeout` is configured. A slow query (e.g., unindexed full-table scan, lock contention) can hold a connection from the pool indefinitely, eventually exhausting all 25 connections and causing cascading failures.

> [!IMPORTANT]
> The `DATABASE_POOL_DEFAULTS` comment on line 11 says the pool is "configurable via `DB_POOL_SIZE` env var" — and indeed it is wired correctly in `services/api/src/index.ts` and `services/github-app/src/index.ts` via `config.DB_POOL_SIZE`.

**Status:** Successfully implemented.

- 🏆 **`STATEMENT_TIMEOUT_MS: 30_000`**: Added to `DATABASE_POOL_DEFAULTS` in `packages/shared/src/constants/database.ts` and successfully wired to `statement_timeout` during pool initialization in `packages/shared/src/database/client/client.ts`.
- 🏆 **`DB_POOL_SIZE`**: Wired up in all 4 service entrypoints (`api`, `github-app`, `slack-bot`, `incident-triage`) via `config.DB_POOL_SIZE ?? <service-default>`.

**Impact:** Prevents connection pool exhaustion from runaway queries, and supports horizontal scaling by allowing dynamic per-instance connection limits.

---

### 5. Add Explicit Timeouts to All Octokit Constructors ✅ COMPLETED

**Status:** Successfully implemented. `Octokit` constructors in both `services/github-app/src/adapters/githubAdapter.ts` and `services/api/src/adapters/githubInstallationAdapter.ts` now explicitly configure `request: { timeout: 30_000 }`.

**Impact:** Prevents hung connections from blocking workers indefinitely.

---

### 6. Implement Response Caching for GitHub Data ✅ COMPLETED

**Status:** Successfully implemented. Repository lists are cached via `cacheGetOrSet` with `CACHE_TTL.MEDIUM` (5 min) in both GitHub adapters, using centralized cache keys from `githubCacheKeys`.

- 🏆 **github-app adapter**: `getInstallationRepositories` cached via `githubCacheKeys.installationRepos(installationId)`
- 🏆 **api adapter**: `getRepositories` cached via `githubCacheKeys.installationReposApi(installationId)` (separate key to avoid shape collision — `RepositoryInfo.private` vs `InstallationRepository.isPrivate`)
- 🏆 **PR metadata, workflow runs, analysis data**: Already cached via `packages/shared/src/cache/githubCache.ts` and `packages/shared/src/cache/analysisCache.ts`

**Impact:** Reduces GitHub API call volume significantly during dashboard loads and analysis pipelines. Preserves rate limit budget for write operations.

---

### 7. Add Frontend Prefetching ✅ COMPLETED

**Status:** Successfully implemented via `react-query` `queryClient.prefetchQuery`, wired into the sidebar navigation components.

---

### 8. Batch and Bound Parallel GitHub API Calls ✅ COMPLETED

**Status:** Successfully implemented.

- 🏆 **Annotation Batches**: Unbounded `Promise.all` in `githubAdapter.ts` was replaced with `@kenchi/shared/mapWithConcurrency`.
- 🏆 **Role Fetches**: Orgs/memberships fetches in `githubOAuthAdapter.ts` are safely bounded using `@kenchi/shared/mapWithConcurrency`.

---

### 9. SSE Client-Side Reconnection Backoff ✅ COMPLETED

**Status:** Successfully implemented.

The `useDashboardSSE` client now incorporates a robust reconnection strategy:

- 🏆 Exponential backoff implemented (`INITIAL_BACKOFF_MS = 1000`, doubling each retry)
- 🏆 Jitter factored in `(Math.random() - 0.5) * JITTER_FACTOR`
- 🏆 Heartbeat detection resets timer (`setTimeout` over 45s) and reconnects if dropped.

---

## Tier 3 — Important for Scale

### 10. Connection Pool Tuning ✅ COMPLETED

**Status:** Successfully implemented. `DB_POOL_SIZE` env var now wired to all 4 services via `config.DB_POOL_SIZE ?? <service-default>`.

| Service         | File                                    | Default | Override              |
| --------------- | --------------------------------------- | ------- | --------------------- |
| API             | `services/api/src/index.ts`             | 10      | `config.DB_POOL_SIZE` |
| GitHub App      | `services/github-app/src/index.ts`      | 10      | `config.DB_POOL_SIZE` |
| Slack Bot       | `services/slack-bot/src/index.ts`       | 10      | `config.DB_POOL_SIZE` |
| Incident Triage | `services/incident-triage/src/index.ts` | 10      | `config.DB_POOL_SIZE` |

**Impact:** Operators can scale pool sizes via `DB_POOL_SIZE` env var without code changes for multi-instance deployments.

**Remaining:** Redis cache vs. pub/sub connection separation is a Tier 4 concern.

---

### 11. Request Coalescing for Hot Paths ✅ COMPLETED

**Status:** Successfully implemented. `coalesce()` singleflight utility created in `packages/shared/src/http/singleflight.ts` and applied to the 3 hottest dashboard GET endpoints in `services/api/src/routes/dashboardRoutes.ts`.

| Endpoint                             | Coalesce Key                              |
| ------------------------------------ | ----------------------------------------- |
| `GET /api/v1/dashboard/tenant`       | `dashboard:tenant:${tenantId}`            |
| `GET /api/v1/dashboard/stats`        | `dashboard:stats:${tenantId}[:${source}]` |
| `GET /api/v1/dashboard/repositories` | `dashboard:repositories:${tenantId}`      |

**Impact:** Reduces database load proportionally to concurrent users per tenant. 10 concurrent users from the same tenant = 1 DB query instead of 10.

---

### 12. Pagination Limits and Streaming ✅ COMPLETED (core items)

**Status:** All bounded-memory concerns resolved. Streaming and cursor-based pagination are Tier 4 optimizations.

| Path                                     | Status                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GitHub repository pagination             | ✅ Capped at `GITHUB_PAGINATION.MAX_REPO_PAGES` (10 pages = 1,000 repos) in `githubAdapter.ts` |
| GitHub installation adapter              | ✅ Multi-page pagination with `MAX_REPO_PAGES` cap in `githubInstallationAdapter.ts`           |
| GitLab log fetcher                       | ✅ Capped at `GITLAB_MAX_FAILED_JOBS` (50) with warning log when exceeded                      |
| Log downloads for analysis               | Deferred — streaming is a Tier 4 optimization                                                  |
| Analysis results cursor-based pagination | Deferred — offset/limit works at current scale, cursor pagination is a Tier 4 optimization     |

---

### 13. Investigation Polling to SSE Push ✅ COMPLETED

**Status:** Successfully implemented. Investigation status changes are now pushed via SSE with a 30s polling fallback.

- 🏆 **Event type**: `INVESTIGATION_STATUS_CHANGED` added to `DASHBOARD_EVENT_TYPES` in `packages/shared/src/constants/dashboard.ts`
- 🏆 **Server-side**: `investigationWorker.ts` publishes to `PUBSUB_CHANNELS.DASHBOARD` on both completion and error via `publishInvestigationStatus()` helper
- 🏆 **Client-side**: `useDashboardSSE.ts` listens for `investigation_status_changed` and invalidates investigation queries
- 🏆 **Polling reduced**: `useInvestigationData.ts` changed from 3s polling (200 max) to 30s safety-net fallback

**Impact:** Eliminated up to 200 polling requests per investigation. Real-time status updates instead of 3s latency.

---

### 14. Response Compression and Cache Headers ✅ COMPLETED

**Status:** Successfully implemented.

- 🏆 **Compression Middleware**: Installed and configured in the API service (`services/api/src/index.ts`). Successfully ignores SSE streams.
- 🏆 **Cache-Control Headers**: Set on multiple endpoints (`Cache-Control: private, max-age=30` on dashboard GET routes) to prevent re-fetches.

---

### 15. GitLab Adapter Resilience Audit ✅ COMPLETED

**Status:** Audit completed and all gaps fixed.

| File                                                          | Status | Pattern                                                                       |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `services/github-app/src/adapters/gitlabLogFetcherAdapter.ts` | ✅     | `resilientGet` with `responseType: "text"` for job traces (was raw `fetch()`) |
| `services/github-app/src/adapters/gitlabTokenRefresh.ts`      | ✅     | `resilientPost` with timeout + maxRetries                                     |
| `services/github-app/src/adapters/gitlabWebhookAdapter.ts`    | ✅     | No outbound HTTP (pure webhook normalizer) — N/A                              |
| `services/github-app/src/adapters/gitlabOutputAdapter.ts`     | ✅     | `resilientPost` with complete error-path logging (durationMs added)           |
| `services/api/src/adapters/gitlabOAuthAdapter.ts`             | ✅     | Migrated to resilient client (covered by Tier 1 item 1)                       |
| `services/api/src/adapters/gitlabProjectsAdapter.ts`          | ✅     | `resilientGet`/`resilientPost`/`resilientDelete` with error-path logging      |

---

### 16. Incident Triage and Slack Bot Resilience Audit ✅ COMPLETED

**Status:** Audit completed and critical gaps fixed.

**Incident Triage** — fully compliant:

- ✅ All 6 monitoring adapters use `resilientGet` (Datadog, Grafana, PagerDuty, Prometheus, Vercel, Netlify)
- ✅ Both dispatch adapters use `resilientPost` with circuit breaker (Slack, PagerDuty)

**Slack Bot** — compliant:

- ✅ OAuth token exchange: migrated to `resilientFetch` with timeout + retry
- ✅ File download: migrated to `resilientGet` with `responseType: "text"`, timeout + retry
- ⚠️ Slack WebClient SDK used directly in handlers (not behind adapter boundary). SDK has built-in retry/rate-limit handling, but lacks Kenchi structured logging. This is a broader architectural concern for future hardening.

---

## Tier 4 — Future Scale

### 17. Read Replicas for Dashboard Queries

For high-traffic deployments, route dashboard `SELECT` queries to a PostgreSQL read replica. The `packages/shared/src/database/client/client.ts` pool singleton would need to support a second pool for read-only operations.

### 18. CDN for Static API Responses

Responses that are identical for all users of a tenant (e.g., repository list, plan info) can be served from a CDN edge with `Cache-Control: public, max-age=60, s-maxage=300`.

### 19. Event-Driven Cache Invalidation

Replace TTL-based cache expiry with event-driven invalidation. When a GitHub webhook arrives, invalidate the relevant cache entries immediately rather than waiting for TTL expiry. The Redis pub/sub infrastructure already exists (`packages/shared/src/constants/redis.ts` `PUBSUB_CHANNELS`).

### 20. Queue Backpressure and Autoscaling

The current queue worker configuration (`packages/shared/src/constants/concurrency.ts` `TENANT_QUOTA_BY_PLAN`) uses fixed concurrency. For production scale:

- Add queue depth metrics and alerting
- Implement backpressure (reject new jobs when queue exceeds threshold — already partially implemented via `TENANT_QUOTA_BY_PLAN`)
- Consider autoscaling workers based on queue depth

### 21. Resilient Client Support for Non-JSON Responses ✅ COMPLETED

**Status:** Done. `resilientClient.ts` has `responseType: "text" | "json"` support.

### 22. Resilient Client Support for Form-Encoded Bodies ✅ COMPLETED

**Status:** Done. `resilientClient.ts` has `rawBody: string` support.

---

## Quick Wins

**Status of initial Quick Wins:**

| #   | Change                                                             | File(s)                                                                                                                           | Status                        |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| A   | Add `request: { timeout: 30_000 }` to **all** Octokit constructors | `services/github-app/src/adapters/githubAdapter.ts` (line 52), `services/api/src/adapters/githubInstallationAdapter.ts` (line 50) | ✅ Done                       |
| B   | Set `statement_timeout` in DB pool config                          | `packages/shared/src/constants/database.ts`, `packages/shared/src/database/client/client.ts`                                      | ✅ Done                       |
| C   | Wire up `DB_POOL_SIZE` env var                                     | `packages/shared/src/database/client/client.ts` (or service startup)                                                              | ✅ Done                       |
| D   | Fix `rateLimitByPlan` comment                                      | `packages/shared/src/http/rateLimitByCategory.ts` (line 176)                                                                      | ✅ Done                       |
| E   | Add retry with exponential backoff to `useFetch`                   | `services/frontend/src/hooks/useFetch.ts`                                                                                         | ✅ Done (TanStack Query used) |
| F   | Add `Cache-Control: private, max-age=30` to `/dashboard/stats`     | `services/api/src/routes/dashboardRoutes.ts`                                                                                      | ✅ Done                       |
| G   | Replace investigation polling with SSE event                       | `services/frontend/src/hooks/useInvestigationData.ts`, `services/incident-triage/src/workers/investigationWorker.ts`              | ✅ Done                       |
| H   | Replace unbounded `Promise.all()` in annotation batches            | `services/github-app/src/adapters/githubAdapter.ts`                                                                               | ✅ Done                       |
| I   | Replace unbounded `Promise.all()` in org membership fetches        | `services/api/src/adapters/githubOAuthAdapter.ts`                                                                                 | ✅ Done                       |
| J   | Add `compression` middleware to API service                        | `services/api/src/` (Express setup file)                                                                                          | ✅ Done                       |
| K   | Add page limit to `fetchRepositoriesPage`                          | `services/github-app/src/adapters/githubAdapter.ts` (line 82)                                                                     | ✅ Done                       |

---

## Current Configuration Reference

### HTTP Resilience Defaults

Source: `packages/shared/src/constants/core.ts` — `HTTP_RESILIENCE_DEFAULTS`

| Parameter                           | Value        | Notes                                |
| ----------------------------------- | ------------ | ------------------------------------ |
| `TIMEOUT_MS`                        | 90,000 (90s) | Per-request timeout                  |
| `MAX_RETRIES`                       | 3            | Maximum retry attempts               |
| `INITIAL_RETRY_DELAY_MS`            | 1,000 (1s)   | Exponential backoff base             |
| `MAX_RETRY_DELAY_MS`                | 10,000 (10s) | Backoff ceiling                      |
| `CIRCUIT_BREAKER_THRESHOLD`         | 5            | Consecutive failures to open circuit |
| `CIRCUIT_BREAKER_RESET_MS`          | 30,000 (30s) | Half-open probe interval             |
| `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | 1            | Successes to close from half-open    |
| `JITTER_FACTOR`                     | 0.3 (30%)    | Randomization factor for backoff     |
| `RATE_LIMIT_CHECK_TIMEOUT_MS`       | 3,000 (3s)   | Timeout for rate limit Redis checks  |

### Cache TTL Configuration

Source: `packages/shared/src/constants/redis.ts` — `CACHE_TTL_SECONDS`

| Tier           | Duration        | Use Case                     |
| -------------- | --------------- | ---------------------------- |
| `SHORT`        | 60s (1 min)     | Frequently changing data     |
| `MEDIUM`       | 300s (5 min)    | Repository lists, settings   |
| `STANDARD`     | 900s (15 min)   | Slow-changing reference data |
| `LONG`         | 3,600s (1 hr)   | Stable configuration         |
| `EXTENDED`     | 21,600s (6 hr)  | Rarely changing data         |
| `DAILY`        | 86,400s (24 hr) | Static reference data        |
| `JWT_LIFETIME` | 300s (5 min)    | Auth revocation flags        |

### SSE Configuration

Source: `packages/shared/src/constants/dashboard.ts` — `SSE_CONFIG`

| Parameter               | Value        | Notes                             |
| ----------------------- | ------------ | --------------------------------- |
| `HEARTBEAT_INTERVAL_MS` | 30,000 (30s) | Server sends `:heartbeat` comment |
| `RETRY_MS`              | 5,000 (5s)   | Hint sent to EventSource clients  |

### SSE Connection Limits

Source: `services/api/src/routes/sseRoutes.ts`

| Parameter                    | Value | Notes                         |
| ---------------------------- | ----- | ----------------------------- |
| `MAX_CONNECTIONS_PER_TENANT` | 10    | Per-tenant SSE connection cap |
| `MAX_CONNECTIONS_GLOBAL`     | 200   | Global SSE connection cap     |

### Redis Timeouts

Source: `packages/shared/src/constants/redis.ts` — `REDIS_TIMEOUTS`

| Operation              | Timeout |
| ---------------------- | ------- |
| Cache operations       | 2,000ms |
| Aggregation operations | 3,000ms |
| Queue operations       | 5,000ms |

### Database Pool Defaults

Source: `packages/shared/src/constants/database.ts` — `DATABASE_POOL_DEFAULTS`

| Parameter               | Value        | Notes                                             |
| ----------------------- | ------------ | ------------------------------------------------- |
| `MAX_CONNECTIONS`       | 25           | Wired to `DB_POOL_SIZE` env var in all 4 services |
| `IDLE_TIMEOUT_MS`       | 30,000 (30s) |                                                   |
| `CONNECTION_TIMEOUT_MS` | 5,000 (5s)   |                                                   |
| `STATEMENT_TIMEOUT_MS`  | 30,000 (30s) | Prevents runaway queries from exhausting pool     |

### Rate Limiting Configuration

Source: `packages/shared/src/constants/rateLimitCategory.ts`

**Per-endpoint category limits (per tenant per minute):**

| Category    | Limit     | Window |
| ----------- | --------- | ------ |
| `expensive` | 10/min    | 60s    |
| `standard`  | 500/min   | 60s    |
| `readonly`  | 1,000/min | 60s    |

**Per-tenant plan limits (per minute):**

| Plan         | Limit     | Notes |
| ------------ | --------- | ----- |
| `free`       | 200/min   |       |
| `pro`        | 300/min   |       |
| `team`       | 500/min   |       |
| `enterprise` | 2,000/min |       |

**Per-source webhook limits:**

| Parameter                 | Value |
| ------------------------- | ----- |
| Max per source per minute | 60    |
| Window                    | 60s   |

### Queue Processing Quotas

Source: `packages/shared/src/constants/concurrency.ts` — `TENANT_QUOTA_BY_PLAN`

| Plan         | Max Queue Depth | Max Concurrent Jobs | Max Processing Time/Hour |
| ------------ | --------------- | ------------------- | ------------------------ |
| `free`       | 10              | 1                   | 300s (5 min)             |
| `pro`        | 50              | 3                   | 1,800s (30 min)          |
| `team`       | 200             | 5                   | 3,600s (60 min)          |
| `enterprise` | 1,000           | 10                  | 7,200s (120 min)         |

### Fair Queue Scheduling

Source: `packages/shared/src/constants/concurrency.ts` — `FAIR_QUEUE_DEFAULTS`

| Parameter                       | Value | Notes                      |
| ------------------------------- | ----- | -------------------------- |
| `MAX_JOBS_PER_TENANT_PER_BATCH` | 2     | Prevents tenant starvation |
| `MAX_TENANTS_PER_ROUND`         | 5     | Limits polling fan-out     |

### Frontend Client Configuration

Source: `services/frontend/src/lib/apiClient.ts`

| Parameter            | Value                             | Notes                                               |
| -------------------- | --------------------------------- | --------------------------------------------------- |
| `REQUEST_TIMEOUT_MS` | 30,000 (30s)                      | AbortController timeout on all requests             |
| GET deduplication    | `inflightGets` Map                | Concurrent GET calls share single in-flight request |
| Token refresh        | Single-flight via `activeRefresh` | Prevents concurrent 401 refresh storms              |

---

## Measurement Plan

Track these metrics to validate the impact of each optimization and identify the next bottleneck:

| #   | Metric                                                        | Tool / Source                                                                  | Baseline Target                                                    |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | API response times (p50/p95/p99) per endpoint                 | Structured logs + Prometheus                                                   | p95 < 500ms for dashboard endpoints                                |
| 2   | Cache hit rate per key pattern                                | `getCacheStats()` from `cacheClient.ts` + Redis `INFO stats`                   | > 80% for repository and tenant data                               |
| 3   | External API call volume per provider per hour                | Structured logs (`provider` field)                                             | Track GitHub/GitLab API rate limit consumption                     |
| 4   | DB connection pool utilization (active/idle/waiting)          | `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`                       | Waiting count should be 0 under normal load                        |
| 5   | Redis memory usage and operation latency                      | Redis `INFO memory` + `SLOWLOG`                                                | p99 < 5ms for cache operations                                     |
| 6   | Frontend network waterfall (duplicate requests, time-to-data) | Browser DevTools / Lighthouse                                                  | Zero duplicate concurrent requests after TanStack migration        |
| 7   | SSE reconnection frequency and event delivery latency         | Client-side telemetry + server-side connection count (`globalConnectionCount`) | < 1 reconnection per hour under stable conditions                  |
| 8   | Rate limit rejection rate per tenant                          | Structured logs from `rateLimitByCategory.ts`                                  | < 1% of legitimate requests                                        |
| 9   | Investigation polling request count                           | Frontend network tab / server access logs                                      | Should drop to 0 after SSE migration                               |
| 10  | OAuth adapter failure rate by provider                        | Structured logs (`provider` + `operation` fields already present)              | < 0.1% after resilient client migration                            |
| 11  | Circuit breaker trip frequency                                | Structured logs from `resilientClient.ts` ("Circuit breaker opened" events)    | Should be rare outside provider outages                            |
| 12  | Statement timeout cancellations                               | PostgreSQL `pg_stat_activity` + structured logs                                | Should capture runaway queries without affecting normal operations |
| 13  | Compression ratio for dashboard endpoints                     | Response headers (`Content-Encoding`, `Content-Length` vs original)            | > 60% compression for JSON payloads                                |

---

## Related Documents

- [System Architecture](./SYSTEM_ARCHITECTURE.md) — Overall system design
- [Architecture](./ARCHITECTURE.md) — Service boundaries and data flow
- [Production Scalability Plan](./PRODUCTION_SCALABILITY_PLAN.md) — Infrastructure-level scaling
- [Rate Limit](./RATE_LIMIT.md) — Rate limiting design decisions
- [Subscription Plans](./SUBSCRIPTION_PLANS.md) — Plan tier definitions and enforcement
