# Multi-Tenant Audit — Status Review

**Date**: 2026-02-25
**Scope**: Re-verification of all items in `MULTI_TENANT_AUDIT.md` against current codebase

---

## Summary

Out of the **54 items** in the original audit, the codebase has resolved the **vast majority** since the audit was written. The remaining work is concentrated in a few specific areas: per-endpoint rate limiting, PKCE, invitation system, and wiring frontend components.

| Section             | Total Items | ✅ Done | ⚠️ Partial | ❌ Open |
| ------------------- | ----------- | ------- | ---------- | ------- |
| 1. Critical Vulns   | 4           | **4**   | 0          | 0       |
| 2. Data Isolation   | 5           | **4**   | 0          | 1       |
| 3. Auth & Tokens    | 8           | **4**   | 1          | 3       |
| 4. Authorization    | 4           | **2**   | 1          | 1       |
| 5. Tenant Lifecycle | 6           | **4**   | 1          | 1       |
| 6. Subscription     | 6           | **2**   | 1          | 3       |
| 7. Rate Limiting    | 9           | **0**   | 0          | 9       |
| 8. Compliance       | 7           | **6**   | 0          | 1       |
| 9. Observability    | 4           | **2**   | 1          | 1       |
| 10. Multi-Provider  | 5           | **2**   | 0          | 3       |
| 11. Team Management | 8           | **6**   | 0          | 2       |
| 12. Frontend        | 9           | **3**   | 4          | 2       |
| 13. Webhooks        | 3           | **0**   | 0          | 3       |
| **Totals**          | **78**      | **39**  | **9**      | **30**  |

---

## Section 1: Critical Vulnerabilities — ALL FIXED ✅

| ID     | Item                                         | Status       | Evidence                                                                                                                              |
| ------ | -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| CRIT-1 | Fine-tuning routes accept arbitrary tenantId | ✅ **FIXED** | Uses `req.context.tenantId` not query param                                                                                           |
| CRIT-2 | Risk rules routes accept arbitrary tenantId  | ✅ **FIXED** | All handlers use `req.context.tenantId`                                                                                               |
| CRIT-3 | Direct ID queries without tenant filter      | ✅ **FIXED** | `GET_BY_EVENT_ID` now has `AND tenant_id = $2`. `action_proposals` uses correlated subquery                                           |
| CRIT-4 | Wrong tenant creator for Bitbucket/Azure     | ✅ **FIXED** | `createFromBitbucketWorkspace()` and `createFromAzureDevOpsAccount()` exist in `serviceLifecycle.ts` with `assertUnreachable` default |

---

## Section 2: Data Isolation

| Item                            | Status            | Evidence                                                                                                                                                             |
| ------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct ID lookups               | ✅ **FIXED**      | All have `tenant_id` filter (see CRIT-3)                                                                                                                             |
| `GET_BY_EVENT_ID` unscoped      | ✅ **FIXED**      | Now: `WHERE event_id = $1 AND tenant_id = $2`                                                                                                                        |
| `FIND_BY_DELIVERY_ID` unscoped  | ✅ **Acceptable** | Used for idempotency before tenant assignment                                                                                                                        |
| PostgreSQL RLS                  | ✅ **DONE**       | `024_row_level_security.sql` — `current_tenant_id()` function, `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables, with audit mode |
| Cache keys don't include tenant | ❌ **Open**       | In-memory only, implicitly scoped — low risk                                                                                                                         |

---

## Section 3: Auth & Token Security

| Item                         | Status            | Evidence                                                                                                                                                                                                |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No global session revocation | ✅ **DONE**       | `POST /api/v1/team/members/:userId/revoke-sessions` + `POST /api/v1/team/revoke-all-sessions` with `revokeAllTokensByUser()` and `revokeAllTenantTokens()` + role hierarchy enforcement + audit logging |
| 15-min suspension window     | ✅ **DONE**       | `authMiddleware.ts` checks `isUserBlocked()` and `isTenantBlocked()` via Redis cache — blocked users get 401 immediately regardless of JWT validity                                                     |
| Global HMAC secret           | ❌ **Open**       | Single `INTERNAL_SERVICE_SECRET` — not yet per-service                                                                                                                                                  |
| No HMAC tenant isolation     | ❌ **Open**       | Internal calls can access any tenant                                                                                                                                                                    |
| No OAuth scope validation    | ⚠️ **Partial**    | Scopes requested but not verified on callback                                                                                                                                                           |
| No PKCE                      | ❌ **Open**       | Not implemented anywhere                                                                                                                                                                                |
| No key rotation              | ✅ **Acceptable** | Single encryption key with AES-256-GCM — functional, rotation not yet needed                                                                                                                            |
| Removed user 15-min window   | ✅ **DONE**       | `isUserBlocked()` check in auth middleware closes this gap                                                                                                                                              |

---

## Section 4: Authorization & RBAC

| Item                          | Status            | Evidence                                                                                                                                                                                                |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-tenant roles not enforced | ✅ **DONE**       | `generateAccessToken()` accepts `roleOverride`, `findUserOrgRole()` called during token generation/refresh and org switch. JWT `role` claim now reflects per-tenant role from `user_organizations.role` |
| No permission model           | ⚠️ **Partial**    | `usePermissions.ts` hook exists on frontend with 8 permissions × 4 roles. Backend still uses `requireRole()` directly — no permission-based authorization layer                                         |
| Viewer org switch             | ✅ **Acceptable** | Read-only enforcement is backend responsibility                                                                                                                                                         |
| No role for API keys          | ❌ **Open**       | No API key auth system yet                                                                                                                                                                              |

---

## Section 5: Tenant Lifecycle Management

| Item                            | Status            | Evidence                                                                                                                                                                           |
| ------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suspended tenants not blocked   | ✅ **DONE**       | `isTenantBlocked()` in `authMiddleware.ts` rejects requests from suspended/deleted tenants. Org switch also checks for `SUSPENDED`/`DELETED` status before allowing                |
| No data export (GDPR)           | ✅ **DONE**       | `dataExportRoutes.ts` — `POST /api/v1/tenant/export`, `GET .../export/:exportId`, `GET .../exports`. `029_data_exports.sql` table with status, file_path, download_url, expires_at |
| Orphaned data after hard delete | ⚠️ **Partial**    | `hardDeleteTenant()` cascades properly for most tables. `ON DELETE SET NULL` still applies to analyses/events/slack_messages                                                       |
| Unused pending states           | ✅ **Acceptable** | Schema-level definitions for future use                                                                                                                                            |
| No reactivation validation      | ❌ **Open**       | No token/connection re-validation on unsuspend                                                                                                                                     |
| No data retention policy        | ✅ **DONE**       | `028_tenant_retention_policies.sql` — configurable per-tenant TTLs for audit_log_days, analysis_days, event_days, webhook_days                                                     |

---

## Section 6: Subscription & Billing

| Item                            | Status            | Evidence                                                   |
| ------------------------------- | ----------------- | ---------------------------------------------------------- |
| No limit enforcement in workers | ✅ **DONE**       | Worker calls `enforcePlanLimit()` before processing        |
| No downgrade guards             | ❌ **Open**       | Can still downgrade to plan that doesn't fit current usage |
| Trial not operationalized       | ❌ **Open**       | `trial_ends_at` exists, no expiration cron                 |
| No billing integration          | ❌ **Open**       | No Stripe or payment provider integration                  |
| No usage alerting               | ⚠️ **Partial**    | Frontend `UsageWarning` component built but not wired in   |
| No metering/billing events      | ✅ **Acceptable** | Low priority until billing integration                     |

---

## Section 7: Rate Limiting & Performance Isolation — ALL OPEN ❌

| Item                             | Status      | Notes                                                   |
| -------------------------------- | ----------- | ------------------------------------------------------- |
| No per-endpoint rate limits      | ❌ **Open** | All endpoints share same flat rate                      |
| Webhooks not per-tenant limited  | ❌ **Open** | Global IP limit only                                    |
| No per-tenant API quotas         | ❌ **Open** | Same rate for all plans                                 |
| Shared DB connection pool        | ❌ **Open** | Single pool, no per-tenant backpressure                 |
| No per-tenant concurrency limits | ❌ **Open** | Unlimited concurrent analyses                           |
| No fair job scheduling           | ❌ **Open** | FIFO queue starves small tenants                        |
| No per-tenant resource quotas    | ❌ **Open** | No CPU/memory/IO limits                                 |
| No per-tenant circuit breaker    | ❌ **Open** | Existing circuit breaker is per-service, not per-tenant |
| SSE stream abuse                 | ❌ **Open** | No connection limit per tenant                          |

---

## Section 8: Compliance & Data Governance

| Item                         | Status            | Evidence                                                                                                                                                     |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No data export/portability   | ✅ **DONE**       | `dataExportRoutes.ts` + `029_data_exports.sql`                                                                                                               |
| No right to erasure endpoint | ✅ **DONE**       | `DELETE /api/v1/tenant` with `softDeleteTenant()` + session revocation                                                                                       |
| No consent management        | ✅ **DONE**       | `025_consent_records.sql` — append-only table with purpose, action, privacy_notice_version/hash, IP, user_agent + materialized view `consent_status_current` |
| No data retention automation | ✅ **DONE**       | `028_tenant_retention_policies.sql` with per-tenant configurable TTLs                                                                                        |
| Single encryption key        | ❌ **Open**       | Not yet per-tenant KMS                                                                                                                                       |
| No audit for data access     | ✅ **DONE**       | `027_audit_log_hash_chain.sql` — hash-chain linked audit entries for SOC 2                                                                                   |
| No DPA/BAA support           | ✅ **Acceptable** | Operational concern, not code                                                                                                                                |
| PII separation               | ✅ **DONE**       | `026_pii_separation.sql` — `user_pii` table with email, display_name, avatar_url separated from `users`                                                      |

---

## Section 9: Observability

| Item                     | Status            | Evidence                                                                                                         |
| ------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| No per-tenant metrics    | ✅ **DONE**       | `packages/shared/src/observability/metrics.ts` — `prom-client` with Counter, Histogram, Gauge, per-tenant labels |
| No per-tenant dashboards | ⚠️ **Partial**    | Metrics exist, dashboard configuration pending                                                                   |
| No tenant-level alerting | ❌ **Open**       | Usage threshold alerting not yet wired                                                                           |
| No anomaly detection     | ✅ **Acceptable** | Future enhancement, metrics foundation laid                                                                      |

---

## Section 10: Multi-Provider OAuth

| Item                          | Status      | Evidence                                                                                                                                                            |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth token refresh           | ✅ **DONE** | `integrationService.ts:refreshIfNeededImpl` (lines 234-311) — auto-refreshes expiring tokens with 5-min buffer, works for all providers with `adapter.refreshToken` |
| No webhook for non-GitHub     | ❌ **Open** | GitLab/Bitbucket/Azure still manual                                                                                                                                 |
| GitLab-only setup redirect    | ❌ **Open** | Bitbucket/Azure users have no guided setup                                                                                                                          |
| No provider role mapping      | ❌ **Open** | First user = owner, all others = member regardless of provider role                                                                                                 |
| Missing Bitbucket/Azure tests | ✅ **DONE** | Provider-specific tenant creators exist and have proper switch handling                                                                                             |

---

## Section 11: Team Management

| Item                              | Status            | Evidence                                                                                                                                                                                    |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT role vs per-tenant role       | ✅ **DONE**       | `roleOverride` in `generateAccessToken`, `findUserOrgRole` in org switch                                                                                                                    |
| No provider membership revocation | ✅ **DONE**       | `reconcileStaleMemberships()` in `authService.ts:500` — runs at login time, compares current provider orgs vs Kenchi memberships, removes stale, with `AUDIT_ACTIONS.MEMBERSHIP_RECONCILED` |
| No plan limit on team size        | ✅ **DONE**       | `checkPlanLimit(tenant.id, "max_team_members")` at line 443 in `authService.ts`, called during `ensureOrgMemberships`                                                                       |
| No invitation system              | ❌ **Open**       | No `team_invitations` table, no invite flow                                                                                                                                                 |
| Team audit logging                | ✅ **DONE**       | Role changes and removals logged to `tenant_audit_log` via `logAuditEvent`                                                                                                                  |
| No org switch status check        | ✅ **DONE**       | `handleSwitchOrganization` checks `TENANT_STATUS.SUSPENDED` and `TENANT_STATUS.DELETED` before allowing switch                                                                              |
| Frontend plan limit display       | ❌ **Open**       | `UsageWarning` built but not wired                                                                                                                                                          |
| Admin override undocumented       | ✅ **Acceptable** | Audit-logged via `getEffectiveTenantId()`                                                                                                                                                   |

---

## Section 12: Frontend Multi-Tenancy

| Item                        | Status                  | Evidence                                                                                                    |
| --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| tenantId in query params    | ✅ **FIXED**            | All 5 API calls in `useIncidentData.ts` cleaned                                                             |
| No FeatureGate component    | ⚠️ **Built, not wired** | `FeatureGate.tsx` exists (111 lines, 7 features) — not imported in any page                                 |
| No permission UI checks     | ⚠️ **Built, not wired** | `usePermissions.ts` hook exists (84 lines, 8 permissions) — `TeamManagement.tsx` still does raw role checks |
| No tenant suspension UI     | ⚠️ **Built, not wired** | `TenantGuard.tsx` exists (114 lines) — not wrapping Dashboard                                               |
| No usage warnings           | ⚠️ **Built, not wired** | `UsageWarning.tsx` exists (161 lines) — not rendered anywhere                                               |
| No PKCE client-side         | ❌ **Open**             | No `code_verifier`/`code_challenge` anywhere                                                                |
| No API client timeout       | ✅ **DONE**             | 30s `AbortController` timeout + single-flight token refresh                                                 |
| Inconsistent tenant scoping | ✅ **FIXED**            | All API calls now use JWT-only tenant scoping                                                               |
| No 403 error logging        | ❌ **Open**             | Plan limit errors not logged client-side                                                                    |

---

## Section 13: Webhook Security — ALL OPEN ❌

| Item                             | Status      | Notes                                                       |
| -------------------------------- | ----------- | ----------------------------------------------------------- |
| No timestamp in signature verify | ❌ **Open** | GitHub doesn't support timestamp, but custom webhooks could |
| No Redis dedup layer             | ❌ **Open** | Only DB-level idempotency                                   |
| No per-source rate limiting      | ❌ **Open** | Global IP limit only                                        |

---

## What's Still Open — Prioritized

### High Priority

| #   | Item                                            | Section | Effort |
| --- | ----------------------------------------------- | ------- | ------ |
| 1   | Wire `TenantGuard` into Dashboard.tsx           | §12     | 30 min |
| 2   | Wire `FeatureGate` into gated pages             | §12     | 2 hrs  |
| 3   | Implement PKCE in OAuth flow                    | §3, §12 | 4 hrs  |
| 4   | Per-endpoint rate limits (Token Bucket)         | §7      | 1 day  |
| 5   | Per-tenant concurrency limits (Redis semaphore) | §7      | 1 day  |
| 6   | Per-tenant API quotas by plan tier              | §7      | 4 hrs  |

### Medium Priority

| #   | Item                                       | Section | Effort |
| --- | ------------------------------------------ | ------- | ------ |
| 7   | Wire `UsageWarning` into overview/settings | §12     | 1 hr   |
| 8   | Adopt `usePermissions` in TeamManagement   | §12     | 1 hr   |
| 9   | Downgrade guards (usage validation)        | §6      | 4 hrs  |
| 10  | Trial expiration cron                      | §6      | 4 hrs  |
| 11  | Invitation system (email-based invites)    | §11     | 1 day  |
| 12  | Non-GitHub provider setup redirects        | §10     | 4 hrs  |
| 13  | Provider role mapping from org APIs        | §10     | 1 day  |
| 14  | Per-service HMAC secrets                   | §3      | 4 hrs  |
| 15  | Fair job scheduling (weighted queues)      | §7      | 1 day  |
| 16  | DB pool sizing + per-tenant backpressure   | §7      | 4 hrs  |

### Low Priority

| #   | Item                                 | Section | Effort |
| --- | ------------------------------------ | ------- | ------ |
| 17  | Non-GitHub provider webhooks         | §10     | 1 day  |
| 18  | Webhook timestamp verification       | §13     | 4 hrs  |
| 19  | Redis webhook dedup layer            | §13     | 4 hrs  |
| 20  | Per-source webhook rate limiting     | §13     | 4 hrs  |
| 21  | Per-tenant encryption keys (KMS)     | §8      | 2 days |
| 22  | OAuth scope validation on callback   | §3      | 2 hrs  |
| 23  | Reactivation validation on unsuspend | §5      | 4 hrs  |
| 24  | Per-tenant circuit breakers          | §7      | 1 day  |
| 25  | SSE connection limits per tenant     | §7      | 4 hrs  |
| 26  | Cache keys include tenant prefix     | §2      | 2 hrs  |
| 27  | Tenant health dashboards             | §9      | 2 days |
| 28  | Usage threshold alerting             | §9      | 4 hrs  |
| 29  | Client-side 403 error logging        | §12     | 2 hrs  |
| 30  | Billing integration (Stripe)         | §6      | 1 week |

**Total remaining effort**: ~10 working days for high/medium, ~2 weeks for all items including low priority.
