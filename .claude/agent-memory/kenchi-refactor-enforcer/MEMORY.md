# Kenchi Refactor Enforcer - Agent Memory

## Quick Links

- [Detailed module audit notes](module-audits.md)

## Pre-commit Hook Behavior

- Hook at `.claude/hooks/validate-standards.js` validates `new_string` of Edit calls in isolation
- `missing-duration-ms` rule triggers on logger calls whose message contains: "call", "request", "response", "api", "external" (case-insensitive) without `durationMs` within 150 chars
- `promise-catch` rule: triggers on `.catch()` anywhere in new_string; use try/catch instead
- Hook checks per-edit, not per-file; enforces max 500 lines

## Module Type Locations (types.ts files)

- `actions/types.ts` - ActionExecutionContext, ActionExecutionResult, StoredActionPayload, QueueStats, WorkerOptions
- `http/types.ts` - CircuitBreaker, ResilientClient, Validator, ValidationSchema
- `llm/types.ts` - LLM provider types, OpenAIConfig, EmbeddingClientConfig, etc.
- `llm/providers/openai/types.ts` - OpenAIErrorLike, ErrorMessageFactory, ErrorHandler
- `finetuning/types.ts` - Model versioning, dataset, fine-tuning types
- `integrations/types.ts` - ArtifactAnalysisPrompt, TenantPromptConfig, TechStackConfig
- `safety/validation/types.ts` - RedactSensitiveResult
- `rateLimit/types.ts` - (1300+ lines) SecurityContext, BurstDetection, BotDetection
- `rag/types.ts` - 100+ types from all RAG submodules
- `safety/scoring/riskScoring/types.ts` - Risk scoring types
- `database/*/types.ts` - Per-submodule types (14 submodules)
- `cache/types.ts` - 30+ types (CacheEntry, CachedPullRequest, etc.)
- `constants/types.ts` - Centralized types for constant modules
- `aggregation/types.ts` - 40+ types (AggregationKey, AggregatedFailures, etc.)

## Logger Patterns

- `createLogger(scope)` takes string scope only (not context as 2nd param)
- Actual signature: `createLogger(serviceName: string, minLevel?: LogLevel): Logger`
- Use `const logger = createLogger("descriptive-scope")` at module level

## Pre-existing Issues

- LogSage formatting module (`formatting/logsage/`) does not exist on disk (only in `dist/`)
- `formatting/index.ts` references logsage barrel that doesn't exist on disk

## Fully Audited & Compliant Modules (2026-02-08)

All below fully audited. See [module-audits.md](module-audits.md) for fix details.

- **actions/** (5 files) - Fixed: durationMs, readonly, redundant re-exports, barrel completeness
- **core/** (7 files) - Fixed: readonly, types->types.ts, barrel consolidated
- **constants/** (14+ files), **database/** (14 submodules) - All compliant
- **formatting/** (aggregation, extraction, analysis) - Fixed: empty catches, import types
- **http/** (6 files) - Fixed: middleware logging, barrel exports, redundant re-exports
- **integrations/** (10 files) - Fixed: githubAppClient fetch->resilientGet, barrel
- **llm/** (12 files) - Fixed: typed errors, adapter logging, barrel exports
- **queue/** (5 files) - Fixed: durationMs, typed errors, async/await
- **rag/** (33 files) - Fixed: fetch->resilientGet, import fixes, typed errors
- **rateLimit/** (3 files), **safety/** (4 files) - Fixed: readonly, barrel type export
- **aggregation/** (10 files), **health/**, **security/**, **shutdown/** - All compliant

## Key Refactoring Patterns

### Redundant Re-exports

- Module files should NOT re-export types from types.ts; barrel index.ts handles all exports
- When removing re-exports, update test files that imported types from implementation files

### Duration Field Naming

- Log fields: always `durationMs` (never `duration`)
- Type fields: `durationMs` (renamed from `duration` in ActionExecutionResult)
- `ResilientResponse.duration` is the HTTP client's field name (unchanged)

### Intentionally Mutable Fields

- WorkerState (running, activeJobs), CircuitStateRecord, ResilientCircuitState
- SecurityContext, BurstTrackingEntry, RateLimitEntry, PendingWaiter.resolved

### QueueStats Duplication

- Identical in `queue/types.ts` and `actions/types.ts`, NOT exported from root barrel
- `QueueStatsResult` exported from actions only

### Type Migration Pattern

- Move types: do import + remove inline def in ONE edit (linter auto-removes unused imports)
- Linter auto-adds type to types block when removing from value-export line

## Adapter Logging Requirements

- Provider lowercase: "openai" not "OpenAI"
- Required: provider, operation, durationMs, statusCode (if available)
- Error handlers need durationMs passed as param from caller

## Shared Package Exports

- See `packages/shared/src/index.ts` for available utilities
- Check before adding any new utility/type/constant
