/**
 * Subscription Helpers
 *
 * Row-to-domain mappers, validation, and limit checking utilities.
 *
 * @module database/subscription/helpers
 */

import { ValidationError } from "../common.js";
import {
  VALID_PLAN_TIERS,
  LIMIT_KEY_TO_PLAN_FIELD,
  LIMIT_KEY_TO_USAGE_FIELD,
} from "../../constants/subscription.js";
import type {
  PlanRow,
  Plan,
  PlanId,
  PlanLimitKey,
  PlanFeatureKey,
  PlanUsage,
  TenantSubscriptionRow,
  TenantSubscription,
  SubscriptionStatus,
  ChangePlanInput,
} from "./types.js";

// ==================== Row Mappers ====================

/**
 * Map a PlanRow to a Plan domain object.
 */
export const rowToPlan = (row: PlanRow): Plan => ({
  id: row.id as PlanId,
  displayName: row.display_name,
  priceMonthlyCents: row.price_monthly_cents,
  sortOrder: row.sort_order,
  limits: {
    maxRepositories: row.max_repositories,
    maxAnalysesMonthly: row.max_analyses_monthly,
    maxIntegrations: row.max_integrations,
    maxTeamMembers: row.max_team_members,
  },
  features: {
    slackIntegration: row.slack_integration,
    customRules: row.custom_rules,
    teamAnalytics: row.team_analytics,
    ssoSaml: row.sso_saml,
    auditLog: row.audit_log,
    apiAccess: row.api_access,
    prioritySupport: row.priority_support,
  },
});

/**
 * Map a TenantSubscriptionRow to a TenantSubscription domain object.
 */
export const rowToSubscription = (row: TenantSubscriptionRow): TenantSubscription => ({
  id: row.id,
  tenantId: row.tenant_id,
  planId: row.plan_id as PlanId,
  status: row.status as SubscriptionStatus,
  metadata: row.metadata,
  trialEndsAt: row.trial_ends_at,
  changedBy: row.changed_by,
  changedAt: row.changed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  stripeCustomerId: row.stripe_customer_id ?? null,
  stripeSubscriptionId: row.stripe_subscription_id ?? null,
  currentPeriodEnd: row.current_period_end ?? null,
});

// ==================== Validation ====================

/**
 * Validate that a plan ID is one of the known tiers.
 *
 * @throws ValidationError if the plan ID is invalid
 */
export const validatePlanId = (planId: string): PlanId => {
  if (!VALID_PLAN_TIERS.has(planId as PlanId)) {
    throw new ValidationError(
      `Invalid plan ID: "${planId}". Must be one of: free, pro, team, enterprise`,
      {
        operation: "validatePlanId",
        metadata: { planId },
      }
    );
  }
  return planId as PlanId;
};

/**
 * Validate a ChangePlanInput.
 *
 * @throws ValidationError if any field is invalid
 */
export const validateChangePlanInput = (input: ChangePlanInput): void => {
  if (!input.tenantId || input.tenantId.trim().length === 0) {
    throw new ValidationError("Tenant ID is required", {
      operation: "validateChangePlanInput",
      metadata: { field: "tenantId" },
    });
  }
  if (!input.changedBy || input.changedBy.trim().length === 0) {
    throw new ValidationError("Changed by (user ID) is required", {
      operation: "validateChangePlanInput",
      metadata: { field: "changedBy" },
    });
  }
  validatePlanId(input.newPlanId);
};

// ==================== Limit Checking ====================

/**
 * Check whether a usage count is within the plan limit.
 * Returns true when `currentUsage < limit` (strict less-than).
 * At-limit (currentUsage === limit) is NOT allowed — returns false.
 * NULL limit means unlimited (always within).
 */
export const isWithinLimit = (currentUsage: number, limit: number | null): boolean =>
  limit === null || currentUsage < limit;

/**
 * Get the numeric limit value for a specific limit key from a Plan.
 * Returns null if the plan has no cap (unlimited).
 */
export const getPlanLimit = (plan: Plan, limitKey: PlanLimitKey): number | null => {
  const field = LIMIT_KEY_TO_PLAN_FIELD[limitKey];
  return plan.limits[field];
};

/**
 * Check whether a plan has a specific boolean feature enabled.
 */
export const hasPlanFeature = (plan: Plan, featureKey: PlanFeatureKey): boolean =>
  plan.features[featureKey];

/**
 * Get the current usage count for a specific limit key from a PlanUsage.
 */
export const getUsageForLimitKey = (usage: PlanUsage, limitKey: PlanLimitKey): number => {
  const field = LIMIT_KEY_TO_USAGE_FIELD[limitKey];
  return usage[field];
};
