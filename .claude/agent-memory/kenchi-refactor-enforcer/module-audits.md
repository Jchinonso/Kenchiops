# Detailed Module Audit Notes

## Actions Module Audit (2026-02-08)

- **types.ts** - FIXED: (1) `duration` renamed to `durationMs` on ActionExecutionResult, (2) `readonly` added to ValidationResult fields
- **actionExecutor.ts** - FIXED: (1) removed redundant type re-exports (barrel handles it), (2) `duration` -> `durationMs` in log fields (3 instances)
- **actionPayloadStore.ts** - FIXED: removed redundant type re-exports (barrel handles it)
- **actionQueueProcessor.ts** - FIXED: (1) removed redundant type re-exports, (2) `result.duration` -> `result.durationMs` in log
- **index.ts** - FIXED: added missing `getActionQueueStatsResult` export
- **Root barrel** - FIXED: added `getActionQueueStatsResult` runtime export + `QueueStatsResult` type export, removed `QueueStats` (was duplicate with queue/types.ts)
- **Test file** - FIXED: `StoredActionPayload` import moved from actionPayloadStore.js to types.js
- **Downstream** - `services/slack-bot/src/handlers/actionHandler.ts`: `result.duration` -> `result.durationMs` (2 instances)
- WorkerState fields (running, activeJobs) intentionally mutable (runtime state tracking)
- QueueStats duplication between actions/types.ts and queue/types.ts -- acceptable, not exported from root barrel

## Core Module Audit (2026-02-07, barrel update 2026-02-08)

- `core/types.ts` - FIXED: added `readonly` to 10+ interfaces (LLMAnalysisResult, ActionProposal, Event, etc.)
- `core/types.ts` - FIXED: moved SignedUrlParams from utils.ts, Logger and StructuredLogEntry from logger.ts
- `core/logger.ts` - FIXED: moved inline LogEntry (renamed StructuredLogEntry) and Logger to types.ts
- `core/utils.ts` - FIXED: moved inline SignedUrlParams to types.ts
- `core/config.ts` - COMPLIANT
- `core/errors.ts` - COMPLIANT
- `core/index.ts` - UPDATED: consolidated ALL type exports
- PendingWaiter.resolved is intentionally mutable (concurrency semaphore state flag)

## Integrations Module Audit (2026-02-08)

- **githubAppClient.ts** - FIXED: raw `fetch()` -> `resilientGet()`, added durationMs/provider/operation/statusCode to logs
- **index.ts** - FIXED: restructured barrel, added missing exports
- Other 7 files compliant

## Formatting Module Audit (2026-02-08)

- **extraction/types.ts** - FIXED: replaced inline `import()` syntax with proper top-level `import type`
- **extraction/parser.ts** - FIXED: empty catch blocks now log at debug level, dead code simplified
- All other files compliant

## HTTP Module Audit (2026-02-08)

- **middleware.ts** - FIXED: replaced default `logger` with `createLogger`, errorHandler no longer logs AppErrors, `duration` -> `durationMs`, asyncHandler restructured from `.catch(next)` to async try/catch
- **index.ts** - FIXED: barrel now exports all public types directly
- Removed redundant re-exports from circuitBreaker.ts, resilientClient.ts, validation.ts
- CircuitStateRecord and ResilientCircuitState fields intentionally mutable

## LLM Module Audit (2026-02-08)

- **errors.ts** - FIXED: all `new Error()` -> `new LLMError()`
- **client.ts** - FIXED: adapter logging with provider/operation/durationMs
- **embedding.ts** - FIXED: provider name lowercase "openai"
- Vendor SDK `openai` imports confined to adapter files only

## Queue Module Audit (2026-02-08)

- `messageQueue.ts` - FIXED: `duration` -> `durationMs`, types from types.ts
- `redisClient.ts` - FIXED: empty catch -> logs warning, `throw new Error()` -> ExternalServiceError
- `slackNotificationProcessor.ts` - FIXED: `duration` -> `durationMs` x3

## Database Module Audit (2026-02-08)

- All 14 submodules compliant
- diffChunk/helpers.ts - removed redundant re-exports
- common.ts - changed RAGRelevance import to canonical location

## RAG Module Audit (2026-02-08, 33 files)

- budgetAwareEmbedding.ts - FIXED: BudgetExceededError extends AppError, removed unsafe casts
- externalKnowledge.ts - FIXED: replaced `as string` with type predicate
- githubIssuesConnector.ts - FIXED: bare `fetch()` -> `resilientGet`
- ingestionHelpers.ts, searchHelpers.ts, prFixCommentIngestion.ts, linkedCommitIngestion.ts - import fixes

## RateLimit & Safety Module Audit (2026-02-08)

- rateLimit/types.ts - FIXED: added `readonly` to inner fields
- safety/validation/index.ts - FIXED: added missing type export
- SecurityContext, BurstTrackingEntry, RateLimitEntry intentionally mutable

## Constants Module (2026-02-07)

- Created `constants/types.ts` for centralized type definitions
- Split `logsage.ts` into 3 files for pre-commit 500-line limit

## Aggregation Module (2026-02-08)

- 10 files all compliant post-refactor. See separate aggregation-audit.md if needed.
