# Security Assessment – Kenchi Monorepo

Date: 2026-01-02 (Updated)
Previous Assessment: 2025-02-15
Assessed By: Comprehensive codebase security audit

## Overview

Kenchi has strong deterministic safety controls (confidence scoring, action gating, secret redaction), but several application-layer gaps could expose tenants to abuse, data leakage, or credential theft. This document captures the key findings and outlines remediation steps.

## Summary of Findings

| #   | Severity | Area                          | Finding                                                                                                                                                                                                                                                                                       |
| --- | -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | `services/api`                | `/api/analyze` is publicly accessible without authentication or quota enforcement beyond a generic rate limiter. Attackers can exhaust OpenAI credits or submit malicious payloads.                                                                                                           |
| 2   | High     | `services/github-app`         | Administrative GitHub endpoints (`/api/github/comment`, `/api/github/annotations`, rerun/rerequest routes) lack authentication, allowing unauthorized PR comments, annotations, or workflow reruns.                                                                                           |
| 3   | High     | Tenant secret storage         | Slack bot tokens and user tokens are written to PostgreSQL in plaintext (`packages/shared/src/database/tenantService.ts`, `database/init/002_tenants.sql`), contradicting the “encrypted at application level” comment. Compromise of the DB grants long-lived access to customer workspaces. |
| 4   | High     | `services/slack-bot` HTTP API | `/slack/message` and `/slack/broadcast` endpoints accept arbitrary POSTs without authentication. Attackers can spam customer Slack workspaces or impersonate Kenchi.                                                                                                                          |
| 5   | High     | Webhook ingestion             | `/webhook/:source` route is exposed with TODOs for auth/validation, letting anyone inject fake CI events or trigger downstream workflows.                                                                                                                                                     |
| 6   | Medium   | Logging                       | The analysis endpoint logs raw request bodies before redaction (`services/api/src/routes/analysisRoutes.ts:31-45`), risking leakage of secrets contained in CI logs or stack traces.                                                                                                          |
| 7   | Medium   | Slack OAuth state management  | OAuth `state` values are stored only in process memory (`services/slack-bot/src/routes/oauthRoutes.ts:52-93`). In multi-instance or autoscaled deployments, callbacks may validate against an empty map, forcing disabled CSRF protection or causing fallbacks that attackers can exploit.    |
| 8   | Medium   | Vector search SQL             | `diffChunkRepository` and `knowledgeDocRepository` interpolate similarity thresholds and limits into SQL strings, creating injection risk if future APIs accept untrusted filters.                                                                                                            |
| 9   | High     | RAG ingestion/search APIs     | `/api/rag/ingest`, `/api/rag/search`, `/api/rag/sync`, and purge endpoints accept unauthenticated requests, allowing attackers to poison the knowledge base or exfiltrate every tenant’s documents/diff chunks.                                                                               |
| 10  | High     | Cross-tenant RAG leakage      | `searchAll` defaults to no tenant filter; `performAnalysis` calls `searchFromEventContext` without `tenantId`, so CI analyses can ingest retrieved docs from other tenants. Slack QA requests can also specify any `tenantId`, leading to data leakage.                                       |
| 11  | High     | Credential storage            | Slack/GitHub tokens are stored in plaintext DB columns despite comments claiming encryption, so a DB compromise exposes tenant credentials.                                                                                                                                                   |

## Detailed Findings & Recommendations

### 1. Unauthenticated `/api/analyze`

- **Evidence**: `services/api/src/routes/analysisRoutes.ts:31-65` registers POST `/api/analyze` without API key, OAuth, or token checks.
- **Impact**: Any internet user can invoke expensive OpenAI analyses, harvest internal features (recommended actions), or submit pathological logs to attempt prompt injection. Rate limiting is the only barrier.
- **Remediation**:
  1. Gate the route behind API keys or OAuth tokens per tenant.
  2. Add tenant-level quotas (e.g., N requests/hour) and hard fail on overage.
  3. Require signed payloads if the endpoint is only used internally (e.g., from GitHub App) and reject unsolicited requests at the edge (WAF/IP allow list).

### 2. Unauthenticated GitHub App Routes

- **Evidence**: `services/github-app/src/routes/apiRoutes.ts:36-200` exposes multiple POST endpoints (commenting, annotations, reruns) with only payload validation.
- **Impact**: Attackers could post arbitrary comments/check runs on watched repositories, spam GitHub, or trigger workflow reruns, leading to CI resource abuse.
- **Remediation**:
  1. Add authentication (JWT/API key) or mutual TLS for these routes.
  2. Verify the caller’s tenant/installation before invoking Octokit.
  3. Consider moving sensitive actions behind signed webhooks from trusted internal services instead of exposing public routes.

### 3. Plaintext Slack Tokens in DB

- **Evidence**: `packages/shared/src/database/tenantService.ts:233-305` inserts `slack_bot_token` directly. Schema (`database/init/002_tenants.sql:20-31`) stores token as `TEXT` without encryption.
- **Impact**: DB compromise exposes Slack bot tokens, allowing attackers to impersonate Kenchi in customer workspaces, read messages, or install malicious commands.
- **Remediation**:
  1. Encrypt tokens before persistence (AES-GCM with tenant-specific key or HSM/KMS).
  2. Store encryption keys in managed KMS and rotate regularly.
  3. Minimize access to decrypted tokens (decrypt only at runtime when calling Slack APIs).
  4. Update documentation/comments to reflect actual encryption state.

### 4. Slack HTTP API Without Authentication

- **Evidence**: `services/slack-bot/src/routes/httpRoutes.ts:84-160` exposes `/slack/message` and `/slack/broadcast` with only payload shape validation.
- **Impact**: Anyone with network access can command the bot to post messages or broadcasts across all tenant channels, enabling phishing, spam, or disclosure of fake incidents.
- **Remediation**:
  1. Require authentication (bearer tokens, HMAC signatures, or mTLS) for these HTTP routes.
  2. Verify `installation_id` belongs to the authenticated tenant before dispatching Slack messages.
  3. Consider moving message posting behind internal queues/webhooks not exposed publicly.

### 5. Unauthenticated Webhook Endpoint

- **Evidence**: `services/api/src/routes/webhookRoutes.ts:24-44` handles `POST /webhook/:source` with a TODO for auth/validation but currently accepts arbitrary payloads.
- **Impact**: Attackers can flood the system with fake “CI failure” events, trigger automation, or attempt prompt injection via untrusted payloads.
- **Remediation**:
  1. Require HMAC signatures or API keys per source (GitHub, Jenkins, etc.).
  2. Validate payload schema per source and drop/alert on unknown senders.
  3. If the endpoint is unused, disable it until authentication circuitry is implemented.

### 6. Sensitive Request Logging

- **Evidence**: `services/api/src/routes/analysisRoutes.ts:31-45` logs the raw request body preview prior to passing through `/packages/shared` redaction utilities.
- **Impact**: CI logs routinely contain secrets (tokens, passwords). Logging those values at INFO level pushes them into centralized log systems, defeating redaction.
- **Remediation**:
  1. Remove raw-body logging or run the content through `redactSecrets` before logging.
  2. Reduce logging level (DEBUG) and disable in production.
  3. Ensure preview length is configurable per tenant and default to 0 unless explicitly enabled.

### 7. Slack OAuth State Stored In-Memory

- **Evidence**: `services/slack-bot/src/routes/oauthRoutes.ts:52-93` keeps OAuth states in a `Map`. Comments recommend Redis, but no environment-based switch is implemented.
- **Impact**: In a multi-instance deployment, OAuth callbacks may hit a different instance with an empty state map, forcing operators to disable state validation (opening CSRF attacks) or causing installation failures. Attackers could potentially replay states if deployments restart mid-OAuth.
- **Remediation**:
  1. Move state storage to Redis or another shared, expiring store (keyed by state token).
  2. Add environment flags to discourage in-memory mode outside local dev.
  3. Monitor state cleanup and set tighter TTLs to reduce replay windows.

### 8. Dynamic SQL in Vector Searches

- **Evidence**: `packages/shared/src/database/diffChunkRepository.ts:120-154` and `packages/shared/src/database/knowledgeDocRepository.ts:132-166` embed `minSimilarity`, `limit`, and conditional fragments via template literals rather than parameter placeholders.
- **Impact**: Today these filters are numeric and server-controlled, but exposing search parameters to tenants (e.g., API search endpoints) would allow SQL injection (e.g., `limit = "1; DROP TABLE diff_chunks;"`). The pattern also encourages copy/paste of unsafe SQL assembly elsewhere.
- **Remediation**:
  1. Parameterize numeric thresholds and limits (`AND similarity >= $N`, `LIMIT $N`) and add them to the parameter array.
  2. Validate filter inputs rigorously (number ranges, allowlisted columns) before appending to SQL.
  3. Create shared helpers for safe query building to avoid direct string interpolation going forward.

### 9. Unauthenticated RAG Ingestion/Search APIs

- **Evidence**: `services/api/src/routes/ragRoutes.ts` and `services/api/src/routes/rag/coreRoutes.ts` expose POST `/api/rag/ingest`, `/api/rag/search`, `/api/rag/sync`, `/api/rag/purge`, etc., with only payload validation—no API keys or auth middleware.
- **Impact**: Anonymous users can seed malicious documents (prompt-injection, false runbooks), purge or reindex existing data, or query the entire knowledge base (including sensitive customer runbooks) via `/api/rag/search`. This undermines the trustworthiness of RAG outputs and leaks proprietary information.
- **Remediation**:
  1. Require strong authentication/authorization for all RAG endpoints (tenant-scoped API keys or service-to-service tokens).
  2. Enforce per-tenant quotas and audit logging for ingestion/search operations.
  3. Validate that the caller is allowed to act on the referenced `tenantId`/repository; reject cross-tenant requests.

### 10. Cross-Tenant RAG Leakage

- **Evidence**: `packages/shared/src/rag/search.ts:260-381` defaults to `tenantId` being optional. `services/api/src/services/analysisService.ts:115-205` calls `searchFromEventContext(context)` without passing a tenant ID, so CI analyses retrieve documents from _all_ tenants. Slack QA (`services/slack-bot/src/services/qaService.ts`) accepts `tenantId` from user payloads without verification.
- **Impact**: Knowledge docs ingested by one tenant can surface in another tenant’s analysis or Slack Q&A response, leaking proprietary runbooks, incident reports, or diff context. Attackers can also set `tenantId` when calling `/api/rag/search` to exfiltrate other tenants’ data.
- **Remediation**:
  1. Make `tenantId` mandatory in search APIs and derive it from authenticated context (installation ID, API key), not user input.
  2. Pass tenant metadata throughout the analysis pipeline so `searchFromEventContext` filters correctly.
  3. Add automated tests to ensure cross-tenant queries return zero results; monitor for violations.

### 11. Credential Storage in Plaintext

- **Evidence**: Slack bot/user tokens and GitHub installation tokens are persisted directly in `tenants.slack_bot_token`/related columns (`packages/shared/src/database/tenantService.ts:233-305`, `database/init/002_tenants.sql`). Comments suggest “encrypted at application level,” but no crypto is applied.
- **Impact**: Database compromise grants long-lived control of every customer workspace (posting in Slack, responding to GitHub webhooks). Attackers could silently hijack or impersonate Kenchi across tenants.
- **Remediation**:
  1. Encrypt tokens before storing (AES-GCM or envelope encryption via KMS); store only ciphertext and metadata.
  2. Minimize decryption (only when calling the provider) and scrub tokens from logs/memory.
  3. Rotate stored credentials regularly and update docs to reflect actual storage behavior.

## Remediation Progress (2026-01-02 Audit)

### Verified Security Controls ✅

| Control                               | Status           | Evidence                                                                                                                         |
| ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GitHub webhook signature verification | ✅ Implemented   | `verifyGitHubWebhook` middleware in `webhookRoutes.ts:260,295,314`                                                               |
| Slack webhook signature verification  | ✅ Implemented   | `verifySlackSignature` middleware using HMAC-SHA256 (`verifySlack.ts`)                                                           |
| Secret redaction utilities            | ✅ Implemented   | `redactSecrets`, `redactSecretsWithStats`, `redactObject` in `@kenchi/shared`                                                    |
| SQL injection prevention              | ✅ Safe patterns | Parameterized queries used throughout; dynamic SQL in `tenantRagConfig.ts` uses hardcoded column names with parameterized values |
| No command injection                  | ✅ Verified      | No `exec()`, `spawn()`, `eval()`, or `new Function()` with user input                                                            |
| No XSS vectors                        | ✅ Verified      | No `innerHTML`, `dangerouslySetInnerHTML`, or `v-html` usage                                                                     |
| Input validation middleware           | ✅ Implemented   | `validate()` middleware applied to all API routes                                                                                |
| Typed error handling                  | ✅ Implemented   | Custom error classes prevent stack trace leakage                                                                                 |

### Outstanding Issues (Still Open) ⚠️

| #   | Severity | Issue                                | Status                                                                 |
| --- | -------- | ------------------------------------ | ---------------------------------------------------------------------- |
| 1   | High     | `/api/analyze` unauthenticated       | **OPEN** - No API key/OAuth protection                                 |
| 2   | High     | GitHub API routes unauthenticated    | **OPEN** - `/api/github/comment`, `/api/github/annotations` lack auth  |
| 3   | High     | Plaintext Slack tokens in DB         | **OPEN** - `slack_bot_token` stored as TEXT without encryption         |
| 4   | High     | Slack HTTP API unauthenticated       | **OPEN** - `/slack/message`, `/slack/broadcast` accept arbitrary POSTs |
| 5   | High     | RAG endpoints unauthenticated        | **OPEN** - `/api/rag/ingest`, `/api/rag/search`, etc. lack auth        |
| 6   | High     | Cross-tenant RAG leakage             | **OPEN** - `tenantId` optional in searches, derived from user input    |
| 7   | Medium   | Raw body logging before redaction    | **OPEN** - `analysisRoutes.ts:41-44` logs raw body preview             |
| 8   | Medium   | OAuth state in memory                | **OPEN** - Not using Redis for multi-instance deployments              |
| 9   | Medium   | Missing rate limiting on most routes | **OPEN** - Only reference-level rate limiting exists                   |
| 10  | Medium   | No CORS/Helmet security headers      | **OPEN** - No helmet or explicit CORS configuration found              |

### New Findings (2026-01-02)

#### 11. Fine-tuning Routes Unauthenticated (High)

- **Evidence**: `services/api/src/routes/fineTuningRoutes.ts` exposes 13 endpoints including dataset building, model training, and A/B test configuration without authentication.
- **Impact**: Attackers could trigger expensive fine-tuning jobs, corrupt training datasets, or manipulate model selection.
- **Remediation**: Add authentication middleware to all fine-tuning routes.

#### 12. Drift Detection Routes Unauthenticated (Medium)

- **Evidence**: `services/api/src/routes/rag/driftRoutes.ts` exposes 9 endpoints for drift detection, test case management, and model performance alerts without authentication.
- **Impact**: Attackers could manipulate drift baselines, delete test cases, or spam alert channels.
- **Remediation**: Add authentication middleware to drift detection routes.

#### 13. Cost Control Routes Expose Budget Data (Medium)

- **Evidence**: `services/api/src/routes/rag/costRoutes.ts` allows GET requests to retrieve tenant budget configurations and usage without authentication.
- **Impact**: Information disclosure of tenant usage patterns and budget configurations.
- **Remediation**: Require authentication and verify caller has access to requested tenant.

#### 14. Purge Routes Without Authorization (High)

- **Evidence**: `services/api/src/routes/rag/purgeRoutes.ts` exposes DELETE endpoints for purging diff chunks, knowledge documents, and tenant data without authentication.
- **Impact**: Attackers could delete critical knowledge base content, causing service degradation.
- **Remediation**: Require authentication and admin-level authorization for purge operations.

#### 15. Feedback Routes May Leak PR Data (Low)

- **Evidence**: `services/github-app/src/routes/feedbackRoutes.ts` exposes GET endpoint for feedback data which may contain PR context.
- **Impact**: Minor information disclosure of repository names and PR numbers.
- **Remediation**: Add authentication to feedback routes.

## Positive Security Patterns Observed

1. **Webhook Verification**: Both GitHub and Slack webhooks are properly verified using HMAC signatures.
2. **Parameterized SQL**: All database queries use parameterized statements; no string interpolation with user input.
3. **Input Validation**: All routes use the `validate()` middleware with schema-based validation.
4. **Error Handling**: Custom error classes (`AppError`, `ValidationError`, etc.) prevent stack trace leakage.
5. **Secret Redaction**: Comprehensive secret redaction utilities are available and used in RAG ingestion.
6. **No Dangerous Patterns**: No `eval()`, command injection, or XSS vectors detected.
7. **Environment Variable Validation**: Config validates required env vars at startup with `requireEnv()`.

## Security Remediation Roadmap

### Phase 1: Critical Authentication & Data Protection

**Objective**: Block unauthorized access to all API endpoints and protect sensitive data at rest.

**Priority**: P0 - Must complete before any production deployment with external tenants.

| Task                                            | Issue(s) Addressed           | Deliverables                                 | Acceptance Criteria                                  |
| ----------------------------------------------- | ---------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| 1.1 Implement API authentication middleware     | #1, #2, #4, #5, #9, #11, #14 | `authMiddleware.ts` in `@kenchi/shared`      | All non-webhook routes require valid API key or JWT  |
| 1.2 Add service-to-service authentication       | #2, #4                       | Internal service tokens with HMAC signing    | GitHub-app ↔ Slack-bot ↔ API calls authenticated     |
| 1.3 Encrypt Slack tokens at rest                | #3                           | KMS integration, migration script            | Tokens encrypted with AES-256-GCM, keys in Vault/KMS |
| 1.4 Enforce tenant isolation in RAG             | #6, #10                      | Mandatory `tenantId` in all search functions | Cross-tenant queries return 0 results (tested)       |
| 1.5 Add admin authorization for destructive ops | #14                          | Role-based access control for purge routes   | Only admin-scoped tokens can delete data             |

**Definition of Done**:

- [ ] All API routes return 401 without valid authentication
- [ ] Slack tokens encrypted in database, decrypted only at runtime
- [ ] Integration tests verify tenant isolation
- [ ] Security review sign-off on auth implementation

---

### Phase 2: Defense in Depth & Hardening

**Objective**: Add security headers, rate limiting, and eliminate information leakage.

**Priority**: P1 - Complete within 30 days of Phase 1.

| Task                                   | Issue(s) Addressed | Deliverables                              | Acceptance Criteria                                    |
| -------------------------------------- | ------------------ | ----------------------------------------- | ------------------------------------------------------ |
| 2.1 Add Helmet middleware              | #10                | Security headers on all Express apps      | CSP, HSTS, X-Frame-Options, X-Content-Type-Options set |
| 2.2 Configure CORS                     | #10                | Explicit origin allowlist                 | Only known frontend/service origins allowed            |
| 2.3 Implement per-tenant rate limiting | #9                 | Redis-backed rate limiter                 | 100 req/min default, configurable per tenant           |
| 2.4 Remove raw body logging            | #6, #7             | Redact before logging or remove entirely  | No secrets in application logs                         |
| 2.5 Move OAuth state to Redis          | #7                 | Redis state store with TTL                | OAuth works across multiple instances                  |
| 2.6 Parameterize all SQL queries       | #8                 | Audit and fix any remaining interpolation | All dynamic values use `$N` placeholders               |

**Definition of Done**:

- [ ] Security headers present on all responses (verified with securityheaders.com)
- [ ] Rate limiting enforced, returns 429 on excess
- [ ] Log audit confirms no secrets in INFO-level logs
- [ ] OAuth tested in multi-instance deployment

---

### Phase 3: Monitoring, Testing & Compliance

**Objective**: Establish ongoing security monitoring and automated testing.

**Priority**: P2 - Complete within 60 days of Phase 1.

| Task                                  | Issue(s) Addressed | Deliverables                                   | Acceptance Criteria                         |
| ------------------------------------- | ------------------ | ---------------------------------------------- | ------------------------------------------- |
| 3.1 Security integration tests        | All                | Test suite for auth enforcement                | CI fails if unauthenticated access succeeds |
| 3.2 Dependency vulnerability scanning | N/A                | npm audit / Snyk integration in CI             | Build fails on high/critical CVEs           |
| 3.3 Audit logging                     | #5, #9, #14        | Structured audit logs for sensitive operations | Who did what, when, from where - queryable  |
| 3.4 Alerting for security events      | All                | PagerDuty/Slack alerts for auth failures       | >10 auth failures/min triggers alert        |
| 3.5 Penetration testing               | All                | Third-party pentest report                     | No critical/high findings, mediums triaged  |

**Definition of Done**:

- [ ] Security tests run on every PR
- [ ] Dependency scanning blocks vulnerable packages
- [ ] Audit logs retained for 90 days minimum
- [ ] Pentest completed with remediation plan

---

### Phase 4: Advanced Security & Compliance

**Objective**: Prepare for enterprise customers and compliance certifications.

**Priority**: P3 - Plan for Q2 2026.

| Task                                        | Deliverables                                | Notes                               |
| ------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| 4.1 SOC 2 Type II preparation               | Controls documentation, evidence collection | Requires 6-month observation period |
| 4.2 Customer-managed encryption keys (CMEK) | KMS integration for tenant-provided keys    | Enterprise feature                  |
| 4.3 IP allowlisting per tenant              | Network-level access controls               | Enterprise feature                  |
| 4.4 Data residency controls                 | Region-specific deployments                 | EU customers requirement            |
| 4.5 Security questionnaire automation       | Pre-filled responses for common frameworks  | Sales enablement                    |

---

## Issue Tracking Matrix

| Issue # | Severity | Phase    | Status  | Ticket |
| ------- | -------- | -------- | ------- | ------ |
| 1       | High     | 1.1      | 🔴 Open |        |
| 2       | High     | 1.1, 1.2 | 🔴 Open |        |
| 3       | High     | 1.3      | 🔴 Open |        |
| 4       | High     | 1.1, 1.2 | 🔴 Open |        |
| 5       | High     | 1.1      | 🔴 Open |        |
| 6       | High     | 1.4      | 🔴 Open |        |
| 7       | Medium   | 2.4, 2.5 | 🟡 Open |        |
| 8       | Medium   | 2.6      | 🟡 Open |        |
| 9       | High     | 1.1      | 🔴 Open |        |
| 10      | High     | 1.4      | 🔴 Open |        |
| 11      | High     | 1.1      | 🔴 Open |        |
| 12      | Medium   | 1.1      | 🟡 Open |        |
| 13      | Medium   | 1.1      | 🟡 Open |        |
| 14      | High     | 1.5      | 🔴 Open |        |
| 15      | Low      | 1.1      | 🟢 Open |        |

**Legend**: 🔴 High Priority | 🟡 Medium Priority | 🟢 Low Priority

---

## Appendix: Security Controls Checklist

### Authentication & Authorization

- [ ] API key authentication for external callers
- [ ] JWT/OAuth for user-facing endpoints
- [ ] Service-to-service mTLS or signed tokens
- [ ] Role-based access control (RBAC)
- [ ] Tenant isolation enforced at data layer

### Data Protection

- [ ] Secrets encrypted at rest (AES-256-GCM)
- [ ] Secrets encrypted in transit (TLS 1.3)
- [ ] PII redaction in logs
- [ ] Backup encryption enabled

### Infrastructure

- [ ] Security headers (Helmet)
- [ ] CORS configured
- [ ] Rate limiting enabled
- [ ] DDoS protection (WAF/CDN)
- [ ] Network segmentation

### Monitoring & Response

- [ ] Audit logging enabled
- [ ] Security alerting configured
- [ ] Incident response runbook documented
- [ ] Regular security reviews scheduled

---

Track each remediation via issue/ticket referencing this document so progress is visible and auditable.
