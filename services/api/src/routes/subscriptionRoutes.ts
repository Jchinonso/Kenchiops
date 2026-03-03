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
  requireTenantId,
  AuthorizationError,
  ValidationError,
  requirePermission,
  HTTP_STATUS,
  DEFAULT_PLAN_ID,
  getErrorMessage,
  findGitHubAppConnection,
  findOAuthIdentitiesByUser,
  findById as findTenantById,
  rateLimitByCategory,
  type Plan,
  type PlanId,
  type TenantSubscription,
  type UsageLimitDetail,
  type RequestContext,
  // Repository
  getAllPlans,
  getPlanById,
  getSubscriptionByTenant,
  getSubscriptionWithPlan,
  changePlan,
  getTenantUsage,
  validatePlanId,
} from "@kenchi/shared";
import { createGitHubInstallationAdapter } from "../adapters/githubInstallationAdapter.js";
import { createGitLabProjectsAdapter } from "../adapters/gitlabProjectsAdapter.js";

const router = Router();
const logger = createLogger("subscription-routes");
const githubAdapter = createGitHubInstallationAdapter();
const gitlabAdapter = createGitLabProjectsAdapter();

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

/**
 * Count connected repositories across all providers (GitHub + GitLab).
 * Fetches real repo counts from provider APIs rather than relying on DB tables.
 * Returns 0 on failure to avoid breaking the usage endpoint.
 */
const countConnectedRepos = async (
  tenantId: string,
  userId: string | undefined,
  context: RequestContext
): Promise<number> => {
  try {
    const ghConn = await findGitHubAppConnection(tenantId);
    const installationId = ghConn?.externalOrgId ? Number(ghConn.externalOrgId) : null;

    const resolveGitLabCount = async (): Promise<number> => {
      if (!userId) {
        return 0;
      }
      const identities = await findOAuthIdentitiesByUser(userId);
      const gitlabIdentity = identities.find((identity) => identity.provider === "gitlab");
      if (!gitlabIdentity?.accessToken) {
        return 0;
      }
      const projects = await gitlabAdapter.getProjects(
        gitlabIdentity.accessToken,
        gitlabIdentity.instanceUrl,
        context
      );
      return projects.length;
    };

    const [githubRepos, gitlabCount] = await Promise.all([
      installationId ? githubAdapter.getRepositories(installationId, context) : Promise.resolve([]),
      resolveGitLabCount(),
    ]);

    return githubRepos.length + gitlabCount;
  } catch (error) {
    logger.warn("Failed to count connected repos from providers, falling back to 0", {
      error: getErrorMessage(error),
      ...context,
    });
    return 0;
  }
};

// ==================== Route Handlers ====================

/**
 * GET /api/v1/subscription
 * Returns the current tenant's plan and subscription details.
 * If no subscription row exists, returns the free plan as default.
 */
const handleGetSubscription = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  // Personal accounts are not on a billing plan — return all features unlocked.
  // Plans and subscriptions only apply to organization tenants.
  const tenant = await findTenantById(tenantId);
  if (tenant?.tenantType === "personal") {
    logger.info("Subscription fetched (personal account)", { ...context });
    res.status(HTTP_STATUS.OK).json({
      data: {
        plan: {
          id: "personal",
          displayName: "Personal",
          priceMonthlyCents: 0,
          sortOrder: 0,
          limits: {
            maxRepositories: null,
            maxAnalysesMonthly: null,
            maxIntegrations: null,
            maxTeamMembers: 1,
          },
          features: {
            slackIntegration: true,
            customRules: true,
            teamAnalytics: false,
            ssoSaml: false,
            auditLog: false,
            apiAccess: true,
            prioritySupport: false,
          },
        },
        subscription: {
          planId: "personal",
          status: "active",
          trialEndsAt: null,
          changedAt: null,
        },
      },
    });
    return;
  }

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
  const userId = req.user?.userId;
  const { context } = req;

  // Fetch tenant, subscription, DB usage, free plan, and real repo count in parallel
  const [tenant, subscriptionWithPlan, usage, freePlan, repoCount] = await Promise.all([
    findTenantById(tenantId),
    getSubscriptionWithPlan(tenantId),
    getTenantUsage(tenantId),
    getPlanById(DEFAULT_PLAN_ID as PlanId),
    countConnectedRepos(tenantId, userId, context),
  ]);

  const isPersonalTenant = tenant?.tenantType === "personal";

  // Determine plan limits (fall back to free plan from DB)
  const planId = subscriptionWithPlan?.plan.id ?? (DEFAULT_PLAN_ID as PlanId);

  // Personal tenants have no plan limits — all limits are null (unlimited)
  if (isPersonalTenant) {
    logger.info("Usage fetched (personal tenant, unlimited)", { ...context, planId, repoCount });
    res.status(HTTP_STATUS.OK).json({
      data: {
        planId,
        usage: {
          repositories: buildUsageLimitDetail(repoCount, null),
          analysesThisMonth: buildUsageLimitDetail(usage.analysesThisMonth, null),
          integrations: buildUsageLimitDetail(usage.integrations, null),
          teamMembers: buildUsageLimitDetail(usage.teamMembers, null),
        },
      },
    });
    return;
  }

  const limits = subscriptionWithPlan?.plan.limits ??
    freePlan?.limits ?? {
      maxRepositories: 3,
      maxAnalysesMonthly: 50,
      maxIntegrations: 1,
      maxTeamMembers: 1,
    };

  logger.info("Usage fetched", { ...context, planId, repoCount });
  res.status(HTTP_STATUS.OK).json({
    data: {
      planId,
      usage: {
        repositories: buildUsageLimitDetail(repoCount, limits.maxRepositories),
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

  // Downgrade guard: verify current usage fits within the target plan's limits.
  // Prevents users from downgrading to a plan that cannot accommodate their
  // existing resources (repositories, analyses, team members, integrations).
  const [targetPlan, currentUsage] = await Promise.all([
    getPlanById(validatedPlanId),
    getTenantUsage(tenantId),
  ]);

  if (targetPlan) {
    const { limits } = targetPlan;
    const exceeding: ReadonlyArray<{
      readonly metric: string;
      readonly current: number;
      readonly limit: number;
    }> = [
      // Downgrade uses <= (not <) because the user already has these resources.
      // isWithinLimit uses strict < for pre-creation checks, but here we're
      // validating existing usage against the target plan — at-limit is acceptable.
      ...(limits.maxRepositories !== null && currentUsage.repositories > limits.maxRepositories
        ? [
            {
              metric: "repositories",
              current: currentUsage.repositories,
              limit: limits.maxRepositories,
            },
          ]
        : []),
      ...(limits.maxAnalysesMonthly !== null &&
      currentUsage.analysesThisMonth > limits.maxAnalysesMonthly
        ? [
            {
              metric: "analysesThisMonth",
              current: currentUsage.analysesThisMonth,
              limit: limits.maxAnalysesMonthly,
            },
          ]
        : []),
      ...(limits.maxIntegrations !== null && currentUsage.integrations > limits.maxIntegrations
        ? [
            {
              metric: "integrations",
              current: currentUsage.integrations,
              limit: limits.maxIntegrations,
            },
          ]
        : []),
      ...(limits.maxTeamMembers !== null && currentUsage.teamMembers > limits.maxTeamMembers
        ? [
            {
              metric: "teamMembers",
              current: currentUsage.teamMembers,
              limit: limits.maxTeamMembers,
            },
          ]
        : []),
    ];

    if (exceeding.length > 0) {
      logger.warn("Plan downgrade blocked — usage exceeds target plan limits", {
        ...context,
        targetPlanId: validatedPlanId,
        exceeding,
      });
      res.status(409).json({
        error: {
          code: "DOWNGRADE_BLOCKED",
          message:
            "Current usage exceeds the target plan's limits. Reduce usage before downgrading.",
          details: exceeding,
          requestId: context.requestId,
        },
      });
      return;
    }
  }

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

router.get(
  "/api/v1/subscription",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetSubscription)
);
router.get(
  "/api/v1/subscription/plans",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetPlans)
);
router.get(
  "/api/v1/subscription/usage",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetUsage)
);
// Permission enforcement: billing permission required to change the subscription plan (VULN-009)
router.put(
  "/api/v1/subscription/plan",
  rateLimitByCategory("standard"),
  requirePermission("billing"),
  asyncHandler(handleChangePlan)
);

export { router as subscriptionRoutes };
