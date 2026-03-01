/**
 * Subscription Repository
 *
 * Database operations for plans and tenant subscriptions.
 *
 * @module database/subscription/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  parseDbCount,
  NotFoundError,
  ValidationError,
} from "../common.js";
import { AuthorizationError, invariant } from "../../core/errors.js";
import { findById as findTenantById } from "../tenant/serviceLookup.js";
import {
  PLAN_QUERIES,
  SUBSCRIPTION_QUERIES,
  SUBSCRIPTION_DEFAULTS,
  DEFAULT_PLAN_ID,
} from "../../constants/subscription.js";
import { AUDIT_ACTIONS } from "../../constants/tenant.js";
import type {
  PlanRow,
  TenantSubscriptionRow,
  Plan,
  PlanId,
  PlanLimitKey,
  TenantSubscription,
  SubscriptionWithPlan,
  PlanUsage,
  PlanLimitCheckResult,
  ChangePlanInput,
} from "./types.js";
import {
  rowToPlan,
  rowToSubscription,
  validateChangePlanInput,
  getPlanLimit,
  isWithinLimit,
  getUsageForLimitKey,
} from "./helpers.js";

const logger = createLogger("subscription-repository");

// ==================== Plan Queries ====================

/**
 * Get all available plans, ordered by sort_order.
 */
export const getAllPlans = async (): Promise<readonly Plan[]> => {
  try {
    const result = await query<PlanRow>(PLAN_QUERIES.FIND_ALL_ACTIVE);
    return Object.freeze(result.rows.map(rowToPlan));
  } catch (error) {
    logger.error("Failed to get all plans", { error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Get a plan by ID. Returns null if not found.
 */
export const getPlanById = async (planId: PlanId): Promise<Plan | null> => {
  try {
    const result = await query<PlanRow>(PLAN_QUERIES.FIND_BY_ID, [planId]);
    return result.rows.length > 0 ? rowToPlan(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get plan by ID", { planId, error: getErrorMessage(error) });
    throw error;
  }
};

// ==================== Subscription Queries ====================

/**
 * Get a tenant's subscription. Returns null if no row exists.
 * Callers should treat null as the free plan.
 */
export const getSubscriptionByTenant = async (
  tenantId: string
): Promise<TenantSubscription | null> => {
  try {
    const result = await query<TenantSubscriptionRow>(SUBSCRIPTION_QUERIES.FIND_BY_TENANT, [
      tenantId,
    ]);
    return result.rows.length > 0 ? rowToSubscription(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get subscription by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get a tenant's subscription joined with the plan.
 * Returns null if no subscription row exists.
 */
export const getSubscriptionWithPlan = async (
  tenantId: string
): Promise<SubscriptionWithPlan | null> => {
  const subscription = await getSubscriptionByTenant(tenantId);
  if (!subscription) {
    return null;
  }

  const plan = await getPlanById(subscription.planId);
  invariant(plan !== null, `Plan ${subscription.planId} must exist in plans table`);

  return { subscription, plan };
};

/**
 * Ensure a tenant has a subscription row.
 * Uses INSERT ... ON CONFLICT DO NOTHING (upsert) to create a free plan row
 * if none exists. Returns the subscription.
 */
export const ensureSubscription = async (tenantId: string): Promise<TenantSubscription> => {
  try {
    const id = generateEventId(SUBSCRIPTION_DEFAULTS.ID_PREFIX);

    // Attempt upsert -- returns the new row if inserted, empty if already exists
    const upsertResult = await query<TenantSubscriptionRow>(SUBSCRIPTION_QUERIES.UPSERT, [
      id,
      tenantId,
      DEFAULT_PLAN_ID,
    ]);

    if (upsertResult.rows.length > 0) {
      logger.info("Created free plan subscription for tenant", { tenantId });
      return rowToSubscription(upsertResult.rows[0]);
    }

    // Row already existed -- fetch it
    const existing = await getSubscriptionByTenant(tenantId);
    invariant(existing !== null, `Subscription must exist after upsert for tenant ${tenantId}`);
    return existing;
  } catch (error) {
    logger.error("Failed to ensure subscription", { tenantId, error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Change a tenant's plan.
 * Validates input, updates the row, and logs an audit event.
 *
 * @throws ValidationError if input is invalid
 * @throws NotFoundError if the target plan does not exist or tenant has no subscription
 */
export const changePlan = async (input: ChangePlanInput): Promise<TenantSubscription> => {
  validateChangePlanInput(input);

  // Personal tenants are locked to the free plan
  const tenant = await findTenantById(input.tenantId);
  if (tenant?.tenantType === "personal") {
    throw new ValidationError("Personal accounts cannot change plans", {
      operation: "changePlan",
      metadata: { tenantId: input.tenantId },
    });
  }

  // Verify the target plan exists
  const targetPlan = await getPlanById(input.newPlanId);
  if (!targetPlan) {
    throw new NotFoundError(`Plan "${input.newPlanId}" not found`, {
      operation: "changePlan",
      metadata: { planId: input.newPlanId },
    });
  }

  // Ensure the tenant has a subscription row first
  await ensureSubscription(input.tenantId);

  try {
    const result = await query<TenantSubscriptionRow>(SUBSCRIPTION_QUERIES.UPDATE_PLAN, [
      input.newPlanId,
      input.changedBy,
      input.tenantId,
    ]);

    // ensureSubscription guarantees a row exists, so UPDATE must return it
    invariant(
      result.rows.length > 0,
      `Subscription row must exist after ensureSubscription for tenant ${input.tenantId}`
    );

    const updated = rowToSubscription(result.rows[0]);

    logger.info("Tenant plan changed", {
      tenantId: input.tenantId,
      newPlanId: input.newPlanId,
      changedBy: input.changedBy,
    });

    // Log audit event (best-effort; don't fail the plan change if audit fails)
    try {
      const { logAuditEvent } = await import("../tenant/index.js");
      await logAuditEvent(input.tenantId, AUDIT_ACTIONS.PLAN_CHANGED, {
        newPlanId: input.newPlanId,
        changedBy: input.changedBy,
      });
    } catch (auditError) {
      logger.warn("Failed to log plan change audit event", {
        tenantId: input.tenantId,
        error: getErrorMessage(auditError),
      });
    }

    return updated;
  } catch (error) {
    logger.error("Failed to change plan", {
      tenantId: input.tenantId,
      newPlanId: input.newPlanId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Usage Counting ====================

/**
 * Get current usage counts for a tenant across all limit dimensions.
 * Runs 4 COUNT queries in parallel.
 */
export const getTenantUsage = async (tenantId: string): Promise<PlanUsage> => {
  try {
    const [repoResult, analysesResult, integrationsResult, membersResult] = await Promise.all([
      query<{ readonly count: string }>(SUBSCRIPTION_QUERIES.COUNT_REPOSITORIES, [tenantId]),
      query<{ readonly count: string }>(SUBSCRIPTION_QUERIES.COUNT_ANALYSES_THIS_MONTH, [tenantId]),
      query<{ readonly count: string }>(SUBSCRIPTION_QUERIES.COUNT_INTEGRATIONS, [tenantId]),
      query<{ readonly count: string }>(SUBSCRIPTION_QUERIES.COUNT_TEAM_MEMBERS, [tenantId]),
    ]);

    return {
      repositories: parseDbCount(repoResult.rows),
      analysesThisMonth: parseDbCount(analysesResult.rows),
      integrations: parseDbCount(integrationsResult.rows),
      teamMembers: parseDbCount(membersResult.rows),
    };
  } catch (error) {
    logger.error("Failed to get tenant usage", { tenantId, error: getErrorMessage(error) });
    throw error;
  }
};

// ==================== Trial Expiration ====================

/**
 * Find and expire all trialing subscriptions whose trial has ended.
 *
 * Sets the subscription status to 'past_due' for any tenant_subscription
 * row with `status = 'trialing'` and `trial_ends_at < NOW()`.
 *
 * Returns the list of tenant IDs that were expired so the caller can
 * set Redis status flags to block immediate access.
 */
export const expireTrials = async (): Promise<readonly string[]> => {
  try {
    const result = await query<{ readonly tenant_id: string }>(
      `UPDATE tenant_subscriptions
       SET status = 'past_due', updated_at = NOW()
       WHERE status = 'trialing'
         AND trial_ends_at IS NOT NULL
         AND trial_ends_at < NOW()
       RETURNING tenant_id`,
      []
    );

    const expiredTenantIds = result.rows.map((row) => row.tenant_id);

    if (expiredTenantIds.length > 0) {
      logger.info("Expired trial subscriptions", {
        count: expiredTenantIds.length,
        tenantIds: expiredTenantIds,
      });
    }

    return expiredTenantIds;
  } catch (error) {
    logger.error("Failed to expire trial subscriptions", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Limit Enforcement ====================

/**
 * Check whether a tenant's usage is within a specific plan limit.
 * Returns a result object with the check details.
 */
export const checkPlanLimit = async (
  tenantId: string,
  limitKey: PlanLimitKey
): Promise<PlanLimitCheckResult> => {
  // Personal tenants have no plan limits — always allowed
  const tenant = await findTenantById(tenantId);
  if (tenant?.tenantType === "personal") {
    return {
      allowed: true,
      currentUsage: 0,
      limit: null,
      limitKey,
      planId: DEFAULT_PLAN_ID as PlanId,
    };
  }

  // Ensure subscription exists (creates free plan row if missing)
  const subscription = await ensureSubscription(tenantId);
  const plan = await getPlanById(subscription.planId);
  invariant(plan !== null, `Plan ${subscription.planId} must exist in plans table`);

  const limit = getPlanLimit(plan, limitKey);

  // NULL limit = unlimited, always allowed.
  // currentUsage: 0 is a sentinel — actual usage is not fetched for unlimited plans.
  if (limit === null) {
    return { allowed: true, currentUsage: 0, limit: null, limitKey, planId: plan.id };
  }

  const usage = await getTenantUsage(tenantId);
  const currentUsage = getUsageForLimitKey(usage, limitKey);

  return {
    allowed: isWithinLimit(currentUsage, limit),
    currentUsage,
    limit,
    limitKey,
    planId: plan.id,
  };
};

/**
 * Enforce a plan limit for a tenant. Throws AuthorizationError if exceeded.
 * If the limit is NULL (unlimited), the check passes immediately.
 *
 * @throws AuthorizationError when the plan limit is exceeded
 */
export const enforcePlanLimit = async (tenantId: string, limitKey: PlanLimitKey): Promise<void> => {
  const result = await checkPlanLimit(tenantId, limitKey);

  if (!result.allowed) {
    throw new AuthorizationError("Plan limit exceeded", {
      operation: "enforcePlanLimit",
      metadata: {
        code: "PLAN_LIMIT_EXCEEDED",
        limitKey,
        currentUsage: result.currentUsage,
        limit: result.limit,
        currentPlan: result.planId,
      },
    });
  }
};
