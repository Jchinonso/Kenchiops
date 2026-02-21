/**
 * Subscription Module
 *
 * Database operations for subscription plans and tenant plan assignments.
 *
 * @module database/subscription
 */

// Types
export type {
  PlanId,
  SubscriptionStatus,
  PlanLimitKey,
  PlanFeatureKey,
  PlanRow,
  TenantSubscriptionRow,
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

// Helpers
export {
  rowToPlan,
  rowToSubscription,
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
