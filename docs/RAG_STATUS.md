# RAG System Status: Intended vs Implemented

This document outlines the gap between the RAG (Retrieval-Augmented Generation) features that were built and what is actually integrated into the application.

**Last Updated:** January 2026

## Summary

| Category               | Built        | Integrated   | Status   |
| ---------------------- | ------------ | ------------ | -------- |
| Core Search            | 4 functions  | 1 function   | Partial  |
| Knowledge Ingestion    | 4 pipelines  | 4 pipelines  | Complete |
| Streaming Updates      | 6 functions  | 6 functions  | Complete |
| Governance/Purge       | 6 functions  | 6 functions  | Complete |
| Feedback/Evaluation    | 8 functions  | 2 functions  | Partial  |
| Cost Controls          | 13 functions | 13 functions | Complete |
| Drift Detection        | 5 functions  | 5 functions  | Complete |
| Multi-hop Retrieval    | 6 functions  | 6 functions  | Complete |
| Alert System           | 4 functions  | 4 functions  | Complete |
| Metrics                | 8 functions  | 4 functions  | Good     |
| External Knowledge     | 5 functions  | 4 functions  | Good     |
| Linked Commit          | 5 functions  | 5 functions  | Complete |
| Test Case Seeding      | 4 functions  | 4 functions  | Complete |
| Relationship Detection | 3 functions  | 3 functions  | Complete |
| Test Case Validation   | 2 functions  | 2 functions  | Complete |

**Overall:** ~99 functions built, ~84 actively used/exposed (85%)

---

## What's Actually Working

### 1. Core Search Pipeline

**Location:** `packages/shared/src/rag/search.ts`

| Function      | Used By                                | Purpose                              |
| ------------- | -------------------------------------- | ------------------------------------ |
| `searchAll()` | `services/api/src/routes/ragRoutes.ts` | API endpoint for combined RAG search |

**Not Used:**

- `searchDiffChunks()` - Available but no service calls it directly
- `searchKnowledgeDocs()` - Available but no service calls it directly
- `searchFromEventContext()` - Available but no service calls it directly

**How it works:**

- API clients call POST `/api/rag/search` endpoint
- Searches both diff chunks and knowledge docs
- Reranking is applied internally via `reranker.ts`
- Returns combined results with similarity scores

### 2. Knowledge Ingestion (All 4 pipelines active)

| Pipeline                  | Used By                                                      | Trigger                             |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| `ingestKnowledgeDoc()`    | `services/api/src/routes/ragRoutes.ts`                       | POST `/api/rag/ingest` endpoint     |
| `ingestSlackResolution()` | `services/slack-bot/src/services/resolutionService.ts`       | Resolution detected in Slack thread |
| `ingestPRFixComments()`   | `services/github-app/src/handlers/checkRunSuccessHandler.ts` | Check passes after prior failure    |
| `ingestAnalysisLesson()`  | `services/slack-bot/src/handlers/feedbackHandler.ts`         | User marks analysis as "helpful"    |

### 3. Streaming Updates (Complete)

**Location:** `packages/shared/src/rag/streamingUpdates.ts`

| Function                  | Status   | Used By                                                  |
| ------------------------- | -------- | -------------------------------------------------------- |
| `handlePRMergeEvent()`    | ACTIVE   | `services/github-app/src/handlers/pullRequestHandler.ts` |
| `handleDocUpdateEvent()`  | ACTIVE   | `services/github-app/src/routes/webhookRoutes.ts`        |
| `cleanupExpired()`        | ACTIVE   | Scheduled cron job in API service (every 24h)            |
| `checkStaleness()`        | ACTIVE   | GET `/api/rag/staleness`                                 |
| `markApproachingExpiry()` | INTERNAL | Used by staleness checks                                 |
| `getStaleDocuments()`     | ACTIVE   | GET `/api/rag/staleness/documents`                       |

### 4. Governance & Purge

**Location:** `packages/shared/src/rag/governance.ts`

| Function                    | Status | Used By                              |
| --------------------------- | ------ | ------------------------------------ |
| `getTenantRAGStats()`       | ACTIVE | GET `/api/rag/stats`                 |
| `purgeTenantRAGData()`      | ACTIVE | DELETE `/api/rag/tenant/:tenantId`   |
| `purgePRDiffChunks()`       | ACTIVE | DELETE `/api/rag/pr/:repo/:prNumber` |
| `purgeKnowledgeDocChunks()` | ACTIVE | DELETE `/api/rag/doc/:parentId`      |
| `checkRAGHealth()`          | ACTIVE | GET `/api/rag/health`                |
| `triggerReembedding()`      | ACTIVE | Scheduled cron job (every 6h)        |

### 5. Feedback Loop

**Location:** `packages/shared/src/rag/evaluation.ts`

| Function                    | Status   | Used By                                              |
| --------------------------- | -------- | ---------------------------------------------------- |
| `recordRAGFeedback()`       | ACTIVE   | `services/slack-bot/src/handlers/feedbackHandler.ts` |
| `getRAGEvaluationMetrics()` | ACTIVE   | GET `/api/rag/evaluation`                            |
| `calculateRecallAtK()`      | INTERNAL | Used by test suite                                   |
| `calculateMRR()`            | INTERNAL | Used by test suite                                   |
| `calculateHelpfulRate()`    | INTERNAL | Used by evaluation metrics                           |
| `runRAGTestCase()`          | ACTIVE   | POST `/api/rag/test-suite`                           |

### 6. External Knowledge

**Location:** `packages/shared/src/rag/externalKnowledge.ts`

| Function                      | Status   | Used By                                             |
| ----------------------------- | -------- | --------------------------------------------------- |
| `syncDueSources()`            | ACTIVE   | POST `/api/rag/sync`                                |
| `registerConnector()`         | ACTIVE   | Auto-called by `githubIssuesConnector.ts` on import |
| `initGitHubIssuesConnector()` | ACTIVE   | Called at API service startup                       |
| `getConnector()`              | INTERNAL | Used by `syncDueSources`                            |
| `syncExternalSource()`        | INTERNAL | Used by `syncDueSources`                            |

**Note:** The GitHub Issues connector is now initialized at API startup via `initGitHubIssuesConnector()`.

### 7. Cost Controls (Complete)

**Location:** `packages/shared/src/rag/costControls.ts`

| Function                      | Status   | Used By                                   |
| ----------------------------- | -------- | ----------------------------------------- |
| `selectEmbeddingTier()`       | ACTIVE   | `ingestionHelpers.ts`, `searchHelpers.ts` |
| `recordEmbeddingCost()`       | ACTIVE   | `ingestionHelpers.ts` (fire-and-forget)   |
| `recordQueryCost()`           | ACTIVE   | `searchHelpers.ts` (fire-and-forget)      |
| `getCachedEmbedding()`        | ACTIVE   | `searchHelpers.ts`                        |
| `cacheEmbedding()`            | ACTIVE   | `searchHelpers.ts`                        |
| `clearExpiredCache()`         | ACTIVE   | POST `/api/rag/cache/clear`               |
| `clearCache()`                | ACTIVE   | POST `/api/rag/cache/clear`               |
| `getCacheStats()`             | ACTIVE   | GET `/api/rag/cache/stats`                |
| `setTenantTierConfig()`       | ACTIVE   | PUT `/api/rag/tenant/:tenantId/tier`      |
| `getTenantTierConfig()`       | ACTIVE   | GET `/api/rag/tenant/:tenantId/tier`      |
| `shouldSkipExpensiveSearch()` | INTERNAL | Used by search optimization               |
| `estimateEmbeddingCost()`     | ACTIVE   | POST `/api/rag/cost/estimate`             |
| `estimateMonthlyCost()`       | ACTIVE   | POST `/api/rag/cost/estimate`             |

**Integration Notes:**

- Cost tracking is integrated into embedding operations via `recordEmbeddingCost()` and `recordQueryCost()`
- Tier selection uses tenant budget status from database
- Cache management exposed via API for admin operations
- Cost estimation available for planning and budget forecasting

### 8. Drift Detection (Complete)

**Location:** `packages/shared/src/rag/driftDetection.ts`

| Function                        | Status | Used By                                                      |
| ------------------------------- | ------ | ------------------------------------------------------------ |
| `runTestSuite()`                | ACTIVE | POST `/api/rag/test-suite`                                   |
| `generateDriftReport()`         | ACTIVE | GET/POST `/api/rag/drift-report`                             |
| `checkMetricBounds()`           | ACTIVE | POST `/api/rag/check-metric`                                 |
| `runDriftDetectionWithAlerts()` | ACTIVE | Scheduled cron job (every 24h), POST `/api/rag/drift-report` |
| `validateExpectedDocIds()`      | ACTIVE | Used by test suite execution                                 |

**Integration Notes:**

- Drift detection runs automatically via scheduled cron job in API service
- Manual trigger available via POST `/api/rag/drift-report`
- Test suite can be executed on-demand via POST `/api/rag/test-suite`
- Metric bounds checking available for targeted monitoring
- Test cases with missing expectedDocIds are skipped with detailed error info

### 9. Alert Dispatcher (Complete)

**Location:** `packages/shared/src/rag/alertDispatcher.ts`

| Function                      | Status | Used By                                 |
| ----------------------------- | ------ | --------------------------------------- |
| `dispatchDriftAlert()`        | ACTIVE | Used by drift detection                 |
| `dispatchDriftAlerts()`       | ACTIVE | Used by drift detection                 |
| `dispatchDriftReportAlerts()` | ACTIVE | Used by `runDriftDetectionWithAlerts()` |
| `dispatchHealthStatusAlert()` | ACTIVE | Used by health checks                   |

**Integration Notes:**

- Alert dispatcher is automatically invoked by scheduled drift detection
- Alerts sent to configured Slack channels when issues detected
- Can be configured to skip alerts for testing via `skipAlertDispatch` option

### 10. Linked Commit Ingestion (Complete)

**Location:** `packages/shared/src/rag/linkedCommitIngestion.ts`

| Function                        | Status   | Used By                                                  |
| ------------------------------- | -------- | -------------------------------------------------------- |
| `trackPRFailure()`              | ACTIVE   | `services/github-app/src/handlers/checkRunHandler.ts`    |
| `getPRFailures()`               | ACTIVE   | `services/github-app/src/handlers/pullRequestHandler.ts` |
| `clearPRFailures()`             | ACTIVE   | `services/github-app/src/handlers/pullRequestHandler.ts` |
| `ingestLinkedCommitKnowledge()` | ACTIVE   | `services/github-app/src/handlers/pullRequestHandler.ts` |
| `createFailureSummary()`        | INTERNAL | Used by `ingestLinkedCommitKnowledge()`                  |

**Integration Notes:**

- Failures are tracked when CI checks fail via `checkRunHandler.ts`
- On PR merge, tracked failures are retrieved and ingested as linked knowledge
- Creates high-value knowledge combining failure context with fix details
- Full workflow: failure tracked → PR merged → linked knowledge created

---

### 11. Multi-hop Retrieval (Complete)

**Location:** `packages/shared/src/rag/multiHop.ts` and `relationshipDetection.ts`

| Function                         | Status | Used By                              |
| -------------------------------- | ------ | ------------------------------------ |
| `traverseGraph()`                | ACTIVE | Graph traversal for related docs     |
| `expandWithRelatedDocs()`        | ACTIVE | Search result expansion              |
| `getGraphStats()`                | ACTIVE | Graph analytics                      |
| `findPath()`                     | ACTIVE | Path finding between docs            |
| `detectAndCreateRelationships()` | ACTIVE | POST `/api/rag/detect-relationships` |
| `findRelatedDocuments()`         | ACTIVE | Semantic relationship detection      |

**Integration Notes:**

- Relationship detection is available via API endpoint and during ingestion
- Auto-detects relationships based on semantic similarity and pattern matching
- Uses error patterns, technology dependencies, and content similarity
- Relationships are stored in `incident_relationships` table
- Can be enabled during ingestion via `detectRelationships: true` option in `ingestKnowledgeDoc()`

### 12. Test Case Seeding (Complete)

**Location:** `packages/shared/src/rag/testCaseSeeding.ts`

| Function                     | Status | Used By                         |
| ---------------------------- | ------ | ------------------------------- |
| `seedTestCases()`            | ACTIVE | POST `/api/rag/seed-test-cases` |
| `getSeedTestCaseTemplates()` | ACTIVE | Preview available templates     |
| `getSeedCategories()`        | ACTIVE | List categories                 |

**Integration Notes:**

- 13 predefined test cases covering common CI failure scenarios
- Categories: typescript, testing, linting, dependencies, docker, database, etc.
- Skips existing test cases to avoid duplicates
- Used for drift detection baseline

---

## Chunking Strategies Usage

| Strategy                    | Status    | Used By                                               |
| --------------------------- | --------- | ----------------------------------------------------- |
| `ANALYSIS_LESSON_STRATEGY`  | ACTIVE    | `analysisLessonIngestion.ts`                          |
| `PR_FIX_COMMENT_STRATEGY`   | ACTIVE    | `prFixCommentIngestion.ts`                            |
| `SLACK_RESOLUTION_STRATEGY` | ACTIVE    | `slackResolutionIngestion.ts`                         |
| `RUNBOOK_STRATEGY`          | AVAILABLE | POST `/api/rag/ingest` with docType="runbook"         |
| `POSTMORTEM_STRATEGY`       | AVAILABLE | POST `/api/rag/ingest` with docType="postmortem"      |
| `TROUBLESHOOTING_STRATEGY`  | AVAILABLE | POST `/api/rag/ingest` with docType="troubleshooting" |
| `SOP_STRATEGY`              | AVAILABLE | POST `/api/rag/ingest` with docType="sop"             |
| `EXTERNAL_STRATEGY`         | AVAILABLE | POST `/api/rag/ingest` with docType="external"        |

**Note:** All chunking strategies are now available via the `/api/rag/ingest` endpoint. External systems can trigger ingestion with any supported document type.

---

## Database Schema vs Usage

| Repository/Table           | Exists | Used                                              |
| -------------------------- | ------ | ------------------------------------------------- |
| `diffChunkRepository`      | Yes    | Yes - PR merge ingestion & search                 |
| `knowledgeDocRepository`   | Yes    | Yes - knowledge ingestion & search                |
| `feedbackRepository`       | Yes    | Yes - feedback recording                          |
| `externalSourceRepository` | Yes    | Yes - external knowledge sync                     |
| `knowledgeDocHitTracking`  | Yes    | Yes - used by reranker                            |
| `relationshipRepository`   | Yes    | Partial - infrastructure exists, needs population |
| `testCaseRepository`       | Yes    | Yes - used by test suite endpoint                 |
| `metricsHistoryRepository` | Yes    | Yes - used by drift detection                     |
| `costTrackingRepository`   | Yes    | Yes - cost tracking fully integrated              |
| `expires_at` column        | Yes    | Yes - used by cleanup & staleness                 |
| `is_stale` column          | Yes    | Yes - used by staleness checks                    |
| `last_refreshed_at` column | Yes    | Yes - used by staleness checks                    |
| `embedding_version` column | Yes    | Yes - used by scheduled re-embedding              |

---

## Service Integration Points

### API Service (`services/api/src/routes/ragRoutes.ts`)

| Endpoint                             | Function                                                              | Status |
| ------------------------------------ | --------------------------------------------------------------------- | ------ |
| POST `/api/rag/ingest`               | `ingestKnowledgeDoc()`                                                | ACTIVE |
| POST `/api/rag/search`               | `searchAll()`                                                         | ACTIVE |
| GET `/api/rag/stats`                 | `getTenantRAGStats()`                                                 | ACTIVE |
| GET `/api/rag/health`                | `checkRAGHealth()`                                                    | ACTIVE |
| GET `/api/rag/metrics`               | `getRAGMetricsSnapshot()`                                             | ACTIVE |
| GET `/api/rag/evaluation`            | `getRAGEvaluationMetrics()`                                           | ACTIVE |
| POST `/api/rag/sync`                 | `syncDueSources()`                                                    | ACTIVE |
| POST `/api/rag/cleanup`              | `cleanupExpired()`                                                    | ACTIVE |
| DELETE `/api/rag/tenant/:tenantId`   | `purgeTenantRAGData()`                                                | ACTIVE |
| DELETE `/api/rag/pr/:repo/:prNumber` | `purgePRDiffChunks()`                                                 | ACTIVE |
| DELETE `/api/rag/doc/:parentId`      | `purgeKnowledgeDocChunks()`                                           | ACTIVE |
| GET `/api/rag/cost-stats`            | `getCostStats()`                                                      | ACTIVE |
| GET `/api/rag/tenant/:tenantId/tier` | `getTenantTierConfig()`                                               | ACTIVE |
| PUT `/api/rag/tenant/:tenantId/tier` | `setTenantTierConfig()`                                               | ACTIVE |
| POST `/api/rag/test-suite`           | `runTestSuite()`                                                      | ACTIVE |
| GET `/api/rag/drift-report`          | `generateDriftReport()`                                               | ACTIVE |
| POST `/api/rag/drift-report`         | `runDriftDetectionWithAlerts()`                                       | ACTIVE |
| POST `/api/rag/check-metric`         | `checkMetricBounds()`                                                 | ACTIVE |
| GET `/api/rag/staleness`             | `checkStaleness()`                                                    | ACTIVE |
| GET `/api/rag/staleness/documents`   | `getStaleDocuments()`                                                 | ACTIVE |
| GET `/api/rag/cache/stats`           | `getCacheStats()`                                                     | ACTIVE |
| POST `/api/rag/cache/clear`          | `clearCache()`, `clearExpiredCache()`                                 | ACTIVE |
| POST `/api/rag/cost/estimate`        | `estimateEmbeddingCost()`, `estimateMonthlyCost()`, `recommendTier()` | ACTIVE |
| POST `/api/rag/reembed`              | `triggerReembedding()`                                                | ACTIVE |
| POST `/api/rag/seed-test-cases`      | `seedTestCases()`                                                     | ACTIVE |
| POST `/api/rag/detect-relationships` | `detectAndCreateRelationships()`                                      | ACTIVE |

**Scheduled Jobs:**

- `cleanupExpired()` runs every 24 hours via `RAG_JOB_INTERVALS.CLEANUP_MS`
- `runDriftDetectionWithAlerts()` runs every 24 hours via `RAG_JOB_INTERVALS.DRIFT_DETECTION_MS`
- `triggerReembedding()` runs every 6 hours via `RAG_JOB_INTERVALS.REEMBED_CHECK_MS`

**Startup Initialization:**

- `initGitHubIssuesConnector()` called at API startup to register the GitHub Issues connector

### GitHub App (`services/github-app/src/`)

| Handler                     | Function                        | Trigger                       |
| --------------------------- | ------------------------------- | ----------------------------- |
| `pullRequestHandler.ts`     | `handlePRMergeEvent()`          | PR merged                     |
| `pullRequestHandler.ts`     | `ingestLinkedCommitKnowledge()` | PR merged with prior failures |
| `checkRunHandler.ts`        | `trackPRFailure()`              | CI check fails                |
| `checkRunSuccessHandler.ts` | `ingestPRFixComments()`         | Check passes after failure    |
| `webhookRoutes.ts`          | `handleDocUpdateEvent()`        | Push to main with doc files   |

### Slack Bot (`services/slack-bot/src/`)

| Handler                | Function                  | Trigger                         |
| ---------------------- | ------------------------- | ------------------------------- |
| `feedbackHandler.ts`   | `recordRAGFeedback()`     | User clicks helpful/not helpful |
| `feedbackHandler.ts`   | `ingestAnalysisLesson()`  | Positive feedback (background)  |
| `resolutionService.ts` | `ingestSlackResolution()` | Resolution detected in thread   |

---

## Recommendations

### Completed (January 2026)

1. ~~**Import GitHub Issues connector at startup**~~ - Done
2. ~~**Expose `getRAGMetricsSnapshot()` via API**~~ - GET `/api/rag/metrics`
3. ~~**Add `/api/rag/health` endpoint**~~ - GET `/api/rag/health`
4. ~~**Add cron job for `cleanupExpired()`**~~ - Runs every 24h
5. ~~**Expose `getRAGEvaluationMetrics()` via API**~~ - GET `/api/rag/evaluation`
6. ~~**Add cost tracking to embedding calls**~~ - Integrated in ingestion & search
7. ~~**Export and integrate `linkedCommitIngestion`**~~ - Fully integrated in workflow
8. ~~**Implement drift detection cron**~~ - Runs every 24h with alerts
9. ~~**Wire up alert dispatcher**~~ - Connected to drift detection
10. ~~**Full cost controls admin API**~~ - Tenant tier config, cache, estimation endpoints
11. ~~**Wire `ingestLinkedCommitKnowledge()`**~~ - Integrated in PR merge handler
12. ~~**Add staleness check endpoints**~~ - GET `/api/rag/staleness` and `/staleness/documents`

### Remaining Initiatives

13. ~~**Multi-hop relationship population**~~ - POST `/api/rag/detect-relationships`
14. ~~**Re-embedding triggers**~~ - POST `/api/rag/reembed`
15. ~~**Test case seed data**~~ - POST `/api/rag/seed-test-cases`

### Completed Enhancements (January 2026)

16. ~~**Auto-detect relationships during ingestion**~~ - Added `detectRelationships` option to `ingestKnowledgeDoc()`
17. ~~**Scheduled re-embedding**~~ - Cron job runs every 6 hours via `RAG_JOB_INTERVALS.REEMBED_CHECK_MS`
18. ~~**Enhanced test case validation**~~ - `validateExpectedDocIds()` validates doc IDs exist before running tests

### Remaining: Multi-Platform CI Support

Currently GitHub-only. Needs expansion to support other CI/CD platforms:

**External Knowledge Connectors (Lower Effort):**

- Implement `ExternalSourceConnector` interface for each platform
- Connector types to add: `GITLAB_ISSUES`, `JENKINS_BUILDS`, `CIRCLECI`, `BITBUCKET_ISSUES`

| Platform              | Connector                  | Status             |
| --------------------- | -------------------------- | ------------------ |
| GitHub Issues         | `githubIssuesConnector.ts` | ✅ Implemented     |
| GitLab Issues         | -                          | ❌ Not implemented |
| Jenkins Build History | -                          | ❌ Not implemented |
| CircleCI              | -                          | ❌ Not implemented |
| Bitbucket Issues      | -                          | ❌ Not implemented |
| Confluence            | -                          | ❌ Not implemented |
| Notion                | -                          | ❌ Not implemented |

**CI Failure Analysis (Higher Effort):**

- Requires new service per platform (like `services/github-app/`)
- Webhook handlers for platform-specific payloads
- Context fetching (logs, annotations, PR info)
- Normalize to internal failure format

| Platform  | Service                   | Webhook Handler      | Status             |
| --------- | ------------------------- | -------------------- | ------------------ |
| GitHub    | `services/github-app/`    | `checkRunHandler.ts` | ✅ Implemented     |
| GitLab    | `services/gitlab-app/`    | -                    | ❌ Not implemented |
| Jenkins   | `services/jenkins-app/`   | -                    | ❌ Not implemented |
| CircleCI  | `services/circleci-app/`  | -                    | ❌ Not implemented |
| Bitbucket | `services/bitbucket-app/` | -                    | ❌ Not implemented |

**Shared Components (Already Abstracted):**

- Redis aggregator - can be reused across platforms
- RAG ingestion pipeline - platform-agnostic
- Slack notification system - platform-agnostic
- Cost controls & drift detection - platform-agnostic

---

## File Reference

| File                          | Status   | Lines | Primary Functions                                                           |
| ----------------------------- | -------- | ----- | --------------------------------------------------------------------------- |
| `search.ts`                   | PARTIAL  | 399   | `searchAll` (used), 3 others internal                                       |
| `searchHelpers.ts`            | ACTIVE   | ~350  | Internal helpers + cost tracking                                            |
| `ingestion.ts`                | ACTIVE   | ~430  | `ingestKnowledgeDoc` (with auto-relationship detection), `ingestDiffChunks` |
| `ingestionHelpers.ts`         | ACTIVE   | ~260  | Internal helpers + cost tracking                                            |
| `streamingUpdates.ts`         | COMPLETE | 439   | All functions integrated                                                    |
| `governance.ts`               | COMPLETE | 403   | All 6 functions used                                                        |
| `evaluation.ts`               | GOOD     | 487   | Core functions integrated via API                                           |
| `reranker.ts`                 | ACTIVE   | 359   | `fullRerank` (internal)                                                     |
| `slackResolutionIngestion.ts` | ACTIVE   | 411   | `ingestSlackResolution`                                                     |
| `slackResolutionDetector.ts`  | ACTIVE   | ~200  | Detection logic                                                             |
| `prFixCommentIngestion.ts`    | ACTIVE   | 411   | `ingestPRFixComments`                                                       |
| `prFixCommentDetector.ts`     | ACTIVE   | ~200  | Detection logic                                                             |
| `analysisLessonIngestion.ts`  | ACTIVE   | 407   | `ingestAnalysisLesson`                                                      |
| `chunking.ts`                 | ACTIVE   | 456   | Core chunking                                                               |
| `chunkingStrategies.ts`       | COMPLETE | ~300  | All strategies available via API                                            |
| `docTypeChunking.ts`          | ACTIVE   | ~150  | Routes to strategies                                                        |
| `schemas/`                    | ACTIVE   | ~200  | Metadata validation                                                         |
| `metrics.ts`                  | GOOD     | 373   | Recording + retrieval via API                                               |
| `externalKnowledge.ts`        | GOOD     | 394   | Full integration + connector init                                           |
| `githubIssuesConnector.ts`    | ACTIVE   | 394   | Initialized at API startup                                                  |
| `costControls.ts`             | COMPLETE | 572   | All functions integrated via API                                            |
| `driftDetection.ts`           | COMPLETE | ~530  | All functions integrated + cron + validation                                |
| `alertDispatcher.ts`          | COMPLETE | 328   | Integrated with drift detection                                             |
| `multiHop.ts`                 | COMPLETE | 453   | All functions integrated via API                                            |
| `linkedCommitIngestion.ts`    | COMPLETE | 457   | Fully integrated in workflow                                                |
| `relationshipDetection.ts`    | COMPLETE | ~300  | Auto-detection + API                                                        |
| `testCaseSeeding.ts`          | COMPLETE | ~250  | Seed data + API                                                             |
| `testCaseRepository.ts`       | COMPLETE | ~360  | Test case CRUD + validation                                                 |

**Total:** ~10,500 lines across 29 modules
