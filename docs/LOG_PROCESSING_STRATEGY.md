# Log Processing Strategy

Comprehensive design for processing logs from deployment platforms and observability tools without exceeding LLM context windows.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Two Pipeline Architecture](#two-pipeline-architecture)
3. [Pipeline A: Log Analysis (Deployment Platforms)](#pipeline-a-log-analysis-deployment-platforms)
4. [Pipeline B: Alert Context Analysis (Observability Tools)](#pipeline-b-alert-context-analysis-observability-tools)
5. [Context Window Protection](#context-window-protection)
6. [Continuous Log Streaming Strategy](#continuous-log-streaming-strategy)
7. [Diagnostics Framework](#diagnostics-framework)
8. [Provider Adapter Matrix](#provider-adapter-matrix)
9. [Cost & Budget Controls](#cost--budget-controls)
10. [Failure Modes & Degradation](#failure-modes--degradation)

---

## Problem Statement

Kenchi ingests logs from two fundamentally different source categories:

1. **Deployment platforms** (Vercel, Railway, Render, GitHub Actions) produce raw log output — sequential text that must be parsed, chunked, and analyzed to find failures.

2. **Observability tools** (Prometheus, Sentry, Datadog, Grafana) produce structured alert events with metadata pointing to the problem — they don't give raw logs, they give context around anomalies.

Additionally, some sources (PagerDuty incidents, Railway deployments) produce **continuous log streams** with no natural endpoint, unlike a CI job that finishes and produces a final log.

### Core Challenges

| Challenge                                                | Impact                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| LLM context windows are finite (40K-128K tokens)         | Cannot send entire log streams to the model                |
| Continuous logs have no natural end boundary             | Cannot "wait for all logs" before processing               |
| Each provider has a different log access pattern         | Push, pull, subscription, batch — no single approach works |
| Cost scales linearly with tokens processed               | Unbounded logs mean unbounded cost                         |
| Duplicate alerts and log lines are common                | Processing duplicates wastes budget                        |
| Observability tools emit structured events, not raw text | Different extraction strategy needed                       |

---

## Two Pipeline Architecture

```
                    ┌─────────────────────────────┐
                    │     Platform Adapters        │
                    │  (normalize to common shape) │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                  ▼
   ┌──────────────────┐              ┌──────────────────────┐
   │  Pipeline A       │              │  Pipeline B           │
   │  Log Analysis     │              │  Alert Context        │
   │                   │              │  Analysis             │
   │  Raw text →       │              │  Structured event →   │
   │  Chunk → Extract  │              │  Fetch context →      │
   │  → Aggregate →    │              │  Correlate →          │
   │  LLM Analysis     │              │  LLM Analysis         │
   └──────────────────┘              └──────────────────────┘
              │                                  │
              ▼                                  ▼
   ┌─────────────────────────────────────────────────────┐
   │              Shared Output Layer                     │
   │  Dashboard │ Slack Notification │ GitHub Check Run   │
   └─────────────────────────────────────────────────────┘
```

### When Each Pipeline Runs

| Source Type                               | Pipeline     | Trigger                                    |
| ----------------------------------------- | ------------ | ------------------------------------------ |
| CI job logs (GitHub Actions, GitLab CI)   | A            | Job completion webhook                     |
| Deploy logs (Vercel, Railway, Render)     | A            | Deploy status change                       |
| Continuous runtime logs (Railway, Render) | A (windowed) | Time window or volume threshold            |
| Error events (Sentry)                     | B            | `issue.created` / `error.created` webhook  |
| Metric alerts (Prometheus, Datadog)       | B            | AlertManager / Monitor webhook             |
| Incident lifecycle (PagerDuty, OpsGenie)  | B            | `incident.triggered` / `.resolved` webhook |
| Dashboard alerts (Grafana)                | B            | Alert notification webhook                 |

---

## Pipeline A: Log Analysis (Deployment Platforms)

This is the existing Kenchi pipeline, extended to support additional deployment platforms.

### Current Pipeline (Proven, In Production)

```
Raw Log (up to 10MB)
  → Stage 0: Preprocessing (strip ANSI, collapse repeats, detect framework)
  → Stage 1: Smart Chunking (3K token target, protected zones)
  → Stage 2: Parallel LLM Extraction (15 concurrent, 60s timeout per chunk)
  → Stage 3: Deterministic Aggregation (dedup, rank, find primary failure)
  → Stage 4: Final LLM Analysis (single call, token-budgeted)
```

### Key Parameters

| Parameter                | Value         | Purpose                               |
| ------------------------ | ------------- | ------------------------------------- |
| `TARGET_TOKENS`          | 3,000         | Optimal chunk size for extraction     |
| `MAX_TOKENS`             | 4,000         | Hard maximum per chunk                |
| `OVERLAP_LINES`          | 40            | Context preservation between chunks   |
| `MAX_CHUNKS`             | 100           | Runaway protection                    |
| `SMALL_LOG_THRESHOLD`    | 30,000 tokens | Skip chunking for small logs          |
| `EXTRACTION_CONCURRENCY` | 15            | Parallel LLM calls                    |
| `EXTRACTION_TIMEOUT_MS`  | 10,000        | Per-request timeout via resilientPost |
| `MAX_FINAL_ARTIFACTS`    | 50            | Cap artifacts sent to Stage 4         |
| `MAX_PROMPT_TOKENS`      | 40,000        | LLM input ceiling                     |

### Extending to New Providers

Each deployment platform needs an adapter that normalizes logs into the existing pipeline input:

```
DeployLogInput {
  source: "vercel" | "railway" | "render" | "netlify"  // GitHub Actions uses a separate CI pipeline, not this port
  deployId: string
  rawLog: string              // The log text to analyze
  metadata: {
    repository: string
    branch: string
    commit: string
    startedAt: Date
    status: "success" | "failed" | "cancelled"
  }
}
```

#### Provider-Specific Adapters

**Vercel**

- Log Drains (push): Vercel sends log lines to a webhook endpoint as NDJSON
- REST API (pull): `GET /v1/deployments/{id}/events` returns deployment events
- Trigger: Deploy webhook (`deployment.error`, `deployment.succeeded`)
- Adapter: Accumulate log drain lines per deployment, flush on deploy completion

**Railway**

- GraphQL subscription (websocket): Real-time log streaming
- REST API: Historical logs via `deploymentLogs` query
- Trigger: Deploy status webhook or subscription close
- Adapter: Hold subscription open during deploy, collect logs, process on completion

**Render**

- REST API: `GET /v1/services/{serviceId}/logs` with timestamp range
- Webhook events: Deploy start/success/fail notifications
- Trigger: Deploy webhook
- Adapter: On deploy completion, fetch logs for the deploy time window

**Netlify**

- Log Drains (push): Sends JSON log batches to webhook
- REST API: Deploy log available after completion
- Trigger: `deploy_failed` / `deploy_building` webhooks
- Adapter: Similar to Vercel — accumulate drain output, flush on completion

---

## Pipeline B: Alert Context Analysis (Observability Tools)

Observability tools do not produce raw logs to parse. They produce **structured alert events** with metadata that points to the underlying problem. The analysis strategy is fundamentally different.

### Pipeline B Flow

```
Alert Webhook
  → Step 1: Parse alert event (extract metadata, severity, timestamps)
  → Step 2: Fetch surrounding context from provider API
  → Step 3: Normalize into AlertContext
  → Step 4: Enrich with RAG (related past incidents, runbooks)
  → Step 5: LLM Analysis (single call, token-budgeted)
```

### AlertContext Shape

```
AlertContext {
  source: "sentry" | "datadog" | "prometheus" | "grafana" | "pagerduty" | "opsgenie" | "newrelic"
  alertId: string
  severity: "critical" | "warning" | "info"
  title: string
  description: string
  triggeredAt: Date
  resolvedAt: Date | null
  timeWindow: { start: Date, end: Date }

  evidence: {
    metrics: MetricSnapshot[]       // Time-series data around the alert
    logs: LogSnippet[]              // Log lines from the alert window
    traces: TraceSpan[]             // Distributed trace spans
    stackTraces: StackFrame[]       // Error stack traces
    breadcrumbs: BreadcrumbEvent[]  // User/system actions before the error
    relatedAlerts: RelatedAlert[]   // Other alerts that fired in the same window
  }

  providerMetadata: Record<string, unknown>   // Raw provider-specific fields
}
```

### Provider-Specific Context Fetching

**Sentry**

- Webhook: `issue.created`, `error.created`, `issue.resolved`
- Context fetch:
  - `GET /api/0/issues/{issue_id}/events/latest/` — full error event with stack trace
  - `GET /api/0/issues/{issue_id}/events/` — recent occurrences
  - Breadcrumbs included in event payload (HTTP requests, console logs, UI clicks)
- What to extract: Stack trace, breadcrumbs, error message, affected users count, tags
- Token budget: Stack traces can be large — truncate middle frames, keep top 5 + bottom 5

**Datadog**

- Webhook: Monitor alert notifications (configurable payload)
- Context fetch:
  - `POST /api/v1/logs/list` — query logs around alert timestamp
  - `GET /api/v1/query` — fetch metric values for the monitor query
  - `GET /api/v2/spans` — APM traces around the alert
- What to extract: Monitor query, metric values, correlated logs (limit 50 lines), top trace
- Token budget: Metrics are compact; logs need truncation; traces keep critical path only

**Prometheus / AlertManager**

- Webhook: AlertManager sends firing/resolved notifications
- Context fetch:
  - `GET /api/v1/query_range` — metric values around alert time (±15 min)
  - AlertManager grouping provides related alerts
  - No native logs — must query Loki or external log source if available
- What to extract: Alert labels, metric values, recording rule expression, related alerts
- Token budget: Metrics are small; the alert expression itself is the primary context

**Grafana**

- Webhook: Alert notifications with dashboard/panel context
- Context fetch:
  - `GET /api/dashboards/uid/{uid}` — dashboard with panel queries
  - `GET /api/datasources/proxy/{id}/...` — query underlying data source (Prometheus, Loki)
  - If Loki is the source, fetch actual log lines
- What to extract: Panel queries, threshold values, dashboard annotations, Loki logs if available
- Token budget: Dashboard JSON can be large — extract only the alerting panel, not the full dashboard

**PagerDuty**

- Webhook: `incident.triggered`, `incident.acknowledged`, `incident.escalated`, `incident.resolved`
- Context fetch:
  - `GET /incidents/{id}/log_entries` — incident timeline (who did what, when)
  - `GET /incidents/{id}/alerts` — underlying alerts that triggered the incident
  - `GET /incidents/{id}/notes` — responder notes
- What to extract: Alert summaries, escalation timeline, responder notes, service context
- Token budget: Incident timelines grow over time — limit to most recent 20 log entries

**OpsGenie**

- Webhook: Alert lifecycle events
- Context fetch:
  - `GET /v2/alerts/{id}` — full alert with tags, teams, responders
  - `GET /v2/alerts/{id}/logs` — alert timeline
  - `GET /v2/alerts/{id}/notes` — team notes
- What to extract: Alert details, tags, timeline, responder notes
- Token budget: Similar to PagerDuty — cap timeline entries

**New Relic**

- Webhook: Alert policy notifications
- Context fetch:
  - NerdGraph API: `actor.account.nrql.query` — query recent error traces
  - `GET /v2/applications/{id}/instances.json` — instance health
- What to extract: NRQL query results, error groups, transaction traces
- Token budget: NRQL results need row limiting; transaction traces keep critical path

---

## Context Window Protection

The LLM context window is the hard constraint. Every strategy below prevents exceeding it.

### Current Protections (Pipeline A)

| Protection                  | Stage        | Mechanism                                              |
| --------------------------- | ------------ | ------------------------------------------------------ |
| Small log bypass            | Pre-chunking | Logs < 30K tokens skip chunking, go direct to analysis |
| Chunk size ceiling          | Stage 1      | Each chunk capped at 4K tokens                         |
| Chunk count ceiling         | Stage 1      | Max 100 chunks per log                                 |
| Protected zone truncation   | Stage 1      | Oversized zones: keep first 50 + last 50 lines         |
| Per-chunk extraction        | Stage 2      | Each chunk analyzed independently (3-4K tokens)        |
| Artifact deduplication      | Stage 3      | SHA256 signature removes exact duplicates              |
| Artifact count cap          | Stage 3      | Max 50 artifacts passed to final analysis              |
| Prompt token budget         | Stage 4      | Hard cap at 40K tokens                                 |
| Evidence truncation cascade | Stage 4      | Drops lowest-priority evidence fields first            |
| Iterative reduction         | Stage 4      | If still over budget, keep 75% per iteration           |
| Safety buffer               | Stage 4      | 10K tokens reserved below the model limit              |

### New Protections (Pipeline B)

| Protection                | Mechanism                                                    |
| ------------------------- | ------------------------------------------------------------ |
| Time window bounding      | Fetch context only within ±15 min of alert (configurable)    |
| Log line cap              | Max 50 log lines per alert context fetch                     |
| Trace depth cap           | Keep only critical path spans (max 20 spans)                 |
| Stack trace trimming      | Keep top 5 + bottom 5 frames, collapse middle                |
| Metric point sampling     | Downsample time-series to max 60 data points                 |
| Dashboard panel filtering | Extract only the alerting panel, not the full dashboard      |
| Timeline entry cap        | Max 20 log entries for incident timelines                    |
| Breadcrumb cap            | Max 30 breadcrumb events                                     |
| Total context budget      | AlertContext hard-capped at 20K tokens before RAG enrichment |

### Token Budget Allocation (Pipeline B)

```
Total LLM context budget: 40,000 tokens

System prompt + instructions:     ~2,000 tokens
AlertContext evidence:            ~20,000 tokens (hard cap)
RAG enrichment (runbooks, docs):   ~8,000 tokens
Safety buffer:                     ~8,000 tokens
                                  ──────────────
Total:                             38,000 tokens
```

### Truncation Priority Order

When AlertContext exceeds 20K tokens, truncate in this order (lowest priority first):

1. **Related alerts** — drop to 3 most relevant
2. **Breadcrumbs** — keep last 10 only
3. **Trace spans** — keep entry + error spans only
4. **Log snippets** — keep first 20 + last 10 lines
5. **Metric data points** — downsample to 30 points
6. **Stack trace frames** — keep top 3 + bottom 3
7. **Provider metadata** — drop entirely (last resort)

Never truncate: alert title, severity, timestamps, error message.

---

## Continuous Log Streaming Strategy

For sources that produce logs with no natural end (runtime logs, long-running incidents):

### Windowed Processing

```
Continuous Log Stream
  │
  ▼
┌─────────────────────────────────────────────────────┐
│                  Ingest Buffer                       │
│  Accumulates log lines per entity (deploy, incident) │
│  Storage: Redis stream or sorted set with TTL        │
└──────────────┬──────────────────────────────────────┘
               │
               │ Flush triggers:
               │  1. Time window elapsed (configurable, default 5 min)
               │  2. Volume threshold exceeded (10K tokens in buffer)
               │  3. State change event (deploy completed, incident resolved)
               │  4. Manual trigger (user requests analysis)
               │
               ▼
┌─────────────────────────────────────────────────────┐
│              Window Batcher                           │
│  Collects buffered lines → produces a bounded batch  │
│  Attaches: previous summary (if exists)              │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│         Incremental Analysis                         │
│  [new batch] + [previous summary] → LLM → [updated] │
│  Token budget: batch ≤ 25K + summary ≤ 5K = 30K     │
└─────────────────────────────────────────────────────┘
```

### Incremental Summarization

Instead of re-analyzing the entire log history on each window:

```
Window 1:  [logs 0:00-0:05]                    → LLM → Summary v1
Window 2:  [logs 0:05-0:10] + [Summary v1]     → LLM → Summary v2
Window 3:  [logs 0:10-0:15] + [Summary v2]     → LLM → Summary v3
...
```

**Key property:** Token cost per window is constant regardless of total incident duration. The summary compresses all prior context into a fixed budget (5K tokens max).

### Summary Schema

```
IncidentSummary {
  version: number
  windowCount: number
  timeRange: { start: Date, end: Date }
  currentStatus: string
  keyFindings: string[]           // Max 10 bullet points
  errorTimeline: TimelineEntry[]  // Max 10 entries, newest first
  unresolvedIssues: string[]      // Max 5
  metricsSnapshot: string         // One-paragraph metric state
  tokenCount: number              // Track summary size
}
```

### Flush Triggers (Configurable Per Source)

| Source              | Time Window | Volume Threshold | Event Trigger        |
| ------------------- | ----------- | ---------------- | -------------------- |
| Railway (runtime)   | 5 min       | 10K tokens       | Deploy status change |
| Vercel (log drain)  | 3 min       | 8K tokens        | Deploy completion    |
| Render (runtime)    | 5 min       | 10K tokens       | Deploy status change |
| Netlify (log drain) | 3 min       | 8K tokens        | Deploy completion    |

### Buffer Management

- **Storage:** Redis sorted set per entity, score = timestamp
- **TTL:** 24 hours (auto-cleanup for abandoned streams)
- **Max buffer size:** 100K tokens per entity (oldest lines evicted)
- **Deduplication:** Hash each log line, skip exact duplicates within 60s window

---

## Diagnostics Framework

A structured approach to diagnosing problems from log data — applicable to both pipelines.

### Problem Classification Taxonomy

```
Problem
├── Infrastructure
│   ├── Resource Exhaustion (OOM, disk full, CPU throttle, file descriptors)
│   ├── Network Failure (DNS, timeout, connection refused, TLS)
│   ├── Service Unavailable (dependency down, database unreachable)
│   └── Permission/Auth (403, expired token, missing credentials)
│
├── Configuration
│   ├── Missing Environment (env var not set, secret not mounted)
│   ├── Invalid Config (malformed YAML, schema validation, wrong type)
│   ├── Version Mismatch (dependency conflict, API version, runtime version)
│   └── Feature Flag (disabled feature, wrong rollout percentage)
│
├── Application
│   ├── Code Error (unhandled exception, null reference, type error)
│   ├── Test Failure (assertion, snapshot, integration test)
│   ├── Build Failure (compilation, bundling, linking)
│   ├── Lint/Format (style violations, type checking)
│   └── Migration (database schema, data migration)
│
├── Deployment
│   ├── Rollout Failure (health check, readiness probe, crash loop)
│   ├── Container Error (image pull, registry auth, dockerfile)
│   ├── Orchestration (scheduling, resource quota, node affinity)
│   └── Traffic Management (ingress, load balancer, certificate)
│
└── External
    ├── Third-Party API (rate limit, breaking change, outage)
    ├── Provider Issue (cloud provider incident, region outage)
    └── Upstream Dependency (shared library, base image, CDN)
```

### Causality Chain Detection

When multiple errors appear, they often have a causal relationship. The existing aggregation pipeline handles this with `CAUSALITY_TYPE_ORDER`:

```
Root cause candidates (check in order):
  1. Infrastructure killers → everything downstream fails
  2. Auth/config errors    → services can't start
  3. Network errors        → API calls fail
  4. Dependency errors     → build can't proceed
  5. Code/test errors      → most common, least surprising
```

**Diagnostic questions per category:**

| Category       | Key Questions                                                                         |
| -------------- | ------------------------------------------------------------------------------------- |
| Infrastructure | What resource was exhausted? When did the threshold breach? What process consumed it? |
| Configuration  | What value is missing or wrong? What is the expected value? When was it last correct? |
| Application    | What function threw? What was the input? Is this a regression (did it work before)?   |
| Deployment     | What health check failed? What was the previous successful deploy? What changed?      |
| External       | Which API returned an error? Is there a known outage? When did it start?              |

### Diagnostic Output Schema

Both pipelines produce analysis in this shape:

```
DiagnosticResult {
  rootCause: {
    category: ProblemCategory
    summary: string              // One-sentence description
    confidence: "high" | "medium" | "low"
    evidence: string[]           // Supporting log lines or metrics
  }

  causalityChain: {
    primary: ArtifactSummary     // The root cause
    secondary: ArtifactSummary[] // Downstream effects
    explanation: string          // How primary caused secondary
  }

  impact: {
    severity: "critical" | "high" | "medium" | "low"
    scope: string                // What is affected
    duration: string             // How long has this been happening
    usersAffected: string        // Estimate if available
  }

  recommendations: {
    immediate: Action[]          // Fix it now
    preventive: Action[]         // Stop it from recurring
    investigative: Action[]      // Dig deeper
  }

  relatedContext: {
    pastIncidents: IncidentRef[] // Similar past problems (from RAG)
    runbooks: RunbookRef[]       // Relevant runbooks (from RAG)
    documentation: DocRef[]      // Relevant docs
  }
}
```

### Diagnostic Enhancement via RAG

Before the final LLM analysis, both pipelines query RAG for:

1. **Past incidents with similar signatures** — "Has this exact error happened before? What fixed it?"
2. **Runbooks for the affected service** — "Is there a documented procedure for this failure mode?"
3. **Recent changes to the affected area** — "What PRs merged recently that could have caused this?"

This context is appended to the LLM prompt within the token budget (8K tokens allocated for RAG).

---

## Provider Adapter Matrix

### Adapter Interface

All adapters implement the same port interface, regardless of data access pattern:

```
DeployLogSourcePort {
  // Verify webhook signature (HMAC) before processing
  verifySignature(rawBody, signature, secret): boolean

  // Parse webhook payload into normalized deploy event
  handleWebhook(payload, context): Promise<DeployWebhookResult | null>

  // Fetch logs for a completed deploy via provider REST API
  fetchDeployLogs(params, context): Promise<DeployLogData>

  // Parse incoming log drain batch (NDJSON) into normalized lines
  parseLogDrainBatch(payload, context): Promise<LogDrainBatchResult>

  // Optional: subscribe to real-time log streaming (WebSocket/SSE)
  subscribe?(entityId, onLine, context): Promise<{ close(): Promise<void> }>
}
```

### Full Provider Matrix

| Provider           | Pipeline | Access Pattern                    | Webhook Events          | API for Context                         | Auth                   |
| ------------------ | -------- | --------------------------------- | ----------------------- | --------------------------------------- | ---------------------- |
| **GitHub Actions** | A        | Batch (download after completion) | `check_run.completed`   | REST: download logs                     | App installation token |
| **GitLab CI**      | A        | Batch (job log endpoint)          | Job webhook             | REST: `/jobs/{id}/trace`                | Personal/project token |
| **Vercel**         | A        | Push (Log Drains) + REST          | `deployment.*`          | REST: `/v1/deployments/{id}/events`     | Bearer token           |
| **Railway**        | A        | Subscription (GraphQL WS) + REST  | Deploy webhooks         | GraphQL: `deploymentLogs`               | API token              |
| **Render**         | A        | Pull (REST)                       | Deploy webhooks         | REST: `/v1/services/{id}/logs`          | API key                |
| **Netlify**        | A        | Push (Log Drains) + REST          | `deploy_failed`         | REST: `/api/v1/deploys/{id}/log`        | OAuth token            |
| **CircleCI**       | A        | Batch (job output)                | Webhook (job completed) | REST: `/project/{slug}/{job}/artifacts` | API token              |
| **Sentry**         | B        | Push (webhooks)                   | `issue.*`, `error.*`    | REST: `/api/0/issues/{id}/events/`      | Auth token             |
| **Datadog**        | B        | Push (monitor webhooks)           | Monitor alert           | REST: logs, metrics, traces APIs        | API + App key          |
| **Prometheus**     | B        | Push (AlertManager)               | Alert firing/resolved   | REST: `/api/v1/query_range`             | Basic auth / none      |
| **Grafana**        | B        | Push (alert notifications)        | Alert state change      | REST: dashboard + datasource proxy      | API key                |
| **PagerDuty**      | B        | Push (webhooks)                   | `incident.*`            | REST: `/incidents/{id}/log_entries`     | API token v2           |
| **OpsGenie**       | B        | Push (webhooks)                   | Alert lifecycle         | REST: `/v2/alerts/{id}`                 | API key                |
| **New Relic**      | B        | Push (alert webhooks)             | Alert policy            | NerdGraph (GraphQL)                     | API key                |

---

## Cost & Budget Controls

### Per-Analysis Cost Estimates

**Pipeline A (Log Analysis):**

| Stage                   | LLM Calls             | Tokens Per Call         | Estimated Cost |
| ----------------------- | --------------------- | ----------------------- | -------------- |
| Stage 2: Extraction     | 1-100 (one per chunk) | ~4K input + ~1K output  | $0.001-0.10    |
| Stage 4: Final Analysis | 1                     | ~30K input + ~4K output | $0.01-0.05     |
| RAG Embedding           | 1                     | ~500 tokens             | $0.00001       |
| **Total per analysis**  |                       |                         | **$0.01-0.15** |

**Pipeline B (Alert Analysis):**

| Stage               | LLM Calls | Tokens Per Call         | Estimated Cost |
| ------------------- | --------- | ----------------------- | -------------- |
| Context Analysis    | 1         | ~25K input + ~4K output | $0.01-0.05     |
| RAG Embedding       | 1         | ~500 tokens             | $0.00001       |
| **Total per alert** |           |                         | **$0.01-0.05** |

**Continuous Streaming (per window):**

| Component                             | Cost          |
| ------------------------------------- | ------------- |
| Incremental analysis per window       | $0.01-0.03    |
| 12 windows per hour (5-min intervals) | $0.12-0.36/hr |
| 24-hour incident                      | $2.88-8.64    |

### Budget Enforcement

```
Per-Tenant Limits (by plan):
  free:       10 analyses/day,    $0.50/day
  pro:        100 analyses/day,   $5.00/day
  team:       500 analyses/day,   $25.00/day
  enterprise: unlimited,          $100.00/day (soft cap)

Continuous Streaming Caps:
  free:       1 active stream,    12 windows max
  pro:        5 active streams,   288 windows/day
  team:       20 active streams,  unlimited windows
  enterprise: unlimited streams,  unlimited windows
```

### Cost Control Mechanisms

1. **Token budget per analysis** — hard cap at 40K tokens, truncate evidence
2. **Embedding tier degradation** — premium → standard → light as budget depletes
3. **Stream window throttling** — increase window interval when budget is low (5 min → 15 min → 30 min)
4. **Deduplication** — skip analysis for duplicate alerts within 5-minute window
5. **RAG query caching** — 5-minute cache TTL on embedding queries
6. **Chunk failure abort** — stop extraction if >50% chunks fail (degraded mode)

---

## Failure Modes & Degradation

### Pipeline A Failure Modes

| Failure                       | Detection                        | Response                                                   |
| ----------------------------- | -------------------------------- | ---------------------------------------------------------- |
| Log too large (>100 chunks)   | Chunk count exceeds `MAX_CHUNKS` | Truncate to first + last sections, analyze partial         |
| >50% chunk extraction fails   | `CHUNK_FAILURE_THRESHOLD`        | Switch to degraded mode: sample first 250 + last 250 lines |
| LLM timeout on final analysis | 90s timeout                      | Retry once with reduced evidence (50% of artifacts)        |
| Provider API unavailable      | HTTP 5xx / timeout               | Queue for retry with exponential backoff (max 3 attempts)  |
| Log format unrecognized       | No CI platform detected          | Fall through to generic line-by-line analysis              |

### Pipeline B Failure Modes

| Failure                      | Detection              | Response                                                      |
| ---------------------------- | ---------------------- | ------------------------------------------------------------- |
| Context fetch fails          | Provider API error     | Analyze with webhook payload only (reduced context)           |
| Alert payload malformed      | Schema validation      | Log warning, skip processing, return raw payload to dashboard |
| Context exceeds token budget | Token estimation > 20K | Apply truncation cascade (see Context Window Protection)      |
| Provider rate limited        | HTTP 429               | Delay context fetch, analyze with partial data                |
| Duplicate alert              | Idempotency store hit  | Skip, return cached result                                    |

### Continuous Streaming Failure Modes

| Failure                 | Detection                | Response                                                         |
| ----------------------- | ------------------------ | ---------------------------------------------------------------- |
| Buffer overflow         | >100K tokens accumulated | Evict oldest lines, log warning                                  |
| Subscription dropped    | WebSocket close event    | Reconnect with exponential backoff, fetch missed logs via REST   |
| Summary grows too large | Token count > 5K         | Re-summarize: compress to 3K tokens using a summarization prompt |
| Window analysis fails   | LLM error                | Skip window, carry forward previous summary, retry next window   |
| Stream abandoned        | No new lines for 1 hour  | Auto-close stream, produce final summary from last state         |

### Degraded Mode Outputs

When full analysis isn't possible, produce a degraded result:

```
DegradedResult {
  status: "degraded"
  reason: "chunk_extraction_failure" | "context_fetch_failed" | "token_budget_exceeded"
  partialAnalysis: {
    rawPreview: string           // First 2K chars of available data
    detectedPatterns: string[]   // Regex-matched error patterns (no LLM)
    suggestedCategory: string    // Best-guess from pattern matching
  }
  confidence: "low"
  recommendation: "Review full logs manually — automated analysis was incomplete"
}
```

---

## Implementation Status

### Phase 1: Extend Pipeline A (deployment platforms) — COMPLETE

| Item                                          | Status | Location                                                                       |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| Vercel adapter (Log Drains + REST)            | Done   | `services/api/src/adapters/vercelLogAdapter.ts`                                |
| Railway adapter (GraphQL subscription + REST) | Done   | `services/api/src/adapters/railwayLogAdapter.ts`, `railwayStreamingAdapter.ts` |
| Render adapter (REST polling + webhooks)      | Done   | `services/api/src/adapters/renderLogAdapter.ts`                                |
| Netlify adapter (Log Drains + REST)           | Done   | `services/api/src/adapters/netlifyLogAdapter.ts`                               |
| DeployLogSourcePort interface                 | Done   | `packages/shared/src/ports/deployLogSourcePort.ts`                             |
| Windowed ingestion buffer (Redis-backed)      | Done   | `packages/shared/src/ingestion/`                                               |
| Incremental summarization                     | Done   | `services/api/src/services/windowedAnalysis.ts`                                |
| Flush trigger worker                          | Done   | `services/api/src/workers/flushTriggerWorker.ts`                               |
| Deploy webhook routes                         | Done   | `services/api/src/routes/deployWebhookRoutes.ts`                               |
| Deploy webhook signature verification         | Done   | `services/api/src/middleware/verifyDeployWebhook.ts`                           |
| Composition root                              | Done   | `services/api/src/container/deployContainer.ts`                                |

### Phase 2: Build Pipeline B (observability tools) — COMPLETE

| Item                                          | Status | Location                                                        |
| --------------------------------------------- | ------ | --------------------------------------------------------------- |
| AlertContext type definitions                 | Done   | `packages/shared/src/alertContext/types.ts`                     |
| Alert context truncation cascade              | Done   | `packages/shared/src/alertContext/truncation.ts`                |
| Alert budget quota (per-tenant limits)        | Done   | `packages/shared/src/queue/alertBudgetQuota.ts`                 |
| Diagnostics framework (taxonomy, correlation) | Done   | `packages/shared/src/diagnostics/`                              |
| Sentry adapter (alert + context)              | Done   | `services/incident-triage/src/adapters/sentry*.ts`              |
| PagerDuty adapter                             | Done   | `services/incident-triage/src/adapters/pagerDuty*.ts`           |
| OpsGenie adapter (alert + context)            | Done   | `services/incident-triage/src/adapters/opsgenie*.ts`            |
| New Relic adapter (alert + context)           | Done   | `services/incident-triage/src/adapters/newRelic*.ts`            |
| Datadog monitoring adapter                    | Done   | `services/incident-triage/src/adapters/datadogAdapter.ts`       |
| Grafana monitoring adapter                    | Done   | `services/incident-triage/src/adapters/grafanaAdapter.ts`       |
| Prometheus monitoring adapter                 | Done   | `services/incident-triage/src/adapters/prometheusAdapter.ts`    |
| Alert analysis service                        | Done   | `services/incident-triage/src/services/alertAnalysisService.ts` |
| Webhook routes (all providers)                | Done   | `services/incident-triage/src/routes/webhookRoutes.ts`          |
| Webhook verification middleware               | Done   | `services/incident-triage/src/middleware/verify*.ts`            |
| CircleCI integration (CI pipeline)            | Done   | `services/github-app/src/adapters/circleci*.ts`                 |

### Phase 3: Advanced capabilities — PLANNED

1. Cross-pipeline correlation (deploy failure + alert spike = linked incident) — types defined in `packages/shared/src/diagnostics/types.ts`, correlation logic in `correlation.ts`
2. Multi-hop RAG for related past incidents
3. Automated runbook execution suggestions
4. Cost optimization: skip LLM for known-signature errors (pattern match only)
