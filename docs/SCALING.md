# Scaling & Performance Guide

How Kenchi handles load today, when to scale, and how to scale when the time comes.

**Last updated:** 2026-03-10

---

## Table of Contents

- [Current Architecture](#current-architecture)
- [Why the Current Setup Works](#why-the-current-setup-works)
- [Latency & Throughput Profile](#latency--throughput-profile)
- [Traffic Pattern Analysis](#traffic-pattern-analysis)
- [Production Resource Limits](#production-resource-limits)
- [Performance Optimizations Already in Place](#performance-optimizations-already-in-place)
- [Scaling Tiers](#scaling-tiers)
- [Recommended First Steps](#recommended-first-steps)

---

## Current Architecture

Kenchi runs on a **single 4GB VPS** with all services orchestrated by Docker Compose. Caddy handles HTTPS termination and reverse proxying.

```
Internet
   │
   ▼
┌─────────┐
│  Caddy   │  HTTPS termination, reverse proxy
└────┬─────┘
     │
     ├──► Frontend (nginx, static React SPA)           128M
     ├──► API service (Express.js)                     384M
     ├──► GitHub App service (Express.js)              512M
     ├──► Slack Bot service (Bolt.js)                  384M
     └──► Incident Triage service (Express.js)         384M
              │            │
              ▼            ▼
        ┌──────────┐ ┌─────────┐
        │ Postgres │ │  Redis  │
        │ pgvector │ │  7-alp  │
        │  512M    │ │  192M   │
        └──────────┘ └─────────┘
```

Total memory budget: ~2.5GB of 4GB, leaving headroom for OS, Docker overhead, and build spikes.

The key architectural insight is that **users never wait for slow operations**. The system is designed around an async processing loop:

```
Webhook arrives ──► verify signature ──► 200 OK (immediate)
                                              │
                                              ▼
                                    Queue analysis job
                                              │
                                              ▼
                                    Worker picks up job
                                              │
                                              ▼
                                    LLM analysis (2-30s)
                                              │
                                              ▼
                                    Store result in Postgres
                                              │
                                              ▼
                                    Redis PUBLISH to channel
                                              │
                                              ▼
                                    SSE pushes to dashboard
```

---

## Why the Current Setup Works

Kenchi is not a high-throughput web application. It is an **event-driven assistant** where:

1. **Inbound traffic is webhook-driven** -- CI failures, GitHub events, monitoring alerts. These are bursty but low-volume compared to user-facing web traffic.
2. **The expensive work (LLM calls) is fully async** -- no user request ever blocks on an LLM response. Webhook handlers verify the signature, queue a job, and return 200 immediately.
3. **Dashboard traffic is lightweight** -- a handful of concurrent users per team, viewing pre-computed analysis results. SSE keeps dashboards updated without polling.
4. **The bottleneck is the LLM provider, not infrastructure** -- even under load, the constraining factor is OpenRouter/Google AI Studio throughput, not CPU or memory on the VPS.

---

## Latency & Throughput Profile

### Webhook Processing (<5s)

Webhook handlers are designed for fast acknowledgment:

1. Verify signature (`x-hub-signature-256` or `x-slack-signature`)
2. Parse and validate payload
3. Return 200 OK to the caller (GitHub, Slack, etc.)
4. Queue the analysis job for background processing

GitHub and Slack have strict webhook response timeouts (10s and 3s respectively). Because processing is deferred to the worker, Kenchi responds well within those limits.

### LLM Analysis (2-30s, fully async)

The analysis worker in `services/api/src/workers/analysisWorker.ts` polls for pending jobs from the `analysis_jobs` table using `SELECT ... FOR UPDATE SKIP LOCKED`. This avoids queue collision and provides fair scheduling.

The chunking pipeline (`services/api/src/services/analysisChunkingPipeline.ts`) handles CI logs of varying sizes:

| Log Size         | Strategy                  | Why                                                                 |
| ---------------- | ------------------------- | ------------------------------------------------------------------- |
| Under 30K tokens | Single LLM call           | Fast enough as one request (~2-5s)                                  |
| Over 30K tokens  | Parallel chunk extraction | 15 concurrent 3K-token calls is much faster than one 90K-token call |

Key constants from `packages/shared/src/constants/chunkingPipeline.ts`:

- `SMALL_LOG_THRESHOLD`: 30,000 tokens -- logs under this skip chunking
- `EXTRACTION_DEFAULTS.CONCURRENCY`: 15 -- parallel extraction requests
- `EXTRACTION_DEFAULTS.TIMEOUT_MS`: 10,000ms -- per-chunk timeout
- `TARGET_TOKENS`: 3,000 per chunk

No user ever blocks on these operations. Results appear on the dashboard via SSE when analysis completes.

### SSE / Dashboard

Real-time updates use Redis pub/sub with SSE delivery (`services/api/src/routes/sseRoutes.ts`):

- One long-lived HTTP connection per browser client
- Redis PUBLISH on analysis completion, tenant-scoped filtering
- Per-tenant connection limit: 10 concurrent SSE clients
- Global connection limit: 200
- Heartbeat every 30s to detect stale connections
- Client-side exponential backoff with jitter on reconnect
- Debounced SSE refresh and GET deduplication already prevent thundering-herd on the frontend

SSE connections are cheap -- they hold an open HTTP response but consume negligible CPU when idle.

---

## Traffic Pattern Analysis

Kenchi's traffic is **bursty, not sustained**:

| Event Source           | Frequency                    | Pattern                                      |
| ---------------------- | ---------------------------- | -------------------------------------------- |
| GitHub/GitLab webhooks | Per-push, per-PR, per-CI-run | Spikes during work hours, near-zero at night |
| Monitoring alerts      | Per-incident                 | Unpredictable but infrequent                 |
| Dashboard views        | Per-user-session             | Handful of concurrent users per team         |
| LLM analysis           | Per-webhook-event            | Bottlenecked by LLM provider, not infra      |

A team of 20 developers pushing 50 times a day generates roughly 50 webhook events, 50 analysis jobs, and a few hundred dashboard API calls. This is well within what a single 4GB VPS can handle.

---

## Production Resource Limits

From `docker-compose.prod.yml`:

| Service         | Memory Limit | Node.js Heap                  | DB Pool                          |
| --------------- | ------------ | ----------------------------- | -------------------------------- |
| API             | 384M         | 256M (`--max-old-space-size`) | 10 connections                   |
| Slack Bot       | 384M         | 256M                          | 10 connections                   |
| GitHub App      | 512M         | 256M                          | 10 connections                   |
| Incident Triage | 384M         | 256M                          | 10 connections                   |
| Frontend        | 128M         | N/A (nginx)                   | N/A                              |
| Postgres        | 512M         | N/A                           | Default pool (100)               |
| Redis           | 192M         | N/A                           | `maxmemory 128mb`, `allkeys-lru` |
| Caddy           | 128M         | N/A                           | N/A                              |

**Total allocated:** ~2.6GB of 4GB

Additional resource controls:

- Log rotation: `max-size: 10m`, `max-file: 3` per container
- Statement timeout: 30s for all database queries (`STATEMENT_TIMEOUT_MS`)
- Deploy script requires 2GB free disk space before deploying

### Database Connection Budget

Total connections across all services: 40 (4 services x 10 each). Postgres default `max_connections` is 100, leaving 60 connections for migrations, admin tools, and monitoring.

---

## Performance Optimizations Already in Place

These patterns are implemented and running in production today:

### Async Worker-Based LLM Processing

All LLM analysis runs in background workers, never in request handlers. The analysis worker uses fair scheduling (`FAIR_QUEUE_DEFAULTS`) to prevent any single tenant from monopolizing processing:

- Max 2 jobs per tenant per batch fetch
- Max 5 tenants served per polling round
- Per-tenant concurrent analysis cap: 5 jobs

### Resilient HTTP Client

All outbound HTTP calls use the shared resilient client (`packages/shared/src/http/resilientClient.ts`) with:

- 90s default timeout
- 3x retry with exponential backoff
- Circuit breaker protection
- Structured logging with `provider`, `operation`, `durationMs`

### Redis Distributed Rate Limiting

Rate limiting uses Redis atomic scripts (`INCR` + `PEXPIRE`) with in-memory fallback, configured by plan tier:

| Plan            | Rate Limit    |
| --------------- | ------------- |
| Free            | 200 req/min   |
| Pro             | Higher limits |
| Team/Enterprise | Higher limits |

### Server-Side Request Coalescing

Hot dashboard endpoints use `coalesce()` to deduplicate concurrent identical queries. If 5 clients request the same tenant's stats simultaneously, only one database query executes.

### Redis Caching

Cache-aside pattern for frequently accessed data:

- Repository lists (GitHub/GitLab)
- Per-installation Octokit instances
- Organization membership data

### Frontend Optimizations

- TanStack Query with `staleTime` configuration (stale-while-revalidate)
- Hover-based prefetching in dashboard sidebar
- SSE push with 30s polling fallback for investigations
- Debounced SSE refresh prevents burst refetches on rapid events
- GET request deduplication

### Fair Multi-Tenant Scheduling

Per-tenant quotas enforced in real-time via Redis counters:

| Plan | Max Queue Depth | Max Concurrent Jobs | Max Processing Time/Hour |
| ---- | --------------- | ------------------- | ------------------------ |
| Free | 10              | 1                   | 5 minutes                |
| Pro  | 50              | 3                   | 30 minutes               |
| Team | 200             | 5                   | 60 minutes               |

---

## Scaling Tiers

### When to Scale

| Scenario     | Users         | Likely Bottleneck                       | Action                   |
| ------------ | ------------- | --------------------------------------- | ------------------------ |
| 1-10 teams   | ~50 users     | No issues                               | Stay on current setup    |
| 10-50 teams  | ~250 users    | Memory on 4GB VPS, DB connections       | Tier 1: Vertical scaling |
| 50-200 teams | ~1,000 users  | Single-node limits, DB write throughput | Tier 2: Split data layer |
| 200+ teams   | ~2,000+ users | Need horizontal scaling                 | Tier 3-4: Orchestration  |

### Tier 1: Vertical Scaling (No Architecture Changes)

**When:** VPS memory pressure (containers hitting limits), slow dashboard queries, DB connection contention.

**Actions:**

1. **Upgrade VPS to 8-16GB RAM** -- doubles available headroom, raise container memory limits proportionally
2. **Tune Postgres** -- increase `shared_buffers` to 25% of available RAM, add PgBouncer for connection pooling (allows many more logical connections without increasing Postgres backend processes)
3. **Redis caching for hot queries** -- cache organization data, user sessions, and dashboard summary stats (already partially implemented)
4. **CDN for frontend** -- move the static React SPA to Cloudflare Pages or Vercel (free tier), freeing the 128M nginx container and reducing Caddy load

**Cost:** ~$12/mo more for 8GB VPS. CDN is free tier.

### Tier 2: Split Data Layer

**When:** Database becomes the bottleneck -- slow queries under load, backup windows cause latency spikes, need point-in-time recovery.

**Actions:**

1. **Managed Postgres** -- migrate to Supabase, Neon, or RDS. Gains: automatic backups, failover, pgvector support, monitoring. Frees ~512M RAM on VPS.
2. **Managed Redis** -- migrate to Upstash (serverless) or ElastiCache. Gains: persistence guarantees, monitoring. Frees ~192M RAM on VPS.
3. **Raise service limits** -- with ~700M freed, increase API and GitHub App memory limits and DB pool sizes.

Application services remain on the VPS. The only code change is updating `DATABASE_URL` and `REDIS_URL` environment variables in `/etc/kenchi/.env.production`.

**Cost:** Managed Postgres starts at ~$15-25/mo. Managed Redis starts at ~$5-10/mo.

### Tier 3: Horizontal Services

**When:** Single VPS cannot handle the request volume, need independent scaling of workers vs. API servers, zero-downtime deployments required.

**Actions:**

1. **Container orchestration** -- migrate from Docker Compose to k3s (lightweight Kubernetes), Fly.io, or Railway. The existing `Dockerfile` multi-stage build and health check endpoints (`/health`, `/ready`) are already compatible.
2. **Multiple API replicas** -- the API service is stateless (sessions in Redis, no in-process state). Add replicas behind a load balancer. The only adjustment is SSE: clients reconnect to any instance, and Redis pub/sub ensures all instances receive events.
3. **Separate worker scaling** -- run analysis workers as independent processes/containers. Scale workers up when queue depth grows, scale down when idle. The `analysis_jobs` table with `FOR UPDATE SKIP LOCKED` already supports multiple competing workers safely.
4. **Queue depth monitoring** -- alert when pending job count exceeds thresholds, auto-scale workers in response.

**Code changes required:**

- Extract the analysis worker loop from `services/api/src/index.ts` into a standalone entrypoint (the worker logic in `services/api/src/workers/analysisWorker.ts` is already isolated)
- SSE connection tracking must move from in-memory `Map` to Redis (currently `tenantConnectionCounts` in `sseRoutes.ts` is per-process)

### Tier 4: Multi-Region / High Availability

**When:** SLA requirements demand geographic redundancy, or read-heavy workloads need distribution.

**Actions:**

1. **Multiple nodes across regions** -- deploy API replicas in different availability zones
2. **Postgres read replicas** -- route read-heavy dashboard queries to replicas, writes to primary. Requires a routing layer (PgBouncer or application-level read/write splitting)
3. **CDN + edge caching** -- cache API responses for public/semi-public data at the edge
4. **Per-tenant rate limiting** -- already implemented via Redis, but at this scale add per-tenant resource isolation (dedicated worker queues, tenant-aware connection pooling) to prevent noisy neighbors

---

## Recommended First Steps

When growth demands scaling beyond the current 4GB VPS:

| Priority | Action                                   | Cost               | Impact                                              |
| -------- | ---------------------------------------- | ------------------ | --------------------------------------------------- |
| 1        | Upgrade VPS to 8GB                       | +$12/mo            | Doubles headroom, no code changes                   |
| 2        | Move frontend to Vercel/Cloudflare Pages | Free               | Frees 128M + reduces Caddy load                     |
| 3        | Managed Postgres                         | ~$15-25/mo         | Backups, failover, frees 512M on VPS                |
| 4        | PgBouncer                                | Free (self-hosted) | 10x more logical connections with same backend pool |

None of these require application code changes. They are infrastructure-level adjustments that can be done incrementally as load increases.

---

## Deployment & Rollback

The deploy script (`deploy/server-deploy.sh`) includes built-in safety mechanisms:

- **Pre-flight checks:** verifies secrets file, Docker daemon, 2GB free disk
- **Atomic image build:** all images are built before any container is swapped
- **Health verification:** 180s timeout checking `/ready` endpoints (which verify DB + Redis connectivity)
- **Auto-rollback:** if health checks fail, the script automatically rolls back to the previous SHA, rebuilds, and restarts
- **Deploy history:** all deploys logged to `.deploy-history` with timestamps and outcomes

Zero-downtime deploys are not currently supported (containers restart during swap). At Tier 3, this is addressed by running multiple replicas behind a load balancer with rolling updates.

---

## Related Documentation

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) -- full system architecture and data flow
- [API_SCALABILITY_OPTIMIZATION_PLAN.md](./API_SCALABILITY_OPTIMIZATION_PLAN.md) -- detailed audit of all API call patterns with implementation status
- [SUBSCRIPTION_PLANS.md](./SUBSCRIPTION_PLANS.md) -- plan tier limits and enforcement
- `docker-compose.prod.yml` -- production container configuration
- `deploy/server-deploy.sh` -- deployment process with rollback
