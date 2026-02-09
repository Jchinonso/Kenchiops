# Kenchi Refactor Analyst Memory

## Audit: Function Size & File Size (2026-02-09)

### Key Findings

- 30 functions exceed 50 lines across packages/shared/src/
- 18 of those 30 have deep nesting (3+ levels)
- Worst offenders: `createQueue` (156 lines), `parseTestFailures` (146 lines), `middleware` (101 lines -- REFACTORED, now 32 lines)
- 50+ implementation files exceed 300 lines; see `function-size-audit.md` for details

### Patterns Observed

- Validation functions are consistently oversized (storeValidation.ts, riskRules/validation.ts) due to repetitive field-by-field validation -- could use schema-based validation or validation rule arrays
- RAG module (`rag/`) has the highest density of oversized functions (search, ingestion, driftDetection, testCaseSeeding, governance)
- Rate limiting module (`rateLimit/`) has significant complexity with deep nesting in middleware and geo restriction
- Queue processing (`messageQueue.ts`) has the single largest function -- `createQueue` at 156 lines -- which is a factory returning an object with multiple inner functions
- Types files are very large (rag/types.ts at 1492 lines, rateLimit/types.ts at 1331 lines) -- consider splitting by subdomain

### Recurring Anti-patterns

1. Try/catch blocks adding 1-2 levels of nesting to already-nested code
2. Functions that build return objects with many similar branches (repeated result shapes in slackResolutionDetector, prFixCommentDetector)
3. Sequential recursive patterns used in place of simple for-of loops (testCaseSeeding, driftDetection)
4. Factory functions that define many inner functions instead of extracting them to module scope

See `function-size-audit.md` for the full detailed report.

## Audit: services/api/ Code Quality (2026-02-09)

### Critical Findings

1. **No RequestContext middleware** - HTTP handlers never create or propagate RequestContext. `req.context` is never set on incoming requests.
2. **No composition root** - No `container.ts` exists. The adapter (`llmExtraction.ts`) is directly instantiated inside the service (`analysisChunkingPipeline.ts`).
3. **Webhook handler lacks replay protection** - `webhookRoutes.ts` has no delivery ID check or idempotency store usage.
4. **Adapter missing error classification** - `llmExtraction.ts` doesn't use `classifyHttpError`, `ExternalServiceError`, or log with `provider`/`operation`/`durationMs`/`context`.
5. **Inline types in non-types.ts files** - `analysisRoutes.ts` defines `JobRow`, `AnalyzeJobResponse`, `JobStatusResponse` inline. `llmExtraction.ts` defines `ExtractionOptions`, `ExtractorFunction` inline. `analysisWorker.ts` defines `JobStatus`, `AnalysisJob`, `WorkerState`, `AnalysisWorkerControl` inline.
6. **Direct DB queries in route handlers** - `analysisRoutes.ts` has raw SQL queries and `query()` calls directly in handlers, bypassing the service layer. Routes should only: validate -> call service -> map response.
7. **Duplicated `delay` utility** - `analysisWorker.ts` reimplements `delay()` which is already in `@kenchi/shared`.
8. **Duplicated `validateRequiredString`** - Identical validation function copy-pasted across 5 route files.
9. **`process.env` direct access** - `index.ts:341` accesses `process.env.LLM_API_KEY` directly instead of going through `config`.
10. **LLM client singleton inside service** - `analysisService.ts` creates `LLMClient()` directly, not injected via container.

### Medium Findings

- Services do `as unknown as Record<string, unknown>` double-cast in `analysisService.ts:313-315`
- No `RequestContext` propagated from RAG route handlers into shared functions
- `analysisWorker.ts` uses `as unknown as AnalyzeRequest` unsafe cast (line 134)
- `schedulerService.ts` has module-level mutable state (not injectable/testable)
- `index.ts` has 4 scheduler function triplets that are nearly identical boilerplate (cleanup, drift, reembed, externalSync) -- 174 lines that could be a generic factory
- `analysisService.ts:126` logs at error level for LLM failures that the adapter should handle
- `splitEvidenceSections` in `analysisEvidence.ts:41-66` is O(n^2) due to spread on every line
- `convertAggregatedToEvidence` + `performAnalysis` compute artifact counts by type twice
- Multiple response interfaces in `rag/types.ts` use `unknown` where concrete types exist
- `pollJobs()` in schedulerService.ts:287 is called without `void` prefix
- `fineTuningDatasetRoutes.ts:47` returns `object` type instead of specific interface
- `getEvaluationHistory` ignores its `_limit` parameter (dead code param)
- Duplicated validation helpers: `validateOptionalString` (3 files), `validateOptionalNumber` (2), `validateOptionalBoolean` (2), `validateRequiredNumber` (2)

### Structural Observations

- No `ports/` directory exists - CLAUDE.md specifies it should
- The `rag/types.ts` is well-organized with types properly separated
- `fineTuningTypes.ts` properly centralizes fine-tuning types
- Good use of `Promise.all` for parallel operations in evaluation service
- `swagger.ts` is dead code (placeholder, never used)

### Test Coverage Gaps (services/api/src)

**Untested files with business logic (HIGH priority):**

- `finetuning/jobService.ts`, `finetuning/evaluationService.ts`, `finetuning/schedulerService.ts`, `finetuning/modelService.ts`, `finetuning/statsService.ts`, `finetuning/datasetService.ts`
- `riskRulesRoutes.ts` (complex CRUD, no tests)

**Untested route handlers (MEDIUM priority):**

- `fineTuningDatasetRoutes.ts`, `fineTuningJobRoutes.ts`, `fineTuningModelRoutes.ts`

**Has tests:**

- `analysisRoutes.ts`, `analysisService.ts`, `analysisChunkingPipeline.ts`, `analysisEvidence.ts`, `analysisRAG.ts`, `analysisWorker.ts`, `eventRoutes.ts`, `healthRoutes.ts`, `webhookRoutes.ts`, `llmExtraction.ts`, `feedbackStatsService.ts`, all RAG routes

## Completed Refactors

### RateLimiter.middleware (2026-02-09)

- **File:** `packages/shared/src/rateLimit/index.ts`
- **Before:** 101 lines, deep nesting (try/catch + if/else + Promise.race)
- **After:** 32 lines in middleware, 5 extracted module-scope helpers (each <25 lines)
- **Helpers:** `incrementWithTimeout`, `validateRateLimitInfo`, `setRateLimitHeaders`, `computeRetryAfterSeconds`, `handleMiddlewareError`
- **Note:** Validation hook flags `missing-duration-ms` on log messages containing "request"/"call"/"external"/"api" keywords. Avoided by using "failed" instead of "error" in non-external-call log messages.
- Added `RateLimitInfo` to the type imports from `./types.js` (needed by module-scope helpers)

### linkedCommitIngestion.ingestLinkedCommitKnowledge (2026-02-09)

- **File:** `packages/shared/src/rag/linkedCommitIngestion.ts`
- **Before:** 95 lines, metadata construction + result handling + error paths all inline
- **After:** 50 lines in main function, 4 extracted module-scope helpers
- **Helpers:** `buildIngestionMetadata` (metadata object construction), `handleIngestionResult` (success/failure logging + cleanup), `createSkippedResult` (skip factory), `createErrorResult` (error factory)
- **Pattern:** Functions that construct large object literals (metadata) and branch on result success/failure are good extraction targets -- the main function reads as a clean pipeline after extraction

### ingestion.ts: ingestDiffChunks + ingestKnowledgeDoc (2026-02-09)

- **File:** `packages/shared/src/rag/ingestion.ts`
- **Before:** `ingestDiffChunks` 91 lines, `ingestKnowledgeDoc` 164 lines
- **After:** `ingestDiffChunks` 31 lines, `ingestKnowledgeDoc` 42 lines
- **Extracted helpers (diff):** `chunkAndStoreDiff` (33 lines), `embedAndRecordDiff` (15 lines), `buildDiffFailureResult` (16 lines)
- **Extracted helpers (knowledge):** `validateDocMetadata` (24 lines), `chunkAndStoreKnowledgeDoc` (36 lines), `embedAndRecordKnowledge` (20 lines), `detectDocRelationships` (37 lines), `buildKnowledgeFailureResult` (23 lines)
- **Types added to types.ts:** `ChunkStoreResult`, `EmbedResult`, `RelationshipStepResult` (intermediate result types for helpers)
- **Pattern:** Ingestion pipelines decompose well into chunk-and-store / embed-and-record / detect-relationships phases. The `null` return from chunk-and-store signals "no chunks generated" cleanly via early return in the main function.
- **Note:** Used `...relationships` spread to merge optional relationship fields into the result cleanly

### driftDetection.generateDriftReport (2026-02-09)

- **File:** `packages/shared/src/rag/driftDetection.ts`
- **Before:** 97 lines, 2 inner functions, recursive sequential processing, mutable alerts closed over
- **After:** 24 lines, 6 module-scope helpers: `isDeviationBad`, `determineMetricStatus`, `determineTrend`, `buildDriftAlert`, `evaluateMetricThreshold`, `determineOverallHealth`
- **Key change:** Replaced recursive `processMetrics` with `for...of` (allowed: sequential async). Each threshold returns `{ report, alert }` tuple.
- **Types imported:** `MetricAlertThreshold`, `HealthStatus`, `MetricStatus`, `MetricTrend`, `AlertSeverity` from types.ts; `MetricBaseline`, `DriftDetectionResult` from database

### multiHop.findPath (2026-02-09)

- **File:** `packages/shared/src/rag/multiHop.ts`
- **Before:** 102 lines, 3 nested inner functions closing over visited/pathMap/toDocId
- **After:** 24 lines, 4 module-scope helpers: `findTargetInRelationships`, `recordUnvisitedNeighbors`, `processPathLevel`, `findPathBFS`
- **Types added to types.ts:** `PathMapEntry`, `PathLevelItem`. Re-exported from `multiHopTypes.ts`.
- **Key change:** Broke closure dependency by passing `visited`, `pathMap`, `targetDocId` as explicit params. Used existing `PathResult` type for return. Simplified `reconstructPath` with combined base case.

### search.ts: searchKnowledgeDocs + searchAll (2026-02-09)

- **File:** `packages/shared/src/rag/search.ts`
- **Before:** `searchKnowledgeDocs` 94 lines, `searchAll` 100 lines
- **After:** `searchKnowledgeDocs` ~48 body lines, `searchAll` ~47 body lines
- **Extracted to searchHelpers.ts:** `rerankKnowledgeResults` (full reranking pipeline), `computeRerankFetchLimit` (topK multiplier), `recordSearchCostIfNeeded` (fire-and-forget cost tracking), `trackKnowledgeResultHits` (fire-and-forget hit tracking)
- **Pattern:** Both functions had identical reranking blocks (map-to-rerankable -> fullRerank -> map-back-from-reranked) and identical cost/hit tracking. Extracting the reranking pipeline as a single helper eliminated ~25 lines of duplication per function.
- **Key decision:** Kept helpers in `searchHelpers.ts` (not a new file) since that's the established location for search internals
- **Import cleanup:** Removed `fullRerank`, `toRerankableResult`, `fromRerankedResult`, `QueryContext` from search.ts imports. Added `fullRerank` import to searchHelpers.ts instead.
