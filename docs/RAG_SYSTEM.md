# RAG System Documentation

Kenchi's Retrieval-Augmented Generation (RAG) system enables semantic search over code changes, documentation, and team knowledge to provide contextual suggestions for CI failures.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Knowledge Sources](#knowledge-sources)
- [Core Features](#core-features)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Metrics & Monitoring](#metrics--monitoring)
- [Troubleshooting](#troubleshooting)

---

## Overview

The RAG system learns from your team's historical fixes and documentation to suggest solutions for new CI failures. It operates through:

1. **Passive Learning** - Automatically captures knowledge from PR comments, Slack threads, and merged code
2. **Active Ingestion** - Manual ingestion of runbooks, postmortems, and documentation
3. **Semantic Search** - Vector-based similarity matching to find relevant past solutions
4. **Quality Monitoring** - Drift detection and feedback loops to maintain accuracy

### Key Benefits

| Benefit                    | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| **Contextual Suggestions** | Find past fixes for similar errors                        |
| **Team Knowledge Capture** | Learn from Slack discussions and PR comments              |
| **Cross-Repo Learning**    | Apply solutions from one repo to similar issues elsewhere |
| **Continuous Improvement** | Feedback loops improve suggestions over time              |

---

## Architecture

The RAG system consists of three main layers:

### Knowledge Sources Layer

Sources of information that feed into the system:

- **PR Diffs** - Code changes captured on merge
- **PR Comments** - Developer explanations of fixes
- **Slack Threads** - Team discussions and resolutions
- **Runbooks & Docs** - Manual documentation uploads
- **External Sources** - GitHub Issues and other integrations

### Ingestion Pipeline

Processing flow for incoming knowledge:

1. **Chunking Strategy** - Breaks content into semantic chunks based on document type
2. **Metadata Validation** - Validates and enriches metadata
3. **Embedding Generation** - Creates vector embeddings using OpenAI
4. **Vector Storage** - Stores in PostgreSQL with pgvector extension

### Search & Retrieval Layer

Query processing flow:

1. **Query Embedding** - Converts search query to vector
2. **Vector Search** - Finds similar documents by cosine similarity
3. **Reranking** - Applies scoring formula for relevance ordering
4. **Results + Context** - Returns ranked results with metadata

### Quality & Monitoring Layer

Ongoing system health:

- **Feedback Tracking** - Records user helpful/not-helpful signals
- **Drift Detection** - Monitors quality metrics over time
- **Cost Controls** - Manages embedding API costs
- **Health Checks** - System availability monitoring

---

## Knowledge Sources

### 1. PR Diffs (Automatic)

When a PR is merged, Kenchi automatically ingests the diff. The system captures file paths changed, code additions/deletions, and commit context. This happens automatically via the PR merge webhook.

### 2. PR Fix Comments (Passive Learning)

When developers comment on PRs explaining fixes, Kenchi detects and ingests them.

**Detection patterns recognized:**

- "fixed it by...", "the fix was..."
- "this fixes...", "resolved by..."
- "the issue was...", "root cause..."
- Code blocks with solutions

### 3. Slack Thread Resolutions (Passive Learning)

When teams discuss and resolve CI failures in Slack, the system captures the resolution.

**Signals detected:**

- Fix patterns ("fixed it", "the solution is...")
- Positive reactions (checkmarks, thumbs up, celebration emojis)
- Code blocks in replies
- Thread position (later messages more likely to contain resolution)

### 4. Runbooks & Documentation (Manual)

Team documentation can be manually ingested for RAG retrieval.

**Supported document types:**

| Type            | Description         |
| --------------- | ------------------- |
| runbook         | Operational guides  |
| postmortem      | Incident analysis   |
| troubleshooting | Diagnostic guides   |
| sop             | Standard procedures |
| architecture    | System design docs  |
| documentation   | General team docs   |

### 5. External Sources (Configured)

Knowledge can be synced from external sources like GitHub Issues. Connectors are registered at application startup and sync on a configured schedule.

### 6. Linked Commit Knowledge (Automatic)

When a PR that previously had CI failures is merged, Kenchi automatically creates a high-value knowledge document that links the failure context with the fix. This is the most valuable form of passive learning because it captures the complete story: what broke, why it was fixed, and how.

**What gets captured:**

| Component        | Description                                               |
| ---------------- | --------------------------------------------------------- |
| Error patterns   | The specific error messages and patterns from the failure |
| Identified cause | The AI-analyzed root cause of the failure                 |
| Failed tests     | Names of tests that failed                                |
| Commit messages  | Developer's explanation of the fix                        |
| Changed files    | List of files modified to fix the issue                   |
| Diff summary     | The actual code changes that resolved the failure         |

**How it works:**

1. CI failure occurs on a PR — failure context is stored temporarily
2. Developer fixes the issue and pushes new commits
3. PR is merged — system detects that failures were previously tracked
4. A combined knowledge document is created linking failure + fix
5. Document is ingested with the highest passive learning reliability score (0.9)

**Why this is valuable:**

This knowledge type directly answers "How was this error fixed before?" by providing the exact fix that resolved a similar failure. Unlike other passive learning sources that capture fragments (just the comment, or just the code), linked commit knowledge captures the complete context — making it the most actionable knowledge in the system.

---

## Core Features

### Semantic Search

Find relevant knowledge using natural language queries. The system supports:

- **Combined search** - Searches across both diff chunks and knowledge docs
- **Filtered search** - Search only knowledge docs or only code diffs
- **Repository scoping** - Boost results from the same repository
- **Top-K limiting** - Control number of results returned
- **Reranking toggle** - Enable/disable deterministic reranking

### Event-Based Search

Build search queries automatically from CI failure context. The system extracts:

- Event type (CI failure, build error, test failure)
- Repository and branch information
- Error messages and summaries
- Affected file paths
- Failed test names

### Deterministic Reranking

Results are reranked using a transparent scoring formula:

**Final Score = (Vector Similarity × 55%) + (Source Reliability × 20%) + (Recency Boost × 15%) + (Feedback Signal × 10%) + Metadata Boost**

| Component          | Weight   | Description                                                  |
| ------------------ | -------- | ------------------------------------------------------------ |
| Vector Similarity  | 55%      | Embedding cosine similarity                                  |
| Source Reliability | 20%      | Doc type credibility (manual > passive > external)           |
| Recency Boost      | 15%      | Newer = higher (7 days = 1.0, 90 days = 0.1)                 |
| Feedback Signal    | 10%      | User helpful/not-helpful ratio                               |
| Metadata Boost     | Variable | Exact matches: repo (+0.15), workflow (+0.10), error (+0.20) |

Each result includes a score breakdown showing contribution from each component.

### Multi-Hop Retrieval

Expand search results by following graph connections between related documents. Features include:

- **Graph traversal** - Find documents connected to initial results
- **Depth control** - Limit how many hops to traverse
- **Strength filtering** - Only follow strong relationships
- **Path finding** - Find connection paths between two documents

### Feedback & Evaluation

Track which suggestions are helpful to improve the system over time:

- **Relevance recording** - Record helpful, not helpful, or partially helpful
- **Query context** - Associate feedback with the original search
- **Aggregated metrics** - View helpful rates across the tenant

### Drift Detection

Monitor RAG quality over time:

- **Quality reports** - Generate health status (healthy, degraded, critical)
- **Metric tracking** - Monitor recall, MRR, and other IR metrics
- **Baseline comparison** - Compare current metrics to historical baselines
- **Automatic alerts** - Send Slack notifications when issues detected

### Cost Controls

Optimize embedding costs:

- **Tier selection** - Choose embedding model based on budget
- **Cache statistics** - Monitor hit/miss rates
- **Cost estimation** - Project monthly spend
- **Skip logic** - Use cheaper search for simple queries

---

## API Reference

### Ingestion Functions

| Function              | Description                                |
| --------------------- | ------------------------------------------ |
| ingestDiffChunks      | Ingest PR diff into vector store           |
| ingestKnowledgeDoc    | Ingest knowledge document with metadata    |
| handlePRMergeEvent    | Handle PR merge webhook for diff ingestion |
| handleDocUpdateEvent  | Handle doc file update webhook             |
| ingestPRFixComments   | Ingest fix comments from PR                |
| ingestSlackResolution | Ingest resolution from Slack thread        |
| ingestAnalysisLesson  | Ingest lesson from incident analysis       |

### Search Functions

| Function               | Description                           |
| ---------------------- | ------------------------------------- |
| searchAll              | Combined search across diffs and docs |
| searchDiffChunks       | Search only code diffs                |
| searchKnowledgeDocs    | Search only knowledge docs            |
| searchFromEventContext | Build query from CI failure context   |

### Reranking Functions

| Function       | Description                            |
| -------------- | -------------------------------------- |
| rerankResults  | Score and sort results                 |
| fullRerank     | Complete reranking pipeline            |
| applyHardRules | Apply priority rules (same-repo boost) |

### Governance Functions

| Function           | Description               |
| ------------------ | ------------------------- |
| getTenantRAGStats  | Get tenant statistics     |
| purgeTenantRAGData | Delete all tenant data    |
| purgePRDiffChunks  | Delete PR-specific chunks |
| triggerReembedding | Re-embed with new model   |
| checkRAGHealth     | System health check       |

### Quality Functions

| Function                    | Description             |
| --------------------------- | ----------------------- |
| recordRAGFeedback           | Record user feedback    |
| runTestSuite                | Run regression tests    |
| generateDriftReport         | Generate quality report |
| runDriftDetectionWithAlerts | Detect drift and alert  |

### Cost Functions

| Function                  | Description              |
| ------------------------- | ------------------------ |
| selectEmbeddingTier       | Choose embedding tier    |
| getCacheStats             | Get cache hit/miss stats |
| estimateMonthlyCost       | Estimate monthly cost    |
| shouldSkipExpensiveSearch | Check if should skip     |

---

## Configuration

### Environment Variables

| Variable                    | Description                                                     | Default                |
| --------------------------- | --------------------------------------------------------------- | ---------------------- |
| OPENAI_API_KEY              | OpenAI API key for embeddings                                   | Required               |
| EMBEDDING_MODEL             | Model to use (text-embedding-3-small or text-embedding-3-large) | text-embedding-3-small |
| DATABASE_URL                | PostgreSQL connection string                                    | Required               |
| RAG_DEFAULT_TIER            | Default embedding tier (LIGHT, STANDARD, PREMIUM)               | STANDARD               |
| RAG_MONTHLY_BUDGET          | Monthly budget in USD                                           | 100                    |
| RAG_DIFF_CHUNK_TTL          | Days to keep diff chunks                                        | 90                     |
| RAG_KNOWLEDGE_DOC_TTL       | Days to keep knowledge docs                                     | 365                    |
| RAG_EXTERNAL_DOC_TTL        | Days to keep external docs                                      | 30                     |
| RAG_CLEANUP_INTERVAL_MS     | Cleanup job interval                                            | 86400000 (24 hours)    |
| RAG_DRIFT_CHECK_INTERVAL_MS | Drift check interval                                            | 86400000 (24 hours)    |

### Document Type Chunking Strategies

Each document type has specific chunking parameters:

| Doc Type         | Target Tokens | Overlap | Special Handling      |
| ---------------- | ------------- | ------- | --------------------- |
| runbook          | 400           | 15%     | Preserve sections     |
| postmortem       | 500           | 20%     | Preserve sections     |
| troubleshooting  | 350           | 15%     | Standard              |
| pr_fix_comment   | 300           | 10%     | Atomic (no splitting) |
| slack_resolution | 400           | 15%     | Atomic (no splitting) |
| analysis_lesson  | 400           | 15%     | Standard              |
| external         | 400           | 15%     | Standard              |

---

## Best Practices

### Writing Effective Fix Comments

Good fix comments help the RAG system learn. Include:

- **Root cause** - What was the actual problem
- **Solution** - What change fixed it
- **Context** - Why this solution works

**Good examples:**

- "Fixed the timeout by increasing the connection pool size from 10 to 50. The issue was connection exhaustion under load."
- "Root cause was a missing null check in the auth middleware. Added validation before processing the token."

**Poor examples:**

- "fixed"
- "works now"

### Optimizing Search Queries

For best search results:

- **Be specific** - Include error codes, file paths, and service names
- **Include context** - Specify repository and workflow when relevant
- **Use natural language** - Describe the problem as you would to a colleague

### Feedback Loop

Encourage users to rate suggestions to improve relevance over time. The system learns from:

- Helpful ratings boost similar document rankings
- Not helpful ratings reduce future ranking for similar contexts
- Feedback is aggregated to identify systematic issues

---

## Metrics & Monitoring

### Key Metrics

| Metric         | Description                    | Target |
| -------------- | ------------------------------ | ------ |
| Recall@5       | Relevant docs in top 5 results | > 80%  |
| MRR            | Mean Reciprocal Rank           | > 0.6  |
| Helpful Rate   | Positive user feedback ratio   | > 70%  |
| Cache Hit Rate | Embedding cache efficiency     | > 60%  |
| Error Rate     | Embedding generation failures  | < 5%   |

### Health Monitoring

Regular health checks should monitor:

- System health status (healthy, degraded, critical)
- Pending embeddings count
- Cache hit rate trends
- Error rate trends
- Document freshness (stale document count)

---

## Troubleshooting

### No Results Returned

- Check if documents are ingested using tenant stats
- Verify embeddings are generated via health check
- Lower the minSimilarity threshold
- Ensure the query has sufficient context

### Poor Relevance

- Enable reranking (enabled by default)
- Add query context: repository, workflow, errorSignature
- Check feedback metrics for patterns
- Review recently added documents for quality

### High Costs

- Embeddings are cached by default - verify cache is working
- Use the skip expensive search check for simple queries
- Consider LIGHT tier for non-critical searches
- Review query volume and optimize high-frequency paths

### Stale Results

- Run the cleanup expired job
- Check TTL policy configuration
- Trigger reembedding after model updates
- Verify webhook handlers are processing updates
