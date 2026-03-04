# API Scalability Optimization Plan

Comprehensive audit of all API call patterns across the Kenchi monorepo, with tiered recommendations for improving resilience, performance, and horizontal scalability.

**Last updated:** 2026-03-04
**Status:** Active plan — items are ordered by impact and urgency

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

| Layer                   | Pattern                                                                                                                                                                                                 | Key Gaps                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Backend HTTP**        | Resilient client with 90s timeout, 3x retry, circuit breaker (`packages/shared/src/http/resilientClient.ts`)                                                                                            | OAuth adapters (GitHub, GitLab, Bitbucket, Azure DevOps) and integration adapters (Netlify, Vercel) bypass it — use raw `fetch()` with 10–15s timeouts, zero retries. GitLab log fetcher has its own 30s timeout but no retry. |
| **GitHub SDK**          | Per-installation Octokit cache + circuit breaker (`services/github-app/src/adapters/githubAdapter.ts`). Second Octokit cache in API service (`services/api/src/adapters/githubInstallationAdapter.ts`). | No explicit `request.timeout` on any Octokit constructor; unbounded `Promise.all()` for annotation batches; unbounded `Promise.all()` for per-org membership role fetches in GitHub OAuth adapter                              |
| **GitLab SDK**          | GitLab log fetcher uses `resilientGet` for structured data but raw `fetch()` for job traces (`services/github-app/src/adapters/gitlabLogFetcherAdapter.ts`)                                             | Token refresh adapter (`gitlabTokenRefresh.ts`) raw `fetch()` with no retries; no explicit concurrency bounds on webhook adapter                                                                                               |
| **Database**            | Parameterized queries, cache-aside via Redis, pool defaults in `packages/shared/src/constants/database.ts`                                                                                              | No per-query `statement_timeout`; pool `MAX_CONNECTIONS` not wired to `DB_POOL_SIZE` env var despite comment claiming so                                                                                                       |
| **Redis**               | 2–5s timeouts, fail-open, MGET batch support (`packages/shared/src/cache/cacheClient.ts`)                                                                                                               | In-memory rate limiter in `packages/shared/src/http/rateLimitByCategory.ts` will not scale to multiple API instances. All three stores (`categoryStore`, `planStore`, `webhookSourceStore`) are process-local `Map` objects.   |
| **Frontend**            | Custom `useFetch` hook + `apiClient` with GET dedup + single-flight token refresh (`services/frontend/src/lib/apiClient.ts`, `services/frontend/src/hooks/useFetch.ts`)                                 | No TanStack Query, no caching layer, no prefetching, no retry/backoff; `apiClient` has dedup and 30s timeout but `useFetch` provides no stale-while-revalidate, background refetch, or cache TTLs                              |
| **SSE**                 | 5 event types + heartbeat every 30s + retry hint of 5s (`services/frontend/src/hooks/useDashboardSSE.ts`, `services/api/src/routes/sseRoutes.ts`)                                                       | No client-side reconnection backoff (relies on browser's native EventSource retry); no heartbeat detection on client side; no event batching                                                                                   |
| **Additional Services** | `incident-triage` and `slack-bot` services have their own HTTP patterns but are not covered by resilient client audit                                                                                   | Need separate audit for `services/incident-triage/` and `services/slack-bot/` external API calls                                                                                                                               |

---

## Tier 1 — High Impact

### 1. Migrate OAuth and Integration Adapters to Resilient Client

**Problem:** Six adapters use raw `fetch()` with short fixed timeouts and zero retries. Token exchanges and profile fetches are critical-path operations — a single network hiccup causes a complete login failure or integration setup failure.

**Affected files:**

| Adapter             | File                                                     | Current Timeout | Retries | Body Encoding                 |
| ------------------- | -------------------------------------------------------- | --------------- | ------- | ----------------------------- |
| GitHub OAuth        | `services/api/src/adapters/githubOAuthAdapter.ts`        | 10s             | 0       | JSON (`application/json`)     |
| GitLab OAuth        | `services/api/src/adapters/gitlabOAuthAdapter.ts`        | 10s             | 0       | Form URL-encoded              |
| Bitbucket OAuth     | `services/api/src/adapters/bitbucketOAuthAdapter.ts`     | 10s             | 0       | Form URL-encoded (Basic auth) |
| Azure DevOps OAuth  | `services/api/src/adapters/azureDevOpsOAuthAdapter.ts`   | 10s             | 0       | Form URL-encoded              |
| Netlify Integration | `services/api/src/adapters/netlifyIntegrationAdapter.ts` | 15s             | 0       | Form URL-encoded              |
| Vercel Integration  | `services/api/src/adapters/vercelIntegrationAdapter.ts`  | 15s             | 0       | Form URL-encoded              |

> [!IMPORTANT]
> The adapters use different `Content-Type` encodings. GitHub OAuth sends JSON bodies; Bitbucket, GitLab, Azure DevOps, Netlify, and Vercel send `application/x-www-form-urlencoded`. The resilient client currently **always serializes bodies as JSON** (see `resilientClient.ts` line 242: `JSON.stringify(context.body)`). Before migrating, either:
> (a) Add a `rawBody` option to the resilient client that passes pre-serialized strings, or
> (b) Use the resilient client only for JSON-body calls and keep raw `fetch()` with retry wrapper for form-encoded calls.

**Current pattern (GitHub OAuth — JSON body):**

```typescript
const response = await fetch(urls.token, {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(tokenBody),
  signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS), // 10_000
});
```

**Current pattern (other adapters — form-encoded body):**

```typescript
const response = await fetch(INTEGRATION_OAUTH_TOKEN_URLS.netlify, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: body.toString(),
  signal: AbortSignal.timeout(NETLIFY_TIMEOUT_MS), // 15_000
});
```

**Target pattern (requires resilient client extension):**

```typescript
import { resilientPost, resilientGet } from "@kenchi/shared";

// Token exchange — slightly shorter timeout, retries on 5xx/network errors
const response = await resilientPost<GitHubTokenResponse>(url, tokenBody, {
  timeout: 15_000,
  maxRetries: 2,
  headers: { Accept: "application/json" },
});

// For form-encoded adapters, add rawBody support:
const response = await resilientFetch<NetlifyTokenResponse>(
  INTEGRATION_OAUTH_TOKEN_URLS.netlify,
  "POST",
  undefined, // no JSON body
  {
    timeout: 15_000,
    maxRetries: 2,
    rawBody: body.toString(), // new option: pre-serialized body
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }
);
```

**Implementation notes:**

- Token exchange calls (`POST /access_token`) must remain idempotent-safe. OAuth token endpoints are safe to retry because they return the same token for the same authorization code within the code's validity window. After expiry, the code is invalid regardless of retry.
- Profile/org fetches (`GET /user`, `GET /user/orgs`) are pure reads and safe to retry.
- Use `maxRetries: 2` (not the default 3) to keep total latency under 45s for user-facing OAuth flows.
- The circuit breaker protects against sustained provider outages (e.g., GitHub API down).
- **GitHub OAuth adapter additional concern:** `getUserOrganizations()` does an unbounded `Promise.all()` with per-org membership role fetches (line 638). If a user belongs to many orgs, this fans out many parallel requests. Should be bounded with concurrency control (see Tier 2 item 8).

**Impact:** Automatic retry on 5xx/network errors, circuit breaker protection, consistent structured logging and observability across all OAuth flows.

---

### 2. Adopt TanStack Query on Frontend

**Problem:** The custom `useFetch` hook (`services/frontend/src/hooks/useFetch.ts`) lacks stale-while-revalidate, background refetch, cache TTLs, window focus refetch, retry with backoff, prefetching, and optimistic updates. Every navigation remounts hooks and re-fetches all data unconditionally.

> [!NOTE]
> The `apiClient` already has GET deduplication (concurrent calls to the same path share a single in-flight request via `inflightGets` Map at line 124) and single-flight token refresh coordination (`activeRefresh` at line 56). These patterns are more sophisticated than a naive `fetch` wrapper — TanStack Query should build on this existing apiClient rather than replace it.

**Affected files:**

| File                                                  | Hook Count           | Current Pattern                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/frontend/src/hooks/useDashboardData.ts`     | 14 hooks             | `useFetch<T>(path, depsKey)` — includes `useTenantInfo`, `useDashboardStats`, `useRepositories`, `useAnalyses`, `useFailures`, `useConfidenceDistribution`, `useAnalysisDetail`, `useAnalysisCountsByRepo`, `useAnalysisStatusByEvents` (POST-based batch), `useConfidenceTrend`, `useWebhookActivity`, `useCorrelation`, `useGitLabProjects` |
| `services/frontend/src/hooks/useInvestigationData.ts` | 2 hooks + 1 mutation | `useFetch<T>` + manual `apiClient` POST + polling via `setInterval`                                                                                                                                                                                                                                                                           |
| `services/frontend/src/hooks/useIncidentData.ts`      | (similar pattern)    | `useFetch<T>`                                                                                                                                                                                                                                                                                                                                 |
| `services/frontend/src/hooks/useBilling.ts`           | Billing hooks        | `useFetch<T>`                                                                                                                                                                                                                                                                                                                                 |
| `services/frontend/src/hooks/useTeamMembers.ts`       | Team hooks           | `useFetch<T>`                                                                                                                                                                                                                                                                                                                                 |
| `services/frontend/src/hooks/useInvitations.ts`       | Invitation hooks     | `useFetch<T>`                                                                                                                                                                                                                                                                                                                                 |
| `services/frontend/src/hooks/useFetch.ts`             | Base hook            | `useState` + `useEffect` + `apiClient`                                                                                                                                                                                                                                                                                                        |

**Migration strategy:**

1. Install TanStack Query (`@tanstack/react-query`) and add `QueryClientProvider` in the app root.
2. Configure a shared `QueryClient` with sensible defaults:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s before data is considered stale
      gcTime: 300_000, // 5min garbage collection
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: true,
    },
  },
});
```

3. Migrate hooks in priority order:

| Hook                        | Recommended `staleTime` | Recommended `gcTime` | Rationale                                                           |
| --------------------------- | ----------------------- | -------------------- | ------------------------------------------------------------------- |
| `useTenantInfo`             | 60s                     | 300s                 | Rarely changes, only on org switch                                  |
| `useDashboardStats`         | 30s                     | 300s                 | Updated by SSE events                                               |
| `useRepositories`           | 120s                    | 600s                 | Slow-changing                                                       |
| `useGitLabProjects`         | 120s                    | 600s                 | Slow-changing                                                       |
| `useAnalyses`               | 30s                     | 300s                 | Updated by SSE events                                               |
| `useFailures`               | 30s                     | 300s                 | Updated by SSE events                                               |
| `useConfidenceDistribution` | 60s                     | 300s                 | Aggregated stat                                                     |
| `useConfidenceTrend`        | 60s                     | 300s                 | Aggregated stat                                                     |
| `useWebhookActivity`        | 30s                     | 300s                 | Operational data                                                    |
| `useAnalysisCountsByRepo`   | 60s                     | 300s                 | Aggregated stat                                                     |
| `useCorrelation`            | 30s                     | 300s                 | Context-specific lookup                                             |
| `useInvestigationDetail`    | 5s                      | 60s                  | Polling during active investigation                                 |
| `useAnalysisStatusByEvents` | 30s                     | 300s                 | POST-based batch lookup (use `useMutation` or `useQuery` with POST) |

4. Replace SSE `refreshKey` pattern with targeted `queryClient.invalidateQueries()`:

```typescript
// Before: SSE handler increments refreshKey, ALL hooks re-fetch
debouncedRefresh();

// After: SSE handler invalidates only affected query keys
queryClient.invalidateQueries({ queryKey: ["dashboard", "analyses"] });
queryClient.invalidateQueries({ queryKey: ["dashboard", "failures"] });
```

5. Keep `apiClient` as the underlying fetcher for TanStack Query — it already handles cookie auth, 401 refresh, GET dedup, and toast notifications for plan limits.

**Impact:** Eliminates redundant fetches (estimated 40–60% reduction for repeat visits), adds intelligent caching, reduces server load. Stale-while-revalidate means users see cached data instantly while fresh data loads in the background.

---

### 3. Distribute Rate Limiting to Redis

**Problem:** The in-memory sliding window counter in `packages/shared/src/http/rateLimitByCategory.ts` stores all state in `Map` objects within a single process. With multiple API instances (horizontal scaling), each instance maintains its own independent counter. Two instances effectively double the rate limit for every tenant.

> [!WARNING]
> There is also a discrepancy between the `rateLimitByPlan` middleware comment (line 176: "free: 60") and the actual `PLAN_RATE_LIMITS` constant in `packages/shared/src/constants/rateLimitCategory.ts` (line 28: `free: { maxPerMinute: 200 }`). The constant is authoritative — the comment should be fixed.

**Affected files:**

- `packages/shared/src/http/rateLimitByCategory.ts` — three stores: `categoryStore`, `planStore`, `webhookSourceStore` (lines 92–94), all created via `createWindowStore()` which returns in-memory `Map`
- `packages/shared/src/constants/rateLimitCategory.ts` — Rate limit configuration
- `packages/shared/src/constants/redis.ts` — `RATE_LIMIT_LUA_SCRIPT` (line 68)

**Current architecture:**

```
Instance A: Map { "rl:cat:expensive:tenant-1" => { count: 8 } }
Instance B: Map { "rl:cat:expensive:tenant-1" => { count: 7 } }
// Tenant's actual usage: 15/10 — but neither instance blocks it
```

**Target architecture:**

Replace the in-memory `Map` with Redis `INCR` + `PEXPIRE` (atomic via the existing Lua script in `packages/shared/src/constants/redis.ts`):

```typescript
// packages/shared/src/http/rateLimitByCategory.ts

import { getRedisClient } from "../queue/redisClient.js";
import { RATE_LIMIT_LUA_SCRIPT, REDIS_TIMEOUTS } from "../constants/index.js";

const checkRedisRateLimit = async (
  key: string,
  windowMs: number,
  max: number
): Promise<{ readonly allowed: boolean; readonly remaining: number; readonly resetMs: number }> => {
  const client = getRedisClient();

  // RATE_LIMIT_LUA_SCRIPT is already defined in constants/redis.ts (line 68)
  // Returns [current_count, ttl_in_ms]
  const [current, ttl] = (await withTimeout(
    client.eval(RATE_LIMIT_LUA_SCRIPT, 1, key, String(windowMs)),
    REDIS_TIMEOUTS.CACHE_OPERATION_MS
  )) as [number, number];

  return {
    allowed: current <= max,
    remaining: Math.max(0, max - current),
    resetMs: Date.now() + ttl,
  };
};
```

**Implementation notes:**

- Keep the in-memory store as a fallback when Redis is unavailable (fail-open) — this matches the existing `rateLimitByPlan()` pattern.
- The `RATE_LIMIT_LUA_SCRIPT` already exists in `packages/shared/src/constants/redis.ts` (line 68) — it atomically increments and sets expiry.
- All three store types (`categoryStore`, `planStore`, `webhookSourceStore`) should migrate.
- Fix the `rateLimitByPlan` comment on line 176 to say `free: 200/min` instead of `free: 60/min`.

**Impact:** Correct rate limiting across all instances. This is a prerequisite for horizontal scaling.

---

### 4. Add Database Query Timeouts

**Problem:** No per-query `statement_timeout` is configured. A slow query (e.g., unindexed full-table scan, lock contention) can hold a connection from the pool indefinitely, eventually exhausting all 25 connections and causing cascading failures.

> [!IMPORTANT]
> The `DATABASE_POOL_DEFAULTS` comment on line 11 says the pool is "configurable via `DB_POOL_SIZE` env var" — but examining `initDatabase()` in `client.ts` (line 102–108), `DB_POOL_SIZE` is **not wired up**. The pool reads `config.maxConnections` which must be passed explicitly by the caller. This should be fixed as part of this item.

**Affected files:**

- `packages/shared/src/database/client/client.ts` — `initDatabase()` and pool creation (line 94)
- `packages/shared/src/constants/database.ts` — `DATABASE_POOL_DEFAULTS`

**Current pool configuration:**

```typescript
// packages/shared/src/constants/database.ts
export const DATABASE_POOL_DEFAULTS = {
  MAX_CONNECTIONS: 25,
  IDLE_TIMEOUT_MS: 30_000,
  CONNECTION_TIMEOUT_MS: 5_000,
} as const;
```

**Target: Add `statement_timeout` at the pool level and wire up `DB_POOL_SIZE`:**

```typescript
// packages/shared/src/constants/database.ts
export const DATABASE_POOL_DEFAULTS = {
  MAX_CONNECTIONS: 25,
  IDLE_TIMEOUT_MS: 30_000,
  CONNECTION_TIMEOUT_MS: 5_000,
  STATEMENT_TIMEOUT_MS: 30_000, // Kill queries that run longer than 30s
} as const;
```

```typescript
// packages/shared/src/database/client/client.ts — in initDatabase()
pool = new Pool({
  connectionString: config.connectionString,
  max: config.maxConnections ?? DATABASE_POOL_DEFAULTS.MAX_CONNECTIONS,
  idleTimeoutMillis: config.idleTimeoutMs ?? DATABASE_POOL_DEFAULTS.IDLE_TIMEOUT_MS,
  connectionTimeoutMillis:
    config.connectionTimeoutMs ?? DATABASE_POOL_DEFAULTS.CONNECTION_TIMEOUT_MS,
  // Set statement_timeout for every connection in the pool
  statement_timeout: config.statementTimeoutMs ?? DATABASE_POOL_DEFAULTS.STATEMENT_TIMEOUT_MS,
});
```

**Per-query override for long-running operations:**

```typescript
// For migrations or reports that legitimately need more time
await client.query("SET LOCAL statement_timeout = '120000'"); // 120s for this transaction only
await client.query(longRunningMigrationQuery);
```

**Impact:** Prevents connection pool exhaustion from runaway queries. The 30s default is generous enough for all normal CRUD and dashboard queries while catching genuinely stuck operations.

---

## Tier 2 — Medium Impact

### 5. Add Explicit Timeouts to All Octokit Constructors

**Problem:** Octokit instances created in **both** services have no explicit request timeout. A hung connection to the GitHub API will block the worker indefinitely.

**Affected files and locations:**

| File                                                     | Constructor Location     | Has Timeout? |
| -------------------------------------------------------- | ------------------------ | ------------ |
| `services/github-app/src/adapters/githubAdapter.ts`      | `getOctokit()` (line 52) | ❌ No        |
| `services/api/src/adapters/githubInstallationAdapter.ts` | `getOctokit()` (line 50) | ❌ No        |

**Current (both files):**

```typescript
const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: appConfig.github.appId,
    privateKey: appConfig.github.privateKey,
    installationId,
  },
});
```

**Target (both files):**

```typescript
const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: appConfig.github.appId,
    privateKey: appConfig.github.privateKey,
    installationId,
  },
  request: {
    timeout: 30_000, // 30s — matches resilient client default
  },
});
```

**Impact:** Prevents hung connections from blocking workers indefinitely. Low effort, high safety improvement.

---

### 6. Implement Response Caching for GitHub Data

**Problem:** Repository lists, PR metadata, and workflow runs are fetched fresh on every request despite changing infrequently. The existing Redis cache infrastructure (`packages/shared/src/cache/cacheClient.ts`) supports this via `cacheGetOrSet()` (line 354) but is not used for these endpoints.

**Caching targets:**

| Data            | Recommended TTL                       | Cache Key Pattern                                  | Rationale                             |
| --------------- | ------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| Repository list | 5 min (`CACHE_TTL_SECONDS.MEDIUM`)    | `kenchi:cache:github:repos:{installationId}`       | Repos rarely change                   |
| PR metadata     | 2 min (`CACHE_TTL_SECONDS.SHORT` × 2) | `kenchi:cache:github:pr:{owner}:{repo}:{prNumber}` | Active during analysis, stale quickly |
| Workflow runs   | 1 min (`CACHE_TTL_SECONDS.SHORT`)     | `kenchi:cache:github:runs:{owner}:{repo}:{sha}`    | Checked frequently during aggregation |
| GitLab projects | 5 min (`CACHE_TTL_SECONDS.MEDIUM`)    | `kenchi:cache:gitlab:projects:{tenantId}`          | Slow-changing                         |

**Implementation pattern using existing `cacheGetOrSet`:**

```typescript
import { cacheGetOrSet, CACHE_TTL_SECONDS } from "@kenchi/shared";

const getRepositories = async (installationId: number): Promise<readonly RepositoryInfo[]> =>
  cacheGetOrSet(
    `kenchi:cache:github:repos:${installationId}`,
    () => fetchRepositoriesFromGitHub(installationId),
    { ttlSeconds: CACHE_TTL_SECONDS.MEDIUM }
  );
```

**Additionally:** Use GitHub ETags/conditional requests (`If-None-Match`) where supported. GitHub returns `304 Not Modified` with no body, saving bandwidth and rate limit quota.

**Impact:** Reduces GitHub API call volume significantly during dashboard loads and analysis pipelines. Preserves rate limit budget for write operations.

---

### 7. Add Frontend Prefetching

**Problem:** Users navigate between dashboard pages and always wait for data to load. With TanStack Query (Tier 1, item 2), prefetching becomes trivial.

**Implementation (depends on Tier 1 item 2):**

```typescript
// Prefetch on hover over sidebar navigation links
const prefetchAnalyses = () => {
  queryClient.prefetchQuery({
    queryKey: ["dashboard", "analyses", { limit: 20, offset: 0 }],
    queryFn: () => fetchAnalyses({ limit: 20, offset: 0 }),
    staleTime: 30_000,
  });
};

// In sidebar component
<NavLink to="/dashboard/analyses" onMouseEnter={prefetchAnalyses}>
  Analyses
</NavLink>
```

**Impact:** Perceived latency drops to near-zero for common navigation paths. Only fetches if data is stale.

---

### 8. Batch and Bound Parallel GitHub API Calls

**Problem:** Multiple places in the codebase use unbounded `Promise.all()` for parallel GitHub API calls, risking secondary rate limits.

**Affected locations:**

| File                                                | Line | Pattern                                                                                         | Risk                                                    |
| --------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `services/github-app/src/adapters/githubAdapter.ts` | 191  | `Promise.all(remainingBatches.map(...))` for annotation batch upload                            | Unbounded parallel `checks.update` calls                |
| `services/api/src/adapters/githubOAuthAdapter.ts`   | 638  | `Promise.all(orgsWithMissingRoles.map(async (org) => ...))` for per-org membership role fetches | Unbounded parallel `/user/memberships/orgs/{org}` calls |

**For annotation batches (github-app service):**

```typescript
// Current: unbounded
await Promise.all(
  remainingBatches.map((batch) => octokit.rest.checks.update({ ... }))
);

// Target: bounded (annotation batches are typically small, but cap at 5)
import pMap from "p-map";
await pMap(remainingBatches, (batch) => octokit.rest.checks.update({ ... }), { concurrency: 5 });
```

**For per-org membership fetches (API service):**

```typescript
// Current: unbounded — fans out N requests for N orgs
const enrichedRoles = await Promise.all(
  orgsWithMissingRoles.map(async (org) => ({
    login: org.login,
    role: await fetchOrgMembershipRole(accessToken, instanceUrl, org.login, context),
  }))
);

// Target: bounded concurrency
import pMap from "p-map";
const enrichedRoles = await pMap(
  orgsWithMissingRoles,
  async (org) => ({
    login: org.login,
    role: await fetchOrgMembershipRole(accessToken, instanceUrl, org.login, context),
  }),
  { concurrency: 5 }
);
```

> [!NOTE]
> `pMap` is referenced in the codebase (imported from `@kenchi/shared` in `packages/shared/src/llm/validation.ts`) but the `resilientClient.ts` does not currently re-export it. Consider adding a shared `pMap` re-export from `@kenchi/shared` for consistent use.

**Additionally:** When analyzing a PR, `services/github-app/src/adapters/githubAdapter.ts` makes sequential calls for PR details, files, and commits. These are independent and can be parallelized with `Promise.all()`:

```typescript
const [pr, files, commits] = await Promise.all([
  octokit.rest.pulls.get({ owner, repo, pull_number }),
  octokit.rest.pulls.listFiles({ owner, repo, pull_number }),
  octokit.rest.pulls.listCommits({ owner, repo, pull_number }),
]);
```

**Impact:** Reduces per-PR analysis latency by 2–3x. Bounded concurrency prevents GitHub secondary rate limits.

---

### 9. SSE Client-Side Reconnection Backoff

**Problem:** The browser's native `EventSource` API relies on its built-in retry mechanism, which uses the server's `retry:` hint (currently 5s, set in `SSE_CONFIG.RETRY_MS`). However, there is no exponential backoff or client-side heartbeat detection.

> [!NOTE]
> **Correction from prior version:** The server-side SSE implementation **already has** heartbeat support:
>
> - `services/api/src/routes/sseRoutes.ts` line 206–209: sends `:heartbeat\n\n` every `SSE_CONFIG.HEARTBEAT_INTERVAL_MS` (30s)
> - `services/api/src/routes/sseRoutes.ts` line 196: sends `retry: 5000\n\n` to hint reconnect interval
> - Connection limits: per-tenant (10) and global (200) already enforced
>
> The gap is **client-side only**: no heartbeat detection, no exponential backoff, no jitter.

**Current client-side (`services/frontend/src/hooks/useDashboardSSE.ts`):**

```typescript
// Line 247 — native EventSource, relies on browser retry
const eventSource = new EventSource(SSE_ENDPOINT, { withCredentials: true });

// Line 252 — error handler is a no-op
eventSource.addEventListener("error", () => {
  // Browser will auto-reconnect; no action needed
});
```

**Target: Wrap EventSource with exponential backoff + heartbeat detection:**

```typescript
const createResilientEventSource = (
  url: string,
  options: EventSourceInit
): { source: EventSource; cleanup: () => void } => {
  const MAX_BACKOFF_MS = 30_000;
  const INITIAL_BACKOFF_MS = 1_000;
  const HEARTBEAT_TIMEOUT_MS = 45_000; // Server sends heartbeat every 30s

  let backoffMs = INITIAL_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let source = new EventSource(url, options);

  const resetHeartbeat = () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      source.close();
      scheduleReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const scheduleReconnect = () => {
    const jitter = Math.random() * 0.3 * backoffMs;
    const delay = backoffMs + jitter;
    reconnectTimer = setTimeout(() => {
      source = new EventSource(url, options);
      attachListeners(source);
    }, delay);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  };

  // Reset backoff on successful connection
  const onOpen = () => {
    backoffMs = INITIAL_BACKOFF_MS;
    resetHeartbeat();
  };

  // ... attach listeners, cleanup function
};
```

> [!TIP]
> The heartbeat comment format from the server is `:heartbeat\n\n` (SSE comment — native EventSource ignores comment-only lines but they keep the TCP connection alive). To detect heartbeats on the client, listen for **any** incoming data (message or comment) by monitoring the `onmessage` and custom event handlers, and reset a timer on each.

**Impact:** Prevents thundering herd on server restarts. Heartbeat detection catches silently dropped connections.

---

## Tier 3 — Important for Scale

### 10. Connection Pool Tuning

**Problem:** Pool defaults are sensible for a single instance but need tuning for multi-instance deployments.

**Affected files:**

- `packages/shared/src/constants/database.ts` — `DATABASE_POOL_DEFAULTS`
- `packages/shared/src/constants/redis.ts` — Redis connection defaults

**Database pool guidance:**

| Setting                 | Current | Multi-Instance Target             | Notes                                       |
| ----------------------- | ------- | --------------------------------- | ------------------------------------------- |
| `MAX_CONNECTIONS`       | 25      | `Math.floor(100 / instanceCount)` | PostgreSQL default `max_connections` is 100 |
| `IDLE_TIMEOUT_MS`       | 30,000  | 30,000                            | Already reasonable                          |
| `CONNECTION_TIMEOUT_MS` | 5,000   | 5,000                             | Already reasonable                          |

Wire up `MAX_CONNECTIONS` to the `DB_POOL_SIZE` env var (the constant comment claims this but it is **not implemented**):

```typescript
// In initDatabase config resolution (or service startup)
const maxConnections = process.env.DB_POOL_SIZE
  ? parseInt(process.env.DB_POOL_SIZE, 10)
  : DATABASE_POOL_DEFAULTS.MAX_CONNECTIONS;
```

**Redis pool guidance:**

Separate Redis connections for cache operations vs. pub/sub. Pub/sub connections are long-lived and block on `SUBSCRIBE`; sharing a connection means cache operations can be delayed.

---

### 11. Request Coalescing for Hot Paths

**Problem:** The `/api/v1/dashboard/stats` endpoint is called by every dashboard page load. If 10 users from the same tenant load the dashboard simultaneously, 10 identical queries hit the database.

> [!NOTE]
> The frontend already deduplicates concurrent GET requests via `apiClient`'s `inflightGets` Map. This item addresses **server-side** coalescing to reduce database load when multiple users from the same tenant hit the same endpoint concurrently.

**Implementation: Server-side singleflight pattern:**

```typescript
const inflightRequests = new Map<string, Promise<unknown>>();

const coalesce = async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetcher().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, promise);
  return promise;
};

// Usage in dashboard stats handler
const stats = await coalesce(`dashboard:stats:${tenantId}`, () =>
  dashboardService.getStats(tenantId, context)
);
```

**Candidate endpoints:**

- `GET /api/v1/dashboard/stats` — keyed by `tenantId`
- `GET /api/v1/dashboard/repositories` — keyed by `tenantId`
- `GET /api/v1/dashboard/tenant` — keyed by `tenantId`

**Impact:** Reduces database load proportionally to concurrent users per tenant.

---

### 12. Pagination Limits and Streaming

**Problem:** Several data-fetching paths have no upper bound on the amount of data they process in memory.

**Specific issues:**

| Path                                                                                    | Risk                                                                                                                                  | Mitigation                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GitHub repository pagination (`githubAdapter.ts` `fetchRepositoriesPage`, line 82)      | Recursive pagination with no page limit — an installation with 5,000 repos fetches all pages sequentially                             | Cap at 10 pages (1,000 repos) with a `maxPages` parameter                                      |
| GitHub installation adapter (`githubInstallationAdapter.ts` `getRepositories`, line 72) | Only fetches first page (`per_page: DEFAULT_PER_PAGE`) — silently drops repos beyond page 1                                           | Add pagination or document single-page limitation                                              |
| Log downloads for analysis                                                              | Large CI logs are loaded entirely into memory                                                                                         | Stream to disk via `fs.createWriteStream` or use Node.js `Readable` streams                    |
| Analysis results listing                                                                | No cursor-based pagination — uses offset/limit which degrades on large datasets                                                       | Add cursor-based pagination (`WHERE created_at < :cursor`) for the dashboard analyses endpoint |
| GitLab log fetcher (`gitlabLogFetcherAdapter.ts`)                                       | `fetchAllFailedLogs` fetches all failed jobs, then fetches traces for each with concurrency 5 — but no limit on number of failed jobs | Add `maxJobs` cap                                                                              |

---

### 13. Investigation Polling to SSE Push

**Problem:** `services/frontend/src/hooks/useInvestigationData.ts` polls every 3 seconds for up to 10 minutes (200 requests per investigation) to check investigation status.

**Current (line 20–23):**

```typescript
const investigationPollingConfig = {
  intervalMs: 3000,
  maxPollCount: 200,
} as const;
```

**Target:** Add an `investigation_status_changed` SSE event type. The SSE infrastructure already handles 5+1 event types (see `packages/shared/src/constants/dashboard.ts` `DASHBOARD_EVENT_TYPES`):

```typescript
// Add to DASHBOARD_EVENT_TYPES
INVESTIGATION_STATUS_CHANGED: ("investigation_status_changed",
  // Server-side: publish when investigation status changes
  await publishDashboardEvent(tenantId, {
    type: "investigation_status_changed",
    investigationId,
    status: newStatus,
  }));

// Frontend: listen in useDashboardSSE.ts
eventSource.addEventListener("investigation_status_changed", (event) => {
  const data = parseEventData<{ investigationId: string; status: string }>(event);
  if (data) {
    queryClient.invalidateQueries({
      queryKey: ["investigations", data.investigationId],
    });
  }
});
```

**Impact:** Eliminates up to 200 polling requests per investigation. Real-time status updates instead of 3s latency.

---

### 14. Response Compression and Cache Headers

**Problem:** Dashboard JSON payloads (analyses list, failure list, webhook activity) can be large, especially for active tenants. No `compression` middleware is present in the API service (verified: `grep` for "compression" in `services/api/src` returned zero results).

**If not present:**

```typescript
import compression from "compression";

// Apply before routes
app.use(
  compression({
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Exclude SSE streams (they handle their own framing)
      if (req.headers.accept === "text/event-stream") return false;
      return compression.filter(req, res);
    },
  })
);
```

**Additionally, add `Cache-Control` headers for dashboard endpoints.** Currently only the SSE route and auth routes set `Cache-Control`:

```typescript
// In dashboard route handlers
res.setHeader("Cache-Control", "private, max-age=30"); // Browser caches for 30s
```

**Impact:** 50–80% smaller payload sizes for JSON responses. `Cache-Control` headers eliminate re-fetches during back/forward navigation.

---

### 15. GitLab Adapter Resilience Audit

**Problem:** The GitLab adapters have inconsistent resilience patterns that are not covered in the original plan.

**Affected files:**

| File                                                          | Pattern                                                                                                 | Gap                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `services/github-app/src/adapters/gitlabLogFetcherAdapter.ts` | Uses `resilientGet` for structured data but raw `fetch()` with 30s timeout for job trace text responses | No retry on trace fetch; trace responses can be large (text/plain) |
| `services/github-app/src/adapters/gitlabTokenRefresh.ts`      | Unknown resilience pattern                                                                              | Needs audit — token refresh is critical path                       |
| `services/github-app/src/adapters/gitlabWebhookAdapter.ts`    | Unknown resilience pattern                                                                              | Needs audit                                                        |
| `services/github-app/src/adapters/gitlabOutputAdapter.ts`     | Unknown resilience pattern                                                                              | Needs audit                                                        |
| `services/api/src/adapters/gitlabOAuthAdapter.ts`             | 10s timeout, 0 retries (same pattern as other OAuth adapters)                                           | Covered by Tier 1 item 1                                           |
| `services/api/src/adapters/gitlabProjectsAdapter.ts`          | Unknown resilience pattern                                                                              | Needs audit                                                        |

**Implementation note:** The GitLab log fetcher already has `LOG_FETCH_CONCURRENCY = 5` for parallel trace fetching, which is good. But the individual trace fetch (`fetchJobTrace`) uses raw `fetch()` because the response is `text/plain`, not JSON. The resilient client's `handleSuccess` method always calls `response.json()` (line 317), so it cannot be used for text responses. Consider adding a `responseType: "text"` option to the resilient client.

---

### 16. Incident Triage and Slack Bot Resilience Audit

**Problem:** Two entire services (`services/incident-triage/` and `services/slack-bot/`) are not covered by this plan. Both likely make external API calls (monitoring integrations, Slack API) that need the same resilience patterns.

**Action:** Audit all external HTTP calls in:

- `services/incident-triage/src/` — monitoring service integrations (Datadog, Grafana, PagerDuty)
- `services/slack-bot/src/` — Slack Web API calls

These should follow the same resilient client migration pattern as Tier 1 item 1.

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

### 21. Resilient Client Support for Non-JSON Responses

The resilient client currently always parses responses as JSON (`response.json()` in `handleSuccess`, line 317). This prevents using it for:

- GitLab job trace fetching (text/plain)
- GitHub raw content API (text/plain or application/octet-stream)
- Any binary download

Add a `responseType: "text" | "json" | "blob"` option to `resilientFetch` to support all response types.

### 22. Resilient Client Support for Form-Encoded Bodies

The resilient client always serializes request bodies as JSON (`JSON.stringify(context.body)` at line 242). This blocks migration of OAuth adapters that use `application/x-www-form-urlencoded`. Add a `rawBody: string` option that bypasses JSON serialization.

---

## Quick Wins

Changes that can be implemented in less than one day each, ordered by effort-to-impact ratio:

| #   | Change                                                                  | File(s)                                                                                                                           | Impact                                                                 |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A   | Add `request: { timeout: 30_000 }` to **all** Octokit constructors      | `services/github-app/src/adapters/githubAdapter.ts` (line 52), `services/api/src/adapters/githubInstallationAdapter.ts` (line 50) | Prevents hung connections from blocking workers                        |
| B   | Set `statement_timeout` in DB pool config                               | `packages/shared/src/constants/database.ts`, `packages/shared/src/database/client/client.ts`                                      | Prevents connection pool exhaustion from runaway queries               |
| C   | Wire up `DB_POOL_SIZE` env var                                          | `packages/shared/src/database/client/client.ts` (or service startup)                                                              | Enables per-instance pool sizing for horizontal scaling                |
| D   | Fix `rateLimitByPlan` comment                                           | `packages/shared/src/http/rateLimitByCategory.ts` (line 176)                                                                      | Documentation accuracy — comment says `free: 60` but constant is `200` |
| E   | Add retry with exponential backoff to `useFetch`                        | `services/frontend/src/hooks/useFetch.ts`                                                                                         | Eliminates transient frontend errors without full TanStack migration   |
| F   | Add `Cache-Control: private, max-age=30` to `/dashboard/stats`          | `services/api/src/routes/dashboardRoutes.ts`                                                                                      | Reduces repeat fetches from browser back/forward                       |
| G   | Replace investigation polling with SSE event                            | `services/frontend/src/hooks/useInvestigationData.ts`, `services/api/src/routes/sseRoutes.ts`                                     | Eliminates up to 200 requests per investigation                        |
| H   | Replace unbounded `Promise.all()` in annotation batches with `pMap`     | `services/github-app/src/adapters/githubAdapter.ts` (line 191)                                                                    | Prevents secondary rate limits on large annotation sets                |
| I   | Replace unbounded `Promise.all()` in org membership fetches with `pMap` | `services/api/src/adapters/githubOAuthAdapter.ts` (line 638)                                                                      | Prevents GitHub rate limit issues for users with many orgs             |
| J   | Add `compression` middleware to API service                             | `services/api/src/` (Express setup file)                                                                                          | 50–80% smaller JSON payloads                                           |
| K   | Add page limit to `fetchRepositoriesPage`                               | `services/github-app/src/adapters/githubAdapter.ts` (line 82)                                                                     | Prevents unbounded memory usage for large installations                |

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

| Parameter               | Value        | Notes                                                   |
| ----------------------- | ------------ | ------------------------------------------------------- |
| `MAX_CONNECTIONS`       | 25           | **Not wired to `DB_POOL_SIZE` env var** despite comment |
| `IDLE_TIMEOUT_MS`       | 30,000 (30s) |                                                         |
| `CONNECTION_TIMEOUT_MS` | 5,000 (5s)   |                                                         |

### Rate Limiting Configuration

Source: `packages/shared/src/constants/rateLimitCategory.ts`

**Per-endpoint category limits (per tenant per minute):**

| Category    | Limit     | Window |
| ----------- | --------- | ------ |
| `expensive` | 10/min    | 60s    |
| `standard`  | 500/min   | 60s    |
| `readonly`  | 1,000/min | 60s    |

**Per-tenant plan limits (per minute):**

| Plan         | Limit     | Notes                                         |
| ------------ | --------- | --------------------------------------------- |
| `free`       | 200/min   | ⚠️ Middleware comment incorrectly says 60/min |
| `pro`        | 300/min   |                                               |
| `team`       | 500/min   |                                               |
| `enterprise` | 2,000/min |                                               |

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
