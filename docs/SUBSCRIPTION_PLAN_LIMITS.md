# Subscription Plan Limits — Enforcement & Design Document

Comprehensive reference for how Kenchi enforces subscription plan limits across the backend and frontend. Covers current state, identified gaps, and the remediation plan.

---

## Table of Contents

1. [Plan Tier Comparison](#plan-tier-comparison)
2. [Enforcement Architecture](#enforcement-architecture)
3. [Enforcement Matrix](#enforcement-matrix)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Frontend UX Specification](#frontend-ux-specification)
6. [Identified Gaps & Remediation](#identified-gaps--remediation)
7. [Edge Cases & Design Decisions](#edge-cases--design-decisions)
8. [Upgrade Paths](#upgrade-paths)
9. [API Reference](#api-reference)
10. [Testing Strategy](#testing-strategy)

---

## Plan Tier Comparison

### Numeric Limits

| Limit          | Free | Pro ($49/mo) | Team ($149/mo) | Enterprise (Custom) |
| -------------- | ---- | ------------ | -------------- | ------------------- |
| Repositories   | 3    | Unlimited    | Unlimited      | Unlimited           |
| Analyses/Month | 50   | Unlimited    | Unlimited      | Unlimited           |
| Integrations   | 1    | 5            | Unlimited      | Unlimited           |
| Team Members   | 5    | 10           | 50             | Unlimited           |

> `max_team_members` for the Free plan was updated from 1 to 5 via migration `037_fix_free_plan_limits.sql`. A limit of 1 was impractical — a solo user filled the entire quota, preventing any team formation.

### Boolean Feature Flags

| Feature               | Free | Pro | Team | Enterprise |
| --------------------- | ---- | --- | ---- | ---------- |
| Slack Integration     | No   | Yes | Yes  | Yes        |
| Custom Analysis Rules | No   | Yes | Yes  | Yes        |
| Team Analytics        | No   | Yes | Yes  | Yes        |
| SSO/SAML              | No   | No  | No   | Yes        |
| Audit Log             | No   | No  | Yes  | Yes        |
| API Access            | No   | Yes | Yes  | Yes        |
| Priority Support      | No   | Yes | Yes  | Yes        |

### Database Values

Stored in the `plans` table. `NULL` means unlimited.

| Column                 | Free | Pro  | Team  | Enterprise |
| ---------------------- | ---- | ---- | ----- | ---------- |
| `max_repositories`     | 3    | NULL | NULL  | NULL       |
| `max_analyses_monthly` | 50   | NULL | NULL  | NULL       |
| `max_integrations`     | 1    | 5    | NULL  | NULL       |
| `max_team_members`     | 5    | 10   | 50    | NULL       |
| `price_monthly_cents`  | 0    | 4900 | 14900 | NULL       |

**Source:** `database/init/018_subscription_plans.sql`, `database/init/037_fix_free_plan_limits.sql`, `database/seed.sql`

---

## Enforcement Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ UsageWarning │  │ FeatureGate  │  │ PLAN_LIMIT_   │  │
│  │ (dashboard)  │  │ (UI gating)  │  │ EXCEEDED toast│  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│         │                 │                  │            │
│         └─────────────────┴──────────────────┘            │
│                        │                                  │
│            GET /api/v1/subscription/usage                 │
│            403 response with metadata                     │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                   API Routes Layer                        │
│                                                          │
│  analysisRoutes.ts ─── enforcePlanLimit("max_analyses")  │
│  invitationRoutes.ts ─ enforcePlanLimit("max_team") x2   │
│                        (creation AND acceptance)          │
│  repoChannel/svc.ts ── enforcePlanLimit("max_repos")     │
│  integrationService ── enforcePlanLimit("max_integ")     │
│  authService.ts ────── checkPlanLimit("max_team") *soft  │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│               Subscription Module (shared)               │
│                                                          │
│  enforcePlanLimit() ──► checkPlanLimit() ──► throws 403  │
│        │                      │                          │
│        ▼                      ▼                          │
│  ensureSubscription()    getTenantUsage()                 │
│  getPlanById()           isWithinLimit()                  │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                    PostgreSQL                             │
│                                                          │
│  plans ── plan definitions (reference data)               │
│  tenant_subscriptions ── per-tenant plan assignment       │
│  user_organizations ── team member count                  │
│  analyses ── monthly analysis count                       │
│  provider_connections ── integration count                 │
└──────────────────────────────────────────────────────────┘
```

### Core Functions

| Function                               | File                                                          | Purpose                                                 |
| -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `enforcePlanLimit(tenantId, limitKey)` | `packages/shared/src/database/subscription/repository.ts:325` | Hard enforcement — throws `AuthorizationError` (403)    |
| `checkPlanLimit(tenantId, limitKey)`   | `packages/shared/src/database/subscription/repository.ts:290` | Soft check — returns `{ allowed, currentUsage, limit }` |
| `isWithinLimit(current, limit)`        | `packages/shared/src/database/subscription/helpers.ts:123`    | Pure comparison: `limit === null \|\| current < limit`  |
| `getTenantUsage(tenantId)`             | `packages/shared/src/database/subscription/repository.ts`     | Fetches current counts from DB                          |
| `ensureSubscription(tenantId)`         | `packages/shared/src/database/subscription/repository.ts`     | Lazy init — creates free plan row if missing            |

### Limit Semantics

- `NULL` limit = unlimited (always allowed, no check needed)
- `isWithinLimit`: strict less-than (`current < limit`). At-limit (`current === limit`) returns `false`
- A limit of 3 allows items to be added while `current` is 0, 1, or 2 (since `2 < 3` passes). After the 3rd item is added, `current` becomes 3 and the next attempt is blocked (`3 < 3` fails). **This correctly allows exactly 3 items.**

---

## Enforcement Matrix

### Current Enforcement Points (What Exists)

| Limit Key              | Enforcement Point                    | File:Line                                                       | Type           | Error Code              | Behavior                                    |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------- | -------------- | ----------------------- | ------------------------------------------- |
| `max_analyses_monthly` | Before creating analysis job         | `services/api/src/routes/analysisRoutes.ts:79`                  | **Hard block** | 403 PLAN_LIMIT_EXCEEDED | Job creation rejected                       |
| `max_analyses_monthly` | Before performing analysis           | `services/api/src/services/analysisService.ts:205`              | **Hard block** | 403 PLAN_LIMIT_EXCEEDED | Defense in depth                            |
| `max_repositories`     | Before creating repo-channel mapping | `packages/shared/src/database/repositoryChannel/service.ts:179` | **Hard block** | 403 PLAN_LIMIT_EXCEEDED | Mapping creation rejected                   |
| `max_team_members`     | Before creating invitation           | `services/api/src/routes/invitationRoutes.ts:83`                | **Hard block** | 403 PLAN_LIMIT_EXCEEDED | Invitation rejected                         |
| `max_team_members`     | Before accepting invitation          | `services/api/src/routes/invitationRoutes.ts:186`               | **Hard block** | 403 PLAN_LIMIT_EXCEEDED | Acceptance rejected                         |
| `max_team_members`     | Before linking user to tenant        | `packages/shared/src/database/user/serviceLifecycle.ts:107`     | **Hard block** | 403 PLAN_LIMIT_EXCEEDED | `updateUserTenant` rejected                 |
| `max_team_members`     | During OAuth auto-link (all tenants) | `services/api/src/services/authService.ts:532`                  | **Soft skip**  | Warning log only        | Membership silently skipped, login succeeds |
| `max_integrations`     | Before connecting CI provider        | `services/api/src/services/integrationService.ts:179`           | **Hard block** | 403 PLAN_LIMIT_EXCEEDED | OAuth connect rejected                      |
| Boolean features       | UI rendering                         | `services/frontend/src/components/FeatureGate.tsx`              | **UI gate**    | N/A                     | Feature hidden, upgrade prompt shown        |

### Remaining Known Gaps

| Limit Key          | Missing Enforcement Point         | Impact                                                 | Severity                  | Status                               |
| ------------------ | --------------------------------- | ------------------------------------------------------ | ------------------------- | ------------------------------------ |
| `max_repositories` | GitHub App repo selection changes | Repos added via GitHub App settings bypass limits      | **Medium**                | By design — see Edge Cases           |
| `max_team_members` | Installation handler (user link)  | `handleInstallationCreated` links sender without check | **Low** (first user only) | Accepted — always the tenant creator |

---

## Data Flow Diagrams

### Analysis Limit Enforcement

```
GitHub/GitLab Webhook
        │
        ▼
┌─────────────────────┐
│ github-app service   │
│ processCIFailure()   │  ← NO limit check here (async aggregation)
│ → adds to Redis      │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Aggregation Job      │
│ combinedAnalysis     │  ← NO limit check here
│ JobRunner            │
└─────────┬───────────┘
          │ POST /api/analyze
          ▼
┌─────────────────────┐
│ analysisRoutes.ts    │
│ handleAnalyze()      │  ← enforcePlanLimit("max_analyses_monthly") ✅
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ analysisService.ts   │
│ performAnalysis()    │  ← enforcePlanLimit("max_analyses_monthly") ✅ (defense in depth)
└─────────────────────┘
```

**Design decision:** No limit check on incoming webhooks. Webhooks are fire-and-forget — blocking them would cause GitHub/GitLab to retry. Limits are enforced when the aggregated analysis job is submitted to the API.

### Team Member Limit Enforcement

```
User logs in via OAuth
        │
        ▼
┌─────────────────────────────────┐
│ authService.ts                   │
│ autoLinkOrganizationsImpl()      │
│   → fetches user's provider orgs │
│   → for each org:                │
│     processOrgMembership()       │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│ processOrgMembership()           │
│                                  │
│  findOrCreateTenant(provider,    │
│    org.login)                    │
│         │                        │
│         ▼                        │
│  ┌─── isNew AND ───┐            │
│  │  members == 0?   │            │
│  │  YES (1st user)  │  NO        │
│  │  (skip limit     │  │         │
│  │   check) ✅       │  ▼         │
│  │                  │  checkPlan  │
│  │                  │  Limit      │
│  │                  │  ("max_team │
│  │                  │   _members")│
│  │                  │  ✅          │
│  │                  │     │       │
│  │                  │     ▼       │
│  │                  │  allowed?   │
│  │                  │  YES → add  │
│  │                  │  NO → skip  │
│  └──────────────────┘            │
│                                  │
│  addUserOrganization()           │
└──────────────────────────────────┘
```

**Fixed:** The limit check is now skipped only when the tenant has zero members (`isNew && members === 0`), ensuring only the very first user bypasses the check. All subsequent users — including concurrent logins for a newly created tenant — go through `checkPlanLimit`.

### Repository Limit Enforcement

```
User connects CI provider in UI
        │
        ▼
┌─────────────────────────────────┐
│ integrationService.ts            │
│ connectImpl()                    │
│   → enforcePlanLimit             │
│     ("max_integrations") ✅       │
│   → creates provider_connection  │
└─────────────────────────────────┘

User selects repos to monitor
        │
        ▼
┌─────────────────────────────────┐
│ repositoryChannel/service.ts     │
│ createMapping()                  │
│                                  │
│   → enforcePlanLimit             │
│     ("max_repositories") ✅       │
│   → creates repo mapping         │
└──────────────────────────────────┘
```

**Status:** Fully enforced. Repository mapping creation checks `max_repositories` at `packages/shared/src/database/repositoryChannel/service.ts:179`. GitHub App repo selection changes (made via GitHub settings, not our UI) still bypass this check — see design decision below.

### Integration Limit Enforcement

```
User initiates OAuth flow
        │
        ▼
┌─────────────────────────────────┐
│ integrationService.ts            │
│ connectImpl()                    │
│   → enforcePlanLimit             │
│     ("max_integrations") ✅       │
│   → redirects to provider OAuth  │
└─────────┬───────────────────────┘
          │ (callback)
          ▼
┌─────────────────────────────────┐
│ Creates provider_connection      │
│ row in database                  │
└──────────────────────────────────┘
```

**Status:** Fully enforced. No gaps.

---

## Frontend UX Specification

### Tiered Warning System (`UsageWarning` Component)

**File:** `services/frontend/src/components/UsageWarning.tsx`

The `UsageWarning` component renders progressively more urgent warnings based on usage percentage:

| Threshold  | Severity | Visual                                 | Message                                     |
| ---------- | -------- | -------------------------------------- | ------------------------------------------- |
| **100%+**  | Error    | Red alert, `AlertTriangle` icon        | "{Label} limit reached" — action blocked    |
| **95-99%** | Warning  | Amber alert, `AlertCircle` icon        | "{Label} almost at limit" — {N} of {M} used |
| **90-94%** | Info     | Blue alert, `Info` icon                | "{Label} usage is high" — {N} of {M} used   |
| **75-89%** | Badge    | Subtle progress bar + percentage badge | {N} / {M} with amber progress               |
| **<75%**   | None     | Nothing rendered                       | —                                           |

All warning tiers include an "Upgrade plan" link pointing to `/dashboard/settings/plan`.

**Behavior with unlimited plans:** When `limit` is `null` or `0`, the component returns `null` — no warning is ever shown for unlimited resources.

### Feature Gating (`FeatureGate` Component)

**File:** `services/frontend/src/components/FeatureGate.tsx`

Wraps UI sections that require specific boolean features on the tenant's plan.

```
┌─────────────────────────────────────────┐
│ FeatureGate feature="customRules"       │
│                                          │
│  Plan has feature? ──► Render children   │
│                                          │
│  Plan lacks feature? ──► Render fallback │
│    ┌──────────────────────────────┐      │
│    │ 🔒 Custom Rules              │      │
│    │ Available on Pro plan        │      │
│    │ [Upgrade your plan]          │      │
│    └──────────────────────────────┘      │
└──────────────────────────────────────────┘
```

**Supported feature keys:** `slackIntegration`, `customRules`, `teamAnalytics`, `ssoSaml`, `auditLog`, `apiAccess`, `prioritySupport`

### Global Error Handling for Plan Limits

**File:** `services/frontend/src/lib/apiClient.ts`

The `apiClient` response interceptor detects plan limit errors and shows a toast. It handles three error codes:

1. **`PLAN_LIMIT_EXCEEDED`** — Shows the API error message (e.g., "Plan limit exceeded") via `toast.error()`
2. **`FEATURE_NOT_AVAILABLE`** — Shows feature unavailability message
3. **`DOWNGRADE_BLOCKED`** — Shows downgrade blocked message

The interceptor fires for any 403 or 409 response, parsing the error body for structured error codes.

**Reusable hook:** `services/frontend/src/hooks/usePlanLimitError.ts` provides a `usePlanLimitError()` hook for component-level handling. It exposes:

- `checkResponse(response)` — parses API responses for `PLAN_LIMIT_EXCEEDED` metadata
- `checkUrlParams(params)` — handles redirect-based limit errors (e.g., OAuth flow redirect with `?status=limit_exceeded`)
- `planLimitError` — structured state with `limitKey`, `currentUsage`, `limit`, `currentPlan`
- `isOpen` / `dismiss` — dialog state for `UpgradePrompt` component

**Error response shape from API:**

```json
{
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "Plan limit exceeded",
    "metadata": {
      "code": "PLAN_LIMIT_EXCEEDED",
      "limitKey": "max_team_members",
      "currentUsage": 5,
      "limit": 5,
      "currentPlan": "free"
    }
  }
}
```

**Source:** Error middleware in `packages/shared/src/http/middleware.ts:26-33` passes `metadata` through when the error is an `AppError`.

> **Note:** The toast shows `errorBody.error?.message` but does not parse `metadata.limitKey` to show a user-friendly limit name or include an in-toast "Upgrade" action button. The component-level `usePlanLimitError` hook fills this gap by powering the `UpgradePrompt` dialog.

### Dashboard Usage Display

**File:** `services/frontend/src/pages/DashboardOverview.tsx`

The dashboard fetches `GET /api/v1/subscription/usage` and renders `UsageWarning` for the following limit types:

- ✅ Analyses This Month: `usageData.usage.analysesThisMonth`
- ✅ Repositories: `usageData.usage.repositories`
- ✅ Integrations: `usageData.usage.integrations`
- ✅ Team Members: `usageData.usage.teamMembers`

---

## Identified Gaps & Remediation

### Resolved Gaps

#### ~~GAP-1: Free Plan Team Member Limit~~ — ✅ RESOLVED

**Original problem:** `max_team_members = 1` meant a solo user on the free plan already filled the quota. No team could form.

**Resolution:** Migration `database/init/037_fix_free_plan_limits.sql` updates `max_team_members` from 1 to 5. `database/seed.sql` updated to match for fresh installs.

#### ~~GAP-2: Repository Limit Never Enforced~~ — ✅ RESOLVED

**Original problem:** `max_repositories = 3` exists in the plans table but no code path calls `enforcePlanLimit(tenantId, "max_repositories")`.

**Resolution:** `packages/shared/src/database/repositoryChannel/service.ts:179` now calls `enforcePlanLimit(data.tenantId, "max_repositories")` before `createMapping()`. Tests exist in `repositoryChannelService.test.ts`.

#### ~~GAP-5: Frontend PLAN_LIMIT_EXCEEDED Handling~~ — ✅ RESOLVED

**Original problem:** Frontend shows a generic error for `PLAN_LIMIT_EXCEEDED`.

**Resolution:** Two mechanisms now handle this:

1. Global interceptor in `apiClient.ts:143` detects `PLAN_LIMIT_EXCEEDED` and shows a toast with the error message
2. Reusable `usePlanLimitError()` hook in `hooks/usePlanLimitError.ts` provides structured error handling with `checkResponse()` and `checkUrlParams()` for component-level handling

#### ~~GAP-3: Auto-Link Skips Limit Check for New Tenants~~ — ✅ RESOLVED

**Original problem:** In `processOrgMembership()`, when `isNew === true`, the `checkPlanLimit` call was skipped entirely. While the first user should always be allowed, subsequent users could bypass the check if the tenant was just created.

**Resolution:** Changed the condition to `!isNew || (await countTenantMembers(tenant.id)) > 0`. Only the very first member (when tenant has 0 members) skips the limit check. All subsequent users go through `checkPlanLimit("max_team_members")`. File: `services/api/src/services/authService.ts`.

#### ~~GAP-4: Invitation Acceptance Race Condition~~ — ✅ RESOLVED

**Original problem:** Team member limit was checked at invitation _creation_ but not at _acceptance_. If the team filled up between creation and acceptance, the limit was bypassed.

**Resolution:** Added `enforcePlanLimit(invitation.tenantId, "max_team_members")` before `addUserOrganization()` in `handleAcceptInvitation`. File: `services/api/src/routes/invitationRoutes.ts`.

#### ~~GAP-6: Team Member Warning Guard~~ — ✅ RESOLVED

**Original problem:** `DashboardOverview.tsx` hid the team member `UsageWarning` when `current <= 1` (workaround for the limit-of-1 issue).

**Resolution:** Removed the `current > 1` guard. With `max_team_members` now 5, the standard `UsageWarning` thresholds (75%, 90%, 95%, 100%) work naturally. File: `services/frontend/src/pages/DashboardOverview.tsx`.

#### ~~GAP-7: Missing Integrations UsageWarning on Dashboard~~ — ✅ RESOLVED

**Original problem:** `DashboardOverview.tsx` rendered `UsageWarning` for analyses, repositories, and team members, but not for integrations. Free users (limited to 1 integration) received no dashboard warning.

**Resolution:** Added `<UsageWarning label="Integrations" ... />` to `DashboardOverview.tsx` alongside the existing warnings.

#### ~~GAP-8: Downgrade Validation Fence-Post Error~~ — ✅ RESOLVED

**Original problem:** `subscriptionRoutes.ts` downgrade guard used `isWithinLimit()` (strict `<`) to validate current usage against the target plan. A user with exactly 3 repos trying to downgrade to Free (limit=3) was incorrectly blocked because `3 < 3` is `false`.

**Resolution:** Changed downgrade validation from `!isWithinLimit(current, limit)` to `current > limit`. Since the user already has their resources (they are not adding anything), at-limit (`current === limit`) is acceptable. Removed unused `isWithinLimit` import. File: `services/api/src/routes/subscriptionRoutes.ts`.

---

## Edge Cases & Design Decisions

### Auto-Link is Fail-Open

**Decision:** Login never fails due to plan limits. If `checkPlanLimit` fails (DB error, Redis error, etc.), the system proceeds with adding the membership. If the limit is exceeded, the membership is silently skipped — the user can still access their existing tenants.

**Rationale:** Blocking login is worse than temporarily exceeding a limit. Users should always be able to access their account.

**Location:** `services/api/src/services/authService.ts:548-555`

### Invitation Race Condition

**Decision:** Check limits at both invitation creation AND acceptance.

**Rationale:** The time between creating and accepting an invitation can be hours or days. The team size may change in that window. Double-checking prevents over-capacity scenarios.

### Webhook Processing Has No Limit Check

**Decision:** GitHub/GitLab webhooks are accepted without checking `max_analyses_monthly`. Limits are enforced later when the aggregated analysis job is submitted to the API.

**Rationale:**

- Webhooks are fire-and-forget. Rejecting them causes the provider to retry (up to N times), creating unnecessary load.
- CI event data is valuable for aggregation even if the analysis limit is reached — the data can be analyzed later when capacity is available (e.g., after plan upgrade).
- The actual analysis (the expensive LLM operation) is gated at the API endpoint.

### GitHub App Repo Changes Bypass Repo Limits

**Decision:** When a user modifies their GitHub App installation to add/remove repos (via GitHub settings, not our UI), we don't check `max_repositories`.

**Rationale:** We can't reject GitHub App events. The limit is enforced when the user creates a repo-channel mapping via the UI (`repositoryChannel/service.ts:179`). Analyses for repos that were added via GitHub App settings but exceed the mapping limit will be rejected at the analysis stage.

### Downgrade Protection

**Decision:** `PUT /api/v1/subscription/plan` validates that current usage fits the target plan before allowing a downgrade.

**Location:** `services/api/src/routes/subscriptionRoutes.ts`

**Behavior:** If a Pro user (unlimited repos) has 10 repos and tries to downgrade to Free (3 repos), the API rejects the change with a 409 `DOWNGRADE_BLOCKED` error and returns which resources are over-limit.

**Note:** The downgrade guard uses `current > limit` (not `isWithinLimit`'s strict `<`), since the user already has their resources. A user with exactly 3 repos can downgrade to Free (limit=3) because `3 > 3` is `false` — they are not over the limit.

### `isWithinLimit` Uses Strict Less-Than

**Decision:** `currentUsage < limit` (not `<=`). The check is performed _before_ creating a new resource.

**Rationale:** When a user has 2 repos and the limit is 3, the check passes (`2 < 3`), and the repo is created. Now they have 3. The next attempt checks `3 < 3`, which fails — correctly blocking the 4th repo. **A limit of 3 correctly allows exactly 3 items.**

The `UsageWarning` component showing "3 of 3" at 100% is consistent — the user has used all their slots and cannot add more.

---

## Upgrade Paths

Users are guided to upgrade through multiple touchpoints:

### 1. Dashboard Usage Warnings

`UsageWarning` component on the dashboard overview page. Shows tiered warnings as usage approaches limits. Each warning includes an "Upgrade plan" link.

**Triggers at:** 75%, 90%, 95%, 100% of any limit.

### 2. Feature Gate Fallback UI

`FeatureGate` component hides unavailable features and shows an upgrade prompt instead.

**Example:** "Custom Rules — Available on Pro plan. [Upgrade your plan]"

### 3. API Error Toasts

When any API call returns 403 with `PLAN_LIMIT_EXCEEDED`, the global interceptor in `apiClient.ts` shows a toast with the error message. Additionally, the `usePlanLimitError()` hook powers the `UpgradePrompt` dialog for component-level handling with structured limit details.

### 4. Pre-Action Inline Warnings (Planned)

Before actions that could hit limits, show remaining capacity:

- "1 repository slot remaining" on the Connect Repository page
- "2 team member slots remaining" on the Team Management page

### 5. Upgrade Plan Page

All upgrade links point to `/dashboard/settings/plan`, which shows a plan comparison page with Stripe checkout integration.

---

## API Reference

### GET `/api/v1/subscription/usage`

Returns current usage counts against plan limits.

**Response:**

```json
{
  "data": {
    "planId": "free",
    "usage": {
      "repositories": { "current": 2, "limit": 3, "limited": true },
      "analysesThisMonth": { "current": 12, "limit": 50, "limited": true },
      "integrations": { "current": 1, "limit": 1, "limited": true },
      "teamMembers": { "current": 1, "limit": 5, "limited": true }
    }
  }
}
```

**`limited: false`** means the plan has no cap (`null` limit).

### Error Response (403 PLAN_LIMIT_EXCEEDED)

```json
{
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "Plan limit exceeded",
    "metadata": {
      "code": "PLAN_LIMIT_EXCEEDED",
      "limitKey": "max_team_members",
      "currentUsage": 5,
      "limit": 5,
      "currentPlan": "free"
    }
  }
}
```

**Frontend action:** Show specific toast + upgrade CTA based on `metadata.limitKey`.

### Usage Counting Methods

| Resource            | Source                         | Query                                                            |
| ------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Repositories        | Provider APIs (GitHub, GitLab) | Live API call for accurate connected repo count                  |
| Analyses This Month | `analyses` table               | `COUNT(*) WHERE tenant_id = $1 AND created_at >= first-of-month` |
| Integrations        | `provider_connections` table   | `COUNT(*) WHERE tenant_id = $1`                                  |
| Team Members        | `user_organizations` table     | `COUNT(*) WHERE tenant_id = $1`                                  |

**Note:** Repository count uses live provider API calls (expensive). For enforcement in write paths, a faster DB-only count from the repo mappings table should be used.

---

## Testing Strategy

### Unit Tests

| Test                                   | What                               | Expected                                               |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `enforcePlanLimit` with exceeded limit | Call with `currentUsage >= limit`  | Throws `AuthorizationError` with `PLAN_LIMIT_EXCEEDED` |
| `enforcePlanLimit` with capacity       | Call with `currentUsage < limit`   | Resolves (no throw)                                    |
| `enforcePlanLimit` with unlimited      | Call with `limit = null`           | Resolves (no throw)                                    |
| `checkPlanLimit` at exactly limit      | Call with `currentUsage === limit` | Returns `{ allowed: false }`                           |
| `isWithinLimit` edge cases             | `(3, 3)`, `(2, 3)`, `(0, null)`    | `false`, `true`, `true`                                |

### Integration Tests

| Test                               | What                                                 | Expected                           |
| ---------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| Free plan creates analysis         | POST `/api/analyze` with 50 existing analyses        | 403 PLAN_LIMIT_EXCEEDED            |
| Free plan connects 2nd integration | OAuth connect with 1 existing connection             | 403 PLAN_LIMIT_EXCEEDED            |
| Free plan invites 6th member       | POST invitation with 5 existing members              | 403 PLAN_LIMIT_EXCEEDED            |
| Auto-link skips over-limit member  | OAuth login with team at capacity                    | Login succeeds, membership skipped |
| Pro plan unlimited analyses        | POST `/api/analyze` with 1000 existing analyses      | 200 OK                             |
| Downgrade validation               | PUT `/subscription/plan` from pro→free with 10 repos | 400 over-limit                     |

### Frontend Tests

| Test                   | What                      | Expected                       |
| ---------------------- | ------------------------- | ------------------------------ |
| UsageWarning at 100%   | `current=3, limit=3`      | Red alert with "limit reached" |
| UsageWarning at 80%    | `current=4, limit=5`      | Progress bar + badge (80%)     |
| UsageWarning unlimited | `current=100, limit=null` | Nothing rendered               |
| FeatureGate enabled    | Feature on plan           | Children rendered              |
| FeatureGate disabled   | Feature not on plan       | Upgrade prompt rendered        |

---

## Related Documentation

- [SUBSCRIPTION_PLANS.md](./SUBSCRIPTION_PLANS.md) — Plan system architecture, database schema, API endpoints
- [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md) — Multi-tenant design
- [MULTI_TENANT_AUTH_DESIGN_REVIEW.md](./MULTI_TENANT_AUTH_DESIGN_REVIEW.md) — Auth system design review
- [DATA_MODELS.md](./DATA_MODELS.md) — Database schema reference
