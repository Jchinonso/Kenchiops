# Incident Investigation / Chat Integration

## Architecture Reference

**Status:** Implemented
**Last Updated:** 2026-03-30

---

## 1. Overview

When a user asks a question on an incident page in the Copilot Drawer, the chat pipeline runs the full investigation pipeline in parallel with page context and RAG retrieval. This enriches the LLM system prompt with live monitoring evidence, correlated patterns, and an AI-powered diagnosis -- producing responses grounded in real-time data rather than just static alert metadata.

The investigation pipeline:

1. Parses user intent via LLM (extracts symptom, service name, time range)
2. Gathers evidence from 6 monitoring providers + 3 DB sources in parallel
3. Correlates evidence deterministically (timeline, patterns, common factors)
4. Produces an LLM-powered diagnosis with root cause hypothesis and suggested actions

Investigation is enabled automatically when at least one monitoring provider is configured (via `chatContainer.ts`). No feature flag is needed -- the presence of `contextPort.investigateIncident` is the gate. The integration degrades gracefully at every layer. If investigation fails, the chat response falls back to static alert metadata + RAG context.

---

## 2. Architecture Decision: Shared Library Approach

The investigation service, port interfaces, monitoring adapter factories, and search adapter are all in `@kenchi/shared` (`packages/shared/src/investigation/`). Both `services/api/` and `services/incident-triage/` import from the shared package.

This approach was chosen over an HTTP API between services because:

- Zero network overhead -- no inter-service call, no serialization
- The investigation service is a pure function factory with injected port dependencies
- Monitoring adapters are stateless HTTP clients that work from any process
- Cross-service TypeScript imports would fail -- service directories are not configured as project references in `tsconfig.json`
- The composition pattern matches how the chat service itself is wired

A queue-based async approach was also rejected because chat requires synchronous, streaming responses and investigation results must be available before the LLM call starts.

---

## 3. Data Flow

```
User asks "why is the system slow?" on incident page
    |
    v
POST /api/v1/chat/completions
    |
    v
chatStreaming.streamCompletion(deps, input, context)
    |
    |-- Emit `investigation_started` SSE event (if incident page + investigateIncident configured)
    |
    |-- Phase 1: chatPrepare.prepareCompletion()
    |     |-- checkBudgetGuard()
    |     |-- ensureConversation()
    |     |-- loadHistoryAndSaveUserMessage()
    |     +-- buildCompletionPipeline()                   [chatPipeline.ts]
    |           +-- buildFullPipeline()
    |                 |
    |                 |-- [parallel] Promise.all:
    |                 |     |-- fetchPageContext()          [chatContext.ts]
    |                 |     |     -> DB lookup: getAlertById()
    |                 |     |     -> Returns: { title, description, severity, status, serviceName, environment }
    |                 |     |
    |                 |     +-- fetchInvestigationContext() [chatContext.ts]
    |                 |           |
    |                 |           +-- contextPort.investigateIncident()
    |                 |                 |-- investigationService.parseIntent(userMessage)
    |                 |                 |       -> LLM extracts: symptom, service, time range
    |                 |                 |
    |                 |                 |-- investigationService.gatherEvidence(intent, tenantId)
    |                 |                 |       -> [parallel] 3 DB sources + 6 monitoring providers
    |                 |                 |       -> Returns: top 20 evidence items by relevance
    |                 |                 |
    |                 |                 |-- investigationService.correlateEvidence(evidence, intent)
    |                 |                 |       -> Deterministic: timeline, patterns, related services
    |                 |                 |
    |                 |                 +-- investigationService.diagnose(intent, evidence, correlation)
    |                 |                         -> LLM diagnosis: root cause, confidence, actions
    |                 |           |
    |                 |           -> Returns: ChatInvestigationResult
    |                 |
    |                 |-- [sequential] fetchRAGContext()    [chatContext.ts]
    |                 |     -> Enriches RAG query with page context data
    |                 |     -> Vector search on knowledge base
    |                 |     -> Returns: formatted docs + citations
    |                 |
    |                 v
    |           buildSystemPrompt(staticAlertData, ragDocs, investigationResult)
    |
    |-- Emit pre-stream chunks:
    |     |-- conversation_created (if new)
    |     |-- budget_warning (if warning level)
    |     |-- investigation_result (diagnosis for frontend card)
    |     +-- rag_sources (if RAG results)
    |
    |-- Phase 2: collectStreamTokens()
    |     -> LLM generates response with:
    |       - Static alert metadata
    |       - Knowledge base matches
    |       - Live monitoring evidence (Datadog metrics, PagerDuty incidents, etc.)
    |       - Correlated timeline and patterns
    |       - AI-powered diagnosis with root cause hypothesis
    |       - Suggested remediation actions with priority
    |
    +-- Phase 3: finalizeCompletion()
```

---

## 4. File Map

### Shared Package (`packages/shared/src/`)

| File                                   | Role                                                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat/types.ts`                        | `ChatInvestigationResult`, `ChatInvestigationDiagnosis`, `ChatContextPort.investigateIncident`, `ChatStreamChunk` variants (`investigation_started`, `investigation_result`), `CompletionPipeline.investigationResult` |
| `chat/chatContext.ts`                  | `fetchInvestigationContext()` -- fail-safe wrapper, checks page type + port availability (no feature flag -- presence of `investigateIncident` method is the gate)                                                     |
| `chat/chatPipeline.ts`                 | `buildFullPipeline()` -- 2-way `Promise.all` (page context + investigation in parallel), then sequential RAG fetch (enriched with page context)                                                                        |
| `chat/chatStreaming.ts`                | `streamCompletion()` -- emits `investigation_started` SSE event before prepare phase when incident page + `investigateIncident` configured                                                                             |
| `chat/chatPrepare.ts`                  | `prepareCompletion()` -- includes `investigation_result` in pre-stream chunks when pipeline has diagnosis                                                                                                              |
| `chat/helpers.ts`                      | `formatInvestigationSection()`, `buildSystemPrompt()` with optional investigation parameter                                                                                                                            |
| `constants/api.ts`                     | `CHAT_DEFAULTS.MAX_INVESTIGATION_CONTEXT_TOKENS` (4,000), `MAX_INVESTIGATION_EVIDENCE_IN_PROMPT` (10), `MAX_INVESTIGATION_EVIDENCE_SUMMARY_LENGTH` (200)                                                               |
| `core/config.ts`                       | No investigation-specific config -- investigation is auto-enabled based on monitoring provider credentials                                                                                                             |
| `core/types.ts`                        | No investigation-specific config type -- `CHAT_INVESTIGATION_ENABLED` was removed as dead code                                                                                                                         |
| `investigation/service.ts`             | `createInvestigationService()` factory -- orchestrates parseIntent, gatherEvidence, correlateEvidence, diagnose                                                                                                        |
| `investigation/types.ts`               | `InvestigationService`, `InvestigationIntent`, `InvestigationEvidenceItem`, `InvestigationCorrelation`, `InvestigationDiagnosis`, `InvestigationSearchPort`, `LLMCompletionPort`, `INVESTIGATION_LLM_TIMEOUT_MS` (45s) |
| `investigation/monitoringPort.ts`      | `createMonitoringPort()` -- fans out to all configured adapters with bounded concurrency                                                                                                                               |
| `investigation/monitoringTypes.ts`     | `MonitoringPort`, `MonitoringAdapter`, `MonitoringQuery`                                                                                                                                                               |
| `investigation/monitoringConstants.ts` | `MONITORING_DEFAULTS` (15s timeout, 2 retries, 10 results/provider, 4 adapter concurrency)                                                                                                                             |
| `investigation/constants.ts`           | `INVESTIGATION_PIPELINE_DEFAULTS` (72h lookback, 20 max evidence, 25 per-source limit)                                                                                                                                 |
| `investigation/adapters/`              | 6 monitoring adapter factories (see below)                                                                                                                                                                             |

### API Service (`services/api/src/`)

| File                                   | Role                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container/chatContainer.ts`           | `createInvestigationAdapterIfConfigured()` -- wires monitoring adapters, creates investigation service, returns `ChatInvestigationAdapter` or `undefined`       |
| `adapters/chatInvestigationAdapter.ts` | `createChatInvestigationAdapter()` -- 4-stage pipeline bridge: intent -> evidence -> correlate -> diagnose. Formats result for prompt injection and SSE payload |
| `adapters/chatContextAdapter.ts`       | `createChatContextAdapter(investigationAdapter?)` -- exposes optional `investigateIncident` on the `ChatContextPort`                                            |

### Frontend (`services/frontend/src/`)

| File                                             | Role                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/useCopilotChat/types.ts`                  | Frontend-local `ChatStreamChunk` union with `investigation_started` and `investigation_result` variants, `ChatInvestigationDiagnosis` type                               |
| `hooks/useCopilotChat/hooks.ts`                  | SSE chunk handler -- sets `isInvestigating` state on `investigation_started`, clears it and sets `investigationDiagnosis` on `investigation_result`                      |
| `components/CopilotDrawer/InvestigationCard.tsx` | Collapsible card component -- skeleton loader during investigation, renders diagnosis (root cause, confidence, suggested actions with priority labels, evidence sources) |
| `components/CopilotDrawer/CopilotDrawer.tsx`     | Renders `InvestigationCard` above `MessageList` when `isInvestigating` or `investigationDiagnosis` is truthy                                                             |

---

## 5. Monitoring Adapters

Six monitoring adapters in `packages/shared/src/investigation/adapters/`:

| Adapter    | Factory                                                   | Evidence Source Types               |
| ---------- | --------------------------------------------------------- | ----------------------------------- |
| Datadog    | `createDatadogMonitoringAdapter(apiKey, appKey, baseUrl)` | `datadog_metrics`, `datadog_events` |
| PagerDuty  | `createPagerDutyMonitoringAdapter(apiToken)`              | `pagerduty_incidents`               |
| Grafana    | `createGrafanaMonitoringAdapter(apiToken, baseUrl)`       | `grafana_alerts`                    |
| Prometheus | `createPrometheusMonitoringAdapter(baseUrl)`              | `prometheus_alerts`                 |
| Vercel     | `createVercelMonitoringAdapter(apiToken, teamId)`         | `vercel_deployments`                |
| Netlify    | `createNetlifyMonitoringAdapter(apiToken, siteId)`        | `netlify_deploys`                   |

Each adapter:

- Implements the `MonitoringAdapter` interface (`name`, `isConfigured()`, `fetchEvidence()`)
- Returns `[]` on any error (never throws)
- Uses shared `httpClient` with `MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS` (15s) and `MONITORING_DEFAULTS.MAX_RETRIES` (2)
- Caps results to `MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER` (10)
- Maps symptom to provider-specific queries using `SYMPTOM_METRIC_QUERIES` (Datadog) or `SYMPTOM_PROMQL_QUERIES` (Prometheus)
- Sanitizes service names via `sanitizeServiceName()` to prevent query injection

The monitoring port (`createMonitoringPort()`) fans out to all configured adapters with `MONITORING_DEFAULTS.ADAPTER_CONCURRENCY` (4) bounded concurrency using `mapWithConcurrency`.

---

## 6. Dependency Graph

```
chatContainer.ts (composition root)
    |
    |-- createInvestigationAdapterIfConfigured()
    |     |-- createDatadogMonitoringAdapter()       [from @kenchi/shared]
    |     |-- createPagerDutyMonitoringAdapter()      [from @kenchi/shared]
    |     |-- createGrafanaMonitoringAdapter()         [from @kenchi/shared]
    |     |-- createPrometheusMonitoringAdapter()      [from @kenchi/shared]
    |     |-- createVercelMonitoringAdapter()           [from @kenchi/shared]
    |     |-- createNetlifyMonitoringAdapter()          [from @kenchi/shared]
    |     |-- createMonitoringPort(adapters)            [from @kenchi/shared]
    |     |-- createLLMCompletionAdapter()              [from @kenchi/shared]
    |     |-- createInvestigationSearchAdapter()       [from @kenchi/shared]
    |     |-- createInvestigationService(llm, search, monitoring)  [from @kenchi/shared]
    |     +-- createChatInvestigationAdapter(investigationService) [local]
    |
    +-- createChatContextAdapter(investigationAdapter?)  [local]
          |
          +-- ChatContextPort.investigateIncident
                -> delegates to investigationAdapter.investigate()
```

All monitoring adapter factories, the investigation service factory, and the monitoring port factory are imported from `@kenchi/shared`. Only the chat-specific bridge adapters (`chatInvestigationAdapter`, `chatContextAdapter`) live in `services/api/`.

---

## 7. SSE Event Sequence

For an incident page chat with investigation enabled:

```
1. investigation_started           <- immediate, before prepare phase
2. conversation_created            <- if new conversation
3. budget_warning                  <- if budget ratio > warning threshold
4. investigation_result            <- after pipeline completes, before LLM streaming
5. rag_sources                     <- if RAG results found
6. token (repeated)                <- LLM response tokens
7. done                            <- stream complete
```

The `investigation_started` event is emitted immediately in `chatStreaming.ts` (before the prepare phase begins) so the frontend can show a skeleton loading card. The `investigation_result` event is emitted during the pre-stream chunk phase in `chatPrepare.ts` after the pipeline builds.

---

## 8. System Prompt Structure

When investigation results are available, the system prompt is assembled in this order by `buildSystemPrompt()`:

1. **Base system prompt** -- Copilot role definition and guardrails (~300 tokens)
2. **Static alert context** -- title, description, severity, status, serviceName, environment (~200 tokens)
3. **Investigation results** -- live diagnosis, evidence, patterns, suggested actions (up to 4,000 tokens)
4. **RAG context** -- knowledge base matches and past resolutions (~2,000 tokens)

Investigation context is placed between static alert data and RAG results because:

- Static alert data sets the scene (what alert fired)
- Investigation data provides the analysis (what the evidence shows)
- RAG provides supplementary reference material (runbooks, past resolutions)

---

## 9. Token Budget

The investigation context is truncated by `formatInvestigationForPrompt()` in the chat investigation adapter:

```typescript
truncateText(
  formatted,
  CHAT_DEFAULTS.MAX_INVESTIGATION_CONTEXT_TOKENS * CHAT_DEFAULTS.CHARS_PER_TOKEN
);
```

This caps investigation context at ~16,000 characters (~4,000 tokens), leaving room for the base system prompt, static alert context, RAG context, and conversation history within the overall `MAX_CONTEXT_TOKENS` (24,000) budget.

The existing `trimMessagesToFit()` in `chatPipeline.ts` already accounts for system prompt size when trimming history messages. A larger system prompt (due to investigation context) means fewer history messages fit in the window, which is the correct behavior.

Constants in `CHAT_DEFAULTS` (`packages/shared/src/constants/api.ts`):

| Constant                                    | Value  | Purpose                                                      |
| ------------------------------------------- | ------ | ------------------------------------------------------------ |
| `MAX_INVESTIGATION_CONTEXT_TOKENS`          | 4,000  | Truncation budget for investigation section in system prompt |
| `MAX_INVESTIGATION_EVIDENCE_IN_PROMPT`      | 10     | Max evidence items included in the formatted prompt          |
| `MAX_INVESTIGATION_EVIDENCE_SUMMARY_LENGTH` | 200    | Per-evidence-item summary truncation limit (characters)      |
| `MAX_CONTEXT_TOKENS`                        | 24,000 | Overall conversation message budget (unchanged)              |
| `CHARS_PER_TOKEN`                           | 4      | Token estimation ratio                                       |

---

## 10. Timeout and Performance Budget

| Operation                  | Timeout                  | Expected P50 | Expected P95 |
| -------------------------- | ------------------------ | ------------ | ------------ |
| Parse intent (LLM)         | 45s                      | 1.5s         | 4s           |
| Gather evidence (parallel) | 15s per adapter          | 2s           | 6s           |
| Correlate evidence (CPU)   | --                       | <50ms        | <100ms       |
| Diagnose (LLM)             | 45s                      | 2s           | 5s           |
| **Total investigation**    | **~90s theoretical max** | **~5s**      | **~12s**     |

There is no single outer `Promise.race` wrapping the investigation pipeline. The 45s `INVESTIGATION_LLM_TIMEOUT_MS` applies individually to each LLM call (intent parsing and diagnosis). Evidence gathering runs between the two LLM calls with its own 15s per-adapter timeout. In the worst case, both LLM calls could each take 45s, making the theoretical maximum ~90s. Evidence gathering overlaps with neither LLM call, but its 15s timeout is dwarfed by the LLM timeouts.

The `fetchInvestigationContext` wrapper in `chatContext.ts` has a try/catch but no timeout of its own. Adding an outer `Promise.race` with a total budget (e.g., 60s) would cap worst-case latency and is a recommended improvement.

Investigation runs in the first `Promise.all` alongside page context (but not RAG -- RAG runs sequentially after page context to enable query enrichment). Investigation does not add to the critical path unless it exceeds the combined page context + sequential RAG fetch time (~1-2s). In practice, investigation is typically the bottleneck, adding ~3-10s of latency before the first LLM token.

The `investigation_started` SSE event provides immediate feedback via a skeleton loading card, so the user sees activity while waiting.

---

## 11. Rate Limiting

Investigation makes 2 LLM calls (intent + diagnosis) plus up to 10 external monitoring API calls per chat message. The existing chat rate limits (`rateLimitByCategory("expensive")` = 10 req/min/tenant) bound this to:

| Resource                       | Per Chat Message                          | Max Per Minute (10 req) |
| ------------------------------ | ----------------------------------------- | ----------------------- |
| LLM calls (intent + diagnosis) | 2                                         | 20                      |
| Monitoring API calls           | up to 10 (6 providers, some make 2 calls) | up to 100               |
| DB queries (evidence)          | up to 3 sources x 1 query each            | up to 30                |

This is within acceptable bounds. Datadog and PagerDuty have generous rate limits (typically 300-600 req/min). The per-tenant chat rate limit provides sufficient protection.

---

## 12. Error Handling and Degradation

| Failure Mode                          | Behavior                                                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All monitoring adapters unconfigured  | `createInvestigationAdapterIfConfigured()` returns `undefined`; `investigateIncident` is not set on the port; chat works without investigation                             |
| No monitoring providers configured    | `investigateIncident` is not set on port; `fetchInvestigationContext()` returns `null` immediately                                                                         |
| Investigation LLM timeout             | Adapter catches, returns `null`, chat uses static context + RAG                                                                                                            |
| One monitoring adapter fails          | That adapter returns `[]`, others contribute evidence normally                                                                                                             |
| All monitoring adapters fail          | Evidence is DB-only (past incidents, analyses, triage results)                                                                                                             |
| Diagnosis LLM fails                   | Falls back to `generateFallbackDiagnosis()` (symptom-based heuristic, `diagnosisSource: "fallback"`, confidence: 0.2)                                                      |
| Investigation throws unexpected error | `fetchInvestigationContext()` catches via try/catch, returns `null`, chat continues. Note: there is no outer timeout -- each LLM call has its own 45s timeout individually |
| Parse intent fails                    | Falls back to `FALLBACK_INTENT` (symptom: `"unknown"`, broad evidence search)                                                                                              |

Every failure path returns `null` or a degraded result. The chat response is never blocked or broken by investigation failures. The `fetchInvestigationContext` wrapper in `chatContext.ts` guarantees this with its try/catch pattern, matching the existing `fetchPageContext` and `fetchRAGContext` fail-safe wrappers.

---

## 13. Activation Gate

Investigation is activated automatically based on configuration -- no feature flag is required. The gate operates at two levels:

1. **`chatContainer.ts`** -- `createInvestigationAdapterIfConfigured()` checks if at least one monitoring provider has API credentials configured. If none are configured, it returns `undefined`, and `investigateIncident` is not set on the `ChatContextPort`.
2. **`chatStreaming.ts`** / **`chatContext.ts`** -- both check `contextPort?.investigateIncident` (method existence) plus `pageType === "incident"` and `entityId` presence. If any condition is false, investigation is skipped with zero overhead.

The `CHAT_INVESTIGATION_ENABLED` config entry has been removed from both `config.ts` and `types.ts` as it was dead code.

The frontend `InvestigationCard` component is inherently gated on the `investigation_result` SSE event -- if the backend does not emit it, nothing renders.

---

## 14. Frontend Rendering

The `InvestigationCard` component (`services/frontend/src/components/CopilotDrawer/InvestigationCard.tsx`) has two states:

**Loading state** (when `isInvestigating` is true and `diagnosis` is null):

```
+----------------------------------------------------+
| [pulse icon] Investigating incident...             |
| [skeleton bar]                                      |
| [skeleton bar]                                      |
+----------------------------------------------------+
```

**Results state** (when `diagnosis` is available):

```
+----------------------------------------------------+
| [shield] Investigation Results   Confidence: 87%    |
|                                                      |
| Root Cause: Database connection pool exhaustion      |
| due to long-running queries from the reporting       |
| service saturating all available connections.         |
|                                                      |
| Suggested Actions:                                   |
| [URGENT] Scale up DB connection pool limit           |
| [URGENT] Kill long-running reporting queries         |
| [SHORT-TERM] Add query timeout to reporting svc      |
|                                                      |
| Evidence: datadog_metrics, pagerduty_incidents       |
+----------------------------------------------------+
```

The card is collapsible (header always visible, body toggles). It renders above the `MessageList` in `CopilotDrawer.tsx`. Priority labels are color-coded: `immediate` = red, `short_term` = amber, `long_term` = blue.

The `ChatInvestigationDiagnosis` type sent to the frontend intentionally omits the `reasoning` field from `SuggestedInvestigationAction`. The reasoning is embedded in the `formattedContext` for the LLM prompt but excluded from the SSE payload to reduce bandwidth.

---

## 15. Test Coverage

### Unit Tests

| Test                                     | File                               | Assertions                                                                                       |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `formatInvestigationForPrompt`           | `chatInvestigationAdapter.test.ts` | Correct markdown structure, truncation at token limit, empty evidence handling                   |
| `formatInvestigationSection`             | `helpers.test.ts`                  | Guards against null/failed results, returns empty string on failure                              |
| `buildSystemPrompt` with investigation   | `helpers.test.ts`                  | Investigation section appears between alert context and RAG context                              |
| `fetchInvestigationContext`              | `chatContext.test.ts`              | Returns null for non-incident pages, returns null when port/method not available, catches errors |
| `createInvestigationAdapterIfConfigured` | `chatContainer.test.ts`            | Returns undefined when no adapters configured                                                    |

### Integration Tests

| Test                                  | Assertions                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Chat completion with investigation    | Full SSE stream includes `investigation_started` + `investigation_result` events before tokens |
| Chat completion without investigation | No investigation events, response unchanged                                                    |
| Investigation timeout                 | Chat completes with static context only, no error event                                        |
| Partial monitoring failure            | Investigation completes with partial evidence                                                  |

### Frontend Tests

| Test                                   | Assertions                                 |
| -------------------------------------- | ------------------------------------------ |
| `investigation_started` chunk handling | Sets `isInvestigating` to true             |
| `investigation_result` chunk handling  | Clears `isInvestigating`, sets diagnosis   |
| Unknown chunk type resilience          | Does not throw on unrecognized chunk types |

### Manual Testing

1. Configure at least one monitoring provider (e.g., Prometheus against local Docker stack)
2. Create a test incident alert
3. Navigate to incident page in frontend
4. Ask "why is the system slow?" in Copilot
5. Verify: skeleton card appears, investigation card renders, response references live evidence

---

## 16. Known Limitations

- **Latency**: Investigation adds 3-10s to first-token latency on incident pages. A progressive enhancement approach (start LLM streaming immediately with static context, inject investigation results mid-stream) would reduce perceived latency but requires two LLM calls and significant frontend complexity.
- **No runtime toggle**: Investigation is auto-enabled when monitoring providers are configured. There is no runtime feature flag to disable it without removing provider credentials.
- **Frontend type duplication**: The frontend maintains its own copy of `ChatStreamChunk` and `ChatInvestigationDiagnosis` types (in `hooks/useCopilotChat/types.ts`) because the frontend Docker build context does not include the shared package. These must be kept in sync manually (marked with a `SYNC` comment).
- **No per-provider rate limiting**: Monitoring API usage per tenant is not rate-limited beyond the overall chat rate limit. If a single tenant makes excessive requests, all their monitoring API calls go through. Per-provider rate limits should be added if abuse is observed.
- **No outer timeout on investigation pipeline**: The investigation pipeline has no single `Promise.race` wrapping all four stages. Each LLM call has a 45s timeout individually, but the total worst-case is ~90s (two LLM calls at max timeout). Adding an outer timeout (e.g., 60s) to `fetchInvestigationContext` would cap worst-case latency.
- **Investigation runs on every message**: When the user is on an incident page with investigation configured, investigation runs on every chat message in that conversation, not just the first. This could be optimized to cache investigation results per incident for a TTL window.

---

## Appendix: System Prompt Example

When investigation results are injected into the system prompt, the formatted section looks like:

```markdown
## Live Investigation Results

### Diagnosis

**Root Cause Hypothesis:** Database connection pool exhaustion due to long-running queries
from the reporting service saturating all available connections.
**Confidence:** 87%
**Symptom Detected:** slow response
**Affected Service:** api-gateway

### Suggested Actions

- [URGENT] Scale up database connection pool limit from 10 to 25
- [URGENT] Kill long-running reporting queries exceeding 30s timeout -- this is causing connection starvation
- [SHORT-TERM] Add query timeout configuration to the reporting service
- [LONG-TERM] Implement connection pool monitoring with alerting on utilization > 80%

### Monitoring Evidence

- [datadog_metrics] API Gateway p95 latency spike (relevance: 95%)
  Average response time increased from 120ms to 4,200ms starting at 14:23 UTC
- [pagerduty_incidents] DB Connection Pool Exhaustion (relevance: 92%)
  Triggered at 14:25 UTC, service: api-gateway, severity: critical
- [prometheus_alerts] PostgresConnectionsHigh firing (relevance: 88%)
  Active connections: 10/10 (100% utilization) for service postgres-primary

### Detected Patterns

- Recurring failures in api-gateway service (5 incidents in 24h)
- Correlation between reporting service cron job (14:20 UTC) and latency spike (14:23 UTC)

### Related Services: api-gateway, reporting-service, postgres-primary
```
