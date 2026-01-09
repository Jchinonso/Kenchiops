# RAG, Embeddings, and Fine-Tuning Implementation Plan

## Purpose

Define a staged roadmap for Retrieval-Augmented Generation (RAG), vector embedding governance, and model fine-tuning within Kenchi. The plan leverages the existing PostgreSQL + pgvector database (see `database/init/001_schema.sql`) and the roadmap laid out in `docs/IMPLEMENTATION_BLUEPRINT.md` and `docs/SYSTEM_ARCHITECTURE.md`.

> **Database Note:** We will continue to use PostgreSQL as the system of record, with the `diff_chunks` and `knowledge_documents` tables (backed by pgvector) as the primary vector stores. No new database engine is required; we simply need ingestion workers and API surfaces to make those tables operational.

---

## Knowledge Acquisition Strategy: Zero-Config Passive Learning

### Design Philosophy

Traditional RAG systems require users to upload documents, configure ingestion pipelines, and maintain knowledge bases. This creates friction and low adoption. Kenchi takes a **zero-config approach** where knowledge is acquired passively from natural workflows.

### Knowledge Sources (Ordered by User Effort)

| Source                       | User Effort | Acquisition Method                                                                    | Implementation Status |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------- | --------------------- |
| **Successful Analyses**      | None        | When user clicks "Helpful" on an analysis, store the failure→fix pattern              | ✅ Implemented        |
| **PR Fix Comments**          | None        | Parse comments on PRs that resolved failed checks - engineers explain fixes naturally | 🔄 Planned            |
| **Slack Resolution Threads** | None        | Capture Slack threads where CI failures are discussed and resolved                    | 🔄 Planned            |
| **GitHub Issues**            | None        | Already connected via GitHub App - issues document workarounds                        | ✅ Implemented        |
| **CI Log Patterns**          | None        | Learn recurring failure patterns and their resolutions over time                      | ✅ Implemented        |
| **Bootstrap Templates**      | Optional    | Pre-built runbook templates teams can customize (provided out-of-box)                 | ✅ Implemented        |
| **Team Docs (opt-in)**       | Low         | Teams can optionally point to GitHub repo docs for ingestion                          | ✅ Implemented        |

### Passive Learning Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ZERO-CONFIG KNOWLEDGE LOOP                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   1. CI Failure Occurs                                                   │
│          ↓                                                               │
│   2. Kenchi Analyzes (using existing knowledge)                         │
│          ↓                                                               │
│   3. Engineer Reviews Analysis                                           │
│          ↓                                                               │
│   ┌──────┴──────┐                                                        │
│   ↓             ↓                                                        │
│ "Helpful"   "Not Helpful"                                                │
│   ↓             ↓                                                        │
│ Store as    Request better                                               │
│ knowledge   suggestion                                                   │
│   ↓             ↓                                                        │
│   └──────┬──────┘                                                        │
│          ↓                                                               │
│   4. Engineer Fixes Issue                                                │
│          ↓                                                               │
│   5. PR Comment/Slack Thread Captured                                    │
│          ↓                                                               │
│   6. Knowledge Enriched for Next Time                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Principle

> **The system gets smarter automatically. Users don't upload docs - they just use the product.**

---

## Phase 0 – Data Readiness & Instrumentation (Week 0-1)

1. **Inventory Sources**
   - Diff chunks (`diff_chunks` table) from PRs/commits.
   - Successful analysis patterns (`knowledge_documents` table with `doc_type='analysis_lesson'`).
   - PR fix comments (`knowledge_documents` table with `doc_type='pr_fix_comment'`).
   - Slack resolution threads (`knowledge_documents` table with `doc_type='slack_resolution'`).
   - GitHub Issues with workarounds (via GitHub Issues connector).
   - Optional: Team runbooks, incident reports, architecture docs.

2. **Chunking Standards**
   - Diff chunks: 350-450 token chunks with 10% overlap. Include metadata: repo, file path, test framework, detection timestamp.
   - Knowledge docs: chunk per logical section (e.g., runbook steps, incident summary/resolution) with tags for service, severity, CI system.
   - PR comments: preserve full context with linked failure metadata.
   - Slack threads: chunk by message with thread context preserved.

3. **Embedding Configuration**
   - Embedding model: `text-embedding-3-small` for cost/performance.
   - Store `embedding_model`, `embedding_version`, and `created_at` in each table.
   - Add background job for re-embedding when OpenAI releases upgraded models.

4. **Ingestion Pipelines**

   **Automatic (Zero-Config):**
   - `ingestSuccessfulAnalysis`: triggered when user marks analysis as "Helpful"
   - `ingestPRFixComment`: triggered on PR comment when check transitions from failure→success
   - `ingestSlackResolution`: triggered when Slack thread is marked resolved or contains fix keywords
   - `ingestDiffChunks`: triggered post-merge or on webhook
   - `ingestGitHubIssues`: scheduled sync of issues with workaround/solution content

   **Optional (User-Initiated):**
   - `ingestTeamDocs`: admin-triggered for teams who want to add their existing docs
   - `ingestExternalDocs`: manual ingestion of external knowledge sources

   Each worker: pulls raw text → chunks → redacts secrets → calls embedding API → upserts rows.

5. **Observability**
   - Metrics: embeddings/minute, cost per source, error rates.
   - Alerts: ingestion lag, embedding failures, table growth anomalies.
   - **Knowledge growth metrics**: lessons learned/week, PR comments captured, resolution patterns identified.

---

## Phase 1 – Retrieval Infrastructure (Week 2)

1. **Vector Search Module**
   - Shared module (`packages/shared/src/integrations/vectorStore.ts`) exposing deterministic functions:
     - `searchDiffChunks(queryEmbedding, filters, topK)`
     - `searchKnowledgeDocs(queryEmbedding, filters, topK)`
   - Filters: repository, tenant, service, severity, timeframe.
   - Indexing: create IVFFlat indexes with pgvector once initial data volume exists.

2. **Query Construction**
   - Build query text from event metadata + failure excerpt + repo context.
   - Normalize language (strip secrets, limit to 1-2k tokens) before embedding.
   - Cache query embeddings per event ID to avoid duplicate OpenAI calls.

3. **Hybrid Retrieval**
   - Combine vector similarity with keyword filters (e.g., must match repo or tag).
   - Apply similarity thresholds (diff chunks ≥0.70, knowledge docs ≥0.78).

4. **Governance**
   - Admin endpoints / CLI to re-tag docs, trigger re-ingestion, or purge stale embeddings.
   - Tenant isolation: queries/scans always scoped by tenant ID.

---

## Phase 2 – Prompt & UI Integration (Week 3-4)

1. **Context Aggregator Updates**
   - After evidence collection, call vector search to retrieve:
     - Similar incidents / runbooks.
     - Relevant diff chunks touching files mentioned in logs.
   - Attach results to the `Evidence` payload before secret redaction.

2. **Prompt Injection**
   - Extend `buildAnalysisPrompt` to include a “Retrieved Knowledge” section summarizing top documents (title, excerpt, link, similarity).
   - Keep deterministic formatting so the LLM does not attempt its own retrieval.

3. **UI Surfacing**
   - Slack/GitHub formatters show “Related incidents/runbooks” when available.
   - Add CTA links (open doc, view diff chunk).

4. **Evaluation Harness**
   - Build a regression suite of known incidents with expected helpful docs.
   - Track metrics: Recall@K, MRR, qualitative feedback.
   - Provide Slack buttons for “Helpful/Not Helpful” on retrieved snippets; log into `analysis_feedback`.

---

## Phase 3 – Fine-Tuning & Feedback Loop (Week 5-6)

1. **Feedback Collection**
   - Use `analysis_feedback` and Slack reactions to classify outputs.
   - Capture whether engineers accepted suggested actions or RAG snippets.

2. **Dataset Construction**
   - Extract anonymized event/evidence/RAG context + ideal analysis responses.
   - Label dataset for targeted tasks (root-cause accuracy, action relevance).

3. **Model Strategy**
   - Short term: instruction-level prompt tweaks conditioned on tenant metadata.
   - Medium term: fine-tune or adapter-train small models for classifier tasks (e.g., “Is this failure due to dependency changes?”).
   - Long term: fine-tune `gpt-4o-mini` (subject to OpenAI availability) on redacted histories.

4. **Pipeline**
   - Automated ETL → QC → fine-tune job → evaluation (confidence scoring + human review) → versioned deployment.
   - Feature flag to roll back to base model instantly.

---

## Phase 4 – Advanced Enhancements (Post Week 6)

1. **Multi-Hop RAG**
   - Graph-based retrieval (incidents referencing each other, dependencies between services).
   - Support "explain chain of incidents" queries as hinted in `docs/SYSTEM_ARCHITECTURE.md`.

2. **Cross-Repo Knowledge**
   - Optional ingestion of curated external incident reports/runbooks (tenant opt-in).
   - Filter by tech stack tags to maintain relevance.

3. **Streaming Updates**
   - Hook ingestion workers to CI webhooks so new runbooks/diffs auto-ingest after merges.
   - Add TTL/re-ingest policies for stale docs.

4. **Automated QA**
   - Nightly jobs scoring retrieval/fine-tuned model drift.
   - Alert when recall drops or embeddings fail.

5. **Cost Controls**
   - Tiered embeddings (light vs. premium) based on tenant plan.
   - Query caching + early exit when no relevant docs found.

---

## Phase 5 – Passive Knowledge Capture (Post Week 8)

### 5.1 PR Fix Comment Ingestion

Automatically capture knowledge from PR comments when engineers fix CI failures.

**Trigger Conditions:**

- PR has check runs that transitioned from `failure` → `success`
- PR has comments added after the failure occurred
- Comment contains fix-related keywords or patterns

**Detection Heuristics:**

```typescript
const FIX_COMMENT_PATTERNS = [
  /fix(ed|es|ing)?/i,
  /resolv(ed|es|ing)?/i,
  /the (issue|problem|error) was/i,
  /root cause/i,
  /turns out/i,
  /solution:/i,
  /workaround:/i,
  /this (fixed|resolved|solved)/i,
] as const;
```

**Ingestion Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    PR FIX COMMENT CAPTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Check Run Webhook: status = "completed", conclusion = "success"
│          ↓                                                       │
│  2. Query: Were there previous failures on this PR?             │
│          ↓ (yes)                                                 │
│  3. Fetch PR comments added after last failure                  │
│          ↓                                                       │
│  4. Filter comments matching fix patterns                       │
│          ↓                                                       │
│  5. Extract context:                                            │
│     - Original failure (error message, log excerpt)             │
│     - Fix explanation (comment content)                         │
│     - Changed files (what was modified to fix it)               │
│          ↓                                                       │
│  6. Create knowledge document:                                  │
│     {                                                           │
│       doc_type: "pr_fix_comment",                               │
│       title: "Fix: {error_summary}",                            │
│       content: "{failure_context}\n\n{fix_explanation}",        │
│       metadata: { pr_url, commit_sha, files_changed }           │
│     }                                                           │
│          ↓                                                       │
│  7. Chunk, embed, store with tenant isolation                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Quality Controls:**

- Minimum comment length: 50 characters (filter out "LGTM", "Fixed")
- Exclude bot comments (dependabot, renovate, etc.)
- Deduplicate similar fixes within same repo
- Confidence scoring based on pattern match strength

### 5.2 Slack Resolution Thread Capture

Capture knowledge from Slack threads where CI failures are discussed and resolved.

**Trigger Conditions:**

- Thread started from Kenchi's failure notification
- Thread contains resolution indicators
- User explicitly marks as resolved (reaction or button)

**Resolution Detection:**

```typescript
const RESOLUTION_INDICATORS = {
  reactions: ["white_check_mark", "heavy_check_mark", "done", "resolved"],
  keywords: [
    /fixed it/i,
    /all good now/i,
    /resolved/i,
    /it('s| is) working/i,
    /merged the fix/i,
    /deployed/i,
  ],
  buttons: ["mark_resolved", "issue_fixed"],
} as const;
```

**Ingestion Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│                  SLACK RESOLUTION CAPTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Monitor threads on Kenchi failure notifications             │
│          ↓                                                       │
│  2. Detect resolution:                                          │
│     - ✅ reaction added to thread                               │
│     - "Mark Resolved" button clicked                            │
│     - Resolution keyword detected in reply                      │
│          ↓                                                       │
│  3. Fetch full thread (all replies)                             │
│          ↓                                                       │
│  4. Extract:                                                    │
│     - Original failure notification (link to analysis)          │
│     - Discussion content (what was tried, what worked)          │
│     - Resolution message                                        │
│     - Participants (for attribution)                            │
│          ↓                                                       │
│  5. Create knowledge document:                                  │
│     {                                                           │
│       doc_type: "slack_resolution",                             │
│       title: "Resolution: {failure_summary}",                   │
│       content: "{thread_summary}",                              │
│       metadata: { channel, thread_ts, participants }            │
│     }                                                           │
│          ↓                                                       │
│  6. Chunk, embed, store with tenant isolation                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Privacy Controls:**

- Only capture threads on Kenchi notifications (not all Slack activity)
- Respect channel permissions (only public channels or channels bot is in)
- Allow users to opt-out specific threads
- Redact sensitive information (secrets, PII)

### 5.3 Successful Analysis Learning

When users mark an analysis as "Helpful", store the failure→analysis→fix pattern.

**Already Implemented:** `recordRAGFeedback` in `packages/shared/src/rag/evaluation.ts`

**Enhancement - Auto-Lesson Extraction:**

```
┌─────────────────────────────────────────────────────────────────┐
│                 ANALYSIS LESSON EXTRACTION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User clicks "Helpful" on analysis                           │
│          ↓                                                       │
│  2. Retrieve:                                                   │
│     - Original failure context (logs, error)                    │
│     - Analysis output (root cause, recommendations)             │
│     - Any actions taken (if tracked)                            │
│          ↓                                                       │
│  3. Generate lesson document:                                   │
│     {                                                           │
│       doc_type: "analysis_lesson",                              │
│       title: "Lesson: {error_category} in {repo}",              │
│       content: "                                                │
│         ## Failure Pattern                                      │
│         {error_signature}                                       │
│                                                                 │
│         ## Root Cause                                           │
│         {analysis.rootCause}                                    │
│                                                                 │
│         ## Resolution                                           │
│         {analysis.recommendations}                              │
│       ",                                                        │
│       metadata: { confidence, feedback_id, repo }               │
│     }                                                           │
│          ↓                                                       │
│  4. Chunk, embed, store                                         │
│          ↓                                                       │
│  5. Future similar failures retrieve this lesson                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 Knowledge Deduplication & Quality

As passive learning accumulates knowledge, prevent bloat and maintain quality.

**Deduplication Strategy:**

- Semantic similarity check before inserting new knowledge
- If similarity > 0.92 with existing doc, merge or skip
- Prefer more recent knowledge for evolving issues
- Track "hit count" - frequently retrieved docs are more valuable

**Quality Scoring:**

```typescript
interface KnowledgeQualityScore {
  sourceReliability: number; // PR comment > Slack > auto-generated
  feedbackSignal: number; // How often marked helpful when retrieved
  recency: number; // Newer = higher for evolving issues
  specificity: number; // Specific repo/error vs generic
  retrievalFrequency: number; // How often this doc is retrieved
}
```

**Garbage Collection:**

- Docs not retrieved in 90 days → mark for review
- Docs with negative feedback → reduce ranking weight
- Superseded docs (same issue, newer fix) → archive old version

---

---

## Required Improvements (High Priority - Phase 0-2)

Based on production readiness review, these improvements must be implemented early to avoid common RAG failure modes.

### 1. Metadata Contracts Per Document Type

Each `doc_type` must have a required metadata schema for consistent filtering and ranking.

**Required Metadata by Type:**

| Doc Type           | Required Fields                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `analysis_lesson`  | tenant_id, repo, ci_provider, workflow_name, error_signature, error_category, timestamp, source_event_id |
| `pr_fix_comment`   | tenant_id, repo, pr_url, commit_sha, failure_signature, files_changed[], timestamp                       |
| `slack_resolution` | tenant_id, channel_id, thread_ts, failure_signature, resolution_summary, timestamp                       |
| `team_docs`        | tenant_id, repo, doc_path, last_updated, author                                                          |
| `external`         | tenant_id, source_url, source_type, fetched_at, stale_after                                              |

**Implementation:** Add Zod schemas in `packages/shared/src/rag/schemas/` for validation at ingestion time.

### 2. Document-Type-Specific Chunking Rules

A single chunking strategy is insufficient. Each doc type needs tailored chunking.

| Doc Type        | Chunking Strategy                                                         |
| --------------- | ------------------------------------------------------------------------- |
| Diff chunks     | 350-450 tokens with overlap, aligned to function/class boundaries         |
| PR fix comments | Usually single-chunk (preserve full explanation)                          |
| Slack threads   | One derived summary chunk + key-message chunks (resolution-relevant only) |
| Team docs       | Chunk per logical section (headings, code blocks)                         |

**Implementation:** Extend `chunkKnowledgeDoc` to accept doc_type and apply appropriate strategy.

### 3. Deterministic Retrieval Ranking Formula

Vector similarity alone is not sufficient. Define a deterministic ranking formula:

```typescript
const calculateFinalScore = (result: SearchResult): number => {
  const vectorSimilarity = result.similarity;
  const sourceReliability = SOURCE_RELIABILITY_SCORES[result.docType] ?? 0.5;
  const recencyBoost = calculateRecencyBoost(result.createdAt);
  const feedbackSignal = result.helpfulRate ?? 0.5;

  return (
    vectorSimilarity * 0.55 + sourceReliability * 0.2 + recencyBoost * 0.15 + feedbackSignal * 0.1
  );
};
```

**Hard Rules:**

- Same repo + same CI workflow > cross-repo matches
- PR fix comments > Slack resolutions > auto-generated lessons
- Newer fixes preferred for dependency-related failures

### 4. Lightweight Reranking Layer

After pgvector retrieval:

1. Apply metadata-based boosts (repo, workflow, service)
2. Optionally rerank top-N results with a cheap LLM classifier

**Implementation:** Add `reranker.ts` module in `packages/shared/src/rag/`.

### 5. Harden Slack Ingestion (Noise Control)

Slack is the noisiest knowledge source. Mandatory constraints:

- Only ingest threads originating from Kenchi alerts
- Require explicit resolution signal (button or reaction preferred over keywords)
- Exclude speculative or unresolved threads
- Store summaries + key messages, not entire raw threads
- Lower default trust weight than PR-based sources

### 6. RAG Safety Rules for LLM Usage

Retrieved knowledge must be treated as evidence, not instructions.

If retrieved content includes commands or potentially destructive actions:

- LLM must explain intent
- List preconditions
- Propose safer alternatives
- Require explicit human approval for destructive operations

**Implementation:** Add safety classifier in prompt construction.

### 7. Early Deduplication (Before Embedding)

Embedding duplicates wastes cost and pollutes retrieval.

**Required pipeline order:**

1. Exact-text hash dedupe
2. Semantic similarity check against recent docs
3. Embed only if unique

**Implementation:** Already partially in `prFixCommentIngestion.ts`, extend to all doc types.

### 8. Knowledge Lifecycle Management

Add lifecycle fields to all knowledge documents:

```typescript
interface KnowledgeLifecycle {
  status: "active" | "deprecated" | "archived";
  hitCount: number;
  negativeFeedbackCount: number;
  supersededBy?: string; // Optional link to newer doc
}
```

**Policies:**

- Prefer newer docs for evolving issues
- Archive unused docs after 90 days inactivity
- Reduce ranking weight on repeated negative feedback

### 9. Deterministic Query Construction

The text used to generate query embeddings must be stable.

**Fixed template including:**

- error_signature
- failing CI step name
- key log lines (limited)
- repo + workflow + language
- limited diff context (if applicable)

**Implementation:** Add `buildQueryText` function with deterministic template.

### 10. Privacy & Purge Controls Earlier

Privacy is core to Slack + PR ingestion. Must be implemented in Phase 0-1:

- Secret and PII redaction before embedding
- Tenant isolation enforced at query time
- Purge APIs (by event_id, pr_url, thread_ts, user_id)
- Opt-out controls for Slack threads

---

## Remaining Improvements (Non-Blocking but High Leverage)

These are not blockers for implementation, but refinements to plan as the system matures.

### 3.1 Similarity Thresholds Are Still Static

Current thresholds:

- Diff chunks: ≥ 0.70
- Knowledge docs: ≥ 0.78

This is acceptable initially but expect it to be brittle.

**Future Refinements:**

- Log similarity distributions in production
- Move to relative thresholds (top-K gap, z-score, or percentile)
- Let reranking decide final inclusion instead of hard cutoffs

> **Note:** Don't treat these numbers as sacred. They will need tuning based on real data.

### 3.2 Knowledge Quality Score Is Defined but Not Wired

The `KnowledgeQualityScore` interface is defined with:

- `sourceReliability`
- `feedbackSignal`
- `recency`
- `specificity`
- `retrievalFrequency`

**Not yet implemented:**

- How it's computed incrementally
- How it feeds back into ranking over time
- How it decays with age

**Recommended Approach:**

1. Start with `sourceReliability + recency` (already done in reranker)
2. Add `feedback + retrieval frequency` after hit count tracking is implemented
3. Don't over-engineer it early

### 3.3 Multi-Hop RAG Needs Guardrails (Later)

Graph-based retrieval is implemented but when expanding usage:

**Required Guardrails:**

- Limit hop count to 2 max
- Require shared attributes (same service, dependency, or error category)
- Penalize speculative chains
- Add confidence decay per hop

> **Warning:** Without guardrails, multi-hop becomes a hallucination amplifier.

### 3.4 Fine-Tuning Strategy Notes

The fine-tuning strategy is reasonable and conservative.

**Key Guidance:**

- Do NOT fine-tune generative models until RAG quality is proven
- Start with classifiers (as already stated in Phase 3)
- Use fine-tuning for targeted tasks, not general improvement

The current phased approach is correct.

---

## Evaluation Strategy

### Offline Evaluation

- Recall@K
- MRR (Mean Reciprocal Rank)
- Regression incidents with expected documents

### Online Evaluation

- Helpful / Not Helpful rate per doc_type
- Retrieved-doc click-through rate
- Time-to-resolution proxy metrics
- Cost per successful assist

### Track Failure Modes

- Irrelevant retrieval
- Missing retrieval (expected doc not found)
- Stale retrieval (outdated fix suggested)

---

## Deliverables Checklist

### Phase 0-2: Core Infrastructure

- [x] Ingestion workers + monitoring dashboards
- [x] Vector search API (pgvector-backed) with filtering and admin controls
- [x] Prompt/UI integration showing retrieved knowledge
- [x] Feedback instrumentation feeding `analysis_feedback`
- [x] CLI tools for document ingestion (`scripts/ingest-documents.ts`)
- [x] Batch import script (`scripts/batch-import-docs.ts`)
- [x] API endpoints for RAG operations (`/api/rag/*`)
- [x] Metadata contract schemas (Zod validation)
- [x] Deterministic ranking formula implementation
- [x] Privacy & purge APIs
- [x] Secret/PII redaction pipeline

### Phase 3: Fine-Tuning

- [x] Fine-tuning pipeline with versioned models and rollback
- [x] Feedback loop storing successful analyses

### Phase 4: Advanced Features

- [x] Multi-hop RAG with graph traversal
- [x] External knowledge connectors (GitHub Issues)
- [x] Streaming updates with TTL policies
- [x] Drift detection and alerting
- [x] Cost controls with tiered embeddings

### Phase 5: Passive Knowledge Capture

- [x] PR fix comment ingestion (`ingestPRFixComment`)
- [x] Slack resolution thread capture (`ingestSlackResolution`)
- [x] Enhanced analysis lesson extraction
- [x] Knowledge deduplication pipeline
- [x] Deterministic reranking integrated into search
- [x] Quality scoring and garbage collection
- [x] Knowledge lifecycle management

### Documentation

- [x] Architecture diagrams
- [x] Bootstrap templates in `knowledge/` folder
- [x] Privacy controls documentation (`docs/RAG_PRIVACY_CONTROLS.md`)
- [x] Admin guide for optional doc ingestion (`docs/RAG_ADMIN_GUIDE.md`)

---

## Implementation Priority

Based on the zero-config philosophy, implement in this order:

1. **Already Working** - Successful analysis learning, GitHub Issues sync
2. **Next Up** - PR fix comment parsing (low effort, high value)
3. **Then** - Slack resolution capture (requires Slack event subscriptions)
4. **Optional** - Admin UI for teams who want to add their own docs

Keep this document updated as phases progress; link PRs/issues to each bullet to maintain visibility.
