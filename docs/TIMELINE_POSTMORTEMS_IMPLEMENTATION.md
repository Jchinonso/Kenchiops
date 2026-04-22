# Timeline & Postmortems Implementation Guide

Technical specification for two features in the Kenchi monorepo: a unified **Timeline** feed and **Postmortem** report generation from resolved incidents.

---

## Table of Contents

- [Overview](#overview)
- [Feature 1: Timeline](#feature-1-timeline)
  - [Data Sources](#data-sources)
  - [API Design](#timeline-api-design)
  - [Backend Implementation](#timeline-backend-implementation)
  - [Frontend Implementation](#timeline-frontend-implementation)
  - [Routing & Proxy](#timeline-routing--proxy)
- [Feature 2: Postmortems](#feature-2-postmortems)
  - [Database Schema](#postmortem-database-schema)
  - [Repository Layer](#postmortem-repository-layer)
  - [Generation Service](#postmortem-generation-service)
  - [API Design](#postmortem-api-design)
  - [Frontend Implementation](#postmortem-frontend-implementation)
  - [Routing & Proxy](#postmortem-routing--proxy)
- [Architecture Diagram](#architecture-diagram)
- [File Inventory](#file-inventory)
- [Testing Strategy](#testing-strategy)
- [Dependencies & Risks](#dependencies--risks)
- [Future Enhancements](#future-enhancements)

---

## Overview

**Timeline** provides a single chronological feed merging incidents (monitoring webhooks), CI failures (GitHub/GitLab), and AI-generated analyses. It answers "what happened across all our services in the last N hours?"

**Postmortems** turns resolved incident data into structured, editable postmortem documents. The system reuses AI summaries already produced by the triage pipeline (no additional LLM calls). Users review, edit, and publish these reports to build institutional memory.

Both features live on the `services/incident-triage` backend (port 3004) and surface in the frontend under `/dashboard/incidents/`.

---

## Feature 1: Timeline

### Data Sources

Three database tables feed the timeline, all scoped by `tenant_id`:

#### 1. `incident_alerts` (migration: `database/init/015_incident_triage.sql`)

Monitoring alerts ingested from Prometheus, Grafana, Datadog, PagerDuty, Vercel, and Netlify webhooks.

| Column         | Type           | Notes                                         |
| -------------- | -------------- | --------------------------------------------- |
| `id`           | `VARCHAR(50)`  | Primary key                                   |
| `tenant_id`    | `VARCHAR(50)`  | FK to `tenants(id)`                           |
| `source`       | `VARCHAR(50)`  | Provider name ("prometheus", "grafana", etc.) |
| `severity`     | `VARCHAR(20)`  | Default "medium"                              |
| `title`        | `TEXT`         | Alert title                                   |
| `description`  | `TEXT`         | Alert description (nullable)                  |
| `status`       | `VARCHAR(50)`  | "received", "acknowledged", "resolved", etc.  |
| `service_name` | `VARCHAR(255)` | Affected service (nullable)                   |
| `environment`  | `VARCHAR(50)`  | Environment label (nullable)                  |
| `received_at`  | `TIMESTAMPTZ`  | When the alert was received                   |
| `labels`       | `JSONB`        | Arbitrary key-value labels                    |

Joined with `incident_triage_results` for severity scores and AI summaries when available.

#### 2. `events` (migration: `database/init/001_schema.sql`, tenant_id added in `002_tenants.sql`)

CI/CD webhook events -- build failures, test failures, deploy events from GitHub and GitLab.

| Column      | Type           | Notes                          |
| ----------- | -------------- | ------------------------------ |
| `id`        | `VARCHAR(50)`  | Primary key (prefix `evt_`)    |
| `tenant_id` | `VARCHAR(50)`  | FK to `tenants(id)`, nullable  |
| `type`      | `VARCHAR(50)`  | Event type                     |
| `source`    | `VARCHAR(100)` | Provider name                  |
| `severity`  | `VARCHAR(20)`  | Nullable                       |
| `timestamp` | `TIMESTAMPTZ`  | Event timestamp                |
| `payload`   | `JSONB`        | Full webhook payload           |
| `metadata`  | `JSONB`        | Additional metadata (nullable) |

#### 3. `analyses` (migration: `database/init/001_schema.sql`, tenant_id added in `002_tenants.sql`)

AI-generated root cause analyses of CI failures, linked to `events` via `event_id`.

| Column                 | Type          | Notes                       |
| ---------------------- | ------------- | --------------------------- |
| `id`                   | `VARCHAR(50)` | Primary key (prefix `ana_`) |
| `event_id`             | `VARCHAR(50)` | FK to `events(id)`          |
| `tenant_id`            | `VARCHAR(50)` | Nullable                    |
| `summary`              | `TEXT`        | Short analysis summary      |
| `identified_cause`     | `TEXT`        | Root cause (nullable)       |
| `diagnosis_confidence` | `FLOAT`       | Confidence score            |
| `recommended_actions`  | `JSONB`       | Action list (nullable)      |
| `created_at`           | `TIMESTAMPTZ` | When analysis was created   |

### Timeline API Design

**Endpoint**: `GET /api/v1/timeline`
**Service**: `services/incident-triage` (port 3004)
**Auth**: Standard tenant-scoped JWT auth via `requireTenantId` middleware

#### Query Parameters

| Parameter   | Type   | Default | Constraints               | Description               |
| ----------- | ------ | ------- | ------------------------- | ------------------------- |
| `limit`     | int    | 20      | 1-100                     | Items per page            |
| `offset`    | int    | 0       | >= 0                      | Pagination offset         |
| `timeRange` | string | "7d"    | "24h", "7d", "30d", "all" | Time window filter        |
| `source`    | string | --      | Optional                  | Filter by source provider |

#### Response Shape

```json
{
  "data": {
    "items": [
      {
        "id": "alr_abc123",
        "type": "incident",
        "title": "High CPU on kenchi-api",
        "description": "CPU usage exceeded 90% threshold for 5 minutes",
        "severity": "critical",
        "source": "prometheus",
        "status": "resolved",
        "timestamp": "2026-04-10T14:30:00Z",
        "metadata": {
          "serviceName": "kenchi-api",
          "environment": "production"
        }
      },
      {
        "id": "evt_def456",
        "type": "ci_failure",
        "title": "Build failed on main",
        "description": null,
        "severity": "high",
        "source": "github",
        "status": "failed",
        "timestamp": "2026-04-10T14:25:00Z",
        "metadata": {}
      },
      {
        "id": "ana_ghi789",
        "type": "analysis",
        "title": "Root cause: connection pool exhaustion",
        "description": "Database connection pool reached max limit due to leaked connections in retry handler",
        "severity": "high",
        "source": "kenchi",
        "status": "completed",
        "timestamp": "2026-04-10T14:28:00Z",
        "metadata": {
          "eventId": "evt_def456",
          "confidence": 0.92
        }
      }
    ],
    "total": 147
  }
}
```

#### Error Responses

| Status | Code                   | When                     |
| ------ | ---------------------- | ------------------------ |
| 400    | `VALIDATION_ERROR`     | Invalid query parameters |
| 401    | `AUTHENTICATION_ERROR` | Missing or invalid JWT   |
| 500    | `INTERNAL_ERROR`       | Database query failure   |

### Timeline Backend Implementation

#### Unified Type

Define a `TimelineEntry` type that normalizes records from all three source tables:

```typescript
// packages/shared/src/database/timeline/types.ts

export type TimelineEntryType = "incident" | "ci_failure" | "analysis";

export type TimelineSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface TimelineEntry {
  readonly id: string;
  readonly type: TimelineEntryType;
  readonly title: string;
  readonly description: string | null;
  readonly severity: TimelineSeverity;
  readonly source: string;
  readonly status: string;
  readonly timestamp: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TimelineQueryParams {
  readonly tenantId: string;
  readonly limit: number;
  readonly offset: number;
  readonly timeRange: "24h" | "7d" | "30d" | "all";
  readonly source?: string;
}

export interface PaginatedTimeline {
  readonly items: readonly TimelineEntry[];
  readonly total: number;
}
```

#### Query Strategy: SQL UNION ALL

For correctness and performance, use a single SQL query with `UNION ALL` across the three tables. This lets PostgreSQL sort and paginate in one pass rather than fetching, merging, and re-sorting in application code.

```sql
-- Pseudocode for the timeline query
WITH timeline AS (
  SELECT id, 'incident' AS type, title, description, severity,
         source, status, received_at AS timestamp,
         jsonb_build_object('serviceName', service_name, 'environment', environment) AS metadata
  FROM incident_alerts
  WHERE tenant_id = $1 AND received_at >= $2

  UNION ALL

  SELECT id, 'ci_failure' AS type,
         COALESCE(payload->>'title', type) AS title,
         payload->>'description' AS description,
         COALESCE(severity, 'medium') AS severity,
         source, COALESCE(metadata->>'status', 'unknown') AS status,
         timestamp,
         COALESCE(metadata, '{}') AS metadata
  FROM events
  WHERE tenant_id = $1 AND timestamp >= $2

  UNION ALL

  SELECT a.id, 'analysis' AS type,
         a.summary AS title,
         a.identified_cause AS description,
         CASE
           WHEN a.diagnosis_confidence >= 0.8 THEN 'high'
           WHEN a.diagnosis_confidence >= 0.5 THEN 'medium'
           ELSE 'low'
         END AS severity,
         'kenchi' AS source,
         'completed' AS status,
         a.created_at AS timestamp,
         jsonb_build_object('eventId', a.event_id, 'confidence', a.diagnosis_confidence) AS metadata
  FROM analyses a
  WHERE a.tenant_id = $1 AND a.created_at >= $2
)
SELECT *, COUNT(*) OVER() AS total
FROM timeline
ORDER BY timestamp DESC
LIMIT $3 OFFSET $4;
```

The `$2` parameter is computed from `timeRange`:

- `"24h"` -> `NOW() - INTERVAL '24 hours'`
- `"7d"` -> `NOW() - INTERVAL '7 days'`
- `"30d"` -> `NOW() - INTERVAL '30 days'`
- `"all"` -> epoch (no time filter, or omit the `WHERE` clause on timestamp)

**Performance considerations:**

- Each source table already has a `(tenant_id, created_at DESC)` or `(tenant_id, timestamp DESC)` index.
- Default 7-day window limits scan range.
- `COUNT(*) OVER()` avoids a second query for total count.
- For extremely large datasets, consider materializing the timeline into a dedicated view or table (future optimization).

#### Source Filter

When `source` is provided, add a `WHERE source = $5` clause to each arm of the UNION. For the `analyses` arm, the source is always `"kenchi"`, so if the filter does not match `"kenchi"`, skip that arm entirely.

#### Row Mapper

```typescript
// packages/shared/src/database/timeline/helpers.ts

export const mapRowToTimelineEntry = (row: TimelineRow): TimelineEntry => ({
  id: row.id,
  type: row.type as TimelineEntryType,
  title: row.title,
  description: row.description,
  severity: normalizeSeverity(row.severity),
  source: row.source,
  status: row.status,
  timestamp: row.timestamp,
  metadata: row.metadata ?? {},
});
```

#### Handler

The timeline handler lives in `services/incident-triage/src/routes/incidentRoutes.ts` (or a new `timelineRoutes.ts` file, mounted alongside `incidentRoutes`).

```typescript
// GET /api/v1/timeline
router.get(
  "/api/v1/timeline",
  requireTenantId,
  rateLimitByCategory("standard"),
  asyncHandler(async (req: Request, res: Response) => {
    const params = validateTimelineParams(req.query, req.context.tenantId);
    const result = await getTimeline(params);
    res.status(HTTP_STATUS.OK).json({ data: result });
  })
);
```

### Timeline Frontend Implementation

#### Hook: `useTimelineData`

**Location**: `services/frontend/src/hooks/useTimelineData/`

```typescript
// hooks.ts
import { useQuery } from "@tanstack/react-query";

export const useTimeline = (params: TimelineParams) =>
  useQuery({
    queryKey: ["timeline", params],
    queryFn: () => fetchTimeline(params),
    staleTime: 30_000, // 30s -- timeline data updates frequently
  });
```

#### Page: `IncidentTimeline`

**Location**: `services/frontend/src/pages/IncidentTimeline/index.tsx`

UI structure:

1. **Filter bar** (top): time range dropdown (`24h | 7d | 30d | All`), source filter dropdown
2. **Timeline list** (main): vertical feed of cards, each showing:
   - Icon by type: `AlertTriangle` for incidents, `GitBranch` for CI failures, `Brain` for analyses
   - Title text
   - Severity badge (color-coded: red=critical, orange=high, yellow=medium, blue=low, gray=info)
   - Source badge (e.g., "prometheus", "github")
   - Relative timestamp via `formatDistanceToNow` or equivalent ("2 hours ago")
   - Truncated description (first ~120 characters)
3. **Click behavior**: navigate to the relevant detail page
   - `"incident"` -> `/dashboard/incidents/${id}`
   - `"ci_failure"` -> `/dashboard/cicd/analyses/${eventId}` (if analysis exists) or stay
   - `"analysis"` -> `/dashboard/cicd/analyses/${id}`
4. **Pagination**: offset-based, "Load more" or page controls at the bottom
5. **Empty state**: message when no events match the current filters
6. **Loading state**: skeleton cards during fetch

### Timeline Routing & Proxy

#### Sidebar

In `services/frontend/src/components/DashboardSidebar/DashboardSidebar.tsx`, the timeline link already exists at `/dashboard/incidents/timeline` with `comingSoon: true`. Change to `comingSoon: false` (or remove the property).

#### Coming Soon Config

Remove the `/dashboard/incidents/timeline` entry from `COMING_SOON_PAGES` in `services/frontend/src/pages/Dashboard/constants.tsx`.

#### Route Registration

In `services/frontend/src/pages/Dashboard/helpers.tsx`, add a route entry to the `INCIDENT_ROUTES` array:

```typescript
import { IncidentTimeline } from "@/pages/IncidentTimeline";

// Add before the "/dashboard/incidents/active" entry (more-specific first):
["/dashboard/incidents/timeline", () => <IncidentTimeline />],
```

#### Nginx Proxy

The `/api/v1/timeline` path is already covered by the existing `location /api/v1/incidents` block in `services/frontend/nginx.conf` if the timeline endpoint is mounted under `/api/v1/incidents/timeline`. However, if mounted at the top-level `/api/v1/timeline`, add a new location block before the generic `/api/` catch-all:

```nginx
# Timeline routes: proxy to incident-triage service on port 3004
location /api/v1/timeline {
    resolver 127.0.0.11 valid=30s ipv6=off;
    set $incident_upstream http://incident-triage:3004;
    proxy_pass $incident_upstream$request_uri;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

#### Route Mount in Backend

In `services/incident-triage/src/routes/index.ts`, mount the timeline route. If timeline lives in `incidentRoutes.ts`, no changes needed. If a separate `timelineRoutes.ts` file is created:

```typescript
import { timelineRoutes } from "./timelineRoutes.js";
// ...
app.use(timelineRoutes);
```

---

## Feature 2: Postmortems

### Postmortem Database Schema

**Migration**: `database/init/042_postmortems.sql` (already exists)

```sql
CREATE TABLE IF NOT EXISTS postmortems (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'pst_' || replace(gen_random_uuid()::text, '-', ''),
  tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
  alert_id VARCHAR(50) REFERENCES incident_alerts(id),
  title VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | published
  content JSONB NOT NULL DEFAULT '{}',
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_postmortems_tenant ON postmortems(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_postmortems_alert ON postmortems(alert_id);
```

**`content` JSONB structure** (`PostmortemContent` type):

```json
{
  "summary": "What happened in 1-2 paragraphs",
  "timeline": "Chronological narrative of the incident",
  "rootCause": "Detailed root cause analysis",
  "impact": "What was affected and for how long",
  "actionItems": [
    { "action": "Add memory limit alerts", "owner": "", "dueDate": null, "status": "open" },
    { "action": "Fix connection pool leak", "owner": "", "dueDate": null, "status": "open" }
  ],
  "lessonsLearned": "What the team learned from this incident",
  "additionalNotes": "Any extra context"
}
```

Note: The `timeline` field within `content` is a string (narrative text), not to be confused with the Timeline feature above. A future iteration could make this a structured array of timestamped events.

### Postmortem Repository Layer

**Location**: `packages/shared/src/database/postmortem/`

The types and helpers modules already exist. The remaining work is:

#### Existing Files

- **`types.ts`** -- Complete. Defines `PostmortemRow`, `PostmortemRecord`, `PostmortemContent`, `PostmortemActionItem`, `PostmortemStatus`, `CreatePostmortemInput`, `UpdatePostmortemInput`, `ListPostmortemFilters`, `PaginatedPostmortems`.
- **`helpers.ts`** -- Complete. Contains `mapRowToPostmortem()` (row-to-domain mapper), `parseContent()` (JSONB-to-typed with defaults), `validateCreatePostmortemInput()`, `validatePostmortemId()`.

#### Files to Create

**`repository.ts`** -- CRUD operations against the `postmortems` table. Follow the pattern in `packages/shared/src/database/knowledgeDoc/repository.ts`:

```typescript
// packages/shared/src/database/postmortem/repository.ts

const QUERIES = {
  INSERT: `
    INSERT INTO postmortems (tenant_id, alert_id, title, status, content, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `,
  SELECT_BY_ID: `
    SELECT * FROM postmortems WHERE id = $1
  `,
  SELECT_BY_TENANT: `
    SELECT *, COUNT(*) OVER() AS total
    FROM postmortems
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `,
  SELECT_BY_TENANT_AND_STATUS: `
    SELECT *, COUNT(*) OVER() AS total
    FROM postmortems
    WHERE tenant_id = $1 AND status = $2
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
  `,
  UPDATE: `
    UPDATE postmortems
    SET title = COALESCE($2, title),
        content = COALESCE($3, content),
        status = COALESCE($4, status),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,
  PUBLISH: `
    UPDATE postmortems
    SET status = 'published', published_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND status = 'draft'
    RETURNING *
  `,
} as const;
```

Exported functions:

- `createPostmortem(input: CreatePostmortemInput): Promise<PostmortemRecord>`
- `getPostmortemById(id: string): Promise<PostmortemRecord | null>`
- `getPostmortemsByTenant(filters: ListPostmortemFilters): Promise<PaginatedPostmortems>`
- `updatePostmortem(id: string, input: UpdatePostmortemInput): Promise<PostmortemRecord | null>`
- `publishPostmortem(id: string): Promise<PostmortemRecord | null>`

All functions use parameterized queries via the shared `query<PostmortemRow>()` client and map results through `mapRowToPostmortem()`.

**`index.ts`** -- Barrel export:

```typescript
export * from "./types.js";
export {
  mapRowToPostmortem,
  validateCreatePostmortemInput,
  validatePostmortemId,
} from "./helpers.js";
export {
  createPostmortem,
  getPostmortemById,
  getPostmortemsByTenant,
  updatePostmortem,
  publishPostmortem,
} from "./repository.js";
```

#### Barrel Chain

Add exports to the barrel chain:

1. `packages/shared/src/database/index.ts` -- add `export * from "./postmortem/index.js";`
2. `packages/shared/src/index.ts` -- already re-exports from `database/index.ts` (verify)

### Postmortem Generation Service

**Location**: `services/incident-triage/src/services/postmortemGenerator.ts`

This service does NOT call the LLM. It reuses existing AI summary data from the triage pipeline stored in `incident_triage_results.ai_summary`.

#### Interface

```typescript
interface PostmortemDraft {
  readonly title: string;
  readonly alertId: string;
  readonly content: PostmortemContent;
}

const generatePostmortemDraft = async (
  alertId: string,
  tenantId: string,
  context: RequestContext
): Promise<PostmortemDraft>
```

#### Generation Logic

1. **Fetch alert** from `incident_alerts` by `alertId` and `tenantId`. Throw `NotFoundError` if missing or tenant mismatch.
2. **Fetch triage result** from `incident_triage_results` by `alert_id`. May be null (triage not yet run, or failed).
3. **Build content**:

| Field             | With AI Summary                                                                                | Without AI Summary (fallback)                                               |
| ----------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `summary`         | `ai_summary.headline` + `ai_summary.rootCauseSummary`                                          | Alert `title` + `description`                                               |
| `timeline`        | Built from alert `received_at`, triage `created_at`, status change events                      | `"Alert received at {received_at}. Review and document the full timeline."` |
| `rootCause`       | `ai_summary.rootCauseSummary`                                                                  | `"Root cause not yet determined. Review monitoring data and logs."`         |
| `impact`          | `ai_summary.impactAssessment`                                                                  | `"Impact assessment pending. Document affected services and duration."`     |
| `actionItems`     | `ai_summary.suggestedActions` mapped to `{ action, owner: "", dueDate: null, status: "open" }` | Empty array                                                                 |
| `lessonsLearned`  | `"Review and document what the team learned from this incident."`                              | Same                                                                        |
| `additionalNotes` | `""`                                                                                           | `""`                                                                        |

4. **Build title**: `"Postmortem: {alert.title}"` (truncated to 500 chars)
5. **Return** the draft (not persisted yet -- the frontend calls the save endpoint separately)

#### Key Design Decisions

- **No LLM call**: The triage pipeline already runs an LLM to produce `ai_summary`. The generator reuses that data, keeping costs and latency low.
- **Graceful degradation**: If no triage result exists, a minimal template is returned with placeholder text. The user fills in details manually.
- **Separation of generate and save**: The generate endpoint returns a draft without persisting it. The frontend displays it for review, then the user explicitly saves. This prevents orphaned draft records.

### Postmortem API Design

**Route file**: `services/incident-triage/src/routes/postmortemRoutes.ts`

All endpoints require tenant-scoped JWT auth (`requireTenantId` middleware).

#### Endpoints

| Method | Path                              | Description                                   | Rate Limit |
| ------ | --------------------------------- | --------------------------------------------- | ---------- |
| `GET`  | `/api/v1/postmortems`             | List postmortems (paginated, tenant-scoped)   | standard   |
| `GET`  | `/api/v1/postmortems/:id`         | Get single postmortem by ID                   | standard   |
| `POST` | `/api/v1/postmortems/generate`    | Generate draft from alert ID (no persistence) | expensive  |
| `POST` | `/api/v1/postmortems`             | Save new postmortem                           | standard   |
| `PUT`  | `/api/v1/postmortems/:id`         | Update postmortem content/title               | standard   |
| `POST` | `/api/v1/postmortems/:id/publish` | Set status to "published", set `published_at` | standard   |

#### Request/Response Details

**List postmortems**:

```
GET /api/v1/postmortems?limit=20&offset=0&status=draft
```

```json
{
  "data": {
    "items": [
      {
        "id": "pst_abc123",
        "tenantId": "tnt_xyz",
        "alertId": "alr_456",
        "title": "Postmortem: High CPU on kenchi-api",
        "status": "draft",
        "content": { ... },
        "createdBy": "usr_789",
        "createdAt": "2026-04-10T15:00:00Z",
        "updatedAt": "2026-04-10T15:30:00Z",
        "publishedAt": null
      }
    ],
    "total": 12,
    "limit": 20,
    "offset": 0
  }
}
```

**Generate draft** (does not persist):

```
POST /api/v1/postmortems/generate
{ "alertId": "alr_456" }
```

```json
{
  "data": {
    "title": "Postmortem: High CPU on kenchi-api",
    "alertId": "alr_456",
    "content": {
      "summary": "kenchi-api experienced sustained high CPU...",
      "timeline": "...",
      "rootCause": "Connection pool leak in retry handler...",
      "impact": "API response times degraded for 23 minutes...",
      "actionItems": [
        {
          "action": "Add connection pool monitoring",
          "owner": "",
          "dueDate": null,
          "status": "open"
        }
      ],
      "lessonsLearned": "Review and document what the team learned from this incident.",
      "additionalNotes": ""
    }
  }
}
```

**Save postmortem**:

```
POST /api/v1/postmortems
{
  "alertId": "alr_456",
  "title": "Postmortem: High CPU on kenchi-api",
  "content": { ... }
}
```

**Update postmortem**:

```
PUT /api/v1/postmortems/pst_abc123
{
  "title": "Updated title",
  "content": { ... }
}
```

**Publish postmortem**:

```
POST /api/v1/postmortems/pst_abc123/publish
```

Returns the updated record with `status: "published"` and `publishedAt` set. Returns 400 if already published.

#### Error Responses

| Status | Code                   | When                                               |
| ------ | ---------------------- | -------------------------------------------------- |
| 400    | `VALIDATION_ERROR`     | Missing required fields, invalid status transition |
| 401    | `AUTHENTICATION_ERROR` | Missing or invalid JWT                             |
| 404    | `NOT_FOUND`            | Postmortem or alert ID not found                   |
| 500    | `INTERNAL_ERROR`       | Database failure                                   |

#### Route Implementation Pattern

```typescript
// services/incident-triage/src/routes/postmortemRoutes.ts

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  asyncHandler,
  createLogger,
  ValidationError,
  NotFoundError,
  requireTenantId,
  rateLimitByCategory,
  createPostmortem,
  getPostmortemById,
  getPostmortemsByTenant,
  updatePostmortem,
  publishPostmortem,
  validateCreatePostmortemInput,
  validatePostmortemId,
} from "@kenchi/shared";
import { generatePostmortemDraft } from "../services/postmortemGenerator.js";

const router = Router();
const logger = createLogger("postmortem-routes");

// POST /api/v1/postmortems/generate -- must appear before /:id routes
router.post(
  "/api/v1/postmortems/generate",
  requireTenantId,
  rateLimitByCategory("expensive"),
  asyncHandler(async (req: Request, res: Response) => {
    const { alertId } = req.body;
    if (!alertId) {
      throw new ValidationError("alertId is required");
    }
    const draft = await generatePostmortemDraft(alertId, req.context.tenantId, req.context);
    res.status(HTTP_STATUS.OK).json({ data: draft });
  })
);

// ... remaining CRUD handlers follow the same pattern
export { router as postmortemRoutes };
```

### Postmortem Frontend Implementation

#### Hooks: `usePostmortemData`

**Location**: `services/frontend/src/hooks/usePostmortemData/`

```typescript
// types.ts
export interface PostmortemListParams {
  readonly limit: number;
  readonly offset: number;
  readonly status?: string;
}

// hooks.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const usePostmortems = (params: PostmortemListParams) =>
  useQuery({
    queryKey: ["postmortems", params],
    queryFn: () => fetchPostmortems(params),
  });

export const usePostmortemDetail = (id: string) =>
  useQuery({
    queryKey: ["postmortems", id],
    queryFn: () => fetchPostmortem(id),
    enabled: !!id,
  });

export const useGeneratePostmortem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => generatePostmortem(alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["postmortems"] }),
  });
};

export const useSavePostmortem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SavePostmortemInput) =>
      data.id ? updatePostmortem(data.id, data) : createPostmortem(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["postmortems"] }),
  });
};

export const usePublishPostmortem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishPostmortem(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["postmortems"] });
      queryClient.invalidateQueries({ queryKey: ["postmortems", id] });
    },
  });
};
```

#### List Page: `Postmortems`

**Location**: `services/frontend/src/pages/Postmortems/index.tsx`
**Route**: `/dashboard/incidents/postmortems`

UI:

- **Table** with columns: Title, Linked Incident (alert title), Status (badge -- draft=yellow, published=green), Created (relative time), Actions (view/edit)
- **"Generate from Incident" button** in the header area
  - Opens a dialog listing resolved incidents (`status = 'resolved'`)
  - User selects an incident, clicks "Generate"
  - Calls the generate endpoint
  - On success, navigates to the editor page with the draft data
- **Click a row** -> navigates to `/dashboard/incidents/postmortems/:id`
- **Pagination** at the bottom (offset-based, matching the limit/offset pattern used elsewhere)
- **Empty state** when no postmortems exist yet

#### Editor Page: `PostmortemEditor`

**Location**: `services/frontend/src/pages/PostmortemEditor/index.tsx`
**Route**: `/dashboard/incidents/postmortems/:id`

UI:

- **Header**: editable title field, status badge, "Save Draft" and "Publish" buttons
- **AI banner**: if the postmortem was generated from an alert, show a dismissible info banner: "AI-generated draft -- review and edit before publishing"
- **Sections** (each as an editable textarea or rich text input):
  - Summary
  - Timeline (free-text narrative)
  - Root Cause
  - Impact Assessment
  - Action Items (structured list -- each item has: action text, owner input, due date picker, status toggle open/done)
  - Lessons Learned
  - Additional Notes
- **Auto-save**: debounced PUT on 2-second idle after any field change. Use a `useDebouncedCallback` pattern with the `useSavePostmortem` mutation. Show a subtle "Saving..." / "Saved" indicator.
- **Publish flow**: "Publish" button triggers confirmation dialog, then calls publish endpoint. On success, fields become read-only and status badge changes to "Published".

#### State Management

The editor manages form state locally with `useState` for each content section. On mount, it hydrates from the `usePostmortemDetail` query data. Changes are tracked as a dirty flag to enable the debounced auto-save.

For the "generate and navigate" flow from the list page:

1. List page calls `useGeneratePostmortem().mutateAsync(alertId)`
2. On success, receives the draft object
3. Navigates to `/dashboard/incidents/postmortems/new` with the draft in router state
4. Editor page detects router state, displays the draft, and waits for the user to explicitly "Save Draft" before persisting

### Postmortem Routing & Proxy

#### Sidebar

In `DashboardSidebar.tsx`, the postmortems link already exists at `/dashboard/incidents/postmortems` with `comingSoon: true`. Change to `comingSoon: false`.

#### Coming Soon Config

Remove the `/dashboard/incidents/postmortems` entry from `COMING_SOON_PAGES` in `constants.tsx`.

#### Route Registration

In `helpers.tsx`, add entries to `INCIDENT_ROUTES`:

```typescript
import { Postmortems } from "@/pages/Postmortems";
import { PostmortemEditor } from "@/pages/PostmortemEditor";

// Add to INCIDENT_ROUTES (more-specific prefixes first):
["/dashboard/incidents/postmortems/new", () => <PostmortemEditor />],
["/dashboard/incidents/postmortems/", (pathname) => {
  const id = decodeURIComponent(pathname.slice("/dashboard/incidents/postmortems/".length));
  return <PostmortemEditor postmortemId={id} />;
}],
["/dashboard/incidents/postmortems", () => <Postmortems />],
```

#### Nginx Proxy

Add a location block for postmortem routes before the generic `/api/` catch-all in `services/frontend/nginx.conf`:

```nginx
# Postmortem routes: proxy to incident-triage service on port 3004
location /api/v1/postmortems {
    resolver 127.0.0.11 valid=30s ipv6=off;
    set $incident_upstream http://incident-triage:3004;
    proxy_pass $incident_upstream$request_uri;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## Architecture Diagram

```
+-------------------------------------------------------------+
|                      Frontend (React)                        |
|                                                              |
|  +----------------+  +-----------------+  +-----------------+|
|  | IncidentTime-  |  | Postmortems     |  | PostmortemEditor||
|  | line Page      |  | List Page       |  | (edit/publish)  ||
|  +-------+--------+  +-------+---------+  +--------+--------+|
|          |                    |                     |         |
|  +-------+--------+  +-------+---------+  +--------+--------+|
|  |useTimelineData |  |usePostmortemData|  |useSavePostmortem||
|  |  hooks         |  |  hooks          |  |usePublish...    ||
|  +-------+--------+  +-------+---------+  +--------+--------+|
+-----------+-------------------+--------------------+---------+
            |                   |                    |
      nginx proxy          nginx proxy          nginx proxy
            |                   |                    |
            v                   v                    v
+-------------------------------------------------------------+
|             Incident Triage Service (port 3004)              |
|                                                              |
|  +-----------------+  +-----------------+  +-----------------+|
|  |GET /api/v1/     |  |GET /postmortems |  |POST /generate  ||
|  |   timeline      |  |GET /:id         |  |POST /           ||
|  |                 |  |PUT /:id         |  |POST /:id/publish||
|  +--------+--------+  +--------+--------+  +--------+-------+|
|           |                     |                    |        |
|           |              +------+-------+    +-------+------+|
|           |              |  Postmortem  |    |  Postmortem  ||
|           |              |  Repository  |    |  Generator   ||
|           |              +--------------+    +--------------+|
+-----+-----+-------------------------------------------------+
      |
      v
+-------------------------------------------------------------+
|                       PostgreSQL                             |
|                                                              |
|  incident_alerts  --+                                        |
|  events           --+-- UNION ALL --> timeline feed          |
|  analyses         --+                                        |
|                                                              |
|  postmortems      -- linked to incident_alerts via alert_id  |
|  incident_triage_results -- provides AI data for generation  |
+-------------------------------------------------------------+
```

---

## File Inventory

### New Files to Create

| File                                                           | Purpose                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/shared/src/database/postmortem/repository.ts`        | CRUD operations for postmortems table                       |
| `packages/shared/src/database/postmortem/index.ts`             | Barrel exports for postmortem module                        |
| `packages/shared/src/database/timeline/types.ts`               | `TimelineEntry`, `TimelineQueryParams`, `PaginatedTimeline` |
| `packages/shared/src/database/timeline/helpers.ts`             | Row mapper, severity normalizer, time range calculator      |
| `packages/shared/src/database/timeline/repository.ts`          | UNION ALL query implementation                              |
| `packages/shared/src/database/timeline/index.ts`               | Barrel exports                                              |
| `services/incident-triage/src/routes/postmortemRoutes.ts`      | REST endpoints for postmortem CRUD + generation             |
| `services/incident-triage/src/services/postmortemGenerator.ts` | Draft generation from alert + triage data                   |
| `services/frontend/src/hooks/useTimelineData/types.ts`         | Frontend timeline types                                     |
| `services/frontend/src/hooks/useTimelineData/hooks.ts`         | TanStack Query hooks for timeline                           |
| `services/frontend/src/hooks/useTimelineData/index.ts`         | Barrel                                                      |
| `services/frontend/src/hooks/usePostmortemData/types.ts`       | Frontend postmortem types                                   |
| `services/frontend/src/hooks/usePostmortemData/hooks.ts`       | TanStack Query hooks for postmortem CRUD                    |
| `services/frontend/src/hooks/usePostmortemData/index.ts`       | Barrel                                                      |
| `services/frontend/src/pages/IncidentTimeline/index.tsx`       | Timeline page component                                     |
| `services/frontend/src/pages/Postmortems/index.tsx`            | Postmortems list page                                       |
| `services/frontend/src/pages/PostmortemEditor/index.tsx`       | Postmortem editor page                                      |

### Existing Files to Modify

| File                                                                     | Change                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `services/incident-triage/src/routes/index.ts`                           | Import and mount `postmortemRoutes`                                                   |
| `services/incident-triage/src/routes/incidentRoutes.ts`                  | Add `GET /api/v1/timeline` handler (or create separate `timelineRoutes.ts`)           |
| `services/frontend/nginx.conf`                                           | Add proxy blocks for `/api/v1/timeline` and `/api/v1/postmortems`                     |
| `services/frontend/src/pages/Dashboard/helpers.tsx`                      | Register `IncidentTimeline`, `Postmortems`, `PostmortemEditor` in `INCIDENT_ROUTES`   |
| `services/frontend/src/pages/Dashboard/constants.tsx`                    | Remove timeline and postmortems entries from `COMING_SOON_PAGES`                      |
| `services/frontend/src/components/DashboardSidebar/DashboardSidebar.tsx` | Set `comingSoon: false` for timeline and postmortems nav items                        |
| `packages/shared/src/database/index.ts`                                  | Add `export * from "./postmortem/index.js"` and `export * from "./timeline/index.js"` |
| `packages/shared/src/index.ts`                                           | Verify re-exports propagate (should already re-export from `database/index.ts`)       |

### Already Existing Files (no changes needed)

| File                                                 | Status             |
| ---------------------------------------------------- | ------------------ |
| `database/init/042_postmortems.sql`                  | Migration complete |
| `packages/shared/src/database/postmortem/types.ts`   | Types complete     |
| `packages/shared/src/database/postmortem/helpers.ts` | Helpers complete   |

---

## Testing Strategy

### Backend Unit Tests

**Postmortem repository** (`packages/shared/src/database/postmortem/repository.test.ts`):

- Create postmortem with valid input -> returns domain object with camelCase fields
- Create postmortem with missing title -> throws `ValidationError`
- Get by ID returns null for non-existent ID
- List by tenant returns paginated results with correct total
- List with status filter only returns matching records
- Update content preserves fields not in the update payload
- Publish sets status and `publishedAt`
- Publish on already-published record returns null

**Postmortem generator** (`services/incident-triage/src/services/postmortemGenerator.test.ts`):

- Alert with full AI summary -> all content sections populated
- Alert without triage result -> fallback template content
- Alert with partial AI summary (missing `impactAssessment`) -> graceful defaults
- Alert not found -> throws `NotFoundError`
- Tenant ID mismatch -> throws `NotFoundError`

**Timeline repository** (`packages/shared/src/database/timeline/repository.test.ts`):

- Returns entries from all three tables sorted by timestamp DESC
- Respects time range filter (entries outside window excluded)
- Respects source filter
- Pagination works correctly (limit + offset)
- Total count reflects filtered results, not page size
- Empty result set returns `{ items: [], total: 0 }`

### Backend Integration Tests

- Timeline endpoint returns correctly ordered results from a seeded database
- Postmortem generate -> save -> update -> publish lifecycle works end-to-end

### Frontend Component Tests

**Timeline page** (`services/frontend/src/pages/IncidentTimeline/IncidentTimeline.test.tsx`):

- Renders timeline cards from mock API data
- Filter changes trigger new API calls with updated params
- Empty state shown when no results
- Cards show correct icons per entry type

**Postmortem list** (`services/frontend/src/pages/Postmortems/Postmortems.test.tsx`):

- Renders table rows from mock data
- Status badges show correct colors
- "Generate from Incident" button opens dialog

**Postmortem editor** (`services/frontend/src/pages/PostmortemEditor/PostmortemEditor.test.tsx`):

- Hydrates form from fetched postmortem data
- Debounced auto-save fires after edit
- Publish button triggers confirmation
- Published postmortem shows read-only state

### End-to-End Verification

1. Send a test alert via `scripts/simulate-alert.sh`
2. Wait for triage pipeline to complete
3. Verify alert appears in Timeline page with correct type and severity
4. Resolve the alert via `POST /api/v1/incidents/:id/resolve`
5. Generate a postmortem from the resolved alert
6. Edit the postmortem sections, verify auto-save
7. Publish the postmortem
8. Verify it appears in the Postmortems list with "Published" badge

---

## Dependencies & Risks

| Risk                                                              | Impact                                        | Mitigation                                                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Timeline UNION query slow on large datasets                       | High latency on timeline page                 | Default 7d window, `(tenant_id, timestamp)` indexes on all three tables, `LIMIT`/`OFFSET` pagination                                                               |
| `events` and `analyses` tables lack `tenant_id` for older records | Missing items in timeline for early data      | `tenant_id` is nullable in these tables; the UNION query uses `WHERE tenant_id = $1` which filters out null rows. Backfill tenant_id on historical data if needed. |
| AI summary missing from triage result                             | Postmortem generation produces sparse content | Fallback to alert title/description with placeholder text; clearly indicated in the editor as needing manual input                                                 |
| Postmortem content schema evolves over time                       | Old records may have missing fields           | JSONB is flexible; `parseContent()` in helpers already applies safe defaults for missing fields. Add a `schemaVersion` field if migrations become complex.         |
| Editor auto-save race conditions                                  | Stale data overwriting newer edits            | Debounce at 2s, use `updated_at` for optimistic concurrency (reject if server `updated_at` > client's last known value)                                            |
| Nginx prefix matching for `/api/v1/postmortems` vs `/api/`        | Routes hitting wrong upstream                 | Place specific location blocks before the generic `/api/` catch-all (nginx uses first-match for prefix locations)                                                  |

---

## Implementation Order

Recommended sequence for minimal risk and incremental progress:

### Phase 1: Postmortem Backend (1-2 days)

1. Create `packages/shared/src/database/postmortem/repository.ts` and `index.ts`
2. Add barrel exports to `database/index.ts`
3. Create `services/incident-triage/src/services/postmortemGenerator.ts`
4. Create `services/incident-triage/src/routes/postmortemRoutes.ts`
5. Mount routes in `services/incident-triage/src/routes/index.ts`
6. Write unit tests for repository and generator
7. Test endpoints with curl

### Phase 2: Timeline Backend (1-2 days)

1. Create `packages/shared/src/database/timeline/` module (types, helpers, repository)
2. Add timeline handler (in `incidentRoutes.ts` or new `timelineRoutes.ts`)
3. Mount route, add barrel exports
4. Write unit tests for UNION query and row mapping
5. Test endpoint with curl, verify ordering across sources

### Phase 3: Nginx + Frontend Routing (0.5 day)

1. Add nginx proxy blocks for `/api/v1/timeline` and `/api/v1/postmortems`
2. Remove "Coming Soon" entries from sidebar and constants
3. Add route entries in `helpers.tsx`

### Phase 4: Frontend Pages (2-3 days)

1. Build `useTimelineData` and `usePostmortemData` hooks
2. Build `IncidentTimeline` page with filters and card list
3. Build `Postmortems` list page with generate dialog
4. Build `PostmortemEditor` page with auto-save
5. Write component tests

---

## Future Enhancements

These are explicitly out of scope for the initial implementation but documented for planning:

- **Export postmortem as PDF/Markdown** -- add download buttons to the editor page
- **Share via Slack** -- post postmortem summary to a channel using the slack-bot service
- **Knowledge Base ingestion** -- auto-ingest published postmortems as knowledge documents for RAG retrieval
- **Deployment events in timeline** -- requires a deployment tracking integration (Vercel/Netlify deploy hooks)
- **Timeline service name filter** -- filter by `service_name` field from incident alerts
- **Postmortem templates** -- customizable per-tenant templates for different incident types
- **Structured timeline within postmortem content** -- replace free-text timeline field with an array of timestamped events (matching the original design spec)
- **Collaborative editing** -- real-time multi-user editing with conflict resolution
