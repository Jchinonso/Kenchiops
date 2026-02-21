/**
 * Subscription Constants
 *
 * Centralized configuration for subscription plans and tenant subscriptions.
 */

// ==================== Plan Tiers ====================

export const PLAN_TIERS = {
  FREE: "free",
  PRO: "pro",
  TEAM: "team",
  ENTERPRISE: "enterprise",
} as const;

export const VALID_PLAN_TIERS = new Set(["free", "pro", "team", "enterprise"] as const);

export const DEFAULT_PLAN_ID = "free" as const;

// ==================== Subscription Status ====================

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  TRIALING: "trialing",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
} as const;

// ==================== Plan Limit Keys ====================

export const PLAN_LIMIT_KEYS = {
  MAX_REPOSITORIES: "max_repositories",
  MAX_ANALYSES_MONTHLY: "max_analyses_monthly",
  MAX_INTEGRATIONS: "max_integrations",
  MAX_TEAM_MEMBERS: "max_team_members",
} as const;

// ==================== Limit Key to Usage Field Mapping ====================

/**
 * Maps PlanLimitKey values to the corresponding PlanLimits property name.
 */
export const LIMIT_KEY_TO_PLAN_FIELD = {
  max_repositories: "maxRepositories",
  max_analyses_monthly: "maxAnalysesMonthly",
  max_integrations: "maxIntegrations",
  max_team_members: "maxTeamMembers",
} as const;

/**
 * Maps PlanLimitKey values to the corresponding PlanUsage property name.
 */
export const LIMIT_KEY_TO_USAGE_FIELD = {
  max_repositories: "repositories",
  max_analyses_monthly: "analysesThisMonth",
  max_integrations: "integrations",
  max_team_members: "teamMembers",
} as const;

// ==================== Query Templates ====================

/**
 * SQL queries for plans table operations.
 * All queries use parameterized statements.
 */
export const PLAN_QUERIES = {
  FIND_ALL_ACTIVE: `SELECT * FROM plans ORDER BY sort_order ASC`,
  FIND_BY_ID: `SELECT * FROM plans WHERE id = $1`,
} as const;

/**
 * SQL queries for tenant_subscriptions table operations.
 * All queries use parameterized statements.
 */
export const SUBSCRIPTION_QUERIES = {
  FIND_BY_TENANT: `SELECT * FROM tenant_subscriptions WHERE tenant_id = $1`,

  UPSERT: `INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (tenant_id) DO NOTHING
            RETURNING *`,

  UPDATE_PLAN: `UPDATE tenant_subscriptions
                SET plan_id = $1,
                    changed_by = $2,
                    changed_at = NOW(),
                    updated_at = NOW()
                WHERE tenant_id = $3
                RETURNING *`,

  COUNT_REPOSITORIES: `SELECT COUNT(DISTINCT repository) AS count
                       FROM events
                       WHERE tenant_id = $1`,

  COUNT_ANALYSES_THIS_MONTH: `SELECT COUNT(*) AS count
                              FROM analyses
                              WHERE tenant_id = $1
                                AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,

  COUNT_INTEGRATIONS: `SELECT COUNT(*) AS count
                       FROM provider_connections
                       WHERE tenant_id = $1
                         AND is_active = true`,

  COUNT_TEAM_MEMBERS: `SELECT COUNT(*) AS count
                       FROM users
                       WHERE tenant_id = $1
                         AND status = 'active'`,
} as const;

// ==================== Subscription Defaults ====================

export const SUBSCRIPTION_DEFAULTS = {
  ID_PREFIX: "sub",
} as const;
