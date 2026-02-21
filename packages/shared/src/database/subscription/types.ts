/**
 * Subscription Types
 *
 * Type definitions for subscription plans and tenant subscriptions.
 *
 * @module database/subscription/types
 */

// ==================== Enum Types ====================

export type PlanId = "free" | "pro" | "team" | "enterprise";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export type PlanLimitKey =
  | "max_repositories"
  | "max_analyses_monthly"
  | "max_integrations"
  | "max_team_members";

export type PlanFeatureKey =
  | "slackIntegration"
  | "customRules"
  | "teamAnalytics"
  | "ssoSaml"
  | "auditLog"
  | "apiAccess"
  | "prioritySupport";

// ==================== Row Types (snake_case, matches DB) ====================

export interface PlanRow {
  readonly id: string;
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
  readonly plan_id: string;
  readonly status: string;
  readonly metadata: Record<string, unknown>;
  readonly trial_ends_at: Date | null;
  readonly changed_by: string | null;
  readonly changed_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types (camelCase) ====================

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

export interface Plan {
  readonly id: PlanId;
  readonly displayName: string;
  readonly priceMonthlyCents: number | null;
  readonly sortOrder: number;
  readonly limits: PlanLimits;
  readonly features: PlanFeatures;
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

// ==================== Computed / Result Types ====================

export interface PlanUsage {
  readonly repositories: number;
  readonly analysesThisMonth: number;
  readonly integrations: number;
  readonly teamMembers: number;
}

export interface PlanLimitCheckResult {
  readonly allowed: boolean;
  readonly currentUsage: number;
  readonly limit: number | null;
  readonly limitKey: PlanLimitKey;
  readonly planId: PlanId;
}

export interface SubscriptionWithPlan {
  readonly subscription: TenantSubscription;
  readonly plan: Plan;
}

export interface UsageLimitDetail {
  readonly current: number;
  readonly limit: number | null;
  readonly limited: boolean;
}

export interface SubscriptionUsageResponse {
  readonly planId: PlanId;
  readonly usage: {
    readonly repositories: UsageLimitDetail;
    readonly analysesThisMonth: UsageLimitDetail;
    readonly integrations: UsageLimitDetail;
    readonly teamMembers: UsageLimitDetail;
  };
}
