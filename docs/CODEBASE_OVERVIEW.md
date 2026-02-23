# Kenchi Codebase Overview

## Architecture Summary

Kenchi is a TypeScript monorepo with a **shared package** containing all reusable code, and **three microservices** that handle specific responsibilities. The frontend we built is a new addition.

```
kenchi/
├── packages/shared/          # Shared library (ZERO duplication policy)
├── services/
│   ├── api/                  # Central API service (Port 3000)
│   ├── github-app/           # GitHub integration (Port 3002)
│   ├── slack-bot/            # Slack integration (Port 3001)
│   └── frontend/             # Web dashboard (Port 3003) - NEW
├── database/                 # SQL migrations
└── docs/                     # Documentation
```

---

## 📦 packages/shared/

**Purpose**: All shared code. Any code used by 2+ services goes here.

### Core Infrastructure (`src/core/`)

| File               | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `config.ts`        | Centralized environment variable management            |
| `logger.ts`        | Structured JSON logging (winston-based)                |
| `errors.ts`        | Custom error classes (AppError, ValidationError, etc.) |
| `types.ts`         | Shared TypeScript types/interfaces                     |
| `utils.ts`         | Utility functions (delay, safeJsonParse, etc.)         |
| `concurrency.ts`   | Concurrency limiters for API calls                     |
| `evidenceTypes.ts` | Types for CI failure evidence                          |
| `webhookTypes.ts`  | Webhook event type definitions                         |

### Database (`src/database/`)

**Purpose**: PostgreSQL with pgvector for vector search.

| Module               | Purpose                              |
| -------------------- | ------------------------------------ |
| `client/`            | Database connection pool management  |
| `tenant/`            | Multi-tenant organization management |
| `repositoryChannel/` | Maps GitHub repos to Slack channels  |
| `diffChunk/`         | Stores PR diff chunks for RAG        |
| `knowledgeDoc/`      | Stores knowledge base documents      |
| `actionProposal/`    | Stores AI-suggested actions          |
| `analysis/`          | Stores analysis results              |
| `riskRules/`         | Custom risk assessment rules         |
| `feedback/`          | User feedback on AI suggestions      |
| `vector/`            | pgvector query builder               |

### AI/LLM (`src/llm/`)

**Purpose**: OpenAI integration with safety.

| File                                 | Purpose                         |
| ------------------------------------ | ------------------------------- |
| `providers/llmProvider/client.ts`    | LLM client with retry logic     |
| `providers/llmProvider/embedding.ts` | Vector embedding generation     |
| `responseParser.ts`                  | Parse LLM structured outputs    |
| `jsonExtraction.ts`                  | Extract JSON from LLM responses |
| `tokenManager.ts`                    | Token usage tracking            |
| `validation.ts`                      | LLM output validation           |

### RAG System (`src/rag/`)

**Purpose**: Retrieval-Augmented Generation for knowledge.

| File                          | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `ingestion.ts`                | Ingest documents into vector store      |
| `search.ts`                   | Semantic search with embeddings         |
| `reranker.ts`                 | Re-rank search results by relevance     |
| `chunking.ts`                 | Split documents into chunks             |
| `costControls.ts`             | Budget-aware embedding tier selection   |
| `driftDetection.ts`           | Monitor RAG quality over time           |
| `multiHop.ts`                 | Multi-hop retrieval for complex queries |
| `prFixCommentIngestion.ts`    | Extract fixes from PR comments          |
| `slackResolutionIngestion.ts` | Extract resolutions from Slack          |

### Safety (`src/safety/`)

**Purpose**: Ensure AI outputs are safe and validated.

| Module                               | Purpose                                 |
| ------------------------------------ | --------------------------------------- |
| `scoring/confidenceScoring/`         | 6-factor confidence scoring algorithm   |
| `scoring/riskScoring/`               | Context-aware risk assessment           |
| `scoring/consistency/`               | Check action/recommendation consistency |
| `gating/actionGating.ts`             | Auto-approve vs require approval        |
| `gating/promptInjection.ts`          | Detect prompt injection attacks         |
| `validation/hallucination.ts`        | Detect AI hallucinations                |
| `validation/uncertaintyDetection.ts` | Detect hedging language                 |
| `audit/audit.ts`                     | Audit trail for all actions             |

### Caching (`src/cache/`)

**Purpose**: Redis caching for performance.

| File               | Purpose                        |
| ------------------ | ------------------------------ |
| `cacheClient.ts`   | Redis client configuration     |
| `githubCache.ts`   | Cache GitHub API responses     |
| `analysisCache.ts` | Cache analysis results         |
| `tenantCache.ts`   | Cache tenant configurations    |
| `mappingCache.ts`  | Cache repo-to-channel mappings |

### Queue (`src/queue/`)

**Purpose**: Redis-based message queues.

| File                            | Purpose                        |
| ------------------------------- | ------------------------------ |
| `redisClient.ts`                | Redis pub/sub client           |
| `messageQueue.ts`               | Queue creation and processing  |
| `slackNotificationProcessor.ts` | Send Slack notifications async |

### Formatting (`src/formatting/`)

**Purpose**: Process CI logs and format outputs.

| Module                 | Purpose                            |
| ---------------------- | ---------------------------------- |
| `preprocessing/`       | Log sanitization, line mapping     |
| `chunking/`            | Smart log chunking for LLM context |
| `extraction/`          | Extract artifacts from chunks      |
| `aggregation/`         | Aggregate multiple failures        |
| `output/`              | Format Slack/GitHub messages       |
| `testSummaryParser.ts` | Parse test failure summaries       |

### Rate Limiting (`src/rateLimit/`)

**Purpose**: Security and abuse prevention.

| File                | Purpose                       |
| ------------------- | ----------------------------- |
| `middleware.ts`     | Express rate limit middleware |
| `botDetection.ts`   | Detect bot traffic            |
| `burstDetection.ts` | Detect traffic spikes         |
| `geoRestriction.ts` | Geographic restrictions       |
| `apiKey.ts`         | API key validation            |

### HTTP (`src/http/`)

**Purpose**: Express middleware and utilities.

| File                 | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `middleware.ts`      | errorHandler, asyncHandler, requestLogger |
| `validation.ts`      | Request validation schemas                |
| `circuitBreaker.ts`  | Circuit breaker for external APIs         |
| `resilientClient.ts` | Retry logic for HTTP calls                |

### Actions (`src/actions/`)

**Purpose**: Execute approved actions.

| File                      | Purpose                        |
| ------------------------- | ------------------------------ |
| `actionExecutor.ts`       | Execute safe actions           |
| `actionQueueProcessor.ts` | Process action queue           |
| `actionPayloadStore.ts`   | Store action payloads securely |

### Aggregation (`src/aggregation/`)

**Purpose**: Combine related CI failures.

| File                        | Purpose                            |
| --------------------------- | ---------------------------------- |
| `redisAggregator.ts`        | Redis-based failure aggregation    |
| `aggregatorWorker.ts`       | Worker to check ready aggregations |
| `analysisQueueProcessor.ts` | Process consolidated analyses      |

### Health (`src/health/`)

**Purpose**: Health checks for monitoring.

| File             | Purpose                 |
| ---------------- | ----------------------- |
| `healthCheck.ts` | Component health checks |

### Constants (`src/constants/`)

**Purpose**: All application constants in one place.

| File              | Purpose                      |
| ----------------- | ---------------------------- |
| `confidence.ts`   | Confidence scoring constants |
| `safety.ts`       | Safety threshold constants   |
| `ragConstants.ts` | RAG configuration            |
| `github.ts`       | GitHub API limits            |
| `slack.ts`        | Slack API limits             |
| `llm.ts`          | LLM model settings           |

---

## 🔧 services/api/ (Port 3000)

**Purpose**: Central API for analysis, RAG, and fine-tuning.

### Entry Point

| File       | Purpose                                             |
| ---------- | --------------------------------------------------- |
| `index.ts` | Express server setup, schedulers, graceful shutdown |

### Routes (`src/routes/`)

| File                  | Purpose                                 |
| --------------------- | --------------------------------------- |
| `healthRoutes.ts`     | Health check endpoints                  |
| `analysisRoutes.ts`   | POST /api/analyze - CI failure analysis |
| `eventRoutes.ts`      | POST /events - Event ingestion          |
| `webhookRoutes.ts`    | Generic webhook receiver                |
| `riskRulesRoutes.ts`  | CRUD for custom risk rules              |
| `fineTuningRoutes.ts` | Fine-tuning job management              |
| `rag/coreRoutes.ts`   | RAG search and ingestion                |
| `rag/costRoutes.ts`   | RAG cost tracking                       |
| `rag/driftRoutes.ts`  | RAG quality monitoring                  |
| `rag/healthRoutes.ts` | RAG health status                       |
| `rag/purgeRoutes.ts`  | RAG data governance                     |

### Services (`src/services/`)

| File                              | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `analysisService.ts`              | Orchestrate CI analysis                |
| `analysisChunkingPipeline.ts`     | Process logs through chunking pipeline |
| `analysisEvidence.ts`             | Gather evidence for analysis           |
| `analysisRAG.ts`                  | RAG-enhanced analysis                  |
| `feedbackStatsService.ts`         | Aggregate user feedback                |
| `finetuning/jobService.ts`        | Manage fine-tuning jobs                |
| `finetuning/modelService.ts`      | Model versioning and A/B testing       |
| `finetuning/datasetService.ts`    | Dataset extraction                     |
| `finetuning/evaluationService.ts` | Model evaluation                       |
| `finetuning/schedulerService.ts`  | Job scheduling                         |

### Workers (`src/workers/`)

| File                | Purpose                        |
| ------------------- | ------------------------------ |
| `analysisWorker.ts` | Background analysis processing |

### Types (`src/types/`)

| File                 | Purpose                    |
| -------------------- | -------------------------- |
| `apiTypes.ts`        | API request/response types |
| `fineTuningTypes.ts` | Fine-tuning types          |

---

## 🔧 services/github-app/ (Port 3002)

**Purpose**: GitHub App for webhook processing and PR comments.

### Entry Point

| File       | Purpose                                               |
| ---------- | ----------------------------------------------------- |
| `index.ts` | Express server, aggregator workers, graceful shutdown |

### Routes (`src/routes/`)

| File                | Purpose                 |
| ------------------- | ----------------------- |
| `webhookRoutes.ts`  | GitHub webhook receiver |
| `healthRoutes.ts`   | Health checks           |
| `apiRoutes.ts`      | Internal API endpoints  |
| `feedbackRoutes.ts` | Feedback collection     |
| `setupRoutes.ts`    | GitHub App setup flows  |

### Handlers (`src/handlers/`)

| File                        | Purpose                             |
| --------------------------- | ----------------------------------- |
| `checkRunHandler.ts`        | Handle check_run webhook events     |
| `checkRunAnalysis.ts`       | Analyze failed checks               |
| `checkRunSuccessHandler.ts` | Handle successful checks            |
| `pullRequestHandler.ts`     | Handle PR events                    |
| `installationHandler.ts`    | Handle GitHub App install/uninstall |
| `simplifiedAnalysis.ts`     | Direct analysis (no aggregation)    |
| `combinedAnalysis.ts`       | Combined multi-failure analysis     |

### Services (`src/services/`)

| File                                  | Purpose                    |
| ------------------------------------- | -------------------------- |
| `githubService.ts`                    | GitHub API client          |
| `githubComments.ts`                   | Post PR comments           |
| `githubAnalysis.ts`                   | Trigger analysis via API   |
| `workflowService.ts`                  | Workflow metadata handling |
| `context/annotationFetcher.ts`        | Fetch check annotations    |
| `context/workflowFetcher.ts`          | Fetch workflow info        |
| `formatters/prCommentFormatter.ts`    | Format PR comments         |
| `formatters/slackPayloadFormatter.ts` | Format Slack notifications |
| `aggregation/consolidatedPoster.ts`   | Post consolidated analyses |

### Middleware (`src/middleware/`)

| File              | Purpose                          |
| ----------------- | -------------------------------- |
| `verifyGithub.ts` | Verify GitHub webhook signatures |

---

## 🔧 services/slack-bot/ (Port 3001)

**Purpose**: Slack integration using Bolt framework.

### Entry Point

| File       | Purpose                                  |
| ---------- | ---------------------------------------- |
| `index.ts` | Slack Bolt app, Socket Mode, HTTP server |

### Routes (`src/routes/`)

| File             | Purpose                             |
| ---------------- | ----------------------------------- |
| `httpRoutes.ts`  | HTTP endpoints for CI notifications |
| `oauthRoutes.ts` | OAuth for multi-tenant installation |

### Handlers (`src/handlers/`)

| File                          | Purpose                           |
| ----------------------------- | --------------------------------- |
| `slackEventSetup.ts`          | Register all Slack event handlers |
| `commandHandler.ts`           | Handle /kenchi slash commands     |
| `commandSubhandlers.ts`       | Command implementations           |
| `actionHandler.ts`            | Handle button clicks              |
| `mentionHandler.ts`           | Handle @kenchi mentions           |
| `messageHandler.ts`           | Handle DMs and messages           |
| `appHomeHandler.ts`           | Handle App Home tab               |
| `feedbackHandler.ts`          | Collect thumbs up/down feedback   |
| `documentIngestionHandler.ts` | Ingest docs from file shares      |
| `documentModalBuilder.ts`     | Build document upload modals      |
| `modalBuilders.ts`            | Build interactive modals          |
| `repoSelectHandler.ts`        | Repository selection flow         |
| `channelHandler.ts`           | Channel management                |
| `documentFileProcessor.ts`    | Process uploaded files            |

### Services (`src/services/`)

| File                      | Purpose                          |
| ------------------------- | -------------------------------- |
| `notificationHandler.ts`  | Process CI failure notifications |
| `analysisService.ts`      | Request analysis from API        |
| `qaService.ts`            | Q&A with knowledge base          |
| `channelService.ts`       | Channel configuration            |
| `messageService.ts`       | Message formatting and sending   |
| `messageStore.ts`         | Persist message metadata         |
| `resolutionService.ts`    | Track resolution confirmations   |
| `tenantSlackClient.ts`    | Multi-tenant Slack client        |
| `analysisContextStore.ts` | Store analysis context           |

### Formatters (`src/formatters/`)

| File                    | Purpose                    |
| ----------------------- | -------------------------- |
| `ciFailureFormatter.ts` | Format CI failure messages |
| `ciFailureBlocks.ts`    | Slack Block Kit builders   |
| `appHomeFormatter.ts`   | App Home UI                |
| `appHomeSections.ts`    | App Home section builders  |
| `qaFormatter.ts`        | Q&A response formatting    |

### Middleware (`src/middleware/`)

| File             | Purpose                         |
| ---------------- | ------------------------------- |
| `verifySlack.ts` | Verify Slack request signatures |

---

## 🎨 services/frontend/ (Port 3003)

**Purpose**: Web dashboard (CodeAnt.ai-style).

### Structure

| Folder                    | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `src/components/ui/`      | Reusable UI components (Button, Card, Badge, etc.)  |
| `src/components/landing/` | Landing page sections (Hero, Features, Stats, etc.) |
| `src/components/layout/`  | Dashboard layout (Sidebar, Navbar)                  |
| `src/pages/`              | Page components                                     |
| `src/pages/dashboard/`    | Dashboard pages (Home, NewAnalysis, etc.)           |
| `src/utils/`              | API clients and helpers                             |
| `src/types/`              | TypeScript types                                    |

### Key Files

| File                                  | Purpose                    |
| ------------------------------------- | -------------------------- |
| `App.tsx`                             | React Router configuration |
| `pages/LandingPage.tsx`               | CodeAnt-style landing page |
| `pages/dashboard/DashboardHome.tsx`   | Dashboard overview         |
| `pages/dashboard/NewAnalysis.tsx`     | Submit CI analysis         |
| `pages/dashboard/JobHistory.tsx`      | View analysis jobs         |
| `pages/dashboard/AnalysisResult.tsx`  | View detailed results      |
| `pages/dashboard/KnowledgeSearch.tsx` | RAG search UI              |
| `pages/dashboard/RiskRules.tsx`       | Manage risk rules          |
| `pages/dashboard/SystemHealth.tsx`    | Health monitoring          |
| `utils/api.ts`                        | API client functions       |

---

## 🗄️ database/

**Purpose**: SQL migrations and initialization.

| File                                                                                                     | Purpose                               |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `init/`                                                                                                  | Initialization scripts for PostgreSQL |
| Migrations create tables for: tenants, analyses, knowledge_docs, diff_chunks, risk_rules, feedback, etc. |

---

## 📚 docs/

**Purpose**: Documentation.

| File                       | Purpose              |
| -------------------------- | -------------------- |
| `ARCHITECTURE.md`          | System architecture  |
| `RAG_SYSTEM.md`            | RAG documentation    |
| `CONFIDENCE_SCORING.md`    | Confidence algorithm |
| `USER_EXPERIENCE_FLOWS.md` | Slack/GitHub UX      |
| `DATA_MODELS.md`           | Data schemas         |
| `ROADMAP.md`               | Feature roadmap      |

---

## Data Flow Summary

```
1. CI Fails (GitHub Actions)
   ↓
2. GitHub App receives webhook
   ↓
3. Gathers context (logs, annotations, PR info)
   ↓
4. Aggregates related failures (Redis)
   ↓
5. Calls API Service for analysis
   ↓
6. API chunks logs → extracts artifacts → calls OpenAI
   ↓
7. Confidence scoring + risk assessment
   ↓
8. Results sent to Slack Bot
   ↓
9. Slack Bot posts rich message with approval buttons
   ↓
10. User approves → Action queue processes
```

## Key Design Principles

1. **Zero Duplication**: All shared code in `@kenchi/shared`
2. **Safety First**: LLM suggestions only, deterministic validation
3. **Multi-Tenant**: Single deployment serves multiple orgs
4. **RAG-Enhanced**: Learns from historical fixes
5. **Confidence Scoring**: 6-factor algorithm, not LLM self-assessment
