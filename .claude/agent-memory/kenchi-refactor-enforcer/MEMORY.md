# Kenchi Refactor Enforcer - Agent Memory

## Pre-commit Hook Behavior

- Hook at `.claude/hooks/validate-standards.js` validates `new_string` of Edit calls in isolation
- `missing-duration-ms` rule triggers on logger calls whose message contains: "call", "request", "response", "api", "external" (case-insensitive) without `durationMs` within 150 chars
- Avoid those trigger words in non-external-call log messages
- Hook checks per-edit, not per-file

## Module Type Locations (types.ts files)

- `http/types.ts` - CircuitBreaker, ResilientClient, Validator, ValidationSchema, ValidationSource
- `llm/types.ts` - LLM provider types, OpenAIConfig, EmbeddingClientConfig, TokenEstimate, RawAnnotation, RawSecondaryFinding, ConfidenceLevel, TestFailureLogShape, LintErrorLogShape, ActionPriority, ValidationLookups, EvidenceValidator, JsonExtractionState
- `llm/providers/openai/types.ts` - OpenAIErrorLike, ErrorMessageFactory, ErrorHandler (NEW file created)
- `finetuning/types.ts` - Model versioning, dataset, fine-tuning types
- `integrations/types.ts` - ArtifactAnalysisPrompt, TenantPromptConfig, TechStackConfig, CISystem, AnalysisDepth, PromptPreferences, FocusArea, VerbosityLevel, RepositoriesResponse
- `safety/validation/types.ts` - RedactSensitiveResult (NEW file)
- `rateLimit/types.ts` - (1300+ lines) includes QueryValue, BotType (added at end)
- `rag/types.ts` - 100+ types (SearchQuery, RAGSearchResult, ExternalDocument, PRComment, SlackMessage, FailureSummary, DocumentContext, etc.) from Batch A/B/C
- `safety/scoring/riskScoring/types.ts` - Risk scoring types
- `database/riskRules/types.ts` - RiskRulesStore, CustomRiskRule
- `database/diffChunk/types.ts` - DiffChunk, CreateDiffChunkInput, DiffChunkRow, SimilaritySearchQueryResult, SearchConditionsResult

## Logger Patterns

- `createLogger(scope)` takes string scope only (not context as 2nd param)
- Actual signature: `createLogger(serviceName: string, minLevel?: LogLevel): Logger`
- Use `const logger = createLogger("descriptive-scope")` at module level

## Pre-existing Issues (branch: refactor/codebase-structure-and-standards)

- LogSage formatting module (`formatting/logsage/`) does not exist on disk (only in `dist/`)
- `formatting/index.ts` references logsage barrel that doesn't exist on disk

## Clean Files (no violations found)

- integrations/ (all 10 files audited 2026-02-08): githubAppClient.ts (fixed), index.ts (fixed),
  promptArtifactAnalysis.ts, promptArtifactHelpers.ts, promptArtifactValidation.ts,
  promptEvidenceFormatters.ts, promptOutputSchema.ts, prompts.ts, tenantPromptConfig.ts, types.ts
- llm/structuredDataParsers.ts, llm/responseParserValidation.ts, llm/validation.ts, llm/types.ts
- safety/scoring/riskScoring/inMemoryStore.ts
- finetuning/modelVersioning.ts
- constants/ (all 14+ files): audited 2026-02-08
- rateLimit/botDetection.ts, rateLimit/requestSignature.ts (audited 2026-02-08)
- safety/validation/sanitization.ts, safety/validation/types.ts (audited 2026-02-08)
- rag/ (2026-02-08, 33 files fully audited): all compliant post-refactor
  First half: alertDispatcher, analysisLessonIngestion, chunking, chunkingCore, chunkingStrategies,
  costControls, costControlsCache, docTypeChunking, driftDetection, driftDetectionMetrics,
  driftDetectionTypes, evaluation, types, budgetAwareEmbedding (fixed), externalKnowledge (fixed)
  Second half: governance, ingestion, metrics, multiHop, multiHopTypes, prFixCommentDetector,
  relationshipDetection, reranker, search, slackResolutionDetector, slackResolutionIngestion,
  slackResolutionPatterns, streamingUpdates, testCaseSeeding -- already compliant
  Fixed: githubIssuesConnector, ingestionHelpers, searchHelpers, prFixCommentIngestion, linkedCommitIngestion
- http/ (2026-02-08): types.ts, index.ts, validation.ts, middleware.ts, circuitBreaker.ts, resilientClient.ts
- database/ (2026-02-08): All 14 submodules compliant - client, tenant, repositoryChannel,
  vector, diffChunk, knowledgeDoc, feedback, analysis, actionProposal, modelVersion,
  relationship, externalSource, testCase, metricsHistory, costTracking, riskRules

## Adapter Logging

- Provider lowercase: "openai" not "OpenAI"
- Required: provider, operation, durationMs, statusCode (if available)
- Error handlers need durationMs passed as param from caller

## Queue Module Audit (2026-02-08, full compliance)

- `queue/types.ts` - 16 types: QueueStats (NEW), WorkerOptions (NEW) + 14 from initial migration
- `messageQueue.ts` - FIXED: (1) `duration` -> `durationMs`, (2) types imported from types.ts, (3) getStats returns QueueStats
- `redisClient.ts` - FIXED: (1) empty catch -> logs warning (Rule 11), (2) `throw new Error()` -> ExternalServiceError (Rule 3), (3) .then/.catch -> async/await safeCloseClient (Pattern 7)
- `slackNotificationProcessor.ts` - FIXED: (1) `duration` -> `durationMs` x3, (2) inline options type -> WorkerOptions, (3) inline return type -> QueueStats
- `index.ts` barrel - Types from `./types.js`, runtime from module files
- Main `index.ts` - Added: QueueManager, BaseNotificationPayload, WorkerOptions
- QueueStats duplication: identical in `queue/types.ts` and `actions/types.ts` - not exported from main barrel to avoid conflict

## RAG Module Type Migration (2026-02-07)

- Batch A: 25 types from 10 files (chunkingCore, chunking, chunkingStrategies, docTypeChunking, ingestion, metrics, costControls, costControlsCache, budgetAwareEmbedding, searchHelpers)
- Batch C: 31 types from 9 files (externalKnowledge, prFixCommentDetector, prFixCommentIngestion, slackResolutionDetector, slackResolutionIngestion, slackResolutionPatterns, analysisLessonIngestion, linkedCommitIngestion, relationshipDetection)
- Each source file: `import type { ... } from "./types.js"` + `export type { ... } from "./types.js"`
- Private types also moved: DuplicateCheckResult, BatchAccumulator, ResolutionCandidate, ResolutionAnalysisMetadata, KnowledgeDocSearchResult, ScoredRelationship, FailureSummaryInput, FailureCategory
- IngestKnowledgeDocResult defined directly in types.ts (avoids circular import from ./ingestion.js)
- types.ts imports: ExternalSourceType, TechStackTag, ExternalSource, AnalyzedFailure for Batch C types
- Linter auto-removes unused `import type` - if adding import + usage across file, must combine import addition + inline removal in single Edit call
- When moving types: do import + remove inline def in ONE edit to avoid linter removing the import before the inline def is removed
- Batch D (private types): 12 types from 8 files moved as import-only (no re-export from source files)
  - chunkingCore.ts: SplitPattern, SplitCandidate
  - costControlsCache.ts: CacheEntry
  - ingestion.ts: BatchEmbedOptions
  - ingestionHelpers.ts: DiffChunkContext, KnowledgeChunkContext (removed KnowledgeDocType direct import)
  - metrics.ts: MetricEntry, IngestionEntry
  - evaluation.ts: SearchFunction
  - testCaseSeeding.ts: TestCaseTemplate
  - githubIssuesConnector.ts: GitHubIssue, GitHubAuthConfig

## RateLimit & Safety Module Audit (2026-02-08)

- `rateLimit/types.ts` - FIXED: added `readonly` to EndpointLimitResult.limit inner fields, TLSSocket.getCipher return type
- `rateLimit/types.ts` - SecurityContext fields intentionally mutable (mutated in middleware.ts runSecurityChecks)
- `rateLimit/types.ts` - BurstTrackingEntry fields intentionally mutable (in-memory tracking state)
- `rateLimit/types.ts` - RateLimitEntry.count intentionally mutable (incremented in SyncRateLimiter)
- `safety/validation/index.ts` - FIXED: added `export type { RedactSensitiveResult } from "./types.js"` to barrel
- `safety/validation/types.ts` - Already has `readonly` on all properties, compliant
- `safety/scoring/riskScoring/inMemoryStore.ts` - Fully compliant (typed errors, proper imports, no console.\*)
- `safety/scoring/riskScoring/storeValidation.ts` - Fully compliant
- `safety/scoring/riskScoring/store.ts` - Fully compliant

## Database Module Audit (2026-02-08)

- **Overall**: Very well-structured. All 14 submodules follow types.ts/helpers.ts/repository.ts/index.ts pattern
- **Submodule barrels** export Row types for sibling use, but top-level `database/index.ts` correctly filters them out
- **No external consumer** imports Row types from database submodules (verified with grep)
- **diffChunk/helpers.ts** - FIXED: removed redundant `export type { SearchConditionsResult }` and `export type { SimilaritySearchQueryResult }` re-exports (dead code, nobody imported from helpers)
- **common.ts** - FIXED: changed `RAGRelevance` import from `../rag/evaluation.js` to `../rag/types.js` (canonical location per types-in-types.ts rule)
- **RAGRelevance duplication**: defined in BOTH `rag/types.ts` AND `rag/evaluation.ts` -- evaluation.ts should import from types.ts (separate rag module fix)
- All repositories return domain objects (not raw rows) -- mapRowTo\* functions in helpers.ts
- All types in types.ts files -- no inline type definitions in module files
- Structured logging via createLogger("scope") -- no console.\*
- Typed errors (ValidationError, NotFoundError) -- no bare `throw new Error()`
- readonly on all interface fields across all types.ts files
- import type used correctly for type-only imports
- Proper barrel exports in all index.ts files

## Shared Package Exports

- See `packages/shared/src/index.ts` for available utilities
- Check before adding any new utility/type/constant

## Core Module Audit (2026-02-07, barrel update 2026-02-08)

- `core/types.ts` - FIXED: added `readonly` to 10+ interfaces (LLMAnalysisResult, ActionProposal, Event, etc.)
- `core/types.ts` - FIXED: moved SignedUrlParams from utils.ts, Logger and StructuredLogEntry from logger.ts
- `core/logger.ts` - FIXED: moved inline LogEntry (renamed StructuredLogEntry) and Logger to types.ts
- `core/utils.ts` - FIXED: moved inline SignedUrlParams to types.ts, now imports from types.ts
- `core/config.ts` - COMPLIANT (no changes needed)
- `core/errors.ts` - COMPLIANT (no changes needed)
- `core/index.ts` - UPDATED: consolidated ALL type exports into single `export type { ... } from "./types.js"` block with 18+ previously missing types added
- `core/concurrency.ts` - COMPLIANT (types already in types.ts)
- PendingWaiter.resolved is intentionally mutable (concurrency semaphore state flag)
- Root barrel `index.ts` auto-updated by linter to mirror core/index.ts type additions
- Linter behavior: when you remove `type X` from a value-export line, linter auto-adds it to the types block if it finds it's exported from the source module

## Integrations Module Audit (2026-02-08)

- **githubAppClient.ts** - FIXED: (1) replaced raw `fetch()` with `resilientGet()` (timeout+retry+circuit breaker), (2) added durationMs timing, (3) added provider/operation/statusCode to logs, (4) added optional RequestContext param, (5) truncateText on error messages, (6) provider "GitHubApp"->"github-app", (7) return type `readonly GitHubRepository[]`, (8) re-throws ExternalServiceError without double-wrapping
- **index.ts** - FIXED: restructured barrel to export directly from source files. Added exports for promptOutputSchema, promptArtifactHelpers, all types from types.ts
- **Test file** - Updated to mock resilientGet instead of global.fetch
- Other 7 files (promptArtifactAnalysis, promptArtifactHelpers, promptArtifactValidation, promptEvidenceFormatters, promptOutputSchema, prompts, tenantPromptConfig, types.ts) - all compliant, no changes needed

## Formatting Module Audit (2026-02-08, full re-audit)

- **aggregation/types.ts** - COMPLIANT (all readonly, proper JSDoc)
- **aggregation/aggregator.ts** - COMPLIANT (uses createLogger, proper imports)
- **aggregation/ranking.ts** - COMPLIANT (previously fixed import ordering)
- **aggregation/signature.ts** - COMPLIANT (pure functions, no inline types)
- **aggregation/primaryFailure.ts** - COMPLIANT (pure functions)
- **aggregation/index.ts** - COMPLIANT (proper barrel, ArtifactWithContext intentionally not exported - internal only)
- **extraction/types.ts** - FIXED: replaced inline `import()` syntax (lines 160, 177) with proper top-level `import type`
- **extraction/parser.ts** - FIXED: (1) empty catch blocks now log at debug level with createLogger, (2) dead code `? 1 : 1` ternary simplified
- **extraction/helpers.ts** - COMPLIANT
- **extraction/extractor.ts** - COMPLIANT
- **extraction/index.ts** - COMPLIANT (proper barrel)
- **analysis/types.ts** - COMPLIANT (all readonly, proper imports from constants/types.js)
- **analysis/resolvers.ts** - COMPLIANT (pure functions, proper import type)
- **analysis/index.ts** - COMPLIANT (proper barrel)
- **index.ts** - References logsage/ that doesn't exist on disk (pre-existing)

## RAG First-Half Audit (2026-02-08)

- **budgetAwareEmbedding.ts** - FIXED: (1) BudgetExceededError now extends AppError instead of plain Error (Rule 3), (2) removed unsafe `as EmbeddingTierName` casts, using `tierSelection.selectedTier` directly instead
- **externalKnowledge.ts** - FIXED: replaced `as string` cast with type predicate filter `(lastSyncAt): lastSyncAt is string`
- All 14 files audited: types already in types.ts, structured logging in place, typed errors, no empty catch blocks, proper `import type` usage, `readonly` on interfaces

## RAG Second-Half Audit (2026-02-08)

- 19 files: githubIssuesConnector, governance, ingestion, ingestionHelpers, linkedCommitIngestion, metrics, multiHop, multiHopTypes, prFixCommentDetector, prFixCommentIngestion, relationshipDetection, reranker, search, searchHelpers, slackResolutionDetector, slackResolutionIngestion, slackResolutionPatterns, streamingUpdates, testCaseSeeding
- **githubIssuesConnector.ts** - FIXED: bare `fetch()` -> `resilientGet` (Hard Rule 6). Added adapter logging + ExternalServiceError
- **ingestionHelpers.ts** - FIXED: split mixed value+type import into separate statements
- **searchHelpers.ts** - FIXED: `import { type X }` -> `import type { X }`
- **prFixCommentIngestion.ts** - FIXED: type imports from `./types.js`
- **linkedCommitIngestion.ts** - FIXED: `IngestKnowledgeDocResult` from `./types.js`
- 14 files already compliant. **RAG module fully audited** (33 files total)

## HTTP Module Audit (2026-02-08)

- **types.ts** - FIXED: `RetryContext.headers` changed to `Readonly<Record<string, string>>` for consistency
- **middleware.ts** - FIXED: (1) replaced default `logger` with `createLogger("http-middleware")`, (2) errorHandler no longer logs AppErrors (error middleware should only log unexpected errors per Rule 10), (3) `duration: \`${duration}ms\``changed to`durationMs`numeric field, (4)`asyncHandler`restructured from`.catch(next)` to async try/catch to satisfy pre-commit hook
- **index.ts** - FIXED: barrel now exports all public types from `types.ts` directly (added HttpMethod, ResilientRequestOptions, ResilientResponse, ValidationSource), removed type re-exports from implementation files
- **circuitBreaker.ts** - FIXED: removed redundant `export type { CircuitBreakerConfig, CircuitBreakerStatus }` re-export (barrel handles it)
- **resilientClient.ts** - FIXED: removed redundant `export type { ResilientRequestOptions, ResilientResponse }` re-export (barrel handles it)
- **validation.ts** - FIXED: removed redundant `export type { Validator, ValidationSchema }` re-export (barrel handles it)
- **Test file** `__tests__/http/validation.test.ts` - FIXED: `type ValidationSchema` now imported from `types.js` instead of `validation.js`
- Pre-commit hook `promise-catch` rule: triggers on `.catch()` anywhere in new_string; asyncHandler must use try/catch pattern instead
- CircuitStateRecord and ResilientCircuitState fields are intentionally mutable (runtime state tracking)
- resilientClient.ts uses raw `fetch` directly -- acceptable since it IS the shared HTTP client infrastructure
- All 155 tests pass after changes

## LLM Module Audit (2026-02-08, full compliance)

- 12 files total: types.ts, index.ts, jsonExtraction.ts, responseParser.ts, responseParserValidation.ts, structuredDataParsers.ts, tokenManager.ts, validation.ts + providers/openai/{client,embedding,errors,types,index}.ts
- **errors.ts** - FIXED: all `new Error()` -> `new LLMError()` (Rule 3), added `{ retryable: true }` to timeout errors
- **types.ts (openai)** - FIXED: `ErrorHandler` returns `LLMError | null` instead of `Error | null`
- **client.ts** - FIXED: (1) timeout passed to `createOpenAIClient(timeout)`, (2) adapter logging with provider/operation/durationMs on success+failure paths, (3) JSDoc `@throws {LLMError}` instead of `@throws {Error}`
- **embedding.ts** - FIXED: provider name lowercase "openai" (was mixed case in ExternalServiceError constructors)
- **openai/index.ts** - FIXED: added type exports from `./types.js` (OpenAIErrorLike, ErrorMessageFactory, ErrorHandler)
- **llm/index.ts** - FIXED: added 6 missing type exports (TestFailureLogShape, LintErrorLogShape, ActionPriority, ValidationLookups, EvidenceValidator, JsonExtractionState)
- **jsonExtraction.ts** - FIXED: empty catch block now has explanatory comment (Rule 11)
- **tokenManager.ts** - FIXED: JSDoc `@throws {ValidationError}` instead of `@throws {Error}`
- 4 files already compliant: types.ts, responseParserValidation.ts, structuredDataParsers.ts, validation.ts
- Vendor SDK `openai` imports confined to adapter files (client.ts, embedding.ts) only - Rule 5 satisfied
- responseParser.ts already uses createLogger, import type, proper patterns - compliant

## Constants Module Refactoring (2026-02-07)

- Created `constants/types.ts` - centralized type definitions for all constant modules
- Split `logsage.ts` (814 lines) into 3 files to stay under 500-line pre-commit limit:
  - `logsage.ts` (~380 lines) - Core: Redis, tiers, TTL, scoring, hashing, fingerprint, queries, defaults, evidence
  - `logsagePatterns.ts` (~330 lines) - Sentinel patterns, expansion rules, stages 1-3, error patterns, weight validation
  - `logsageDecision.ts` (~90 lines) - Budget, tier thresholds, decision defaults, pipeline orchestration
- Moved types from: chunkingPipeline.ts (6 types), githubApp.ts (1), openai.ts (1), logsage.ts (9)
- Updated `formatting/analysis/types.ts` to import from `constants/types.js` instead of `constants/chunkingPipeline.js`
- Pre-commit hook enforces max 500 lines via `.claude/hooks/validate-standards.js`
- `invariant()` from `core/errors.js` replaces `throw new Error()` in weight validation
