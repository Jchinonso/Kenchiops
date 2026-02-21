# Subscription Plans

Tiered access control for Kenchi tenants, enforcing feature limits and resource quotas per plan.

---

## Table of Contents

1. [Overview](#overview)
2. [Plan Tiers](#plan-tiers)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [Shared Package Module](#shared-package-module)
6. [API Endpoints](#api-endpoints)
7. [Feature Gating](#feature-gating)
8. [Lazy Initialization](#lazy-initialization)
9. [Frontend Integration](#frontend-integration)
10. [Future Considerations](#future-considerations)

---

## Overview

Kenchi assigns each tenant a subscription plan that determines which features are accessible and how many resources can be consumed. The system enforces four tiers: **Free**, **Pro**, **Team**, and **Enterprise**.

Key design decisions:

- **No billing integration yet.** Plans are assigned via database rows and changeable by tenant owners or admins through the API. Stripe integration is planned but not yet implemented.
- **Lazy initialization.** Existing tenants default to the Free plan without requiring a data migration. A subscription row is created on first access via `ensureSubscription()`.
- **Service-layer enforcement.** Limits are checked by `enforcePlanLimit()` at the service layer, which throws `AuthorizationError` (HTTP 403) when a limit is exceeded.
- **NULL means unlimited.** Any limit column set to `NULL` means no cap is enforced for that resource.

---

## Plan Tiers

### Feature Matrix

|                           | Free | Pro ($49/mo) | Team ($149/mo) | Enterprise (Custom) |
| ------------------------- | ---- | ------------ | -------------- | ------------------- |
| **Repositories**          | 3    | Unlimited    | Unlimited      | Unlimited           |
| **Analyses/month**        | 50   | Unlimited    | Unlimited      | Unlimited           |
| **Integrations**          | 1    | 5            | Unlimited      | Unlimited           |
| **Team members**          | 1    | 10           | 50             | Unlimited           |
| **Slack integration**     | No   | Yes          | Yes            | Yes                 |
| **Custom analysis rules** | No   | Yes          | Yes            | Yes                 |
| **Team analytics**        | No   | Yes          | Yes            | Yes                 |
| **SSO/SAML**              | No   | No           | No             | Yes                 |
| **Audit log**             | No   | No           | Yes            | Yes                 |
| **API access**            | No   | Yes          | Yes            | Yes                 |
| **Priority support**      | No   | Yes          | Yes            | Yes                 |

### Limit Values Reference

These are the numeric limit values stored in the `plans` table. A `NULL` value means "unlimited."

| Limit Key              | Free | Pro  | Team | Enterprise |
| ---------------------- | ---- | ---- | ---- | ---------- |
| `max_repositories`     | 3    | NULL | NULL | NULL       |
| `max_analyses_monthly` | 50   | NULL | NULL | NULL       |
| `max_integrations`     | 1    | 5    | NULL | NULL       |
| `max_team_members`     | 1    | 10   | 50   | NULL       |

### Boolean Feature Flags

| Feature Key         | Free  | Pro   | Team  | Enterprise |
| ------------------- | ----- | ----- | ----- | ---------- |
| `slack_integration` | false | true  | true  | true       |
| `custom_rules`      | false | true  | true  | true       |
| `team_analytics`    | false | true  | true  | true       |
| `sso_saml`          | false | false | false | true       |
| `audit_log`         | false | false | true  | true       |
| `api_access`        | false | true  | true  | true       |
| `priority_support`  | false | true  | true  | true       |

---

## Architecture

### Component Overview

```
                  Frontend (Settings / Plan Selection)
                          |
                          v
                  API Service (routes/subscriptionRoutes.ts)
                          |
                          v
                  subscriptionService (services/subscriptionService.ts)
                    |               |
                    v               v
           enforcePlanLimit()    subscriptionRepository
                                   |
                                   v
                            packages/shared/src/database/subscription/
                              - types.ts       (row + domain types)
                              - helpers.ts     (row mappers, validation, limit checking)
                              - repository.ts  (SQL queries)
                              - index.ts       (barrel exports)
                                   |
                                   v
                            PostgreSQL
                              - plans (reference table)
                              - tenant_subscriptions (per-tenant assignment)
```

### Layer Responsibilities

| Layer             | Responsibility                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Frontend**      | Displays current plan, usage, and plan selection UI. Calls subscription API endpoints.           |
| **Routes**        | Validates request, calls service, maps domain objects to DTOs at the handler boundary.           |
| **Service**       | Business logic: `enforcePlanLimit()`, plan change validation, usage aggregation.                 |
| **Repository**    | SQL queries against `plans` and `tenant_subscriptions`. Returns domain objects (camelCase).      |
| **Shared module** | Types, helpers, row mappers, constants. Located in `packages/shared/src/database/subscription/`. |

### Dependency Flow

Following the project's ports/adapters architecture:

- Routes depend on the subscription service (plain function + closure factory pattern).
- The subscription service depends on the repository (imported from `@kenchi/shared`).
- The repository depends on the database client and returns domain objects, never raw rows.
- `enforcePlanLimit()` is called at the service layer in other services (analysis, integrations, team) to gate operations.

---

## Database Schema

### Migration: `018_subscription_plans.sql`

#### `plans` Table (Reference Data)

Stores the definition of each plan tier. Rows are seeded during migration and rarely change.

```sql
CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(50) PRIMARY KEY,                -- 'free', 'pro', 'team', 'enterprise'
    display_name VARCHAR(100) NOT NULL,
    price_monthly_cents INTEGER,               -- NULL for enterprise (custom pricing)
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- Numeric limits (NULL = unlimited)
    max_repositories INTEGER,
    max_analyses_monthly INTEGER,
    max_integrations INTEGER,
    max_team_members INTEGER,

    -- Boolean feature flags
    slack_integration BOOLEAN NOT NULL DEFAULT false,
    custom_rules BOOLEAN NOT NULL DEFAULT false,
    team_analytics BOOLEAN NOT NULL DEFAULT false,
    sso_saml BOOLEAN NOT NULL DEFAULT false,
    audit_log BOOLEAN NOT NULL DEFAULT false,
    api_access BOOLEAN NOT NULL DEFAULT false,
    priority_support BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Seeded data:**

```sql
INSERT INTO plans (id, display_name, price_monthly_cents, sort_order,
                   max_repositories, max_analyses_monthly, max_integrations, max_team_members,
                   slack_integration, custom_rules, team_analytics,
                   sso_saml, audit_log, api_access, priority_support)
VALUES
    ('free',       'Free',       0,     0, 3,    50,   1,    1,
     false, false, false, false, false, false, false),
    ('pro',        'Pro',        4900,  1, NULL, NULL, 5,    10,
     true,  true,  true,  false, false, true,  true),
    ('team',       'Team',       14900, 2, NULL, NULL, NULL, 50,
     true,  true,  true,  false, true,  true,  true),
    ('enterprise', 'Enterprise', NULL,  3, NULL, NULL, NULL, NULL,
     true,  true,  true,  true,  true,  true,  true)
ON CONFLICT (id) DO NOTHING;
```

#### `tenant_subscriptions` Table

Stores the per-tenant plan assignment. Each tenant has at most one active subscription row.

```sql
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL UNIQUE,
    plan_id VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',

    -- Billing readiness (for future Stripe integration)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Trial support
    trial_ends_at TIMESTAMP WITH TIME ZONE,

    -- Lifecycle
    changed_by VARCHAR(255),                   -- User ID who changed the plan
    changed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT fk_tenant_subscriptions_plan
        FOREIGN KEY (plan_id) REFERENCES plans(id),
    CONSTRAINT valid_subscription_status CHECK (
        status IN ('active', 'trialing', 'past_due', 'canceled')
    )
);
```

**Indexes:**

```sql
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant
    ON tenant_subscriptions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan
    ON tenant_subscriptions(plan_id);
```

**Trigger:** Uses the shared `update_updated_at_column()` trigger function (defined in earlier migrations) to keep `updated_at` current.

#### Column Details

| Column          | Type         | Description                                                                        |
| --------------- | ------------ | ---------------------------------------------------------------------------------- |
| `id`            | VARCHAR(255) | Generated via `generateEventId("sub")` in application code.                        |
| `tenant_id`     | VARCHAR(255) | Foreign key to `tenants.id`. Unique constraint ensures one row per tenant.         |
| `plan_id`       | VARCHAR(50)  | References `plans.id`. Defaults to `'free'`.                                       |
| `status`        | VARCHAR(50)  | One of: `active`, `trialing`, `past_due`, `canceled`.                              |
| `metadata`      | JSONB        | Reserved for billing provider references (e.g., Stripe customer/subscription IDs). |
| `trial_ends_at` | TIMESTAMPTZ  | When the trial period ends. NULL if not trialing.                                  |
| `changed_by`    | VARCHAR(255) | User ID of the person who last changed the plan. NULL for system-created rows.     |
| `changed_at`    | TIMESTAMPTZ  | When the plan was last changed. NULL for initial creation.                         |

---

## Shared Package Module

Located at `packages/shared/src/database/subscription/`.

### Module Structure

```
packages/shared/src/database/subscription/
  types.ts        -- Row types, domain types, input types
  helpers.ts      -- Row-to-domain mappers, validation, limit key constants
  repository.ts   -- SQL queries (plans + tenant_subscriptions)
  index.ts        -- Barrel exports
```

### Key Types

```typescript
// packages/shared/src/database/subscription/types.ts

// ==================== Enum Types ====================

export type PlanId = "free" | "pro" | "team" | "enterprise";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export type PlanLimitKey =
  | "max_repositories"
  | "max_analyses_monthly"
  | "max_integrations"
  | "max_team_members";

// ==================== Row Types ====================

export interface PlanRow {
  readonly id: PlanId;
  readonly display_name: string;
  readonly price_monthly_cents: number | null;
  readonly sort_order: number;
  readonly max_repositories: number | null;
  readonly max_analyses_monthly: number | null;
  readonly max_integrations: number | null;
  readonly max_team_members: number | null;
  readonly slack_integration: boolean;
  readonly custom_rules: boolean;
  readonly team_analytics: boolean;
  readonly sso_saml: boolean;
  readonly audit_log: boolean;
  readonly api_access: boolean;
  readonly priority_support: boolean;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface TenantSubscriptionRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly plan_id: PlanId;
  readonly status: SubscriptionStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly trial_ends_at: Date | null;
  readonly changed_by: string | null;
  readonly changed_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types ====================

export interface Plan {
  readonly id: PlanId;
  readonly displayName: string;
  readonly priceMonthlyCents: number | null;
  readonly sortOrder: number;
  readonly limits: PlanLimits;
  readonly features: PlanFeatures;
}

export interface PlanLimits {
  readonly maxRepositories: number | null;
  readonly maxAnalysesMonthly: number | null;
  readonly maxIntegrations: number | null;
  readonly maxTeamMembers: number | null;
}

export interface PlanFeatures {
  readonly slackIntegration: boolean;
  readonly customRules: boolean;
  readonly teamAnalytics: boolean;
  readonly ssoSaml: boolean;
  readonly auditLog: boolean;
  readonly apiAccess: boolean;
  readonly prioritySupport: boolean;
}

export interface TenantSubscription {
  readonly id: string;
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly status: SubscriptionStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly trialEndsAt: Date | null;
  readonly changedBy: string | null;
  readonly changedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ==================== Input Types ====================

export interface ChangePlanInput {
  readonly tenantId: string;
  readonly newPlanId: PlanId;
  readonly changedBy: string;
}
```

### Key Helper Functions

```typescript
// packages/shared/src/database/subscription/helpers.ts

/**
 * Map a PlanRow to a Plan domain object.
 */
export const rowToPlan = (row: PlanRow): Plan => ({ ... });

/**
 * Map a TenantSubscriptionRow to a TenantSubscription domain object.
 */
export const rowToTenantSubscription = (row: TenantSubscriptionRow): TenantSubscription => ({ ... });

/**
 * Get the numeric limit value for a specific limit key from a Plan.
 * Returns null if the plan has no cap (unlimited).
 */
export const getPlanLimit = (plan: Plan, limitKey: PlanLimitKey): number | null => ({ ... });

/**
 * Check whether a plan has a specific boolean feature enabled.
 */
export const hasPlanFeature = (plan: Plan, featureKey: keyof PlanFeatures): boolean => ({ ... });
```

### Repository Functions

```typescript
// packages/shared/src/database/subscription/repository.ts

/** Get all available plans, ordered by sort_order. */
export const getAllPlans = async (): Promise<readonly Plan[]> => { ... };

/** Get a plan by ID. Returns null if not found. */
export const getPlanById = async (planId: PlanId): Promise<Plan | null> => { ... };

/** Get a tenant's subscription. Returns null if no row exists. */
export const getSubscriptionByTenant = async (tenantId: string): Promise<TenantSubscription | null> => { ... };

/**
 * Ensure a tenant has a subscription row.
 * Uses INSERT ... ON CONFLICT DO NOTHING (upsert) to create a free plan row
 * if none exists. Returns the subscription.
 */
export const ensureSubscription = async (tenantId: string): Promise<TenantSubscription> => { ... };

/** Change a tenant's plan. Updates the plan_id, changed_by, and changed_at columns. */
export const changePlan = async (input: ChangePlanInput): Promise<TenantSubscription> => { ... };
```

### Barrel Exports

All types, helpers, and repository functions are re-exported from:

- `packages/shared/src/database/subscription/index.ts`
- `packages/shared/src/database/index.ts`
- `packages/shared/src/index.ts`

Consumers import from `@kenchi/shared`:

```typescript
import {
  type Plan,
  type PlanId,
  type PlanLimits,
  type PlanFeatures,
  type PlanLimitKey,
  type TenantSubscription,
  type SubscriptionStatus,
  type ChangePlanInput,
  getAllPlans,
  getPlanById,
  getSubscriptionByTenant,
  ensureSubscription,
  changePlan,
  getPlanLimit,
  hasPlanFeature,
} from "@kenchi/shared";
```

---

## API Endpoints

All endpoints are under the `/api/v1/subscription` prefix. All require authentication (valid JWT via cookie or `Authorization` header).

### GET `/api/v1/subscription`

Returns the current tenant's plan and subscription details.

**Auth:** Any authenticated user with a tenant.

**Response (200):**

```json
{
  "data": {
    "plan": {
      "id": "pro",
      "displayName": "Pro",
      "priceMonthlyCents": 4900,
      "limits": {
        "maxRepositories": null,
        "maxAnalysesMonthly": null,
        "maxIntegrations": 5,
        "maxTeamMembers": 10
      },
      "features": {
        "slackIntegration": true,
        "customRules": true,
        "teamAnalytics": true,
        "ssoSaml": false,
        "auditLog": false,
        "apiAccess": true,
        "prioritySupport": true
      }
    },
    "subscription": {
      "planId": "pro",
      "status": "active",
      "trialEndsAt": null,
      "changedAt": "2026-02-15T10:30:00.000Z"
    }
  }
}
```

### GET `/api/v1/subscription/plans`

Returns all available plans for display on the plan selection page.

**Auth:** Any authenticated user.

**Response (200):**

```json
{
  "data": [
    {
      "id": "free",
      "displayName": "Free",
      "priceMonthlyCents": 0,
      "limits": {
        "maxRepositories": 3,
        "maxAnalysesMonthly": 50,
        "maxIntegrations": 1,
        "maxTeamMembers": 1
      },
      "features": {
        "slackIntegration": false,
        "customRules": false,
        "teamAnalytics": false,
        "ssoSaml": false,
        "auditLog": false,
        "apiAccess": false,
        "prioritySupport": false
      }
    },
    {
      "id": "pro",
      "displayName": "Pro",
      "priceMonthlyCents": 4900,
      "limits": {
        "maxRepositories": null,
        "maxAnalysesMonthly": null,
        "maxIntegrations": 5,
        "maxTeamMembers": 10
      },
      "features": {
        "slackIntegration": true,
        "customRules": true,
        "teamAnalytics": true,
        "ssoSaml": false,
        "auditLog": false,
        "apiAccess": true,
        "prioritySupport": true
      }
    },
    {
      "id": "team",
      "displayName": "Team",
      "priceMonthlyCents": 14900,
      "limits": {
        "maxRepositories": null,
        "maxAnalysesMonthly": null,
        "maxIntegrations": null,
        "maxTeamMembers": 50
      },
      "features": {
        "slackIntegration": true,
        "customRules": true,
        "teamAnalytics": true,
        "ssoSaml": false,
        "auditLog": true,
        "apiAccess": true,
        "prioritySupport": true
      }
    },
    {
      "id": "enterprise",
      "displayName": "Enterprise",
      "priceMonthlyCents": null,
      "limits": {
        "maxRepositories": null,
        "maxAnalysesMonthly": null,
        "maxIntegrations": null,
        "maxTeamMembers": null
      },
      "features": {
        "slackIntegration": true,
        "customRules": true,
        "teamAnalytics": true,
        "ssoSaml": true,
        "auditLog": true,
        "apiAccess": true,
        "prioritySupport": true
      }
    }
  ]
}
```

### GET `/api/v1/subscription/usage`

Returns the tenant's current usage counts against their plan limits.

**Auth:** Any authenticated user with a tenant.

**Response (200):**

```json
{
  "data": {
    "planId": "pro",
    "usage": {
      "repositories": { "current": 7, "limit": null, "limited": false },
      "analysesThisMonth": { "current": 142, "limit": null, "limited": false },
      "integrations": { "current": 3, "limit": 5, "limited": true },
      "teamMembers": { "current": 4, "limit": 10, "limited": true }
    }
  }
}
```

The `limited` field is `true` when a numeric cap exists (i.e., the plan limit is not `NULL`). When `limited` is `false`, the `limit` field is `null` (unlimited).

### PUT `/api/v1/subscription/plan`

Change the tenant's subscription plan.

**Auth:** Owner or Admin role only. Uses `requireRole("owner", "admin")` middleware.

**Request body:**

```json
{
  "planId": "team"
}
```

**Response (200):**

```json
{
  "data": {
    "subscription": {
      "planId": "team",
      "status": "active",
      "changedAt": "2026-02-21T14:00:00.000Z"
    },
    "previousPlanId": "pro"
  }
}
```

**Error responses:**

| Status | Code                   | When                                 |
| ------ | ---------------------- | ------------------------------------ |
| 400    | `VALIDATION_ERROR`     | Missing or invalid `planId`.         |
| 401    | `AUTHENTICATION_ERROR` | No valid session.                    |
| 403    | `AUTHORIZATION_ERROR`  | User role is not `owner` or `admin`. |
| 404    | `NOT_FOUND`            | Plan ID does not exist.              |

**Example `curl`:**

```bash
curl -X PUT https://api.kenchi.dev/api/v1/subscription/plan \
  -H "Content-Type: application/json" \
  -H "Cookie: kenchi_access=<jwt>" \
  -d '{"planId": "team"}'
```

---

## Feature Gating

### `enforcePlanLimit()`

The central enforcement function. Called at the service layer before any operation that is subject to plan limits.

```typescript
/**
 * Check whether a tenant's current usage exceeds their plan limit for the given key.
 * If the limit is exceeded, throws AuthorizationError with 403 status.
 * If the limit is NULL (unlimited), the check passes immediately.
 *
 * @param tenantId - The tenant to check
 * @param limitKey - Which plan limit to enforce
 * @param context  - Request context for logging
 * @throws {AuthorizationError} When the plan limit is exceeded
 */
const enforcePlanLimit = async (
  tenantId: string,
  limitKey: PlanLimitKey,
  context: RequestContext
): Promise<void> => {
  const subscription = await ensureSubscription(tenantId);
  const plan = await getPlanById(subscription.planId);

  invariant(plan !== null, `Plan ${subscription.planId} must exist in plans table`);

  const limit = getPlanLimit(plan, limitKey);

  // NULL limit = unlimited, no enforcement needed
  if (limit === null) {
    return;
  }

  const currentUsage = await getCurrentUsage(tenantId, limitKey);

  if (currentUsage >= limit) {
    throw new AuthorizationError("Plan limit exceeded", {
      operation: "enforcePlanLimit",
      metadata: {
        code: "PLAN_LIMIT_EXCEEDED",
        limitKey,
        currentUsage,
        limit,
        currentPlan: subscription.planId,
      },
    });
  }
};
```

### Error Shape

When a limit is exceeded, the API returns:

```json
{
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "Plan limit exceeded",
    "requestId": "abc-123-def",
    "metadata": {
      "code": "PLAN_LIMIT_EXCEEDED",
      "limitKey": "max_integrations",
      "currentUsage": 5,
      "limit": 5,
      "currentPlan": "pro"
    }
  }
}
```

The frontend uses the `metadata.code === "PLAN_LIMIT_EXCEEDED"` check to display the upgrade prompt component instead of a generic error message.

### Integration Points

`enforcePlanLimit()` is called in these service functions:

| Service                 | Limit Key              | When                                                 |
| ----------------------- | ---------------------- | ---------------------------------------------------- |
| `analysisService`       | `max_analyses_monthly` | Before creating a new CI failure analysis.           |
| `integrationService`    | `max_integrations`     | Before connecting a new CI provider (OAuth flow).    |
| Team management service | `max_team_members`     | Before inviting a new team member.                   |
| Risk rules service      | (feature flag check)   | Before creating a custom risk rule (`custom_rules`). |

For boolean feature flags (e.g., `custom_rules`, `audit_log`), the check uses `hasPlanFeature()`:

```typescript
const plan = await getPlanById(subscription.planId);
if (!hasPlanFeature(plan, "customRules")) {
  throw new AuthorizationError("Feature not available on current plan", {
    operation: "createCustomRiskRule",
    metadata: {
      code: "PLAN_FEATURE_UNAVAILABLE",
      feature: "customRules",
      currentPlan: subscription.planId,
    },
  });
}
```

### Usage Counting

`getCurrentUsage()` aggregates the current count for each limit key:

| Limit Key              | How Usage Is Counted                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| `max_repositories`     | Count of distinct repositories with events for the tenant.                      |
| `max_analyses_monthly` | Count of analysis records created in the current calendar month for the tenant. |
| `max_integrations`     | Count of active rows in `provider_connections` for the tenant.                  |
| `max_team_members`     | Count of active users associated with the tenant.                               |

---

## Lazy Initialization

The subscription system does not require a data migration for existing tenants. Instead, it uses a lazy initialization pattern:

1. **`getSubscriptionByTenant(tenantId)`** queries `tenant_subscriptions` for the tenant. Returns `null` if no row exists.

2. **`ensureSubscription(tenantId)`** performs an upsert: if no subscription row exists, it inserts one with `plan_id = 'free'` and `status = 'active'`. Uses `INSERT ... ON CONFLICT (tenant_id) DO NOTHING` to avoid race conditions.

3. **Callers that need the plan** (e.g., `enforcePlanLimit()`, the subscription API endpoints) always call `ensureSubscription()` to guarantee a row exists before querying.

4. **Read-only callers** (e.g., dashboard badge showing plan name) can use `getSubscriptionByTenant()` and treat a `null` result as the free plan without creating a row.

```typescript
// Lazy init example: guaranteed to return a subscription
const subscription = await ensureSubscription(tenantId);
const plan = await getPlanById(subscription.planId);

// Read-only example: no row creation
const subscription = await getSubscriptionByTenant(tenantId);
const planId = subscription?.planId ?? "free";
```

This design means:

- No migration needed to backfill existing tenants.
- New tenants get a free plan row on first interaction with any plan-gated feature.
- The `plans` table is seeded once during migration and serves as the source of truth for plan definitions.

---

## Frontend Integration

### Components

Three frontend components interact with the subscription system:

**1. Plan Card (Settings Page)**

Displayed on the tenant settings page. Shows the current plan name, key limits, and a "Change Plan" button. Fetches data from `GET /api/v1/subscription`.

**2. Plan Selection Page**

Full-page plan comparison with a feature matrix. Fetches all plans from `GET /api/v1/subscription/plans`. The "Current Plan" tier is highlighted. Selecting a different plan calls `PUT /api/v1/subscription/plan`.

**3. Upgrade Prompt Component**

Displayed inline when a `PLAN_LIMIT_EXCEEDED` error is returned by any API call. Shows the current usage, the limit, and a call-to-action to upgrade. The component detects the error by checking `error.metadata.code === "PLAN_LIMIT_EXCEEDED"` in the TanStack Query error handler.

### Data Fetching Pattern

Per the project's frontend standards, all server state is managed via TanStack Query:

```typescript
// hooks/useSubscription.ts
const useSubscription = () =>
  useQuery({
    queryKey: ["subscription"],
    queryFn: () => fetchApi("/api/v1/subscription"),
  });

const usePlans = () =>
  useQuery({
    queryKey: ["subscription", "plans"],
    queryFn: () => fetchApi("/api/v1/subscription/plans"),
  });

const useSubscriptionUsage = () =>
  useQuery({
    queryKey: ["subscription", "usage"],
    queryFn: () => fetchApi("/api/v1/subscription/usage"),
  });

const useChangePlan = () =>
  useMutation({
    mutationFn: (planId: PlanId) =>
      fetchApi("/api/v1/subscription/plan", {
        method: "PUT",
        body: JSON.stringify({ planId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
```

---

## Future Considerations

### Billing Integration (Stripe)

The `metadata` JSONB column on `tenant_subscriptions` is reserved for storing billing provider references once Stripe integration is implemented:

```json
{
  "stripeCustomerId": "cus_abc123",
  "stripeSubscriptionId": "sub_def456",
  "stripePriceId": "price_ghi789"
}
```

The `status` column already supports `past_due` and `canceled` states for when Stripe webhooks update subscription status based on payment events.

### Trial Periods

The `trial_ends_at` column and `trialing` status are ready for use. When a tenant starts a trial:

1. Set `plan_id` to the trial plan (e.g., `pro`).
2. Set `status` to `trialing`.
3. Set `trial_ends_at` to the trial end date.

A scheduled job would then downgrade expired trials back to `free` and set `status` to `active`.

### Usage Caching

At scale, counting usage on every `enforcePlanLimit()` call will become expensive. The planned approach:

- Cache usage counts in Redis with a short TTL (60-300 seconds).
- Invalidate the cache on write operations (new analysis, new integration, etc.).
- Use `cacheGetOrSet()` from `@kenchi/shared` for the cache-aside pattern.

### Usage-Based Overages

For tenants that exceed their plan limits, a future overage system could:

- Allow usage above the cap with per-unit pricing.
- Track overage counts in a `tenant_usage` table.
- Bill overages via Stripe metered billing.

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- System architecture overview
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) -- Detailed design
- [DATA_MODELS.md](./DATA_MODELS.md) -- Data structures and schemas
- [PRICING_TIERS.md](./PRICING_TIERS.md) -- Earlier pricing tier planning document (superseded by this document for plan enforcement details)
- [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md) -- Multi-tenant design
