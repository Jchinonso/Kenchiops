# RAG Learning Pipeline Audit

**Date:** 2026-03-04  
**Last Updated:** 2026-03-06  
**Status:** ✅ Retrieval connected to analysis (see [RAG_RETRIEVAL_INTEGRATION_PLAN.md](./RAG_RETRIEVAL_INTEGRATION_PLAN.md))

---

## Executive Summary

KenchiOps's most valuable differentiator is the learning flywheel: _"learns from your team's fixes."_ This audit found that the **ingestion side is fully built** (5 channels capturing knowledge into the vector DB) and the **search side is fully built** (`searchFromEventContext`, `searchKnowledgeDocs`, reranking). However, the two sides **are not connected** — CI failure analysis never retrieves learned knowledge to augment its LLM prompt.

> [!CAUTION]
> The learning pipeline is plumbed but not connected. Knowledge goes into the vector DB and sits there unused during analysis.

---

## Architecture Overview

```
                    ┌─────────────────────────────┐
                    │        Vector DB             │
                    │   (pgvector embeddings)      │
                    └──────┬──────────┬────────────┘
                           │          │
                    WRITE ▲│          │▼ READ
                           │          │
              ┌────────────┘          └────────────┐
              │                                    │
    ┌─────────┴──────────┐           ┌─────────────┴──────────┐
    │   INGESTION SIDE   │           │    RETRIEVAL SIDE       │
    │   ✅ WORKING       │           │    ✅ BUILT             │
    │                    │           │    ❌ NOT CONNECTED     │
    │ • Slack threads    │           │                         │
    │ • Analysis lessons │           │ searchFromEventContext() │
    │ • PR fix comments  │           │ searchKnowledgeDocs()   │
    │ • Linked commits   │           │ searchAll()             │
    │ • /kenchi add-doc  │           │ + reranker              │
    └────────────────────┘           └─────────────────────────┘
                                               │
                                               │ ❌ MISSING LINK
                                               ▼
                                     ┌─────────────────────┐
                                     │  performAnalysis()   │
                                     │  githubAnalysis.ts   │
                                     │                     │
                                     │  buildAnalysisPrompt │
                                     │  (event, evidence)  │
                                     │                     │
                                     │  ⚠️ No RAG context  │
                                     │  passed to LLM      │
                                     └─────────────────────┘
```

---

## Ingestion Side (✅ Working)

Five channels capture knowledge into the RAG vector database:

### Channel 1: Slack Resolution Detection

**Trigger:** Team replies in a CI failure notification thread

**Flow:**

1. CI failure notification posted to Slack → thread tracked via `trackCIFailureThread()`
2. Team members reply with discussion, fix details, code snippets
3. On each thread reply, `checkAndIngestResolution()` fires
4. `slackResolutionDetector.ts` analyzes messages for resolution signals:
   - Pattern matching for resolution phrases (_"fixed it"_, _"the issue was"_, _"merged the fix"_)
   - Positive reaction indicators (✅, 👍)
   - Code block presence
   - Message position in thread (later messages more likely to be resolutions)
   - Message length/substance
5. If confidence exceeds threshold, `ingestSlackResolution()` builds a knowledge document and embeds it

**Files:**

- [`services/slack-bot/src/services/resolutionService.ts`](file:///home/chinonso/Documents/kenchi/services/slack-bot/src/services/resolutionService.ts) — orchestrator
- [`packages/shared/src/rag/slackResolutionDetector.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/slackResolutionDetector.ts) — signal detection
- [`packages/shared/src/rag/slackResolutionPatterns.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/slackResolutionPatterns.ts) — pattern matchers
- [`packages/shared/src/rag/slackResolutionIngestion.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/slackResolutionIngestion.ts) — document building + embedding

### Channel 2: Analysis Lesson Ingestion

**Trigger:** A CI failure analysis is confirmed as helpful (user feedback)

**Flow:**

1. Analysis marked helpful → `ingestAnalysisLesson()` called
2. Checks `isQualifiedFailure()` — requires sufficient content + confidence
3. Detects failure category (test_failure, type_error, build_error, lint_error, timeout, infrastructure)
4. Generates normalized error signature via `generateErrorSignature()` for deduplication
5. Builds lesson document with problem, fix, context, and metadata
6. Embeds into vector DB

**File:** [`packages/shared/src/rag/analysisLessonIngestion.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/analysisLessonIngestion.ts)

### Channel 3: PR Fix Comment Detection

**Trigger:** PR comment that describes a fix for a CI issue

**File:** [`packages/shared/src/rag/prFixCommentIngestion.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/prFixCommentIngestion.ts)

### Channel 4: Linked Commit Ingestion

**Trigger:** Commit that resolves a CI failure (detected via commit message or PR linkage)

**File:** [`packages/shared/src/rag/linkedCommitIngestion.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/linkedCommitIngestion.ts)

### Channel 5: Manual Document Ingestion

**Trigger:** `/kenchi add-doc` Slack command — user submits a document URL or text

**File:** [`packages/shared/src/rag/ingestion.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/ingestion.ts)

---

## Retrieval Side (✅ Built, ❌ Not Connected)

The search infrastructure is complete and ready to use:

| Function                   | Purpose                                                                 | File                                                                                    |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `searchFromEventContext()` | Builds query from CI failure event, searches all sources                | [`search.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/search.ts) |
| `searchKnowledgeDocs()`    | Semantic vector search over knowledge documents with optional reranking | [`search.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/search.ts) |
| `searchDiffChunks()`       | Searches similar diff chunks from past failures                         | [`search.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/search.ts) |
| `searchAll()`              | Combined search across diffs + knowledge docs                           | [`search.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/search.ts) |

Supporting infrastructure:

- [`reranker.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/reranker.ts) — deterministic reranking for relevance
- [`budgetAwareEmbedding.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/budgetAwareEmbedding.ts) — cost-controlled embedding with caching
- [`searchHelpers.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/searchHelpers.ts) — query building from event context
- [`multiHop.ts`](file:///home/chinonso/Documents/kenchi/packages/shared/src/rag/multiHop.ts) — multi-hop reasoning over related documents

**None of these are imported or called in the analysis pipeline.**

---

## The Broken Link: Analysis Pipeline

### Current flow (no learning)

```
GitHub webhook (check_run failed)
    │
    ▼
performAnalysis(event, tenantId)          ← githubAnalysis.ts
    │
    ▼
llmClient.analyzeIncident(event, evidence)  ← llm/providers/llmProvider/client.ts
    │
    ▼
buildAnalysisPrompt(event, evidence)        ← integrations/prompts.ts
    │
    ├── buildSystemPrompt()           ← static role description
    ├── buildTaskSection()            ← static task instructions
    ├── buildSafetySection()          ← static safety rules
    ├── buildCriticalTestFailureRulesSection()  ← static rules
    ├── buildAnalysisGuidelinesSection()        ← static heuristics
    ├── formatEvent(event)            ← webhook payload data
    └── formatEvidence(evidence)      ← CI logs, PR diff
                                         ❌ NO RAG CONTEXT
```

### What should happen (with learning)

```
GitHub webhook (check_run failed)
    │
    ▼
performAnalysis(event, tenantId)
    │
    ├──► searchFromEventContext(eventContext, tenantId)  ← NEW
    │         │
    │         ▼
    │    RAG results: similar past failures + resolutions
    │
    ▼
llmClient.analyzeIncident(event, evidence, ragContext)   ← MODIFIED
    │
    ▼
buildAnalysisPrompt(event, evidence, ragContext)          ← MODIFIED
    │
    ├── ... existing sections ...
    ├── formatRAGContext(ragContext)    ← NEW SECTION
    │     • "Similar past failure: TypeScript type error in UserService"
    │     • "Team resolution: Added missing field to User interface"
    │     • "Confidence: 89% match"
    └── formatEvidence(evidence)
```

---

## Frontend Learning Channels (❌ None)

The frontend currently has **no mechanism** for users to feed knowledge back:

| Missing Feature            | Description                                    | Impact                                  |
| -------------------------- | ---------------------------------------------- | --------------------------------------- |
| **Feedback buttons**       | 👍/👎 on analysis results                      | Cannot trigger `ingestAnalysisLesson`   |
| **Resolution notes**       | Text field to describe how a failure was fixed | Cannot capture fixes made outside Slack |
| **Correction UI**          | Edit/correct an analysis root cause            | Cannot improve analysis accuracy        |
| **Knowledge base browser** | View/manage ingested knowledge docs            | No visibility into what's been learned  |

The Slack bot has feedback handling (`feedbackHandler.ts`) but the frontend has no equivalent.

---

## Impact Assessment

### Without the retrieval connection

- Every CI failure analysis starts from scratch — no institutional memory
- Teams see the same generic analysis for recurring failure patterns
- The "Similar Past Fixes" section in the UX doc is **purely aspirational**
- No competitive moat — analysis quality is identical for new users and long-term users

### With the retrieval connection

- Recurring failures get progressively better diagnoses
- Team-specific patterns are recognized (e.g., "this repo always has env var issues after deploys")
- Similar past fixes are surfaced, saving investigation time
- Creates a genuine flywheel: more usage → more knowledge → better analysis → more usage
- **This is the subscription-worthy differentiator**

---

## Recommended Fix Priority

### 1. Connect RAG retrieval to analysis (Critical) ✅ DONE

**Effort:** ~2 days  
**Files modified:**

- `services/github-app/src/services/githubAnalysis.ts` — added `fetchRAGContext` + `buildEventQueryContext`, calls `searchFromEventContext` before analysis
- `packages/shared/src/integrations/prompts.ts` — added `formatRAGContext`, updated `buildAnalysisPrompt` with optional `ragContext` param
- `packages/shared/src/llm/providers/llmProvider/client.ts` — passes RAG context through `analyzeIncident`
- `packages/shared/src/llm/types.ts` — updated `LLMAnalysisProvider` interface

### 2. Add frontend feedback buttons (High)

**Effort:** ~1 day
**Where:** Analysis detail panel — add 👍/👎 buttons that call API to trigger `ingestAnalysisLesson`

### 3. Add frontend resolution notes (Medium)

**Effort:** ~1 day
**Where:** CI failure detail — add "How was this resolved?" text field that ingests into RAG

### 4. Add knowledge base browser (Low)

**Effort:** ~2 days
**Where:** New dashboard page showing ingested knowledge documents with search/filter

---

## Verification Checklist

To confirm the fix works end-to-end:

- [ ] Trigger a CI failure → verify analysis runs (baseline, no RAG context)
- [ ] Resolve the failure in Slack thread → verify `ingestSlackResolution` captures it
- [ ] Trigger a **similar** CI failure → verify RAG context appears in the LLM prompt
- [ ] Verify the analysis output references "Similar Past Fixes" with the captured resolution
- [ ] Use frontend feedback button → verify `ingestAnalysisLesson` fires
- [ ] Trigger another similar failure → verify lesson is included in RAG context
