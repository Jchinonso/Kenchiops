# Incident Investigation ↔ Chat Integration

## Implementation Design Document

**Status:** Proposed
**Author:** Engineering
**Date:** 2026-03-23

---

## 1. Problem Statement

When a user asks "why is the system slow?" in the Copilot chat on an incident page, the system only has access to the **static alert record** (title, description, severity, status, service name, environment) and **RAG knowledge base docs**. It cannot query live monitoring data from Datadog, PagerDuty, Grafana, Prometheus, Vercel, or Netlify.

Meanwhile, a full **investigation pipeline** already exists in `services/incident-triage/` that can:

- Parse user intent via LLM (extract symptom, service, time range)
- Gather evidence from 6 monitoring providers + 3 DB sources in parallel
- Correlate evidence deterministically (timeline, patterns, common factors)
- Produce an LLM-powered diagnosis with root cause hypothesis and suggested actions

These two systems are completely disconnected. The investigation service runs in a separate process with no API exposure to the chat service.

---

## 2. Goal

Wire the investigation pipeline into the chat context enrichment flow so that incident-page chat questions get **live monitoring evidence and AI-powered diagnosis** — not just static alert metadata and knowledge base matches.

### Success Criteria

- User asks "why is the system slow?" on an incident page → response includes live metrics, correlated evidence, and actionable diagnosis
- Investigation adds ≤8 seconds to first-token latency (monitoring calls are bounded at 15s timeout each, but run in parallel)
- Zero impact on non-incident chat (analysis pages, overview, knowledge-base pages)
- Graceful degradation: if investigation fails, falls back to current behavior (static alert + RAG)
- No modifications to the investigation service itself — it's already well-designed for this

---

## 3. Architecture Decision

### Option A: HTTP API Between Services (Rejected)

Add a `/api/v1/investigate` endpoint to `incident-triage` service, call it from the API service's chat context adapter.

**Why rejected:**

- Adds network hop + serialization overhead
- Requires service discovery / URL config (`INCIDENT_TRIAGE_URL`)
- `incident-triage` currently has no inbound HTTP endpoints for inter-service calls
- Error handling becomes more complex (network failures, timeouts, retries)

### Option B: Shared Library Approach (Selected)

Import the investigation service factory and its adapters directly into the API service. Both services already share the same database and Redis instance. The monitoring adapters are stateless HTTP clients — they work from any process.

**Why selected:**

- Zero network overhead
- Same composition pattern already used for chat service wiring
- Monitoring adapters are self-contained (just need env vars for API keys)
- Investigation service is a pure function factory with injected dependencies
- Both services already share `@kenchi/shared` and run in the same Docker network

### Option C: Queue-Based Async (Rejected for Real-Time Chat)

Enqueue an investigation job, poll for results.

**Why rejected:**

- Chat requires synchronous, streaming responses
- Investigation results must be available before the LLM call starts
- Adds latency and complexity for a real-time use case

---

## 4. Current State (Before)

```
User asks "why is the system slow?" on incident page
    │
    ▼
POST /api/v1/chat/completions
    │
    ▼
chatService.streamCompletion()
    │
    ├─ [parallel] contextPort.getIncidentContext(alertId)
    │       → DB lookup: getAlertById()
    │       → Returns: { title, description, severity, status, service, env }
    │
    └─ [parallel] contextPort.searchRAG(userMessage)
            → Vector search on knowledge base
            → Returns: formatted docs + citations
    │
    ▼
buildSystemPrompt(staticAlertData, ragDocs)
    │
    ▼
LLM generates response with ONLY:
  - Static alert metadata
  - Knowledge base matches
  - No live metrics, no correlated evidence, no diagnosis
```

---

## 5. Target State (After)

```
User asks "why is the system slow?" on incident page
    │
    ▼
POST /api/v1/chat/completions
    │
    ▼
chatService.streamCompletion()
    │
    ├─ [parallel] contextPort.getIncidentContext(alertId)
    │       → DB lookup (unchanged)
    │       → Returns: static alert data
    │
    ├─ [parallel] contextPort.searchRAG(userMessage)
    │       → Vector search (unchanged)
    │       → Returns: knowledge docs
    │
    └─ [parallel] contextPort.investigateIncident(userMessage, alertRecord) ← NEW
            │
            ├─ investigationService.parseIntent(userMessage)
            │       → LLM extracts: symptom, service, time range
            │
            ├─ investigationService.gatherEvidence(intent, tenantId)
            │       → [parallel] 4 DB sources + 6 monitoring providers
            │       → Returns: top 20 evidence items by relevance
            │
            ├─ investigationService.correlateEvidence(evidence, intent)
            │       → Deterministic: timeline, patterns, related services
            │
            └─ investigationService.diagnose(intent, evidence, correlation)
                    → LLM diagnosis: root cause, confidence, actions
            │
            → Returns: ChatInvestigationResult
    │
    ▼
buildSystemPrompt(staticAlertData, ragDocs, investigationResult) ← ENHANCED
    │
    ▼
LLM generates response with:
  - Static alert metadata
  - Knowledge base matches
  - Live monitoring evidence (Datadog metrics, PagerDuty incidents, etc.)
  - Correlated timeline and patterns
  - AI-powered diagnosis with root cause hypothesis
  - Suggested remediation actions with priority
```

---

## 6. Implementation Plan

### Phase 1: Types and Port Interface Extension

**File:** `packages/shared/src/chat/types.ts`

Add investigation-related types to the chat type system:

```typescript
/**
 * Result of running the investigation pipeline for chat context enrichment.
 * Contains the full investigation output formatted for prompt injection.
 */
export interface ChatInvestigationResult {
  /** Formatted markdown section for the system prompt */
  readonly formattedContext: string;
  /** Structured diagnosis for potential frontend display */
  readonly diagnosis: ChatInvestigationDiagnosis | null;
  /** Evidence items surfaced during investigation */
  readonly evidenceCount: number;
  /** Whether the investigation completed successfully */
  readonly success: boolean;
}

export interface ChatInvestigationDiagnosis {
  readonly summary: string;
  readonly rootCauseHypothesis: string;
  readonly confidence: number;
  readonly suggestedActions: ReadonlyArray<{
    readonly action: string;
    readonly priority: "immediate" | "short_term" | "long_term";
  }>;
  readonly evidenceSources: ReadonlyArray<string>;
}
```

Extend `ChatContextPort` with an optional investigation method:

```typescript
export interface ChatContextPort {
  // ... existing methods unchanged ...

  /**
   * Run the full investigation pipeline for an incident.
   * Optional — returns null if investigation is not configured or fails.
   * Must not throw — always degrades gracefully.
   */
  readonly investigateIncident?: (
    userMessage: string,
    alertId: string,
    tenantId: string,
    context: RequestContext
  ) => Promise<ChatInvestigationResult | null>;
}
```

Making `investigateIncident` optional (`?`) ensures:

- Existing `ChatContextPort` implementations don't break
- Chat service degrades gracefully if investigation is not wired
- Tests don't need to mock investigation unless testing it specifically

**File:** `packages/shared/src/chat/index.ts`

Add new type exports to the barrel.

---

### Phase 2: Chat Stream Chunk Extension

**File:** `packages/shared/src/chat/types.ts`

Add a new SSE event type for investigation results:

```typescript
export type ChatStreamChunk =
  | { readonly type: "token"; readonly content: string }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly error: string }
  | { readonly type: "conversation_created"; readonly conversationId: string }
  | { readonly type: "rag_sources"; readonly sources: ReadonlyArray<ChatRAGSource> }
  | {
      readonly type: "investigation_result";
      readonly diagnosis: ChatInvestigationDiagnosis | null;
    }; // ← NEW
```

This lets the frontend display investigation results (diagnosis summary, confidence, suggested actions) in a structured card, separate from the streaming text response.

---

### Phase 3: Investigation Context Formatter

**File:** `packages/shared/src/chat/helpers.ts`

Add a function to format investigation results for the system prompt:

```typescript
export const formatInvestigationSection = (result: ChatInvestigationResult): string => {
  if (!result.success || !result.formattedContext) {
    return "";
  }
  return result.formattedContext;
};
```

The heavy formatting is done in the adapter (Phase 5). The helper is intentionally thin — it just guards against empty/failed results.

Update `buildSystemPrompt` to accept an optional investigation result:

```typescript
export const buildSystemPrompt = (
  pageContextData: ChatContextData | null,
  ragResult: ChatRAGResult | null,
  investigationResult?: ChatInvestigationResult | null // ← NEW optional param
): string => {
  const sections: readonly string[] = [
    BASE_SYSTEM_PROMPT,
    pageContextData ? formatPageContextSection(pageContextData) : "",
    investigationResult ? formatInvestigationSection(investigationResult) : "", // ← NEW
    ragResult?.formattedContext ?? "",
  ].filter(Boolean);

  return sections.join("\n\n");
};
```

**Prompt ordering rationale:** Investigation context goes between the static alert data and RAG results because:

1. Static alert data sets the scene (what alert fired)
2. Investigation data provides the analysis (what the evidence shows)
3. RAG provides supplementary reference material (runbooks, past resolutions)

---

### Phase 4: Investigation Adapter

**New file:** `services/api/src/adapters/chatInvestigationAdapter.ts`

This adapter bridges the investigation service (from `incident-triage`) into the chat context port interface.

```typescript
import type { RequestContext } from "@kenchi/shared";
import type { ChatInvestigationResult } from "@kenchi/shared/chat";
import type { InvestigationService } from "../../incident-triage/src/types/investigationTypes.js";
import { createLogger, startTimer, truncate, redactSecrets } from "@kenchi/shared";

const INVESTIGATION_CHAT_TIMEOUT_MS = 45_000;
const MAX_EVIDENCE_IN_PROMPT = 10;
const MAX_EVIDENCE_SUMMARY_LENGTH = 200;

export const createChatInvestigationAdapter = (investigationService: InvestigationService) => ({
  investigate: async (
    userMessage: string,
    alertId: string,
    tenantId: string,
    context: RequestContext
  ): Promise<ChatInvestigationResult | null> => {
    const logger = createLogger("chat-investigation-adapter", context);
    const timer = startTimer();

    try {
      // Stage 1: Parse user intent
      const intent = await investigationService.parseIntent(userMessage, context);

      logger.info("Investigation intent parsed", {
        provider: "openai",
        operation: "parseInvestigationIntent",
        durationMs: timer.elapsedMs(),
        symptom: intent.symptom,
        confidenceScore: intent.confidenceScore,
        ...context,
      });

      // Stage 2: Gather evidence (parallel DB + monitoring)
      const evidence = await investigationService.gatherEvidence(intent, tenantId, context);

      // Stage 3: Correlate evidence (deterministic, fast)
      const correlation = await investigationService.correlateEvidence(evidence, intent, context);

      // Stage 4: LLM diagnosis
      const diagnosis = await investigationService.diagnose(intent, evidence, correlation, context);

      const durationMs = timer.elapsedMs();
      logger.info("Investigation completed for chat", {
        provider: "openai",
        operation: "chatInvestigation",
        durationMs,
        evidenceCount: evidence.length,
        diagnosisConfidence: diagnosis.confidence,
        diagnosisSource: diagnosis.diagnosisSource,
        ...context,
      });

      // Format for prompt injection
      const formattedContext = formatInvestigationForPrompt(
        intent,
        evidence,
        correlation,
        diagnosis
      );

      return {
        formattedContext,
        diagnosis: {
          summary: diagnosis.summary,
          rootCauseHypothesis: diagnosis.rootCauseHypothesis,
          confidence: diagnosis.confidence,
          suggestedActions: diagnosis.suggestedActions.map((a) => ({
            action: a.action,
            priority: a.priority,
          })),
          evidenceSources: [...new Set(evidence.map((e) => e.source))],
        },
        evidenceCount: evidence.length,
        success: true,
      };
    } catch (error) {
      const durationMs = timer.elapsedMs();
      logger.warn("Investigation failed for chat, falling back to static context", {
        provider: "openai",
        operation: "chatInvestigation",
        durationMs,
        error: redactSecrets(String(error)),
        ...context,
      });

      return null; // Graceful degradation — chat continues without investigation
    }
  },
});
```

**Prompt formatter** (same file):

```typescript
const formatInvestigationForPrompt = (
  intent: InvestigationIntent,
  evidence: readonly InvestigationEvidenceItem[],
  correlation: InvestigationCorrelation,
  diagnosis: InvestigationDiagnosis
): string => {
  const sections: string[] = [];

  sections.push("## Live Investigation Results");
  sections.push("");

  // Diagnosis summary
  sections.push("### Diagnosis");
  sections.push(`**Root Cause Hypothesis:** ${diagnosis.rootCauseHypothesis}`);
  sections.push(`**Confidence:** ${Math.round(diagnosis.confidence * 100)}%`);
  sections.push(`**Symptom Detected:** ${intent.symptom.replace(/_/g, " ")}`);

  if (intent.serviceName) {
    sections.push(`**Affected Service:** ${intent.serviceName}`);
  }

  // Suggested actions
  if (diagnosis.suggestedActions.length > 0) {
    sections.push("");
    sections.push("### Suggested Actions");
    diagnosis.suggestedActions.forEach((action) => {
      const priorityLabel =
        action.priority === "immediate"
          ? "[URGENT]"
          : action.priority === "short_term"
            ? "[SHORT-TERM]"
            : "[LONG-TERM]";
      sections.push(`- ${priorityLabel} ${action.action}`);
    });
  }

  // Top evidence items (capped to avoid token bloat)
  const topEvidence = evidence.slice(0, MAX_EVIDENCE_IN_PROMPT);
  if (topEvidence.length > 0) {
    sections.push("");
    sections.push("### Monitoring Evidence");
    topEvidence.forEach((item) => {
      const summary = truncate(item.summary, MAX_EVIDENCE_SUMMARY_LENGTH);
      sections.push(
        `- [${item.source}] ${item.title} (relevance: ${Math.round(item.relevance * 100)}%)`
      );
      sections.push(`  ${summary}`);
    });
  }

  // Correlation patterns
  if (correlation.patterns.length > 0) {
    sections.push("");
    sections.push("### Detected Patterns");
    correlation.patterns.forEach((pattern) => {
      sections.push(`- ${pattern}`);
    });
  }

  // Related services
  if (correlation.relatedServices.length > 1) {
    sections.push("");
    sections.push(`### Related Services: ${correlation.relatedServices.join(", ")}`);
  }

  return sections.join("\n");
};
```

---

### Phase 5: Extend Chat Context Adapter

**File:** `services/api/src/adapters/chatContextAdapter.ts`

Update `createChatContextAdapter` to accept an optional investigation adapter and expose the `investigateIncident` method:

```typescript
import type { ChatInvestigationAdapter } from "./chatInvestigationAdapter.js";

export const createChatContextAdapter = (
  investigationAdapter?: ChatInvestigationAdapter
): ChatContextPort => ({
  // ... existing getAnalysisContext, getIncidentContext, searchRAG unchanged ...

  investigateIncident: investigationAdapter
    ? async (userMessage, alertId, tenantId, context) =>
        investigationAdapter.investigate(userMessage, alertId, tenantId, context)
    : undefined,
});
```

When `investigationAdapter` is not provided (e.g., monitoring env vars are not set), `investigateIncident` is `undefined` and the chat service skips it entirely.

---

### Phase 6: Update Chat Service Orchestration

**File:** `packages/shared/src/chat/chatService.ts`

Modify the `streamCompletion` generator to run investigation in parallel with RAG when on an incident page:

```typescript
// Inside streamCompletion, after topic classification passes (on-topic path):

// Existing parallel fetch
const [pageContextData, initialRag] = await Promise.all([
  fetchPageContext(contextPort, input.pageContext, input.tenantId, logger, context),
  fetchRAGContext(contextPort, input.userMessage, null, input.tenantId, logger, context),
]);

// NEW: Run investigation in parallel with enriched RAG (only for incidents)
const isIncidentPage = input.pageContext.pageType === "incident" && input.pageContext.entityId;
const investigationPromise = isIncidentPage && contextPort.investigateIncident
  ? contextPort.investigateIncident(
      input.userMessage,
      input.pageContext.entityId!,
      input.tenantId,
      context
    )
  : Promise.resolve(null);

// Enriched RAG (existing logic, runs if page context found)
const enrichedRagPromise = pageContextData
  ? fetchRAGContext(
      contextPort,
      `${input.userMessage} ${pageContextData.title ?? ""} ${pageContextData.summary ?? ""}`,
      null,
      input.tenantId,
      logger,
      context
    )
  : Promise.resolve(initialRag);

// Wait for both investigation and enriched RAG in parallel
const [investigationResult, ragResult] = await Promise.all([
  investigationPromise,
  enrichedRagPromise,
]);

// Yield investigation result to frontend (for structured display)
if (investigationResult?.diagnosis) {
  yield { type: "investigation_result", diagnosis: investigationResult.diagnosis };
}

// Yield RAG sources (existing)
const ragSources = extractRAGSources(ragResult);
if (ragSources.length > 0) {
  yield { type: "rag_sources", sources: ragSources };
}

// Build prompt with all three context sources
const systemPrompt = buildSystemPrompt(pageContextData, ragResult, investigationResult);
```

**Key design decisions:**

- Investigation runs **in parallel** with enriched RAG — no added sequential latency
- Investigation is only triggered for `pageType === "incident"` with an `entityId`
- `investigateIncident` is checked for existence (`contextPort.investigateIncident`) before calling
- The `investigation_result` SSE event is yielded **before** the LLM call, so the frontend can display the diagnosis card immediately while the response streams

---

### Phase 7: Wiring in the API Service

**File:** `services/api/src/routes/chatRoutes.ts`

Update the lazy singleton to wire investigation adapters:

```typescript
import { createChatInvestigationAdapter } from "../adapters/chatInvestigationAdapter.js";
import { createInvestigationService } from "../../../incident-triage/src/services/investigationService.js";
import { createMonitoringPort } from "../../../incident-triage/src/adapters/monitoringPortAdapter.js";
import { createLLMCompletionAdapter } from "../../../incident-triage/src/adapters/llmCompletionAdapter.js";
import { createInvestigationSearchAdapter } from "../../../incident-triage/src/adapters/investigationSearchAdapter.js";
// ... individual monitoring adapter imports ...

const getChatService = (): ChatService => {
  if (!chatServiceInstance) {
    // Existing wiring
    const llmPort = createChatLLMAdapter();
    const chatRepository = chatRepositoryAdapter;

    // NEW: Wire investigation pipeline (optional — degrades if env vars missing)
    const investigationAdapter = createInvestigationAdapterIfConfigured();

    const contextPort = createChatContextAdapter(investigationAdapter);

    chatServiceInstance = createChatService({
      chatRepository,
      llmPort,
      contextPort,
    });
  }
  return chatServiceInstance;
};

/**
 * Creates the investigation adapter only if at least one monitoring
 * provider is configured. Returns undefined otherwise.
 */
const createInvestigationAdapterIfConfigured = () => {
  const monitoringAdapters = [
    createDatadogMonitoringAdapter(
      config.DATADOG_API_KEY ?? "",
      config.DATADOG_APP_KEY ?? "",
      config.DATADOG_API_BASE_URL ?? "https://api.datadoghq.com"
    ),
    createPagerDutyMonitoringAdapter(config.PAGERDUTY_API_TOKEN ?? ""),
    createGrafanaMonitoringAdapter(
      config.GRAFANA_API_TOKEN ?? "",
      config.GRAFANA_API_BASE_URL ?? ""
    ),
    createPrometheusMonitoringAdapter(config.PROMETHEUS_API_BASE_URL ?? ""),
    createVercelMonitoringAdapter(
      config.VERCEL_MONITORING_API_TOKEN ?? "",
      config.VERCEL_TEAM_ID ?? ""
    ),
    createNetlifyMonitoringAdapter(config.NETLIFY_API_TOKEN ?? "", config.NETLIFY_SITE_ID ?? ""),
  ];

  // Only create if at least one adapter is configured
  const configuredCount = monitoringAdapters.filter((a) => a.isConfigured()).length;
  if (configuredCount === 0) {
    return undefined;
  }

  const monitoringPort = createMonitoringPort(monitoringAdapters);
  const llmCompletionPort = createLLMCompletionAdapter();
  const investigationSearchPort = createInvestigationSearchAdapter();

  const investigationService = createInvestigationService(
    llmCompletionPort,
    investigationSearchPort,
    monitoringPort
  );

  return createChatInvestigationAdapter(investigationService);
};
```

---

### Phase 8: Token Budget Adjustment

**File:** `packages/shared/src/constants/api.ts`

The investigation context adds significant content to the system prompt. Adjust the token budget:

```typescript
export const CHAT_DEFAULTS = {
  // ... existing constants ...

  /** Max tokens for investigation context in system prompt */
  MAX_INVESTIGATION_CONTEXT_TOKENS: 4_000,

  /** Adjusted total budget to accommodate investigation context */
  MAX_CONTEXT_TOKENS: 28_000, // was 24,000 — increased by 4K for investigation
} as const;
```

Also add a truncation guard in the investigation adapter's `formatInvestigationForPrompt`:

```typescript
const formatted = sections.join("\n");
return truncate(
  formatted,
  CHAT_DEFAULTS.MAX_INVESTIGATION_CONTEXT_TOKENS * CHAT_DEFAULTS.CHARS_PER_TOKEN
);
```

This ensures investigation context never exceeds ~16,000 characters (~4,000 tokens).

---

### Phase 9: Frontend — Display Investigation Results

**File:** `services/frontend/src/hooks/useCopilotChat/` — SSE parser

Add handling for the new `investigation_result` event type:

```typescript
case "investigation_result":
  setInvestigationDiagnosis(chunk.diagnosis);
  break;
```

**New component:** `services/frontend/src/components/CopilotDrawer/InvestigationCard.tsx`

A collapsible card displayed above the streaming response when investigation results are available:

```
┌──────────────────────────────────────────────────┐
│ 🔍 Investigation Results          Confidence: 87% │
│                                                    │
│ Root Cause: Database connection pool exhaustion    │
│ due to long-running queries from the reporting     │
│ service saturating all available connections.       │
│                                                    │
│ Suggested Actions:                                 │
│ [URGENT] Scale up DB connection pool limit         │
│ [URGENT] Kill long-running reporting queries       │
│ [SHORT-TERM] Add query timeout to reporting svc    │
│                                                    │
│ Evidence: 8 items from datadog, pagerduty, postgres│
│ ▸ View evidence details                            │
└──────────────────────────────────────────────────┘
```

---

## 7. Timeout and Performance Budget

| Operation                  | Timeout         | Expected P50 | Expected P95 |
| -------------------------- | --------------- | ------------ | ------------ |
| Parse intent (LLM)         | 45s             | 1.5s         | 4s           |
| Gather evidence (parallel) | 15s per adapter | 2s           | 6s           |
| Correlate evidence (CPU)   | —               | <50ms        | <100ms       |
| Diagnose (LLM)             | 45s             | 2s           | 5s           |
| **Total investigation**    | **45s outer**   | **~5s**      | **~12s**     |

**Critical constraint:** Investigation runs in parallel with enriched RAG, so it does **not** add to the critical path unless it exceeds the RAG fetch time (~1-2s). In practice, the investigation will be the bottleneck, adding ~3-10s of latency before the first LLM token.

### Mitigation: Progressive Enhancement

To avoid blocking the LLM response on slow investigations:

**Option A (Recommended for V1):** Wait for investigation to complete before LLM call. Accept the 3-10s latency. Users on incident pages expect deeper analysis and will tolerate the wait.

**Option B (Future optimization):** Start the LLM streaming with static alert + RAG context immediately, then inject investigation results mid-stream via a follow-up message. This requires:

- Two LLM calls (one fast, one enriched)
- Frontend support for appending investigation context after initial response
- Significantly more complexity

Recommend starting with Option A and measuring real-world latency before considering Option B.

---

## 8. Rate Limiting Considerations

Investigation makes 2 LLM calls (intent + diagnosis) plus up to 10 external monitoring API calls per chat message. The existing chat rate limit of **10 req/min/tenant** bounds this to:

| Resource                       | Per Chat Message                                   | Max Per Minute (10 req) |
| ------------------------------ | -------------------------------------------------- | ----------------------- |
| LLM calls (intent + diagnosis) | 2                                                  | 20                      |
| Monitoring API calls           | ≤10 (6 providers, some make 2 calls)               | ≤100                    |
| DB queries (evidence)          | ≤4 sources × 1 query each + N+1 for triage results | ≤30 (est.)              |

This is within acceptable bounds for the monitoring APIs. Datadog and PagerDuty have generous rate limits (typically 300-600 req/min). The per-tenant chat rate limit (10/min) provides sufficient protection.

**Recommendation:** No additional rate limiting needed for V1. Monitor monitoring API usage per tenant and add per-provider rate limits if abuse is detected.

---

## 9. Error Handling and Degradation

| Failure Mode                         | Behavior                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------- |
| All monitoring adapters unconfigured | `investigateIncident` is `undefined`, chat works as today                   |
| Investigation LLM timeout            | Adapter catches, returns `null`, chat uses static context + RAG             |
| One monitoring adapter fails         | That adapter returns `[]`, others contribute evidence normally              |
| All monitoring adapters fail         | Evidence is DB-only (past incidents, analyses, triage results)              |
| Diagnosis LLM fails                  | Falls back to `generateFallbackDiagnosis()` (symptom-based heuristic)       |
| Investigation exceeds outer timeout  | `Promise.race` in chat service catches, continues without investigation     |
| Parse intent fails                   | Falls back to `FALLBACK_INTENT` (symptom: "unknown", broad evidence search) |

**Key principle:** Every failure path returns `null` or a degraded result. The chat response is never blocked or broken by investigation failures.

---

## 10. Testing Strategy

### Unit Tests

| Test                                     | File                               | What to Assert                                         |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `formatInvestigationForPrompt`           | `chatInvestigationAdapter.test.ts` | Correct markdown structure, truncation, empty evidence |
| `formatInvestigationSection`             | `helpers.test.ts`                  | Guards against null/failed results                     |
| `buildSystemPrompt` with investigation   | `helpers.test.ts`                  | Investigation section appears between alert and RAG    |
| `createInvestigationAdapterIfConfigured` | `chatRoutes.test.ts`               | Returns undefined when no adapters configured          |

### Integration Tests

| Test                                  | What to Assert                                                            |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Chat completion with investigation    | Full SSE stream includes `investigation_result` event before tokens       |
| Chat completion without investigation | No `investigation_result` event, response unchanged from current behavior |
| Investigation timeout                 | Chat completes with static context only, no error event                   |
| Partial monitoring failure            | Investigation completes with partial evidence                             |

### Manual Testing

1. Configure at least one monitoring provider (e.g., Prometheus against local Docker stack)
2. Create a test incident alert
3. Navigate to incident page in frontend
4. Ask "why is the system slow?" in Copilot
5. Verify: investigation card appears, response references live evidence

---

## 11. Migration and Rollout

### Phase 1: Backend Only (Feature-Flagged)

Add a config flag:

```typescript
// packages/shared/src/constants/api.ts
CHAT_INVESTIGATION_ENABLED: config.CHAT_INVESTIGATION_ENABLED === "true",
```

Guard the investigation call:

```typescript
const investigationPromise = isIncidentPage
  && CHAT_DEFAULTS.CHAT_INVESTIGATION_ENABLED
  && contextPort.investigateIncident
  ? contextPort.investigateIncident(...)
  : Promise.resolve(null);
```

Deploy with `CHAT_INVESTIGATION_ENABLED=false`. Flip to `true` per-environment after verifying monitoring adapter connectivity.

### Phase 2: Frontend Card

Deploy the `InvestigationCard` component. It's already gated on the `investigation_result` SSE event existing — no flag needed. If the backend doesn't send the event, nothing renders.

### Phase 3: Remove Flag

Once stable in production, remove the `CHAT_INVESTIGATION_ENABLED` flag and make investigation the default for incident pages.

---

## 12. Files to Create or Modify

### New Files

| File                                                                   | Purpose                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| `services/api/src/adapters/chatInvestigationAdapter.ts`                | Bridge investigation service → chat context port |
| `services/api/src/adapters/chatInvestigationAdapter.test.ts`           | Unit tests                                       |
| `services/frontend/src/components/CopilotDrawer/InvestigationCard.tsx` | Frontend diagnosis display                       |

### Modified Files

| File                                                             | Change                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/chat/types.ts`                              | Add `ChatInvestigationResult`, `ChatInvestigationDiagnosis`, extend `ChatContextPort`, extend `ChatStreamChunk` |
| `packages/shared/src/chat/helpers.ts`                            | Add `formatInvestigationSection`, update `buildSystemPrompt` signature                                          |
| `packages/shared/src/chat/chatService.ts`                        | Add parallel investigation call, yield `investigation_result` event                                             |
| `packages/shared/src/chat/index.ts`                              | Export new types                                                                                                |
| `packages/shared/src/constants/api.ts`                           | Add `MAX_INVESTIGATION_CONTEXT_TOKENS`, `CHAT_INVESTIGATION_ENABLED`, adjust `MAX_CONTEXT_TOKENS`               |
| `services/api/src/adapters/chatContextAdapter.ts`                | Accept optional investigation adapter, expose `investigateIncident`                                             |
| `services/api/src/routes/chatRoutes.ts`                          | Wire investigation adapters in lazy singleton                                                                   |
| `services/frontend/src/hooks/useCopilotChat/`                    | Handle `investigation_result` SSE event                                                                         |
| `services/frontend/src/components/CopilotDrawer/MessageList.tsx` | Render `InvestigationCard` when diagnosis available                                                             |

### No Modifications Needed

| File                                                            | Why                                       |
| --------------------------------------------------------------- | ----------------------------------------- |
| `services/incident-triage/src/services/investigationService.ts` | Already designed for external consumption |
| `services/incident-triage/src/adapters/*MonitoringAdapter.ts`   | Stateless, work from any process          |
| `services/incident-triage/src/types/*`                          | Types imported as-is                      |

---

## 13. Open Questions

1. **Should investigation results be cached?** If the same incident is discussed across multiple messages, should we cache the investigation result for N minutes to avoid redundant monitoring API calls? Recommendation: Yes, cache per (alertId, tenantId) with a 5-minute TTL in Redis.

2. **Should the frontend show a "Investigating..." loading state?** Since investigation adds 3-10s before tokens start flowing, the user should see feedback. Recommendation: Yes, emit a `{ type: "investigation_started" }` SSE event immediately and show a skeleton card.

3. **Should investigation run on every message in an incident conversation, or only the first?** Recommendation: Only on messages that appear to be asking about the incident (use topic classification). Follow-up messages like "can you explain more?" should reuse the last investigation result.

4. **Cross-service import boundary.** Importing directly from `services/incident-triage/src/` into `services/api/src/` creates a build-time coupling. Alternative: promote the investigation service factory and monitoring adapter factories to `@kenchi/shared`. This is cleaner but increases the shared package surface. Recommendation: Start with direct imports for V1, promote to shared if a third consumer emerges.

---

## 14. Success Metrics

| Metric                                   | Target                     | How to Measure                                    |
| ---------------------------------------- | -------------------------- | ------------------------------------------------- |
| Investigation success rate               | >90%                       | Log `chatInvestigation` operation success/failure |
| P50 time to first token (incident pages) | <8s                        | Log `durationMs` on investigation completion      |
| P95 time to first token (incident pages) | <15s                       | Same metric                                       |
| User engagement on incident pages        | +30% messages/conversation | Compare before/after in analytics                 |
| Non-incident page regression             | 0ms added latency          | Verify investigation is not triggered             |
| Monitoring API error rate                | <5%                        | Per-adapter error logging                         |

---

## Appendix A: System Prompt Example (After Integration)

```
You are Kenchi Copilot, an AI assistant for DevOps engineers.
You help users understand CI/CD failures, deployment incidents, and code analysis results.
Be concise, accurate, and actionable. When you do not know something, say so.

## Current Incident Context
**Title:** High API Latency on payment-service
**Summary:** Average response time exceeded 5s threshold for /api/v1/checkout
**Details:**
**Severity:** critical
**Status:** triggered
**Service:** payment-service
**Environment:** production

## Live Investigation Results

### Diagnosis
**Root Cause Hypothesis:** Database connection pool exhaustion caused by long-running reporting queries saturating all 50 available connections, leaving the payment service unable to acquire connections for checkout requests.
**Confidence:** 87%
**Symptom Detected:** slow response

### Suggested Actions
- [URGENT] Kill the 3 long-running reporting queries (PIDs: 4521, 4522, 4523)
- [URGENT] Temporarily increase connection pool max from 50 to 100
- [SHORT-TERM] Add 30-second query timeout to the reporting service
- [LONG-TERM] Move reporting queries to a read replica

### Monitoring Evidence
- [datadog_metrics] payment-service.request.latency P99=12.3s (relevance: 95%)
  Average latency increased from 200ms to 12.3s starting at 14:23 UTC
- [datadog_events] Deployment: reporting-service v2.4.1 deployed at 14:15 UTC (relevance: 92%)
  New version includes unoptimized aggregate query on transactions table
- [pagerduty_incidents] DB Connection Pool Exhaustion - payment-service (relevance: 95%)
  Triggered at 14:25 UTC, currently acknowledged by oncall@company.com
- [prometheus_alerts] PostgresConnectionPoolUtilization > 95% (relevance: 92%)
  Firing since 14:22 UTC, current value: 98.4%
- [grafana_alerts] API Latency SLO Breach - payment-service (relevance: 80%)
  SLO target: 99.9% requests < 1s, current: 72.3%

### Detected Patterns
- recurring_service: payment-service referenced in 6 evidence items
- recent_failures: 5 items within last 2 hours suggest active incident
- cross-service: payment-service, reporting-service, postgres involved

### Related Services: payment-service, reporting-service, postgres

## Relevant Knowledge Base Context
- [Runbook] Payment Service Latency Troubleshooting (92% match)
  Step 1: Check DB connection pool utilization. Step 2: Identify long-running queries...
- [Resolution] 2026-02-15: Similar incident resolved by killing reporting queries (87% match)
  Root cause was unoptimized JOIN on transactions table after reporting service deploy...
```

---

## Appendix B: Dependency Graph (After Integration)

```
services/api/src/routes/chatRoutes.ts
  └── getChatService() [lazy singleton]
       ├── chatRepositoryAdapter (inline, wraps @kenchi/shared DB functions)
       ├── createChatLLMAdapter() → ChatLLMPort
       └── createChatContextAdapter(investigationAdapter?) → ChatContextPort
            ├── getAnalysisContext() → @kenchi/shared getAnalysisById
            ├── getIncidentContext() → @kenchi/shared getAlertById
            ├── searchRAG() → @kenchi/shared searchKnowledgeDocs
            └── investigateIncident() → chatInvestigationAdapter
                 └── investigationService (from incident-triage)
                      ├── llmCompletionPort → LLM SDK
                      ├── investigationSearchPort → @kenchi/shared DB functions
                      └── monitoringPort → fan-out to:
                           ├── datadogMonitoringAdapter → Datadog API
                           ├── pagerdutyMonitoringAdapter → PagerDuty API
                           ├── grafanaMonitoringAdapter → Grafana API
                           ├── prometheusMonitoringAdapter → Prometheus API
                           ├── vercelMonitoringAdapter → Vercel API
                           └── netlifyMonitoringAdapter → Netlify API
```
