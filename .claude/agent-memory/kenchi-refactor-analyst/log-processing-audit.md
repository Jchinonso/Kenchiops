---
name: Log Processing Strategy Audit
description: Code quality audit findings for Pipeline A/B log processing feature (deploy adapters, ingestion buffer, diagnostics, alert context, incident-triage adapters)
type: project
---

## Log Processing Strategy Audit (2026-03-24)

### Critical (5)

1. **Triplicated helpers** in 3 incident-triage context adapters: `mapAlertContextSeverity`, `buildEmptyAlertContext`, `buildTimeWindow` -- identical in sentry/opsgenie/newrelic context adapters. Promote to `@kenchi/shared/src/alertContext/helpers.ts`.

2. **NRQL injection** in `newRelicContextAdapter.ts:47` -- `serviceName` from alert payload interpolated into NRQL string. Single-quote stripping insufficient. Need allowlist validation.

3. **Unsafe `as unknown as` cast** in `alertAnalysisService.ts:153` -- LLM JSON response double-cast to DiagnosticResult without structural validation.

4. **7 inline interfaces** across 5 files: `ReductionLimits` (truncation.ts), `ChunkedEvidenceInput` (windowedAnalysis.ts), `DeployAnalysisService` (deployAnalysisService.ts), `AlertAnalysisServiceDeps`/`AlertAnalysisService` (alertAnalysisService.ts), `DeployWebhookRouteDeps`/`DeployRouteConfig` (deployWebhookRoutes.ts).

5. **`.push()` in pure functions**: mapper.ts splitActions (3 arrays), correlation.ts correlateEvents, truncation.ts uniformSample, windowedAnalysis.ts buildWindowPromptContext.

### High (8)

- Hardcoded `"free"` plan in quota checks (deployAnalysisService + alertAnalysisService)
- Railway subscribe passes empty API token (`apiToken: ""`)
- Missing `...context` spread in 4+ bufferQueries.ts logger calls
- Webhook verifier skips verification when secret missing (no env check for prod)
- Missing `category` field in all 3 incident-triage context adapter error logs
- `SubscriptionLifecycle` mutable interface without justification comment
- Serial `for...of` + `await` in flushTriggerWorker scan loop (should use pMap)
- Inconsistent `REDIS_STATUS.READY` vs `REDIS_READY_STATUS` usage

### Medium (6)

- `.forEach` + push patterns in windowedAnalysis + alertAnalysisService
- HMAC signature verification duplicated across 4 deploy adapters (identical for 3)
- `CONTEXT_WINDOW_HOURS = 1` duplicated in 3 adapters
- `req.rawBody` untyped (no Express augmentation)
- Railway API URL duplicated between constants and adapter

### Quality Positives

- Proper composition root in `deployContainer.ts`
- All port interfaces use Kenchi-defined types (no vendor types crossing boundaries)
- Proper `readonly` on all port/type interfaces
- Structured logging with `provider`/`operation` consistently
- `redactSecrets` used on all error messages from external calls
- Proper `ExternalServiceError` with `retryable` flag in all deploy adapters
- Fail-open design in buffer operations and budget checks
- `as const` on all constant objects
- `let` justified with comments everywhere
- No `console.log`, no `process.env`, no raw `any`
