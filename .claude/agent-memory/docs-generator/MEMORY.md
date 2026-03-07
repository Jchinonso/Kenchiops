# Docs Generator Agent Memory

## Codebase Knowledge

### Frontend Architecture

- **Framework:** React 19 + React Router v7 + Tailwind CSS + shadcn/ui
- **State:** TanStack Query for server state, `useState`/`useEffect` for local UI
- **Auth:** `useAuth` hook wraps cookie-based JWT flow, `AuthProvider` context
- **Real-time:** `useDashboardSSE` hook uses native `EventSource`, increments `refreshKey` for refetch
- **Data hooks:** `services/frontend/src/hooks/useDashboardData.ts` has typed hooks for all dashboard endpoints
- **Routing:** `Dashboard.tsx` is the shell, sub-pages rendered by pathname matching (not nested routes)
- **Available but unused:** sonner toasts (installed), recharts (installed, chart.tsx wrapper exists)

### Backend API Structure

- **Routes:** `services/api/src/routes/` -- registered in `index.ts` via `registerRoutes(app)`
- **Route files:** analysisRoutes, apiKeyRoutes, authRoutes, billingRoutes, dashboardRoutes, dataExportRoutes, eventRoutes, fineTuningDatasetRoutes, fineTuningJobRoutes, fineTuningModelRoutes, fineTuningRoutes, healthRoutes, integrationRoutes, invitationRoutes, organizationRoutes, riskRulesRoutes, sseRoutes, subscriptionRoutes, teamRoutes, webhookRoutes, rag/
- **Dashboard:** 5 endpoints under `/api/v1/dashboard/` (tenant, stats, repositories, analyses, failures)
- **SSE:** `sseRoutes.ts` -- Redis pub/sub filtered by tenantId
- **Auth:** `authRoutes.ts` -- OAuth login/callback/refresh/logout/me
- **Integrations:** `integrationRoutes.ts` -- OAuth connect/callback/disconnect for Vercel/Netlify
- **Service pattern:** Factory function, e.g., `createIntegrationService(getAdapter) => { connect, disconnect, listConnections, refreshIfNeeded }`

### Database Module Patterns (Confirmed)

- Module structure: `types.ts` + `helpers.ts` + `repository.ts` + `index.ts`
- Row types: snake_case `interface FooRow` with `readonly` properties
- Domain types: camelCase `interface Foo` with `readonly` properties
- Row mappers: `rowToFoo(row: FooRow): Foo` in helpers.ts
- Repository: plain async functions, use `query<RowType>(SQL, [params])` from `../client/index.js`
- SQL queries stored as `const QUERIES = { ... } as const` object at top of repository.ts
- Reference example: `packages/shared/src/database/providerConnection/` (types, helpers, repository)

### Database Schema (relevant tables)

- `events` table: webhook events, `payload` JSONB, has `tenant_id` column
- `analyses` table: LLM results, `full_analysis` JSONB, `confidence_signals` JSONB
- `tenants` table: links GitHub org to Slack workspace
- `users`/`oauth_identities`/`refresh_tokens`: auth tables
- `provider_connections`: CI provider OAuth tokens (encrypted), webhook secrets
- `investigations`: on-demand diagnostic requests

### Key Type Locations

- User types (incl. UserRole): `packages/shared/src/database/user/types.ts`
- UserRole: `"owner" | "admin" | "member" | "viewer"`
- RequestContext: `packages/shared/src/core/types.ts`
- ProviderConnection types: `packages/shared/src/database/providerConnection/types.ts`
- Tenant types: `packages/shared/src/database/tenant/types.ts`
- Error classes: `packages/shared/src/core/errors.ts` (AuthorizationError is HTTP 403)

### Migration Conventions

- Location: `packages/shared/src/database/migrations/`
- Format: `NNN_description.sql` (e.g., `012_investigations.sql`)
- Numbers have gaps (001, 007, 008, 009, 011, 012)
- Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- Include `COMMENT ON TABLE/COLUMN` statements
- Reuse shared `update_updated_at_column()` trigger function

### Barrel Export Chain

- Module `index.ts` -> `packages/shared/src/database/index.ts` -> `packages/shared/src/index.ts`
- Constants use wildcard: `export * from "./constants/index.js"`
- Over 1400 lines in the main barrel file -- add new exports at the end of the relevant section

### Coming Soon Pages

- Dashboard sidebar has sections for Incidents, Infrastructure, Deployments, Analytics, Integrations, Settings
- All render `ComingSoon` placeholder component at `services/frontend/src/components/ComingSoon.tsx`

### Multi-Tenant Auth Design (Analyzed 2026-02-26)

- Auth flow: OAuth login -> findOrCreateUser -> autoLinkOrganizations -> JWT issuance
- Account linking: verified email match merges identities across providers
- Tenant scoping: `tenants` table has `(org_name, provider)` -- GitHub "acme" and GitLab "acme" are separate
- Role mapping: `PROVIDER_ROLE_MAP` in `constants/auth.ts` maps provider roles to Kenchi roles
- Key flaw: first user to trigger tenant creation gets `"owner"` regardless of provider role (line 472 in authService.ts)
- Key flaw: `addUserOrganization` uses ON CONFLICT DO NOTHING -- roles never sync from provider changes
- Key flaw: `requireTenantMatch` in `tenantGuard.ts` skips check entirely for admin/owner roles (cross-tenant bypass)
- Key flaw: GitHub `/user/orgs` API does not return per-org role, so all GitHub users get default `"member"`
- Personal account fallback: GitHub users with no orgs get username as tenant (creates clutter)
- Reconciliation risk: empty provider API response causes all existing memberships to be removed as "stale"
- JWT carries `tid` (tenantId) baked in for 15-min lifetime; stale after org switch
- Comprehensive design review: `docs/MULTI_TENANT_AUTH_DESIGN_REVIEW.md`
- Related docs: `MULTI_TENANT_AUDIT.md`, `MULTI_TENANT_REMEDIATION.md`, `MULTI_TENANT_ARCHITECTURE.md`

## Documentation Inventory

- `docs/PRICING_TIERS.md` -- older pricing doc (Free/Starter/Team/Enterprise with different names/prices)
- `docs/SUBSCRIPTION_PLANS.md` -- new subscription plan enforcement doc (Free/Pro/Team/Enterprise)
- `docs/DATA_MODELS.md` -- Event, Evidence, LLMAnalysisResult, ActionProposal schemas
- `docs/MULTI_TENANT_AUTH_DESIGN_REVIEW.md` -- auth/org design flaws, edge cases, migration paths (created 2026-02-26)
- 40+ docs in `docs/` directory covering features, plans, implementation guides
- PRICING_TIERS.md is superseded by SUBSCRIPTION_PLANS.md for enforcement details

## README Update (2026-03-07)

- README.md was heavily outdated: missing incident-triage service, frontend, monitoring stack, billing
- Added all 5 services (api, github-app, slack-bot, incident-triage, frontend)
- Added full Docker stack (prometheus, grafana, alertmanager)
- Updated tech stack: React 19, React Router v7, TanStack Query, Vitest, Stripe, motion
- Updated env vars table to include LLM provider config, JWT_SECRET, ENCRYPTION_KEY, OAuth vars
- Referenced .env.example instead of duplicating full list
- Incident triage adapters: PagerDuty, Datadog, Grafana, Prometheus, Vercel, Netlify
- shared/src modules confirmed: actions, aggregation, billing, cache, concurrency, constants, core, database, finetuning, formatting, health, http, integrations, llm, observability, ports, queue, rag, rateLimit, safety, security, shutdown
- Frontend pages: Dashboard overview, CICDAnalyses, CICDFailures, CICDPipelines, ActiveIncidents, Investigations, WebhookActivity, Settings, Integrations, TeamManagement, Onboarding, Login
- RAG module has ~35 files covering ingestion, search, drift detection, multi-hop, cost controls, evaluation
