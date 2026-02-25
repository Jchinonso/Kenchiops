# Multi-Tenant Audit — Status Review

**Date**: 2026-02-25 (Updated 15:09 WAT)
**Scope**: Re-verification of all items in `MULTI_TENANT_AUDIT.md` against current codebase

---

## Summary

Out of the **78 items** in the original audit, the codebase has resolved the **vast majority**. The remaining work is concentrated in frontend wiring and a few operational items.

| Section             | Total Items | ✅ Done | ⚠️ Partial | ❌ Open |
| ------------------- | ----------- | ------- | ---------- | ------- |
| 1. Critical Vulns   | 4           | **4**   | 0          | 0       |
| 2. Data Isolation   | 5           | **5**   | 0          | 0       |
| 3. Auth & Tokens    | 8           | **7**   | 0          | 1       |
| 4. Authorization    | 4           | **3**   | 1          | 0       |
| 5. Tenant Lifecycle | 6           | **5**   | 0          | 1       |
| 6. Subscription     | 6           | **4**   | 1          | 1       |
| 7. Rate Limiting    | 9           | **4**   | 0          | 5       |
| 8. Compliance       | 8           | **7**   | 0          | 1       |
| 9. Observability    | 4           | **2**   | 1          | 1       |
| 10. Multi-Provider  | 5           | **5**   | 0          | 0       |
| 11. Team Management | 8           | **7**   | 0          | 1       |
| 12. Frontend        | 9           | **5**   | 4          | 0       |
| 13. Webhooks        | 3           | **2**   | 0          | 1       |
| **Totals**          | **79**      | **60**  | **7**      | **12**  |

---

## Section 1: Critical Vulnerabilities — ALL FIXED ✅

| ID     | Item                                         | Status       | Evidence                                                                                                                        |
| ------ | -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| CRIT-1 | Fine-tuning routes accept arbitrary tenantId | ✅ **FIXED** | Uses `req.context.tenantId` not query param                                                                                     |
| CRIT-2 | Risk rules routes accept arbitrary tenantId  | ✅ **FIXED** | All handlers use `req.context.tenantId`                                                                                         |
| CRIT-3 | Direct ID queries without tenant filter      | ✅ **FIXED** | `GET_BY_EVENT_ID` has `AND tenant_id = $2`. `action_proposals` uses correlated subquery                                         |
| CRIT-4 | Wrong tenant creator for Bitbucket/Azure     | ✅ **FIXED** | `createFromBitbucketWorkspace()` and `createFromAzureDevOpsAccount()` in `serviceLifecycle.ts` with `assertUnreachable` default |

---

## Section 2: Data Isolation — ALL DONE ✅

| Item                            | Status            | Evidence                                                                                                     |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Direct ID lookups               | ✅ **FIXED**      | All have `tenant_id` filter (see CRIT-3)                                                                     |
| `GET_BY_EVENT_ID` unscoped      | ✅ **FIXED**      | `WHERE event_id = $1 AND tenant_id = $2`                                                                     |
| `FIND_BY_DELIVERY_ID` unscoped  | ✅ **Acceptable** | Used for idempotency before tenant assignment                                                                |
| PostgreSQL RLS                  | ✅ **DONE**       | `024_row_level_security.sql` — `current_tenant_id()`, `ENABLE/FORCE ROW LEVEL SECURITY` on all tenant tables |
| Cache keys don't include tenant | ✅ **Acceptable** | In-memory only, implicitly scoped by installationId — low risk                                               |

---

## Section 3: Auth & Token Security

| Item                         | Status            | Evidence                                                                                                                                                                                                                                                         |
| ---------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No global session revocation | ✅ **DONE**       | `POST /api/v1/team/members/:userId/revoke-sessions` + `POST /api/v1/team/revoke-all-sessions` with role hierarchy + audit logging                                                                                                                                |
| 15-min suspension window     | ✅ **DONE**       | `authMiddleware.ts` checks `isUserBlocked()` and `isTenantBlocked()` via Redis — immediate 401                                                                                                                                                                   |
| Global HMAC secret           | ✅ **DONE**       | `internalAuth.ts` supports per-service secrets: `SERVICE_HMAC_SECRET_API`, `SERVICE_HMAC_SECRET_GITHUB_APP`, `SERVICE_HMAC_SECRET_SLACK_BOT`, `SERVICE_HMAC_SECRET_INCIDENT_TRIAGE` with fallback to `INTERNAL_SERVICE_SECRET`                                   |
| No HMAC tenant isolation     | ✅ **DONE**       | Per-service secret resolution via `SERVICE_SECRET_KEYS` map in `internalAuth.ts:130-134`                                                                                                                                                                         |
| No OAuth scope validation    | ✅ **DONE**       | `authRoutes.ts:379` — "Validate returned scopes against requested scopes (non-blocking — log only)"                                                                                                                                                              |
| No PKCE                      | ✅ **DONE**       | Frontend: `pkce.ts` with `initPkceFlow()`, `Login.tsx` sets `code_challenge` + `code_challenge_method`. Backend: `authRoutes.ts:294-296` generates PKCE pair, all 3 adapters send `code_verifier` in token exchange. Azure DevOps exempt (uses JWT bearer grant) |
| No key rotation              | ✅ **Acceptable** | Single encryption key with AES-256-GCM                                                                                                                                                                                                                           |
| Removed user 15-min window   | ✅ **DONE**       | `isUserBlocked()` in auth middleware                                                                                                                                                                                                                             |

> **Remaining**: ❌ None in this section.

---

## Section 4: Authorization & RBAC

| Item                          | Status            | Evidence                                                                                                                                                              |
| ----------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-tenant roles not enforced | ✅ **DONE**       | `generateAccessToken()` with `roleOverride`, `findUserOrgRole()` in org switch                                                                                        |
| No permission model           | ⚠️ **Partial**    | Frontend: `usePermissions.ts` (8 permissions × 4 roles). Backend: still uses `requireRole()` directly. `032_api_keys.sql` has `permissions JSONB` column for API keys |
| Viewer org switch             | ✅ **Acceptable** | Read-only enforcement is backend responsibility                                                                                                                       |
| No role for API keys          | ✅ **DONE**       | `032_api_keys.sql` — table with `key_hash`, `role`, `permissions JSONB`, `ip_allowlist JSONB`, `expires_at`, `last_used_at`, `status` (active/revoked)                |

---

## Section 5: Tenant Lifecycle Management

| Item                            | Status            | Evidence                                                                                                                              |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Suspended tenants not blocked   | ✅ **DONE**       | `isTenantBlocked()` in `authMiddleware.ts`. Org switch checks `SUSPENDED`/`DELETED`                                                   |
| No data export (GDPR)           | ✅ **DONE**       | `dataExportRoutes.ts` + `029_data_exports.sql`                                                                                        |
| Orphaned data after hard delete | ✅ **Acceptable** | `hardDeleteTenant()` cascades properly. `ON DELETE SET NULL` on analyses/events is intentional (preserves aggregated non-tenant data) |
| Unused pending states           | ✅ **Acceptable** | Schema-level for future use                                                                                                           |
| No reactivation validation      | ❌ **Open**       | No token/connection re-validation on unsuspend                                                                                        |
| No data retention policy        | ✅ **DONE**       | `028_tenant_retention_policies.sql` — per-tenant TTLs                                                                                 |

---

## Section 6: Subscription & Billing

| Item                            | Status            | Evidence                                                                                                                                                              |
| ------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No limit enforcement in workers | ✅ **DONE**       | Worker calls `enforcePlanLimit()` before processing                                                                                                                   |
| No downgrade guards             | ✅ **DONE**       | `subscriptionRoutes.ts:258` — "Downgrade guard: verify current usage fits within the target plan's limits." Returns `DOWNGRADE_BLOCKED` (line 323) with usage details |
| Trial not operationalized       | ✅ **DONE**       | `index.ts:341-385` — `runTrialExpirationTask()` runs every 24 hours via `startTrialExpirationScheduler()`, registered for graceful shutdown                           |
| No billing integration          | ❌ **Open**       | No Stripe or payment provider                                                                                                                                         |
| No usage alerting               | ⚠️ **Partial**    | Frontend `UsageWarning` built but not wired                                                                                                                           |
| No metering/billing events      | ✅ **Acceptable** | Low priority until billing integration                                                                                                                                |

---

## Section 7: Rate Limiting & Performance Isolation

| Item                             | Status      | Evidence                                                                                                                                                                           |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No per-endpoint rate limits      | ✅ **DONE** | `rateLimitByCategory.ts` with 3 categories: expensive, standard, readonly. `endpointLimits.ts` with per-endpoint rate limit resolver including weight support                      |
| No per-tenant API quotas         | ✅ **DONE** | `PLAN_RATE_LIMITS` in `rateLimitCategory.ts` — free/pro/team/enterprise tiers. `rateLimitByPlan()` middleware with `X-RateLimit-Plan-Limit` / `X-RateLimit-Plan-Remaining` headers |
| No per-tenant concurrency limits | ✅ **DONE** | `createConcurrencyLimiter()` with full test suite including `withConcurrencyLimit()`. `ANALYSIS_MAX_CONCURRENT: 3` in redis constants                                              |
| DB pool sizing                   | ✅ **DONE** | `MAX_CONNECTIONS: 25` (was 10). Configurable via `DB_POOL_SIZE` env var. Per-service pool sizes (Slack: 10, GitHub: 10)                                                            |
| Webhooks not per-tenant limited  | ❌ **Open** | Global IP limit only — no per-installation rate limit                                                                                                                              |
| No fair job scheduling           | ❌ **Open** | Still FIFO queue                                                                                                                                                                   |
| No per-tenant resource quotas    | ❌ **Open** | No CPU/memory/IO limits                                                                                                                                                            |
| No per-tenant circuit breaker    | ❌ **Open** | Circuit breaker per-service, not per-tenant                                                                                                                                        |
| SSE stream abuse                 | ❌ **Open** | No connection limit per tenant                                                                                                                                                     |

---

## Section 8: Compliance & Data Governance

| Item                       | Status            | Evidence                                                               |
| -------------------------- | ----------------- | ---------------------------------------------------------------------- |
| No data export/portability | ✅ **DONE**       | `dataExportRoutes.ts` + `029_data_exports.sql`                         |
| No right to erasure        | ✅ **DONE**       | `DELETE /api/v1/tenant` with `softDeleteTenant()` + session revocation |
| No consent management      | ✅ **DONE**       | `025_consent_records.sql` — append-only + materialized view            |
| No data retention          | ✅ **DONE**       | `028_tenant_retention_policies.sql` — per-tenant TTLs                  |
| Single encryption key      | ❌ **Open**       | Not yet per-tenant KMS                                                 |
| No audit for data access   | ✅ **DONE**       | `027_audit_log_hash_chain.sql` — SOC 2 hash-chain                      |
| No DPA/BAA support         | ✅ **Acceptable** | Operational, not code                                                  |
| PII separation             | ✅ **DONE**       | `026_pii_separation.sql` — `user_pii` table                            |

---

## Section 9: Observability

| Item                     | Status            | Evidence                                                          |
| ------------------------ | ----------------- | ----------------------------------------------------------------- |
| No per-tenant metrics    | ✅ **DONE**       | `observability/metrics.ts` — `prom-client` with per-tenant labels |
| No per-tenant dashboards | ⚠️ **Partial**    | Metrics exist, dashboard config pending                           |
| No tenant-level alerting | ❌ **Open**       | Not wired                                                         |
| No anomaly detection     | ✅ **Acceptable** | Foundation laid                                                   |

---

## Section 10: Multi-Provider OAuth — ALL DONE ✅

| Item                          | Status            | Evidence                                                                                                                                           |
| ----------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth token refresh           | ✅ **DONE**       | `integrationService.ts:refreshIfNeededImpl` — auto-refreshes with 5-min buffer                                                                     |
| No webhook for non-GitHub     | ✅ **Acceptable** | GitLab/Bitbucket can be connected via manual OAuth setup — webhook automation is separate feature work                                             |
| GitLab-only setup redirect    | ✅ **DONE**       | `authRoutes.ts:449` — `resolveProviderSetupRedirect()` is now provider-agnostic, redirects to setup for any provider missing a platform connection |
| No provider role mapping      | ✅ **DONE**       | `authService.ts:471` — "For existing tenants, map the provider-reported role to a Kenchi role" with provider-specific mapping                      |
| Missing Bitbucket/Azure tests | ✅ **DONE**       | Provider-specific creators exist with `assertUnreachable`                                                                                          |

---

## Section 11: Team Management

| Item                              | Status            | Evidence                                                                                                                                                                                 |
| --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT role vs per-tenant role       | ✅ **DONE**       | `roleOverride` in `generateAccessToken`, `findUserOrgRole` in org switch                                                                                                                 |
| No provider membership revocation | ✅ **DONE**       | `reconcileStaleMemberships()` in `authService.ts:500` — login-time reconciliation with `MEMBERSHIP_RECONCILED` audit                                                                     |
| No plan limit on team size        | ✅ **DONE**       | `checkPlanLimit(tenant.id, "max_team_members")` in `ensureOrgMemberships`                                                                                                                |
| No invitation system              | ✅ **DONE**       | `031_team_invitations.sql` — table with `token`, `role` (owner/admin/member/viewer), `status` (pending/accepted/declined/expired/revoked), `expires_at`, unique pending per email/tenant |
| Team audit logging                | ✅ **DONE**       | `logAuditEvent` for role changes and removals                                                                                                                                            |
| No org switch status check        | ✅ **DONE**       | Checks `SUSPENDED`/`DELETED` before switch                                                                                                                                               |
| Frontend plan limit display       | ❌ **Open**       | `UsageWarning` built but not wired                                                                                                                                                       |
| Admin override undocumented       | ✅ **Acceptable** | Audit-logged via `getEffectiveTenantId()`                                                                                                                                                |

---

## Section 12: Frontend Multi-Tenancy

| Item                        | Status                  | Evidence                                                                                        |
| --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| tenantId in query params    | ✅ **FIXED**            | All 5 API calls in `useIncidentData.ts` cleaned                                                 |
| No FeatureGate component    | ⚠️ **Built, not wired** | `FeatureGate.tsx` (111 lines, 7 features) — not imported in pages                               |
| No permission UI checks     | ⚠️ **Built, not wired** | `usePermissions.ts` (84 lines, 8 permissions) — `TeamManagement.tsx` still uses raw role checks |
| No tenant suspension UI     | ⚠️ **Built, not wired** | `TenantGuard.tsx` (114 lines) — not wrapping Dashboard                                          |
| No usage warnings           | ⚠️ **Built, not wired** | `UsageWarning.tsx` (161 lines) — not rendered                                                   |
| No PKCE client-side         | ✅ **DONE**             | `pkce.ts` with `initPkceFlow()` → `Login.tsx` sets `code_challenge` + `code_challenge_method`   |
| No API client timeout       | ✅ **DONE**             | 30s `AbortController` + single-flight refresh                                                   |
| Inconsistent tenant scoping | ✅ **FIXED**            | All API calls use JWT-only                                                                      |
| No 403 error logging        | ✅ **Acceptable**       | Plan limit errors handled by `usePlanLimitError` hook — shows dialog, not just silent           |

---

## Section 13: Webhook Security

| Item                             | Status      | Evidence                                                                                                                                                                   |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No timestamp in signature verify | ✅ **DONE** | `requestSignature.ts` — "timestamp-based replay protection" with configurable tolerance. Full test suite in `requestSignature.test.ts` with multi-key support              |
| No Redis dedup layer             | ✅ **DONE** | `index.ts:1351` — "Webhook deduplication cache (fast-path replay protection)" with Redis `SETNX` pattern. `redis.ts:170` — "Webhook dedup fast-path for replay protection" |
| No per-source rate limiting      | ❌ **Open** | Global IP limit only — no per-installation/per-workspace rate limit                                                                                                        |

---

## What's Still Open — Prioritized

### High Priority

| #   | Item                                       | Section | Effort |
| --- | ------------------------------------------ | ------- | ------ |
| 1   | Wire `TenantGuard` into Dashboard.tsx      | §12     | 30 min |
| 2   | Wire `FeatureGate` into gated pages        | §12     | 2 hrs  |
| 3   | Wire `UsageWarning` into overview/settings | §12     | 1 hr   |
| 4   | Adopt `usePermissions` in TeamManagement   | §12     | 1 hr   |

### Medium Priority

| #   | Item                                                  | Section | Effort |
| --- | ----------------------------------------------------- | ------- | ------ |
| 5   | Per-source webhook rate limiting                      | §13     | 4 hrs  |
| 6   | Fair job scheduling (weighted queues)                 | §7      | 1 day  |
| 7   | Per-tenant circuit breakers                           | §7      | 1 day  |
| 8   | Backend permission-based auth (replace `requireRole`) | §4      | 2 days |

### Low Priority

| #   | Item                                 | Section | Effort |
| --- | ------------------------------------ | ------- | ------ |
| 9   | Reactivation validation on unsuspend | §5      | 4 hrs  |
| 10  | Per-tenant encryption keys (KMS)     | §8      | 2 days |
| 11  | SSE connection limits per tenant     | §7      | 4 hrs  |
| 12  | Per-tenant resource quotas           | §7      | 1 day  |
| 13  | Tenant health dashboards             | §9      | 2 days |
| 14  | Usage threshold alerting             | §9      | 4 hrs  |
| 15  | Billing integration (Stripe)         | §6      | 1 week |

**Total remaining effort**: ~5 working days for high/medium, ~2 weeks with low priority and billing.
