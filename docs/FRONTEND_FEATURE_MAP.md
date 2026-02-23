# Kenchi Frontend Feature Map

## Overview

Mapping Kenchi's backend capabilities to a CodeAnt.ai-inspired frontend dashboard.

---

## Kenchi Backend Capabilities Summary

### Services Architecture

| Service     | Port | Purpose                                         |
| ----------- | ---- | ----------------------------------------------- |
| API Service | 3000 | Central AI analysis, job management, risk rules |
| Slack Bot   | 3001 | Slack notifications and interactions            |
| GitHub App  | 3002 | Webhook processing, PR comments                 |

### Key API Endpoints

#### Analysis & Jobs

- `POST /api/analyze` - Submit CI failure for analysis (returns job_id)
- `GET /api/jobs/:id` - Get job status and results
- `POST /events` - Event ingestion

#### Risk Management

- `GET /api/risk-rules` - List custom risk rules
- `POST /api/risk-rules` - Create risk rule
- `PATCH /api/risk-rules/:id` - Update risk rule
- `DELETE /api/risk-rules/:id` - Delete risk rule
- `GET /api/risk-assessments` - Audit trail

#### RAG System

- `POST /rag/search` - Semantic search knowledge base
- `GET /rag/health` - RAG system health
- `GET /rag/drift` - Quality drift detection
- `GET /rag/costs` - Cost metrics

#### System

- `GET /health` - Service health status
- `GET /live` - Liveness probe
- `GET /ready` - Readiness probe

### Core Data Models

#### LLMAnalysisResult

```typescript
{
  eventId: string;
  summary: string;
  identifiedCause?: string;
  impactAssessment?: ImpactAssessment;
  confidence?: "very_low" | "low" | "medium" | "high" | "very_high";
  confidenceScore?: number; // 0-1
  reasoning?: string;
  recommendedActions?: LLMRecommendedAction[];
  uncertainties?: string[];
  evidenceUsed?: EvidenceReference[];
  relatedIncidents?: string[];
  nextSteps?: string[];
  analyzedAt: string;
  llmModel?: string;
  processingTime?: number;
}
```

#### Confidence Score Breakdown

```typescript
{
  finalScore: number;
  breakdown: {
    baseScore: number;
    raw: FactorValues;
    bounded: FactorValues;
    weighted: FactorValues;
    totals: ScoreTotals;
  };
  reasoning: string[];
  gatingDecision: "auto_approve" | "require_approval" | "block";
}
```

#### Risk Rule

```typescript
{
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  actionTypes: string[];
  environment?: "production" | "staging" | "development";
  blastRadius?: "isolated" | "service" | "system" | "organization";
  reversibility?: "fully" | "partially" | "not_reversible";
  dataImpact?: "none" | "readonly" | "readwrite" | "destructive";
  scoreModifier?: number;
  enabled: boolean;
  priority: number;
}
```

---

## Authentication & Multi-tenancy

### Auth Flow

| Route              | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `/login`           | Email/password or OAuth entry point                              |
| `/login/github`    | GitHub OAuth callback (primary flow — users already have GitHub) |
| `/signup`          | Org creation + first admin user                                  |
| `/forgot-password` | Password reset flow                                              |

### Session Management

- JWT access tokens (short-lived, 15min) + refresh tokens (HTTP-only cookie, 7d)
- On 401 response: silent refresh attempt, then redirect to `/login`
- Store access token in memory (not localStorage) to prevent XSS exfiltration

### Multi-tenancy

- `tenantId` derived from the authenticated org — never exposed in URL or user input
- Org switcher in sidebar header for users belonging to multiple orgs
- All API calls include `Authorization: Bearer <token>` — backend extracts `tenantId` from token claims

### Role-Based Access

| Role       | Capabilities                                                    |
| ---------- | --------------------------------------------------------------- |
| **Admin**  | Full access: risk rules, integrations, team management, billing |
| **Member** | View analyses, submit manual analyses, search knowledge base    |
| **Viewer** | Read-only access to dashboards and analysis results             |

---

## Onboarding Flow (First-Time Setup)

After signup, guide users through a 3-step wizard before reaching the dashboard:

### Step 1: Install GitHub App

- "Install Kenchi on GitHub" button → GitHub App installation flow
- Repo selection (all repos or specific repos)
- Callback confirms installation, stores `installation_id`

### Step 2: Connect Slack

- "Add to Slack" button → Slack OAuth flow
- Channel selection for notifications
- Test message sent to confirm connection

### Step 3: First Analysis

- Auto-detect recent CI failures from connected repos
- Or: paste a failure log manually
- Show analysis results with guided explanation of confidence scoring

**Skip option:** Users can skip steps 2-3 and complete later from Settings.

---

## Frontend Feature Mapping

### Public Landing Page (CodeAnt.ai Style)

#### 1. Hero Section

**CodeAnt Style:** Animated code editor with security scanning visualization
**Kenchi Content:**

- Headline: "AI-Powered DevOps Intelligence"
- Subheadline: "Automatically analyze CI/CD failures, identify root causes, and get actionable fixes"
- CTA: "Get Started Free" / "View Demo"
- Animation: CI failure log being analyzed with root cause highlighted

#### 2. Trust Badges

**CodeAnt Style:** "Trusted by Startups to Fortune 500"
**Kenchi Content:**

- GitHub integration badge
- Slack integration badge
- OpenAI-powered badge

#### 3. Feature Cards (4 pillars)

| CodeAnt Feature   | Kenchi Equivalent         | Description                                                        |
| ----------------- | ------------------------- | ------------------------------------------------------------------ |
| AI Code Review    | **CI Failure Analysis**   | Automatic analysis of failed builds with root cause identification |
| AI Code Security  | **Risk Assessment**       | Context-aware risk scoring for actions with custom rule engine     |
| AI Code Quality   | **RAG-Enhanced Analysis** | Learn from historical fixes and suggest proven solutions           |
| Developer Metrics | **Confidence Scoring**    | Transparent confidence metrics with factor breakdown               |

#### 4. Stats Section

**CodeAnt:** "500K+ Issues Auto Resolved"
**Kenchi:**

- Analyses Processed
- Mean Time to Resolution (MTTR)
- Confidence Score Accuracy
- Knowledge Base Documents

#### 5. How It Works

**Steps:**

1. **Connect** - GitHub App + Slack integration
2. **Monitor** - CI failures trigger automatic analysis
3. **Analyze** - AI identifies root cause with confidence scoring
4. **Act** - Get actionable fixes with safety gating

#### 6. Dashboard Preview

**CodeAnt Style:** Embedded product screenshots showing real UI
**Kenchi Content:**

- Interactive screenshot carousel of the dashboard
- 3 screenshots: Dashboard home, Analysis results with confidence breakdown, Risk rules editor
- Subtle browser chrome frame around screenshots
- Optional: "Try the demo" link to a sandbox instance with sample data

#### 7. Integration Showcase

**Git providers:** GitHub (GitLab/Bitbucket future)
**Notification:** Slack (Teams/Discord future)
**Monitoring:** CloudWatch, Datadog, PagerDuty (planned)

- Display as a logo grid (not just text badges)
- Animated fade-in on scroll

#### 8. Pricing Section

| Plan           | Price       | Target           | Key Features                                                    |
| -------------- | ----------- | ---------------- | --------------------------------------------------------------- |
| **Starter**    | Free        | Individual / OSS | 50 analyses/mo, 1 repo, community Slack                         |
| **Team**       | $29/seat/mo | Small teams      | Unlimited analyses, 10 repos, Slack integration, risk rules     |
| **Enterprise** | Custom      | Large orgs       | Unlimited repos, SSO/SAML, dedicated support, SLA, custom rules |

- Feature comparison table below cards
- "Start free" CTA on Starter, "Contact sales" on Enterprise
- FAQ accordion below pricing (billing cycle, seat definition, overages)

#### 9. Footer

**Layout:** 4-column grid

| Column 1 (Brand) | Column 2 (Product) | Column 3 (Resources) | Column 4 (Company) |
| ---------------- | ------------------ | -------------------- | ------------------ |
| Logo + tagline   | Features           | Docs                 | About              |
| Social links     | Pricing            | Blog                 | Careers            |
|                  | Integrations       | Changelog            | Contact            |
|                  | Status page        | API Reference        | Privacy/Terms      |

---

### Dashboard (Authenticated)

#### Sidebar Navigation

```
📊 Dashboard
🔗 Repositories
   ├── Connected Repos
   └── Add Repository
🔍 Analysis
   ├── New Analysis
   ├── Job History
   └── PR Analysis View
📚 Knowledge Base
   ├── Search
   ├── Documents
   └── Health
⚠️ Risk Management
   ├── Risk Rules
   ├── Assessments
   └── Settings
🔔 Notifications
   ├── Activity Feed
   ├── Slack Config
   └── GitHub Config
👥 Team
   ├── Members
   └── Roles
⚙️ Settings
   ├── Integrations
   ├── System Health
   └── Org Settings
```

#### 1. Dashboard Home (Control Center)

**CodeAnt-inspired:** Single view across all repositories showing overall health

**Top Row — Key Metrics (4 stat cards):**

- Total Analyses (this week) with trend arrow
- Mean Confidence Score (across all analyses) with sparkline
- Open CI Failures (unresolved) with severity breakdown
- MTTR (Mean Time to Resolution) with week-over-week delta

**Middle Row — Activity & Trends:**

- CI Failure Trend (line chart, last 30 days, by repo)
- Confidence Score Distribution (donut chart: very high / high / medium / low)
- Recent PR Activity Feed (last 10 PRs with failure/pass status, deep-linked)

**Bottom Row — System & Knowledge:**

- System Health Status (from `/health`, `/ready`) — service cards with green/amber/red
- Knowledge Base Stats (doc count, drift status, cache hit rate)
- Active Risk Rules Summary (count by environment, recently triggered)

#### 2. Analysis Module

**New Analysis Page:**

- Form: Repository, Commit SHA, Failure Log (textarea), PR Context
- Submit → `POST /api/analyze` → Get `job_id`
- Real-time status via SSE/WebSocket (see Real-time Updates section)
- Fallback: poll `GET /api/jobs/:id` every 3s with exponential backoff
- Display: Skeleton loader → Progressive result rendering as chunks complete

**Job History Page:**

- Table: Job ID, Repository, Status, Created At, Actions
- Filters: Status, Date Range, Repository
- Pagination

**Results Detail Page:**

- Summary Card
- Root Cause (highlighted)
- Confidence Score with visual indicator
- Factor Breakdown (expandable)
- Recommended Actions (with approval status)
- Evidence Used
- Related Incidents

**PR Analysis View (Primary Interface):**
Kenchi's core value is CI failure analysis tied to PRs. This view groups analyses by PR context:

- List of PRs with failed CI, sorted by recency
- Each PR card shows: repo, PR title, branch, failure count, latest confidence score
- Expand → timeline of CI runs with pass/fail indicators
- Click run → full analysis result detail
- Deep link: `/analysis/pr/:owner/:repo/:prNumber` (shareable)

#### 2b. Repository Management

**Connected Repos Page:**

- Table: Repo name, owner, connected date, total analyses, last failure
- Status indicator: active / paused / errored
- Actions: Pause monitoring, remove repo, view analyses

**Add Repository Page:**

- List of repos from GitHub App installation (auto-populated)
- Toggle to enable/disable monitoring per repo
- Per-repo settings: auto-analyze on failure (on/off), notification channel override

#### 3. Knowledge Base (RAG)

**Search Page:**

- Search input with filters (doc type, repository)
- Results with similarity scores
- Feedback buttons (helpful/not helpful)

**Documents Page:**

- List of ingested documents
- Type badges (runbook, postmortem, PR fix, etc.)
- Similarity scores
- Actions: View, Delete

**Health Page:**

- RAG System Health Status
- Drift Detection Results
- Cache Statistics
- Cost Metrics (estimated spend, tier)

#### 4. Risk Management

**Risk Rules Page:**

- Table: Name, Action Types, Environment, Priority, Enabled
- CRUD operations
- Toggle enable/disable
- Filter by environment/action type

**Rule Editor:**

- Form with all risk rule fields
- Action type multi-select
- Environment selector
- Blast radius, reversibility, data impact selectors
- Threshold sliders

**Assessments Page:**

- Audit trail of risk assessments
- Filter by action type, date
- Export to CSV

#### 5. Notification Center

**Activity Feed (In-App):**

- Real-time feed of events: new analyses, completed jobs, risk rule triggers
- Filter by type, repository, severity
- Mark as read / dismiss
- Bell icon in top nav with unread count badge

**Slack Configuration:**

- Connected workspace display
- Channel mapping: which events go to which channel
- Test notification button
- Disconnect option

**GitHub Configuration:**

- Installed repos and permissions display
- PR comment preferences: always / only on failure / never
- Check run behavior: required vs optional

#### 6. Team Management

**Members Page:**

- Table: Name, email, role, joined date, last active
- Invite flow: email input → role selector → send invitation
- Remove member (admin only)
- Role change dropdown

**Org Settings (Admin Only):**

- Organization name, slug
- Default notification preferences
- API key management (for CI integration)
- Danger zone: delete organization

#### 7. System Health

**Health Dashboard:**

- Service status cards (API, Slack Bot, GitHub App, Redis, PostgreSQL)
- Uptime metrics
- Response time charts
- Error rate trends

---

## Typography

| Usage            | Font               | Weight         | Size               |
| ---------------- | ------------------ | -------------- | ------------------ |
| Headings (H1-H3) | **Inter**          | 700 (Bold)     | 36px / 28px / 22px |
| Subheadings      | **Inter**          | 600 (Semibold) | 18px               |
| Body text        | **Inter**          | 400 (Regular)  | 16px               |
| Small / labels   | **Inter**          | 500 (Medium)   | 14px               |
| Code / logs      | **JetBrains Mono** | 400 (Regular)  | 14px               |
| Monospace inline | **JetBrains Mono** | 500 (Medium)   | 13px               |

**Rationale:** Inter for clean UI readability (same family CodeAnt uses for body), JetBrains Mono for log viewer and code blocks (ligatures, purpose-built for code).

---

## Color Scheme (Kenchi Brand)

### Primary Colors

```css
/* Based on Kenchi's AI/DevOps nature */
--primary: #3b82f6; /* Blue - trust, intelligence */
--primary-dark: #1d4ed8; /* Darker blue */
--primary-light: #60a5fa; /* Lighter blue */

/* Accent Colors */
--accent: #10b981; /* Green - success, safe actions */
--accent-warning: #f59e0b; /* Amber - caution, medium confidence */
--accent-danger: #ef4444; /* Red - danger, block, critical */
--accent-purple: #8b5cf6; /* Purple - AI, intelligence */

/* Neutral */
--bg-dark: #0f172a; /* Slate 900 - dark mode bg */
--bg-card: #1e293b; /* Slate 800 - cards */
--text-primary: #f8fafc; /* Slate 50 */
--text-secondary: #94a3b8; /* Slate 400 */
--border: #334155; /* Slate 700 */
```

### Confidence Score Colors

| Range     | Color            | Label     |
| --------- | ---------------- | --------- |
| 0.85-1.0  | Green (#10B981)  | Very High |
| 0.70-0.84 | Blue (#3B82F6)   | High      |
| 0.50-0.69 | Amber (#F59E0B)  | Medium    |
| 0.30-0.49 | Orange (#F97316) | Low       |
| 0.00-0.29 | Red (#EF4444)    | Very Low  |

---

## Component Library Needs

### Layout

- Navbar (landing vs dashboard)
- Sidebar (collapsible)
- Page container
- Grid system

### Data Display

- Stat cards
- Tables (sortable, filterable)
- Charts (line, bar, donut)
- Code blocks with syntax highlighting
- Confidence meter/indicator
- Status badges

### Forms

- Input with validation
- Textarea (for logs)
- Select/dropdown
- Multi-select
- Toggle switches
- Sliders (for thresholds)

### Feedback

- Toast notifications
- Loading states
- Empty states
- Error boundaries
- Modals

### Animation

- Code typing animation (hero)
- Progress indicators
- Skeleton loaders
- Page transitions

### Empty States

Each major view needs a designed empty state:
| View | Empty State Message | CTA |
|------|-------------------|-----|
| Dashboard (new user) | "Welcome! Let's set up your first integration" | "Connect GitHub" |
| Job History | "No analyses yet" | "Submit your first analysis" |
| Knowledge Base | "No documents ingested" | "Connect a repo to start learning" |
| Risk Rules | "No custom rules defined" | "Create your first rule" |
| PR Analysis | "No CI failures detected" | "Everything is green!" |

### Error Pages

- **401** — "Session expired" with re-login button
- **403** — "You don't have access" with request-access flow
- **404** — "Page not found" with navigation back to dashboard
- **500** — "Something went wrong" with retry button + support link
- **Offline** — Banner with "Reconnecting..." and cached data display

---

## Tech Stack & Architecture

### Recommended Stack

| Concern           | Choice                                    | Rationale                                                                    |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| Framework         | **Next.js 15 (App Router)**               | SSR for landing page SEO, RSC for dashboard perf, API routes for BFF         |
| Styling           | **Tailwind CSS + shadcn/ui**              | Matches Slate color system already defined, accessible components            |
| State Management  | **TanStack Query (React Query)**          | Server state caching, polling, optimistic updates — fits API-heavy dashboard |
| Forms             | **React Hook Form + Zod**                 | Type-safe validation, matches backend Zod schemas                            |
| Charts            | **Recharts**                              | Lightweight, composable, good for confidence score trends                    |
| Code Highlighting | **Shiki**                                 | Same highlighter as VS Code, SSR-compatible                                  |
| Real-time         | **SSE (EventSource)**                     | Simpler than WebSocket for unidirectional job status updates                 |
| Testing           | **Vitest + Testing Library + Playwright** | Unit/integration/e2e coverage                                                |

### API Client Layer

```typescript
// Typed API client wrapping fetch with auth, error handling, and types
const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  getToken: () => authStore.getAccessToken(),
  onUnauthorized: () => authStore.refresh(),
});

// Usage with TanStack Query
const useAnalysisJob = (jobId: string) =>
  useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => api.get<JobResult>(`/api/jobs/${jobId}`),
    refetchInterval: (data) => (data?.status === "completed" ? false : 3000),
  });
```

### Project Structure

```
frontend/
├── app/                        # Next.js App Router
│   ├── (landing)/              # Public pages (marketing)
│   │   ├── page.tsx            # Hero, features, pricing
│   │   └── layout.tsx          # Landing navbar + footer
│   ├── (auth)/                 # Auth pages
│   │   ├── login/
│   │   ├── signup/
│   │   └── layout.tsx          # Minimal auth layout
│   ├── (dashboard)/            # Authenticated pages
│   │   ├── layout.tsx          # Sidebar + topbar
│   │   ├── page.tsx            # Dashboard home
│   │   ├── analysis/
│   │   ├── repos/
│   │   ├── knowledge-base/
│   │   ├── risk/
│   │   ├── notifications/
│   │   ├── team/
│   │   └── settings/
│   └── api/                    # BFF routes (token refresh, proxy)
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   ├── layout/                 # Sidebar, Navbar, PageContainer
│   ├── analysis/               # Analysis-specific components
│   ├── risk/                   # Risk rule components
│   └── shared/                 # ConfidenceMeter, StatusBadge, etc.
├── lib/
│   ├── api-client.ts           # Typed fetch wrapper
│   ├── auth.ts                 # Token management
│   └── utils.ts                # Formatters, helpers
├── hooks/                      # Custom React hooks
└── types/                      # Shared frontend types (mirror backend DTOs)
```

---

## URL Routing Structure

### Public Routes

| Path                     | Page                  |
| ------------------------ | --------------------- |
| `/`                      | Landing page          |
| `/login`                 | Login                 |
| `/signup`                | Signup                |
| `/login/github/callback` | GitHub OAuth callback |

### Authenticated Routes

| Path                            | Page                                 |
| ------------------------------- | ------------------------------------ |
| `/dashboard`                    | Dashboard home                       |
| `/repos`                        | Connected repositories               |
| `/repos/add`                    | Add repository                       |
| `/analysis/new`                 | Submit new analysis                  |
| `/analysis/jobs`                | Job history                          |
| `/analysis/jobs/:id`            | Job detail / results                 |
| `/analysis/pr/:owner/:repo/:pr` | PR analysis timeline (deep-linkable) |
| `/knowledge-base`               | RAG search                           |
| `/knowledge-base/documents`     | Document list                        |
| `/knowledge-base/health`        | RAG health dashboard                 |
| `/risk/rules`                   | Risk rules list                      |
| `/risk/rules/new`               | Create risk rule                     |
| `/risk/rules/:id/edit`          | Edit risk rule                       |
| `/risk/assessments`             | Assessment audit trail               |
| `/notifications`                | Activity feed                        |
| `/notifications/slack`          | Slack configuration                  |
| `/notifications/github`         | GitHub configuration                 |
| `/team`                         | Team members                         |
| `/settings`                     | Org settings                         |
| `/settings/integrations`        | Integration management               |
| `/settings/health`              | System health                        |
| `/onboarding`                   | Setup wizard (first-time only)       |

---

## Real-time Updates Strategy

### Job Status (SSE)

```
GET /api/jobs/:id/stream
Content-Type: text/event-stream

data: {"status":"processing","stage":"chunking","progress":0.3}
data: {"status":"processing","stage":"extraction","progress":0.6}
data: {"status":"processing","stage":"aggregation","progress":0.85}
data: {"status":"completed","result":{...}}
```

### Frontend Implementation

```typescript
const useJobStream = (jobId: string) => {
  const [status, setStatus] = useState<JobStatus>("pending");

  useEffect(() => {
    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data);
      if (data.status === "completed" || data.status === "failed") {
        source.close();
      }
    };
    source.onerror = () => source.close(); // Fallback to polling
    return () => source.close();
  }, [jobId]);

  return status;
};
```

### Fallback

If SSE is unavailable (proxy/firewall issues), fall back to polling `GET /api/jobs/:id` with exponential backoff: 1s → 2s → 4s → 8s → max 15s.

---

## Accessibility (a11y)

### Requirements (WCAG 2.1 AA)

- **Keyboard navigation**: All interactive elements focusable and operable via keyboard
- **Screen reader support**: Semantic HTML, ARIA labels on icons/badges, live regions for status updates
- **Color contrast**: 4.5:1 minimum for text, 3:1 for UI components (verify all confidence score colors)
- **Focus management**: Trap focus in modals, return focus on close, visible focus indicators
- **Motion**: Respect `prefers-reduced-motion` — disable animations for skeleton loaders, page transitions

### Specific Considerations

| Component           | a11y Requirement                                                                   |
| ------------------- | ---------------------------------------------------------------------------------- |
| Confidence meter    | `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` + text label |
| Status badges       | Not color-only — include text label ("Passed", "Failed")                           |
| Log viewer          | Monospace font, horizontal scroll with keyboard, line-number anchors               |
| Toast notifications | `role="alert"` with `aria-live="polite"`                                           |
| Data tables         | Proper `<th scope>`, sortable column `aria-sort`                                   |
| Sidebar nav         | `aria-current="page"` on active item, collapsible with `aria-expanded`             |

---

## Responsive Design

### Breakpoints

| Breakpoint | Width       | Layout                                   |
| ---------- | ----------- | ---------------------------------------- |
| Mobile     | < 640px     | Single column, bottom nav, stacked cards |
| Tablet     | 640-1024px  | Collapsible sidebar, 2-column grid       |
| Desktop    | 1024-1440px | Fixed sidebar, 3-column grid             |
| Wide       | > 1440px    | Max-width container, centered content    |

### Mobile-Specific Adaptations

- Sidebar → bottom tab bar with 5 key sections
- Data tables → card view with expandable rows
- Log viewer → horizontal scroll with pinch-to-zoom
- Charts → simplified with touch-friendly tooltips

---

## Light Mode Colors

```css
/* Light mode (default for landing page, user-toggleable in dashboard) */
--bg-light: #ffffff;
--bg-card-light: #f8fafc; /* Slate 50 */
--bg-surface-light: #f1f5f9; /* Slate 100 */
--text-primary-light: #0f172a; /* Slate 900 */
--text-secondary-light: #475569; /* Slate 600 */
--border-light: #e2e8f0; /* Slate 200 */
```

Theme toggle: persist preference in `localStorage`, respect `prefers-color-scheme` as default.

---

## Performance Strategy

### Code Splitting

- Route-based splitting (automatic with Next.js App Router)
- Lazy-load chart libraries (`recharts`) — only loaded on dashboard/health pages
- Lazy-load code highlighter (`shiki`) — only loaded on analysis results page

### Data Loading

- **TanStack Query** for all API data: automatic caching, deduplication, background refetch
- **Stale-while-revalidate**: show cached data immediately, refresh in background
- **Pagination**: cursor-based for job history (matches backend), 25 items per page
- **Infinite scroll**: for activity feed / notifications

### Asset Optimization

- Next.js Image component for all images (automatic WebP, lazy loading)
- Font subsetting for monospace (log viewer) and sans-serif (UI)
- SVG icons via inline components (not icon fonts)

### Metrics to Track

| Metric                         | Target          |
| ------------------------------ | --------------- |
| LCP (Largest Contentful Paint) | < 2.5s          |
| FID (First Input Delay)        | < 100ms         |
| CLS (Cumulative Layout Shift)  | < 0.1           |
| TTI (Time to Interactive)      | < 3.5s          |
| Bundle size (initial JS)       | < 150KB gzipped |

---

## Frontend Testing Strategy

### Test Pyramid

| Layer           | Tool                     | What to Test                                            | Coverage Target |
| --------------- | ------------------------ | ------------------------------------------------------- | --------------- |
| **Unit**        | Vitest                   | Hooks, utilities, formatters, API client                | 80%+            |
| **Component**   | Vitest + Testing Library | Component rendering, user interactions, form validation | Key components  |
| **Integration** | Testing Library + MSW    | Full page flows with mocked API responses               | Critical paths  |
| **E2E**         | Playwright               | Login → analysis → results flow, onboarding wizard      | Happy paths     |
| **Visual**      | Playwright screenshots   | Confidence meter, status badges, charts                 | Regression only |

### Mock Strategy

- **MSW (Mock Service Worker)** for all API mocking — intercepts at network level
- Shared mock data factories mirroring backend DTOs
- No mocking React internals or TanStack Query — test through the component

### Critical E2E Flows

1. Signup → onboarding → GitHub install → first analysis
2. Login → view PR analysis → drill into results → copy shareable link
3. Create risk rule → trigger analysis → verify gating decision applied
4. Slack notification → click link → view analysis in dashboard
