# AI-Powered DevOps Co-Pilot: Implementation Blueprint

## Executive Summary

This blueprint maps the vision outlined in the AI-Powered DevOps Co-Pilot concept document to the current Kenchi implementation, identifying what has been accomplished, what remains to be built, and the roadmap for achieving full capability.

**Key Design Principles**:

- **Data Minimization**: Only send what's necessary to the LLM
- **Security First**: Never send secrets, tokens, or sensitive data to AI
- **Two-Stage Pipeline**: Deterministic filtering before LLM reasoning
- **Confidence Scoring**: 6-factor analysis validation with action gating
- **Multi-Tenant**: Full isolation via tenant-aware database schemas
- **Native Services**: Pure TypeScript microservices (no external workflow engines)

---

## Table of Contents

1. [Vision vs. Implementation Status](#vision-vs-implementation-status)
2. [What Has Been Accomplished](#what-has-been-accomplished)
3. [Architecture Overview](#architecture-overview)
4. [Security & Data Minimization](#security--data-minimization)
5. [Confidence Scoring Model](#confidence-scoring-model)
6. [Multi-Tenant Architecture](#multi-tenant-architecture)
7. [Feature Roadmap](#feature-roadmap)
8. [Technical Implementation Plan](#technical-implementation-plan)
9. [Investment in Infrastructure](#investment-in-infrastructure)

---

## Vision vs. Implementation Status

### The Six Key Features from Concept Document

| Feature                                    | Concept Goal                                                 | Current Status                                   | Completion |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------ | ---------- |
| **1. Smart CI/CD Failure Assistant**       | Analyze CI failures, explain in plain English, suggest fixes | **IMPLEMENTED** - Full pipeline working          | 90%        |
| **2. Infrastructure-as-Code Copilot**      | Explain IaC, suggest improvements, generate configs          | **NOT STARTED**                                  | 0%         |
| **3. Deployment Risk Analyzer**            | Predict deployment risk, gate deployments                    | **NOT STARTED**                                  | 0%         |
| **4. Incident Triage & Auto-Remediation**  | 24/7 SRE assistant with auto-remediation                     | **PARTIAL** - Analysis only, no auto-remediation | 25%        |
| **5. Configuration Drift Detection**       | Compare live vs. Git, detect drift                           | **NOT STARTED**                                  | 0%         |
| **6. Documentation & Knowledge Assistant** | Smart knowledge base Q&A                                     | **PARTIAL** - Vector store schema ready          | 20%        |

---

## What Has Been Accomplished

### Core Infrastructure (Fully Implemented)

#### 1. Monorepo Architecture

```
kenchi/
├── packages/shared/          # Comprehensive shared utilities
│   └── src/
│       ├── security/         # Secret redaction (47 patterns)
│       ├── safety/           # 6-factor confidence scoring
│       ├── openaiClient/     # LLM integration
│       ├── prompts.ts        # Prompt engineering
│       ├── tenantService.ts  # Multi-tenant management
│       └── repositoryChannelService.ts  # Repo-channel mapping
├── services/
│   ├── api/                  # OpenAI analysis endpoint
│   ├── slack-bot/            # Slack integration (Bolt)
│   └── github-app/           # GitHub webhooks + aggregation
├── database/
│   └── init/                 # PostgreSQL migrations
│       ├── 001_schema.sql    # Core tables
│       ├── 002_tenants.sql   # Multi-tenant support
│       └── 003_repository_channel_mappings.sql
└── docs/                     # Documentation
```

#### 2. Shared Package (`@kenchi/shared`) - Complete

| Module                 | Status      | Description                                                         |
| ---------------------- | ----------- | ------------------------------------------------------------------- |
| **Security**           | ✅ Complete | 47 secret patterns, 15 forbidden fields, recursive object redaction |
| **Safety**             | ✅ Complete | 6-factor confidence scoring, action gating, uncertainty detection   |
| **OpenAI Client**      | ✅ Complete | Token budget, retry logic, response parsing                         |
| **Prompts**            | ✅ Complete | System prompts, evidence formatting, token estimation               |
| **Tenant Service**     | ✅ Complete | Multi-tenant CRUD, audit logging, credential management             |
| **Repository Mapping** | ✅ Complete | Repo-to-channel routing, mapping CRUD                               |
| **Types**              | ✅ Complete | Events, Evidence, Analysis, Actions, Multi-tenant types             |
| **Constants**          | ✅ Complete | 816 lines of configuration constants                                |
| **Config**             | ✅ Complete | Environment-based configuration with validation                     |
| **Logging**            | ✅ Complete | Structured JSON logging with service scoping                        |
| **Errors**             | ✅ Complete | Custom error classes with automatic redaction                       |
| **Middleware**         | ✅ Complete | Express error handling, async handlers, request logging             |

#### 3. Services Implementation

**API Service (`services/api/`)**

- `POST /api/analyze` - CI failure analysis endpoint
- Validates input, creates Event/Evidence context
- Calls OpenAI for analysis with anti-hallucination prompts
- Calculates 6-factor confidence score
- Returns analysis with confidence and gating decision

**Slack Bot Service (`services/slack-bot/`)**

- Socket Mode connection (no public URL needed)
- `/kenchi configure` - Repository selection modal
- `/kenchi unconfigure` - Remove repository mapping
- `/kenchi status` - Show current configuration
- `/kenchi help` - Available commands
- App Home tab with status and quick actions
- Message routing via repository-channel mappings
- Rich Block Kit formatting with emojis and colors

**GitHub App Service (`services/github-app/`)**

- Check run webhook handler with context enrichment
- Failure aggregation with debounce (15s default, 120s max)
- PR comment posting (with old comment cleanup)
- Check run annotation creation
- Slack notification via HTTP
- Installation lifecycle management
- Graceful shutdown with aggregator flush

#### 4. Database Schema (PostgreSQL)

| Table                         | Purpose                                 | Status          |
| ----------------------------- | --------------------------------------- | --------------- |
| `events`                      | Webhook event storage                   | ✅ Ready        |
| `analyses`                    | LLM analysis results                    | ✅ Ready        |
| `action_proposals`            | Proposed actions with approval tracking | ✅ Ready        |
| `flake_records`               | Test flakiness tracking                 | ✅ Ready        |
| `diff_chunks`                 | RAG vector storage (pgvector)           | ✅ Schema ready |
| `knowledge_documents`         | Runbooks, postmortems                   | ✅ Schema ready |
| `analysis_feedback`           | User feedback for model improvement     | ✅ Ready        |
| `tenants`                     | Multi-tenant registry                   | ✅ Ready        |
| `tenant_audit_log`            | Lifecycle audit trail                   | ✅ Ready        |
| `repository_channel_mappings` | Repo-to-channel routing                 | ✅ Ready        |

---

## Architecture Overview

### Current System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            KENCHI SYSTEM ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   GitHub Actions                                                             │
│       │                                                                      │
│       ▼                                                                      │
│   ┌───────────────────────────────────────────────────────────────┐        │
│   │                     github-app (Port 3002)                     │        │
│   │                                                                │        │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │        │
│   │  │   Webhook   │  │   Context   │  │     Aggregator      │   │        │
│   │  │   Handler   │→ │  Enrichment │→ │  (Debounce 15s)     │   │        │
│   │  │             │  │  + Redaction│  │                     │   │        │
│   │  └─────────────┘  └─────────────┘  └──────────┬──────────┘   │        │
│   │                                                │               │        │
│   └────────────────────────────────────────────────┼───────────────┘        │
│                                                    │                         │
│                          ┌─────────────────────────┼─────────────────────┐  │
│                          │                         │                     │  │
│                          ▼                         ▼                     ▼  │
│   ┌─────────────────────────┐  ┌─────────────────────────┐  ┌───────────┐ │
│   │    api (Port 3000)      │  │   slack-bot (Port 3001) │  │  GitHub   │ │
│   │                         │  │                         │  │    PR     │ │
│   │  • POST /api/analyze    │  │  • POST /slack/message  │  │  Comment  │ │
│   │  • OpenAI integration   │  │  • POST /slack/broadcast│  │           │ │
│   │  • Confidence scoring   │  │  • Socket Mode events   │  │  + Check  │ │
│   │  • 6-factor validation  │  │  • Block Kit messages   │  │  Annots   │ │
│   └────────────┬────────────┘  └────────────┬────────────┘  └───────────┘ │
│                │                            │                              │
│                └────────────────────────────┼──────────────────────────────┘
│                                             │
│                                             ▼
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                        PostgreSQL Database                           │  │
│   │                                                                      │  │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐ │  │
│   │  │ tenants │ │ events  │ │analyses │ │ flake   │ │ repo_channel  │ │  │
│   │  │         │ │         │ │         │ │ records │ │ mappings      │ │  │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────────────┘ │  │
│   │                                                                      │  │
│   │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐   │  │
│   │  │ diff_chunks     │ │ knowledge_docs  │ │ analysis_feedback   │   │  │
│   │  │ (pgvector)      │ │ (pgvector)      │ │                     │   │  │
│   │  └─────────────────┘ └─────────────────┘ └─────────────────────┘   │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow: CI Failure Analysis

```
1. GitHub Actions CI fails
       │
       ▼
2. GitHub sends check_run webhook to github-app
       │
       ▼
3. github-app enriches context:
   • Workflow logs (with secret redaction)
   • PR diff (if available)
   • Commit information
   • Check run annotations
       │
       ▼
4. Failure added to Aggregator (debounce 15s)
       │
       ▼ (after debounce or max wait)

5. Consolidated analysis:
   • Call API service for OpenAI analysis
   • Calculate 6-factor confidence score
   • Determine action gating
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
6a. Post PR Comment               6b. Send Slack Notification
    (with annotations)                 (to mapped channel)
```

---

## Security & Data Minimization

### Two-Stage Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    STAGE 1: DETERMINISTIC FILTERING                      │
│                         (No LLM - Pure Code Logic)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  GitHub Webhook                                                          │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Parse &    │───►│    Redact    │───►│   Extract    │              │
│  │   Validate   │    │   Secrets    │    │   Relevant   │              │
│  └──────────────┘    └──────────────┘    │   Context    │              │
│                                          └──────┬───────┘              │
│                                                 │                       │
└─────────────────────────────────────────────────┼───────────────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: LLM REASONING                            │
│                         (Bounded, Safe Input)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Only Receives:                                                          │
│  ✓ Specific failed step logs (trimmed, redacted)                        │
│  ✓ Small diff hunks around changed lines                                │
│  ✓ Minimal PR metadata (no sensitive fields)                            │
│  ✓ Check run annotations                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Secret Redaction Implementation (COMPLETE)

**Location:** `packages/shared/src/security/redaction.ts`

**47 Secret Pattern Types Detected:**

- AWS Access Keys and Secret Keys
- GitHub Tokens (PAT, OAuth, App, Server, Refresh)
- Slack Tokens (Bot, User, App)
- OpenAI/Anthropic API Keys
- JWT Tokens
- Private Keys (RSA, EC, OpenSSH)
- Database Connection Strings
- Generic API Keys and Passwords
- Stripe, SendGrid, Twilio Keys
- Bearer Tokens, Basic Auth

**15 Forbidden Fields (Always Redacted):**

```typescript
const FORBIDDEN_FIELDS = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "api_key",
  "access_token",
  "auth_token",
  "private_key",
  "secret_key",
  "encryption_key",
  "signing_key",
  "bearer",
  "authorization",
  "credential",
  "token",
] as const;
```

**API Functions:**

```typescript
// Redact secrets from text
redactSecrets(text: string, options?: RedactionOptions): string

// Redact with statistics (types and counts)
redactSecretsWithStats(text: string): RedactionResult

// Recursively redact object fields
redactObject<T>(obj: T, options?: RedactionOptions): T

// Check if field should be excluded
isForbiddenField(fieldName: string): boolean

// Test if text contains secrets (early exit)
containsSecrets(text: string): boolean

// List types of secrets found
detectSecretTypes(text: string): string[]

// Create custom redactor with additional patterns
createCustomRedactor(patterns: RegExp[]): (text: string) => string
```

**Performance Optimizations:**

- Pre-compiled regex patterns at module load
- Single-pass iteration using functional `.reduce()`
- Set-based lookups for forbidden fields (O(1))
- Recursive depth limit (10 levels) to prevent stack overflow

---

## Confidence Scoring Model

### 6-Factor Confidence Scoring (COMPLETE)

**Location:** `packages/shared/src/safety/`

The system validates AI outputs using a deterministic 6-factor scoring algorithm:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     6-FACTOR CONFIDENCE SCORING                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  LLM Analysis Response                                                   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  1. BASE SCORE (0.2 - 0.85)                                       │  │
│  │     From LLM's stated confidence level                            │  │
│  │     very_low=0.2, low=0.4, medium=0.6, high=0.75, very_high=0.85 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  2. UNCERTAINTY ADJUSTMENT (-0.3 to 0)                            │  │
│  │     Detects hedging phrases: "might", "possibly", "unclear"       │  │
│  │     More hedging = larger penalty                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  3. EVIDENCE ALIGNMENT (-0.15 to +0.2)                            │  │
│  │     Checks if analysis matches provided evidence                  │  │
│  │     References actual log lines? Mentions specific files?         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  4. COMPLETENESS (-0.15 to +0.1)                                  │  │
│  │     Assesses thoroughness of analysis                             │  │
│  │     Has cause, summary, actions? All sections filled?             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  5. KNOWLEDGE BASE VALIDATION (0 to +0.1)                         │  │
│  │     Validates against known patterns in knowledge base            │  │
│  │     Matches documented solutions? Similar past incidents?         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  6. CONSISTENCY CHECK (-0.1 to +0.05)                             │  │
│  │     Checks cause-action relevance                                 │  │
│  │     Do recommended actions address the identified cause?          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  FINAL SCORE = clamp(sum of all factors, 0.0, 1.0)                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      ACTION GATING                                │  │
│  │                                                                    │  │
│  │  Score >= 0.85  → "auto_approve" (safe/low_risk actions only)    │  │
│  │  0.7 ≤ Score < 0.85 → "require_approval"                         │  │
│  │  Score < 0.7 → "block"                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Confidence Thresholds

```typescript
const CONFIDENCE_THRESHOLDS = {
  VERY_LOW: 0.3,
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.85,
} as const;
```

### Action Gating

| Final Score | Gating Decision    | Allowed Actions         |
| ----------- | ------------------ | ----------------------- |
| >= 0.85     | `auto_approve`     | `safe`, `low_risk` only |
| 0.7 - 0.84  | `require_approval` | All (with approval)     |
| < 0.7       | `block`            | None                    |

### Safety Levels

```typescript
type SafetyLevel = "safe" | "low_risk" | "medium_risk" | "high_risk" | "dangerous";

// Auto-approvable: safe, low_risk
// Requires approval: medium_risk, high_risk
// Always blocked: dangerous
```

---

## Multi-Tenant Architecture

### Tenant Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                      TENANT LIFECYCLE FLOW                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   GitHub App Install                   Slack App Install             │
│        │                                     │                        │
│        ▼                                     ▼                        │
│   ┌─────────────┐                    ┌─────────────┐                 │
│   │  Create     │                    │  Create     │                 │
│   │  Tenant     │                    │  Tenant     │                 │
│   │             │                    │             │                 │
│   │ Status:     │                    │ Status:     │                 │
│   │ pending_    │                    │ pending_    │                 │
│   │ slack       │                    │ github      │                 │
│   └──────┬──────┘                    └──────┬──────┘                 │
│          │                                  │                         │
│          │    ┌──────────────────────┐     │                         │
│          └───►│    Link Accounts     │◄────┘                         │
│               │                      │                                │
│               │  Match by org name   │                                │
│               │  or explicit linking │                                │
│               └──────────┬───────────┘                                │
│                          │                                            │
│                          ▼                                            │
│               ┌──────────────────────┐                                │
│               │       ACTIVE         │                                │
│               │                      │                                │
│               │  Both apps connected │                                │
│               │  CI analysis enabled │                                │
│               └──────────┬───────────┘                                │
│                          │                                            │
│          ┌───────────────┼───────────────┐                           │
│          ▼               ▼               ▼                            │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐                     │
│   │  SUSPENDED │  │  DELETED   │  │  Continue  │                     │
│   │            │  │  (soft)    │  │   Active   │                     │
│   └────────────┘  └────────────┘  └────────────┘                     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Main tenant table
CREATE TABLE tenants (
    id VARCHAR(50) PRIMARY KEY,
    github_org VARCHAR(100),
    github_installation_id INTEGER UNIQUE,
    slack_workspace_id VARCHAR(50) UNIQUE,
    slack_team_name VARCHAR(200),
    slack_bot_token TEXT,  -- Encrypted at application level
    status tenant_status DEFAULT 'pending_slack',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repository to channel mapping
CREATE TABLE repository_channel_mappings (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
    repository VARCHAR(255) NOT NULL,      -- e.g., "org/repo"
    slack_channel_id VARCHAR(50) NOT NULL,
    slack_channel_name VARCHAR(100),
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, repository)  -- One channel per repo per tenant
);

-- Audit trail
CREATE TABLE tenant_audit_log (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) REFERENCES tenants(id),
    action tenant_audit_action NOT NULL,
    actor VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Repository-Channel Routing

When a CI failure occurs:

1. Look up tenant by GitHub installation ID
2. Query `repository_channel_mappings` for the repository
3. If mapping exists, send notification to that channel
4. If no mapping, skip notification (log warning only)

```typescript
// Lookup flow
const tenant = await findByGitHubInstallation(installationId);
const mapping = await findChannelForRepository(tenant.id, repository);

if (mapping) {
  await postToSlack(mapping.slackChannelId, analysis);
} else {
  logger.warn("No channel mapping for repository", { repository });
}
```

---

## Feature Roadmap

### Phase 1: Current State (90% Complete)

```
✅ CI failure webhook receipt
✅ Context enrichment (logs, diff, commit, annotations)
✅ Secret redaction (47 patterns)
✅ OpenAI analysis with anti-hallucination prompts
✅ 6-factor confidence scoring
✅ Action gating
✅ Failure aggregation/debounce
✅ PR comment posting (with old comment cleanup)
✅ Check run annotations
✅ Slack notifications (rich Block Kit formatting)
✅ Multi-tenant database
✅ Repository-channel mapping
✅ Slack slash commands (/kenchi configure, unconfigure, status, help)
✅ App Home tab
🔲 Flakiness detection & fingerprinting
🔲 Interactive approval buttons in Slack
🔲 User feedback collection
```

### Phase 2: Enhanced CI Analysis

```
🔲 Code fix suggestions (PR review with suggestion blocks)
🔲 Self-consistency checks (multiple LLM passes)
🔲 RAG pipeline for historical context
🔲 Learning from past incidents
🔲 Customer privacy toggles
```

### Phase 3: Incident Triage & Auto-Remediation

```
🔲 Datadog/Prometheus alert webhook receivers
🔲 Metrics correlation service
🔲 Service health monitoring integration
🔲 Runbook execution framework
🔲 Automatic rollback capability
🔲 On-call escalation integration
```

### Phase 4-6: Future Phases

- Deployment Risk Analyzer
- Infrastructure-as-Code Copilot
- Configuration Drift Detection

---

## Technical Implementation Plan

### Remaining Work for Phase 1 Completion

| Task                      | Effort | Priority |
| ------------------------- | ------ | -------- |
| Flakiness fingerprinting  | 2 days | High     |
| Interactive Slack buttons | 2 days | High     |
| Feedback collection UI    | 1 day  | Medium   |
| Customer privacy toggles  | 2 days | Medium   |

### Phase 2 Implementation Order

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PHASE 2 IMPLEMENTATION GRAPH                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   WEEK 1: Fingerprinting + Flakiness                                    │
│   ┌─────────────────┐                                                   │
│   │ Failure         │ ← Hash test name + error type + stack frames     │
│   │ Fingerprinting  │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   ┌────────▼────────┐                                                   │
│   │   Flakiness     │ ← Track pass-after-rerun rate                     │
│   │   Tracking      │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   WEEK 2: Code Fix Suggestions                                          │
│   ┌────────▼────────┐                                                   │
│   │ Source Context  │ ← Fetch source files for error lines             │
│   │ Collection      │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   ┌────────▼────────┐                                                   │
│   │ Code Fix Prompt │ ← Generate specific fixes                         │
│   │ + Validation    │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   WEEK 3: RAG Pipeline                                                  │
│   ┌────────▼────────┐                                                   │
│   │ Diff Chunking   │ ← Split diffs into embeddable chunks             │
│   │ + Embeddings    │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   ┌────────▼────────┐                                                   │
│   │ Vector Search   │ ← Find similar past failures                      │
│   │ Retrieval       │                                                   │
│   └─────────────────┘                                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Investment in Infrastructure

### Current Infrastructure

| Component                   | Technology               | Purpose                    |
| --------------------------- | ------------------------ | -------------------------- |
| **Database**                | PostgreSQL + pgvector    | Persistence, vector search |
| **API Service**             | Express.js + TypeScript  | Analysis endpoint          |
| **Slack Bot**               | Slack Bolt (Socket Mode) | User interactions          |
| **GitHub App**              | Express.js + TypeScript  | Webhook handling           |
| **Container Orchestration** | Docker Compose           | Local/staging deployment   |

### Third-Party Services

| Service        | Cost                     | Purpose                    |
| -------------- | ------------------------ | -------------------------- |
| **OpenAI API** | ~$50-200/month           | LLM analysis (gpt-4o-mini) |
| **Slack**      | Free (standard features) | User notifications         |
| **GitHub**     | Free (App registration)  | Webhook source             |
| **PostgreSQL** | Hosting cost             | Data persistence           |

### Development Effort Estimates

| Phase                      | Effort         | Team Size      |
| -------------------------- | -------------- | -------------- |
| Phase 1 Completion         | 1-2 weeks      | 1 developer    |
| Phase 2 (Code Fixes + RAG) | 3-4 weeks      | 1-2 developers |
| Phase 3 (Incident Triage)  | 4-6 weeks      | 1-2 developers |
| Phase 4+ (Future)          | 4-8 weeks each | 1-2 developers |

### Return on Investment

1. **Reduced MTTR**: 15 minutes saved per incident × 50 incidents/month = 12.5 hours saved
2. **Developer Productivity**: Automated analysis replaces 30-60 minutes of manual log reading
3. **Reduced Alert Fatigue**: Smart prioritization reduces noise by 60-80%
4. **Knowledge Retention**: Institutional knowledge captured in RAG system

---

## Conclusion

### Current State Summary

Kenchi has achieved **90% completion of Phase 1** with:

- Full CI failure analysis pipeline working end-to-end
- Secret redaction protecting sensitive data
- 6-factor confidence scoring validating AI outputs
- Multi-tenant architecture with repository-channel mapping
- Rich Slack and GitHub integrations

### Key Differentiators

| Capability             | Status      | Benefit                                |
| ---------------------- | ----------- | -------------------------------------- |
| **Secret Redaction**   | ✅ Complete | Never expose sensitive data to LLM     |
| **Confidence Scoring** | ✅ Complete | Deterministic validation of AI outputs |
| **Action Gating**      | ✅ Complete | Prevent dangerous automated actions    |
| **Multi-Tenant**       | ✅ Complete | SaaS-ready architecture                |
| **Aggregation**        | ✅ Complete | Consolidated analysis per commit       |

### Immediate Next Steps

1. **Flakiness Detection**: Reduce false positives from flaky tests
2. **Interactive Slack**: Add approval buttons for recommended actions
3. **Code Fix Suggestions**: Generate specific fixes with GitHub suggestion blocks
4. **RAG Pipeline**: Learn from historical incidents

This positions Kenchi as a **trustworthy AI DevOps co-pilot** that teams can rely on for production systems.

---

**Document Version**: 3.0
**Created**: 2025-12-20
**Updated**: 2025-12-24
**Related Documents**:

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - Detailed design
- [DATA_MODELS.md](./DATA_MODELS.md) - Data structures
- [CONFIDENCE_SCORING.md](./CONFIDENCE_SCORING.md) - Safety scoring
- [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md) - Multi-tenant design
