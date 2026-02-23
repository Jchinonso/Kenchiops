# Kenchi Refactor Analyst Memory

## API Routes Audit (2026-02-22) -- see `routes-audit.md` for details

### Systemic Issues (Highest Priority)

- **No `container.ts`** in `services/api/src/`. Services wired directly in route files (authRoutes, dashboardRoutes, integrationRoutes).
- **`...context` missing from 13/18 route files** with loggers. Only authRoutes, integrationRoutes, subscriptionRoutes, sseRoutes spread context in logs.
- **`validateRequiredString` duplicated 6x** across route files. Also `validateOptionalString` 3x, `validateOptionalNumber` 2x, `validateOptionalBoolean` 2x. All identical. Should be in `@kenchi/shared` validators.
- **`requireTenantId` duplicated 3x** (dashboardRoutes, subscriptionRoutes, sseRoutes). Identical function.
- **Inline error JSON** instead of typed errors in: fineTuningModelRoutes (4 locations), fineTuningJobRoutes (3), dashboardRoutes (2), RAG cost/purge routes (~7).
- **Inconsistent response envelopes**: `{ data }` (dashboard/auth/integration/subscription), `{ success, data }` (RAG/fine-tuning), bare objects (riskRules, webhook, events).

### Critical Violations

- `analysisRoutes.ts` has raw SQL (`QUERIES` object) + direct `query()` calls in route handler. No repository layer.
- `webhookRoutes.ts` -- no signature verification, no replay protection, no idempotency. Stub handler.
- `riskRulesRoutes.ts` reads tenantId from `req.body/req.query` instead of `req.user` -- tenant isolation bypass.
- RAG + fine-tuning route handlers never pass `req.context` to service calls.

### Quality Positives

- authRoutes, integrationRoutes, subscriptionRoutes are well-structured (validate -> service -> respond).
- `sseRoutes.ts` has proper security: tenant isolation, connection limits, event sanitization, `let` justified.
- RAG `types.ts` file exists with all interfaces (good module organization).
- No `console.log`, no `process.env`, no `as any`, no `.push()`. All readonly interfaces.
- `dashboardRoutes.ts` properly delegates to dashboardService with context param.

## API Services Layer Audit (2026-02-22)

### Critical (5)

- Inline interfaces: integrationService.ts (2), gitlabConnectionService.ts (1), gitlabSetupService.ts (1)
- Double `as unknown as Record` casts in analysisService.ts:342,345
- authService directly imports adapter (`getOAuthAdapter`) -- must inject via factory

### High (8)

- Triplicated: `generateWebhookSecret`, `WEBHOOK_SECRET_BYTES`, `GITLAB_CI_PROVIDER`, `getGitLabWebhookUrl` across 3 files
- `CICD_FAILURE_TYPE` in dashboardService.ts duplicates `EVENT_TYPES.CICD_FAILURE` from shared
- `createLogger` called 6x per-function in integrationService.ts
- Array mutation: `.push()` x7, `.unshift()` x2 in analysisChunkingPipeline.ts
- Mutable reduce accumulators in analysisService.ts + analysisChunkingPipeline.ts
- Missing `RequestContext` on ALL finetuning service + feedbackStats functions
- Missing `...context` in all finetuning logger calls

### Medium (11)

- Raw SQL in feedbackStatsService.ts and evaluationService.ts (should be repositories)
- Various inline constants belong in shared
- Mutable array types, `as string[]` cast in analysisRAG.ts
- Incomplete port interface (GitLabProjectsPort missing createProjectWebhook)

### Key Pattern: No console.log, no process.env, no `any` -- these rules well-followed across all services.

## API Adapters/Ports/Workers/Index Audit (2026-02-22)

### Critical (5)

- `authService` imports `getOAuthAdapter` from adapter registry directly (Hard Rule #5)
- `analysisChunkingPipeline` imports `createLLMExtractor` from adapter directly (Hard Rule #5)
- No `container.ts` -- adapters wired in routes/services, not composition root
- All 7+ adapters use raw `fetch` instead of shared httpClient (Rule #6). However, NO shared `httpClient` utility exists yet -- only `resilientGet`/`resilientPost` in `resilientClient.ts`. Adapters manually implement timeout+logging+classification correctly.
- `llmExtraction.ts` adapter: ZERO logging, no error classification, no RequestContext propagation, no ExternalServiceError

### High (11)

- All 4 port files define types inline (Rule #2). Need `ports/types.ts`.
- `gitlabProjectsAdapter.ts` has 2 inline vendor types (Rule #2)
- `WorkerState` + `AnalysisWorkerControl` interfaces missing `readonly`
- Worker mutates `state.activeJobs` without justification comment
- Worker has SQL queries + config inline instead of repository/config
- `isRetryableStatus` duplicated in 7 adapter files
- `ensureClientCredentials` pattern duplicated in 6 adapter files
- `index.ts` has ~180 lines of scheduler boilerplate (4 identical start/stop/run triplets)

### Medium (9)

- `rawProfile as unknown as Record<string,unknown>` double-cast in 4 adapters
- Raw error logged at index.ts:454 without `getErrorMessage`
- Constants (SHUTDOWN_TIMEOUT_MS, etc.) inline in index.ts
- `githubInstallationAdapter` missing statusCode/category on failure log
- Octokit SDK direct call needs justification comment
- Mutable Map cache needs justification comment
- Worker double-casts `requestPayload` without validation
- Missing error classification fields in generic catch blocks (all OAuth adapters)
- Redundant `as const` on `appConfig`

### Shared httpClient Gap

- CLAUDE.md lists `httpClient` in Available Shared Utilities but it doesn't exist in the barrel.
- Only `resilientGet`/`resilientPost` from `resilientClient.ts` are available (includes retry+circuit breaker).
- A lightweight `httpClient` wrapping fetch with timeout+logging+classification is needed.

## Earlier Audits (Summary)

### Dark Mode (Phase 3+4, 2026-02-15)

- REMAINING: Settings.tsx non-active org status badge, `index.css` scrollbar styles.

### CI Provider Abstraction (2026-02-18)

- Code duplication between adapters/handlers. `serializeAggregationKey` missing provider field.
- `githubWebhookAdapter` has NO logging. Migration 016 missing `updated_at` trigger.

### Incident Triage Service (2026-02-18)

- CRITICAL: Alert stuck "processing" on failure. `errorMsg.includes("5")` false positives.
- No RequestContext middleware. Raw sourcePayload without redactSecrets.

### Investigation Dashboard (2026-02-21)

- `useFetch` triplicated. `setRef` and `parseErrorBody` duplicated. Index-as-key in 4 places.

### Monitoring Integration (2026-02-21)

- Missing error classification in all 6 adapters. Netlify ignores `hoursBack`.
- Unbounded `Promise.all` in monitoringPortAdapter. Constants duplicated across adapters.

### Landing Page (2026-02-17)

- All 20 frontend files clean after fixes. Static data hoisted, index-as-key fixed, navLinks hoisted.

### Frontend Data Fetching

- Custom `useFetch` used instead of TanStack Query (deliberate -- TQ may not be in deps).

## Codebase Architecture Notes

- No `container.ts` exists in `services/api/src/` -- all service wiring is in route files.
- `@kenchi/shared` barrel (`index.ts`) is ~1540 lines. Exports from: core, database, http, formatting, integrations, llm, safety, security, actions, constants, queue, cache, aggregation, ports, health, shutdown, rag, finetuning, rateLimit.
- `services/api/src/types/apiTypes.ts` contains all API-specific types (correct pattern).
- RAG routes have their own `rag/types.ts` (correct module organization).
