# On-Demand Investigation Feature

## Problem Statement

Kenchi's incident triage and CI analysis pipelines are **reactive** — they respond to automated alerts and CI failures. But there's a gap when:

- Users complain about issues (e.g., "the API is slow") but no monitoring alert fires
- A developer suspects a problem but can't pinpoint the root cause
- An on-call engineer wants to proactively investigate a service after a related incident
- Someone needs to understand why a specific endpoint is degraded without waiting for a threshold breach

**On-demand investigation** bridges this gap by letting humans trigger Kenchi's analysis capabilities directly — from Slack or the frontend dashboard.

---

## Feature Overview

### What Is an Investigation?

An investigation is a **user-initiated diagnostic session** where Kenchi:

1. Accepts a natural language description of the problem (e.g., "API response times are slow on /api/orders")
2. Gathers evidence from connected data sources (monitoring metrics, recent deploys, logs, past incidents)
3. Correlates findings across sources
4. Produces a structured diagnosis with root cause hypothesis and suggested actions
5. Returns results to the user (Slack thread or frontend panel)

### Two Entry Points, Same Pipeline

```
┌──────────────────┐     ┌──────────────────┐
│   Slack Command   │     │  Frontend UI      │
│                   │     │                   │
│  /kenchi          │     │  Investigation    │
│  investigate      │     │  Dashboard Page   │
│  "API is slow     │     │                   │
│   on /api/orders" │     │  [text input]     │
│                   │     │  [service select] │
│                   │     │  [time range]     │
└────────┬─────────┘     └────────┬──────────┘
         │                        │
         └────────┬───────────────┘
                  │
                  ▼
    ┌─────────────────────────┐
    │  Investigation Service   │
    │  (shared pipeline)       │
    │                          │
    │  1. Parse intent         │
    │  2. Gather evidence      │
    │  3. Correlate            │
    │  4. Diagnose (LLM)      │
    │  5. Return results       │
    └─────────────────────────┘
```

---

## Investigation Pipeline

### Phase 1: Intent Parsing

Extract structured investigation parameters from the user's input.

**Input** (natural language or structured form):

```
"API response times are slow on /api/orders since about 2 hours ago"
```

**Output** (structured intent):

```typescript
interface InvestigationIntent {
  readonly description: string; // Raw user input
  readonly serviceName?: string; // Extracted: "api"
  readonly endpoint?: string; // Extracted: "/api/orders"
  readonly symptom: InvestigationSymptom; // Classified: "latency"
  readonly timeRange: TimeRange; // Parsed: last 2 hours
  readonly environment?: string; // Default: "production"
}

type InvestigationSymptom =
  | "latency" // Slow responses
  | "errors" // 5xx, exceptions
  | "downtime" // Service unreachable
  | "degradation" // Partial failures
  | "data_anomaly" // Wrong data, stale cache
  | "unknown"; // Can't classify — gather broadly
```

**Implementation**: LLM extracts structured fields from natural language. Frontend form provides these fields directly (no LLM needed for parsing).

### Phase 2: Evidence Gathering

Query connected data sources in parallel based on the symptom type.

```typescript
interface EvidenceSource {
  readonly sourceType: string; // "monitoring", "deploys", "incidents", "logs"
  readonly provider: string; // "datadog", "github", "vercel", etc.
  readonly query: string; // What was queried
  readonly data: unknown; // Raw response
  readonly gatheredAt: Date;
  readonly relevanceScore?: number; // How relevant this evidence is (0-1)
}
```

**Evidence gathering strategy by symptom:**

| Symptom          | Monitoring Metrics                     | Recent Deploys                       | Past Incidents             | Logs                            |
| ---------------- | -------------------------------------- | ------------------------------------ | -------------------------- | ------------------------------- |
| **Latency**      | p50/p95/p99 response times, throughput | Last 24h deploys to affected service | Similar latency incidents  | Slow query logs, timeout errors |
| **Errors**       | Error rate, 5xx count by endpoint      | Last 24h deploys                     | Similar error spikes       | Exception logs, stack traces    |
| **Downtime**     | Uptime checks, health endpoint status  | Last 24h deploys                     | Past outages for service   | Connection refused, DNS errors  |
| **Degradation**  | Mixed metrics (latency + errors)       | Last 24h deploys                     | Similar degradation events | Warning-level logs              |
| **Data anomaly** | Cache hit rates, DB query patterns     | Last 24h deploys                     | Data corruption incidents  | Application logs                |
| **Unknown**      | All available metrics                  | Last 48h deploys                     | All recent incidents       | Recent error logs               |

**Data source adapters:**

| Source               | How Kenchi queries it                         | What it returns                              |
| -------------------- | --------------------------------------------- | -------------------------------------------- |
| **Datadog**          | Metrics API (`/api/v1/query`)                 | Time series: latency, error rate, throughput |
| **Grafana**          | Datasource proxy API                          | Dashboard panel data for service             |
| **Vercel**           | Analytics API (`/v1/analytics`)               | Edge function duration, error rates          |
| **GitHub**           | Deployments API + commit history              | Recent deploys with diffs                    |
| **Kenchi DB**        | `incident_alerts` + `incident_triage_results` | Past incidents for correlation               |
| **Kenchi DB**        | `analyses` table                              | Recent CI failures for the repo              |
| **Application logs** | Provider-specific log API                     | Filtered log lines in time range             |

### Phase 3: Correlation

Connect evidence across sources to build a timeline and identify patterns.

```typescript
interface CorrelationResult {
  readonly timeline: ReadonlyArray<TimelineEvent>; // Chronological events
  readonly deployCorrelation?: DeployCorrelation; // Deploy that matches timing
  readonly pastIncidentMatches: ReadonlyArray<PastIncidentMatch>;
  readonly patterns: ReadonlyArray<DetectedPattern>;
}

interface DeployCorrelation {
  readonly deployId: string;
  readonly deployedAt: Date;
  readonly commitSha: string;
  readonly commitMessage: string;
  readonly author: string;
  readonly changedFiles: ReadonlyArray<string>;
  readonly timingMatch: "strong" | "moderate" | "weak"; // How well deploy timing matches symptom onset
}

interface DetectedPattern {
  readonly patternType: "recurring" | "cascading" | "correlated_deploy" | "resource_exhaustion";
  readonly description: string;
  readonly confidence: number; // 0-1
  readonly evidenceIds: ReadonlyArray<string>; // Which evidence supports this
}
```

**Correlation rules (deterministic, not LLM):**

1. **Deploy timing**: If symptom started within 30 minutes of a deploy → `correlated_deploy` pattern
2. **Recurring**: If 2+ similar incidents in last 30 days → `recurring` pattern
3. **Cascading**: If multiple services affected in sequence → `cascading` pattern
4. **Resource exhaustion**: If metrics show gradual degradation over hours → `resource_exhaustion` pattern

### Phase 4: Diagnosis (LLM)

The LLM receives structured evidence (not raw data) and produces a diagnosis.

**LLM prompt structure:**

```
You are investigating a production issue reported by an engineer.

## Reported Problem
{investigation.description}

## Service Context
- Service: {serviceName}
- Environment: {environment}
- Time range: {timeRange}

## Evidence Gathered
{formatted evidence with source citations}

## Correlations Found
{timeline, deploy correlation, patterns}

## Past Similar Incidents
{matched incidents with their resolutions}

## Instructions
- Cite evidence IDs for every claim
- State confidence level for your diagnosis
- If evidence is insufficient, say so explicitly
- Suggest concrete next steps the engineer can take
```

**Output:**

```typescript
interface InvestigationDiagnosis {
  readonly headline: string; // 1-line summary
  readonly rootCauseHypothesis: string; // 2-3 sentences with evidence citations
  readonly confidence: number; // 0-1
  readonly confidenceExplanation: string; // Why this confidence level
  readonly impactAssessment: string; // Who/what is affected
  readonly suggestedActions: ReadonlyArray<SuggestedAction>;
  readonly additionalInvestigation?: string; // What else to check if diagnosis is uncertain
}

interface SuggestedAction {
  readonly priority: "immediate" | "short_term" | "long_term";
  readonly action: string;
  readonly rationale: string;
  readonly evidenceIds: ReadonlyArray<string>;
}
```

### Phase 5: Persist & Deliver

Store the investigation and deliver results to the user.

```typescript
interface InvestigationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly initiatedBy: string; // User ID (Slack or frontend)
  readonly initiatedFrom: "slack" | "frontend";
  readonly intent: InvestigationIntent;
  readonly evidence: ReadonlyArray<EvidenceSource>;
  readonly correlation: CorrelationResult;
  readonly diagnosis: InvestigationDiagnosis;
  readonly status: "gathering" | "analyzing" | "completed" | "failed";
  readonly durationMs: number;
  readonly createdAt: Date;
  readonly completedAt?: Date;
}
```

---

## Slack Interface

### Command

```
/kenchi investigate <description>
```

**Examples:**

```
/kenchi investigate API is slow on /api/orders
/kenchi investigate 5xx errors on checkout service since 2pm
/kenchi investigate why is the dashboard not loading
/kenchi investigate search results are returning stale data
```

### Flow

```
User: /kenchi investigate API is slow on /api/orders

Kenchi (immediate, ephemeral):
  🔍 Starting investigation...
  Analyzing: "API is slow on /api/orders"
  Service: api | Symptom: latency | Time range: last 2 hours

Kenchi (after ~15-30s, in thread):
  ┌─────────────────────────────────────────────┐
  │ 🔍 Investigation Complete                    │
  │                                               │
  │ Headline:                                     │
  │ API latency on /api/orders spiked 3x after   │
  │ deploy abc123 introduced unindexed query      │
  │                                               │
  │ Confidence: 🟢 High (0.87)                   │
  │                                               │
  │ Root Cause:                                   │
  │ Deploy abc123 (merged 2h ago by @alice)       │
  │ added a filter to OrderRepository that        │
  │ triggers a full table scan. p99 latency went  │
  │ from 200ms to 1.8s. [evidence: E1, E3, E5]   │
  │                                               │
  │ Impact:                                       │
  │ All users hitting /api/orders affected.        │
  │ ~340 requests/min, 92% experiencing >1s.      │
  │                                               │
  │ Suggested Actions:                            │
  │ 1. 🔴 Immediate: Add index on                │
  │    orders.customer_region column               │
  │ 2. 🟡 Short-term: Review query plan for      │
  │    OrderRepository.findByRegion               │
  │ 3. 🟢 Long-term: Add query performance       │
  │    tests to CI                                │
  │                                               │
  │ Past Similar:                                 │
  │ INC-2847 (Jan 15) — same service, resolved    │
  │ by adding composite index                     │
  │                                               │
  │ [View Full Details] [Acknowledge] [Escalate]  │
  └─────────────────────────────────────────────┘
```

**Interactive buttons:**

| Button                | Action                                                        |
| --------------------- | ------------------------------------------------------------- |
| **View Full Details** | Opens investigation in frontend dashboard                     |
| **Acknowledge**       | Marks investigation as acknowledged, assigns to user          |
| **Escalate**          | Creates incident from investigation, triggers triage dispatch |
| **Re-investigate**    | Re-runs with fresh data (useful if situation changed)         |

---

## Frontend Interface

### New Page: Investigation Dashboard

**Route:** `/dashboard/investigations`

**Subpages:**

| Route                           | Page                   | Purpose                               |
| ------------------------------- | ---------------------- | ------------------------------------- |
| `/dashboard/investigations`     | Investigation list     | Browse past and active investigations |
| `/dashboard/investigations/new` | New investigation form | Start an investigation manually       |
| `/dashboard/investigations/:id` | Investigation detail   | Full results view                     |

### Investigation List Page

```
┌─────────────────────────────────────────────────────────────────┐
│  Investigations                              [+ New Investigation] │
│                                                                   │
│  ┌─── Filters ───────────────────────────────────────────────┐  │
│  │ Status: [All ▾]  Symptom: [All ▾]  Service: [All ▾]      │  │
│  │ Time: [Last 7 days ▾]                      [Search...]    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Table ─────────────────────────────────────────────────┐  │
│  │ Status   │ Headline              │ Service │ Conf. │ Time │  │
│  │──────────┼───────────────────────┼─────────┼───────┼──────│  │
│  │ ✅ Done  │ API latency spike ... │ api     │ 87%   │ 2h   │  │
│  │ 🔄 Active│ 5xx on checkout ...   │ checkout│  —    │ 5m   │  │
│  │ ✅ Done  │ Stale search results  │ search  │ 72%   │ 1d   │  │
│  │ ❌ Failed│ Dashboard not loading  │ frontend│  —    │ 3d   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Showing 1-10 of 24                            [< 1 2 3 >]       │
└─────────────────────────────────────────────────────────────────┘
```

### New Investigation Form

```
┌─────────────────────────────────────────────────────────────────┐
│  New Investigation                                               │
│                                                                   │
│  What's the problem? *                                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ API response times are slow on /api/orders                 │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Optional Details ──────────────────────────────────────┐  │
│  │                                                            │  │
│  │  Service          Environment        Symptom               │  │
│  │  [Select... ▾]    [production ▾]     [Auto-detect ▾]      │  │
│  │                                                            │  │
│  │  Time Range                                                │  │
│  │  [Last 2 hours ▾]   or   From: [____]  To: [____]        │  │
│  │                                                            │  │
│  │  Endpoint (if known)                                       │  │
│  │  [/api/orders                                        ]     │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Data Sources to Query                                           │
│  ☑ Monitoring metrics   ☑ Recent deploys                        │
│  ☑ Past incidents       ☑ Application logs                      │
│  ☐ CI failures                                                   │
│                                                                   │
│                              [Cancel]  [Start Investigation 🔍]  │
└─────────────────────────────────────────────────────────────────┘
```

**Advantage over Slack:** The frontend form provides structured fields directly, so Phase 1 (intent parsing) can skip the LLM entirely — the user fills in service, symptom, time range, etc. themselves.

### Investigation Detail Page

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Investigations                                        │
│                                                                   │
│  API latency spike on /api/orders after deploy abc123            │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │🟢 High   │ │⏱ 23s    │ │📍 api      │ │🕐 2 hours ago   │ │
│  │Confidence│ │Duration  │ │Service     │ │Investigated     │ │
│  └──────────┘ └──────────┘ └────────────┘ └──────────────────┘ │
│                                                                   │
│  ┌─── Tabs ──────────────────────────────────────────────────┐  │
│  │ [Diagnosis]  [Evidence]  [Timeline]  [Past Incidents]      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ═══ Diagnosis Tab ═══                                           │
│                                                                   │
│  Root Cause                                                      │
│  Deploy abc123 (merged 2h ago by @alice) added a filter to      │
│  OrderRepository that triggers a full table scan on the          │
│  orders table. p99 latency went from 200ms → 1.8s. [E1][E3][E5]│
│                                                                   │
│  Impact                                                          │
│  All users hitting /api/orders are affected. ~340 req/min,       │
│  92% experiencing >1s response time.                             │
│                                                                   │
│  Suggested Actions                                               │
│  ┌────┬────────────────────────────────────────┬──────────────┐ │
│  │ 🔴 │ Add index on orders.customer_region    │ [Create Task]│ │
│  │ 🟡 │ Review query plan for findByRegion     │ [Create Task]│ │
│  │ 🟢 │ Add query perf tests to CI             │ [Create Task]│ │
│  └────┴────────────────────────────────────────┴──────────────┘ │
│                                                                   │
│  ═══ Evidence Tab ═══                                            │
│                                                                   │
│  E1 — Datadog Metrics (relevance: 0.95)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  p99 latency chart: 200ms ───────╱──── 1.8s              │  │
│  │                                  ↑ deploy abc123          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  E3 — GitHub Deploy (relevance: 0.91)                           │
│  Commit: abc123 by @alice — "Add region filter to orders query" │
│  Changed files: src/repositories/orderRepository.ts (+12 -3)    │
│                                                                   │
│  E5 — Past Incident INC-2847 (relevance: 0.82)                 │
│  "Order API latency — resolved by adding composite index"       │
│                                                                   │
│  ═══ Timeline Tab ═══                                            │
│                                                                   │
│  14:02  Deploy abc123 completed (production)                     │
│  14:08  p99 latency crosses 500ms                               │
│  14:15  p99 latency reaches 1.2s                                │
│  14:31  User report: "API is slow on /api/orders"               │
│  14:34  Investigation started                                    │
│  14:35  Investigation completed (confidence: 87%)                │
│                                                                   │
│  ┌─── Actions ───────────────────────────────────────────────┐  │
│  │ [Escalate to Incident]  [Share to Slack]  [Re-investigate] │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Investigation Service API

| Method | Endpoint                              | Purpose                                       |
| ------ | ------------------------------------- | --------------------------------------------- |
| `POST` | `/api/v1/investigations`              | Start a new investigation                     |
| `GET`  | `/api/v1/investigations`              | List investigations (paginated, filtered)     |
| `GET`  | `/api/v1/investigations/:id`          | Get investigation with full results           |
| `POST` | `/api/v1/investigations/:id/rerun`    | Re-run investigation with fresh data          |
| `POST` | `/api/v1/investigations/:id/escalate` | Promote to incident (creates alert in triage) |

### Start Investigation Request

```typescript
// POST /api/v1/investigations
interface StartInvestigationRequest {
  readonly description: string; // Required: what's the problem
  readonly serviceName?: string; // Optional: which service
  readonly endpoint?: string; // Optional: specific endpoint
  readonly symptom?: InvestigationSymptom; // Optional: auto-detected if omitted
  readonly environment?: string; // Default: "production"
  readonly timeRange?: {
    readonly from: string; // ISO timestamp
    readonly to: string; // ISO timestamp
  };
  readonly dataSources?: ReadonlyArray<string>; // Which sources to query
}
```

### Investigation Response

```typescript
// GET /api/v1/investigations/:id
interface InvestigationResponse {
  readonly id: string;
  readonly status: "gathering" | "analyzing" | "completed" | "failed";
  readonly intent: InvestigationIntent;
  readonly diagnosis?: InvestigationDiagnosis;
  readonly evidence?: ReadonlyArray<EvidenceSource>;
  readonly correlation?: CorrelationResult;
  readonly durationMs?: number;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly initiatedBy: string;
  readonly initiatedFrom: "slack" | "frontend";
}
```

---

## Data Model

### Database Table: `investigations`

```sql
CREATE TABLE investigations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  initiated_by    TEXT NOT NULL,
  initiated_from  TEXT NOT NULL CHECK (initiated_from IN ('slack', 'frontend')),
  status          TEXT NOT NULL DEFAULT 'gathering'
                    CHECK (status IN ('gathering', 'analyzing', 'completed', 'failed')),

  -- Intent
  description     TEXT NOT NULL,
  service_name    TEXT,
  endpoint        TEXT,
  symptom         TEXT,
  environment     TEXT DEFAULT 'production',
  time_range_from TIMESTAMPTZ,
  time_range_to   TIMESTAMPTZ,

  -- Results (JSONB for flexible schema)
  evidence        JSONB,
  correlation     JSONB,
  diagnosis       JSONB,

  -- Metadata
  duration_ms     INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investigations_tenant ON investigations (tenant_id);
CREATE INDEX idx_investigations_status ON investigations (status);
CREATE INDEX idx_investigations_service ON investigations (service_name);
CREATE INDEX idx_investigations_created ON investigations (created_at DESC);
```

---

## Architecture: Where It Lives

### Option: Extend Incident-Triage Service

Investigations are closely related to incident triage — they share:

- Same monitoring data sources
- Same incident correlation logic
- Same LLM summarization patterns
- Same Slack dispatch infrastructure

**Proposed location:**

```
services/incident-triage/src/
├── services/
│   ├── triageService.ts              # Existing: alert triage
│   └── investigationService.ts       # New: on-demand investigation
├── adapters/
│   ├── monitoring/
│   │   ├── datadogAdapter.ts         # Query Datadog metrics
│   │   ├── grafanaAdapter.ts         # Query Grafana dashboards
│   │   └── vercelAnalyticsAdapter.ts # Query Vercel analytics
│   └── deploys/
│       └── githubDeploysAdapter.ts   # Query recent deploys
├── ports/
│   ├── monitoringPort.ts             # Interface for metrics queries
│   └── deployHistoryPort.ts          # Interface for deploy history
├── workers/
│   ├── triageWorker.ts               # Existing: alert processing
│   └── investigationWorker.ts        # New: investigation processing
├── routes/
│   ├── incidentRoutes.ts             # Existing
│   ├── triageRoutes.ts               # Existing
│   └── investigationRoutes.ts        # New: investigation endpoints
└── database/
    └── investigationRepository.ts    # New: investigation CRUD
```

### Slack Bot Integration

```
services/slack-bot/src/
├── handlers/
│   └── commandSubhandlers.ts
│       └── handleInvestigate()        # New: /kenchi investigate handler
```

### Frontend Integration

```
services/frontend/src/
├── pages/
│   ├── Investigations.tsx             # New: investigation list
│   ├── NewInvestigation.tsx           # New: investigation form
│   └── InvestigationDetail.tsx        # New: investigation results
├── components/
│   ├── InvestigationForm.tsx          # New: structured input form
│   ├── InvestigationTimeline.tsx      # New: timeline visualization
│   ├── EvidenceCard.tsx               # New: evidence display card
│   └── DiagnosisPanel.tsx             # New: diagnosis display
└── hooks/
    └── useInvestigationData.ts        # New: API hooks
```

---

## Slack vs Frontend: Comparison

| Aspect              | Slack (`/kenchi investigate`)             | Frontend (Dashboard)                            |
| ------------------- | ----------------------------------------- | ----------------------------------------------- |
| **Speed to start**  | Fastest — type and go                     | Slightly slower — navigate to form              |
| **Input quality**   | Natural language (needs LLM parsing)      | Structured form (no parsing needed)             |
| **Context**         | Inline with team conversation             | Standalone, focused view                        |
| **Results display** | Compact Slack blocks (limited formatting) | Rich UI with charts, tabs, interactive elements |
| **History**         | Lost in Slack scroll                      | Searchable, filterable list                     |
| **Collaboration**   | Thread-based (visible to channel)         | Shareable link, but isolated                    |
| **Best for**        | Quick checks, team visibility             | Deep analysis, historical review                |

**Recommendation:** Support both. Slack for quick, conversational investigations. Frontend for detailed analysis and historical review. Both share the same backend pipeline.

---

## Implementation Phases

### Phase 1: Core Pipeline + Slack (MVP)

**Goal:** `/kenchi investigate` works end-to-end with basic evidence gathering.

- Investigation service with intent parsing
- Evidence gathering from: Kenchi DB (past incidents, CI failures), recent GitHub deploys
- LLM diagnosis with structured output
- Slack command handler + Block Kit result message
- Database persistence
- `GET /api/v1/investigations/:id` endpoint (for "View Full Details" link)

**Not included:** Monitoring tool integration (Datadog/Grafana), frontend UI, re-run capability.

### Phase 2: Monitoring Integration

**Goal:** Evidence gathering from real monitoring data.

- Monitoring port interface + Datadog adapter
- Grafana adapter (optional)
- Vercel Analytics adapter (for Vercel-deployed apps)
- Richer correlation (deploy timing + metrics alignment)
- Evidence relevance scoring

### Phase 3: Frontend Dashboard

**Goal:** Full investigation UI in the frontend.

- Investigation list page with filters
- New investigation form (structured input)
- Investigation detail page with tabs (Diagnosis, Evidence, Timeline, Past Incidents)
- Real-time status updates (polling or SSE while investigation runs)
- TanStack Query hooks for all endpoints
- "Escalate to Incident" and "Share to Slack" actions

### Phase 4: Advanced Features

**Goal:** Intelligence and automation improvements.

- Proactive suggestions ("We noticed /api/orders latency increased 40% — investigate?")
- Investigation templates (pre-filled forms for common scenarios)
- Auto-investigation triggers (attach to monitoring alerts below incident threshold)
- Investigation insights (aggregate patterns across investigations for reliability trends)
- Vector similarity matching between investigation descriptions and past investigations

---

## Key Design Decisions

### 1. Async Processing (Not Request-Response)

Investigations take 15-60 seconds (multiple API calls + LLM). Use the same async job pattern as CI analysis:

```
POST /investigations → 202 Accepted { id, status: "gathering" }
GET  /investigations/:id → { status: "analyzing", ... }
GET  /investigations/:id → { status: "completed", diagnosis: {...} }
```

Frontend polls. Slack posts result to thread when done.

### 2. Evidence-First Diagnosis

The LLM only sees structured evidence, never raw API responses. This ensures:

- Consistent diagnosis quality regardless of monitoring tool
- Evidence is citable (every claim traces to a source)
- Diagnosis is auditable (you can verify what the LLM saw)

### 3. Graceful Degradation

If a data source is unavailable (e.g., Datadog API down), the investigation proceeds with available evidence and notes what's missing:

```
"Note: Could not query Datadog metrics (timeout). Diagnosis based on
 deploy history and past incidents only. Confidence reduced."
```

### 4. Investigations Are Not Incidents

An investigation is informational — it doesn't page anyone, doesn't change alert status, doesn't trigger escalation policies. The user can **choose** to escalate an investigation to an incident if warranted.

---

## Example Scenarios

### Scenario 1: Slow API

```
User: /kenchi investigate API is slow on /api/orders

Evidence gathered:
- Datadog: p99 latency spiked from 200ms to 1.8s at 14:02
- GitHub: Deploy abc123 at 14:00 by @alice (changed orderRepository.ts)
- Kenchi DB: INC-2847 (Jan 15) — similar latency issue, resolved with index

Diagnosis:
"Deploy abc123 introduced unindexed query on orders.customer_region.
 Add index to resolve. Similar to INC-2847."
Confidence: 0.87
```

### Scenario 2: Intermittent Errors

```
User: /kenchi investigate checkout is throwing errors sometimes

Evidence gathered:
- Datadog: 5xx rate at 2.3% (normally 0.1%), all on /api/checkout/complete
- GitHub: No recent deploys to checkout service
- Kenchi DB: 3 similar incidents in last 30 days, all on Fridays
- Logs: "connection refused" to payment-gateway:443

Diagnosis:
"Payment gateway is intermittently refusing connections under load.
 Pattern: recurring on Fridays (high traffic). Not caused by a deploy.
 Suggest: increase connection pool to payment gateway, add circuit breaker."
Confidence: 0.74
```

### Scenario 3: Not Enough Evidence

```
User: /kenchi investigate dashboard feels sluggish

Evidence gathered:
- No monitoring data for frontend service
- No recent deploys
- No past incidents matching "dashboard sluggish"

Diagnosis:
"Insufficient evidence to diagnose. No monitoring metrics available for
 the frontend service. Suggested next steps:
 1. Check browser DevTools Network tab for slow requests
 2. Add frontend performance monitoring (e.g., Vercel Analytics)
 3. Check if the issue is client-side (bundle size) or API-side (slow endpoints)"
Confidence: 0.25
```
