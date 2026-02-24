# Multi-Tenant Architecture Audit Report

**Date**: 2026-02-24
**Scope**: Full codebase audit across data isolation, authentication/authorization, and operational readiness
**Methodology**: Static analysis of all repositories, routes, middleware, workers, migrations, and service code
**Reference Architecture**: Production patterns from Stripe, GitHub, Datadog, Google Zanzibar, Cloudflare, Nile, and Supabase

---

## Executive Summary

Kenchi implements a shared-database multi-tenant architecture where `tenant_id` scopes all data. The system has **strong fundamentals** — JWT-based auth with tenant claims, parameterized queries, middleware-enforced isolation, and encrypted token storage. However, the audit identified **4 critical vulnerabilities**, **16 high-priority gaps**, and **26 medium-priority improvements** needed to reach world-class production SaaS standards. This includes findings across the full stack — backend services, database layer, and frontend application.

**The core principle from Stripe, GitHub, and Datadog**: tenant isolation must be an **architectural invariant enforced at every layer**, so that the inevitable application-level bugs never result in cross-tenant data exposure. A single bug in any one layer cannot cause cross-tenant data leakage.

### Risk Matrix

| Severity     | Count | Summary                                                                                                                                                                                                   |
| ------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | 4     | Cross-tenant data access via unvalidated tenant IDs, wrong provider in tenant creation                                                                                                                    |
| **High**     | 16    | JWT role vs per-tenant role mismatch, no provider membership revocation, no plan limit on team size, suspended tenants not blocked, noisy neighbor risk, token refresh missing, no frontend feature gates |
| **Medium**   | 26    | Missing data export, no invitation system, team audit log gaps, webhook replay gaps, provider parity gaps, no tenant suspension UI, no usage warnings, no PKCE client-side                                |
| **Low**      | 8     | Per-tenant encryption keys, scope validation, admin override undocumented, no 403 error logging                                                                                                           |

---

## Table of Contents

1. [Critical Vulnerabilities](#1-critical-vulnerabilities)
2. [Data Isolation](#2-data-isolation)
3. [Authentication & Token Security](#3-authentication--token-security)
4. [Authorization & RBAC](#4-authorization--rbac)
5. [Tenant Lifecycle Management](#5-tenant-lifecycle-management)
6. [Subscription & Billing](#6-subscription--billing)
7. [Rate Limiting & Performance Isolation](#7-rate-limiting--performance-isolation)
8. [Compliance & Data Governance](#8-compliance--data-governance)
9. [Observability](#9-observability)
10. [Multi-Provider OAuth & Tenant Creation](#10-multi-provider-oauth--tenant-creation)
11. [Team Management & Member Lifecycle](#11-team-management--member-lifecycle)
12. [Frontend Multi-Tenancy](#12-frontend-multi-tenancy)
13. [Webhook Security](#13-webhook-security)
14. [Prioritized Remediation Plan](#14-prioritized-remediation-plan)
15. [What World-Class Looks Like](#15-what-world-class-looks-like)

---

## 1. Critical Vulnerabilities

### CRIT-1: Fine-Tuning Routes Accept Arbitrary Tenant ID

**File**: `services/api/src/routes/fineTuningDatasetRoutes.ts:91`

```typescript
const tenantId = req.query.tenantId as string | undefined;
const stats = await getFineTuningStats(tenantId);
```

**Impact**: Any authenticated user can request fine-tuning stats for ANY tenant by passing `?tenantId=OTHER_TENANT`. No validation against `req.user?.tenantId`.

**Affected Endpoints**:

- `GET /api/fine-tuning/dataset/stats?tenantId=<any>`
- `POST /api/fine-tuning/dataset/extract` (body.tenantId)

**Fix**: Replace with `req.user?.tenantId` or validate against auth context.

---

### CRIT-2: Risk Rules Routes Accept Arbitrary Tenant ID

**File**: `services/api/src/routes/riskRulesRoutes.ts:67`

```typescript
const tenantId = req.body?.tenantId ?? req.query?.tenantId;
```

**Impact**: Full CRUD on risk rules for any tenant. User can create, read, update, and delete rules belonging to other organizations.

**Affected Endpoints**:

- `POST /api/v1/risk-rules/create`
- `GET /api/v1/risk-rules/:id`
- `PUT /api/v1/risk-rules/:id`
- `DELETE /api/v1/risk-rules/:id`
- `POST /api/v1/risk-rules/query`

**Fix**: Validate `tenantId` from request body/query against `req.user?.tenantId`. Reject mismatches with 403.

---

### CRIT-3: Direct ID Queries Without Database-Level Tenant Filter

**Files**: Multiple repository constants across `packages/shared/src/constants/`

Several `GET_BY_ID` queries lack `tenant_id` in the WHERE clause:

| Query                                                 | Table            | Current Mitigation                             |
| ----------------------------------------------------- | ---------------- | ---------------------------------------------- |
| `SELECT * FROM analyses WHERE id = $1`                | analyses         | Service-layer check in dashboardServiceHelpers |
| `SELECT * FROM incident_alerts WHERE id = $1`         | incident_alerts  | Route-level tenant check                       |
| `SELECT * FROM incident_triage_results WHERE id = $1` | triage_results   | Implicit via alert FK                          |
| `SELECT * FROM investigations WHERE id = $1`          | investigations   | Called from tenant-filtered lists              |
| `SELECT * FROM action_proposals WHERE id = $1`        | action_proposals | No direct tenant verification                  |

**Impact**: If application-layer validation is bypassed, removed, or has a bug, data from other tenants can be returned. Violates defense-in-depth.

**Fix**: Add `AND tenant_id = $2` to all direct ID lookup queries. Update all callers to pass `tenantId`.

---

### CRIT-4: Wrong Tenant Creator for Bitbucket & Azure DevOps

**File**: `services/api/src/services/authService.ts:387-389`

```typescript
const tenant =
  existingTenant ??
  (provider === "github"
    ? await createFromGitHubLogin(org.login)
    : await createFromGitLabGroup({ gitlabGroupPath: org.login }));
```

**Impact**: When a Bitbucket or Azure DevOps user logs in, their org/workspace creates a tenant with `provider="gitlab"` instead of `"bitbucket"` or `"azure_devops"`. This causes:

1. **Tenant collision**: Bitbucket workspace "acme" creates tenant `(org_name="acme", provider="gitlab")` — same as a GitLab group "acme"
2. **Lookup failure**: On next login, `findByOrgNameAndProvider("acme", "bitbucket")` returns null (tenant was stored as "gitlab")
3. **Tenant proliferation**: Each login creates a NEW duplicate tenant instead of reusing the existing one
4. **Lost org memberships**: User gets added to a new tenant each time, losing history

**Root Cause**: Only two tenant creation functions exist:

- `createFromGitHubLogin()` → `provider="github"`
- `createFromGitLabGroup()` → `provider="gitlab"`

Missing:

- `createFromBitbucketWorkspace()` → `provider="bitbucket"`
- `createFromAzureDevOpsAccount()` → `provider="azure_devops"`

---

## 2. Data Isolation

### What's Working Well

- **Parameterized queries throughout** — no SQL injection vectors found
- **All list/aggregate queries** properly scoped with `WHERE tenant_id = $1`
- **Foreign key constraints** with `ON DELETE CASCADE` for tenant-owned data
- **Composite indexes** on `(tenant_id, provider)` for efficient scoped lookups
- **Correlated subqueries** include tenant filters (e.g., analysis with event subquery)
- **No cross-tenant admin endpoints** exposed

### Gaps

| Gap                                    | Severity | Details                                                                  |
| -------------------------------------- | -------- | ------------------------------------------------------------------------ |
| Direct ID lookups without tenant WHERE | Critical | See CRIT-3 above                                                         |
| `GET_BY_EVENT_ID` query unscoped       | High     | `analyses WHERE event_id = $1` — no tenant filter, usage unclear         |
| `FIND_BY_DELIVERY_ID` unscoped         | Medium   | Used for idempotency before tenant assignment — acceptable but document  |
| No Row-Level Security (RLS)            | Medium   | PostgreSQL RLS would add database-level enforcement                      |
| Cache keys don't include tenant        | Low      | In-memory only (Map), keyed by installationId (implicitly tenant-scoped) |

### How World-Class Platforms Isolate Tenant Data

The most robust multi-tenant architectures stack **five independent layers** of isolation. A failure in any single layer cannot cause cross-tenant data leakage.

**Layer 1 — Application**: A `TenantScopedRepository` base class that mandates `tenant_id` on every query with no method to bypass it.

**Layer 2 — Database (RLS)**: PostgreSQL Row-Level Security policies filter rows even if application code omits the WHERE clause. This is the safety net used by Nile, Dovetail (5 years in production), and Supabase.

**Layer 3 — Infrastructure**: AWS Token Vending Machine pattern generating STS temporary credentials scoped to a single tenant via `aws:PrincipalTag/TenantID`.

**Layer 4 — Cache/Queue**: Tenant-prefixed cache keys (`t:{tenant_hash}:{key}`) with defensive verification that `_tenant_id` in cached data matches the requesting tenant.

**Layer 5 — Monitoring**: Per-tenant metrics, cross-tenant access attempt alerting, and Stripe's "canonical log lines" pattern where every request emits one information-dense log line.

### Reference: PostgreSQL RLS Implementation

The pattern centers on **session variables scoped to the current transaction**:

```sql
-- Tenant context function (STABLE, no row params for initPlan caching)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $
BEGIN
  RETURN NULLIF(current_setting('app.tenant_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- Secure default: deny all access
END;
$ LANGUAGE plpgsql STABLE;

-- Apply to every tenant-scoped table
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses FORCE ROW LEVEL SECURITY;  -- Even table owners obey RLS

CREATE POLICY tenant_isolation ON analyses FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
```

Each request sets tenant context via `SET LOCAL` (transaction-scoped, safe with connection pooling):

```typescript
await db.query("SET LOCAL app.tenant_id = $1", [tenantId]);
```

**Performance gotchas**:

- Direct `current_setting()` comparisons with B-tree indexes: ~0.05ms (best)
- Wrapped function calls via `(SELECT current_tenant_id())`: triggers initPlan caching (good)
- Subquery-based policies like `tenant_id = ANY(user_teams())`: per-row evaluation, can push 1M rows past **3 minutes** (avoid)
- **Superusers bypass RLS entirely** — never connect as superuser from the application
- `SECURITY DEFINER` functions execute with creator privileges and bypass RLS
- Always use `SET LOCAL` (not `SET`) to scope context to the current transaction only — prevents leakage with connection pooling

### Reference: How Stripe, GitHub, and Datadog Do It

**Stripe** built DocDB, a Database-as-a-Service on MongoDB sharded by `merchant_id`, processing **5M+ queries/sec across petabytes**. All access flows through Go proxy servers that enforce access control, admission control (per-tenant rate limiting), and query validation. Sensitive card data lives in a completely isolated PCI Vault with HSM-protected keys.

**GitHub** uses feature-based vertical partitioning with YAML "Schema Domains" grouping related tables and **custom SQL linters** in CI that detect cross-domain queries. This reduced database host load by **50%** while total QPS increased from 950K to 1.2M.

**Datadog's Husky engine** isolates each tenant's data into dedicated files — **never mixing data from different tenants in the same storage file**. Their Shard Router deterministically routes events by tenant into allocated shards.

### Reference: Static Analysis to Catch Missing tenant_id

Layer multiple approaches in CI:

1. **Semgrep rules** that match SQL queries against multi-tenant tables missing `tenant_id` filters
2. **Repository pattern** where no method exists to query without `tenant_id`
3. **Migration linters** that reject any `CREATE TABLE` without a `tenant_id` column
4. **RLS as the final catch** so that even if all linters are bypassed, the database still filters correctly

### Recommendations

1. Add `tenant_id` to ALL direct ID lookup queries (defense-in-depth)
2. Implement PostgreSQL Row-Level Security policies as Layer 2 enforcement
3. Add integration tests that explicitly attempt cross-tenant data access
4. Create a Semgrep/ESLint rule to flag SQL queries on tenant-scoped tables missing `tenant_id`
5. Add tenant-prefixed cache keys for any future Redis/distributed cache

---

## 3. Authentication & Token Security

### What's Working Well

- **JWT Access Tokens**: HS256 with 15-minute expiry, minimum 32-char secret enforced
- **Refresh Token Rotation**: Family-based reuse detection with atomic rotation (`SELECT ... FOR UPDATE`)
- **Cookie Security**: `httpOnly`, `Secure` (production), `SameSite=Lax`, `__Host-` prefix
- **OAuth State**: Cryptographically random (32 bytes), single-use, 10-minute TTL, provider-validated
- **SSRF Prevention**: Comprehensive instance URL validation blocking private IPs, metadata endpoints, IPv6 link-local
- **Provider Token Encryption**: AES-256-GCM with random IV, fail-fast if key missing in production
- **Tenant in JWT**: `tid` claim derived from server database, not client input — signature-protected

### Gaps

| Gap                          | Severity | Details                                                                  |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| No global session revocation | High     | Cannot revoke all sessions for a user or tenant at once                  |
| 15-minute suspension window  | High     | Suspended users' JWTs remain valid until natural expiry                  |
| Global HMAC secret           | Medium   | Single `INTERNAL_SERVICE_SECRET` for all service-to-service calls        |
| No HMAC tenant isolation     | Medium   | Internal services can access any tenant's data without tenant validation |
| No OAuth scope validation    | Medium   | Scopes requested but not verified on callback                            |
| Removed user 15-min window   | Medium   | User removed from org can still use JWT for up to 15 minutes             |
| No PKCE                      | Low      | Confidential client mitigates, but PKCE adds defense-in-depth            |
| No key rotation mechanism    | Low      | Single encryption key, no automated rotation                             |

### Reference: Stripe's Tiered API Key Architecture

Stripe uses **four key types** with distinct security profiles:

- **Publishable keys** (`pk_*`): client-side tokenization only
- **Secret keys** (`sk_*`): full server-side access
- **Restricted keys** (`rk_*`): per-resource read/write permission matrices across ~30 resource types, with IP allowlisting
- **Organization-level keys**: cross-account access

Stripe auto-revokes any key detected published to GitHub. For sessions, Stripe creates **single-use, short-lived tokens** scoped to specific components with quick expiry and no reuse.

### Reference: GitHub's Multi-Layered Token System

GitHub's fine-grained Personal Access Tokens offer:

- **50+ granular permissions** (no-access/read/read+write per resource)
- Mandatory expiration
- Scoping to specific repositories
- Organization owner approval requirements
- Installation tokens expire in **~1 hour** with refresh token regeneration
- Effective permissions = intersection of app permissions AND user permissions

GitHub implements aggressive automatic revocation: **secret scanning** revokes tokens pushed to public repos, tokens unused for **1 year** are automatically revoked.

### Reference: JWT Multi-Tenant Claims and Session Revocation

The recommended JWT payload for multi-tenant SaaS:

```json
{
  "sub": "user_id",
  "tid": "tenant_id",
  "oid": "org_id",
  "roles": ["admin"],
  "permissions": ["analyses.read", "analyses.write"],
  "jti": "unique-token-id",
  "exp": 1709913600
}
```

**Per-tenant signing keys** offer highest isolation: each tenant gets a unique JWT signing secret, with the `kid` header identifying which key to validate against.

**Real-time session revocation** (production-proven pattern): short-lived access tokens (15 min) + Redis blacklist for the `jti` of revoked tokens (TTL = remaining token lifetime, auto-cleanup) + refresh token rotation where a new refresh token is issued on each use and the old one is immediately invalidated. On Redis failure, **fail open** (Stripe's principle) — the 15-minute token expiry provides the upper bound on exposure.

### Reference: PKCE Is Now Mandatory (RFC 9700)

As of January 2025, **PKCE is required for all OAuth clients** per RFC 9700. Always use S256 (never `plain`). In multi-tenant contexts, encode `tenant_id` in the encrypted `state` parameter with a 5-minute TTL, and validate that the ID token's `tenant_id` matches the state's `tenant_id` on callback.

### Reference: Key Rotation and Service-to-Service Auth

Stripe generates **unique endpoint secrets** (`whsec_*`) for each webhook endpoint — compromise of one doesn't affect others. The canonical HMAC string includes `method + host + path + timestamp + body_hash`, preventing destination replay attacks. During rotation, support **dual-key validation**: verify against both current and previous secrets, accepting either.

For encryption key rotation: AWS KMS automatic rotation retains old key material for decryption (no re-encryption needed). Cost is **$1/month per key**. Use one key per tenant with encryption context for isolation.

### Recommendations

1. **Add real-time user/tenant status check** in auth middleware (check DB every N requests or use a short-lived cache)
2. **Add admin endpoint** `POST /api/v1/admin/users/:userId/sessions/revoke-all` with Redis blacklist for `jti`
3. **Migrate to per-service HMAC secrets** (e.g., `GITHUB_APP_SERVICE_SECRET`) following Stripe's per-endpoint secret pattern
4. **Reduce JWT expiry to 5 minutes** if real-time suspension is critical
5. **Add OAuth scope validation** on callback — verify returned scopes match requirements
6. **Implement PKCE** for all OAuth flows (mandatory per RFC 9700)
7. **Plan per-tenant JWT signing keys** for enterprise tier (highest isolation)

---

## 4. Authorization & RBAC

### What's Working Well

- **Role definitions**: `owner`, `admin`, `member`, `viewer`
- **`requireRole()` middleware** enforced on sensitive endpoints (subscriptions, fine-tuning, RAG)
- **`requireTenantMatch()` middleware** blocks cross-tenant access for non-admins
- **`getEffectiveTenantId()`** allows admin override with audit logging
- **Organization switch** validates membership before issuing new JWT

### Critical Gap: Global vs Per-Tenant Roles

**Problem**: User roles are stored globally in `users.role`, not per-tenant in `user_organizations.role`.

```
users table:        role = "admin"     ← Global role
user_organizations: role = "admin"     ← Per-tenant role (EXISTS but NOT USED in auth checks)
```

**Impact**: A user who is `admin` in Tenant A is also `admin` in Tenant B. The `user_organizations.role` column exists in the database but is **never checked by `requireRole()` middleware** — it reads from `req.user.role` which comes from the JWT, which comes from `users.role`.

**World-class standard**: Roles must be per-tenant. A user can be `owner` of their startup's tenant and `viewer` of their enterprise client's tenant.

### Other Gaps

| Gap                           | Severity | Details                                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Per-tenant roles not enforced | High     | `user_organizations.role` exists but unused in authorization                          |
| No permission model           | Medium   | Only role-based, no fine-grained permissions (e.g., "can delete analyses")            |
| Viewer can trigger org switch | Low      | Viewers can switch orgs (correct for auth, but no read-only enforcement at API level) |
| No role for API keys          | Low      | No service account / API key roles defined                                            |

### Reference: How Stripe, GitHub, and Datadog Model Roles

**Stripe** uses flat RBAC with **7 account-level roles** (Owner, Administrator, Developer, Analyst, Support Specialist, View Only, sandbox roles) and organization-level roles that **automatically cascade to all accounts**. Permissions are additive — multiple roles yield the union. Restricted API keys extend this with per-resource permission matrix (None/Read/Write across ~30 resource types).

**GitHub** implements a four-tier hierarchy: Enterprise → Organization → Team → Repository. Organizations have 7 pre-defined roles and repositories have 5 roles. **Custom repository roles** (Enterprise Cloud) build on an inherited base role with **40+ fine-grained permissions** like `close_issue`, `jump_merge_queue`, `delete_wiki_page`.

**Datadog** layers three levels: managed roles, custom roles with hundreds of individual permissions, and **granular per-resource access**. Their most powerful feature is **Restricted Datasets** — query-based restrictions using tag filters (e.g., `team:acme`) that limit which data a role can see. Users without access see blank graphs; data appears as though it doesn't exist.

### Reference: The Universal Pattern — Check Permissions, Never Roles

The critical implementation principle: **always check permissions in application code, never roles directly**. `if user.has_permission("projects.delete")` decouples code from role definitions, enabling custom roles per tenant.

Recommended data model for KenchiOps:

```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,  -- e.g., "analyses.read", "analyses.delete"
  description TEXT
);

CREATE TABLE roles (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  is_system BOOLEAN DEFAULT FALSE  -- system roles can't be deleted
);

CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tenant_id, role_id)
);
```

### Reference: API Keys Need Scoped Permissions From Day One

Follow Stripe's restricted key pattern:

- Each API key stores a JSON permissions matrix mapping resource types to access levels
- Store only the **bcrypt/argon2 hash** of the key, never the plaintext
- Use prefixes for identification (`ko_live_`, `ko_test_`)
- Support IP allowlisting and expiration dates
- Track `last_used_at` for security auditing

### Reference: Google Zanzibar for Relationship-Based Access Control

When KenchiOps needs per-object permissions (e.g., "this user can view this specific pipeline"), adopt **SpiceDB or OpenFGA**:

```
definition project {
  relation org: organization
  relation lead: user
  relation contributor: user | organization#member
  permission edit = lead + contributor + org->admin
  permission view = contributor + org->view
}
```

SpiceDB handles **billions of relationships** with ~5ms p95 latency. Use Zanzibar-style ReBAC when you need per-object permissions or hierarchical inheritance. Stick with traditional RBAC for admin panels and billing.

### Recommendations

1. **Migrate JWT `role` claim** to use `user_organizations.role` for the selected tenant
2. **Update `generateAccessToken()`** to embed per-tenant role from `user_organizations`
3. **Add permission layer** — check permissions in code, not roles. Store role-to-permission mappings in DB
4. **Implement API key authentication** with scoped permissions (`ko_live_` prefix, bcrypt-hashed, IP allowlisting)
5. **Plan SpiceDB/OpenFGA adoption** when per-object access control is needed

---

## 5. Tenant Lifecycle Management

### What's Working Well

- **Multiple creation paths**: GitHub App install, GitHub OAuth, GitLab OAuth, Slack install
- **Transactional creation**: Tenant + audit log in single transaction
- **Soft + hard delete**: Both available with appropriate cascade rules
- **Audit logging**: All lifecycle events logged with actor and metadata

### Gaps

| Gap                             | Severity | Details                                                                                              |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Suspended tenants not blocked   | **High** | No middleware checks tenant status — suspended tenants can still make API calls and receive webhooks |
| No data export (GDPR)           | **High** | No endpoint for tenants to export their data (legal requirement in EU)                               |
| Orphaned data after hard delete | Medium   | `ON DELETE SET NULL` on analyses, events, slack_messages leaves rows with `tenant_id = NULL`         |
| Unused pending states           | Medium   | `pending_slack`, `pending_github` defined in schema but never set in code                            |
| No reactivation validation      | Medium   | After unsuspend, no check if tokens/connections are still valid                                      |
| No data retention policy        | Medium   | No TTL on audit logs, old analyses, or webhook activity                                              |

### Reference: The 8-State Tenant Lifecycle Model

World-class SaaS uses an explicit state machine:

```
PROVISIONING → TRIAL → ACTIVE → SUSPENDED → DEACTIVATING → SOFT_DELETED → HARD_DELETING → DELETED
```

Each state defines allowed behaviors:

| State             | Access                     | Billing         | Data                      |
| ----------------- | -------------------------- | --------------- | ------------------------- |
| **PROVISIONING**  | No user access             | None            | Infrastructure setup      |
| **TRIAL**         | Full or limited            | None            | Active                    |
| **ACTIVE**        | Full                       | Active          | Active                    |
| **SUSPENDED**     | **Read-only**              | Paused/past-due | Preserved                 |
| **DEACTIVATING**  | Continues until period end | No new charges  | No new resources          |
| **SOFT_DELETED**  | **None**                   | None            | Preserved 30-90 day grace |
| **HARD_DELETING** | None                       | None            | Async purge in progress   |
| **DELETED**       | None                       | None            | Only audit records remain |

Store all transitions in an event-sourced `tenant_status_transitions` table:

```sql
CREATE TABLE tenant_status_transitions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  triggered_by UUID REFERENCES users(id),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Stripe's capability-based model**: Rather than a single status field, each account has `charges_enabled` and `payouts_enabled` booleans with a `disabled_reason`. Stripe disables capabilities on accounts inactive for **540 days**.

### Reference: Two-Phase Deletion With Crypto-Shredding

**Phase 1 (immediate)**: Set `deletion_requested_at` and `status = 'soft_deleted'`, suppress all reads (data returns 404 instantly).

**Phase 2 (after 30-90 day grace period)**: Cascading hard deletion in dependency order (leaf tables first, tenant record last), followed by blob storage prefix deletion, search index purging, cache invalidation, and external service cleanup (Stripe customer, auth provider). Generate a **deletion certificate** for compliance.

**For backup data**: Use **crypto-shredding** — encrypt each tenant's PII with a unique per-tenant DEK wrapped by a KEK. On deletion, destroy the DEK in KMS. Encrypted data in backups becomes indecipherable. Maintain a `deletion_ledger` that replays after any disaster recovery restore.

### Reference: Reactivation Requires Schema Drift Validation

When reactivating from suspension, validate in order:

1. Billing (valid payment method, resolve outstanding invoices)
2. Data integrity (verify database/schema/storage exists)
3. **Schema migrations** (run any migrations deployed during suspension)
4. Search reindexing
5. Cache warming
6. Feature flag restoration
7. API key re-enablement (re-enable existing keys, don't force regeneration)

### Recommendations

1. **Add tenant status middleware** — reject requests from `SUSPENDED`/`DELETED` tenants with 403
2. **Implement data export endpoint** `GET /api/v1/tenant/export` (async for large datasets)
3. **Change FK rules** to `ON DELETE CASCADE` for analyses/events, or implement cleanup job
4. **Implement the 8-state lifecycle** with event-sourced transitions
5. **Add reactivation sync** — validate all provider connections and schema on unsuspend
6. **Implement retention policies** — configurable per-tenant, with automated cleanup
7. **Plan crypto-shredding** for backup data compliance

---

## 6. Subscription & Billing

### What's Working Well

- **Four plan tiers** with clear limits (free, pro, team, enterprise)
- **`enforcePlanLimit()`** at API route level with descriptive error responses
- **Per-tenant usage tracking** for repositories, analyses, integrations, team members
- **Real-time repo count** from GitHub/GitLab APIs (not just DB count)
- **Plan change audit logging** with actor tracking

### Gaps

| Gap                             | Severity | Details                                                                               |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| No limit enforcement in workers | High     | Analysis worker doesn't call `enforcePlanLimit()` — off-by-one possible               |
| No downgrade guards             | Medium   | Can downgrade to free with 10 repos (free allows 3) — no validation or auto-reduction |
| Trial not operationalized       | Medium   | `trial_ends_at` column exists, no expiration logic or transition handling             |
| No billing integration          | Medium   | No Stripe/payment provider — plan changes are free                                    |
| No usage alerting               | Low      | No notifications when approaching limits (80%, 90%, 100%)                             |
| No metering/billing events      | Low      | No per-operation cost tracking for LLM calls                                          |

### Reference: Usage-Based Billing With Stripe Meters

Stripe's current pattern uses Meters that define aggregation rules (sum, count, last), Prices linked to Meters with tiered pricing, and MeterEvents reporting actual usage. For KenchiOps LLM cost tracking:

1. Every LLM API call includes `tenant_id`, `user_id`, `feature`, and `model` metadata
2. After each response, calculate cost from a model pricing table
3. Enqueue to an async metering pipeline
4. Batch jobs aggregate usage and report to Stripe Meters

**Pricing model options for LLM-powered features**:

- Token pass-through at markup (developer tools)
- Credit systems with prepaid draw-down (predictable budgets)
- Tiered included tokens with overage billing (hybrid SaaS)
- Outcome-based charging per document/pipeline rather than tokens (end-user products)
- Flat pricing with hard caps then throttling (consumer products)

Implement **spending thresholds** at 50%, 80%, 100% of budget with hard caps that reject LLM calls when a tenant exceeds their monthly allocation.

### Reference: Centralized EntitlementService

Create a single service enforced at **every execution path**:

```typescript
interface EntitlementService {
  hasFeature(tenantId: string, featureName: string): Promise<boolean>;
  getLimit(tenantId: string, limitName: string): Promise<number>;
  checkLimit(
    tenantId: string,
    limitName: string
  ): Promise<{ allowed: boolean; current: number; max: number }>;
}
```

Enforce at:

- **API routes**: middleware that gates features and checks limits before handlers
- **Background workers**: check entitlements before processing jobs
- **Webhooks**: validate tenant plan before creating resources from webhook payloads
- **UI**: FeatureGate components that show upgrade prompts

### Reference: Downgrade Handling

When a tenant downgrades, calculate all limit violations (current usage vs. new plan limits). Options:

- Schedule the downgrade at the end of the current billing period
- Mark excess resources as **read-only** (SwaggerHub pattern)
- Require the user to **select which resources to keep**
- Provide a **14-day grace period** to reduce usage
- Always allow abort before the effective date

### Recommendations

1. **Add limit checks in analysis worker** before processing jobs
2. **Validate on downgrade** that current usage fits new plan, or provide migration path
3. **Implement trial expiration cron** — move `trialing` → `past_due` at `trial_ends_at`
4. **Add usage threshold notifications** (approaching limit, at limit, exceeded)
5. **Integrate Stripe** for payment processing, invoice generation, webhook handling
6. **Track per-tenant LLM costs** for usage-based billing potential
7. **Build centralized EntitlementService** enforced at all layers

---

## 7. Rate Limiting & Performance Isolation

### What's Working Well

- **Hybrid rate limiting**: IP-based (100 req/min) + tenant-based (500 req/min)
- **Bot detection** with multiplicative penalty (0.5x rate for detected bots)
- **Burst detection** with rate reduction
- **Health endpoints excluded** from rate limiting

### Gaps: Rate Limiting

| Gap                             | Severity | Details                                                                          |
| ------------------------------- | -------- | -------------------------------------------------------------------------------- |
| No per-endpoint rate limits     | High     | Expensive endpoints (LLM analysis, fine-tuning) share same limit as simple reads |
| Webhooks not per-tenant limited | Medium   | Global IP limit only — no per-provider or per-installation rate limit            |
| No per-tenant API quotas        | Medium   | All tenants get same 500 req/min regardless of plan tier                         |
| SSE streams excluded            | Low      | Long-polling safety, but could be abused for connection exhaustion               |

### Gaps: Noisy Neighbor (Performance Isolation)

| Gap                              | Severity | Details                                                                          |
| -------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Shared DB connection pool        | **High** | Single pool (10 connections) for all tenants — one heavy tenant can exhaust pool |
| No per-tenant concurrency limits | **High** | Tenant can trigger unlimited concurrent LLM analyses                             |
| No fair job scheduling           | High     | FIFO queue — high-volume tenant starves others                                   |
| No per-tenant resource quotas    | Medium   | No CPU/memory/IO limits per tenant                                               |
| No circuit breaker per tenant    | Low      | One failing tenant's integrations can't be isolated                              |

### Reference: Stripe's Four-Layer Rate Limiting System

Stripe operates **four distinct limiters** in production (published by engineer Paul Tarjan with actual Redis Lua scripts):

**Layer 1 — Token Bucket Rate Limiter**: Per-account keying with `REPLENISH_RATE = 100` req/sec and `CAPACITY = 500` (5x burst). Implemented as an atomic Redis Lua script — single `EVAL` round trip. TTL is `fill_time * 2` for automatic cleanup. **Critically, the limiter fails open on Redis errors** (observed failure rate: 0.01%).

**Layer 2 — Concurrent Requests Limiter**: Redis Sorted Sets where members are random IDs and scores are timestamps. `ZADD` on entry, `ZREM` on completion, `ZCARD` to check capacity (100 concurrent), with `ZREMRANGEBYSCORE` to clean stale entries older than 60-second TTL.

**Layer 3 — Fleet Usage Load Shedder**: Same algorithm but with a **global key**. Reserves infrastructure for critical requests (creating charges) and sheds non-critical work (analytics) with 503 when fleet capacity is exceeded.

**Layer 4 — Worker Utilization Load Shedder**: Based on actual worker utilization metrics with gradual probability-based dropping. Prioritizes shedding test-mode traffic before non-critical production traffic.

### Reference: Algorithm Selection Guide

| Need                                          | Algorithm                  | Redis Cost         |
| --------------------------------------------- | -------------------------- | ------------------ |
| Simple daily/weekly quotas                    | Fixed Window Counter       | O(1), 2 commands   |
| Most API rate limiting                        | **Sliding Window Counter** | O(2), 3-4 commands |
| High-value APIs (payments, auth)              | Sliding Window Log         | O(n), sorted set   |
| APIs needing burst tolerance (CI/CD batch)    | **Token Bucket**           | O(1), 1 Lua EVAL   |
| Strict steady output (transaction processing) | Leaky Bucket               | O(1), 1 Lua EVAL   |

**For KenchiOps**: Token Bucket for API rate limiting (allows CI/CD burst patterns), Sliding Window Counter for usage quotas (accurate monthly limits).

### Reference: Fair Job Scheduling

The Sidekiq fair tenant pattern from Evil Martians: when a tenant's job count in a sliding window exceeds a threshold, subsequent jobs are re-routed to lower-priority weighted queues:

- Default queue (weight 4, 57% of workers)
- Throttled 2x queue (weight 2, 29%)
- Throttled 4x queue (weight 1, 14%)

Inngest provides this natively: `concurrency: [{ limit: 5, key: "event.data.tenant_id" }]`.

### Reference: Database Connection Management

Cloudflare's PgBouncer fork implements **runtime per-tenant connection throttling** using TCP Vegas congestion avoidance: start each tenant with a small pool, sample transaction RTT, gradually increase while RTT stays healthy (`new_limit = current_limit + sqrt(current_limit)`), back off when latency increases. This prevents database starvation proactively.

Optimal pool size formula: `(cpu_cores × 2) + effective_spindle_count`.

### Reference: Per-Tenant Circuit Breakers

Without per-tenant circuit breakers, one tenant's degraded backend opens the breaker for all tenants. The Resilience4j pattern: dynamically name circuit breakers by appending `tenant_id` (`backend-service__tenant-123`). Each tenant gets independent failure tracking. Combine with per-tenant bulkheads: `{tenant}_{service}` for both circuit breakers AND concurrency limits.

### Recommendations

1. **Tiered rate limits by plan** — free: 60 req/min, pro: 300, team: 500, enterprise: custom
2. **Per-endpoint rate limits** — stricter limits for expensive operations (analysis: 10/min, LLM: 5/min)
3. **Per-tenant concurrency cap** — max 5 concurrent analyses per tenant via semaphore
4. **Increase DB pool** to 25+ connections with per-tenant backpressure
5. **Fair queue scheduling** — weighted round-robin or per-tenant queues with priority
6. **Webhook rate limiting** — per GitHub installation / per Slack workspace
7. **Implement Token Bucket** (Layer 1) and concurrent request limiting (Layer 2) from Stripe's pattern
8. **Add per-tenant circuit breakers** for external provider integrations
9. **Fail open on Redis errors** — rate limiter unavailability should not block requests

---

## 8. Compliance & Data Governance

### What's Working Well

- **Audit log** for tenant lifecycle events (install, suspend, delete, plan change)
- **Token encryption** at rest (AES-256-GCM)
- **TLS enforcement** via security headers middleware
- **PII redaction utilities** (`redactSecrets()`, `truncate()`)
- **No PII in logs** observed in audit

### Gaps

| Gap                          | Severity | Details                                                     |
| ---------------------------- | -------- | ----------------------------------------------------------- |
| No data export/portability   | **High** | GDPR Article 20 — right to data portability not implemented |
| No right to erasure endpoint | High     | GDPR Article 17 — no self-service deletion                  |
| No consent management        | Medium   | No record of what data processing was consented to          |
| No data retention automation | Medium   | No TTL on audit logs, old analyses, or webhook logs         |
| Single encryption key        | Medium   | All tenants share one key — compromise affects all          |
| No audit for data access     | Medium   | Lifecycle logged, but not who queried what data             |
| No DPA/BAA support           | Low      | No data processing agreement infrastructure                 |

### Reference: GDPR Right to Erasure in a Shared Database

Implement a **two-phase deletion with crypto-shredding**:

**Phase 1 (immediate)**: Mark records with `deletion_status = 'pending'` and suppress all reads (data returns 404 instantly).

**Phase 2 (24-72 hours)**: Background purge job performs irreversible deletion across primary stores, caches, search indices, and derived data.

**Separate PII into a dedicated table**:

```sql
CREATE TABLE user_pii (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  email TEXT ENCRYPTED,
  display_name TEXT ENCRYPTED,
  avatar_url TEXT ENCRYPTED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

On deletion:

- DELETE from `user_pii`
- Anonymize behavioral/activity logs (replace user_id with hash, strip IP)
- Retain aggregated analytics (already non-personal)
- Retain financial records per legal obligation (document the exemption)
- Maintain a `deletion_ledger` tracking what was deleted, when, and by whom — but **never the data itself**

### Reference: GDPR Data Portability (Article 20)

Build an async export pipeline:

1. User requests export → create export job
2. Async worker scans all tables for `tenant_id + user_id`
3. Package into JSON/ZIP with manifest
4. Encrypt with user-specific key
5. Store in temporary S3 with pre-signed URL (72-hour TTL)
6. Notify user via email

### Reference: SOC 2 Type II Audit Logging

Every audit log entry must contain:

- Timestamp (UTC, NTP-synchronized)
- Actor identity (user ID, service account, IP, session ID)
- Action verb
- Resource type and ID
- Outcome (success/failure)
- Source system
- Tenant context

Log categories: authentication events, authorization changes, data modifications, configuration changes, admin actions, security events, compliance actions.

For tamper-evidence, use **immutable storage**: S3 Object Lock in COMPLIANCE mode (even root can't delete), hash-chain linking where each entry includes the hash of the previous entry, and dual export to both immutable storage and searchable storage. Retention: **minimum 12 months** hot storage for SOC 2, 3-7 years cold/archive for regulatory.

### Reference: Per-Tenant Encryption With AWS KMS

Build a three-level key hierarchy:

1. **AWS KMS Root Key (CMK)** per tenant — FIPS 140-3 HSMs
2. **Tenant KEK** managed by KMS
3. **Data Encryption Keys (DEKs)** generated per record, encrypted by KEK

Use encryption context (`tenant_id`, `service`, `environment`) that must match at both encryption and decryption — prevents cross-tenant access even if a DEK is somehow leaked.

For enterprise tenants, support **BYOK** where the customer provides their own CMK ARN and retains full control (can revoke access, disable key, audit usage via CloudTrail). Cost: **$1/month per key** with up to 100,000 keys per account per region.

### Reference: Consent Management

Store consent in an **append-only** table — never update or delete:

```sql
CREATE TABLE consent_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  purpose VARCHAR(100) NOT NULL,  -- e.g., "analytics", "marketing", "ai_training"
  action VARCHAR(20) NOT NULL,    -- "granted" or "withdrawn"
  privacy_notice_version VARCHAR(50) NOT NULL,
  privacy_notice_hash VARCHAR(64) NOT NULL,  -- content hash for proof
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Materialized view for fast runtime lookups
CREATE MATERIALIZED VIEW consent_status_current AS
SELECT DISTINCT ON (user_id, tenant_id, purpose)
  user_id, tenant_id, purpose, action, created_at
FROM consent_records
ORDER BY user_id, tenant_id, purpose, created_at DESC;
```

Withdrawal must be **as easy as granting** consent (one-click per purpose).

### Recommendations

1. **Implement data export** — `POST /api/v1/tenant/export` returning analysis history, audit logs, configurations
2. **Implement self-service deletion** — `DELETE /api/v1/tenant` with confirmation flow and 30-day grace period
3. **Separate PII into dedicated table** for targeted erasure
4. **Add data access audit logging** — log who accessed what resources (for SOC 2 Type II)
5. **Implement retention policies** — configurable per tenant, automated cleanup cron
6. **Implement per-tenant encryption** — KMS envelope encryption with three-level key hierarchy
7. **Add consent tracking** — append-only records with privacy notice versioning
8. **Plan crypto-shredding** for backup data — per-tenant DEK destruction
9. **Adopt immutable audit storage** — S3 Object Lock or equivalent

---

## 9. Observability

### What's Working Well

- **Structured logging** with `tenantId` in all request contexts
- **Provider/operation logging** on all external calls with duration metrics
- **Error classification** (retryable, non-retryable, auth_config)

### Gaps

| Gap                      | Severity | Details                                                                          |
| ------------------------ | -------- | -------------------------------------------------------------------------------- |
| No per-tenant metrics    | Medium   | Can't answer "how many analyses did tenant X run today?" without log aggregation |
| No per-tenant dashboards | Medium   | Ops can't see tenant-level health at a glance                                    |
| No tenant-level alerting | Medium   | Can't alert on "tenant X exceeded 90% of their plan limit"                       |
| No anomaly detection     | Low      | No monitoring for usage spikes, brute force, or abuse patterns                   |

### Reference: Prometheus Cardinality Is the Primary Constraint

Using `tenant_id` as a Prometheus label is inherently high-cardinality. A metric with 4 labels × 100 values each × 1,000 tenants = **400M time series**.

Mitigations:

- Never use unbounded values as labels
- Keep under 100 unique values per label
- Use **recording rules** to pre-aggregate high-cardinality queries
- Alert when any metric exceeds 10,000 series

For multi-tenant Prometheus at scale, use **Cortex** (CNCF Incubation) or **Thanos Receiver**. Cortex identifies tenants via `X-Scope-OrgID` HTTP header and supports **per-tenant limits** for ingestion rate, burst size, max series, and retention period.

### Reference: Per-Tenant Health Scoring

Compute a composite health score (0-100) from weighted metrics:

- Error rate (30%)
- p99 latency (25%)
- Availability (25%)
- Resource utilization (20%)

Each normalized against historical baselines and SLA targets. According to McKinsey research, **85% of SaaS customers show detectable usage anomalies 30-60 days before cancellation**, and companies tracking >10 health metrics show 31% better retention.

Implement multi-level usage threshold alerting at 75% (warning), 90% (approaching), 95% (critical), and 100% (exceeded) of quotas, with deduplication to avoid alert fatigue.

### Recommendations

1. **Add Prometheus metrics** tagged by `tenant_id`: `analyses_total{tenant_id}`, `api_requests{tenant_id}`, `errors{tenant_id}`
2. **Use recording rules** to pre-aggregate and manage cardinality
3. **Build tenant health dashboard** — active tenants, usage vs limits, error rates, health score
4. **Add usage threshold alerts** — 75%, 90%, 95%, 100% of plan limits
5. **Add anomaly detection** — sudden usage spikes, failed auth attempts per tenant
6. **Plan Cortex/Thanos adoption** for multi-tenant metrics at scale

---

## 10. Multi-Provider OAuth & Tenant Creation

### Provider Support Matrix

| Feature                    | GitHub                    | GitLab                    | Bitbucket                    | Azure DevOps                 |
| -------------------------- | ------------------------- | ------------------------- | ---------------------------- | ---------------------------- |
| OAuth Login                | Cloud + Self-hosted       | Cloud + Self-hosted       | Cloud only                   | Cloud only                   |
| Org/Group Discovery        | `GET /user/orgs`          | `GET /user/groups`        | `GET /workspaces`            | `GET /_apis/accounts`        |
| Token Refresh              | Not needed                | Stored but **not used**   | Stored but **not used**      | Stored but **not used**      |
| Email Verification         | `verified` flag           | `confirmed_at` field      | `is_confirmed` flag          | Always verified (Azure AD)   |
| Webhook/Installation       | App install webhook       | Not implemented           | Not implemented              | Not implemented              |
| CI Connection Setup        | Automatic (github_app)    | Manual redirect to setup  | Not implemented              | Not implemented              |
| Tenant Creator             | `createFromGitHubLogin()` | `createFromGitLabGroup()` | **BUG: uses GitLab creator** | **BUG: uses GitLab creator** |
| Provider-Scoped Lookup     | Works correctly           | Works correctly           | **Broken** (wrong provider)  | **Broken** (wrong provider)  |
| Role Mapping from Provider | Not implemented           | Not implemented           | Not implemented              | Not implemented              |

### HIGH-9: OAuth Token Refresh Not Implemented

GitLab, Bitbucket, and Azure DevOps all return refresh tokens that are stored in the database but **never used**. When access tokens expire (~1 hour), any subsequent API calls (org lookups, profile fetches) will fail with 401.

**Affected operations**:

- Auto-link organizations on login (uses stored token)
- Any future provider API integration (repo listing, CI setup)

### HIGH-10: No Webhook/Installation Support for Non-GitHub Providers

GitHub has full webhook-driven integration (app install → tenant creation → CI connection). All other providers require manual setup:

- GitLab: Redirects to `/dashboard/setup/gitlab` (partial)
- Bitbucket: No setup flow at all
- Azure DevOps: No setup flow at all

### MED-11: GitLab-Only Setup Redirect

Only GitLab checks for missing CI connection after login and redirects to setup:

```typescript
// authRoutes.ts — only for GitLab
if (oauthState.provider !== "gitlab" || !freshUser.tenantId) return null;
const existingConnection = await findByTenantAndProvider(freshUser.tenantId, "gitlab_ci");
return existingConnection ? null : "/dashboard/setup/gitlab";
```

Bitbucket and Azure DevOps users land on the default page with no guidance on CI setup.

### MED-12: No Provider Role Mapping

Provider APIs expose user roles in organizations (GitHub: admin/member, GitLab: owner/maintainer/developer/guest, Bitbucket: admin/collaborator, Azure DevOps: project admin/contributor). Kenchi ignores these:

```typescript
role: existingTenant ? "member" : "owner"; // First user = owner, all others = member
```

A user who is "admin" in their GitHub org becomes only "member" in Kenchi (unless they're the first to join).

### MED-13: Missing Bitbucket/Azure DevOps Auth Service Tests

Only GitHub and GitLab auto-linking paths are tested in `authService.test.ts`. Bitbucket and Azure DevOps auto-linking (which has the critical provider bug) has no test coverage.

---

## 11. Team Management & Member Lifecycle

### How It Works Today

Members join Kenchi **automatically via OAuth** — there is no manual invite flow. When a user logs in via GitHub/GitLab and belongs to an organization, `ensureOrgMemberships()` in `authService.ts:373-411` auto-links them to the corresponding Kenchi tenant:

```typescript
// authService.ts:393-399
await addUserOrganization({
  userId,
  tenantId: tenant.id,
  role: existingTenant ? "member" : "owner", // First user = owner, rest = member
});
```

**Available operations** (`services/api/src/routes/teamRoutes.ts`):

- `GET /api/v1/team/members` — list all members of the current tenant
- `PATCH /api/v1/team/members/:userId/role` — change a member's role (requires `admin`/`owner`)
- `DELETE /api/v1/team/members/:userId` — remove a member (requires `admin`/`owner`)

**Database schema** (`database/init/023_multi_org_membership.sql`):

```sql
user_organizations (
  user_id     VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  role        VARCHAR(50) DEFAULT 'member',
  is_default  BOOLEAN DEFAULT false,
  UNIQUE(user_id, tenant_id)
)
```

### What's Working Well

- **Tenant-scoped queries**: All repository functions (`findMembersByTenant`, `updateMemberRole`, `removeMemberFromTenant`) properly filter by `tenant_id` (`userOrganization/repository.ts:287, 332`)
- **Role hierarchy enforcement**: Cannot manage users with equal/higher role — `ROLE_WEIGHT` comparison in both backend (`teamRoutes.ts:63-65`) and frontend (`TeamManagement.tsx:77-82`)
- **Last-owner protection**: Cannot demote or remove the last owner in a tenant (`teamRoutes.ts:160-167, 240-247`)
- **Self-action prevention**: Cannot change own role or remove self (`teamRoutes.ts:136, 216`)
- **Idempotent membership**: `ON CONFLICT DO NOTHING` prevents duplicate user-org records (`addUserOrganization`)
- **Email linking security**: Only verified emails used for account linking (`authService.ts:113`) — prevents account takeover via unverified email spoofing
- **Organization switch validation**: User must be a member of target org before switching (`organizationRoutes.ts:92-100`)

### Gaps

| Gap                                                | Severity | Details                                                                                                                                                         |
| -------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT role vs per-tenant role mismatch               | **High** | `requireRole()` checks global `req.user.role` from JWT, not per-tenant `user_organizations.role`. User with "admin" in Tenant A retains admin power in Tenant B |
| No provider membership revocation                  | **High** | User removed from GitHub/GitLab org retains Kenchi access indefinitely — no webhook or periodic check to detect provider-side removal                           |
| No plan limit enforcement on team size             | **High** | `teamRoutes.ts` never calls `enforcePlanLimit()` — free plan (1 member) tenant can have unlimited members via auto-linking                                      |
| No invitation system                               | Medium   | Users can only join via OAuth auto-linking — no email invite for users who haven't logged in yet                                                                |
| Team changes not in audit log                      | Medium   | Role changes and removals are logged to structured logger but not written to `tenant_audit_log` table (which exists but is unused for team events)              |
| No org switch tenant status check                  | Medium   | `handleSwitchOrganization()` validates membership but not whether target tenant is suspended (`organizationRoutes.ts:92-100`)                                   |
| No frontend plan limit display                     | Medium   | `TeamManagement.tsx` doesn't show "X/Y members" gauge or disable actions when at plan limit                                                                     |
| `getEffectiveTenantId` admin override undocumented | Low      | Admins/owners can override tenant context (`tenantGuard.ts:53-63`) — this bypass should be audit-logged                                                         |

### HIGH-11: JWT Role vs Per-Tenant Role Mismatch

**File**: `packages/shared/src/http/authorizationMiddleware.ts:41`

```typescript
// Current: checks GLOBAL role from JWT
if (!allowedRoles.includes(user.role)) {
  throw new AuthorizationError("Insufficient permissions");
}
```

**Impact**: The JWT `role` claim comes from `users.role` (global), not `user_organizations.role` (per-tenant). A user who is `admin` in Tenant A and `member` in Tenant B can perform admin actions in Tenant B because the JWT still contains `role: "admin"`.

**Affected endpoints**: All routes using `requireRole()` — team management, subscription changes, fine-tuning, RAG operations.

**Fix**: `generateAccessToken()` must embed the per-tenant role from `user_organizations.role` for the selected tenant. `requireRole()` must check this tenant-scoped role.

### HIGH-12: No Provider Membership Revocation Detection

**File**: `services/api/src/services/authService.ts:373-411`

When a user is removed from a GitHub organization, Kenchi has **no mechanism to detect this**:

1. **No webhook listener**: GitHub sends `organization.member_removed` events, but Kenchi doesn't subscribe to them
2. **No periodic check**: No cron job re-validates provider org membership
3. **No login-time revocation**: `ensureOrgMemberships()` adds new memberships but **never removes stale ones**

**Impact**: A user removed from a GitHub org retains full Kenchi access to that tenant's data until manually removed by an admin.

**Fix options**:

1. **Webhook-driven** (recommended): Listen for `organization.member_removed` GitHub webhook → auto-remove from Kenchi tenant
2. **Login-time reconciliation**: On each login, compare current provider orgs against Kenchi memberships — remove stale ones
3. **Periodic sync**: Cron job that re-fetches org membership for all users and reconciles

### HIGH-13: No Plan Limit Enforcement on Team Size

**File**: `services/api/src/routes/teamRoutes.ts`

Plan defines `max_team_members` per tier (Free: 1, Pro: 10, Team: 50, Enterprise: unlimited), but team routes **never check this limit**. Members are auto-added during OAuth without any plan validation.

**Impact**: A free-tier tenant can accumulate unlimited team members through OAuth auto-linking.

**Fix**: Add `enforcePlanLimit(tenantId, "max_team_members")` check in `ensureOrgMemberships()` before `addUserOrganization()`. Return appropriate error if limit exceeded (but don't block login itself — just skip the auto-linking and notify the user).

### Reference: How Stripe, GitHub, and Datadog Handle Team Management

**Stripe** implements organization membership with explicit roles at both org and account levels. Roles cascade from org to accounts, but can be restricted per account. Team members are **explicitly invited** — no auto-linking. Stripe enforces **seat-based pricing** where adding a team member requires an active subscription with available seats.

**GitHub** has four membership states: **active**, **pending** (invited but not accepted), **suspended** (Enterprise only), and **removed**. Organization owners can configure whether members must have 2FA enabled. GitHub fires `organization.member_added`, `organization.member_removed`, and `organization.member_invited` webhooks. **SAML-linked members** are automatically deprovisioned when removed from the IdP.

**Datadog** uses a **Team** abstraction within organizations. Users belong to one or more Teams, each with its own role. Team membership can be managed via SCIM provisioning (automated from IdP) or manual invite. Datadog enforces **license counts** — adding a user beyond the license cap requires purchasing additional licenses.

### Reference: Invitation System Design

World-class SaaS supports both auto-linking AND explicit invitations:

```sql
CREATE TABLE team_invitations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES users(id),
  token VARCHAR(255) NOT NULL UNIQUE,  -- Cryptographically random
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, accepted, expired, revoked
  expires_at TIMESTAMPTZ NOT NULL,  -- 7-day default
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)  -- One active invite per email per tenant
);
```

Flow:

1. Admin invites `user@example.com` with role `member` → generates signed invite link
2. User clicks link → redirected to OAuth login
3. After OAuth, system checks for pending invitation matching their verified email
4. If found: auto-link to tenant with invited role, mark invitation as accepted
5. If not found: normal auto-linking flow via provider org membership

### Reference: Provider Membership Reconciliation

The recommended pattern combines webhook-driven removal with periodic validation:

```typescript
// Webhook handler for organization.member_removed
const handleOrgMemberRemoved = async (payload: WebhookPayload, context: RequestContext) => {
  const { membership, organization } = payload;
  const tenant = await findByOrgNameAndProvider(organization.login, "github");
  if (!tenant) return;

  const user = await findByProviderUserId("github", membership.user.id);
  if (!user) return;

  await removeMemberFromTenant(tenant.id, user.id);
  logger.info("Auto-removed user from tenant (provider org removal)", {
    userId: user.id,
    tenantId: tenant.id,
    provider: "github",
    ...context,
  });
};

// Periodic reconciliation cron (weekly)
const reconcileProviderMemberships = async () => {
  const tenants = await findAllActiveTenantsWithProvider("github");
  for (const tenant of tenants) {
    const providerMembers = await fetchOrgMembers(tenant.providerOrgId);
    const kenchiMembers = await findMembersByTenant(tenant.id);
    const staleMembers = kenchiMembers.filter(
      (m) => !providerMembers.some((pm) => pm.id === m.providerUserId)
    );
    // Flag stale members for admin review (don't auto-remove on cron — too risky)
  }
};
```

### Recommendations

1. **Fix JWT role to use per-tenant role** from `user_organizations.role` — this is the single most impactful fix for team management security
2. **Add provider membership revocation webhook** — listen for `organization.member_removed` events from GitHub/GitLab
3. **Enforce plan limits on team size** — check `max_team_members` in `ensureOrgMemberships()` before auto-linking
4. **Add team changes to tenant audit log** — write role changes and removals to `tenant_audit_log` table
5. **Check tenant suspension on org switch** — reject switch to suspended tenant with clear error
6. **Add invitation system** — email-based invites with cryptographic tokens, 7-day expiry, role pre-assignment
7. **Add login-time reconciliation** — compare provider org membership against Kenchi membership, flag stale entries
8. **Show team member usage on frontend** — "X/Y members" gauge on TeamManagement page with plan upgrade CTA

---

## 12. Frontend Multi-Tenancy

### What's Working Well

- **httpOnly cookie storage**: JWTs stored in `httpOnly`, `Secure`, `SameSite=Lax` cookies with `__Host-` prefix — prevents XSS token theft (`apiClient.ts`)
- **Single-flight token refresh**: On 401, `attemptTokenRefresh()` coordinates concurrent requests through a shared Promise — prevents thundering herd (`apiClient.ts:31-72`)
- **Organization switcher**: Full multi-org support with fuzzy search Command palette, proper data refresh on switch via `refreshUser()` (`OrganizationSwitcher.tsx`, `useAuth.tsx:195-206`)
- **Plan limit enforcement**: `usePlanLimitError` hook detects 403 `PLAN_LIMIT_EXCEEDED` responses and shows `UpgradePrompt` dialog with usage bars and upgrade path (`usePlanLimitError.ts`, `UpgradePrompt.tsx`)
- **Open redirect protection**: OAuth callback validates `redirect_after` — only allows paths starting with `/` that don't contain `://` (`AuthCallback.tsx:20-21`)
- **No shared global state**: Each hook fetches independently via TanStack Query; no cross-tenant cache leakage risk
- **SessionStorage isolation**: Only stores notifications (per-session, cleared on logout) — no tenant data persisted client-side

### Gaps

| Gap                               | Severity | Details                                                                                                                                          |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explicit tenantId in query params | **High** | `useIncidentData.ts` passes `?tenantId=${tenantId}` — if backend doesn't validate JWT tenantId against query param, cross-tenant access possible |
| No FeatureGate component          | High     | UI doesn't defensively hide features by plan or role — trusts backend to reject                                                                  |
| No permission-based UI checks     | High     | `TeamManagement.tsx` checks roles directly (`currentUserRole === "admin"`) instead of permissions                                                |
| No tenant suspension UI           | Medium   | When tenant is suspended, no route guard or banner — users see generic errors                                                                    |
| No proactive usage warnings       | Medium   | `useSubscription.ts` fetches usage but no alerts at 75%/90%/95% — only at 100%                                                                   |
| No PKCE client-side               | Medium   | `Login.tsx` doesn't generate `code_verifier`/`code_challenge` — PKCE handled entirely server-side (if at all)                                    |
| No API client timeout             | Medium   | `apiClient.ts` has no explicit timeout — uses browser default (~90s), should enforce 30s                                                         |
| Inconsistent tenant scoping       | Medium   | Some APIs use JWT (`/api/v1/dashboard/*`), others use explicit query params (`/api/v1/incidents?tenantId=`)                                      |
| No 403 error logging              | Low      | Plan limit errors not logged client-side — missed product insights                                                                               |

### Critical Issue: Explicit tenantId in Query Params

**Files**: `services/frontend/src/hooks/useIncidentData.ts`

```typescript
// These pass tenantId as a query param instead of relying on JWT
`/api/v1/incidents?tenantId=${tenantId}``/api/v1/triage/stats?tenantId=${tenantId}`;
```

**Risk**: This mirrors CRIT-1/CRIT-2 on the backend — if the API routes trust the query param over the JWT, a user could request another tenant's incident data by manipulating the URL.

**Fix**: Remove `tenantId` from all frontend query params. Backend should extract tenant exclusively from the JWT.

### Reference: Frontend Multi-Tenancy Patterns (Stripe, GitHub, Datadog)

**Stripe Dashboard** implements a strict separation: the dashboard API never accepts `account_id` from query params for the user's own data. Cross-account access (Connect) uses separate OAuth-scoped tokens, not user-supplied IDs. The frontend stores no tenant data in localStorage — everything is fetched fresh per session.

**GitHub** uses a URL-based tenant context (`github.com/{org}/...`) with server-side authorization on every route. The frontend never passes `org_id` as a query param — the URL path IS the tenant scope, and the backend validates the authenticated user has access to that org.

**Datadog** implements **Restricted Datasets** on the frontend: dashboards and monitors query the API, and the API returns only data the user's role permits. The frontend renders blank graphs for restricted data — it never receives unauthorized data in the first place.

### Reference: FeatureGate Pattern

World-class SaaS uses a centralized entitlements provider with declarative gating:

```tsx
// EntitlementProvider wraps the app, fetches entitlements once
<EntitlementProvider>
  <App />
</EntitlementProvider>

// FeatureGate hides UI for disabled features
<FeatureGate feature="fine_tuning" fallback={<UpgradePrompt feature="fine_tuning" />}>
  <FineTuningPanel />
</FeatureGate>

// usePermissions hook for imperative checks
const { hasPermission, hasFeature } = usePermissions();
if (hasPermission("team.manage")) {
  // show management UI
}
```

The entitlements response should include:

- **Features**: boolean flags (`fine_tuning: true`, `custom_roles: false`)
- **Limits**: current usage vs max (`{ analyses: { current: 45, max: 100 } }`)
- **Permissions**: derived from the user's per-tenant role (`["analyses.read", "analyses.write", "team.manage"]`)

Cache entitlements for 5 minutes with automatic invalidation on org switch or plan change.

### Reference: Tenant Suspension UI

When a tenant is suspended, the frontend should:

1. **Route guard middleware**: Check tenant status on every navigation — redirect to `/suspended` page
2. **Suspension banner**: Persistent banner showing reason and resolution steps
3. **Read-only mode**: Disable all write actions (buttons grayed, forms disabled) while allowing data viewing
4. **Billing redirect**: "Update payment method" CTA linking directly to billing page

```tsx
// Route guard in App.tsx or router config
const TenantGuard = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { subscription } = useSubscription();

  if (subscription?.status === "suspended") {
    return <SuspendedPage reason={subscription.suspendedReason} />;
  }
  if (subscription?.status === "past_due") {
    return (
      <>
        <PastDueBanner dueDate={subscription.dueDate} />
        {children}
      </>
    );
  }
  return children;
};
```

### Reference: Proactive Usage Warnings

Implement multi-level alerts that appear before the user hits a hard limit:

| Threshold | UI Treatment                                   |
| --------- | ---------------------------------------------- |
| **75%**   | Subtle badge on sidebar usage indicator        |
| **90%**   | Yellow warning banner on relevant pages        |
| **95%**   | Persistent toast notification with upgrade CTA |
| **100%**  | Modal blocking the action with `UpgradePrompt` |

Use `useSubscription()` usage data to compute thresholds and display contextual warnings before the 403 hits.

### Recommendations

1. **Remove explicit tenantId from all API query params** — rely on JWT exclusively for tenant scoping
2. **Build `<FeatureGate>` component** — declarative feature/plan/permission gating with `<UpgradePrompt>` fallback
3. **Build `usePermissions()` hook** — check permissions from entitlements API, never roles directly
4. **Build `<EntitlementProvider>`** — fetch entitlements once, cache 5 min, invalidate on org switch
5. **Add `<TenantGuard>` route guard** — suspension page, past-due banner, read-only mode
6. **Add `<UsageWarning>` component** — proactive alerts at 75%/90%/95% thresholds
7. **Implement PKCE client-side** — generate `code_verifier` in `Login.tsx`, pass `code_challenge` to auth URL
8. **Add 30s timeout to apiClient** — use `AbortController` with `setTimeout`
9. **Standardize tenant scoping** — all API calls use JWT, no explicit `tenantId` params

---

## 13. Webhook Security

### What's Working Well

- **GitHub signature verification**: `x-hub-signature-256` checked before processing
- **Slack signature verification**: `x-slack-signature` checked before processing
- **Idempotency store**: Delivery ID tracking with deduplication

### Reference: Stripe's Webhook Signature Algorithm (Industry Standard)

Stripe signs webhooks with HMAC-SHA256 over `{timestamp}.{raw_body}`, includes the timestamp in the `Stripe-Signature` header (`t=<ts>,v1=<sig>`), and enforces a **5-minute replay tolerance window**. Each endpoint gets a **unique secret** (`whsec_*`). Verification requires constant-time comparison (`hmac.compare_digest`). Retries use exponential backoff over **3 days** in live mode, with new signatures generated per retry. After 3 days of failures, the endpoint is disabled with email notification.

GitHub: HMAC-SHA256 over raw body only (no timestamp), `X-Hub-Signature-256: sha256=<hex>`, **no built-in replay protection**, 10-second response timeout expectation.

### Reference: The Queue-First Pattern for Exactly-Once Processing

Exactly-once delivery is impossible; **exactly-once processing is achievable**:

1. Ingress layer verifies signature
2. Atomic INSERT into `processed_webhooks` table (unique constraint on `event_id`)
3. Enqueue to persistent queue
4. Return 200 immediately (all within <2 seconds)

If INSERT fails with unique violation, return 200 (already seen). Async processor executes business logic and updates status to 'completed'. On failure, DELETE the tracking record to allow retry.

Layer deduplication: **Redis SETNX** for fast first-pass dedup (TTL = 1-24 hours), plus **database unique constraint** for permanent record. Always return 200 for already-processed events (not 409). Design handlers to be **order-independent** since events may arrive out of sequence.

### Recommendations

1. **Add timestamp to webhook signature verification** where possible
2. **Implement Redis SETNX** as fast first-pass deduplication layer
3. **Add per-source rate limiting** via token bucket per webhook source in Redis
4. **Isolate webhook processing infrastructure** from core API services
5. **Add webhook endpoint count limit** per tenant

---

## 14. Prioritized Remediation Plan

### Phase 1: Critical Security Fixes (Week 1)

| #   | Item                                                                 | Effort  | Impact                                    |
| --- | -------------------------------------------------------------------- | ------- | ----------------------------------------- |
| 1   | Fix fine-tuning routes — validate tenantId against auth context      | 1 hour  | Closes cross-tenant data access           |
| 2   | Fix risk rules routes — validate tenantId against auth context       | 1 hour  | Closes cross-tenant CRUD                  |
| 3   | Add `tenant_id` to all `GET_BY_ID` queries                           | 4 hours | Defense-in-depth for all direct lookups   |
| 4   | Add tenant status middleware — block suspended/deleted tenants       | 2 hours | Prevents disabled tenants from operating  |
| 5   | Fix Bitbucket/Azure tenant creator — add provider-specific functions | 4 hours | Prevents tenant collision and duplication |

### Phase 2: Auth Hardening (Week 2)

| #   | Item                                                              | Effort  | Impact                                   |
| --- | ----------------------------------------------------------------- | ------- | ---------------------------------------- |
| 6   | Implement per-tenant RBAC — use `user_organizations.role` in JWT  | 1 day   | Correct role isolation across orgs       |
| 7   | Add real-time user status check in auth middleware (Redis-backed) | 4 hours | Closes 15-minute suspension window       |
| 8   | Add global session revocation endpoint (Redis `jti` blacklist)    | 4 hours | Admin can force-logout compromised users |
| 9   | Add plan limit enforcement in analysis worker                     | 2 hours | Closes off-by-one limit bypass           |
| 10  | Implement OAuth token refresh for GitLab/Bitbucket/Azure          | 1 day   | Prevents token expiration failures       |

### Phase 2b: Team Management Hardening (Week 2-3)

| #   | Item                                                                           | Effort  | Impact                                                   |
| --- | ------------------------------------------------------------------------------ | ------- | -------------------------------------------------------- |
| 10a | Enforce plan limits on team size in `ensureOrgMemberships()`                   | 4 hours | Prevents free-tier tenants from having unlimited members |
| 10b | Add provider membership revocation webhook (`organization.member_removed`)     | 1 day   | Auto-removes users when removed from GitHub/GitLab org   |
| 10c | Add login-time membership reconciliation — remove stale org links              | 4 hours | Catches membership changes between logins                |
| 10d | Write team changes (role change, removal) to `tenant_audit_log` table          | 4 hours | Compliance audit trail for team operations               |
| 10e | Check tenant suspension status on org switch                                   | 2 hours | Prevents switching into a suspended tenant               |
| 10f | Show team member usage gauge on frontend (`X/Y members`) with plan upgrade CTA | 4 hours | Users self-manage team size before hitting limit         |

### Phase 3: Operational Hardening (Weeks 3-4)

| #   | Item                                                         | Effort  | Impact                                    |
| --- | ------------------------------------------------------------ | ------- | ----------------------------------------- |
| 11  | Per-tenant concurrency limits for analyses (Redis semaphore) | 1 day   | Prevents noisy neighbor via LLM abuse     |
| 12  | Per-endpoint rate limiting — Token Bucket via Redis Lua      | 1 day   | Protects LLM budget and API stability     |
| 13  | Tiered rate limits by plan                                   | 4 hours | Fair resource allocation                  |
| 14  | Increase DB pool + add per-tenant backpressure (Vegas-style) | 4 hours | Prevents connection exhaustion            |
| 15  | Fair queue scheduling (weighted priority queues)             | 1 day   | Prevents tenant starvation                |
| 16  | Provider role mapping (use org roles from provider APIs)     | 1 day   | Correct initial role assignment           |
| 17  | Extend setup redirect to Bitbucket/Azure DevOps              | 4 hours | Complete onboarding for all providers     |
| 18  | Implement PostgreSQL RLS as Layer 2 isolation                | 2 days  | Database-level safety net for all queries |

### Phase 4: Compliance (Weeks 5-6)

| #   | Item                                                              | Effort | Impact                            |
| --- | ----------------------------------------------------------------- | ------ | --------------------------------- |
| 19  | Data export endpoint (GDPR Article 20 portability)                | 2 days | Legal compliance for EU customers |
| 20  | Self-service tenant deletion with 30-day grace + crypto-shredding | 1 day  | GDPR Article 17 right to erasure  |
| 21  | Separate PII into dedicated table for targeted erasure            | 1 day  | Enables surgical deletion         |
| 22  | Data retention automation (configurable TTLs per tenant)          | 1 day  | Prevents unbounded data growth    |
| 23  | SOC 2 Type II audit logging (immutable, hash-chained)             | 2 days | Audit readiness                   |
| 24  | Add consent tracking (append-only records)                        | 1 day  | GDPR consent compliance           |

### Phase 5: Scale & Polish (Weeks 7-8)

| #   | Item                                                       | Effort  | Impact                                      |
| --- | ---------------------------------------------------------- | ------- | ------------------------------------------- |
| 25  | Per-tenant Prometheus metrics with recording rules         | 1 day   | Operational visibility                      |
| 26  | Tenant health dashboard + health scoring (0-100)           | 2 days  | Proactive issue detection, churn prediction |
| 27  | Usage threshold alerting (75%, 90%, 95%, 100%)             | 4 hours | Customer success + abuse prevention         |
| 28  | Per-service HMAC secrets (Stripe's per-endpoint pattern)   | 4 hours | Limits blast radius of secret compromise    |
| 29  | Plan downgrade validation with grace period                | 4 hours | Prevents invalid plan states                |
| 30  | Trial expiration cron job (8-state lifecycle)              | 4 hours | Operationalizes trial management            |
| 31  | Webhook per-tenant rate limiting (token bucket per source) | 1 day   | Prevents webhook flood from one provider    |
| 32  | Per-tenant circuit breakers (Resilience4j pattern)         | 1 day   | Isolates failure domains per tenant         |
| 33  | Add Bitbucket/Azure DevOps auth service tests              | 4 hours | Prevents regressions in multi-provider flow |
| 34  | Implement PKCE for all OAuth flows (RFC 9700)              | 4 hours | Defense-in-depth for OAuth                  |
| 35  | Build centralized EntitlementService                       | 1 day   | Single enforcement point for all plan logic |

### Phase 6: Frontend Multi-Tenancy (Weeks 9-10)

| #   | Item                                                                   | Effort  | Impact                                            |
| --- | ---------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| 36  | Remove explicit tenantId from all frontend API query params            | 2 hours | Closes frontend-side cross-tenant vector          |
| 37  | Build `<FeatureGate>` component with plan/permission gating            | 1 day   | Defensive UI isolation for features               |
| 38  | Build `usePermissions()` hook — check permissions, not roles           | 4 hours | Decouples UI from role definitions                |
| 39  | Build `<EntitlementProvider>` — fetch + cache entitlements per session | 1 day   | Single source of truth for plan/feature state     |
| 40  | Add `<TenantGuard>` route guard — suspension page + read-only mode     | 1 day   | Users see clear suspension state, not generic 403 |
| 41  | Add `<UsageWarning>` — proactive alerts at 75%/90%/95% thresholds      | 4 hours | Users self-manage usage before hitting hard limit |
| 42  | Implement PKCE client-side in OAuth flow                               | 4 hours | Frontend generates code_verifier per RFC 9700     |
| 43  | Add 30s AbortController timeout to apiClient                           | 2 hours | Prevents hung requests consuming resources        |
| 44  | Standardize all API calls to use JWT-only tenant scoping               | 4 hours | Consistent, secure tenant isolation               |

---

## 15. What World-Class Looks Like

### Current vs World-Class Comparison

| Capability           | World-Class Standard                                                                 | Kenchi Current                                              | Gap                                                 |
| -------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------- |
| **Data isolation**   | 5-layer defense (app + RLS + infra + cache + monitoring)                             | Application-level + query-level (most queries)              | Add RLS, cache prefixing, static analysis           |
| **Auth**             | Short-lived tokens, per-tenant roles, per-tenant signing keys, PKCE                  | Short-lived tokens, global roles, no PKCE                   | Per-tenant RBAC, PKCE, per-tenant JWT keys          |
| **Authorization**    | Permission-based RBAC, custom roles per tenant, API key scoping, Zanzibar ReBAC      | Role-based only, global roles, no API keys                  | Permission layer, scoped API keys                   |
| **Rate limiting**    | 4-layer (token bucket + concurrent + fleet + worker), per-tenant, fail-open          | Per-IP + per-tenant flat rate                               | Token Bucket, concurrent limiter, load shedding     |
| **Noisy neighbor**   | Per-tenant quotas, fair scheduling, circuit breakers, connection throttling          | None                                                        | Full implementation needed                          |
| **Billing**          | Usage metering (Stripe Meters), EntitlementService at all layers, downgrade guards   | Plan enforcement at route level only                        | Worker enforcement, metering, entitlements          |
| **Compliance**       | GDPR export/delete/consent, SOC 2 immutable audit, crypto-shredding, per-tenant KMS  | Partial audit trail, no export/delete                       | GDPR endpoints, SOC 2 logging, KMS                  |
| **Observability**    | Per-tenant health scoring, Cortex/Thanos, cardinality-managed metrics                | Structured logs with tenantId                               | Metrics, health scoring, dashboards                 |
| **Lifecycle**        | 8-state machine, event-sourced transitions, reactivation validation                  | Multiple creation paths, suspension doesn't block           | Status middleware, lifecycle states                 |
| **Encryption**       | Per-tenant KMS keys, three-level hierarchy, BYOK, key rotation                       | Single global key, AES-256-GCM                              | Key hierarchy, rotation, BYOK                       |
| **Webhook security** | Signature + timestamp + replay protection + per-source rate limiting + queue-first   | Signature verification, partial replay protection           | Timestamp validation, queue-first pattern           |
| **Team management**  | Invite + auto-link, per-tenant roles, provider revocation webhooks, seat enforcement | OAuth auto-link only, role hierarchy, last-owner protection | Invitation system, provider revocation, seat limits |
| **Frontend**         | FeatureGate, permission hooks, EntitlementProvider, tenant guards, PKCE client-side  | httpOnly cookies, org switcher, plan limit dialogs          | FeatureGate, permissions hook, tenant guard, PKCE   |

### The 7 Architectural Pillars

1. **Isolation as invariant**: PostgreSQL RLS + application repository patterns + static analysis in CI. No single layer's failure can leak data.

2. **Short-lived credentials everywhere**: 15-minute access tokens with Redis blacklist revocation, per-tenant JWT signing keys, restricted API keys with per-resource permission matrices, mandatory PKCE.

3. **Permissions over roles**: Role-to-permission mappings in the database, check permissions in code, custom roles per tenant, SpiceDB for per-object access.

4. **Four-layer rate defense**: Per-tenant token bucket, concurrent request limiting, fleet-level load shedding, worker utilization shedding — all failing open on Redis errors.

5. **Explicit lifecycle state machine**: Eight states with event-sourced transitions, two-phase deletion with crypto-shredding, schema-drift-aware reactivation.

6. **Centralized entitlements**: Single EntitlementService enforced at API routes, background workers, webhooks, and UI — with usage metering for billing.

7. **Immutable compliance infrastructure**: Append-only audit logs with hash-chain linking in WORM storage, per-tenant KMS envelope encryption with BYOK, event-driven GDPR deletion, versioned consent records.

### The 6 Highest-Impact Improvements For KenchiOps

1. **Fix the 4 critical vulnerabilities** — cross-tenant data access + wrong provider in tenant creation
2. **Per-tenant RBAC** — the single most impactful architectural improvement for multi-org
3. **Tenant status middleware** — suspended tenants must be fully blocked
4. **PostgreSQL RLS** — database-level safety net that catches all application-layer mistakes
5. **Multi-provider parity** — token refresh, setup flows, and correct tenant creation for all providers
6. **GDPR compliance endpoints** — legal requirement for EU market entry

---

_This audit was conducted via static code analysis against production patterns from Stripe, GitHub, Datadog, Google Zanzibar, Cloudflare, Nile, and Supabase. A complementary penetration test and dynamic analysis are recommended before production launch with external customers._
