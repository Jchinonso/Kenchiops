# System Architecture: AI-Driven DevOps Incident Assistant

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [Component Responsibility Table](#component-responsibility-table)
6. [Integration Points](#integration-points)

---

## Overview

The AI-Driven DevOps Incident Assistant (Kenchi) is designed to intelligently analyze DevOps incidents, failures, and alerts by combining deterministic workflows with LLM-powered analysis. The system follows a **"LLM as Untrusted Helper"** philosophy, where AI provides insights and recommendations that are validated and controlled by deterministic code before any actions are taken.

### Core Principles

- **Safety First**: No LLM outputs are executed directly without validation
- **Deterministic Control**: All critical decisions and actions are governed by deterministic code
- **Human-in-the-Loop**: High-impact actions require explicit human approval
- **Context-Aware**: LLM analysis is grounded in real evidence and knowledge base
- **Transparency**: All analysis includes confidence scores and reasoning traces

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          INGESTION LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   Webhooks   │  │   GitHub webhook        │  │  Monitoring  │  │   Manual    │ │
│  │  (GitHub,    │  │  Triggers    │  │   Alerts     │  │   Triggers  │ │
│  │   GitLab)    │  │              │  │  (Datadog)   │  │   (Slack)   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                  │                 │         │
│         └─────────────────┴──────────────────┴─────────────────┘         │
│                                  │                                        │
└──────────────────────────────────┼────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   PROCESSING & KNOWLEDGE LAYER                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Event Normalization                          │    │
│  │  • Parse incoming events                                        │    │
│  │  • Normalize to standard Event schema                           │    │
│  │  • Extract metadata and timestamps                              │    │
│  │  • Store in event log                                           │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Evidence Collection                          │    │
│  │  • Gather logs from relevant sources                            │    │
│  │  • Retrieve metrics (CPU, memory, error rates)                  │    │
│  │  • Pull git history and code changes                            │    │
│  │  • Aggregate into Evidence object                               │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Knowledge Base Retrieval (RAG)                     │    │
│  │                                                                 │    │
│  │  ┌──────────────────┐         ┌───────────────────────┐        │    │
│  │  │  Vector Database │◄────────│  Query: Event +       │        │    │
│  │  │  (pgvector/      │         │  Evidence embedding   │        │    │
│  │  │   Chroma)        │         └───────────────────────┘        │    │
│  │  │                  │                                           │    │
│  │  │  • Runbooks      │         ┌───────────────────────┐        │    │
│  │  │  • Past incidents│────────►│  Relevant Context:    │        │    │
│  │  │  • Documentation │         │  • Similar incidents  │        │    │
│  │  │  • Best practices│         │  • Runbook sections   │        │    │
│  │  └──────────────────┘         │  • Solutions          │        │    │
│  │                               └───────────────────────┘        │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      LLM ANALYSIS ENGINE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   Prompt Construction                           │    │
│  │  • System context (role, constraints, safety guidelines)        │    │
│  │  • Event details (formatted)                                    │    │
│  │  • Evidence data (logs, metrics)                                │    │
│  │  • Retrieved knowledge (runbooks, similar incidents)            │    │
│  │  • Task specification (analyze, suggest actions)                │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    LLM Processing                               │    │
│  │  • Send prompt to LLM (OpenAI/Claude)                           │    │
│  │  • Request structured output (JSON)                             │    │
│  │  • Include examples for consistency                             │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Response Parsing                               │    │
│  │  • Parse LLM output to LLMAnalysisResult                        │    │
│  │  • Extract summary, cause, recommendations                      │    │
│  │  • Validate JSON structure                                      │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 ACTION/RECOMMENDATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │               Confidence Scoring (Deterministic)                │    │
│  │  • Analyze LLM response for uncertainty markers                 │    │
│  │  • Check evidence alignment                                     │    │
│  │  • Evaluate completeness of analysis                            │    │
│  │  • Compute confidence score (0.0 - 1.0)                         │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  Action Proposal Generation                     │    │
│  │  • Convert LLM recommendations to ActionProposal objects        │    │
│  │  • Classify action types                                        │    │
│  │  • Assign confidence scores                                     │    │
│  │  • Set requiresApproval flag based on action type               │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
│                           ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │               Safety Validation & Filtering                     │    │
│  │  • Block dangerous actions (data deletion, force pushes)        │    │
│  │  • Require approval for high-impact actions                     │    │
│  │  • Auto-approve safe, low-impact actions                        │    │
│  │  • Generate approval requests for ambiguous cases               │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │                                              │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      USER INTERFACE LAYER                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────┐              ┌──────────────────────┐         │
│  │   Slack Bot          │              │   GitHub App         │         │
│  │                      │              │                      │         │
│  │  • Rich message      │              │  • PR comments       │         │
│  │    formatting        │              │  • Check run         │         │
│  │  • Interactive       │              │    annotations       │         │
│  │    buttons           │              │  • Status updates    │         │
│  │  • Approval          │              │  • Deployment        │         │
│  │    workflows         │              │    notifications     │         │
│  │  • Thread updates    │              │                      │         │
│  └──────────────────────┘              └──────────────────────┘         │
│                                                                           │
│  Message Content:                                                        │
│  • Event summary                                                         │
│  • LLM analysis (root cause, confidence)                                 │
│  • Recommended actions with approval buttons                            │
│  • Links to logs, metrics, related docs                                 │
│  • Execution status and results                                         │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Ingestion Layer

**Purpose**: Receive and route incoming events from various sources

**Sub-components**:

- **Webhook Receivers**: Accept HTTP webhooks from GitHub, GitLab, CI/CD systems
- **Workflow Triggers**: Orchestrated workflows that combine multiple event sources
- **Monitoring Alert Integrations**: Datadog, Prometheus, Grafana alert webhooks
- **Manual Triggers**: Slack slash commands or API endpoints for manual incident creation

**Key Functions**:

- Validate webhook signatures for security
- Parse diverse event formats
- Route events to appropriate processing handlers
- Rate limiting and deduplication
- Initial event logging

**Technology**: Express.js webhooks, workflow automation, Slack Bolt framework

---

### 2. Processing & Knowledge Layer

**Purpose**: Normalize events, collect evidence, and retrieve relevant knowledge

#### 2.1 Event Normalization

- Parse incoming payloads into standardized `Event` objects
- Extract key metadata (timestamp, source, type, severity)
- Assign unique event IDs
- Store in event log/database

#### 2.2 Evidence Collection

**Deterministic process** that gathers contextual information:

- **Logs**: Query log aggregation systems (ELK, Splunk, CloudWatch)
- **Metrics**: Retrieve time-series data around event timestamp
- **Git History**: Fetch recent commits, PRs, and changes
- **System State**: Capture deployment status, service health
- **Related Events**: Find correlated events in time window

**Output**: Structured `Evidence` object with all gathered data

#### 2.3 Knowledge Base Retrieval (RAG)

**Vector Database Operations** (Deterministic):

1. **Embedding Generation**: Convert Event + Evidence to vector embedding
2. **Similarity Search**: Query vector database for relevant documents
3. **Knowledge Types Stored**:
   - Runbooks and playbooks
   - Past incident reports with resolutions
   - Architecture documentation
   - Best practices and procedures
   - Team knowledge artifacts

4. **Retrieval Strategy**:
   - Top-K similar incidents (K=5-10)
   - Relevant runbook sections
   - Related documentation pages
   - Filter by relevance score threshold

**Technology**: PostgreSQL + pgvector, or Chroma/Pinecone, OpenAI embeddings API

---

### 3. LLM Analysis Engine

**Purpose**: Leverage AI to analyze events and evidence, generating insights and recommendations

#### 3.1 Prompt Construction (Deterministic)

- Assemble system context with role definition and constraints
- Format event details in structured, readable format
- Include evidence data (logs, metrics) with appropriate truncation
- Inject retrieved knowledge from vector DB
- Add task-specific instructions
- Request structured JSON output

#### 3.2 LLM Processing

- Send constructed prompt to LLM API (OpenAI GPT-4, Claude)
- Handle API errors and retries
- Enforce token limits and timeouts
- Parse response into structured format

#### 3.3 Output Processing (Deterministic)

- Validate JSON structure of LLM response
- Extract key fields: summary, identified cause, recommended actions
- Handle malformed or incomplete responses
- Log LLM interaction for audit trail

**Key Constraint**: The LLM only analyzes and suggests - it **never executes actions directly**

---

### 4. Action/Recommendation Layer

**Purpose**: Validate LLM analysis, score confidence, and prepare actionable recommendations

#### 4.1 Confidence Scoring (Deterministic)

- Apply heuristics to LLM output
- Detect uncertainty markers ("maybe", "possibly", "unclear")
- Check evidence alignment
- Evaluate completeness of analysis
- Generate confidence score (0.0 to 1.0)
- See [CONFIDENCE_SCORING.md](./CONFIDENCE_SCORING.md) for details

#### 4.2 Action Proposal Generation (Deterministic)

- Parse LLM recommendations into structured `ActionProposal` objects
- Classify action types (rollback, notification, diagnostic, etc.)
- Assign confidence scores to each action
- Determine approval requirements based on action type and confidence

#### 4.3 Safety Validation (Deterministic)

**Critical Safety Layer** - blocks or flags dangerous actions:

- **Blocked Actions**: Data deletion, forced deployments, production data access
- **Requires Approval**: Rollbacks, configuration changes, service restarts
- **Auto-approved**: Read-only actions, notifications, diagnostic commands

**Decision Logic**:

```
if action.type in DANGEROUS_ACTIONS:
    BLOCK
elif action.type in HIGH_IMPACT_ACTIONS or confidence < 0.7:
    REQUIRE_APPROVAL
elif confidence >= 0.8 and action.type in SAFE_ACTIONS:
    AUTO_APPROVE
else:
    REQUIRE_APPROVAL
```

---

### 5. User Interface Layer

**Purpose**: Present analysis and recommendations to users, collect approvals, show execution status

#### 5.1 Slack Bot Interface

**Message Format**:

```
🚨 **CI/CD Failure Detected**
Pipeline: main-build #1234
Time: 2025-12-17 10:30 UTC

📊 **Analysis** (Confidence: 85%)
Root Cause: Test failure in authentication module due to missing
environment variable `AUTH_SECRET` in CI environment.

🔍 **Evidence**:
- Error: "AUTH_SECRET is not defined" in auth.test.ts:45
- Recent commit: abc123 added new auth flow
- Similar incident: #456 (resolved by adding env var)

💡 **Recommended Actions**:
1. ✅ Add AUTH_SECRET to GitHub Actions secrets [Approve] [Reject]
2. ✅ Re-run failed pipeline [Approve] [Reject]
3. 📢 Notify @dev-team in #incidents

[View Full Logs] [View Related Docs] [Mark as False Positive]
```

**Interactive Elements**:

- Approval/Reject buttons for each action
- Status updates in thread as actions execute
- Links to external resources
- Feedback collection (was this helpful?)

#### 5.2 GitHub App Interface

**Use Cases**:

- Comment on PRs with analysis of CI failures
- Annotate check runs with failure details
- Post commit comments for deployment issues
- Update issue descriptions with incident analysis

**Comment Format**:

```markdown
## 🤖 AI Analysis: CI Failure

**Root Cause**: Missing environment variable in test environment

**Confidence**: 85%

**Evidence**:

- Error in `auth.test.ts:45`: AUTH_SECRET not defined
- Introduced in commit abc123

**Recommended Fix**:

1. Add `AUTH_SECRET` to repository secrets
2. Update workflow file to include secret

**Related**:

- Similar issue: #456
- Documentation: [Auth Setup Guide](...)
```

---

## Data Flow

### End-to-End Flow: CI/CD Failure Event

#### Phase 1: Ingestion (0-2 seconds)

1. **GitHub Actions** sends webhook to GitHub webhook workflow trigger
2. **GitHub webhook** receives webhook, validates signature
3. **GitHub webhook** forwards to API service `/webhook/github` endpoint
4. **API service** validates payload, creates unique event ID
5. **API service** normalizes to `Event` schema:

```json
{
  "id": "evt_123abc",
  "type": "CICD_FAILURE",
  "source": "GitHubActions",
  "timestamp": "2025-12-17T10:30:00Z",
  "payload": {
    "repository": "company/app",
    "workflow": "main-build",
    "runId": "1234",
    "conclusion": "failure",
    "errorLog": "..."
  }
}
```

#### Phase 2: Evidence Collection (2-10 seconds)

6. **API service** triggers evidence collection pipeline
7. **Parallel evidence gathering**:
   - Query GitHub API for workflow logs → extract error messages
   - Fetch recent commits from repository → identify changes since last success
   - Query metrics API for system health → check CPU, memory, error rates
   - Check deployment status → current production version
8. **Aggregate into `Evidence` object**:

```json
{
  "eventId": "evt_123abc",
  "logs": [
    "ERROR: AUTH_SECRET is not defined at auth.test.ts:45",
    "Test suite failed: 1 failed, 24 passed"
  ],
  "metrics": {
    "errorRate": 0.02,
    "cpuUsage": 45,
    "memoryUsage": 60
  },
  "gitHistory": [
    {
      "sha": "abc123",
      "message": "Add new authentication flow",
      "author": "dev@company.com",
      "timestamp": "2025-12-17T09:00:00Z"
    }
  ],
  "relatedDocs": []
}
```

#### Phase 3: Knowledge Retrieval (10-15 seconds)

9. **Generate embedding** for Event + Evidence summary using OpenAI embeddings API
10. **Query vector database** with embedding
11. **Retrieve top 5 similar incidents**:
    - Incident #456: "CI failure due to missing env var" (similarity: 0.89)
    - Runbook: "Debugging CI/CD Failures" (similarity: 0.82)
12. **Add retrieved docs to Evidence**:

```json
{
  "relatedDocs": [
    {
      "id": "incident_456",
      "type": "past_incident",
      "title": "CI failure due to missing env var",
      "resolution": "Added SECRET to GitHub Actions secrets",
      "similarity": 0.89
    },
    {
      "id": "runbook_cicd",
      "type": "runbook",
      "title": "Debugging CI/CD Failures",
      "excerpt": "Check environment variables...",
      "similarity": 0.82
    }
  ]
}
```

#### Phase 4: LLM Analysis (15-25 seconds)

13. **Construct prompt** (see [PROMPT_TEMPLATES.md](./PROMPT_TEMPLATES.md))
    - System context: role, safety constraints
    - Event details: formatted event payload
    - Evidence: logs, metrics, git history
    - Knowledge: similar incidents, runbooks
    - Task: "Analyze and suggest safe actions"

14. **Send to LLM API** (OpenAI GPT-4)
15. **Receive structured response**:

```json
{
  "summary": "CI pipeline failed due to missing environment variable AUTH_SECRET in test environment",
  "identifiedCause": "Recent commit abc123 introduced new authentication flow that requires AUTH_SECRET, but variable not set in CI environment",
  "confidence": "high",
  "recommendedActions": [
    {
      "actionType": "add_environment_variable",
      "description": "Add AUTH_SECRET to GitHub Actions repository secrets",
      "reasoning": "Similar incident #456 resolved by adding missing secret"
    },
    {
      "actionType": "rerun_pipeline",
      "description": "Re-run failed workflow after adding secret"
    }
  ],
  "uncertainties": []
}
```

#### Phase 5: Confidence Scoring & Action Proposals (25-27 seconds)

16. **Apply confidence scoring heuristic**:
    - LLM stated "high" confidence → base score 0.8
    - No uncertainty markers → +0.05
    - Strong evidence alignment (logs match cause) → +0.05
    - Similar past incident with resolution → +0.05
    - **Final confidence: 0.95**

17. **Generate `ActionProposal` objects**:

```json
[
  {
    "eventId": "evt_123abc",
    "actionType": "add_environment_variable",
    "description": "Add AUTH_SECRET to GitHub Actions repository secrets",
    "confidence": 0.95,
    "requiresApproval": true,
    "reasoning": "Similar incident #456 resolved by adding missing secret",
    "safetyLevel": "medium"
  },
  {
    "eventId": "evt_123abc",
    "actionType": "rerun_pipeline",
    "description": "Re-run failed workflow after adding secret",
    "confidence": 0.9,
    "requiresApproval": false,
    "safetyLevel": "low"
  }
]
```

18. **Safety validation**:
    - Check action types against blocklist → PASS
    - Action 1 (add_environment_variable) → REQUIRES_APPROVAL (medium impact)
    - Action 2 (rerun_pipeline) → AUTO_APPROVE_AFTER_ACTION_1 (low impact)

#### Phase 6: User Notification (27-30 seconds)

19. **Format Slack message** with analysis, actions, approval buttons
20. **Post to Slack** via Slack Bot service
21. **Post GitHub comment** on failed workflow run via GitHub App service
22. **Store interaction** in database for future learning

#### Phase 7: Human Approval & Execution (user-dependent)

23. **User clicks "Approve"** on Action 1 in Slack
24. **API service receives approval**
25. **Execute Action 1**:
    - Call GitHub API to add secret
    - Post status update in Slack thread: "✅ Added AUTH_SECRET to secrets"
26. **Auto-execute Action 2** (rerun pipeline):
    - Call GitHub API to re-run workflow
    - Post status update: "🔄 Re-running workflow #1234"
27. **Monitor execution**:
    - Watch for webhook from re-run
    - Update Slack thread with final status
    - Close incident if successful

**Total Time**: ~30 seconds for analysis + user approval time

---

## Component Responsibility Table

### LLM vs. Deterministic Code Responsibilities

| **Component/Function**                     | **Type**           | **Responsibility**                                  | **Notes**                        |
| ------------------------------------------ | ------------------ | --------------------------------------------------- | -------------------------------- |
| **INGESTION LAYER**                        |
| Webhook receipt & validation               | Deterministic      | Receive webhooks, validate signatures, parse JSON   | Express.js endpoints             |
| Event routing                              | Deterministic      | Route events to appropriate handlers                | workflow automation, API routing |
| Rate limiting                              | Deterministic      | Apply rate limits per source                        | Redis-based rate limiter         |
| Event deduplication                        | Deterministic      | Detect duplicate events                             | Hash-based or ID-based           |
| Initial event logging                      | Deterministic      | Log raw event to database                           | Structured logging               |
| **PROCESSING & KNOWLEDGE LAYER**           |
| Event normalization                        | Deterministic      | Parse diverse formats to standard `Event` schema    | Format converters                |
| Event validation                           | Deterministic      | Validate event structure, required fields           | JSON schema validation           |
| Evidence collection - Logs                 | Deterministic      | Query log systems, extract relevant logs            | API calls to ELK, Splunk         |
| Evidence collection - Metrics              | Deterministic      | Fetch time-series metrics                           | Prometheus, Datadog API          |
| Evidence collection - Git history          | Deterministic      | Retrieve commits, PRs, file changes                 | GitHub/GitLab API                |
| Evidence collection - System state         | Deterministic      | Get deployment status, service health               | Kubernetes API, Cloud APIs       |
| Evidence aggregation                       | Deterministic      | Combine collected data into `Evidence` object       | Data transformation              |
| Embedding generation                       | Deterministic      | Convert text to vector embedding                    | OpenAI Embeddings API call       |
| Vector database query                      | Deterministic      | Similarity search for relevant docs                 | pgvector SQL query               |
| Knowledge retrieval                        | Deterministic      | Fetch top-K similar documents                       | Vector DB operations             |
| Relevance filtering                        | Deterministic      | Filter results by similarity threshold              | Score comparison                 |
| **LLM ANALYSIS ENGINE**                    |
| Prompt construction                        | Deterministic      | Assemble system context, event, evidence, knowledge | Template-based formatting        |
| Prompt safety constraints                  | Deterministic      | Add safety guidelines, constraints to prompt        | Template injection               |
| LLM API call                               | **LLM**            | Send prompt, receive response                       | OpenAI/Claude API                |
| **Root cause analysis**                    | **LLM**            | **Analyze evidence to identify likely cause**       | **AI reasoning**                 |
| **Impact assessment**                      | **LLM**            | **Determine severity and scope**                    | **AI judgment**                  |
| **Next steps generation**                  | **LLM**            | **Suggest remedial actions**                        | **AI recommendations**           |
| **Explanation generation**                 | **LLM**            | **Provide human-readable summary**                  | **AI communication**             |
| Response parsing                           | Deterministic      | Parse JSON response, validate structure             | JSON parsing                     |
| Response validation                        | Deterministic      | Check for required fields, format                   | Schema validation                |
| Malformed response handling                | Deterministic      | Retry or fallback on bad response                   | Error handling                   |
| **ACTION/RECOMMENDATION LAYER**            |
| Confidence scoring - Base score            | Deterministic      | Calculate confidence from LLM signals               | Heuristic algorithm              |
| Confidence scoring - Uncertainty detection | Deterministic      | Detect hedging language, "maybe", etc.              | Regex/NLP patterns               |
| Confidence scoring - Evidence alignment    | Deterministic      | Check if LLM cause matches evidence                 | Keyword matching                 |
| Confidence scoring - Completeness check    | Deterministic      | Verify all fields present, detailed                 | Field validation                 |
| Final confidence calculation               | Deterministic      | Combine factors into 0-1 score                      | Weighted sum                     |
| Action proposal parsing                    | Deterministic      | Convert LLM recommendations to `ActionProposal`     | Data transformation              |
| Action type classification                 | Deterministic      | Categorize actions (rollback, notify, etc.)         | Rule-based classification        |
| Action confidence assignment               | Deterministic      | Assign confidence to each action                    | Inherit from analysis            |
| Safety validation - Blocklist check        | Deterministic      | Block dangerous actions                             | Deny list matching               |
| Safety validation - Approval rules         | Deterministic      | Determine if approval required                      | Rule engine                      |
| Safety validation - Risk assessment        | Deterministic      | Evaluate action impact level                        | Risk matrix                      |
| Action filtering                           | Deterministic      | Remove blocked actions, flag for approval           | Filter pipeline                  |
| Approval requirement flagging              | Deterministic      | Set `requiresApproval` based on rules               | Boolean logic                    |
| **USER INTERFACE LAYER**                   |
| Message formatting - Slack                 | Deterministic      | Format rich Slack message with buttons              | Slack Block Kit                  |
| Message formatting - GitHub                | Deterministic      | Format Markdown comment                             | Template rendering               |
| Interactive button creation                | Deterministic      | Create approval/reject buttons                      | Slack interactive components     |
| Message posting - Slack                    | Deterministic      | Send message via Slack API                          | Slack Web API call               |
| Comment posting - GitHub                   | Deterministic      | Post comment via GitHub API                         | Octokit API call                 |
| User interaction handling                  | Deterministic      | Process button clicks, collect approvals            | Slack event handlers             |
| Thread updates                             | Deterministic      | Post execution status in Slack thread               | Slack API calls                  |
| Link generation                            | Deterministic      | Create links to logs, metrics, docs                 | URL construction                 |
| **ACTION EXECUTION**                       |
| Approval collection                        | Deterministic      | Wait for user approval, enforce timeout             | State machine                    |
| Action execution logic                     | Deterministic      | Call APIs, run scripts to execute actions           | API clients, shell commands      |
| Execution monitoring                       | Deterministic      | Watch for action completion, handle errors          | Polling, webhooks                |
| Status updates                             | Deterministic      | Post real-time updates to user interfaces           | Slack/GitHub API calls           |
| Rollback on failure                        | Deterministic      | Revert actions if execution fails                   | Transaction-like logic           |
| Audit logging                              | Deterministic      | Log all actions, approvals, results                 | Database writes                  |
| **LEARNING & FEEDBACK**                    |
| Feedback collection                        | Deterministic      | Capture user feedback (helpful/not helpful)         | Slack buttons, API               |
| Incident storage                           | Deterministic      | Save incident + resolution to knowledge base        | Database writes                  |
| Embedding generation for new incidents     | Deterministic      | Create vector embeddings for retrieval              | OpenAI Embeddings API            |
| Vector DB update                           | Deterministic      | Store new incident embeddings                       | pgvector insert                  |
| **Analytics evaluation**                   | **LLM** (optional) | **Periodic analysis of system performance**         | **AI insights**                  |

### Summary Statistics

- **Deterministic Components**: 50+ functions
- **LLM-Powered Components**: 4 core functions (root cause analysis, impact assessment, next steps generation, explanation generation)
- **Hybrid Components**: 1 (analytics, optional)

### Key Insight

**The LLM is responsible for ONLY ~7% of system functions** (4 out of ~55). Its role is narrow and well-defined:

1. Analyze the situation
2. Assess impact
3. Suggest actions
4. Explain findings

All other functions—including all safety checks, action execution, and user interactions—are deterministic and under full programmatic control.

---

## Integration Points

### External Systems

1. **GitHub/GitLab**: Webhooks, API for repos, PRs, commits, CI/CD status
2. **CI/CD Platforms**: Jenkins, GitHub Actions, GitLab CI webhooks and APIs
3. **Monitoring Tools**: Datadog, Prometheus, Grafana for alerts and metrics
4. **Log Aggregation**: ELK Stack, Splunk, CloudWatch for log retrieval
5. **Slack**: Bot API for messaging, interactive components
6. **OpenAI/Claude**: LLM APIs for analysis and embeddings
7. **Vector Database**: pgvector, Chroma, or Pinecone for knowledge retrieval

### Internal Service Communication

- **API Service** ↔ **Slack Bot**: HTTP endpoints for triggering messages
- **API Service** ↔ **GitHub App**: HTTP endpoints for comment posting
- **All Services** → **Shared Package**: Common utilities, logging, OpenAI client
- **GitHub webhook** → **All Services**: HTTP requests for workflow orchestration

### Data Persistence

- **Event Log**: PostgreSQL table for all incoming events
- **Evidence Store**: JSON storage for collected evidence per event
- **Incident History**: Table linking events to resolutions and outcomes
- **Vector Database**: Embeddings of incidents, runbooks, documentation
- **Approval Logs**: Audit trail of all user approvals and rejections

---

## Scalability Considerations

### Horizontal Scaling

- All services are stateless and can be replicated
- Load balancer distributes webhook traffic
- Shared database with connection pooling
- Message queue (future) for asynchronous processing

### Performance Optimizations

- Cache frequently accessed knowledge base documents
- Batch embedding generation for efficiency
- Parallel evidence collection from multiple sources
- Timeout limits on LLM calls to prevent blocking

### Rate Limiting & Quotas

- Per-source rate limiting on webhooks
- LLM API quota management and fallback strategies
- Throttling of non-critical evidence collection

---

## Security Considerations

### Authentication & Authorization

- Webhook signature verification (GitHub, Slack)
- API key authentication for service-to-service calls
- OAuth for user actions in Slack/GitHub
- Role-based access control for action approvals

### Data Protection

- Encrypt sensitive data at rest (secrets, keys)
- Redact credentials from logs and evidence
- Limit LLM context to non-sensitive information
- Audit trail for all actions and approvals

### LLM Safety

- Prompt injection protection (sanitize user input)
- Output validation (never execute raw LLM responses)
- Confidence thresholds for action gating
- Human-in-the-loop for high-impact actions

---

## Future Enhancements

1. **Multi-LLM Support**: Route to different LLMs based on task (GPT-4 for analysis, Claude for summarization)
2. **Active Learning**: Incorporate user feedback to improve confidence scoring
3. **Predictive Alerts**: Use ML to predict failures before they occur
4. **Custom Runbooks**: Allow teams to define their own runbooks in natural language
5. **Integration Marketplace**: Plugin system for adding new monitoring/CI/CD tools
6. **Advanced RAG**: Graph-based knowledge representation, multi-hop reasoning

---

**Document Version**: 1.0
**Last Updated**: 2025-12-17
**Related Documents**:

- [DATA_MODELS.md](./DATA_MODELS.md) - JSON schemas for all data objects
- [CONFIDENCE_SCORING.md](./CONFIDENCE_SCORING.md) - Confidence scoring heuristic details
- [PROMPT_TEMPLATES.md](./PROMPT_TEMPLATES.md) - LLM prompt engineering templates
