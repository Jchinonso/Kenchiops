# Kenchi Refactor Analyst Memory

## Index of Audit Files

- `routes-audit.md` -- API Routes audit (2026-02-22)
- `log-processing-audit.md` -- Log Processing Strategy audit (2026-03-24)

## API Routes Audit (2026-02-22)

- No `container.ts` in `services/api/src/` -- services wired in route files
- `...context` missing from 13/18 route files
- `validateRequiredString` duplicated 6x, `requireTenantId` 3x
- `analysisRoutes.ts` has raw SQL, `webhookRoutes.ts` is stub, `riskRulesRoutes.ts` tenant isolation bypass

## API Services/Adapters Audit (2026-02-22)

- Inline interfaces in integrationService, gitlabConnectionService, gitlabSetupService
- `.push()` x7 in analysisChunkingPipeline.ts. Mutable reduce accumulators.
- Missing RequestContext on ALL finetuning service functions
- `authService` directly imports adapter (Hard Rule #5)
- All 7+ adapters use raw fetch. No shared httpClient yet.
- `isRetryableStatus` duplicated in 7 adapters, `ensureClientCredentials` in 6

## Log Processing Strategy Audit (2026-03-24) -- see `log-processing-audit.md`

### Critical (5)

1. Triplicated helpers (mapAlertContextSeverity, buildEmptyAlertContext, buildTimeWindow) in 3 incident-triage context adapters
2. NRQL injection in newRelicContextAdapter.ts:47 -- serviceName from payload interpolated unsafely
3. Unsafe `as unknown as` cast in alertAnalysisService.ts:153 -- LLM JSON double-cast
4. 7 inline interfaces across 5 files (ReductionLimits, ChunkedEvidenceInput, DeployAnalysisService, AlertAnalysisServiceDeps, etc.)
5. `.push()` in pure functions: mapper.ts, correlation.ts, truncation.ts, windowedAnalysis.ts

### High (8)

- Hardcoded "free" plan in quota checks (2 files)
- Railway subscribe passes empty apiToken
- Missing `...context` in bufferQueries.ts logs (4+ calls)
- Webhook verifier skips verification when secret missing (no prod check)
- Missing `category` in 3 incident-triage adapter error logs
- SubscriptionLifecycle mutable without justification
- Serial for...of+await in flushTriggerWorker (should use pMap)
- Inconsistent REDIS_STATUS.READY vs REDIS_READY_STATUS

### Quality Positives

- Proper composition root in deployContainer.ts
- Port interfaces use Kenchi-defined types only
- Proper readonly, structured logging, redactSecrets, ExternalServiceError
- Fail-open design, as const on all constants, let justified everywhere
- No console.log, no process.env, no any

## Earlier Audits (Summary)

### Multi-Tenant Hardening (2026-02-25)

- Empty catch in webhookHandler.ts, .push() in keyRotation.ts, inline types in keyRotation.ts
- RequestContext NOT propagated to webhook event handlers
- Crypto constants duplicated between tenantEncryption and keyRotation

### TanStack Query Migration (2026-03-04/05)

- useFetch fully replaced. SSE debounce fixed. Polling timeout fixed.
- Object.assign(ref, {current:value}) accepted pattern (~10 locations)

### RAG Phase 2 (2026-03-07/09)

- Feedback: broad feedbackType, encodeURIComponent on nullable, duplicate getAnalysisById
- Knowledge Base: ...context missing in coreRoutes, getKnowledgeDocCountsByType missing tenant filter

### Chat Token Protection (2026-03-23, re-audited 2026-03-26)

- FIXED: chatStreaming.ts imported isOpenRouterProvider (Rule #5) -- now uses resolveLLMModel from clientFactory
- FIXED: chatPrepare.ts used .push() on preStreamChunks -- now builds array immutably with spread
- FIXED: chatLLMAdapter.ts lacked statusCode in error logs and proper error classification
- FIXED: chatContextAdapter.ts created logger per method call -- hoisted to module level
- FIXED: chatRoutes.ts hardcoded "free" plan tier -- extracted DEFAULT_PLAN_TIER constant
- REMAINING: classifyHttpError() referenced in CLAUDE.md but not implemented in @kenchi/shared
- REMAINING: Frontend types.ts duplicates ChatStreamChunk/ChatRAGSource/ChatPageContext from shared
- REMAINING: Chat service wired in chatRoutes.ts, not in container.ts (no container.ts exists for api)

### Tier 3 Scalability (2026-03-06)

- Singleflight module-level mutable Map, no capacity guard
- investigationWorker double-casts, isActiveStatus incomplete

## Codebase Architecture Notes

- `classifyHttpError()` is in CLAUDE.md Available Shared Utilities but NOT implemented in @kenchi/shared. Adapters must do manual classification until this is added.
- `@kenchi/shared` barrel is ~1600 lines
- `services/api/src/types/apiTypes.ts` has all API-specific types (correct)
- HMAC signature verification duplicated 4x in deploy adapters (only Vercel uses SHA-1, rest SHA-256)
- REDIS_READY_STATUS and REDIS_STATUS.READY both exist -- should consolidate
- Deploy container (`deployContainer.ts`) is the ONLY proper composition root in api service

## Cross-Cutting Patterns Observed

- `.push()` remains the most common violation across all audits
- Inline interfaces are the second most common violation
- Helper duplication across adapters is a recurring theme (isRetryableStatus, ensureClientCredentials, mapAlertContextSeverity, HMAC verify, etc.)
- RequestContext propagation consistently missed in error/catch paths
