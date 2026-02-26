# Multi-Tenant Remediation Plan — All Open Gaps

**Date**: 2026-02-24
**Prerequisite**: [Multi-Tenant Architecture Audit Report](./MULTI_TENANT_AUDIT.md)
**Scope**: 38 open findings verified against current codebase
**Format**: Each item includes the gap, affected files, implementation, and verification

---

## Table of Contents

1. [Auth Hardening](#1-auth-hardening)
2. [Team Management](#2-team-management)
3. [Tenant Lifecycle & Status Enforcement](#3-tenant-lifecycle--status-enforcement)
4. [Rate Limiting & Performance Isolation](#4-rate-limiting--performance-isolation)
5. [Database-Level Isolation (RLS)](#5-database-level-isolation-rls)
6. [Compliance & Data Governance](#6-compliance--data-governance)
7. [Observability](#7-observability)
8. [Frontend Multi-Tenancy](#8-frontend-multi-tenancy)
9. [Multi-Provider Parity](#9-multi-provider-parity)
10. [Prioritized Implementation Schedule](#10-prioritized-implementation-schedule)

---

## 1. Auth Hardening

### 1.1 Real-Time User/Tenant Status Check in Auth Middleware

**Gap**: After a user is suspended or removed, their JWT remains valid for up to 15 minutes. `authMiddleware.ts` verifies JWT signature/expiry but does **not** check live user status.

**Affected files**:

- `packages/shared/src/http/authMiddleware.ts` — the `authMiddleware` function
- `packages/shared/src/security/jwt.ts` — `verifyAccessToken` returns `AuthenticatedUser` without status

**Implementation**:

Add a lightweight status check after JWT verification. Use a short-lived in-memory cache (60-second TTL) to avoid a DB round-trip on every request. On cache miss, query the `users` table for `status`.

```typescript
// packages/shared/src/http/authMiddleware.ts

import { findUserById } from "../database/user/repository.js";
import { USER_STATUS } from "../constants/auth.js";

/**
 * In-memory user status cache. TTL = 60s.
 * Key: userId, Value: { status, cachedAt }
 *
 * This is acceptable for single-process deployments. For multi-process,
 * replace with Redis GET/SET with 60s TTL.
 */
const statusCache = new Map<string, { status: string; cachedAt: number }>();
const STATUS_CACHE_TTL_MS = 60_000;

const isUserActive = async (userId: string): Promise<boolean> => {
  const cached = statusCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < STATUS_CACHE_TTL_MS) {
    return cached.status === USER_STATUS.ACTIVE;
  }

  const user = await findUserById(userId);
  if (!user) return false;

  statusCache.set(userId, { status: user.status, cachedAt: Date.now() });
  return user.status === USER_STATUS.ACTIVE;
};
```

Insert the check after `verifyAccessToken` succeeds but before `applyAuthToRequest`:

```typescript
// Inside authMiddleware, after const user = verifyAccessToken(token):
const isActive = await isUserActive(user.userId);
if (!isActive) {
  next(
    new AuthenticationError("User account is not active", {
      operation: "authMiddleware",
    })
  );
  return;
}
```

> [!IMPORTANT]
> This converts `authMiddleware` to an async function. Express handles async middleware via `asyncHandler` or try/catch — ensure the existing error handling wraps the async call properly.

**Cache invalidation**: When a user is suspended/deleted, call `statusCache.delete(userId)` synchronously. For multi-process, publish a Redis `PUBLISH user:status:changed {userId}` event and subscribe from each process.

**Verification**:

- Unit test: mock `findUserById` returning `status: "suspended"` → verify middleware returns 401
- Unit test: verify cache hit on second call within 60s
- Integration test: suspend user, wait 0-60s, verify next API call returns 401

---

### 1.2 Global Session Revocation Endpoint

**Gap**: No mechanism to revoke **all** sessions for a user or tenant. Only per-family revocation exists via `revokeTokenFamily()`.

**Affected files**:

- New route: `services/api/src/routes/adminRoutes.ts`
- `packages/shared/src/database/auth/repository.ts` — add `revokeAllUserTokens(userId)`

**Implementation**:

```typescript
// packages/shared/src/database/auth/repository.ts
export const revokeAllUserTokens = async (userId: string): Promise<number> => {
  const result = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [userId]
  );
  return result.rowCount ?? 0;
};

// For tenant-wide revocation:
export const revokeAllTenantTokens = async (tenantId: string): Promise<number> => {
  const result = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id IN (SELECT user_id FROM user_organizations WHERE tenant_id = $1)
       AND revoked_at IS NULL
     RETURNING id`,
    [tenantId]
  );
  return result.rowCount ?? 0;
};
```

**New admin endpoint**:

```typescript
// POST /api/v1/admin/users/:userId/revoke-sessions
// POST /api/v1/admin/tenants/:tenantId/revoke-sessions
// Both require requireRole("admin", "owner")
```

Combined with the status cache invalidation from §1.1, revoking refresh tokens + invalidating the status cache effectively locks out the user within 60 seconds (status cache TTL) even though active JWTs remain valid until natural 15-minute expiry.

**For sub-second revocation** (optional, requires Redis):

```typescript
// On revocation, add the user's JWT jti values to a Redis blacklist
// In authMiddleware, check Redis before accepting the JWT
// TTL on each entry = remaining JWT lifetime (max 15 min)
await redis.setex(`jti:blacklist:${jti}`, remainingTTLSeconds, "1");
```

**Verification**:

- Unit test: revoke all sessions → verify refresh tokens marked `revoked_at`
- Integration test: generate token pair → revoke → attempt refresh → verify 401
- Integration test: tenant-wide revoke → verify all users' refresh tokens revoked

---

## 2. Team Management

### 2.1 Enforce Plan Limits on Team Size

**Gap**: `teamRoutes.ts` and `authService.ts:ensureOrgMemberships()` never call `enforcePlanLimit()` for `max_team_members`. Free-tier tenants can accumulate unlimited members.

**Affected files**:

- `services/api/src/services/authService.ts` — `ensureOrgMemberships()` (line ~410-428)

**Implementation**:

Add a plan limit check before `addUserOrganization` inside the `ensureOrgMemberships` loop. If the limit is exceeded, **do not block login** — just skip auto-linking for that tenant and log a warning.

```typescript
// Inside ensureOrgMemberships, before addUserOrganization:
import { checkPlanLimit } from "@kenchi/shared";

// Check if tenant has room for another member
const limitCheck = await checkPlanLimit(tenant.id, "max_team_members");
if (!limitCheck.allowed) {
  logger.warn("Skipping auto-link: team member limit reached", {
    ...context,
    userId,
    tenantId: tenant.id,
    current: limitCheck.current,
    max: limitCheck.max,
  });
  // Still add tenantId to resolvedIds so the user can see the org exists
  // but they won't be added as a member
  continue;
}

await addUserOrganization({ userId, tenantId: tenant.id, role: ... });
```

> [!NOTE]
> `checkPlanLimit` should be a non-throwing version of `enforcePlanLimit` that returns `{ allowed: boolean, current: number, max: number }` instead of throwing on exceeded. This avoids blocking the login flow.

**Verification**:

- Unit test: mock plan with `max_team_members: 1`, existing member count = 1 → verify `addUserOrganization` is NOT called
- Unit test: verify login still succeeds when auto-link is skipped
- Integration test: create free-tier tenant with 1 member, login as second user, verify they're not auto-linked

---

### 2.2 Provider Membership Revocation

**Gap**: When a user is removed from a GitHub/GitLab organization, Kenchi retains their access indefinitely. No webhook listener, periodic check, or login-time reconciliation exists.

**Affected files**:

- `services/api/src/services/authService.ts` — `ensureOrgMemberships()` (add reconciliation)
- New: webhook handler for `organization.member_removed`

**Implementation — Login-Time Reconciliation** (recommended first step):

Modify `autoLinkOrganizationsImpl` to also **remove stale memberships**. After discovering current provider orgs, compare against existing Kenchi memberships and remove orphaned links.

```typescript
// In autoLinkOrganizationsImpl, after ensureOrgMemberships():
const currentProviderOrgLogins = new Set(effectiveOrgs.map((o) => o.login));
const existingMemberships = await findOrganizationsByUser(user.id);

for (const membership of existingMemberships) {
  // Only reconcile memberships for the current provider
  if (membership.provider !== provider) continue;

  // If the user is no longer in this org on the provider side, flag it
  if (!currentProviderOrgLogins.has(membership.orgName)) {
    logger.warn("Stale membership detected — user no longer in provider org", {
      userId: user.id,
      tenantId: membership.tenantId,
      orgName: membership.orgName,
      provider,
      ...context,
    });

    // Option A: Auto-remove (aggressive)
    await removeMemberFromTenant(membership.tenantId, user.id);

    // Option B: Flag for admin review (conservative)
    // await flagStaleMembership(membership.tenantId, user.id, provider);
  }
}
```

**Implementation — Webhook Listener** (recommended second step):

```typescript
// services/api/src/routes/webhookRoutes.ts (or new file)
// Listen for GitHub organization.member_removed event

router.post(
  "/api/webhooks/github/organization",
  asyncHandler(async (req, res) => {
    const event = req.headers["x-github-event"] as string;
    if (event !== "organization") return res.status(200).send("ignored");

    const { action, membership, organization } = req.body;
    if (action !== "member_removed") return res.status(200).send("ignored");

    const tenant = await findByOrgNameAndProvider(organization.login, "github");
    if (!tenant) return res.status(200).send("ok");

    const user = await findByProviderUserId("github", String(membership.user.id));
    if (!user) return res.status(200).send("ok");

    await removeMemberFromTenant(tenant.id, user.id);
    await logAuditEvent(tenant.id, AUDIT_ACTIONS.MEMBER_AUTO_REMOVED, {
      userId: user.id,
      reason: "provider_org_removal",
      provider: "github",
    });

    res.status(200).send("ok");
  })
);
```

> [!WARNING]
> GitHub App must subscribe to `organization` events in the app settings. Also need to register this webhook route as a public route in `PUBLIC_ROUTES` (it uses webhook signature verification, not JWT).

**Verification**:

- Unit test: login with user who was previously in 2 orgs, now only in 1 → verify stale membership removed
- Unit test: simulate webhook payload → verify member removed and audit logged
- Manual test: remove user from GitHub org → verify Kenchi access revoked on next login

---

### 2.3 Frontend Team Member Usage Gauge

**Gap**: `TeamManagement.tsx` doesn't show how many seats are used vs the plan limit.

**Affected files**:

- `services/frontend/src/pages/TeamManagement.tsx`
- `services/frontend/src/hooks/useSubscription.ts` (existing — already returns usage data)

**Implementation**:

```tsx
// In TeamManagement.tsx, add a usage bar at the top of the members list:
const { subscription } = useSubscription();
const memberLimit = subscription?.limits?.max_team_members ?? Infinity;
const memberCount = members?.length ?? 0;
const usagePercent = memberLimit === Infinity ? 0 : (memberCount / memberLimit) * 100;

// Render:
<div className="team-usage-bar">
  <span>
    {memberCount} / {memberLimit === Infinity ? "∞" : memberLimit} members
  </span>
  <progress value={memberCount} max={memberLimit} />
  {usagePercent >= 90 && <UpgradePrompt feature="team_members" />}
</div>;
```

**Verification**:

- Visual test: load team page → verify usage bar renders with correct count
- Visual test: on free plan with 1/1 member → verify upgrade prompt shows

---

## 3. Tenant Lifecycle & Status Enforcement

### 3.1 Tenant Status Middleware for API Routes

**Gap**: Suspended/deleted tenants can still make API calls. The suspension check exists only in `organizationRoutes.ts` (org switch), not in the main auth flow.

**Affected files**:

- `packages/shared/src/http/authMiddleware.ts` — add tenant status check
- `packages/shared/src/database/tenant/repository.ts` — add `findTenantStatus(tenantId)`

**Implementation**:

Add a tenant status check after user authentication, similar to the user status check in §1.1. Use the same caching pattern.

```typescript
// packages/shared/src/database/tenant/repository.ts
export const findTenantStatus = async (tenantId: string): Promise<string | null> => {
  const result = await query("SELECT status FROM tenants WHERE id = $1", [tenantId]);
  return result.rows[0]?.status ?? null;
};
```

```typescript
// In authMiddleware, after user status check:
if (user.tenantId) {
  const tenantStatus = await getTenantStatusCached(user.tenantId);
  if (tenantStatus === TENANT_STATUS.SUSPENDED) {
    next(
      new AuthorizationError("Organization is suspended. Contact support.", {
        operation: "authMiddleware",
      })
    );
    return;
  }
  if (tenantStatus === TENANT_STATUS.DELETED) {
    next(
      new AuthorizationError("Organization has been deactivated.", {
        operation: "authMiddleware",
      })
    );
    return;
  }
}
```

Use the same `Map + TTL` cache pattern as §1.1 for `tenantStatusCache`, with 60-second TTL.

**Verification**:

- Unit test: mock tenant `status: "suspended"` → verify middleware returns 403
- Integration test: suspend tenant → verify API calls return 403 within 60s

---

## 4. Rate Limiting & Performance Isolation

### 4.1 Per-Endpoint Rate Limits

**Gap**: All endpoints share the same 500 req/min tenant limit. Expensive LLM/analysis endpoints need stricter limits.

**Affected files**:

- Rate limit configuration (currently in shared package)
- Routes that need tighter limits: analysis, fine-tuning, RAG

**Implementation**:

Define endpoint categories with separate limits:

```typescript
const ENDPOINT_RATE_LIMITS = {
  // Expensive operations (LLM calls)
  expensive: { windowMs: 60_000, max: 10 },
  // Standard CRUD
  standard: { windowMs: 60_000, max: 500 },
  // Read-only / lightweight
  readonly: { windowMs: 60_000, max: 1000 },
} as const;
```

Apply per-route:

```typescript
// In route definitions:
router.post(
  "/api/fine-tuning/dataset/extract",
  rateLimitByCategory("expensive"),
  asyncHandler(handleExtractDataset)
);
```

> [!TIP]
> Start with simple per-endpoint limits using the existing in-memory rate limiter. Migrate to Redis Token Bucket (Stripe Layer 1) when deploying multi-process.

---

### 4.2 Per-Tenant Concurrency Limits for Analyses

**Gap**: A single tenant can trigger unlimited concurrent LLM analyses, starving other tenants.

**Implementation**:

Use an in-memory semaphore per tenant (simple), or Redis-based for multi-process:

```typescript
// packages/shared/src/concurrency/tenantSemaphore.ts
const concurrencyMap = new Map<string, number>();
const MAX_CONCURRENT_ANALYSES = 5;

export const acquireAnalysisSlot = (tenantId: string): boolean => {
  const current = concurrencyMap.get(tenantId) ?? 0;
  if (current >= MAX_CONCURRENT_ANALYSES) return false;
  concurrencyMap.set(tenantId, current + 1);
  return true;
};

export const releaseAnalysisSlot = (tenantId: string): void => {
  const current = concurrencyMap.get(tenantId) ?? 0;
  concurrencyMap.set(tenantId, Math.max(0, current - 1));
};
```

Wrap analysis execution:

```typescript
if (!acquireAnalysisSlot(tenantId)) {
  throw new RateLimitError("Too many concurrent analyses. Please wait.", {
    metadata: { tenantId, max: MAX_CONCURRENT_ANALYSES },
  });
}
try {
  const result = await runAnalysis(request);
  return result;
} finally {
  releaseAnalysisSlot(tenantId);
}
```

---

### 4.3 Tiered Rate Limits by Plan

**Gap**: All tenants get the same rate limits regardless of plan.

**Implementation**:

```typescript
const PLAN_RATE_LIMITS: Record<string, { requestsPerMinute: number }> = {
  free: { requestsPerMinute: 60 },
  pro: { requestsPerMinute: 300 },
  team: { requestsPerMinute: 500 },
  enterprise: { requestsPerMinute: 2000 },
};
```

In the rate limiting middleware, look up the tenant's plan from the cached subscription data and apply the corresponding limit.

---

### 4.4 DB Connection Pool Sizing

**Gap**: Pool is set to 10 connections — one heavy tenant can exhaust it.

**Implementation**:

Increase to `(cpu_cores × 2) + 1`. For a 4-core production server: **9 connections minimum**, recommend **20-25** for multi-tenant workloads. Configure in the database connection module:

```typescript
const pool = new Pool({
  max: parseInt(process.env.DB_POOL_SIZE ?? "25", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
```

---

### 4.5 Fair Queue Scheduling

**Gap**: FIFO queue — a high-volume tenant starves others.

**Implementation**:

If using BullMQ or similar, implement a simple fair scheduler: track per-tenant active job counts in a sliding window. When a tenant exceeds a threshold (e.g., 10 active jobs), route new jobs to a lower-priority queue.

```typescript
// Simple approach: count active jobs per tenant
const activeJobCounts = new Map<string, number>();
const FAIR_THRESHOLD = 10;

const getQueueForTenant = (tenantId: string): string => {
  const active = activeJobCounts.get(tenantId) ?? 0;
  if (active > FAIR_THRESHOLD * 2) return "analysis:throttled-4x";
  if (active > FAIR_THRESHOLD) return "analysis:throttled-2x";
  return "analysis:default";
};
```

---

### 4.6 Per-Tenant Circuit Breakers

**Gap**: The existing `circuitBreaker.ts` is global (keyed by service name). One tenant's failing integration opens the breaker for all tenants.

**Affected files**:

- `packages/shared/src/http/circuitBreaker.ts`

**Implementation**:

Append `tenantId` to the service key to create per-tenant isolation:

```typescript
// Instead of:
await withCircuitBreaker("github-api", () => fetchFromGitHub(params));

// Use:
await withCircuitBreaker(`github-api:${tenantId}`, () => fetchFromGitHub(params));
```

The existing `Map<string, CircuitStateRecord>` in `circuitBreaker.ts` already supports arbitrary keys. No code change to the breaker itself — just change how callers construct the key.

> [!WARNING]
> This increases memory usage proportional to `tenants × services`. Add a cleanup mechanism (evict entries idle for >1 hour) to prevent unbounded growth.

---

## 5. Database-Level Isolation (RLS)

### 5.1 PostgreSQL Row-Level Security

**Gap**: No RLS policies. All tenant isolation is enforced at the application layer. A single bug in any query can leak cross-tenant data.

**Affected files**:

- New migration: `database/init/024_row_level_security.sql`
- DB connection wrapper to set tenant context

**Implementation**:

**Step 1 — Create the tenant context function**:

```sql
-- database/init/024_row_level_security.sql

-- Session-scoped tenant context function
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS VARCHAR(50) AS $$
BEGIN
  RETURN NULLIF(current_setting('app.tenant_id', true), '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- Secure default: deny all
END;
$$ LANGUAGE plpgsql STABLE;
```

**Step 2 — Enable RLS on all tenant-scoped tables**:

```sql
-- Apply to each table that has a tenant_id column
DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'analyses', 'events', 'incident_alerts', 'incident_triage_results',
    'investigations', 'action_proposals', 'ci_connections',
    'webhook_activity_log', 'tenant_audit_log', 'knowledge_documents',
    'rag_feedback', 'external_sources', 'rag_test_cases',
    'repository_channel_mappings', 'custom_risk_rules', 'risk_assessments',
    'user_organizations'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL
       USING (tenant_id = current_tenant_id())
       WITH CHECK (tenant_id = current_tenant_id())',
      tbl
    );
  END LOOP;
END $$;
```

**Step 3 — Set tenant context per request**:

```typescript
// In the database query wrapper, before executing tenant-scoped queries:
export const withTenantContext = async <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.tenant_id = $1", [tenantId]);
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
```

> [!CAUTION]
>
> - The **application database user** must NOT be a superuser (superusers bypass RLS)
> - Use `SET LOCAL` (not `SET`) — LOCAL scopes to the transaction only, safe with connection pooling
> - Migration scripts and admin tools should use a separate superuser connection
> - Run `FORCE ROW LEVEL SECURITY` so even table owners obey policies

**Rollout strategy**: Deploy in **audit mode** first — enable RLS but with a permissive `USING (true)` policy alongside the real one, logging any mismatches. After 1-2 weeks with zero mismatches, drop the permissive policy.

**Verification**:

- Integration test: set `app.tenant_id = 'tenant-a'`, insert row with `tenant_id = 'tenant-a'`
- Query as `app.tenant_id = 'tenant-b'` → verify 0 rows returned
- Query without setting `app.tenant_id` → verify 0 rows returned (NULL = deny all)

---

## 6. Compliance & Data Governance

### 6.1 Data Export Endpoint (GDPR Article 20)

**Gap**: No mechanism for tenants to export their data.

**Implementation**:

```typescript
// New route: POST /api/v1/tenant/export
// Requires: requireRole("admin", "owner")

const handleDataExport = async (req: Request, res: Response) => {
  const { tenantId } = req.context;

  // Create async export job
  const exportJob = await createExportJob(tenantId);

  // Return job ID for status polling
  res.status(HTTP_STATUS.ACCEPTED).json({
    exportId: exportJob.id,
    status: "processing",
    estimatedCompletionMinutes: 5,
  });
};

// GET /api/v1/tenant/export/:exportId — poll for completion
// Returns download URL when ready
```

**Export contents**: analyses, events, incident alerts, triage results, investigations, action proposals, audit logs, team members, configurations. Format: JSON per table, packaged as ZIP.

**New table**:

```sql
CREATE TABLE data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  requested_by VARCHAR(50) NOT NULL REFERENCES users(id),
  file_path TEXT, -- S3 path or local path
  download_url TEXT, -- Pre-signed URL, 72-hour TTL
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

### 6.2 Self-Service Tenant Deletion (GDPR Article 17)

**Implementation**:

```typescript
// DELETE /api/v1/tenant — requires owner role + confirmation token
// Phase 1 (immediate): Set status = 'soft_deleted', suppress all data access
// Phase 2 (30-day grace period): Hard delete via cron job

const handleTenantDeletion = async (req: Request, res: Response) => {
  const { tenantId } = req.context;
  const { confirmationToken } = req.body;

  // Verify deletion token (sent via email to all owners)
  await verifyDeletionToken(tenantId, confirmationToken);

  // Soft delete — sets status, preserves data for 30-day grace
  await softDeleteTenant(tenantId);

  // Revoke all sessions
  await revokeAllTenantTokens(tenantId);

  res.status(HTTP_STATUS.OK).json({
    message: "Organization scheduled for deletion",
    gracePeriodDays: 30,
    finalDeletionDate: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
};
```

---

### 6.3 Data Retention Automation

**Implementation**:

Add a scheduled job that enforces configurable TTLs:

```typescript
const DEFAULT_RETENTION_DAYS = {
  audit_logs: 365,
  webhook_activity_log: 90,
  analyses: 180, // 6 months
  events: 90,
} as const;

// Cron job (daily):
const enforceRetention = async () => {
  for (const [table, days] of Object.entries(DEFAULT_RETENTION_DAYS)) {
    const cutoff = new Date(Date.now() - days * 86400_000);
    const result = await query(`DELETE FROM ${table} WHERE created_at < $1`, [cutoff]);
    logger.info("Retention cleanup", { table, deletedCount: result.rowCount, cutoffDate: cutoff });
  }
};
```

**New table** for per-tenant overrides:

```sql
CREATE TABLE tenant_retention_policies (
  tenant_id VARCHAR(50) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  audit_log_days INTEGER NOT NULL DEFAULT 365,
  analysis_days INTEGER NOT NULL DEFAULT 180,
  event_days INTEGER NOT NULL DEFAULT 90,
  webhook_days INTEGER NOT NULL DEFAULT 90,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 6.4 Consent Tracking

**Implementation**:

```sql
-- New migration: 025_consent_records.sql
CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(50) NOT NULL REFERENCES users(id),
  tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
  purpose VARCHAR(100) NOT NULL,  -- 'analytics', 'ai_training', 'marketing'
  action VARCHAR(20) NOT NULL,    -- 'granted' or 'withdrawn'
  privacy_notice_version VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only: no UPDATE or DELETE allowed from the application
-- Materialized view for fast runtime lookups:
CREATE MATERIALIZED VIEW consent_status_current AS
SELECT DISTINCT ON (user_id, tenant_id, purpose)
  user_id, tenant_id, purpose, action, created_at
FROM consent_records
ORDER BY user_id, tenant_id, purpose, created_at DESC;
```

---

### 6.5 SOC 2 Type II Audit Logging (Immutable)

**Gap**: `tenant_audit_log` exists but is not tamper-evident or immutable.

**Implementation**:

Add hash-chain linking to audit log entries:

```sql
ALTER TABLE tenant_audit_log ADD COLUMN previous_hash VARCHAR(64);
ALTER TABLE tenant_audit_log ADD COLUMN entry_hash VARCHAR(64);
```

On each insert, compute `entry_hash = SHA256(previous_hash + tenant_id + action + metadata + created_at)`. A tampered entry breaks the chain. For true immutability, replicate to append-only storage (S3 Object Lock in COMPLIANCE mode or equivalent).

---

### 6.6 PII Separation

**Implementation**:

```sql
-- New migration: 026_pii_separation.sql
CREATE TABLE user_pii (
  user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate existing PII:
INSERT INTO user_pii (user_id, email, display_name, avatar_url, created_at)
SELECT id, email, display_name, avatar_url, created_at FROM users;

-- Remove PII from users table:
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN display_name;
ALTER TABLE users DROP COLUMN avatar_url;
```

On GDPR erasure: `DELETE FROM user_pii WHERE user_id = $1` — all PII gone in one operation without touching behavioral data.

---

## 7. Observability

### 7.1 Per-Tenant Prometheus Metrics

**Gap**: No per-tenant metrics. Can't answer "how many analyses did tenant X run?"

**Implementation**:

```typescript
// packages/shared/src/observability/metrics.ts
import { Counter, Histogram, register } from "prom-client";

export const analysesTotal = new Counter({
  name: "kenchi_analyses_total",
  help: "Total analyses by tenant",
  labelNames: ["tenant_id", "status"],
});

export const apiRequestDuration = new Histogram({
  name: "kenchi_api_request_duration_seconds",
  help: "API request duration by tenant and endpoint",
  labelNames: ["tenant_id", "method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
```

> [!WARNING]
> **Cardinality management**: With 1,000 tenants × 50 routes × 5 status codes = 250K series. Use Prometheus recording rules to pre-aggregate across tenants for dashboard queries. Alert on any metric exceeding 10K series.

---

### 7.2 Usage Threshold Alerting

**Implementation**:

```typescript
// Cron job (every 15 minutes):
const checkUsageThresholds = async () => {
  const tenants = await findAllActiveTenantsWithSubscriptions();
  for (const tenant of tenants) {
    const usage = await getUsageForTenant(tenant.id);
    for (const [resource, { current, max }] of Object.entries(usage)) {
      const percent = max > 0 ? (current / max) * 100 : 0;
      if (percent >= 100) {
        await sendAlert(tenant.id, resource, "exceeded", { current, max });
      } else if (percent >= 95) {
        await sendAlert(tenant.id, resource, "critical", { current, max });
      } else if (percent >= 90) {
        await sendAlert(tenant.id, resource, "warning", { current, max });
      } else if (percent >= 75) {
        await sendAlert(tenant.id, resource, "approaching", { current, max });
      }
    }
  }
};
```

Deduplicate alerts: only send each level once per tenant per resource per day.

---

## 8. Frontend Multi-Tenancy

### 8.1 Remove Explicit `tenantId` from Query Params (HIGH PRIORITY)

**Gap**: `useIncidentData.ts` passes `?tenantId=${tenantId}` in 5 API calls. If backend trusts the query param, this is a cross-tenant vector.

**Affected file**: `services/frontend/src/hooks/useIncidentData.ts`

**Implementation**:

Remove `tenantId` from all query strings. The backend should extract tenant exclusively from the JWT via `req.context.tenantId`.

```diff
// useIncidentData.ts
- tenantId ? `/api/v1/triage/stats?tenantId=${tenantId}` : "",
+ tenantId ? `/api/v1/triage/stats` : "",

- tenantId ? `/api/v1/incidents/stats/by-source?tenantId=${tenantId}` : "",
+ tenantId ? `/api/v1/incidents/stats/by-source` : "",

- tenantId ? `/api/v1/incidents/stats/active-by-source?tenantId=${tenantId}` : "",
+ tenantId ? `/api/v1/incidents/stats/active-by-source` : "",

- ? `/api/v1/incidents/recent/balanced?tenantId=${tenantId}&perSource=${perSource}&maxTotal=${maxTotal}`
+ ? `/api/v1/incidents/recent/balanced?perSource=${perSource}&maxTotal=${maxTotal}`

- tenantId ? `/api/v1/triage/stats/severity-by-source?tenantId=${tenantId}` : "",
+ tenantId ? `/api/v1/triage/stats/severity-by-source` : "",
```

Ensure the corresponding backend routes use `req.context.tenantId`, not `req.query.tenantId`.

**Verification**:

- Verify all 5 affected API calls still return correct data after removing query param
- Verify no other frontend files pass `tenantId` as a query param

---

### 8.2 Build `<FeatureGate>` Component

**Gap**: UI doesn't defensively hide features by plan or role.

**Implementation**:

```tsx
// services/frontend/src/components/FeatureGate.tsx

interface FeatureGateProps {
  feature: string; // "fine_tuning", "custom_risk_rules", etc.
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const FeatureGate = ({ feature, fallback, children }: FeatureGateProps) => {
  const { subscription } = useSubscription();
  const features = subscription?.features ?? {};

  if (!features[feature]) {
    return fallback ?? <UpgradePrompt feature={feature} />;
  }

  return <>{children}</>;
};

// Usage:
<FeatureGate feature="fine_tuning">
  <FineTuningPanel />
</FeatureGate>;
```

---

### 8.3 Build `usePermissions()` Hook

**Gap**: `TeamManagement.tsx` checks `currentUserRole === "admin"` directly instead of checking permissions.

**Implementation**:

```tsx
// services/frontend/src/hooks/usePermissions.ts

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    "team.manage",
    "team.delete",
    "billing.manage",
    "settings.manage",
    "analyses.read",
    "analyses.write",
  ],
  admin: ["team.manage", "billing.manage", "settings.manage", "analyses.read", "analyses.write"],
  member: ["analyses.read", "analyses.write"],
  viewer: ["analyses.read"],
};

export const usePermissions = () => {
  const { user } = useAuth();
  const role = user?.role ?? "viewer";
  const permissions = new Set(ROLE_PERMISSIONS[role] ?? []);

  return {
    hasPermission: (perm: string) => permissions.has(perm),
    hasAnyPermission: (...perms: string[]) => perms.some((p) => permissions.has(p)),
    role,
  };
};
```

---

### 8.4 Build `<TenantGuard>` Route Guard

**Gap**: When a tenant is suspended, users see generic errors instead of a clear suspension page.

**Implementation**:

```tsx
// services/frontend/src/components/TenantGuard.tsx

export const TenantGuard = ({ children }: { children: React.ReactNode }) => {
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

  return <>{children}</>;
};

// Wrap in App.tsx or router:
<TenantGuard>
  <DashboardRoutes />
</TenantGuard>;
```

---

### 8.5 Build `<UsageWarning>` Component

**Implementation**:

```tsx
// services/frontend/src/components/UsageWarning.tsx

export const UsageWarning = ({ resource }: { resource: string }) => {
  const { subscription } = useSubscription();
  const usage = subscription?.usage?.[resource];
  if (!usage) return null;

  const percent = usage.max > 0 ? (usage.current / usage.max) * 100 : 0;

  if (percent < 75) return null;
  if (percent >= 100)
    return (
      <Alert variant="error">
        Limit reached for {resource}. <UpgradeLink />
      </Alert>
    );
  if (percent >= 95)
    return (
      <Alert variant="warning">
        Almost at limit: {usage.current}/{usage.max} {resource}
      </Alert>
    );
  if (percent >= 90)
    return (
      <Alert variant="info">
        Approaching limit: {usage.current}/{usage.max} {resource}
      </Alert>
    );
  return (
    <Badge variant="subtle">
      {usage.current}/{usage.max}
    </Badge>
  );
};
```

---

### 8.6 Implement PKCE Client-Side

**Gap**: No `code_verifier`/`code_challenge` generated in the OAuth flow. Required per RFC 9700 (January 2025).

**Affected files**:

- `services/frontend/src/pages/Login.tsx` (generate code_verifier)
- `services/api/src/routes/authRoutes.ts` (verify code_verifier on callback)

**Implementation**:

```typescript
// Frontend — Login.tsx
const generatePKCE = async () => {
  const verifier = crypto.randomUUID() + crypto.randomUUID(); // 72 chars
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  sessionStorage.setItem("pkce_verifier", verifier);
  return challenge;
};

// Add to OAuth URL:
const challenge = await generatePKCE();
const authUrl = `${providerAuthUrl}&code_challenge=${challenge}&code_challenge_method=S256`;
```

```typescript
// Backend — authRoutes.ts callback handler
const code_verifier = req.body.code_verifier; // from frontend
// Pass to token exchange:
const tokenResponse = await adapter.exchangeCode(code, redirectUri, code_verifier);
```

---

### 8.7 API Client Timeout

**Gap**: `apiClient.ts` has no explicit timeout — uses browser default (~90s).

**Implementation**:

```typescript
// services/frontend/src/lib/apiClient.ts
const API_TIMEOUT_MS = 30_000;

const fetchWithTimeout = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};
```

---

## 9. Multi-Provider Parity

### 9.1 Provider Role Mapping

**Gap**: `authService.ts` assigns `"member"` to all non-first users regardless of their provider org role.

**Affected file**: `services/api/src/services/authService.ts` — `ensureOrgMemberships()`

**Implementation**:

Extend the OAuth adapters to return the user's role in each org. Map provider roles to Kenchi roles:

```typescript
const PROVIDER_ROLE_MAP: Record<string, Record<string, UserRole>> = {
  github: { admin: "admin", member: "member" },
  gitlab: { owner: "owner", maintainer: "admin", developer: "member", guest: "viewer" },
  bitbucket: { admin: "admin", collaborator: "member" },
  azure_devops: { projectAdministrator: "admin", contributor: "member" },
};

// In ensureOrgMemberships, when creating a new membership:
const providerRole = org.role; // from adapter.getUserOrganizations()
const mappedRole = existingTenant
  ? (PROVIDER_ROLE_MAP[provider]?.[providerRole] ?? "member")
  : "owner"; // First user always becomes owner
```

---

### 9.2 Setup Redirects for Bitbucket/Azure DevOps

**Gap**: Only GitLab checks for missing CI connection after login and redirects to setup.

**Affected file**: `services/api/src/routes/authRoutes.ts`

**Implementation**:

Extend the post-login redirect logic to cover all providers:

```typescript
// After successful OAuth login, check for missing CI connection:
const getSetupRedirect = async (
  provider: OAuthProvider,
  tenantId: string
): Promise<string | null> => {
  if (!tenantId) return null;

  const providerCIType = {
    github: "github_app",
    gitlab: "gitlab_ci",
    bitbucket: "bitbucket_ci",
    azure_devops: "azure_devops_ci",
  }[provider];

  if (!providerCIType) return null;

  const existing = await findByTenantAndProvider(tenantId, providerCIType);
  if (existing) return null;

  return `/dashboard/setup/${provider}`;
};
```

---

## 10. Prioritized Implementation Schedule

### Immediate (Week 1) — Security Critical

| #   | Item                                         | Effort  | Section |
| --- | -------------------------------------------- | ------- | ------- |
| 1   | Remove `tenantId` from frontend query params | 2 hours | §8.1    |
| 2   | Add tenant status middleware                 | 4 hours | §3.1    |
| 3   | Add user status check in auth middleware     | 4 hours | §1.1    |
| 4   | Enforce plan limits on team size             | 4 hours | §2.1    |

### Week 2 — Auth & Team Hardening

| #   | Item                                   | Effort  | Section |
| --- | -------------------------------------- | ------- | ------- |
| 5   | Session revocation endpoint            | 4 hours | §1.2    |
| 6   | Login-time membership reconciliation   | 4 hours | §2.2    |
| 7   | Provider membership revocation webhook | 1 day   | §2.2    |
| 8   | Frontend team usage gauge              | 4 hours | §2.3    |

### Weeks 3–4 — Performance & Isolation

| #   | Item                          | Effort  | Section |
| --- | ----------------------------- | ------- | ------- |
| 9   | Per-endpoint rate limits      | 1 day   | §4.1    |
| 10  | Per-tenant concurrency limits | 4 hours | §4.2    |
| 11  | Tiered rate limits by plan    | 4 hours | §4.3    |
| 12  | DB pool sizing                | 2 hours | §4.4    |
| 13  | Fair queue scheduling         | 1 day   | §4.5    |
| 14  | Per-tenant circuit breakers   | 4 hours | §4.6    |
| 15  | PostgreSQL RLS                | 2 days  | §5.1    |

### Weeks 5–6 — Compliance

| #   | Item                      | Effort | Section |
| --- | ------------------------- | ------ | ------- |
| 16  | Data export endpoint      | 2 days | §6.1    |
| 17  | Self-service deletion     | 1 day  | §6.2    |
| 18  | Data retention automation | 1 day  | §6.3    |
| 19  | Consent tracking          | 1 day  | §6.4    |
| 20  | SOC 2 audit logging       | 2 days | §6.5    |
| 21  | PII separation            | 1 day  | §6.6    |

### Weeks 7–8 — Observability & Frontend

| #   | Item                          | Effort  | Section |
| --- | ----------------------------- | ------- | ------- |
| 22  | Per-tenant Prometheus metrics | 1 day   | §7.1    |
| 23  | Usage threshold alerting      | 4 hours | §7.2    |
| 24  | `<FeatureGate>` component     | 1 day   | §8.2    |
| 25  | `usePermissions()` hook       | 4 hours | §8.3    |
| 26  | `<TenantGuard>` route guard   | 1 day   | §8.4    |
| 27  | `<UsageWarning>` component    | 4 hours | §8.5    |
| 28  | PKCE implementation           | 4 hours | §8.6    |
| 29  | API client timeout            | 2 hours | §8.7    |

### Weeks 9–10 — Provider Parity & Polish

| #   | Item                               | Effort  | Section |
| --- | ---------------------------------- | ------- | ------- |
| 30  | Provider role mapping              | 1 day   | §9.1    |
| 31  | Setup redirects for all providers  | 4 hours | §9.2    |
| 32  | Bitbucket/Azure auth service tests | 4 hours | —       |
| 33  | Plan downgrade validation          | 4 hours | —       |
| 34  | Trial expiration cron              | 4 hours | —       |
| 35  | Centralized EntitlementService     | 1 day   | —       |
| 36  | Per-service HMAC secrets           | 4 hours | —       |
| 37  | Webhook per-tenant rate limiting   | 1 day   | —       |
| 38  | Tenant health dashboard            | 2 days  | —       |

---

**Total estimated effort**: ~10 weeks (1 engineer) or ~5 weeks (2 engineers, parallelized)

> [!IMPORTANT]
> Items 1–4 (Week 1) are the highest-impact security fixes among the remaining open items. The frontend `tenantId` in query params (§8.1) is a 2-hour fix that should be done immediately — it mirrors the exact pattern of CRIT-1 and CRIT-2 that were already fixed on the backend.
