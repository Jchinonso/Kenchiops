/**
 * Subscription Module
 *
 * Database operations for subscription plans and tenant plan assignments.
 *
 * @module database/subscription
 */

// Types (domain-only; PlanRow and TenantSubscriptionRow are internal)
export type {
  PlanId,
  SubscriptionStatus,
  PlanLimitKey,
  PlanFeatureKey,
  PlanLimits,
  PlanFeatures,
  Plan,
  TenantSubscription,
  ChangePlanInput,
  PlanUsage,
  PlanLimitCheckResult,
  SubscriptionWithPlan,
  UsageLimitDetail,
  SubscriptionUsageResponse,
} from "./types.js";

// Helpers (public validators and limit checkers; row mappers are internal)
export {
  validatePlanId,
  validateChangePlanInput,
  isWithinLimit,
  getPlanLimit,
  hasPlanFeature,
  getUsageForLimitKey,
} from "./helpers.js";

// Repository
export {
  getAllPlans,
  getPlanById,
  getSubscriptionByTenant,
  getSubscriptionWithPlan,
  ensureSubscription,
  changePlan,
  getTenantUsage,
  checkPlanLimit,
  enforcePlanLimit,
} from "./repository.js";
