/**
 * Subscription Routes
 *
 * API endpoints for subscription plan management.
 * All endpoints require authentication and a linked tenant.
 *
 * @module routes/subscriptionRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  AuthorizationError,
  ValidationError,
  HTTP_STATUS,
  DEFAULT_PLAN_ID,
  type Plan,
  type PlanId,
  type TenantSubscription,
  type UsageLimitDetail,
  // Repository
  getAllPlans,
  getPlanById,
  getSubscriptionByTenant,
  getSubscriptionWithPlan,
  changePlan,
  getTenantUsage,
  validatePlanId,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("subscription-routes");

// ==================== Helpers ====================

/**
 * Extract tenantId from authenticated user or throw.
 *
 * @throws AuthorizationError if no tenant is linked
 */
const requireTenantId = (req: Request): string => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    throw new AuthorizationError(
      "No organization linked. Install the Kenchi GitHub App to get started.",
      { operation: "requireTenantId" }
    );
  }

  return tenantId;
};

// ==================== DTO Mappers ====================

const mapPlanToResponse = (plan: Plan): Record<string, unknown> => ({
  id: plan.id,
  displayName: plan.displayName,
  priceMonthlyCents: plan.priceMonthlyCents,
  sortOrder: plan.sortOrder,
  limits: plan.limits,
  features: plan.features,
});

const mapSubscriptionToResponse = (sub: TenantSubscription): Record<string, unknown> => ({
  planId: sub.planId,
  status: sub.status,
  trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
  changedAt: sub.changedAt?.toISOString() ?? null,
});

const buildUsageLimitDetail = (current: number, limit: number | null): UsageLimitDetail => ({
  current,
  limit,
  limited: limit !== null,
});

// ==================== Route Handlers ====================

/**
 * GET /api/v1/subscription
 * Returns the current tenant's plan and subscription details.
 * If no subscription row exists, returns the free plan as default.
 */
const handleGetSubscription = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  const subscriptionWithPlan = await getSubscriptionWithPlan(tenantId);

  if (subscriptionWithPlan) {
    logger.info("Subscription fetched", { ...context, planId: subscriptionWithPlan.plan.id });
    res.status(HTTP_STATUS.OK).json({
      data: {
        plan: mapPlanToResponse(subscriptionWithPlan.plan),
        subscription: mapSubscriptionToResponse(subscriptionWithPlan.subscription),
      },
    });
    return;
  }

  // No subscription row -- return free plan as default
  const freePlan = await getPlanById(DEFAULT_PLAN_ID as PlanId);

  if (!freePlan) {
    // Should never happen if migrations ran correctly
    logger.warn("Free plan not found in database", { ...context });
    res.status(HTTP_STATUS.OK).json({
      data: {
        plan: null,
        subscription: null,
      },
    });
    return;
  }

  logger.info("Subscription fetched (default free)", { ...context });
  res.status(HTTP_STATUS.OK).json({
    data: {
      plan: mapPlanToResponse(freePlan),
      subscription: {
        planId: DEFAULT_PLAN_ID,
        status: "active",
        trialEndsAt: null,
        changedAt: null,
      },
    },
  });
};

/**
 * GET /api/v1/subscription/plans
 * Returns all available plans.
 */
const handleGetPlans = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;

  const plans = await getAllPlans();

  logger.info("Plans listed", { count: plans.length, ...context });
  res.status(HTTP_STATUS.OK).json({
    data: plans.map(mapPlanToResponse),
  });
};

/**
 * GET /api/v1/subscription/usage
 * Returns current usage counts against plan limits.
 */
const handleGetUsage = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  // Fetch subscription, usage, and free plan in parallel
  const [subscriptionWithPlan, usage, freePlan] = await Promise.all([
    getSubscriptionWithPlan(tenantId),
    getTenantUsage(tenantId),
    getPlanById(DEFAULT_PLAN_ID as PlanId),
  ]);

  // Determine plan limits (fall back to free plan from DB)
  const planId = subscriptionWithPlan?.plan.id ?? (DEFAULT_PLAN_ID as PlanId);
  const limits = subscriptionWithPlan?.plan.limits ??
    freePlan?.limits ?? {
      maxRepositories: 3,
      maxAnalysesMonthly: 50,
      maxIntegrations: 1,
      maxTeamMembers: 1,
    };

  logger.info("Usage fetched", { ...context, planId });
  res.status(HTTP_STATUS.OK).json({
    data: {
      planId,
      usage: {
        repositories: buildUsageLimitDetail(usage.repositories, limits.maxRepositories),
        analysesThisMonth: buildUsageLimitDetail(
          usage.analysesThisMonth,
          limits.maxAnalysesMonthly
        ),
        integrations: buildUsageLimitDetail(usage.integrations, limits.maxIntegrations),
        teamMembers: buildUsageLimitDetail(usage.teamMembers, limits.maxTeamMembers),
      },
    },
  });
};

/**
 * PUT /api/v1/subscription/plan
 * Change the tenant's subscription plan.
 * Requires owner or admin role.
 */
const handleChangePlan = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  const userId = req.user?.userId;

  if (!userId) {
    throw new AuthorizationError("User identity required to change plan", {
      operation: "handleChangePlan",
    });
  }

  const { planId } = req.body as { readonly planId?: string };

  if (!planId || typeof planId !== "string") {
    throw new ValidationError("planId is required in request body", {
      operation: "handleChangePlan",
      metadata: { field: "planId" },
    });
  }

  // Validate planId value
  const validatedPlanId = validatePlanId(planId);

  // Get previous plan for the response
  const previousSubscription = await getSubscriptionByTenant(tenantId);
  const previousPlanId = previousSubscription?.planId ?? DEFAULT_PLAN_ID;

  const updated = await changePlan({
    tenantId,
    newPlanId: validatedPlanId,
    changedBy: userId,
  });

  logger.info("Plan changed", {
    ...context,
    previousPlanId,
    newPlanId: validatedPlanId,
    changedBy: userId,
  });

  res.status(HTTP_STATUS.OK).json({
    data: {
      subscription: mapSubscriptionToResponse(updated),
      previousPlanId,
    },
  });
};

// ==================== Route Definitions ====================

router.get("/api/v1/subscription", asyncHandler(handleGetSubscription));
router.get("/api/v1/subscription/plans", asyncHandler(handleGetPlans));
router.get("/api/v1/subscription/usage", asyncHandler(handleGetUsage));
// Re-add requireRole("admin", "owner") when billing integration is added (KEN-142)
router.put("/api/v1/subscription/plan", asyncHandler(handleChangePlan));

export { router as subscriptionRoutes };
