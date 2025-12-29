# RAG, Embeddings, and Fine-Tuning Implementation Plan

## Purpose

Define a staged roadmap for Retrieval-Augmented Generation (RAG), vector embedding governance, and model fine-tuning within Kenchi. The plan leverages the existing PostgreSQL + pgvector database (see `database/init/001_schema.sql`) and the roadmap laid out in `docs/IMPLEMENTATION_BLUEPRINT.md` and `docs/SYSTEM_ARCHITECTURE.md`.

> **Database Note:** We will continue to use PostgreSQL as the system of record, with the `diff_chunks` and `knowledge_documents` tables (backed by pgvector) as the primary vector stores. No new database engine is required; we simply need ingestion workers and API surfaces to make those tables operational.

---

## Phase 0 – Data Readiness & Instrumentation (Week 0-1)

1. **Inventory Sources**
   - Diff chunks (`diff_chunks` table) from PRs/commits.
   - Runbooks, incident reports, architecture docs (`knowledge_documents` table).
   - Upcoming “analysis lessons” and Slack/GitHub feedback (`analysis_feedback` table).

2. **Chunking Standards**
   - Diff chunks: 350-450 token chunks with 10% overlap. Include metadata: repo, file path, test framework, detection timestamp.
   - Knowledge docs: chunk per logical section (e.g., runbook steps, incident summary/resolution) with tags for service, severity, CI system.

3. **Embedding Configuration**
   - Embedding model: `text-embedding-3-small` for cost/performance.
   - Store `embedding_model`, `embedding_version`, and `created_at` in each table.
   - Add background job for re-embedding when OpenAI releases upgraded models.

4. **Ingestion Pipelines**
   - Worker scripts (tsx or queue consumers) for:
     - `ingestDiffChunks`: triggered post-merge or on webhook.
     - `ingestRunbooks`: scheduled nightly or on doc change.
     - `ingestExternalDocs`: manual/admin triggered.
   - Each worker: pulls raw text → chunks → redacts secrets → calls embedding API → upserts rows.

5. **Observability**
   - Metrics: embeddings/minute, cost per source, error rates.
   - Alerts: ingestion lag, embedding failures, table growth anomalies.

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
   - Support “explain chain of incidents” queries as hinted in `docs/SYSTEM_ARCHITECTURE.md`.

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

## Deliverables Checklist

- [ ] Ingestion workers + monitoring dashboards.
- [ ] Vector search API (pgvector-backed) with filtering and admin controls.
- [ ] Prompt/UI integration showing retrieved knowledge.
- [ ] Feedback instrumentation feeding `analysis_feedback`.
- [ ] Fine-tuning pipeline with versioned models and rollback.
- [ ] Documentation updates: architecture diagrams, runbooks for ingestion/reindex, privacy controls.

Keep this document updated as phases progress; link PRs/issues to each bullet to maintain visibility.
