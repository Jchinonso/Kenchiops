# Scaling Implementation Plan

Phased plan to move Kenchi onto the architecture described in [SCALING_ARCHITECTURE.md](./SCALING_ARCHITECTURE.md). Each phase is independently shippable, additive, and reversible. Phases are ordered by **leverage per unit risk**, not by topic.

**Last updated:** 2026-05-29
**Status:** Plan of record. Subject to revision per phase retro.

---

## Table of contents

- [How to use this plan](#how-to-use-this-plan)
- [Cross-cutting principles](#cross-cutting-principles)
- [Pre-flight: instrumentation baseline](#pre-flight-instrumentation-baseline)
- [Phase 1 — Shrink the github-app ack path](#phase-1--shrink-the-github-app-ack-path)
- [Phase 2 — Consolidate analysis on the fair queue](#phase-2--consolidate-analysis-on-the-fair-queue)
- [Phase 2.5 — Worker execution idempotency](#phase-25--worker-execution-idempotency)
- [Phase 3 — Split Redis by purpose](#phase-3--split-redis-by-purpose)
- [Phase 4 — Postgres read replica and routing](#phase-4--postgres-read-replica-and-routing)
- [Phase 5 — SSE on Redis pub/sub](#phase-5--sse-on-redis-pubsub)
- [Phase 6 — Semantic LLM cache + per-tenant budget caps](#phase-6--semantic-llm-cache--per-tenant-budget-caps)
- [Phase 7 — Worker pool fan-out and queue-depth autoscaling](#phase-7--worker-pool-fan-out-and-queue-depth-autoscaling)
- [Phase 8 — Provider failover and circuit hardening](#phase-8--provider-failover-and-circuit-hardening)
- [Future phases (gated on triggers)](#future-phases-gated-on-triggers)
- [Rollback playbook (per phase)](#rollback-playbook-per-phase)
- [Risk register](#risk-register)

---

## How to use this plan

- **Each phase has the same structure:** goal, why now, files touched, work items, acceptance criteria, risk, rollback.
- **Acceptance criteria are measurable.** No phase is complete until they hit prod.
- **Files touched is indicative, not exhaustive.** Use it as a starting point for the PR.
- **Phases 1–5 are mandatory.** Phases 6–8 are mandatory but order-flexible based on what production tells us.
- **Use feature flags** (`@kenchi/shared/config`) to gate every behavioural change. Flag names suggested per phase.

---

## Cross-cutting principles

These apply to every phase. Reviewers should reject PRs that violate them.

1. **No new utilities outside `@kenchi/shared`.** If a helper would be useful in two services, it belongs in shared from day one.
2. **Every change keeps the old path alive behind a flag until the new path proves out.** Burn the bridge in a follow-up PR after one week of clean prod.
3. **Logs over docs for behaviour changes.** New code paths emit structured logs with the flag state so we can answer "did this fire?" without grep gymnastics.
4. **No retries on non-idempotent operations without an idempotency key.** Restated from CLAUDE.md because the temptation to "just retry it" is highest during scaling work.
5. **No schema migrations that block writes.** Online migrations only. Backfills behind a worker.
6. **Every PR in this plan links back to the phase here.** Use `Refs: docs/SCALING_IMPLEMENTATION_PLAN.md § Phase N`.
7. **Side effects are guarded at the point of execution, not just at ingestion.** Webhook-level dedup protects the _ack_ boundary; it does **not** protect the _worker_ boundary. Any worker action that spends money (LLM call), writes to an external system (PR comment, Slack message), or debits a counter (budget) must be made idempotent against at-least-once redelivery via a committed execution key — see [Phase 2.5](#phase-25--worker-execution-idempotency). "Use the natural key when upserting" only covers our own DB rows; it does not cover non-upsert side effects.

---

## Pre-flight: instrumentation baseline

**Goal:** before changing behaviour, make sure we can tell whether the change helped.

**Why now:** every phase below claims a measurable improvement. We need the dashboards to exist first or we're flying blind.

**Files touched (indicative):**

- `packages/shared/src/observability/metrics.ts` — register new metrics
- `packages/shared/src/queue/messageQueue.ts` — emit `queue_depth`, `dlq_depth`, `enqueue_total`, `dequeue_total`, `processing_seconds`
- `packages/shared/src/llm/**` — emit token-usage histograms with `provider`, `model`, `tenantId`
- `packages/shared/src/database/dbPool.ts` (or equivalent) — emit `pg_pool_in_use`, `pg_pool_waiting`
- `infra/grafana/dashboards/` — new dashboard JSONs

**Work items:**

1. Define the metric names listed in [SCALING_ARCHITECTURE.md § Observability](./SCALING_ARCHITECTURE.md#observability-and-autoscaling-signals).
2. Add Grafana dashboards: "Worker pools", "Webhook ack budget", "LLM cost", "DB pools".
3. Add Prometheus alerts: DLQ growth rate, ack-budget p99 > 2 s, worker lag > 60 s, LLM budget < 10%.
4. Snapshot baseline numbers in this doc under a "Baseline" subsection in each subsequent phase.

**Acceptance criteria:**

- New dashboards visible at `http://localhost:3005` and populated with at least 24 h of data.
- Alerts firing dry-run only (no PagerDuty yet) for one week.
- Baseline numbers recorded.

**Risk:** low. Pure observability addition; no behaviour change.

**Rollback:** disable scrape configs; metrics expose no-op.

---

## Phase 1 — Shrink the github-app ack path

**Goal:** webhook handlers in `services/github-app/src/routes/webhookRoutes.ts` do **only** signature verify → idempotency check → enqueue → 2xx. All analysis work moves to the worker plane.

**Why now:**

- `kenchi-github-app-1` runs at ~97% heap of its 256 MB ceiling. The cause is inline context gathering during webhook processing.
- This is the single highest-leverage change. Once the receiver is thin, the github-app scales horizontally for free.
- Unblocks Phase 2 (the worker becomes a queue consumer of the same jobs).

**Files touched (indicative):**

- `services/github-app/src/routes/webhookRoutes.ts` — strip handler bodies
- `services/github-app/src/handlers/checkRunHandler.ts`, `checkRunAnalysis.ts`, `pullRequestHandler.ts` — move bodies to worker jobs
- `services/github-app/src/handlers/combinedAnalysis*.ts`, `simplifiedAnalysis.ts` — move to worker
- `services/api/src/workers/analysisWorker.ts` — accept enqueued jobs as the new entry point
- `packages/shared/src/queue/queueInstances.ts` — confirm `ciAnalysisQueue` settings cover all new job types
- `packages/shared/src/queue/types.ts` — typed job payloads for each handler that moves
- `docker-compose.yml` — drop github-app `--max-old-space-size` to 192M to enforce the new contract

**Work items:**

1. Add a discriminated-union `CIAnalysisJob` type in `@kenchi/shared` covering check_run, pull_request, and combined analysis variants.
2. In the webhook routes, after `markWebhookProcessed`, enqueue the typed job and return 200. No conditional analysis. No DB writes beyond `webhook_activity`.
3. Move the existing handler bodies into worker functions invoked by `analysisWorker` / a new `githubEventWorker` per job type.
4. Reconstruct `RequestContext` from message metadata at worker entry.
5. Feature flag: `WEBHOOK_INLINE_ANALYSIS` (default `false` after rollout). When `true`, behaviour matches today's path.
6. Lower the memory ceiling on github-app to 192M to _prove_ the receiver is thin.

**Acceptance criteria:**

- p99 ack latency for `POST /webhook` on github-app < 500 ms.
- github-app RSS p95 < 150 MB sustained.
- Zero analysis regression: `analyses_completed_total` per day within ±2% of baseline.
- Zero increase in DLQ depth for `kenchi:queue:ci-analysis:dlq`.

**Risk:** medium. Behavioural change in the hottest path. Mitigations: feature flag, canary on staging for 72 h, watch `webhook_ack_seconds` and `analyses_started_total` divergence as a leading indicator.

**Rollback:** flip `WEBHOOK_INLINE_ANALYSIS=true`; restart github-app.

---

## Phase 2 — Consolidate analysis on the fair queue

**Goal:** make `ciAnalysisQueue` (Redis fair queue) the single dispatch substrate for CI analysis. Postgres `analysis_jobs` remains the **state record** (status, timestamps, results) but stops being the **work queue**.

**Why now:**

- `analysisWorker` currently polls Postgres with `SELECT … FOR UPDATE SKIP LOCKED` and a `ROW_NUMBER() PARTITION BY workspace_id` fairness trick. This works but reinvents what `ciAnalysisQueue` already provides natively.
- Two substrates means two places where fairness, retries, and observability diverge.
- Phase 1 already enqueues to `ciAnalysisQueue`; Phase 2 makes the worker consume from there.

**Files touched (indicative):**

- `services/api/src/workers/analysisWorker.ts` — replace DB polling with queue consumption
- `packages/shared/src/queue/fairScheduler.ts` — confirm `consume` semantics, add visibility timeout + heartbeat if missing
- `packages/shared/src/database/analysisJobs/repository.ts` (or equivalent) — keep create/update; remove the "claim" path
- `services/api/src/services/analysisService.ts` — `enqueue` writes the `pending` row **and** publishes the job message in one transaction-equivalent step (write row → enqueue; if enqueue fails, mark row as `enqueue_failed` and let a reconciliation worker retry)

**Work items:**

1. Audit `fairScheduler.ts`: confirm visibility timeout, retry-on-crash, and DLQ behaviour. Add tests if gaps.
2. Implement worker consumption loop that pulls from `ciAnalysisQueue` instead of polling Postgres.
3. Add a **reconciliation worker** (`maintenance` pool) that finds DB rows in `pending` status without a corresponding queue message and re-enqueues them. Runs every 60 s.
4. Feature flag: `ANALYSIS_DISPATCH_SUBSTRATE` with values `db` (today) | `queue` (new) | `dual` (write both; consume queue, ignore DB). Default `db`; promote per environment.
5. Delete the `ROW_NUMBER` fairness query once `queue` is default in prod for 1 week.

**Acceptance criteria:**

- 100% of new analyses dispatched via `ciAnalysisQueue`.
- `analysis_jobs` table still has correct status transitions, validated by a query that joins `analysis_jobs` with `queue_messages` history (or DLQ).
- p95 time-to-first-LLM-call ≤ today's baseline.
- Fewer Postgres queries per analysis (measurable via pg metrics).

**Risk:** medium. Job-state machine across two systems is famously bug-prone. Mitigations: `dual` mode for 1 week, reconciliation worker, comprehensive tests on the state machine.

**Rollback:** set `ANALYSIS_DISPATCH_SUBSTRATE=db`; the DB polling path remains intact until the deletion PR ships.

---

## Phase 2.5 — Worker execution idempotency

**Goal:** a redelivered job never double-charges an LLM budget, never posts a duplicate PR comment or Slack message, and never re-executes any committed side effect. Make idempotent execution a uniform property of the worker plane via a single committed **execution ledger**, not a per-handler ad-hoc check.

**Why now:**

- Phases 1–2 move all side-effecting work (LLM calls, comment posting, budget debits) onto an **at-least-once** queue. The architecture explicitly assumes redelivery ([SCALING_ARCHITECTURE.md § Worker plane](./SCALING_ARCHITECTURE.md#worker-plane)).
- The webhook-level dedup (`webhook_activity`, `isWebhookDuplicate`) protects the **ack** boundary only. The dangerous window is _after_ ack: a worker calls the LLM (spends money), posts a PR comment, then crashes **before** marking the job done. On redelivery it pays again and comments again.
- "Use the natural key when upserting" covers our own rows but **not** non-upsert side effects — an LLM charge and a `POST .../comments` are not upserts.
- This must land **before** Phase 7 (pool fan-out) and Phase 8 (provider failover), both of which _increase_ redelivery frequency (DLQ replay, mid-call provider retries). Sequenced here because it depends on Phase 2's queue-consumption model.

**Files touched (indicative):**

- `database/migrations/` — new table `execution_ledger` (`execution_key text primary key`, `job_key text`, `effect_kind text`, `result jsonb`, `tenant_id text`, `created_at timestamptz`, `expires_at timestamptz`)
- `packages/shared/src/idempotency/` — add `executionGuard.ts`: `runOnce(executionKey, effectKind, fn, context)` that returns the prior result if the key is committed, else runs `fn` and records it transactionally
- `packages/shared/src/llm/budget.ts` — **constraint carried into Phase 6**, where this file is created: `charge` must be built idempotent from day one via a `chargeKey` (`{jobKey}:{callIndex}`) backed by the same ledger, so a repeated charge is a no-op that returns the prior debit. No budget code lands in 2.5; the requirement is recorded here so Phase 6 cannot ship a non-idempotent debit.
- `services/api/src/workers/**` — wrap every external side effect (LLM completion, PR comment, Slack post) in `runOnce`
- `packages/shared/src/queue/types.ts` — carry a stable `jobKey` (analysis ID / delivery ID / incident ID) on every message so workers can derive deterministic execution keys

**Work items:**

1. Add the `execution_ledger` table (online migration, `IF NOT EXISTS`). TTL column drives cleanup by the `maintenance` pool; default 30 days to match the webhook replay window.
2. Implement `executionGuard.runOnce`: look up `executionKey`; if present return stored `result`; else execute, then `INSERT ... ON CONFLICT DO NOTHING` the result. The conflict path means a concurrent duplicate lost the race — re-read and return the winner's result. Never two executions.
3. Derive deterministic execution keys at the call site: `{jobKey}:{effectKind}:{discriminator}` (e.g. `analysis_8f3:llm_extract:chunk_4`, `analysis_8f3:github_comment`). No timestamps or random values in the key.
4. Record the budget-idempotency requirement against Phase 6 (budget code is created there): debit keyed by `chargeKey`; redelivery returns the existing debit instead of subtracting again; `budget.check` (pre) and `budget.charge` (post) bracket the guarded call. Phase 6 acceptance must include a redelivery-no-double-debit test.
5. Comment / message posting: store the provider-returned resource ID (comment ID, Slack `ts`) in the ledger `result`. On redelivery, short-circuit and return the stored ID — never a second `POST`. Use provider idempotency headers where available; the ledger is the backstop where they are not (GitHub issue comments have none).
6. Structured log on every guard decision: `effectKind`, `executionKey`, `outcome: "executed" | "replayed"`, `...context`. Drives the acceptance metric below.

**Acceptance criteria:**

- Forced-redelivery test: replay a completed `ciAnalysisQueue` job 10×. Exactly **one** LLM charge, **one** PR comment, one budget debit. Verified by `execution_ledger` row count and `outcome: "replayed"` log lines for the other 9.
- Crash-injection test: kill a worker after the LLM call but before completion ack. On redelivery, the LLM result is replayed from the ledger (no second provider call), and the comment is posted exactly once.
- New metric `kenchi_worker_effect_replayed_total{effect_kind}` is non-zero in staging within one week (proves the guard is actually catching redeliveries, not dormant).
- Zero duplicate-comment reports in staging over one week.

**Risk:** medium. A wrong execution key is worse than no guard — too broad collapses distinct effects into one (a legitimate second comment is suppressed); too narrow defeats the purpose. Mitigations: keys derived from stable job fields only (asserted in tests); guard decisions logged; replay metric watched; start with LLM charge + comment posting, extend to other effects once proven.

**Rollback:** `WORKER_EXECUTION_GUARD=false` — `runOnce` becomes a pass-through (executes `fn`, skips ledger). Reverts to today's at-least-once-without-guard behaviour; the ledger table is inert and safe to leave in place.

---

## Phase 3 — Split Redis by purpose

**Goal:** run two Redis instances — `redis-cache` (volatile, LRU-evicting) and `redis-queue` (persistent, no eviction). All queues, DLQs, pub/sub, idempotency keys move to `redis-queue`; everything in `@kenchi/shared/cache` stays on `redis-cache`.

**Why now:**

- Current single Redis runs `--maxmemory 256mb --maxmemory-policy allkeys-lru`. Allowing queues to be evicted is a latent disaster — `LLEN` returns a smaller number than reality.
- Cleanly splits the failure modes: cache outage is fail-open; queue outage is fail-closed.
- Lays the groundwork for promoting either side independently to Redis Cluster.

**Files touched (indicative):**

- `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging.yml` — add `redis-queue` service; rename existing to `redis-cache`
- `packages/shared/src/queue/redisClient.ts` — expose two named clients (`getCacheRedisClient`, `getQueueRedisClient`)
- `packages/shared/src/cache/cacheClient.ts` — switch to `getCacheRedisClient`
- `packages/shared/src/queue/messageQueue.ts`, `fairScheduler.ts` — switch to `getQueueRedisClient`
- `.env`, `.env.example` — add `REDIS_QUEUE_URL`, repurpose `REDIS_URL` to mean cache
- `infra/prometheus/prometheus.yml` — scrape both Redis instances

**Work items:**

1. Add `redis-queue` to compose with AOF on, no eviction, larger memory ceiling than cache.
2. Add `getQueueRedisClient` / `getCacheRedisClient` in `@kenchi/shared/queue`. Default both to `REDIS_URL` if only one is set (backward-compatible).
3. Migrate references with a single-PR sweep. No feature flag — runtime behaviour is identical when both env vars point to the same instance.
4. Production cutover: set `REDIS_QUEUE_URL` to a fresh instance; drain the in-flight queue messages from the shared instance via a one-time migration script in `scripts/`.

**Acceptance criteria:**

- `redis-cache` and `redis-queue` running as separate containers with distinct configs.
- All `@kenchi/shared/cache/*` traffic on cache; all `@kenchi/shared/queue/*` traffic on queue. Verified by Redis `MONITOR` sample.
- Queue Redis shows 0 keys evicted ever.
- Cache Redis hit rate ≥ baseline.

**Risk:** low–medium. Mostly mechanical, but the cutover window needs a queue-drain plan.

**Rollback:** point `REDIS_QUEUE_URL` back at the cache Redis; restart services.

---

## Phase 4 — Postgres read replica and routing

**Goal:** add a Postgres read replica. Route dashboard reads, RAG retrieval reads, and analytics queries to the replica. Writes and read-after-write within a transaction stay on primary.

**Why now:**

- Dashboard reads currently compete with worker writes on the same connection pool.
- Reads are the easiest workload to move; they are stateless and tolerate ≤ 5 s lag.
- This is the cheapest way to ~2–3× DB headroom before any sharding conversation.

**Files touched (indicative):**

- `packages/shared/src/database/dbClient.ts` (or equivalent) — expose `getReader()` and `getWriter()`
- `packages/shared/src/database/**/repository.ts` — annotate methods with reader vs writer (start with dashboard repos)
- `services/api/src/routes/dashboardRoutes.ts` — confirm calls route via reader
- `packages/shared/src/rag/**` — route retrieval (not ingest) via reader
- `docker-compose.yml` (or infra config) — add `postgres-replica` service with streaming replication; only enabled in staging+prod
- `infra/prometheus/prometheus.yml` — scrape replica lag

**Work items:**

1. Add `DATABASE_READER_URL` config; default to `DATABASE_URL` so single-instance setups still work.
2. Introduce `getReader()` / `getWriter()` in the DB layer. Reader always uses the read pool when `DATABASE_READER_URL` differs from `DATABASE_URL`.
3. Update repositories used by `dashboardRoutes`, `analysisRoutes` GETs, and `rag` retrieval to call `getReader()`.
4. Add a replication-lag check to `/ready` on the API service — return `degraded` if lag > 10 s.
5. Set up streaming replication in staging first; promote to prod after one week clean.

**Acceptance criteria:**

- Dashboard read p95 unchanged or better; primary CPU drops by ≥ 20% under steady load.
- No "row not found" errors from read-after-write paths (verify by alerting on any `NotFoundError` immediately after a known write).
- Replica lag p95 < 2 s, p99 < 5 s.

**Risk:** medium. Read-after-write bugs are subtle. Mitigations: small initial scope (dashboard reads only), structured logging of `dbRole` per query, gradual rollout per repository.

**Rollback:** set `DATABASE_READER_URL=$DATABASE_URL`; everything reverts to the primary path.

---

## Phase 5 — SSE on Redis pub/sub

**Goal:** the API service can be horizontally scaled without sticky sessions. SSE events fan out via Redis pub/sub on `redis-queue` so any API replica can deliver to any subscriber.

**Why now:**

- Today, SSE subscribers are pinned to whichever API pod they connected to. Horizontal scale requires sticky sessions or duplicate events.
- This is the last blocker to running 2+ API replicas in prod.

**Files touched (indicative):**

- `services/api/src/routes/sseRoutes.ts` — change subscriber registration to listen on a Redis channel
- `packages/shared/src/queue/messageQueue.ts` — publish path used wherever the API emits real-time events today (analysis status updates, incident updates, webhook activity, etc.)
- `packages/shared/src/observability/types.ts` — confirm SSE event types are typed

**Work items:**

1. Define `SSE_CHANNELS` constants per event family (`analysis.status`, `incident.update`, `webhook.activity`).
2. Replace the in-memory subscriber map in `sseRoutes` with a per-connection Redis subscription scoped by tenant and event family.
3. All emitters of real-time events `publish` to the matching channel instead of calling the in-memory broadcaster.
4. Document the SSE event contract in `services/api/src/routes/sseRoutes.ts` (JSDoc) and `docs/SYSTEM_ARCHITECTURE.md`.

**Acceptance criteria:**

- API service running 2+ replicas, with subscribers reliably receiving every event regardless of which replica accepted the request.
- Zero "missed event" reports in staging over one week.
- SSE connection count metric exposed; per-replica balance roughly even.

**Risk:** low–medium. Pub/sub is well-understood; the tricky part is per-tenant filtering and avoiding cross-tenant leakage.

**Rollback:** revert sseRoutes to the in-memory broadcaster; reduce API to 1 replica.

---

## Phase 6 — Semantic LLM cache + per-tenant budget caps

**Goal:** before every LLM call, check a pgvector-backed semantic cache. Cache hits short-circuit. Per-tenant budgets are checked at the LLM-call boundary; exhausted budgets reject with a typed error.

**Why now:**

- LLM is the dominant cost driver. CI-analysis inputs are highly repetitive.
- Budget caps prevent a misconfigured tenant from running up unbounded spend.

**Files touched (indicative):**

- `packages/shared/src/llm/**` — add `semanticCache.ts`, `budget.ts`
- `packages/shared/src/llm/providers/llmProvider/` — wrap call boundary with cache check + budget check
- `database/migrations/` — new table `llm_semantic_cache` with `embedding vector(...)`, `prompt_hash text`, `response jsonb`, `created_at`, `tenant_id`, `ttl_at`
- `packages/shared/src/billing/` — surface per-tenant budget; reuse subscription plan limits

**Work items:**

1. Decide cache key strategy: prompt canonicalisation (strip tenant-specific identifiers from prompt before hashing) + embedding. Hash for exact-match; embedding for near-match.
2. Implement `semanticCache.lookup(input, context)` returning `{hit: true, response}` or `{hit: false, embedding}`. On a miss, the caller writes the result back with the embedding it already computed.
3. Implement `budget.check(tenantId, estimatedCost)` and `budget.charge(tenantId, actualCost)`. Backed by Redis counters with a daily reset job. **`charge` must be idempotent** per the [Phase 2.5](#phase-25--worker-execution-idempotency) constraint: debit keyed by `chargeKey`, redelivery is a no-op returning the prior debit. Include a redelivery-no-double-debit test in acceptance below.
4. Wrap `llmClient.complete` (or equivalent) so callers don't change.
5. Per-tenant budget defaults wired into subscription plan limits.
6. Alert when any tenant crosses 80% of daily budget.

**Acceptance criteria:**

- ≥ 20% cache hit rate on CI-analysis extraction within 30 days (target; revise after first week of data).
- Per-tenant daily LLM spend never exceeds configured cap.
- p50 latency for cache-hit paths ≤ 50 ms (vs seconds for a real call).
- No measurable quality regression — sampled human review of cache-hit vs miss outputs.

**Risk:** medium. Quality regressions from over-aggressive caching are subtle. Mitigations: start with exact-match only, add similarity-match behind a separate flag, sample-audit weekly.

**Rollback:** disable `LLM_SEMANTIC_CACHE_ENABLED`; budget enforcement remains.

---

## Phase 7 — Worker pool fan-out and queue-depth autoscaling

**Goal:** worker pools (`llm-extract`, `llm-aggregate`, `triage`, `rag-ingest`, `notify`, `maintenance`) run as separate processes with independent concurrency, memory, and replica counts. Replica count tracks queue depth.

**Why now:**

- After Phases 1–2, all heavy work is already on queues; this phase makes the topology match the architecture.
- Independent pools mean a stuck LLM pool does not delay notification delivery.

**Files touched (indicative):**

- `services/api/src/workers/` — split into pool-specific entry files (`extractWorker.ts`, `aggregateWorker.ts`, `notifyWorker.ts`, …)
- `Dockerfile` — accept a `WORKER_POOL` build arg to start the right entry
- `docker-compose.yml` — add a service per pool with sensible defaults; staging+prod scale via `--scale` or HPA
- New scripts under `scripts/` for queue-depth-based scale recommendations

**Work items:**

1. Extract worker entry points into one file per pool. Each pool reads only its queue.
2. Add `WORKER_POOL` env var; one Docker image, many entrypoints.
3. Set per-pool memory ceilings: `llm-aggregate` higher, `notify` low, etc.
4. Add a small `autoscaler` script that consumes Prometheus metrics and recommends `docker compose scale` deltas. Manual at first; automated only when the recommendations have been right for two weeks.
5. Document target queue depth and lag SLOs per pool in this file.

**Acceptance criteria:**

- Each pool runs as ≥ 1 dedicated replica in staging+prod.
- Pool-level metrics (`queue_depth`, `worker_lag_seconds`) visible on Grafana per pool.
- A simulated backlog of 1000 extraction jobs drains in ≤ 10 min with the autoscaler recommending the right replica count.

**Risk:** medium. Mostly operational. Mitigations: stage in staging for 2 weeks, document runbooks for each pool.

**Rollback:** run all pools from a single combined-worker entry point on one replica.

---

## Phase 8 — Provider failover and circuit hardening

**Goal:** LLM provider outages are absorbed transparently. Per-provider circuit breakers drive automatic failover. Per-tenant model overrides are honoured.

**Why now:**

- Today, circuit breakers exist (`circuit:openai`, `circuit:github`, `circuit:slack` are in `/health`) but failover to a secondary provider is manual.
- LLM provider outages are now common enough to be a real availability concern.

**Files touched (indicative):**

- `packages/shared/src/llm/providers/` — add provider registry with priority order
- `packages/shared/src/llm/providers/llmProvider/` — failover middleware
- `packages/shared/src/observability/alerting.ts` — alert on provider trip rate
- `docs/MULTI_LLM_IMPLEMENTATION_PLAN.md` — cross-link

**Work items:**

1. Define provider priority list per environment (`LLM_PROVIDER_PRIORITY=openai,google,anthropic`).
2. On `CircuitBreakerOpenError` or repeated `retryable=true` failures, fall through to the next provider.
3. Per-tenant override: a tenant pinned to a specific model bypasses failover; the call fails fast with a typed error so the tenant's dashboard reflects it.
4. Track per-provider trip rate and time-to-recovery as metrics.

**Acceptance criteria:**

- Simulated provider outage (block egress to `generativelanguage.googleapis.com`) — analyses continue using the next provider within 30 s.
- No data corruption from mid-stream provider switch (the orchestrator retries the call against the new provider; partial outputs are discarded).

**Risk:** medium. Mid-stream provider switches need careful handling. Mitigations: switch only at call boundaries, never mid-chunk; quality-audit fallback outputs.

**Rollback:** set `LLM_PROVIDER_PRIORITY` to a single provider.

---

## Future phases (gated on triggers)

These are mandatory **eventually** but not scheduled until specific triggers fire. Each trigger is a Prometheus alert.

| Phase                                     | Trigger                                                                      | Why we wait                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dedicated pgvector instance               | `pg_vector_query_seconds{quantile="0.95"} > 0.3` for 7d, or vector rows > 5M | Cheaper than vendor swap; preserves SQL semantics                           |
| Third-party vector DB (Qdrant / Pinecone) | Dedicated pgvector instance saturated                                        | Operational cost only justified at scale                                    |
| Postgres connection pooler (PgBouncer)    | `pg_pool_in_use / pool_size > 0.8` p95                                       | Adds operational surface area; defer until DB connection contention is real |
| Redis Cluster                             | Queue Redis memory > 8 GB working set, or QPS > 50k                          | Single-node Redis is faster; cluster is for HA + capacity, not speed        |
| Per-tenant Postgres schema                | A single tenant exceeds 10% of write volume _and_ asks for data residency    | Operational cost only justified by compliance need                          |

When a trigger fires, open a new phase in this document with the same structure.

---

## Rollback playbook (per phase)

Every phase ships with a rollback procedure. Recap:

| Phase | Rollback                                                                           |
| ----- | ---------------------------------------------------------------------------------- |
| 1     | `WEBHOOK_INLINE_ANALYSIS=true`; restart github-app.                                |
| 2     | `ANALYSIS_DISPATCH_SUBSTRATE=db`; DB polling resumes.                              |
| 2.5   | `WORKER_EXECUTION_GUARD=false`; `runOnce` passes through. Ledger table left inert. |
| 3     | `REDIS_QUEUE_URL=$REDIS_URL`; both clients hit one instance.                       |
| 4     | `DATABASE_READER_URL=$DATABASE_URL`; all reads on primary.                         |
| 5     | Revert `sseRoutes` to in-memory broadcaster; reduce API to 1 replica.              |
| 6     | `LLM_SEMANTIC_CACHE_ENABLED=false`. Budget caps independent.                       |
| 7     | Run combined worker entry on 1 replica.                                            |
| 8     | `LLM_PROVIDER_PRIORITY=openai` (or whichever single provider).                     |

Every rollback must be exercised on staging before the phase is declared complete in prod.

---

## Risk register

Top risks tracked across the whole programme. Update during phase retros.

| Risk                                                                          | Likelihood | Impact | Mitigation                                                                                                               |
| ----------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| Phase 2 dual-write state machine bugs                                         | Medium     | High   | Reconciliation worker; comprehensive state-machine tests; 1 week in `dual` mode                                          |
| Redelivery double-executes side effects (double LLM spend, duplicate comment) | Medium     | High   | Phase 2.5 execution ledger; idempotent `budget.charge`; forced-redelivery + crash-injection tests; replay metric watched |
| Wrong execution key suppresses a legitimate side effect                       | Low        | Medium | Keys from stable job fields only, asserted in tests; guard decisions logged; staged rollout per effect kind              |
| Read-after-write bugs in Phase 4                                              | Medium     | Medium | Small initial scope; log `dbRole` per query; gradual rollout                                                             |
| Cache poisoning in Phase 6 semantic cache                                     | Low        | High   | Per-tenant cache partition; canonicalisation strips tenant data; weekly sample audit                                     |
| Mid-stream LLM provider switch corrupts output                                | Low        | Medium | Switch only at call boundaries; never mid-chunk                                                                          |
| Phase 3 cutover loses in-flight queue messages                                | Medium     | Medium | Drain script; staging dry run; cutover during low-traffic window                                                         |
| Per-tenant budget caps surprise users                                         | Medium     | Low    | Surface budget remaining in dashboard before enforcement; alert at 80%                                                   |
| Phase 1 introduces ack-budget regression                                      | Low        | High   | Feature flag; canary 72 h on staging; ack-budget SLO alert                                                               |
