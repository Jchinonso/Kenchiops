# Scaling Architecture

System-design reference for how Kenchi scales. Complements [SCALING.md](./SCALING.md) (current capacity and tiers), [PRODUCTION_SCALABILITY_PLAN.md](./PRODUCTION_SCALABILITY_PLAN.md) (target-state plan), and [API_SCALABILITY_OPTIMIZATION_PLAN.md](./API_SCALABILITY_OPTIMIZATION_PLAN.md) (API-specific optimizations).

**Last updated:** 2026-05-29
**Status:** Architecture reference for the work tracked in [SCALING_IMPLEMENTATION_PLAN.md](./SCALING_IMPLEMENTATION_PLAN.md).

---

## Table of contents

- [Scope and audience](#scope-and-audience)
- [Where load actually comes from](#where-load-actually-comes-from)
- [Three-plane architecture](#three-plane-architecture)
- [Ingestion plane](#ingestion-plane)
- [Worker plane](#worker-plane)
- [Read/API plane](#readapi-plane)
- [Data plane](#data-plane)
- [LLM plane](#llm-plane)
- [Multi-tenant isolation](#multi-tenant-isolation)
- [Observability and autoscaling signals](#observability-and-autoscaling-signals)
- [Failure modes and design responses](#failure-modes-and-design-responses)
- [What we explicitly do not do](#what-we-explicitly-do-not-do)
- [Glossary](#glossary)

---

## Scope and audience

For engineers making changes to the request path, worker pipeline, or data layer. The goal is to converge on one mental model so we stop adding load in the wrong layer.

Out of scope: vendor selection (LLM, vector DB, queue substrate), business logic, frontend rendering, and billing flow design — those have their own docs.

---

## Where load actually comes from

Before picking an architecture, name the bottlenecks. Splitting services by _integration vendor_ (the historical shape — `github-app`, `slack-bot`, `incident-triage`) does not address any of these. Splitting by _workload shape_ does.

| Pressure                      | Shape                                                       | Today's bottleneck                                                              |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **LLM calls**                 | Seconds-to-minutes, hard provider rate limits, $$ per call. | Dominates p95 latency for analysis. The single most important scaling axis.     |
| **Webhook bursts**            | GitHub/PagerDuty/Datadog flood during real incidents.       | Currently processed mostly inline in receiver services; ack budget at risk.     |
| **Postgres (incl. pgvector)** | Mixed OLTP + vector similarity.                             | Single primary. Dashboard reads compete with worker writes and RAG.             |
| **Redis**                     | Queues, pub/sub, cache, dedup, idempotency.                 | Single instance handling all of the above.                                      |
| **Dashboard + SSE**           | Many small reads, long-lived event streams.                 | Fan-out is per-API-pod; horizontal scale needs sticky sessions or a shared bus. |

Every architectural decision below should be traceable back to one of these.

---

## Three-plane architecture

Kenchi scales along three planes — **receive**, **process**, **serve** — backed by queues and a tiered data layer. Splits by integration vendor (`slack-bot`, `github-app`) remain only where the _runtime shape_ demands it (e.g. Slack Socket Mode is a stateful WebSocket).

```
                       External providers
   GitHub  Slack  PagerDuty  Datadog  Grafana  Prometheus  Vercel  Netlify
       │      │       │         │        │         │         │       │
       └──────┴───────┴────┬────┴────────┴─────────┴─────────┴───────┘
                           │
                           ▼
              ┌──────────────────────────────┐    Stateless, N replicas.
              │     Ingestion plane          │    Verify signature, idempotency
              │   (webhook receivers,        │    check, enqueue. Ack < 1s.
              │    Slack Socket Mode)        │    Memory ceiling small.
              └──────────────┬───────────────┘
                             │ Redis fair queues  (ciAnalysisQueue, slack-, github-)
                             ▼
              ┌──────────────────────────────┐    Scaled by QUEUE DEPTH, not CPU.
              │     Worker plane             │    Heterogeneous pools per workload:
              │  llm-extract  llm-aggregate  │    LLM workers high concurrency,
              │  rag-ingest   triage         │    triage workers low concurrency.
              │  notify       maintenance    │    All idempotent. All retried via DLQ.
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐    Stateless HTTP.
              │     Read/API plane           │    Dashboard reads + REST + SSE.
              │  Express + TanStack-friendly │    Reads → replica. Writes → primary.
              │  JSON envelopes, SSE bus     │    SSE fan-out via Redis pub/sub.
              └──────────────┬───────────────┘
                             │
              ┌──────────────┴───────────────┐
              │     Data plane               │
              │   PG primary  → writes       │
              │   PG replicas → dashboard /  │
              │                  RAG reads   │
              │   pgvector or vector DB      │
              │   Redis: cache + queue       │
              │   (separate instances)       │
              └──────────────────────────────┘
```

Each plane is described in detail below.

---

## Ingestion plane

**Responsibility:** receive, authenticate, deduplicate, enqueue. **Nothing else.**

### Required behaviour

For every state-changing webhook handler:

1. Verify provider signature (`verifyGitHubSignature`, `verifySlackSignature`) — **before** parsing body.
2. Fast-path duplicate check via `isWebhookDuplicate(source, deliveryId)` (Redis, fail-open).
3. DB idempotency check via `findWebhookActivityByDeliveryId` (slow path, authoritative).
4. Enqueue a typed job to the correct fair queue.
5. `markWebhookProcessed` and return 200 with a small JSON envelope. Target: **p99 < 1 s, RSS < 128 MB per replica.**

### Why this matters

The current `github-app` heap pressure (≈ 97% of 256 MB ceiling) is caused by doing heavy work — context gathering, evidence assembly, LLM-adjacent prep — in the ack path. Pulling that work into the worker plane is the single highest-leverage change in the implementation plan.

### Scaling shape

- Stateless. Scale horizontally (3+ replicas behind a load balancer).
- Memory ceiling small (128–192 MB); restarts cheap.
- Failure isolation: a stuck worker pool **does not** block ack. The contract is "accepted for processing," not "processed."

### Special case — Slack Socket Mode

`slack-bot` is not an HTTP receiver in the usual sense; it holds a persistent WebSocket to Slack. It belongs in the ingestion plane logically (receive event → enqueue) but scales **vertically**: 1–2 replicas only, because horizontal scale with Socket Mode causes duplicate event delivery. Interactive flows that need synchronous responses (modals, slash commands) call the read/API plane directly.

---

## Worker plane

**Responsibility:** all slow, expensive, or external-dependency-bound work.

### Pool topology

Workers are split into **pools by workload shape**, not by domain. Each pool is a deployment with its own concurrency, memory, and autoscaling profile.

| Pool            | Workload                                    | Concurrency target      | Memory profile      | Autoscale signal                                    |
| --------------- | ------------------------------------------- | ----------------------- | ------------------- | --------------------------------------------------- |
| `llm-extract`   | Per-chunk LLM extraction during CI analysis | High (15+); I/O-bound   | Medium (256–384 MB) | `ciAnalysisQueue` depth                             |
| `llm-aggregate` | Aggregation + final-analysis LLM calls      | Low (2–4); long-running | Higher (512 MB+)    | Aggregate sub-queue depth                           |
| `triage`        | Incident triage pipeline                    | Medium                  | Medium              | Triage queue depth                                  |
| `rag-ingest`    | Embedding + pgvector writes                 | Medium; I/O-bound       | Medium              | RAG ingest queue depth                              |
| `notify`        | Slack / GitHub PR comment posting           | High; I/O-bound         | Small               | `slackNotificationQueue`, `githubActionQueue` depth |
| `maintenance`   | DLQ replay, cleanup, billing reconciliation | Low                     | Small               | Time-based                                          |

### Required behaviour for every worker

- **Idempotent.** Re-running a job must not double-write. Use the job's natural key (analysis ID, delivery ID, incident ID) when upserting.
- **At-least-once delivery is assumed.** Workers handle redelivery gracefully.
- **Bounded concurrency.** Outbound batches use `pMap({ concurrency })`, never raw `Promise.all` over external calls.
- **DLQ on max retries.** Use the existing `messageQueue.ts` retry + DLQ pattern. DLQs are monitored and replayable.
- **Timeouts and classification.** Wrap external calls with `withTimeout` + `classifyHttpError`; throw `ExternalServiceError` with `retryable` flag set.
- **Context propagation.** Reconstruct `RequestContext` from the message metadata so logs carry `requestId` and `tenantId`.

### Today vs target

- **Today:** `analysisWorker` polls Postgres directly via `SELECT … FOR UPDATE SKIP LOCKED` with `ROW_NUMBER()` fairness. `ciAnalysisQueue` (Redis fair queue) exists in `@kenchi/shared` but is not the primary substrate for analysis.
- **Target:** Webhooks enqueue to `ciAnalysisQueue`; the worker becomes a queue consumer. Postgres remains the job-state record (status, timestamps, results) but stops being the dispatch substrate. This unlocks: queue-depth autoscaling, native fairness without `ROW_NUMBER` complexity, and consistent observability with the other pools.

See [SCALING_IMPLEMENTATION_PLAN.md § Phase 2](./SCALING_IMPLEMENTATION_PLAN.md) for the migration steps.

---

## Read/API plane

**Responsibility:** serve dashboard reads, dashboard mutations, third-party-facing endpoints, and SSE.

### Shape

- Stateless Express. Horizontal scale to N replicas behind a load balancer.
- **Reads route to a Postgres read replica**; writes go to primary. The split is done at the repository layer using a small `dbReader` / `dbWriter` distinction, not at the call site.
- Dashboard hot paths are cached in Redis (`@kenchi/shared/cache` already provides `analysisCache`, `userStatusCache`, `tenantCache`, `mappingCache`, `githubCache`).
- SSE fan-out moves from per-pod in-memory subscribers to **Redis pub/sub** so any replica can serve any subscriber. Sticky sessions become unnecessary.

### Rate limiting

The existing `@kenchi/shared/rateLimit` middleware applies at the read/API plane. Webhook receivers use `checkWebhookSourceRateLimit` instead — different limits, different bypass rules for provider-trusted sources.

---

## Data plane

### Postgres

- **Primary** for all writes. PgBouncer (transaction pool mode) sits between application and Postgres to keep connection count bounded.
- **Read replica(s)** for dashboard reads, RAG retrieval, analytics queries. Lag tolerance: ≤ 5 s.
- **Routing rule:** writes and read-after-write within a transaction go to primary; otherwise replica. Encoded once in `@kenchi/shared/database` so call sites stay agnostic.

### pgvector

Stays in Postgres until **either**:

- vector corpus exceeds ~5M rows, **or**
- p95 similarity-search latency exceeds 300 ms under steady load, **or**
- index rebuild time blocks routine writes for > 5 min.

When any of those triggers fires, lift pgvector into a dedicated Postgres instance first (cheapest move). A separate vector DB (Qdrant, Pinecone) is reserved for a future tier and gated by cost analysis.

### Redis

Split by purpose. **One physical instance per role** at moderate scale; Redis Cluster only when one role outgrows a single node.

| Instance      | Persistence       | Eviction                   | Used for                                        |
| ------------- | ----------------- | -------------------------- | ----------------------------------------------- |
| `redis-cache` | None (cache only) | `allkeys-lru`, 512–1024 MB | `cache/*`, dashboard caches, dedup fast-path    |
| `redis-queue` | AOF on            | No eviction                | Queues, DLQs, idempotency keys, pub/sub for SSE |

The current single-instance Redis covers both. The split is mechanical and reversible.

### Connection budgeting

Every service has a documented connection budget for Postgres and Redis. Pool size is `(workers × concurrency) + headroom`. Connection saturation is monitored as a leading indicator of horizontal-scale need.

---

## LLM plane

The LLM is treated as an **untrusted, expensive, slow external dependency**. The LLM plane is not a separate process — it's a discipline applied inside `llm-extract`, `llm-aggregate`, and `triage` workers.

### Cost and latency levers (priority order)

1. **Semantic cache.** Embed the prompt or its canonicalised inputs; check a vector cache before calling the model. Hits short-circuit. The CI-analysis pipeline has high redundancy (same failure types, same repos) and this is the highest-ROI optimisation.
2. **Multi-provider routing with budget caps.** Already partially in place (`LLM_PROVIDER`, OpenAI-compatible endpoints, Google AI Studio default). Extend with: per-tenant budget, automatic failover on rate-limit / 5xx, model-tier downgrade on cost spike.
3. **Provider-side prompt caching** where supported.
4. **Streaming + early-cancel.** Long aggregate calls should stream so a worker can free its slot if the consumer disconnects.
5. **Bounded retry.** Use existing `withRetry`; never retry a non-idempotent prompt without an idempotency key.
6. **Token accounting in every log.** `provider`, `operation`, `model`, `promptTokens`, `completionTokens`, `durationMs`, `tenantId`. Drives both billing and capacity planning.

### Safety boundary (unchanged)

The safety layer (`@kenchi/shared/safety`, action gating, confidence scoring) sits **between** the LLM output and any side-effecting action. No worker takes an action solely because the LLM said so.

---

## Multi-tenant isolation

### Today

- Fair scheduling via `fairScheduler.ts` (per-tenant Redis sub-queues for `ciAnalysisQueue`) **and** `ROW_NUMBER() PARTITION BY workspace_id` in `analysisWorker`.
- Per-tenant quotas (`tenantQuota.ts`, `alertBudgetQuota.ts`) for queue admission and alert dispatch.
- Per-tenant semaphores (`tenantSemaphore.ts`) for bounded concurrency.

### Target

Make tenant isolation a uniform property of the worker plane, not a per-feature ROI:

- Every queue is a fair queue. New queues default to `createFairQueue`, not `createQueue`.
- Every worker pool reads tenant quota at admission, not in mid-job state.
- Per-tenant LLM budget caps enforced at the LLM-call boundary, not at request entry.
- Noisy-tenant detection (sustained queue depth above their fair share for > 5 min) emits an alert; aggressive tenants get rate-limited at the ingestion plane via `checkWebhookSourceRateLimit`.

---

## Observability and autoscaling signals

`@kenchi/shared/observability` already exports `prom-client` metrics middleware. The architecture-level requirement is:

### Required signals

| Signal                                                    | Source                | Used for                       |
| --------------------------------------------------------- | --------------------- | ------------------------------ |
| `kenchi_queue_depth{queue, tenant}`                       | Redis `LLEN` exporter | Worker pool autoscaling        |
| `kenchi_worker_lag_seconds{pool}`                         | Worker self-report    | SLO alerts                     |
| `kenchi_llm_tokens_total{provider, model, tenant}`        | LLM wrapper           | Cost + capacity planning       |
| `kenchi_llm_budget_remaining{tenant}`                     | Budget store          | Alerting + rate-limit triggers |
| `kenchi_pg_pool_in_use{role}`                             | `pg-pool`             | DB scale signal                |
| `kenchi_redis_command_latency_seconds{instance, command}` | Redis client          | Cache/queue health             |
| `kenchi_webhook_ack_seconds{source}`                      | Ingestion middleware  | Ack-budget SLO                 |

### Autoscaling rules

- **Worker pools** scale on `queue_depth / target_throughput`, not CPU. CPU-based autoscaling is wrong for LLM-bound work — workers sit idle on network.
- **API plane** scales on a combination of p95 latency, in-flight requests, and active SSE connections.
- **Ingestion plane** scales on ack p99 and incoming RPS.

Compose `--scale` is the implementation today; HPA-equivalent rules move with the workload when (if) the deployment substrate changes.

---

## Failure modes and design responses

| Failure                        | Design response                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| LLM provider 5xx storm         | Circuit breaker (already present); failover to secondary provider; surface degraded status on dashboard. |
| LLM budget exhausted (tenant)  | Reject new analysis jobs with a typed error; emit alert; do not silently swallow.                        |
| Postgres primary unavailable   | Read plane stays up against replica (degraded); writes queue in Redis with bounded retry; alarm.         |
| Redis (queue) unavailable      | Webhook ingestion fails closed (return 5xx so providers retry); workers idle; alarm.                     |
| Redis (cache) unavailable      | Read plane bypasses cache, hits replica directly. Fail-open.                                             |
| Webhook flood (one provider)   | `checkWebhookSourceRateLimit` sheds load before signature verification; worker pool continues draining.  |
| Single-tenant runaway          | Fair scheduler + tenant quota cap their share; alert fires; budget cap halts further work.               |
| Worker pool stuck (DLQ growth) | Alert on DLQ depth; replay path documented; root-cause-then-replay, never silent retry-on-redeploy.      |

Every one of these has an existing primitive in `@kenchi/shared` — the architectural ask is that we _use them uniformly_, not that we build new ones.

---

## What we explicitly do not do

- **Do not** further split services by integration vendor. The remaining splits (slack-bot, github-app) are justified by runtime shape, not domain.
- **Do not** scale workers on CPU.
- **Do not** route reads at the call site. Read/write routing is one concern owned by the data layer.
- **Do not** add a vector DB or shard Postgres before the documented triggers fire.
- **Do not** introduce a new queue substrate (BullMQ, Kafka, NATS) unless the existing Redis-backed queue has hit a documented ceiling. We have ioredis, pub/sub, DLQs, fair scheduling, and concurrency limiters already.
- **Do not** allow business logic in the ingestion plane. If a webhook handler needs to "just look something up before enqueueing," that lookup goes into the worker.

---

## Glossary

- **Ack budget** — wall-clock time between receiving a webhook and returning 2xx. Provider-defined (GitHub ≤ 10 s; Slack ≤ 3 s).
- **DLQ** — dead-letter queue. Where messages land after exhausting retries.
- **Fair queue** — Redis-backed queue with per-tenant sub-queues; round-robins to prevent tenant starvation. See `packages/shared/src/queue/fairScheduler.ts`.
- **Plane** — a tier of the system with a distinct scaling profile (ingestion, worker, read/API, data).
- **Semantic cache** — vector-similarity cache keyed by embedding of canonicalised prompt input.
