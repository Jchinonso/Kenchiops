# Dashboard Feature Roadmap

Feature planning document for the Kenchi CI/CD dashboard. Covers all features beyond the current MVP, grouped by priority tier with detailed breakdowns of scope, dependencies, and implementation requirements.

**Last updated:** 2026-02-15

---

## Current MVP State

The dashboard is live with the following capabilities:

| Page               | What it does                                                                                                                                   | Route                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Overview**       | Quick stat cards (Failed Builds, Analyses Run, Avg Resolution, Connected Repos), onboarding checklist, static "No recent activity" placeholder | `/dashboard`                |
| **CI/CD Failures** | Paginated table with Time, Repository, Check Name, Severity, Status, Commit columns. 20 rows per page.                                         | `/dashboard/cicd/failures`  |
| **CI/CD Analyses** | Paginated table with Time, Repository, Summary, Root Cause, Confidence columns. 20 rows per page.                                              | `/dashboard/cicd/analyses`  |
| **Pipelines**      | Repository cards showing name, visibility, default branch. Pulled from GitHub Installation API.                                                | `/dashboard/cicd/pipelines` |

**Infrastructure in place:**

- **Real-time SSE:** Backend publishes `new_failure` and `analysis_complete` events to Redis pub/sub. Frontend subscribes via `EventSource`, and increments a `refreshKey` that triggers data refetches in all hooks.
- **Cookie-based JWT auth:** GitHub OAuth login flow. Access and refresh tokens stored in httpOnly cookies. Token refresh with rotation detection.
- **Tenant scoping:** All database queries filter by `tenantId`. Users are linked to tenants via GitHub org membership during OAuth.
- **Internal auth:** HMAC-signed service-to-service requests via `signInternalRequest()` / `verifyInternalSignature()`. Used by github-app when calling the API service's `/api/analyze` endpoint.
- **UI framework:** shadcn/ui components, Tailwind CSS, Lucide icons, recharts (installed but unused), sonner toasts (installed but unused).

**Sidebar navigation structure** (sections marked "Coming Soon" render a placeholder component):

- Overview (live)
- CI/CD: Failures, Analyses, Pipelines (live)
- Incidents: Active, Timeline, Postmortems (coming soon)
- Infrastructure: IaC Reviews, Drift, Cost (coming soon)
- Deployments: Risk Scores, Rollouts (coming soon)
- Analytics (coming soon)
- Integrations (coming soon)
- Settings (coming soon)

---

## Tier 1: High Impact -- Build Next

These features address gaps that directly affect the core value proposition: understanding why CI failed and what to do about it.

---

### 1. Analysis Detail View

**What it does:** When a user clicks an analysis row in the Analyses table, they see the full analysis details -- root cause explanation, recommended actions list, affected files, confidence signal breakdown, and remediation steps. Displayed as either an expandable inline row or a slide-over panel.

**Why it matters:** The Analyses table currently shows only a truncated summary and root cause. The actual valuable data -- actionable remediation steps, affected file paths, confidence signal breakdown -- is stored in the database but never rendered. Users have to guess what to do next instead of seeing concrete instructions.

**Current state:**

- The `analyses` table stores `full_analysis` (JSONB), `confidence_signals` (JSONB), and `recommended_actions` (JSONB) columns.
- The `AnalysisRecord` type in `packages/shared/src/database/analysis/types.ts` exposes `fullAnalysis`, `confidenceSignals`, and `recommendedActions` fields.
- The frontend `AnalysisRecord` type in `services/frontend/src/hooks/useDashboardData.ts` already includes `fullAnalysis`, `confidenceSignals`, and `recommendedActions`.
- The `GET /api/v1/dashboard/analyses` endpoint already returns these fields in the response payload.
- **No frontend rendering exists** for any of this data.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | None -- data is already returned by the API.                                                                                                                                                                                                                                                      |
| **Frontend** | Add expandable row or `<Sheet>` panel component to `CICDAnalyses.tsx`. Parse and render `fullAnalysis` JSON structure (root cause detail, affected files, remediation steps). Render `recommendedActions` as a checklist. Render `confidenceSignals` as a breakdown (signal name + contribution). |
| **Database** | None.                                                                                                                                                                                                                                                                                             |

**Dependencies:** None -- all backend plumbing exists.

**Complexity:** **S** -- Pure frontend rendering work. The data is already flowing to the client.

**Implementation notes:**

- The `fullAnalysis` JSONB structure varies based on the LLM output format. Build the renderer defensively with fallbacks for missing fields.
- shadcn/ui's `Sheet` component (slide-over) or `Collapsible` (inline expand) are both available. Sheet is better for full analysis text; Collapsible is better for quick glance.
- Consider a tabbed layout inside the detail view: "Summary" | "Remediation" | "Confidence" to avoid information overload.

---

### 2. Failure-to-Analysis Linking

**What it does:** When a user clicks a failure row, the system shows the corresponding analysis (if one exists) or a "pending" indicator. Conversely, from an analysis detail view, the user can navigate back to the originating failure event.

**Why it matters:** The Failures and Analyses pages are currently disconnected. A user seeing a failure has no way to check whether Kenchi already diagnosed it without manually scanning the Analyses table. This breaks the core workflow: "my build failed, what went wrong?"

**Current state:**

- Analyses have an `aggregationKey` field in format `owner/repo:commitSha`. This key links an analysis to the repository and commit that triggered it.
- Failure events store `repository` and `headSha` in their `payload` JSONB column.
- The link can be reconstructed: `event.payload.repository + ":" + event.payload.headSha` should match `analysis.aggregationKey`.
- There is **no API endpoint** to fetch an analysis by aggregation key.
- There is **no UI** connecting failures to analyses.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | Add `GET /api/v1/dashboard/analyses/by-key?key=owner/repo:sha` endpoint. Add `getAnalysisByAggregationKey(key, tenantId)` to the analysis repository (query: `WHERE aggregation_key = $1 AND tenant_id = $2`). Add corresponding service method.                                                                                                              |
| **Frontend** | In the failure detail/expand view, construct the aggregation key from `payload.repository` and `payload.headSha`, then fetch the linked analysis. Show "Analysis pending..." with a spinner if no analysis exists yet (auto-refresh on `analysis_complete` SSE event). Show a summary card with confidence badge and "View full analysis" link if one exists. |
| **Database** | Add index: `CREATE INDEX idx_analyses_aggregation_key ON analyses(aggregation_key) WHERE aggregation_key IS NOT NULL;`                                                                                                                                                                                                                                        |

**Dependencies:** Feature 1 (Analysis Detail View) should be built first or concurrently, since this feature links to it.

**Complexity:** **M** -- New API endpoint, new repository query, new frontend component for the linked analysis card.

---

### 3. Overview Page with Real Data

**What it does:** Replaces the static "No recent activity" placeholder on the Overview page with live data: latest 5 failures, latest 5 analyses, week-over-week trend stats, and a confidence distribution summary.

**Why it matters:** The Overview page is the landing page after login. Currently it shows numbers in stat cards but the activity feed is empty. Users have to navigate to separate pages to see anything useful. A populated Overview page reduces clicks-to-insight from 2 to 0.

**Current state:**

- The Overview page renders four stat cards using `useDashboardStats()` which calls `GET /api/v1/dashboard/stats`. This returns `totalAnalyses`, `totalFailures`, `connectedRepos`.
- The "Avg Resolution" card always shows `--` (no backend support).
- The "Recent Activity" section is hardcoded to show "No recent activity" with an `<Activity>` icon.
- Existing endpoints return paginated data but there is no "recent activity" or "trend" endpoint.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | New endpoint: `GET /api/v1/dashboard/overview` returning `{ recentFailures, recentAnalyses, trends, confidenceDistribution }`. `recentFailures`: last 5 failures (reuse existing query with `limit=5`). `recentAnalyses`: last 5 analyses (reuse existing query with `limit=5`). `trends`: `{ failuresThisWeek, failuresLastWeek, percentChange }` (new SQL: count events where timestamp in current/previous 7-day window). `confidenceDistribution`: `{ high, medium, low }` counts (new SQL: count analyses grouped by confidence threshold buckets). |
| **Frontend** | Replace the static "Recent Activity" card with two mini-tables or card lists (failures + analyses). Add trend indicator (green down arrow / red up arrow + percentage) to the "Failed Builds" stat card. Add confidence distribution as a simple bar or donut.                                                                                                                                                                                                                                                                                           |
| **Database** | No schema changes. New queries only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Dependencies:** None.

**Complexity:** **M** -- One new endpoint with several aggregation queries. Frontend rendering of mini-tables and trend indicators.

**Implementation notes:**

- The trend SQL should use `DATE_TRUNC('week', ...)` or simple `timestamp >= NOW() - INTERVAL '7 days'` comparisons.
- Confidence distribution thresholds match the frontend constants: High >= 0.8, Medium >= 0.5, Low < 0.5 (defined in `CICDAnalyses.tsx` as `CONFIDENCE_THRESHOLDS`).

---

### 4. Fix the `--` Repository Column in Analyses

**What it does:** Ensures every analysis row in the Analyses table displays a repository name instead of `--`.

**Why it matters:** The Repository column is one of five columns in the Analyses table. When it shows `--`, users cannot tell which repository an analysis belongs to without reading the summary text. This makes the table significantly harder to scan.

**Current state:**

- The frontend extracts the repository from `analysis.aggregationKey` using `extractRepoFromKey()` in `CICDAnalyses.tsx`. This splits on `:` and takes the left half.
- Older analyses (pre-aggregationKey feature) have `aggregationKey: null`, causing the function to return `--`.
- The `fullAnalysis` JSONB column likely contains repository information but the structure is not standardized.
- There is no backfill migration for the `aggregation_key` column.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | **Option A (preferred):** Write a one-time backfill migration that extracts repository from `full_analysis` JSONB for rows where `aggregation_key IS NULL`. The JSONB path depends on what the LLM pipeline stores -- check `full_analysis->'repository'` or `full_analysis->'metadata'->'repository'`. **Option B (fallback):** If the JSONB structure is unreliable, extract repository from the linked event's `payload->'repository'` via the `event_id` foreign key. |
| **Frontend** | Update `extractRepoFromKey()` to fall back to `analysis.fullAnalysis.repository` (or similar) when `aggregationKey` is null.                                                                                                                                                                                                                                                                                                                                              |
| **Database** | Backfill migration: `UPDATE analyses SET aggregation_key = ... FROM events WHERE analyses.event_id = events.id AND analyses.aggregation_key IS NULL;`                                                                                                                                                                                                                                                                                                                     |

**Dependencies:** None.

**Complexity:** **S** -- One migration script + one frontend fallback. Main risk is understanding the `fullAnalysis` JSONB structure for older records.

**Implementation notes:**

- Before writing the migration, query a sample of older analyses to inspect `full_analysis` structure: `SELECT id, full_analysis->'repository', full_analysis->'metadata' FROM analyses WHERE aggregation_key IS NULL LIMIT 10;`
- The migration should be idempotent (`WHERE aggregation_key IS NULL`).

---

### 5. Inter-service Authentication

**What it does:** Ensures the github-app service can successfully call the API service's `/api/analyze` endpoint. Without this, new CI failures are detected by the github-app but the analysis never runs.

**Why it matters:** This is a **critical pipeline blocker**. The github-app receives webhook events and calls `POST /api/analyze` with `{ internalAuth: true }`. If the API service's auth middleware rejects these requests (HTTP 401), no new analyses are generated. The existing 289 analyses in the database were likely created before the JWT auth middleware was added to the API service.

**Current state:**

- The shared package has internal auth infrastructure: `signInternalRequest()` generates HMAC signatures, `verifyInternalSignature()` validates them, and `createInternalAuthMiddleware()` is an Express middleware that checks the signature headers.
- The github-app service passes `{ internalAuth: true }` to `httpClient` calls targeting the API (in `simplifiedAnalysis.ts` and `combinedAnalysis.ts`).
- The github-app's `index.ts` applies `createInternalAuthMiddleware()` to its own routes (for incoming internal calls).
- **Issue:** The API service's auth middleware likely rejects requests that don't have a valid JWT cookie but do have internal auth headers. The internal auth middleware and JWT auth middleware need to be composed so that internal service requests bypass JWT validation.
- The `INTERNAL_SERVICE_SECRET` environment variable must be set in both services.

**What needs to change:**

| Layer                    | Work                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend (API)**        | Ensure the API service's `/api/analyze` route (or a broader internal route group) applies `createInternalAuthMiddleware()` as an alternative authentication path. Requests with valid HMAC signatures should bypass JWT validation. This is typically done with a middleware chain: check internal auth first, fall through to JWT auth if no internal headers present. |
| **Backend (github-app)** | Verify `INTERNAL_SERVICE_SECRET` is configured in the github-app's environment. Verify the `httpClient` correctly signs outbound requests when `internalAuth: true`.                                                                                                                                                                                                    |
| **Infrastructure**       | Ensure `INTERNAL_SERVICE_SECRET` is set to the same value in both services' Docker Compose / environment configuration.                                                                                                                                                                                                                                                 |
| **Database**             | None.                                                                                                                                                                                                                                                                                                                                                                   |

**Dependencies:** None -- but this blocks the entire analysis pipeline for new failures.

**Complexity:** **S** -- The signing/verification infrastructure already exists in `@kenchi/shared`. The work is wiring the middleware correctly on the API service side and ensuring environment variables are aligned.

**Implementation notes:**

- Check the API service's `index.ts` or `routes/index.ts` for how auth middleware is applied. The `/api/analyze` endpoint in `routes/analysisRoutes.ts` is the target.
- The pattern should be: `router.post("/api/analyze", internalAuthOrJwt, handler)` where `internalAuthOrJwt` tries internal HMAC first, then falls through to JWT.
- Test by triggering a real GitHub webhook (push to a monitored repo) and checking that the analysis pipeline completes end-to-end.

---

## Tier 2: Medium Impact -- Polish and Usability

These features improve the day-to-day experience for users who are already getting value from the core pipeline.

---

### 6. Filtering and Search

**What it does:** Adds filtering controls to the Failures and Analyses tables: repository dropdown, date range picker, severity filter, confidence level filter. Makes the header search bar functional for full-text search across summaries and root causes.

**Why it matters:** With hundreds of failures and analyses, users need to narrow results. A team lead investigating a specific repository's flakiness should not have to paginate through every failure across all repos. The search bar in the header is currently a non-functional placeholder -- users expect it to work.

**Current state:**

- The Failures endpoint (`GET /api/v1/dashboard/failures`) accepts only `limit` and `offset` query parameters.
- The Analyses endpoint (`GET /api/v1/dashboard/analyses`) accepts only `limit` and `offset`.
- The header search input in `Dashboard.tsx` is decorative (no `onChange` handler, no state management).
- No repository dropdown data source (the Pipelines page fetches repos from GitHub API, not from a stored list).

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | Add query parameter support to both endpoints: `repository` (string, optional), `severity` (string, optional, failures only), `minConfidence` / `maxConfidence` (number, optional, analyses only), `since` / `until` (ISO timestamp, optional), `search` (string, optional -- text search). Update SQL queries to add `WHERE` clauses dynamically. For text search: `WHERE (summary ILIKE $X OR identified_cause ILIKE $X)` for analyses, `WHERE payload->>'repository' ILIKE $X` for failures. |
| **Frontend** | Add filter bar component above each table: repository `<Select>`, date range (preset buttons: 24h/7d/30d + custom `<Calendar>`), severity `<Select>` (failures), confidence `<Select>` (analyses). Wire header search input to a debounced state that passes `search` param to the active table's hook. Update `useFetch` hooks to accept filter parameters.                                                                                                                                    |
| **Database** | Consider adding GIN index on `analyses.summary` and `analyses.identified_cause` for ILIKE performance if dataset grows large. For now, ILIKE on a few hundred rows is fine.                                                                                                                                                                                                                                                                                                                     |

**Dependencies:** None.

**Complexity:** **L** -- Touches both backend query building and frontend filter state management. Multiple filter types, debounced search, URL state synchronization.

**Implementation notes:**

- Use URL search params (`useSearchParams`) to persist filter state across navigation. This also enables shareable filtered URLs.
- The repository dropdown should be populated from the Pipelines API (`GET /api/v1/dashboard/repositories`) to show only connected repos.
- Date range presets (Last 24h, Last 7 days, Last 30 days) are the 80/20 solution. Custom range picker can come later.

---

### 7. Expandable Row Details

**What it does:** Click a failure row to inline-expand and see: check run log snippets, linked analysis status (with link to full analysis), commit details (SHA, message, author). Click an analysis row to expand and see: full recommended actions list, confidence signal breakdown, related files.

**Why it matters:** Currently both tables are flat -- clicking a row does nothing. Users have to mentally correlate data across two separate pages. Inline expansion provides the most common detail without full page navigation.

**Current state:**

- Table rows are not interactive (no `onClick`, no cursor change).
- The shadcn/ui `Collapsible` component is available.
- Failure event payloads contain `repository`, `checkName`, `conclusion`, `headSha`, and potentially log snippets depending on the webhook event type.
- Analysis records contain `fullAnalysis`, `recommendedActions`, and `confidenceSignals`.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | May need a `GET /api/v1/dashboard/failures/:id` endpoint for fetching full event payload (currently only list endpoint exists). Analysis detail data is already in the list response.                                                                                                                               |
| **Frontend** | Add expandable row state management to both tables. Render a detail panel below the clicked row. For failures: show payload fields in a structured layout + linked analysis indicator (requires Feature 2). For analyses: render `recommendedActions`, `confidenceSignals`, first few paragraphs of `fullAnalysis`. |
| **Database** | None.                                                                                                                                                                                                                                                                                                               |

**Dependencies:** Feature 1 (Analysis Detail View) and Feature 2 (Failure-to-Analysis Linking) enhance this feature but are not strictly required. The expandable row can render available data independently.

**Complexity:** **M** -- Frontend state management for row expansion, conditional rendering of detail panels, potential new API endpoint for single failure detail.

**Implementation notes:**

- Use an accordion pattern where only one row can be expanded at a time.
- Consider lazy-loading the detail data (fetch on expand) rather than including full payloads in the list response. This keeps the list endpoint fast.
- Add `cursor-pointer` and hover state to table rows to indicate interactivity.

---

### 8. Toast Notifications from SSE

**What it does:** When an SSE event arrives, display a visible toast notification instead of silently refetching data. Examples: "New failure detected in kenchiops/python-test-repo" or "Analysis complete for kenchiops/rust-test-repo -- 85% confidence."

**Why it matters:** The current SSE implementation updates data invisibly. A user looking at the Overview page has no indication that new data arrived unless they notice the stat cards change. Toast notifications create awareness and urgency -- especially important for failure events.

**Current state:**

- The `useDashboardSSE` hook in `services/frontend/src/hooks/useDashboardSSE.ts` listens for `new_failure` and `analysis_complete` events but only increments a `refreshKey` counter.
- The SSE event payload includes `type` and likely `tenantId`, `repository`, and other contextual data.
- sonner is installed (`services/frontend/src/components/ui/sonner.tsx` exists, `sonner` is in `package.json`).
- The `<Toaster>` component is not rendered anywhere in the app tree.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | Ensure SSE event payloads include enough context for a useful toast message: `repository`, `checkName` (for failures), `confidence` (for analyses). Check the Redis publish call in the github-app/API service to verify payload shape.                                                                                    |
| **Frontend** | Add `<Toaster />` from sonner to the app layout (in `Dashboard.tsx` or `App.tsx`). Update `useDashboardSSE` to parse event data and call `toast()` or `toast.info()` with a formatted message. Differentiate toast styles: destructive/red for failures, success/green for high-confidence analyses, info/blue for others. |
| **Database** | None.                                                                                                                                                                                                                                                                                                                      |

**Dependencies:** None.

**Complexity:** **S** -- sonner is already installed and the SSE hook already receives events. Main work is parsing event payloads and formatting messages.

**Implementation notes:**

- Keep toast messages concise: max 2 lines. Use the toast `action` prop to add a "View" button that navigates to the relevant page.
- Add a user preference (localStorage) to mute toast notifications. Some users may find them distracting during active debugging sessions.
- The `<Toaster>` component should be positioned at `bottom-right` to avoid covering the sidebar or header.

---

### 9. Confidence Trend Chart

**What it does:** A line chart or area chart on the Overview or Analytics page showing average analysis confidence over time, bucketed by day or week. Helps teams see if their CI stability is improving or degrading.

**Why it matters:** Individual analysis confidence scores are useful for one-off debugging, but the trend is what tells engineering leadership whether their investment in CI stability is paying off. A declining confidence trend signals systemic issues that individual analyses cannot surface.

**Current state:**

- recharts is installed (`services/frontend/src/components/ui/chart.tsx` wraps recharts with shadcn/ui theming).
- No time-series data endpoint exists.
- Confidence data exists per-analysis in the `diagnosis_confidence` column.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | New endpoint: `GET /api/v1/dashboard/trends/confidence?bucket=day&since=2026-01-01`. SQL: `SELECT DATE_TRUNC('day', created_at) AS bucket, AVG(diagnosis_confidence) AS avg_confidence, COUNT(*) AS count FROM analyses WHERE tenant_id = $1 AND created_at >= $2 GROUP BY bucket ORDER BY bucket;` Return array of `{ date, avgConfidence, count }`. |
| **Frontend** | Add a `<ConfidenceTrendChart>` component using the shadcn chart wrapper (recharts underneath). Render as an area chart with date on X-axis, confidence (0-100%) on Y-axis. Add bucket toggle (daily/weekly). Show the chart on the Overview page (below stats) or on the Analytics page.                                                              |
| **Database** | No schema changes. The existing `idx_analyses_created_at` and `idx_analyses_tenant` indexes support this query.                                                                                                                                                                                                                                       |

**Dependencies:** Feature 3 (Overview with Real Data) if placing the chart on the Overview page.

**Complexity:** **M** -- New API endpoint with time-bucket aggregation, new chart component with bucket toggle and responsive layout.

**Implementation notes:**

- Start with a 30-day window, daily buckets. Weekly buckets are useful for longer time ranges.
- Use the recharts `ResponsiveContainer` for proper resizing.
- The chart wrapper in `components/ui/chart.tsx` provides theming -- use it rather than raw recharts.

---

### 10. Repository Dashboard

**What it does:** A per-repository detail page accessible from the Pipelines page. Shows failure frequency, most common root causes, flaky test detection, mean time between failures, and recent failures/analyses filtered to that repository.

**Why it matters:** Different repositories have different health profiles. A monorepo with 50 CI jobs has different patterns than a small library repo. Per-repo dashboards let teams focus on their specific codebase without noise from other projects.

**Current state:**

- The Pipelines page shows repository cards that link to GitHub (external). No internal repository detail page exists.
- The `flake_records` table exists in the database with `repository`, `test_name`, `flake_probability`, `occurrences`, and `passes_after_rerun` columns.
- Failure events store `repository` in the `payload` JSONB column.
- No backend endpoint filters failures or analyses by repository.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | New endpoint group: `GET /api/v1/dashboard/repositories/:repo/stats` returning `{ failureCount, analysisCount, avgConfidence, flakeCount, meanTimeBetweenFailures }`. New endpoint: `GET /api/v1/dashboard/repositories/:repo/top-causes` returning top 5 `identified_cause` values by frequency. New endpoint: `GET /api/v1/dashboard/repositories/:repo/flakes` returning flake records for the repo from the `flake_records` table. Reuse existing failures/analyses endpoints with added `repository` filter (from Feature 6). |
| **Frontend** | New route: `/dashboard/cicd/pipelines/:repo`. New `RepositoryDashboard` page component with: stat cards, top causes list, flaky tests table, recent failures/analyses mini-tables. Update repo cards on the Pipelines page to link internally instead of to GitHub (keep GitHub external link as secondary).                                                                                                                                                                                                                       |
| **Database** | No schema changes. Queries against `flake_records` table by `repository` column (already indexed via `idx_flake_records_repo`).                                                                                                                                                                                                                                                                                                                                                                                                    |

**Dependencies:** Feature 6 (Filtering) for the repository-scoped failures/analyses queries.

**Complexity:** **L** -- Multiple new endpoints, a new page with several data sections, routing changes.

**Implementation notes:**

- The `:repo` parameter format should be URL-encoded `owner/name` (e.g., `kenchiops%2Fpython-test-repo`). Decode server-side.
- Mean time between failures: `SELECT AVG(gap) FROM (SELECT timestamp - LAG(timestamp) OVER (ORDER BY timestamp) AS gap FROM events WHERE payload->>'repository' = $1 AND type = 'CICD_FAILURE') t WHERE gap IS NOT NULL;`
- Top root causes: `SELECT identified_cause, COUNT(*) FROM analyses WHERE aggregation_key LIKE $1 || ':%' GROUP BY identified_cause ORDER BY count DESC LIMIT 5;`

---

## Tier 3: Lower Priority -- Long Tail

Features that improve polish and operational visibility but do not directly impact the core value loop.

---

### 11. Pagination Improvements

**What it does:** Enhances table pagination with: page size selector (10/20/50/100), jump-to-page input, "Showing X-Y of Z" display, and remembered page size preference.

**Why it matters:** The current pagination shows "Page X of Y" with Prev/Next buttons. Users with hundreds of records want to jump to specific pages and control density. These are standard UX expectations for data tables.

**Current state:**

- Both tables use `PAGE_SIZE = 20` (hardcoded constant).
- Pagination state is managed with `useState(0)` for offset.
- No page size persistence.
- No jump-to-page UI.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | Already supports arbitrary `limit` and `offset` via query parameters. No changes needed.                                                                                                                                                                                                                       |
| **Frontend** | Extract a shared `<TablePagination>` component (currently duplicated between `CICDFailures.tsx` and `CICDAnalyses.tsx`). Add page size `<Select>` with options [10, 20, 50, 100]. Add "Showing X-Y of Z" text. Add jump-to-page input (number input + Enter to navigate). Persist page size in `localStorage`. |
| **Database** | None.                                                                                                                                                                                                                                                                                                          |

**Dependencies:** None.

**Complexity:** **S** -- Frontend-only. The pagination component is simple and the backend already supports it.

---

### 12. Dark Mode

**What it does:** Adds a dark color scheme toggle. All UI elements switch to dark backgrounds with light text. Preference persists across sessions.

**Why it matters:** Many developers work in dark IDEs and terminals. A bright white dashboard is visually jarring and causes eye strain during long debugging sessions, especially at night.

**Current state:**

- Tailwind CSS is configured. shadcn/ui components ship with dark mode class variants.
- No dark mode toggle exists in the UI.
- No `dark` class is applied to the `<html>` element.
- All current styles use hardcoded light colors (e.g., `bg-white`, `text-gray-900`).

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | None.                                                                                                                                                                                                                                                                                                |
| **Frontend** | Add `darkMode: "class"` to Tailwind config (if not already set). Add a theme toggle button in the header or settings. Add `dark:` variant classes to all custom components (sidebar, header, stat cards, tables). Persist preference in localStorage. Apply/remove `dark` class on `<html>` element. |
| **Database** | None.                                                                                                                                                                                                                                                                                                |

**Dependencies:** None.

**Complexity:** **M** -- Every custom-styled component needs `dark:` variants. shadcn/ui components handle it natively, but the dashboard shell, sidebar, stat cards, and custom badges all need updates.

---

### 13. CSV Export

**What it does:** Download failures or analyses as a CSV file. An "Export" button appears in each table header.

**Why it matters:** Teams often need to share CI data with stakeholders who do not have Kenchi accounts, or import data into spreadsheets for custom analysis. CSV is the universal interchange format.

**Current state:**

- No export functionality exists.
- The backend returns JSON only.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | Add `Accept: text/csv` header support to the failures and analyses endpoints (or separate `/export` endpoints). For large datasets: stream CSV rows directly from the database cursor to the response, avoiding loading all rows into memory. Set `Content-Disposition: attachment; filename="failures-2026-02-15.csv"` header. |
| **Frontend** | Add "Export CSV" button to each table's header area. For small datasets (< 500 rows): generate CSV client-side from the already-fetched data. For large datasets: trigger a download via the backend CSV endpoint. Show a loading indicator during download.                                                                    |
| **Database** | None.                                                                                                                                                                                                                                                                                                                           |

**Dependencies:** Feature 6 (Filtering) -- users should be able to export filtered results, not just all data.

**Complexity:** **M** -- Backend CSV streaming for large datasets, content negotiation or separate endpoints, frontend download trigger.

---

### 14. Webhook Activity Log

**What it does:** A debug view showing raw webhook deliveries: timestamp, event type, repository, GitHub delivery ID, processing status (processed/skipped/failed). Useful for troubleshooting why a failure was not detected or why an analysis was not triggered.

**Why it matters:** When something goes wrong in the pipeline ("I pushed but Kenchi didn't analyze it"), users need visibility into the webhook processing layer. Without this, debugging requires backend log access.

**Current state:**

- Webhook events are processed by the github-app service. Successfully processed events create rows in the `events` table.
- Failed or skipped webhooks are only visible in structured logs (not accessible to dashboard users).
- The `tenant_audit_log` table exists but is intended for tenant lifecycle events, not webhook delivery tracking.
- There is no webhook delivery tracking table.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | New table: `webhook_deliveries` with columns: `id`, `tenant_id`, `provider` (github/slack), `event_type`, `delivery_id`, `repository`, `status` (received/processed/skipped/failed), `error_message`, `processing_duration_ms`, `created_at`. Insert a row for every incoming webhook, update status after processing. New endpoint: `GET /api/v1/dashboard/webhooks` with pagination and filtering. |
| **Frontend** | New page or tab under Settings: "Webhook Activity" table with columns: Time, Provider, Event Type, Repository, Delivery ID, Status, Duration. Color-code status badges.                                                                                                                                                                                                                              |
| **Database** | New `webhook_deliveries` table with indexes on `tenant_id`, `created_at`, `status`. TTL cleanup job to purge rows older than 30 days.                                                                                                                                                                                                                                                                |

**Dependencies:** None, but Feature 5 (Inter-service Auth) should be fixed first since webhook processing depends on it.

**Complexity:** **L** -- New database table, write path in the webhook handler, new API endpoints, new frontend page.

---

### 15. Settings Page

**What it does:** A settings hub for managing: GitHub App installation status, Slack workspace connection, notification preferences, team members (invite by email, role management), and API keys for programmatic access.

**Why it matters:** Currently, all configuration happens outside the dashboard (GitHub App marketplace, Slack App directory). Users cannot see their integration status, manage team access, or configure notification preferences without contacting support.

**Current state:**

- The sidebar has a "Settings" link pointing to `/dashboard/settings`, which renders the generic "Coming Soon" placeholder via `ComingSoon.tsx`.
- Tenant data in the database includes GitHub and Slack connection status.
- The `installation_settings` table stores notification preferences.
- The `users` table supports roles (`member`, `admin`) and tenant linkage.
- The `GET /api/v1/dashboard/tenant` endpoint returns basic tenant info including connection status.

**What needs to change:**

| Layer        | Work                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | New endpoints: `GET /api/v1/settings/integrations` (GitHub + Slack status), `PUT /api/v1/settings/notifications` (update notification prefs), `GET /api/v1/settings/team` (list team members), `POST /api/v1/settings/team/invite` (send invite email), `DELETE /api/v1/settings/team/:userId` (remove member), `POST /api/v1/settings/api-keys` (generate API key), `GET /api/v1/settings/api-keys` (list keys). |
| **Frontend** | New `Settings` page with tabbed layout: "Integrations", "Notifications", "Team", "API Keys". Integrations tab: show connection status cards with action buttons (install/reconnect). Notifications tab: toggle switches for event types. Team tab: member list with role badges + invite form. API Keys tab: key list with create/revoke actions.                                                                 |
| **Database** | New `api_keys` table: `id`, `tenant_id`, `name`, `key_hash`, `last_used_at`, `created_at`, `revoked_at`. New `team_invites` table (or use email-based invite flow with the existing `users` table).                                                                                                                                                                                                               |

**Dependencies:** Multiple backend systems. This is effectively a mini-product within the dashboard.

**Complexity:** **L** -- Multiple new endpoints, new database tables, complex frontend forms, invite email system, API key generation.

---

## Feature Dependency Graph

```
Feature 5 (Inter-service Auth) -----> Unblocks entire analysis pipeline
                                       (no dependencies, do first)

Feature 1 (Analysis Detail View) ---> Feature 2 (Failure-Analysis Linking)
                                   \-> Feature 7 (Expandable Row Details)

Feature 4 (Fix Repository Column) --> Standalone

Feature 3 (Overview Real Data) ------> Feature 9 (Confidence Trend Chart)

Feature 6 (Filtering & Search) ------> Feature 10 (Repository Dashboard)
                                    \-> Feature 13 (CSV Export)

Feature 8 (Toast Notifications) -----> Standalone

Feature 11 (Pagination) -------------> Standalone
Feature 12 (Dark Mode) --------------> Standalone
Feature 14 (Webhook Activity Log) ---> Standalone
Feature 15 (Settings Page) ----------> Standalone
```

---

## Suggested Build Order

Based on dependencies, impact, and complexity:

| Phase       | Features                                                             | Rationale                                                                                                     |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | 5 (Inter-service Auth), 4 (Fix Repo Column), 8 (Toast Notifications) | Unblock the pipeline, fix broken data, and add user awareness. All size S. High impact per effort.            |
| **Phase 2** | 1 (Analysis Detail View), 3 (Overview Real Data)                     | Show the valuable data that already exists. Users can see full analysis details and a populated landing page. |
| **Phase 3** | 2 (Failure-Analysis Linking), 7 (Expandable Rows)                    | Connect the two data views. Failures link to analyses and rows expand inline.                                 |
| **Phase 4** | 6 (Filtering & Search), 11 (Pagination Improvements)                 | Polish the data browsing experience. Users can find specific data quickly.                                    |
| **Phase 5** | 9 (Confidence Trend Chart), 10 (Repository Dashboard)                | Analytics and per-repo views. Requires trend data and repository-scoped queries.                              |
| **Phase 6** | 12 (Dark Mode), 13 (CSV Export), 14 (Webhook Log), 15 (Settings)     | Polish, operational tooling, and configuration management.                                                    |

---

## Complexity Summary

| Size              | Features           | Estimated Scope                                        |
| ----------------- | ------------------ | ------------------------------------------------------ |
| **S** (1-2 days)  | 1, 4, 5, 8, 11     | Pure frontend, single endpoint, or middleware wiring   |
| **M** (3-5 days)  | 2, 3, 7, 9, 12, 13 | New endpoint + frontend component, moderate query work |
| **L** (1-2 weeks) | 6, 10, 14, 15      | Multiple endpoints, new DB tables, complex frontend    |

---

## Technical Notes

**Shared infrastructure already available (no need to build):**

- sonner toast library -- installed, `components/ui/sonner.tsx` exists, just needs `<Toaster />` in the layout
- recharts -- installed, `components/ui/chart.tsx` provides shadcn-themed wrapper
- shadcn/ui `Sheet`, `Collapsible`, `Accordion`, `Select`, `Calendar` components -- all available
- Internal auth (`signInternalRequest` / `createInternalAuthMiddleware`) -- implemented in `@kenchi/shared/http`
- `flake_records` table -- schema exists with `repository`, `test_name`, `flake_probability`, already indexed

**Database columns already on analyses table (just not displayed):**

- `full_analysis` (JSONB) -- complete LLM analysis output
- `confidence_signals` (JSONB) -- per-signal confidence breakdown
- `recommended_actions` (JSONB) -- actionable remediation steps
- `aggregation_key` (VARCHAR) -- `owner/repo:sha` format, links to failures
- `model_version_id` (VARCHAR) -- tracks which LLM model version produced the analysis
