# Kenchi DevOps Intelligence Platform

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Platform Architecture](#platform-architecture)
3. [Feature Modules](#feature-modules)
   - [CI/CD Intelligence](#3a-cicd-intelligence-current--built)
   - [Incident Triage & Response](#3b-incident-triage--response)
   - [Infrastructure Intelligence](#3c-infrastructure-intelligence)
   - [Deployment Intelligence](#3d-deployment-intelligence)
   - [Security & Compliance](#3e-security--compliance)
   - [Engineering Analytics (DORA+)](#3f-engineering-analytics-dora)
4. [Integration Architecture](#integration-architecture)
5. [AI Analysis Pipeline](#ai-analysis-pipeline)
6. [Dashboard & UX](#dashboard--ux)
7. [Notification & Action Layer](#notification--action-layer)
8. [Data Model Overview](#data-model-overview)
9. [Roadmap & Phasing](#roadmap--phasing)
10. [Competitive Differentiation](#competitive-differentiation)

---

## Executive Summary

Kenchi is an **AI-powered DevOps Intelligence Platform** that sits at the center of the software delivery lifecycle. Rather than replacing existing DevOps tools, Kenchi connects to them all -- source control, CI/CD, monitoring, infrastructure, and incident management -- and uses LLM-based analysis pipelines to transform raw signals into actionable intelligence.

Engineering teams today drown in data from dozens of tools. A single failed deployment can produce signals across GitHub Actions, Prometheus alerts, PagerDuty pages, Terraform state drift, and Slack threads. No human can correlate all of these in real time. Kenchi does.

**Core thesis:** The most valuable layer in the DevOps toolchain is not another dashboard or alerting system. It is an AI-powered correlation engine that connects signals across tools, identifies root causes, and recommends concrete actions -- all with transparent confidence scoring and human-in-the-loop safety gates.

**What Kenchi provides:**

- **Ingest** signals from source control, CI/CD, monitoring, infrastructure, and incident management tools via webhooks and API polling
- **Normalize** diverse event formats into a common schema with correlation keys (commit SHA, PR number, deployment ID, service name)
- **Analyze** using a shared LLM pipeline: chunk raw data, extract structured artifacts, aggregate findings, and generate actionable recommendations
- **Act** by posting PR comments, sending Slack notifications, creating tickets, and suggesting auto-remediation steps -- all gated by deterministic confidence scoring and safety validation

**Design principles:**

- **LLM as Untrusted Helper** -- AI analyzes and suggests, deterministic code validates and executes
- **Multi-tenant by design** -- tenant isolation at every layer, per-org configuration
- **Adapter pattern everywhere** -- each integration is an adapter behind a port interface, so new tools plug in without changing business logic
- **Transparent confidence** -- every recommendation includes a 6-factor confidence score breakdown, not just a "trust me" label

---

## Platform Architecture

### High-Level System Diagram

```
                              EXTERNAL TOOLS
    ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ Source       │ │   CI/CD      │ │  Monitoring   │ │  Infra/IaC   │
    │ Control     │ │  Platforms   │ │  & Alerting   │ │  & Deploy    │
    │             │ │              │ │               │ │              │
    │ GitHub      │ │ GH Actions   │ │ Prometheus    │ │ Terraform    │
    │ GitLab      │ │ CircleCI     │ │ Datadog       │ │ Kubernetes   │
    │ Bitbucket   │ │ Jenkins      │ │ PagerDuty     │ │ ArgoCD       │
    │             │ │ GitLab CI    │ │ CloudWatch    │ │ Pulumi       │
    │             │ │ Azure Pipes  │ │ Sentry        │ │ CloudForm.   │
    └──────┬──────┘ └──────┬───────┘ └──────┬────────┘ └──────┬───────┘
           │               │                │                  │
           └───────────────┴────────┬───────┴──────────────────┘
                                    │
                            Webhooks / API Polling
                                    │
    ┌───────────────────────────────▼────────────────────────────────────┐
    │                     KENCHI PLATFORM                                │
    │                                                                    │
    │  ┌──────────────────────────────────────────────────────────────┐ │
    │  │                   INGESTION LAYER                            │ │
    │  │  Signature verification ► Idempotency check ► Normalization │ │
    │  │  Rate limiting ► Event routing ► Queue for processing       │ │
    │  └────────────────────────────┬─────────────────────────────────┘ │
    │                               │                                   │
    │  ┌────────────────────────────▼─────────────────────────────────┐ │
    │  │                  CORRELATION ENGINE                          │ │
    │  │  Match events by: commit SHA, PR #, deploy ID, service name │ │
    │  │  Time-window correlation ► Causal graph construction        │ │
    │  └────────────────────────────┬─────────────────────────────────┘ │
    │                               │                                   │
    │  ┌────────────────────────────▼─────────────────────────────────┐ │
    │  │                   AI ANALYSIS PIPELINE                      │ │
    │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │ │
    │  │  │  Chunk   │►│ Extract  │►│Aggregate │►│ Final Analyze │  │ │
    │  │  │ raw data │ │artifacts │ │& dedupe  │ │ (powerful LLM)│  │ │
    │  │  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │ │
    │  │  + RAG context (historical incidents, runbooks, fixes)      │ │
    │  └────────────────────────────┬─────────────────────────────────┘ │
    │                               │                                   │
    │  ┌────────────────────────────▼─────────────────────────────────┐ │
    │  │                  SAFETY & SCORING LAYER                     │ │
    │  │  6-factor confidence scoring ► Risk assessment              │ │
    │  │  Hallucination detection ► Prompt injection defense         │ │
    │  │  Action gating (auto-approve / require approval / block)    │ │
    │  └────────────────────────────┬─────────────────────────────────┘ │
    │                               │                                   │
    │  ┌────────────────────────────▼─────────────────────────────────┐ │
    │  │                   ACTION LAYER                               │ │
    │  │  PR comments ► Slack messages ► Jira/Linear tickets         │ │
    │  │  PagerDuty routing ► Auto-remediation suggestions           │ │
    │  │  Rollback commands ► Runbook execution (with approval)      │ │
    │  └──────────────────────────────────────────────────────────────┘ │
    │                                                                    │
    │  ┌──────────────────────────────────────────────────────────────┐ │
    │  │                  KNOWLEDGE BASE (RAG)                       │ │
    │  │  pgvector ► Past incidents ► Runbooks ► PR fix comments    │ │
    │  │  Slack resolutions ► Architecture docs ► Multi-hop graphs  │ │
    │  └──────────────────────────────────────────────────────────────┘ │
    │                                                                    │
    │  ┌──────────────────────────────────────────────────────────────┐ │
    │  │                  DATA LAYER                                  │ │
    │  │  PostgreSQL (events, analyses, tenants, users, incidents)   │ │
    │  │  Redis (queues, caches, aggregation, rate limiting)         │ │
    │  └──────────────────────────────────────────────────────────────┘ │
    └────────────────────────────────────────────────────────────────────┘
                                    │
                            Notifications & Actions
                                    │
    ┌───────────────────────────────▼────────────────────────────────────┐
    │                      OUTPUT CHANNELS                               │
    │                                                                    │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
    │  │  GitHub   │ │  Slack   │ │  Email   │ │PagerDuty │ │  Jira  │ │
    │  │  PR       │ │  Bot     │ │          │ │          │ │ Linear │ │
    │  │  Comments │ │  DMs     │ │          │ │          │ │        │ │
    │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
    │                                                                    │
    │  ┌──────────────────────────────────────────────────────────────┐ │
    │  │                  WEB DASHBOARD                               │ │
    │  │  Landing page ► Auth ► Dashboard ► Analysis ► Settings      │ │
    │  │  React + Vite + Tailwind + shadcn/ui                        │ │
    │  └──────────────────────────────────────────────────────────────┘ │
    └────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Ingest, Normalize, Analyze, Act

Every signal that enters Kenchi follows the same four-stage pipeline:

1. **Ingest** -- Receive the raw event via webhook or API poll. Verify the source signature (e.g., `x-hub-signature-256` for GitHub, `x-slack-signature` for Slack). Check idempotency to prevent duplicate processing. Rate-limit to prevent abuse.

2. **Normalize** -- Transform the source-specific payload into Kenchi's common `Event` schema. Extract correlation keys: commit SHA, PR number, deployment ID, service name, environment. Assign severity. Store in the event log.

3. **Analyze** -- Route the normalized event through the appropriate feature module's analysis pipeline. All modules share the same core pipeline (chunk, extract, aggregate) but use different prompt templates. Enrich with RAG context from historical incidents, runbooks, and past fixes. Compute a 6-factor confidence score deterministically.

4. **Act** -- Based on the analysis and confidence score, take one or more actions: post a PR comment, send a Slack notification, create a Jira ticket, suggest a rollback, or page the on-call engineer. High-impact actions require human approval. Low-risk actions (notifications, diagnostics) can auto-execute.

### Multi-Tenant Architecture

Kenchi is multi-tenant from the ground up:

- Every database row includes a `tenant_id` column
- `RequestContext` propagates `tenantId` through all layers (handler to service to adapter to repository)
- Tenant-specific configuration: custom risk rules, RAG knowledge base, notification preferences, LLM model overrides
- Tenant isolation at the query level -- repositories filter by `tenant_id` on every query
- Per-tenant cost tracking for LLM usage, embeddings, and storage

### Service Architecture

```
kenchi/
├── packages/shared/          # Shared library (ALL reusable code)
│   ├── core/                 # Config, logger, errors, types
│   ├── database/             # Repositories (tenant, analysis, user, etc.)
│   ├── llm/                  # Provider-agnostic LLM client
│   ├── formatting/           # Log preprocessing, chunking pipeline
│   ├── safety/               # Confidence scoring, risk assessment, gating
│   ├── rag/                  # Retrieval-Augmented Generation
│   ├── aggregation/          # Redis-based failure aggregation
│   ├── cache/                # Redis caching layer
│   ├── queue/                # Redis-based message queues
│   └── security/             # Secret redaction, JWT, encryption
│
├── services/
│   ├── api/                  # Central API service (port 3000)
│   │   ├── routes/           # HTTP handlers
│   │   ├── services/         # Business logic (analysis, RAG, fine-tuning)
│   │   ├── ports/            # Interface definitions
│   │   └── adapters/         # External integrations
│   │
│   ├── github-app/           # GitHub integration (port 3002)
│   │   ├── handlers/         # Webhook event handlers (check_run, PR, install)
│   │   ├── services/         # GitHub API client, comment formatting
│   │   └── middleware/       # Signature verification
│   │
│   ├── slack-bot/            # Slack integration (port 3001)
│   │   ├── handlers/         # Event handlers (commands, actions, mentions)
│   │   ├── services/         # Notification, analysis, Q&A
│   │   └── formatters/       # Block Kit message builders
│   │
│   └── frontend/             # Web dashboard (port 3003)
│       ├── pages/            # Route-level components
│       ├── sections/         # Landing page sections
│       └── components/       # Shared UI components (shadcn/ui base)
│
└── database/                 # SQL migrations
```

---

## Feature Modules

### 3a. CI/CD Intelligence (Current -- Built)

**Status:** Operational. This is Kenchi's first feature module and the foundation for all others.

**Sources:**

| CI/CD Platform  | Integration Method    | Status  |
| --------------- | --------------------- | ------- |
| GitHub Actions  | Webhook (`check_run`) | Built   |
| CircleCI        | Webhook adapter       | Planned |
| Jenkins         | Webhook adapter       | Planned |
| GitLab CI       | Webhook adapter       | Planned |
| Azure Pipelines | Webhook adapter       | Planned |

**Capabilities:**

- **Failure root cause analysis** -- When a CI check run fails, Kenchi fetches the full workflow logs, annotations, PR context, and recent commits. The chunking pipeline breaks large logs (sometimes 100K+ tokens) into manageable pieces, extracts structured artifacts from each chunk using a fast LLM (Claude 3.5 Haiku), aggregates and deduplicates the findings, then sends the consolidated evidence to a powerful LLM for final root cause analysis.

- **Pattern recognition** -- The RAG knowledge base stores every past analysis. When a new failure occurs, Kenchi searches for similar past incidents and includes their resolutions in the analysis context. Over time, this creates a per-team "institutional memory" of failure patterns and fixes.

- **Flaky test detection** -- By tracking test outcomes across runs, Kenchi identifies tests that intermittently fail without code changes. These are flagged separately from genuine regressions.

- **Test failure clustering** -- Instead of reporting 47 individual test failures, Kenchi groups them by root cause: "38 tests failed due to a database migration error in setup, 7 failed due to a mock server timeout, 2 are genuine assertion failures."

- **Multi-failure aggregation** -- When a PR triggers multiple CI checks (lint, unit tests, integration tests, build), Kenchi aggregates all failures into a single consolidated analysis posted as one PR comment, rather than spamming the developer with separate notifications.

- **Pipeline optimization suggestions** -- Based on historical run times and failure patterns, Kenchi can suggest caching strategies, parallelization opportunities, and unnecessary steps to remove.

**Example: End-to-end flow**

```
1. Developer pushes commit abc123 to PR #412 on company/backend-api
2. GitHub Actions runs 3 workflows: lint, test, build
3. "test" workflow fails after 4 minutes

4. GitHub sends check_run webhook to Kenchi's GitHub App service
5. Kenchi verifies the webhook signature (x-hub-signature-256)
6. Checks idempotency (delivery ID) to prevent duplicate processing

7. Kenchi fetches enriched context:
   - Workflow logs (12,000 lines)
   - Check run annotations (3 error annotations)
   - PR diff (which files changed)
   - Recent commits on the branch

8. Aggregation: waits 30s for other check runs to complete
   - lint passes, build fails too
   - Both failures aggregated into one analysis

9. Chunking pipeline processes the logs:
   - Preprocessing: strip ANSI codes, CI timestamps, progress indicators
   - Smart chunking: split into 5 chunks at natural boundaries
   - Extraction: Claude 3.5 Haiku extracts artifacts from each chunk (~2s each)
   - Aggregation: deduplicate, rank by priority, detect framework

10. Final analysis: powerful LLM receives:
    - Aggregated artifacts from all chunks
    - PR diff context
    - 3 similar past incidents from RAG
    - Test framework detection (Jest)

11. Result:
    Summary: "Integration tests fail because the new auth middleware
    reads from REDIS_URL, which is not set in the CI environment.
    The lint check also flags an unused import in auth.ts."

    Confidence: 0.92 (very high)
    Root cause: Missing REDIS_URL env var in GitHub Actions secrets
    Recommended fix: Add REDIS_URL to repository secrets

12. Kenchi posts a PR comment with the analysis and fix suggestions
13. Kenchi sends a Slack notification to the team's #ci-alerts channel
14. Developer adds the secret, re-runs CI -- passes
15. Kenchi ingests the fix pattern into the RAG knowledge base
```

**Current implementation highlights:**

- Chunking pipeline handles logs up to 100K+ tokens; logs under 30K tokens are processed as a single chunk for speed
- Extraction uses `anthropic/claude-3.5-haiku` via OpenRouter (~2s per chunk, 15 concurrent)
- Final analysis uses a configurable model (currently `moonshotai/kimi-k2.5`)
- 6-factor deterministic confidence scoring (not LLM self-assessment)
- Safety gating: auto-approve, require approval, or block actions based on risk
- Multi-language support: TypeScript, Python, Rust, Go, Java, and more

---

### 3b. Incident Triage & Response

**Status:** Planned with detailed implementation spec. See [INCIDENT_TRIAGE_IMPLEMENTATION.md](./INCIDENT_TRIAGE_IMPLEMENTATION.md).

**Sources:**

| Tool                    | Data Ingested                              | Trigger Mechanism |
| ----------------------- | ------------------------------------------ | ----------------- |
| Prometheus/AlertManager | Firing alerts, metric values, labels       | Webhook           |
| Grafana                 | Alert notifications, dashboard context     | Webhook           |
| Datadog                 | Monitor alerts, APM traces, log patterns   | Webhook           |
| PagerDuty               | Incident lifecycle events, on-call context | Webhook           |
| OpsGenie                | Alert events, schedule context             | Webhook           |
| CloudWatch              | Alarm state changes, log insights          | Webhook / API     |
| Sentry                  | Error events, issue state changes          | Webhook           |
| New Relic               | Alert conditions, NRQL query results       | Webhook           |

**Capabilities:**

- **Alert ingestion and normalization** -- Each monitoring tool sends alerts in a different format. Kenchi normalizes them into a common `IncidentEvent` schema with fields for severity, affected service, metric values, and alert fingerprint.

- **AI-powered alert correlation** -- When a Prometheus alert fires, Kenchi does not just forward it. It asks: "What changed recently?" and correlates the alert with recent deployments, config changes, PR merges, and other alerts in the same time window. The correlation engine uses commit SHAs, service names, and temporal proximity.

- **Auto-classify severity** -- Kenchi classifies incidents as P1/P2/P3 using a rule-based policy engine augmented by AI assessment of blast radius. A single pod OOMKilling is P3. All pods in a service OOMKilling is P1.

- **Runbook suggestion** -- The RAG knowledge base stores runbooks. When an incident matches a known pattern, Kenchi surfaces the relevant runbook sections and offers to execute steps with approval.

- **Blast radius identification** -- Kenchi maps service dependencies (from Kubernetes manifests, Terraform configs, or explicit service catalogs) to determine which teams and services are affected by an incident.

- **Incident timeline generation** -- Kenchi automatically builds a chronological timeline from correlated events: "14:32 -- PR #412 merged. 14:35 -- Deploy to production started. 14:38 -- Deploy completed. 14:41 -- Redis connection errors spike. 14:43 -- Prometheus alert fires."

- **Post-incident analysis** -- After an incident is resolved, Kenchi auto-drafts a blameless postmortem by aggregating the timeline, root cause analysis, affected services, and resolution steps.

**Example: Alert-to-resolution flow**

```
14:41 UTC  Prometheus fires: redis_connection_errors > 100/min
           for service: payment-api, environment: production

14:41 UTC  Kenchi receives the AlertManager webhook
           Normalizes to IncidentEvent (severity: high)

14:42 UTC  Correlation engine searches for recent changes:
           - PR #412 merged at 14:32 (changes redis.conf max-connections)
           - Deploy to production completed at 14:38
           - No other alerts in the last hour

14:42 UTC  RAG search finds: "Incident #287: Redis max-connections
           misconfiguration caused connection exhaustion. Fix: revert
           redis.conf and increase maxclients."

14:43 UTC  AI analysis generates:
           Summary: "Redis connection errors spiking after deploy.
           PR #412 changed redis.conf max-connections from 10000 to 100
           (likely a typo). This matches incident #287."

           Confidence: 0.94
           Blast radius: payment-api, order-api (downstream)
           Suggested action: Revert PR #412 or apply hotfix

14:43 UTC  Kenchi posts to #incidents in Slack:
           "Alert: redis_connection_errors > 100/min on payment-api
            Likely cause: PR #412 changed max-connections to 100 (typo)
            Affected: payment-api, order-api
            Suggested: Rollback PR #412 [Approve Rollback] [Dismiss]
            Similar past incident: #287 (resolved in 12 min)"

14:45 UTC  On-call engineer clicks [Approve Rollback]
           Kenchi triggers revert via GitHub API

14:50 UTC  New deploy completes, alert resolves
           Kenchi updates Slack thread: "Resolved. MTTR: 9 minutes."
           Kenchi auto-drafts postmortem and creates Jira ticket
```

**Architectural notes:**

- Alert normalization uses per-source adapters behind a common `AlertNormalizerPort`
- Deduplication via alert fingerprint hashing (prevents re-processing the same alert)
- Severity classification uses a rule-based policy engine with tenant-customizable thresholds
- The AI summarizer follows the same chunk/extract/aggregate pipeline as CI analysis, but with incident-specific prompt templates
- All deterministic text in Slack messages (metric values, timestamps, service names) is clearly separated from AI-generated text (summary, suggestions)

---

### 3c. Infrastructure Intelligence

**Status:** Planned with detailed spec for IaC Review. See [IAC_REVIEW_IMPLEMENTATION.md](./IAC_REVIEW_IMPLEMENTATION.md) and [CONFIG_DRIFT_DETECTION_IMPLEMENTATION.md](./CONFIG_DRIFT_DETECTION_IMPLEMENTATION.md).

**Sources:**

| Tool               | Data Ingested                              | Trigger Mechanism |
| ------------------ | ------------------------------------------ | ----------------- |
| Terraform Cloud    | Plan output, state changes, run events     | Webhook / API     |
| Pulumi             | Preview output, stack updates              | Webhook           |
| AWS CloudFormation | Change sets, stack events, drift results   | CloudWatch Events |
| Kubernetes         | Resource manifests, pod events, HPA status | API polling       |
| ArgoCD             | Sync status, health checks, diff output    | Webhook           |
| Helm               | Release history, values diff               | API polling       |

**Capabilities:**

**IaC Change Review (PR-triggered):**

- Detect IaC files in PRs (Terraform `.tf`, Kubernetes `.yaml`, Pulumi programs)
- Parse IaC diffs into a resource graph: which resources are being created, modified, or deleted
- Run static analysis tools (Checkov, tfsec, tflint, kube-score) with pinned versions
- Estimate cost impact using Infracost (base vs. head comparison per Terraform root)
- AI-powered review: security implications, blast radius, best practice violations
- Post a structured PR comment with findings grouped by severity

```
Example PR comment:

## Kenchi IaC Review

### Security (2 findings)
  HIGH: S3 bucket "logs-archive" has public read access enabled
        File: modules/storage/main.tf:42
        Fix: Set acl = "private" or use a bucket policy
        Tool: checkov (CKV_AWS_20)

  MEDIUM: RDS instance missing encryption at rest
          File: modules/database/rds.tf:18
          Fix: Add storage_encrypted = true
          Tool: tfsec (aws-rds-encrypt-instance-storage)

### Cost Impact
  Monthly estimate: +$847/mo (+23%)
  Breakdown:
    + $720/mo  RDS db.r6g.xlarge (new)
    + $127/mo  NAT Gateway (new)
    - $0       No resources removed

### Best Practices (1 finding)
  INFO: Terraform module source uses branch ref instead of tag
        File: modules/database/main.tf:1
        Fix: Pin to a version tag (e.g., ?ref=v2.1.0)

Confidence: 0.89 | 3 tool findings, 0 AI-only findings
```

**Drift Detection (scheduled):**

- Compare desired state (Git manifests / Terraform state) against actual state (live K8s cluster / AWS resources)
- Classify drift by severity: security-relevant drift (open ports, public access) vs. operational drift (replica count, resource limits)
- Identify the likely cause of drift: manual console change, operator auto-scaling, failed apply
- Generate weekly drift digest reports
- Offer auto-remediation: sync actual state back to desired state (with approval)

**Resource Right-Sizing:**

- Analyze Kubernetes resource utilization (CPU/memory requests vs. actual usage) over time
- Recommend right-sized requests and limits based on P95 usage patterns
- Estimate cost savings from right-sizing
- Flag over-provisioned and under-provisioned workloads

**Cost Anomaly Detection:**

- Track infrastructure costs per service, team, and environment over time
- Alert when costs deviate significantly from historical baselines
- Correlate cost spikes with specific changes (new resources, traffic increase, misconfiguration)
- Attribute costs to the PR/deploy that introduced them

---

### 3d. Deployment Intelligence

**Status:** Planned. Pre-deploy risk scoring specified in [ROADMAP.md](./ROADMAP.md).

**Sources:** This module is unique because it combines signals from multiple other modules (Git + CI/CD + Monitoring) rather than connecting to a new tool.

| Signal Source      | Data Used                                  | Purpose             |
| ------------------ | ------------------------------------------ | ------------------- |
| GitHub PRs         | Diff size, files changed, review status    | Change risk factors |
| CI/CD results      | Test pass rate, coverage delta, build time | Quality signals     |
| Historical data    | Past failure rate for similar changes      | Pattern-based risk  |
| Monitoring         | Current error rates, latency baselines     | Pre-deploy health   |
| Deployment history | Recent deploy outcomes for this service    | Track record        |

**Capabilities:**

**Pre-deploy risk scoring:**

Before a deployment, Kenchi calculates a composite confidence score based on multiple risk factors:

```
Deploy Confidence: 73% (Proceed with caution)

Risk Factors:
  +20  All tests passing
  +15  No P1 incidents in last 24h
  +10  Code reviewed and approved
  -10  2 new dependencies added
  -15  Last deploy to this environment failed
  -10  Test coverage decreased 72% to 68%
   -7  No rollback tested recently

Recommendation: Deploy with enhanced monitoring
```

| Risk Factor         | Weight    | Signal Source              |
| ------------------- | --------- | -------------------------- |
| Test status         | +20 / -30 | CI/CD results              |
| Test coverage delta | +10 / -15 | CI/CD results              |
| Recent incidents    | +15 / -25 | Incident module            |
| Deploy history      | +10 / -15 | Historical deployment data |
| Dependency changes  | +5 / -10  | PR diff analysis           |
| Code review status  | +10 / -20 | GitHub PR metadata         |
| Rollback tested     | +5 / -10  | Deployment history         |
| Time of day         | +5 / -10  | Clock + team schedule      |

**Canary/progressive rollout health analysis:**

- Monitor error rates, latency, and business metrics during canary deployments
- Compare canary cohort against baseline using statistical significance testing
- Auto-recommend: promote canary, hold for more data, or roll back
- Surface the specific requests/endpoints showing degradation

**Auto-rollback triggers:**

- Define per-service thresholds: if error rate exceeds X% within Y minutes post-deploy, trigger rollback
- Kenchi monitors post-deploy metrics and compares against the baseline
- If thresholds are breached, Kenchi suggests a rollback (or auto-executes if configured)
- Rollback suggestions include the specific command/action and estimated blast radius

**Change failure rate tracking:**

- Track the percentage of deployments that result in a rollback, hotfix, or incident
- Break down by service, team, and environment
- Identify teams and services with improving or degrading change failure rates
- Feed into DORA metrics (see Engineering Analytics)

---

### 3e. Security & Compliance

**Status:** Planned. Foundational capabilities exist (secret redaction, prompt injection detection, webhook signature verification).

**Sources:**

| Tool / Source        | Data Ingested                           | Trigger Mechanism |
| -------------------- | --------------------------------------- | ----------------- |
| GitHub PRs           | Code diffs, commit messages             | Webhook           |
| Terraform plans      | Resource configurations, IAM policies   | PR event          |
| Container registries | Image scan results, base image age      | Webhook / API     |
| Dependabot / Snyk    | Vulnerability reports, dependency trees | Webhook           |
| CI logs              | Build output (potential secret leaks)   | CI analysis       |
| AWS Config           | Resource compliance status              | API polling       |

**Capabilities:**

**Secret leak detection in PRs and CI logs:**

Kenchi already runs `redactSecrets()` on all log data before processing. This capability extends it to proactively alert on leaked credentials:

- Scan PR diffs for patterns matching API keys, tokens, passwords, and private keys
- Scan CI logs for accidentally printed secrets (even if the CI platform masks them partially)
- Alert the PR author immediately via PR comment and Slack DM
- Track leak frequency per team to identify training needs

**Dependency vulnerability correlation with runtime impact:**

- Ingest vulnerability reports from Dependabot, Snyk, or Trivy
- Cross-reference with actual import usage in the codebase (is the vulnerable function actually called?)
- Correlate with runtime metrics: is the vulnerable package in a hot path?
- Prioritize by actual risk, not just CVSS score
- Auto-create tickets for critical vulnerabilities with fix suggestions

**IaC security posture:**

- Detect security misconfigurations in Terraform and Kubernetes manifests
- Public S3 buckets, open security groups, missing encryption, overly permissive IAM
- Run Checkov, tfsec, and kube-score as static analysis tools (findings are deterministic facts)
- AI layer adds context: "This S3 bucket stores customer PII based on its name and tags"

**Compliance drift alerting:**

- Define compliance policies as code (SOC2: encryption at rest required, HIPAA: audit logging required, PCI-DSS: network segmentation required)
- Monitor infrastructure state against these policies continuously
- Alert when a change introduces a compliance violation
- Generate audit-ready reports showing compliance status over time

---

### 3f. Engineering Analytics (DORA+)

**Status:** Planned. Data foundations exist in analysis history and deployment tracking.

**Sources:** This module aggregates data from all other modules. No new integrations required.

**Capabilities:**

**Four DORA metrics auto-calculated:**

| Metric                | How Kenchi Measures It                                           |
| --------------------- | ---------------------------------------------------------------- |
| Deployment Frequency  | Count of successful deploys per service per time period          |
| Lead Time for Changes | Time from first commit on a branch to production deploy          |
| Change Failure Rate   | Percentage of deploys that cause an incident or rollback         |
| Mean Time to Recovery | Time from incident detection to resolution (using incident data) |

**Team health dashboards:**

- Per-team view of all four DORA metrics with trend lines
- Compare teams against each other and against industry benchmarks (Elite, High, Medium, Low performers)
- Drill down into specific services or time periods
- Identify bottlenecks: is lead time high because of slow CI, slow reviews, or slow deploys?

**Bottleneck identification across SDLC:**

- Break down lead time into components: code time, review time, CI time, deploy queue time
- Identify which stage is the biggest bottleneck for each team
- Track improvements over time as teams address bottlenecks

**Cost attribution per team/service/feature:**

- Aggregate LLM usage costs, infrastructure costs, and CI compute costs
- Attribute to the team, service, or feature that generated them
- Show cost trends and flag anomalies

**Trend analysis and forecasting:**

- Project future DORA metrics based on recent trends
- Alert when a metric is trending in the wrong direction
- Suggest specific actions to improve (e.g., "Your change failure rate increased 15% this month. The most common cause is missing integration tests in the checkout-service.")

---

## Integration Architecture

### Integration Table

| Tool            | Category       | Data Ingested                      | Trigger           | Auth Method       | Priority |
| --------------- | -------------- | ---------------------------------- | ----------------- | ----------------- | -------- |
| GitHub          | Source Control | PRs, commits, check runs, webhooks | Webhook           | GitHub App (JWT)  | P0       |
| Slack           | Notifications  | Commands, messages, reactions      | Socket Mode       | OAuth + Bot Token | P0       |
| GitHub Actions  | CI/CD          | Workflow runs, logs, annotations   | Webhook           | GitHub App        | P0       |
| CircleCI        | CI/CD          | Build events, logs                 | Webhook           | API Key           | P1       |
| GitLab          | Source + CI/CD | MRs, pipelines, jobs               | Webhook           | OAuth             | P1       |
| Jenkins         | CI/CD          | Build events, console output       | Webhook           | API Token         | P2       |
| Azure Pipelines | CI/CD          | Run events, logs                   | Webhook           | Service Principal | P2       |
| Prometheus      | Monitoring     | Alerts, metric values              | Webhook (AM)      | N/A (push)        | P1       |
| Datadog         | Monitoring     | Monitor alerts, APM traces         | Webhook           | API + App Key     | P1       |
| PagerDuty       | Incidents      | Incident events, on-call schedule  | Webhook           | API Key           | P1       |
| CloudWatch      | Monitoring     | Alarms, log insights               | SNS / EventBridge | IAM Role          | P1       |
| Sentry          | Error Tracking | Error events, issue state          | Webhook           | DSN / API Token   | P2       |
| New Relic       | Monitoring     | Alert conditions, NRQL results     | Webhook           | API Key           | P2       |
| OpsGenie        | Incidents      | Alert events, schedules            | Webhook           | API Key           | P2       |
| Grafana         | Monitoring     | Alert notifications                | Webhook           | API Key           | P2       |
| Terraform Cloud | IaC            | Run events, plan output            | Webhook / API     | Team Token        | P1       |
| Kubernetes      | Infrastructure | Pod events, resource state         | API polling       | ServiceAccount    | P1       |
| ArgoCD          | Deployment     | Sync events, health status         | Webhook           | API Token         | P2       |
| Jira            | Project Mgmt   | Ticket creation (outbound)         | Outbound API      | OAuth             | P2       |
| Linear          | Project Mgmt   | Issue creation (outbound)          | Outbound API      | API Key           | P2       |
| Microsoft Teams | Notifications  | Bot messages (outbound)            | Outbound API      | OAuth             | P3       |

### Adapter Pattern

Every integration is implemented as an adapter behind a port interface. The service layer never imports vendor SDKs directly.

```typescript
// Port interface (defined in services/*/src/ports/)
interface AlertIngestionPort {
  normalizeAlert(
    rawPayload: unknown,
    source: AlertSource,
    context: RequestContext
  ): Promise<NormalizedAlert>;
}

// Adapter implementation (in services/*/src/adapters/)
class PrometheusAlertAdapter implements AlertIngestionPort {
  async normalizeAlert(
    rawPayload: unknown,
    source: AlertSource,
    context: RequestContext
  ): Promise<NormalizedAlert> {
    // Transform Prometheus AlertManager payload
    // into Kenchi's NormalizedAlert schema
  }
}

// Composition root wires them together (services/*/src/container.ts)
const alertIngestion = new PrometheusAlertAdapter(httpClient);
const incidentService = createIncidentService(alertIngestion);
```

This pattern means adding a new integration (e.g., Datadog alerts) requires only:

1. Create a `DatadogAlertAdapter` implementing `AlertIngestionPort`
2. Add it to the composition root
3. Add a webhook route that calls the adapter

No changes to the service layer, analysis pipeline, or notification system.

### Webhook Ingestion Pattern

All webhook endpoints follow the same structure (already built for GitHub and Slack):

1. **Verify signature** -- Reject invalid signatures with 401 before any processing
2. **Check idempotency** -- Look up the delivery ID; if already processed, return 200 with `{ status: "duplicate" }`
3. **Normalize** -- Transform the payload into the common event schema
4. **Queue** -- Enqueue for async processing (Redis queue)
5. **Acknowledge** -- Return 200 immediately (webhook sources expect fast responses)

### Rate Limiting and Backpressure

- Inbound rate limiting per source (webhook endpoints)
- Outbound rate limiting per provider (respect GitHub's 5000 req/hr, Slack's tier limits)
- Backpressure: when the processing queue is full, webhook endpoints return 429 with a `Retry-After` header
- Circuit breaker pattern for external API calls (auto-open on repeated failures, auto-close after recovery)
- Bounded concurrency for batch operations using `pMap` with configurable limits

---

## AI Analysis Pipeline

### Shared Pipeline Architecture

All feature modules share the same four-stage analysis pipeline. The difference between modules is the prompt templates and the type of input data.

```
                    Raw Input
                    (CI logs, alert payload, IaC diff, etc.)
                         │
                         ▼
               ┌─────────────────────┐
               │  Stage 1: Chunk     │
               │                     │
               │  • Preprocess       │
               │    (strip noise,    │
               │     sanitize)       │
               │  • Smart splitting  │
               │    (natural         │
               │     boundaries)     │
               │  • Protected zones  │
               │    (keep errors     │
               │     together)       │
               └──────────┬──────────┘
                          │ N chunks
                          ▼
               ┌─────────────────────┐
               │  Stage 2: Extract   │  Parallel (pMap, concurrency: 15)
               │                     │
               │  Per-chunk LLM call │  Fast model (Claude 3.5 Haiku)
               │  • Extract errors   │  ~2s per chunk
               │  • Extract warnings │
               │  • Extract fixes    │  Feature-specific prompt template
               │  • Structured JSON  │
               └──────────┬──────────┘
                          │ N extraction results
                          ▼
               ┌─────────────────────┐
               │  Stage 3: Aggregate │  Deterministic (no LLM)
               │                     │
               │  • Deduplicate      │
               │    (content hash)   │
               │  • Rank by priority │
               │  • Detect framework │
               │  • Build evidence   │
               │    catalog          │
               └──────────┬──────────┘
                          │ Aggregated artifacts
                          ▼
               ┌─────────────────────┐
               │  Stage 4: Analyze   │  Powerful model (configurable)
               │                     │
               │  • Final root cause │
               │  • Confidence level │
               │  • Recommendations  │
               │  • RAG context      │
               │    (past incidents, │
               │     runbooks, fixes)│
               │  • Feature-specific │
               │    prompt template  │
               └──────────┬──────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │  Confidence Scoring │  Deterministic (6-factor)
               │                     │
               │  • Base score       │
               │  • Uncertainty      │
               │  • Evidence align.  │
               │  • Completeness     │
               │  • Hallucination    │
               │  • Knowledge base   │
               │    validation       │
               └──────────┬──────────┘
                          │
                          ▼
                   Scored Analysis
                   (ready for action layer)
```

### Different Prompt Templates per Feature Module

The pipeline is generic. What makes each module different is the prompt template injected at the extraction and analysis stages:

| Module             | Extraction Prompt Focus                            | Analysis Prompt Focus                       |
| ------------------ | -------------------------------------------------- | ------------------------------------------- |
| CI/CD Intelligence | Error messages, test failures, build errors        | Root cause, fix suggestion, test clustering |
| Incident Triage    | Alert metrics, service names, error patterns       | Blast radius, correlation, runbook match    |
| IaC Review         | Security findings, cost deltas, resource changes   | Risk assessment, best practice review       |
| Deployment Intel   | Risk factors, quality signals, historical patterns | Confidence score, go/no-go recommendation   |
| Security           | Vulnerabilities, secret patterns, compliance gaps  | Severity, exploitability, remediation       |

### Model Selection Strategy

| Stage      | Model Choice                             | Rationale                                |
| ---------- | ---------------------------------------- | ---------------------------------------- |
| Extraction | Fast model (Claude 3.5 Haiku)            | High throughput, low cost per chunk      |
| Analysis   | Powerful model (configurable per tenant) | Deep reasoning for root cause analysis   |
| Embeddings | Budget-aware tiered selection            | LIGHT/STANDARD/PREMIUM per tenant budget |

The extraction model is optimized for speed: it processes 15 chunks concurrently at ~2s per chunk. The final analysis model is optimized for quality: it receives the aggregated artifacts plus RAG context and produces the final structured output.

Model selection is configurable per tenant:

- `EXTRACTION_MODEL` env var controls the extraction model
- `LLM_MODEL` env var controls the final analysis model
- Fine-tuned models can be A/B tested using the model versioning system

### Context Enrichment: Cross-Module Correlation

The most powerful analyses happen when Kenchi correlates signals across modules:

```
Alert: Redis connection errors > 100/min (Monitoring)
  + Recent deploy: PR #412 merged 6 min ago (Deployment)
  + PR #412 changed redis.conf max-connections (Source Control)
  + Past incident #287: similar Redis config issue (Knowledge Base)
  = High-confidence diagnosis with specific fix suggestion
```

This cross-module correlation is what distinguishes Kenchi from single-purpose tools. The correlation engine matches events using shared keys:

- **Commit SHA** -- links PRs, CI runs, and deployments
- **Service name** -- links alerts, deployments, and infrastructure changes
- **Time window** -- links events occurring within a configurable window (default: 30 minutes)
- **Deployment ID** -- links deploy events with post-deploy monitoring data

### Feedback Loop

User corrections improve future analyses:

1. When a user marks a suggestion as "helpful" or "not helpful" via Slack buttons or the web dashboard, Kenchi records the feedback
2. Positive outcomes (correct root cause + successful fix) are ingested into the RAG knowledge base as high-quality training examples
3. Negative feedback triggers a review of the prompt template and extraction quality
4. Over time, per-team pattern databases improve: "For this team's Go microservices, 80% of CI failures are caused by missing test fixtures"
5. The fine-tuning pipeline can use accumulated feedback to train custom models

---

## Dashboard & UX

### Frontend Technology Stack

| Concern    | Choice                   | Rationale                                       |
| ---------- | ------------------------ | ----------------------------------------------- |
| Framework  | React + Vite             | Fast builds, SPA for dashboard                  |
| Styling    | Tailwind CSS + shadcn/ui | Consistent design system, accessible components |
| State Mgmt | TanStack Query (planned) | Server state caching, background refetch        |
| Routing    | React Router             | Client-side navigation                          |
| Charts     | Recharts (planned)       | Lightweight, composable charting                |

### Navigation Structure

```
 KENCHI DASHBOARD
 =====================================
 [Org Name]            [Bell] [Avatar]
 =====================================

 Sidebar:
 ─────────────────────
 Dashboard (home)

 CI/CD Intelligence
   Recent Failures
   Analysis History
   PR Analysis View
   Flaky Tests

 Incidents (future)
   Active Incidents
   Alert Feed
   Postmortems
   On-Call Schedule

 Infrastructure (future)
   IaC Reviews
   Drift Detection
   Cost Tracking
   Resource Health

 Deployments (future)
   Deploy History
   Risk Scores
   Rollback Log
   Canary Status

 Security (future)
   Vulnerability Feed
   Secret Scan Results
   Compliance Status

 Analytics
   DORA Metrics
   Team Health
   Cost Attribution
   Trends

 Knowledge Base
   Search
   Documents
   Health

 Settings
   Integrations
   Risk Rules
   Team Members
   Org Settings
   System Health
 ─────────────────────
```

### Key Pages

**Unified Activity Feed:**

The dashboard home page shows a unified feed of events from all connected tools, sorted by recency:

- CI failure analyzed (GitHub Actions) -- 3 min ago
- Alert resolved (Prometheus) -- 12 min ago
- IaC review posted (Terraform) -- 1 hr ago
- Deploy completed (production) -- 2 hrs ago
- Incident closed (P2) -- 4 hrs ago

Each event card shows: source icon, summary, confidence score (if applicable), affected service, and a link to the full analysis.

**Per-Module Detail Pages:**

Each feature module has its own detail page with module-specific views. For CI/CD Intelligence (currently built):

- Analysis results with root cause, confidence breakdown, recommended fixes
- PR-grouped view: all CI failures for a PR on a single timeline
- Flaky test leaderboard: which tests fail most often without code changes
- Pipeline performance trends: build times, failure rates over time

**Integrations Management Page:**

- Grid of all supported integrations with connect/disconnect status
- One-click OAuth flow for each tool
- Per-integration health status (last webhook received, connection test)
- Webhook URL to copy for tools that require manual configuration

### ASCII Mockup: Dashboard Home

```
┌──────────────────────────────────────────────────────────────────────┐
│  KENCHI                                          [Bell(3)] [J.D. v] │
├─────────────┬────────────────────────────────────────────────────────┤
│             │                                                        │
│  Dashboard  │   Welcome back, Jane                                   │
│             │                                                        │
│  CI/CD      │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│   Failures  │   │ Analyses │ │ Avg Conf │ │ Open     │ │  MTTR   │ │
│   History   │   │ This Week│ │  Score   │ │ Failures │ │         │ │
│   PR View   │   │   47     │ │  0.84    │ │    3     │ │  14min  │ │
│   Flaky     │   │  +12%    │ │  +0.03   │ │   -2     │ │  -22%   │ │
│             │   └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  Knowledge  │                                                        │
│   Search    │   Activity Feed                        [Filter v]      │
│   Docs      │   ─────────────────────────────────────────────        │
│   Health    │                                                        │
│             │   [GH] CI failure analyzed              3 min ago      │
│  Settings   │   payment-api / PR #412 / Conf: 0.92                   │
│   Integs    │   Root cause: Missing REDIS_URL env var                │
│   Rules     │                                                        │
│   Team      │   [GH] CI passed (was failing)         18 min ago     │
│   Health    │   checkout-service / PR #408 / Resolved                │
│             │                                                        │
│             │   [SL] Feedback: Helpful                45 min ago     │
│             │   @alice rated analysis #1847 as helpful               │
│             │                                                        │
│             │   [GH] New PR analysis                  1 hr ago       │
│             │   user-service / PR #395 / Conf: 0.71                  │
│             │   Root cause: Flaky network test                       │
│             │                                                        │
│             │   [Load more...]                                       │
│             │                                                        │
├─────────────┴────────────────────────────────────────────────────────┤
│  System: Healthy | API: OK | Slack: OK | GitHub: OK | DB: OK        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Notification & Action Layer

### Output Channels

| Channel                  | Supported Actions                             | Status  |
| ------------------------ | --------------------------------------------- | ------- |
| GitHub PR Comments       | Analysis results, fix suggestions, IaC review | Built   |
| GitHub Check Annotations | Inline error annotations                      | Built   |
| Slack Messages           | Alerts, analysis summaries, approval buttons  | Built   |
| Slack DMs                | Personal notifications, secret leak alerts    | Built   |
| Email                    | Digest summaries, escalation alerts           | Planned |
| PagerDuty                | Incident routing, severity escalation         | Planned |
| Jira                     | Ticket creation for incidents and fixes       | Planned |
| Linear                   | Issue creation for engineering tasks          | Planned |
| Web Dashboard            | In-app notifications, real-time feed          | Built   |

### Auto-Remediation Actions

Kenchi can suggest and (with approval) execute remediation actions:

| Action                    | Safety Level | Approval Required | Example                                |
| ------------------------- | ------------ | ----------------- | -------------------------------------- |
| Post PR comment           | Safe         | No                | Analysis results, fix suggestions      |
| Send Slack notification   | Safe         | No                | Alert forwarding, status updates       |
| Re-run CI pipeline        | Low risk     | No (configurable) | Retry after transient failure          |
| Create Jira/Linear ticket | Low risk     | No                | Bug report from analysis               |
| Revert a PR               | Medium risk  | Yes               | Rollback a change causing an incident  |
| Update env var/secret     | Medium risk  | Yes               | Add missing CI secret                  |
| Scale service             | Medium risk  | Yes               | Increase replicas during traffic spike |
| Restart service           | High risk    | Yes               | Restart unhealthy pods                 |
| Apply Terraform change    | High risk    | Yes               | Fix IaC drift                          |
| Execute runbook step      | High risk    | Yes               | Run diagnostic command                 |
| Force-push / data change  | Blocked      | N/A               | Never auto-executed                    |

### Notification Routing Rules

Teams can configure routing rules to control which events go where:

```
Rule: "Production incidents go to PagerDuty"
  Condition: severity = P1 OR severity = P2, environment = production
  Action: Page on-call engineer via PagerDuty

Rule: "CI failures go to team Slack channel"
  Condition: event_type = CICD_FAILURE
  Action: Post to the mapped Slack channel for that repository

Rule: "IaC security findings go to security team"
  Condition: module = iac_review, severity = HIGH or CRITICAL
  Action: Post to #security-reviews, tag @security-team

Rule: "Weekly DORA digest"
  Condition: schedule = every Monday 9am
  Action: Post DORA metrics summary to #engineering-leads
```

---

## Data Model Overview

### Core Entities

```
┌──────────────────────────────────────────────────────────────┐
│                       TENANT                                  │
│  id, name, github_installation_id, slack_workspace_id,       │
│  status, embedding_tier, created_at                          │
├──────────────────────────────────────────────────────────────┤
│  Has many: Users, Integrations, Events, Analyses, Incidents │
└──────────────────────────────────────────────────────────────┘
         │
         ├─────────────────────────┐
         │                         │
         ▼                         ▼
┌─────────────────┐     ┌──────────────────┐
│      USER       │     │   INTEGRATION    │
│  id, email,     │     │  id, tenant_id,  │
│  tenant_id,     │     │  provider,       │
│  role, status,  │     │  auth_config,    │
│  last_login     │     │  status,         │
│                 │     │  last_sync       │
└─────────────────┘     └──────────────────┘

         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                        EVENT                                  │
│  id (evt_*), tenant_id, type, source, timestamp, severity,   │
│  payload (JSONB), metadata (JSONB), correlation_keys         │
│                                                              │
│  Types: CICD_FAILURE, MONITORING_ALERT, DEPLOYMENT,          │
│         IAC_CHANGE, SECURITY_FINDING, ...                    │
│                                                              │
│  Correlation keys: commit_sha, pr_number, deploy_id,        │
│                    service_name, environment                 │
└───────────────────────────┬──────────────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              │             │              │
              ▼             ▼              ▼
┌──────────────────┐ ┌────────────┐ ┌──────────────┐
│    ANALYSIS      │ │  INCIDENT  │ │  DEPLOYMENT  │
│  id, event_id,   │ │  id,       │ │  id,         │
│  tenant_id,      │ │  tenant_id,│ │  tenant_id,  │
│  summary,        │ │  severity, │ │  service,    │
│  identified_cause│ │  status,   │ │  environment,│
│  confidence_score│ │  timeline, │ │  commit_sha, │
│  recommendations,│ │  blast_    │ │  risk_score, │
│  evidence_used,  │ │  radius,   │ │  outcome,    │
│  model_version,  │ │  mttr,     │ │  started_at, │
│  processing_time │ │  postmortem│ │  completed_at│
└──────────────────┘ └────────────┘ └──────────────┘

              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│                       PATTERN                                 │
│  id, tenant_id, pattern_type, signature, frequency,          │
│  first_seen, last_seen, services_affected,                   │
│  common_root_cause, common_fix                               │
│                                                              │
│  Types: FLAKY_TEST, RECURRING_FAILURE, CONFIG_DRIFT,         │
│         COST_ANOMALY, SECURITY_REGRESSION                    │
└──────────────────────────────────────────────────────────────┘
```

### Event Normalization

Events from different sources are normalized into a common schema. The raw provider-specific payload is preserved in the `payload` JSONB column, but correlation keys are extracted into indexed columns for fast querying:

```typescript
// Normalized event (stored in database)
interface NormalizedEvent {
  readonly id: string; // evt_<uuid>
  readonly tenantId: string;
  readonly type: EventType; // CICD_FAILURE, MONITORING_ALERT, etc.
  readonly source: string; // github_actions, prometheus, terraform, etc.
  readonly timestamp: string; // ISO 8601
  readonly severity: EventSeverity;
  readonly payload: Record<string, unknown>; // Raw provider data (JSONB)

  // Correlation keys (indexed for fast lookups)
  readonly commitSha?: string;
  readonly prNumber?: number;
  readonly deploymentId?: string;
  readonly serviceName?: string;
  readonly environment?: string;
}
```

The correlation engine queries events by these keys to find related signals:

```sql
-- Find all events related to a deployment
SELECT * FROM events
WHERE tenant_id = $1
  AND (commit_sha = $2 OR deployment_id = $3 OR service_name = $4)
  AND timestamp BETWEEN $5 AND $6
ORDER BY timestamp;
```

---

## Roadmap & Phasing

### Phase 1: CI/CD Intelligence (Current)

**Status:** Built and operational.

**What is done:**

- GitHub App with webhook processing, PR comments, check run annotations
- Slack Bot with event handlers, rich message formatting, approval buttons, Q&A
- AI analysis pipeline: preprocessing, chunking, extraction, aggregation, final analysis
- RAG knowledge base: document ingestion, semantic search, multi-hop retrieval, drift detection
- 6-factor confidence scoring and risk assessment
- Multi-tenant architecture with per-org configuration
- Redis-based failure aggregation (consolidate multiple check run failures per PR)
- Action execution system with safety gating
- Web dashboard: landing page, login, basic dashboard
- Authentication: GitHub OAuth, JWT access/refresh tokens
- Fine-tuning pipeline for custom model training

**What remains in Phase 1:**

- Complete frontend dashboard pages (analysis results, job history, PR analysis view)
- GitLab CI and CircleCI adapter implementations
- CI cost tracking and pipeline optimization suggestions
- Flaky test detection and reporting

**Estimated timeline:** 4-6 weeks to complete remaining Phase 1 items.

---

### Phase 2: Incident Triage + DORA Metrics + Integrations Page

**Status:** Planned with detailed implementation spec.

**Scope:**

- Alert ingestion from Prometheus/AlertManager and CloudWatch (webhook adapters)
- Alert normalization and deduplication
- Severity classification (rule-based policy engine)
- AI-powered alert correlation with recent deploys and changes
- Runbook suggestion from RAG knowledge base
- Incident timeline auto-generation
- Post-incident postmortem auto-drafting
- PagerDuty integration for incident lifecycle management
- DORA metrics calculation from existing analysis and deployment data
- Integrations management page in the dashboard (connect/disconnect tools)
- Team health dashboards

**Key architectural work:**

- `AlertNormalizerPort` interface and per-source adapters
- Alert fingerprint hashing for deduplication
- Correlation engine that queries across event types by shared keys
- Incident-specific prompt templates for the AI pipeline
- DORA metrics aggregation queries

**Estimated timeline:** 8-10 weeks.

---

### Phase 3: Infrastructure Intelligence + Deployment Risk Scoring

**Status:** Planned with detailed implementation specs.

**Scope:**

- IaC PR review: detect Terraform/K8s files in PRs, run static analysis tools, estimate cost impact, AI-powered review
- Drift detection: compare desired state vs. actual state, classify drift severity, suggest remediation
- Pre-deploy risk scoring: composite confidence score from test results, coverage, incident history, dependency changes
- Canary deployment health analysis
- Auto-rollback trigger suggestions
- Terraform Cloud and Kubernetes API integrations
- Resource right-sizing recommendations

**Key architectural work:**

- IaC parsing layer (HCL/YAML to resource graph)
- Static analysis tool orchestration (Checkov, tfsec, Infracost) in sandboxed containers
- Terraform root detection for monorepo support
- Deploy risk scoring engine with configurable factor weights
- Kubernetes API adapter for resource state polling

**Estimated timeline:** 10-12 weeks.

---

### Phase 4: Security & Compliance + Engineering Analytics

**Status:** Future planning.

**Scope:**

- Secret leak detection in PRs and CI logs (extending existing `redactSecrets()`)
- Dependency vulnerability correlation with runtime impact
- IaC security posture monitoring (extending IaC review)
- Compliance policy engine (SOC2, HIPAA, PCI-DSS policy definitions)
- Compliance drift alerting and audit reporting
- Full DORA+ analytics suite with trend analysis and forecasting
- Cost attribution per team/service/feature
- Bottleneck identification across the SDLC

**Key architectural work:**

- Compliance policy definition language (code-as-policy)
- Vulnerability correlation engine (CVE data + codebase usage analysis)
- Analytics aggregation pipeline (time-series rollups for dashboards)
- Data export and reporting system

**Estimated timeline:** 12-16 weeks.

---

### Phase Summary

| Phase | Focus                                     | Status      | Timeline     |
| ----- | ----------------------------------------- | ----------- | ------------ |
| 1     | CI/CD Intelligence                        | Operational | Current      |
| 2     | Incident Triage + DORA Metrics            | Planned     | Next         |
| 3     | Infrastructure Intelligence + Deploy Risk | Planned     | +8-10 weeks  |
| 4     | Security & Compliance + Full Analytics    | Future      | +12-16 weeks |

---

## Competitive Differentiation

### vs. Datadog / New Relic / Grafana

These are **observability platforms** -- they collect metrics, logs, and traces and display them on dashboards. They answer "what is happening?" but leave "why?" and "what should I do?" to the engineer.

**Kenchi's advantage:** Kenchi does not replace Datadog. It ingests Datadog's alerts and adds an AI analysis layer that correlates them with code changes, deployments, and historical incidents. Kenchi answers "why is this happening?" and "how do we fix it?" with transparent confidence scoring.

```
Datadog says:  "Error rate on payment-api is 5.2% (threshold: 1%)"

Kenchi adds:   "This error rate spike started 6 minutes after PR #412
                was deployed. PR #412 changed the Redis connection pool
                configuration. A similar issue occurred 3 weeks ago
                (incident #287) and was resolved by reverting the config
                change. Confidence: 94%. [Suggest Rollback]"
```

### vs. LinearB / Sleuth / Jellyfish

These are **engineering metrics platforms** -- they calculate DORA metrics, cycle time, and developer productivity scores. They tell you "your change failure rate is 18%," but they do not help you understand why or fix specific failures.

**Kenchi's advantage:** Kenchi calculates the same DORA metrics, but also connects them to specific events. When your change failure rate increases, Kenchi can tell you which services, teams, and types of changes are causing the increase. It goes beyond dashboards into active incident correlation and IaC review.

### vs. Harness / Cortex / Port

These are **internal developer platforms** that provide service catalogs, deployment pipelines, and developer portals. They are broad but shallow -- they cover many concerns but do not go deep on AI-powered analysis.

**Kenchi's advantage:** Kenchi is focused and deep. Rather than being a general-purpose developer platform, it excels at one thing: using AI to make sense of the signals that existing tools produce. It does not replace your CI/CD pipeline or service catalog -- it makes them smarter.

### The Moat: Cross-Signal Correlation

The fundamental capability that no single-purpose tool provides is **cross-signal correlation**:

```
A Prometheus alert fires (monitoring)
  + correlated with a Terraform change merged 10 min ago (IaC)
  + which was part of a PR that also changed application code (source control)
  + and was deployed via a canary release (deployment)
  + which is showing elevated error rates in the canary cohort (monitoring)
  + and a similar pattern caused an incident 3 weeks ago (knowledge base)
  = Kenchi: "The Terraform change in PR #412 reduced the Redis
    max-connections setting. This is affecting the payment-api canary.
    Recommend: hold the canary rollout and revert the Redis config.
    Confidence: 94%."
```

No single tool -- not Datadog, not LinearB, not Harness -- can make this connection, because no single tool has visibility across all these systems. Kenchi does, because it sits at the center and ingests signals from all of them.

### Differentiation Summary

| Dimension              | Observability (Datadog) | Metrics (LinearB) | Platform (Harness)  | Kenchi                   |
| ---------------------- | ----------------------- | ----------------- | ------------------- | ------------------------ |
| Collect metrics        | Deep                    | Moderate          | Basic               | Via integration          |
| Display dashboards     | Excellent               | Good              | Good                | Good                     |
| AI root cause analysis | Basic (LLM chat)        | None              | None                | Core capability          |
| Cross-tool correlation | Within own platform     | Git + CI only     | Within own platform | Across all tools         |
| Actionable fixes       | Runbook links           | None              | Pipeline triggers   | Specific fix suggestions |
| Confidence scoring     | None                    | None              | None                | 6-factor deterministic   |
| Human-in-the-loop      | Manual                  | N/A               | Manual              | Built-in approval gates  |
| Knowledge base         | None                    | None              | Service catalog     | RAG with learning loop   |

---

**Document Version:** 1.0
**Last Updated:** 2026-02-14
**Related Documents:**

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- Current system architecture
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) -- Detailed component design
- [DATA_MODELS.md](./DATA_MODELS.md) -- Data structure schemas
- [INCIDENT_TRIAGE_IMPLEMENTATION.md](./INCIDENT_TRIAGE_IMPLEMENTATION.md) -- Incident triage detailed spec
- [IAC_REVIEW_IMPLEMENTATION.md](./IAC_REVIEW_IMPLEMENTATION.md) -- IaC review detailed spec
- [CONFIG_DRIFT_DETECTION_IMPLEMENTATION.md](./CONFIG_DRIFT_DETECTION_IMPLEMENTATION.md) -- Drift detection spec
- [ROADMAP.md](./ROADMAP.md) -- Development roadmap with feature status
- [FRONTEND_FEATURE_MAP.md](./FRONTEND_FEATURE_MAP.md) -- Frontend feature mapping
- [CODEBASE_OVERVIEW.md](./CODEBASE_OVERVIEW.md) -- Codebase structure reference
