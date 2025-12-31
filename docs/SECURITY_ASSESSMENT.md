# Security Assessment – Kenchi Monorepo

Date: 2025-02-15  
Assessed By: Security review via repo inspection (docs, services/api, services/github-app, packages/shared)

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

## Next Steps

1. **Prioritize remediation** of high-severity items (auth for APIs, token encryption) before onboarding new tenants.
2. **Implement security tests** (integration tests hitting endpoints without auth) as part of CI.
3. **Update documentation** (RUNBOOKs, README) to reflect new auth requirements and secret-handling policies.
4. **Plan recurring reviews** (quarterly) to ensure new code paths follow the same security baseline.

Track each remediation via issue/ticket referencing this document so progress is visible and auditable.
