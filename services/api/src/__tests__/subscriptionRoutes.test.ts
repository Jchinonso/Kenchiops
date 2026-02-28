/**
 * Unit tests for Subscription Routes — Downgrade Validation (GAP-8)
 *
 * Tests the handleChangePlan handler's downgrade validation fence-post fix:
 * - Usage exactly at target limit (e.g., 3 repos, limit=3) -> downgrade ALLOWED
 * - Usage over target limit (e.g., 4 repos, limit=3) -> downgrade BLOCKED (409)
 * - Usage under target limit (e.g., 2 repos, limit=3) -> downgrade ALLOWED
 *
 * The fix changed `!isWithinLimit(currentUsage, limit)` (which blocks at-limit)
 * to `currentUsage > limit` (which allows at-limit).
 *
 * @module __tests__/subscriptionRoutes.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Plan, TenantSubscription, PlanUsage, RequestContext } from "@kenchi/shared";

// ==================== Mock Functions ====================

const mockGetAllPlans = jest.fn<(...args: unknown[]) => Promise<Plan[]>>();
const mockGetPlanById = jest.fn<(...args: unknown[]) => Promise<Plan | null>>();
const mockGetSubscriptionByTenant =
  jest.fn<(...args: unknown[]) => Promise<TenantSubscription | null>>();
const mockGetSubscriptionWithPlan = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockChangePlan = jest.fn<(...args: unknown[]) => Promise<TenantSubscription>>();
const mockGetTenantUsage = jest.fn<(...args: unknown[]) => Promise<PlanUsage>>();
const mockValidatePlanId = jest.fn<(planId: string) => string>();
const mockFindGitHubAppConnection = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindOAuthIdentitiesByUser = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

// ==================== Module Mocks ====================

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    asyncHandler:
      (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          await fn(req, res, next);
        } catch (error) {
          next(error);
        }
      },
    // Middleware passthrough
    requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    rateLimitByCategory: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    // requireTenantId reads from req.user.tenantId
    requireTenantId: (req: Request) => {
      const tenantId = (req as unknown as { user?: { tenantId?: string } }).user?.tenantId;
      if (!tenantId) {
        const { AuthorizationError: AuthzError } = actual as {
          AuthorizationError: new (msg: string, opts?: unknown) => Error;
        };
        throw new AuthzError("No organization linked", { operation: "requireTenantId" });
      }
      return tenantId;
    },
    // Repository functions
    getAllPlans: (...args: unknown[]) => mockGetAllPlans(...args),
    getPlanById: (...args: unknown[]) => mockGetPlanById(...args),
    getSubscriptionByTenant: (...args: unknown[]) => mockGetSubscriptionByTenant(...args),
    getSubscriptionWithPlan: (...args: unknown[]) => mockGetSubscriptionWithPlan(...args),
    changePlan: (...args: unknown[]) => mockChangePlan(...args),
    getTenantUsage: (...args: unknown[]) => mockGetTenantUsage(...args),
    validatePlanId: (...args: unknown[]) => mockValidatePlanId(...(args as [string])),
    findGitHubAppConnection: (...args: unknown[]) => mockFindGitHubAppConnection(...args),
    findOAuthIdentitiesByUser: (...args: unknown[]) => mockFindOAuthIdentitiesByUser(...args),
  };
});

// Mock adapters used by the module at the top level
jest.mock("../adapters/githubInstallationAdapter.js", () => ({
  createGitHubInstallationAdapter: () => ({
    getRepositories: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock("../adapters/gitlabProjectsAdapter.js", () => ({
  createGitLabProjectsAdapter: () => ({
    getProjects: jest.fn().mockResolvedValue([]),
  }),
}));

// Import error classes after mock setup
import { ValidationError, AuthorizationError } from "@kenchi/shared";

// ==================== Test Helpers ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "tenant-sub-test",
};

/**
 * Middleware that injects auth context for subscription route tests.
 */
const injectTestAuth = (req: Request, _res: Response, next: NextFunction): void => {
  Object.assign(req, {
    user: { userId: "usr_test-owner", tenantId: "tenant-sub-test" },
    context: {
      requestId: testContext.requestId,
      tenantId: testContext.tenantId,
    },
  });
  next();
};

const createTestPlan = (overrides: Partial<Plan> = {}): Plan => ({
  id: "free" as Plan["id"],
  displayName: "Free",
  priceMonthlyCents: 0,
  sortOrder: 0,
  limits: {
    maxRepositories: 3,
    maxAnalysesMonthly: 50,
    maxIntegrations: 1,
    maxTeamMembers: 3,
  },
  features: {
    slackIntegration: false,
    customRules: false,
    teamAnalytics: false,
    ssoSaml: false,
    auditLog: false,
    apiAccess: false,
    prioritySupport: false,
  },
  ...overrides,
});

const createTestSubscription = (
  overrides: Partial<TenantSubscription> = {}
): TenantSubscription => ({
  id: "sub_test-123",
  tenantId: "tenant-sub-test",
  planId: "pro" as TenantSubscription["planId"],
  status: "active",
  metadata: {},
  trialEndsAt: null,
  changedBy: null,
  changedAt: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const createTestUsage = (overrides: Partial<PlanUsage> = {}): PlanUsage => ({
  repositories: 2,
  analysesThisMonth: 10,
  integrations: 1,
  teamMembers: 2,
  ...overrides,
});

/**
 * Sets up Express app with subscription routes and error handling middleware.
 */
const setupApp = async (): Promise<Express> => {
  const { subscriptionRoutes } = await import("../routes/subscriptionRoutes.js");
  const app = express();
  app.use(express.json());
  app.use(injectTestAuth);
  app.use(subscriptionRoutes);

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
      return;
    }
    if (err instanceof AuthorizationError) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: err.message },
      });
      return;
    }
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  return app;
};

// ==================== Tests ====================

describe("Subscription Routes", () => {
  // let: app is rebuilt each test for module isolation
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: validatePlanId passes through the value
    mockValidatePlanId.mockImplementation((planId: string) => planId);
    app = await setupApp();
  });

  // ==================================================================
  // PUT /api/v1/subscription/plan — downgrade validation (GAP-8)
  // ==================================================================

  describe("PUT /api/v1/subscription/plan — downgrade validation", () => {
    it("should allow downgrade when usage is exactly at target limit (fence-post fix)", async () => {
      const targetPlan = createTestPlan({
        id: "free" as Plan["id"],
        limits: {
          maxRepositories: 3,
          maxAnalysesMonthly: 50,
          maxIntegrations: 1,
          maxTeamMembers: 3,
        },
      });
      // Usage exactly at limit for all metrics
      const usage = createTestUsage({
        repositories: 3,
        analysesThisMonth: 50,
        integrations: 1,
        teamMembers: 3,
      });
      const updatedSub = createTestSubscription({ planId: "free" as TenantSubscription["planId"] });

      mockGetPlanById.mockResolvedValue(targetPlan);
      mockGetTenantUsage.mockResolvedValue(usage);
      mockGetSubscriptionByTenant.mockResolvedValue(
        createTestSubscription({ planId: "pro" as TenantSubscription["planId"] })
      );
      mockChangePlan.mockResolvedValue(updatedSub);

      const response = await request(app).put("/api/v1/subscription/plan").send({ planId: "free" });

      expect(response.status).toBe(200);
      expect(response.body.data.subscription.planId).toBe("free");
      expect(response.body.data.previousPlanId).toBe("pro");
      expect(mockChangePlan).toHaveBeenCalledWith({
        tenantId: "tenant-sub-test",
        newPlanId: "free",
        changedBy: "usr_test-owner",
      });
    });

    it("should block downgrade when usage exceeds target limit (409 DOWNGRADE_BLOCKED)", async () => {
      const targetPlan = createTestPlan({
        id: "free" as Plan["id"],
        limits: {
          maxRepositories: 3,
          maxAnalysesMonthly: 50,
          maxIntegrations: 1,
          maxTeamMembers: 3,
        },
      });
      // Usage over limit: 4 repos > 3 limit
      const usage = createTestUsage({
        repositories: 4,
        analysesThisMonth: 10,
        integrations: 1,
        teamMembers: 2,
      });

      mockGetPlanById.mockResolvedValue(targetPlan);
      mockGetTenantUsage.mockResolvedValue(usage);

      const response = await request(app).put("/api/v1/subscription/plan").send({ planId: "free" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DOWNGRADE_BLOCKED");
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: "repositories",
            current: 4,
            limit: 3,
          }),
        ])
      );
      // changePlan should NOT have been called
      expect(mockChangePlan).not.toHaveBeenCalled();
    });

    it("should allow downgrade when usage is under target limit", async () => {
      const targetPlan = createTestPlan({
        id: "free" as Plan["id"],
        limits: {
          maxRepositories: 3,
          maxAnalysesMonthly: 50,
          maxIntegrations: 1,
          maxTeamMembers: 3,
        },
      });
      // Usage under limit for all metrics
      const usage = createTestUsage({
        repositories: 2,
        analysesThisMonth: 30,
        integrations: 0,
        teamMembers: 1,
      });
      const updatedSub = createTestSubscription({ planId: "free" as TenantSubscription["planId"] });

      mockGetPlanById.mockResolvedValue(targetPlan);
      mockGetTenantUsage.mockResolvedValue(usage);
      mockGetSubscriptionByTenant.mockResolvedValue(
        createTestSubscription({ planId: "pro" as TenantSubscription["planId"] })
      );
      mockChangePlan.mockResolvedValue(updatedSub);

      const response = await request(app).put("/api/v1/subscription/plan").send({ planId: "free" });

      expect(response.status).toBe(200);
      expect(response.body.data.subscription.planId).toBe("free");
      expect(mockChangePlan).toHaveBeenCalled();
    });

    it("should block downgrade when multiple metrics exceed limits", async () => {
      const targetPlan = createTestPlan({
        id: "free" as Plan["id"],
        limits: {
          maxRepositories: 3,
          maxAnalysesMonthly: 50,
          maxIntegrations: 1,
          maxTeamMembers: 3,
        },
      });
      // Multiple metrics over limit
      const usage = createTestUsage({
        repositories: 5,
        analysesThisMonth: 60,
        integrations: 3,
        teamMembers: 8,
      });

      mockGetPlanById.mockResolvedValue(targetPlan);
      mockGetTenantUsage.mockResolvedValue(usage);

      const response = await request(app).put("/api/v1/subscription/plan").send({ planId: "free" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DOWNGRADE_BLOCKED");
      // All 4 metrics should be in the exceeding list
      expect(response.body.error.details).toHaveLength(4);
      expect(mockChangePlan).not.toHaveBeenCalled();
    });

    it("should skip limit check for metrics with null limit (unlimited)", async () => {
      const targetPlan = createTestPlan({
        id: "enterprise" as Plan["id"],
        limits: {
          maxRepositories: null, // unlimited
          maxAnalysesMonthly: null, // unlimited
          maxIntegrations: null, // unlimited
          maxTeamMembers: null, // unlimited
        },
      });
      // High usage — but all limits are null so no restriction
      const usage = createTestUsage({
        repositories: 100,
        analysesThisMonth: 500,
        integrations: 20,
        teamMembers: 50,
      });
      const updatedSub = createTestSubscription({
        planId: "enterprise" as TenantSubscription["planId"],
      });

      mockGetPlanById.mockResolvedValue(targetPlan);
      mockGetTenantUsage.mockResolvedValue(usage);
      mockGetSubscriptionByTenant.mockResolvedValue(null); // no previous subscription
      mockChangePlan.mockResolvedValue(updatedSub);

      const response = await request(app)
        .put("/api/v1/subscription/plan")
        .send({ planId: "enterprise" });

      expect(response.status).toBe(200);
      expect(mockChangePlan).toHaveBeenCalled();
    });

    it("should allow downgrade when target plan is not found (no limit check)", async () => {
      // When getPlanById returns null, the handler skips the downgrade guard
      mockGetPlanById.mockResolvedValue(null);
      mockGetTenantUsage.mockResolvedValue(createTestUsage());
      mockGetSubscriptionByTenant.mockResolvedValue(null);
      // changePlan will throw NotFoundError internally, but we test the handler flow
      const updatedSub = createTestSubscription({ planId: "free" as TenantSubscription["planId"] });
      mockChangePlan.mockResolvedValue(updatedSub);

      const response = await request(app)
        .put("/api/v1/subscription/plan")
        .send({ planId: "nonexistent" });

      // The handler proceeds to changePlan when targetPlan is null
      expect(response.status).toBe(200);
      expect(mockChangePlan).toHaveBeenCalled();
    });

    it("should return 400 when planId is missing", async () => {
      const response = await request(app).put("/api/v1/subscription/plan").send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/planId is required/i);
      expect(mockChangePlan).not.toHaveBeenCalled();
    });

    it("should return 400 when planId is not a string", async () => {
      const response = await request(app).put("/api/v1/subscription/plan").send({ planId: 123 });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/planId is required/i);
      expect(mockChangePlan).not.toHaveBeenCalled();
    });

    it("should use DEFAULT_PLAN_ID as previousPlanId when no subscription exists", async () => {
      const targetPlan = createTestPlan({
        id: "pro" as Plan["id"],
        limits: {
          maxRepositories: 10,
          maxAnalysesMonthly: 500,
          maxIntegrations: 5,
          maxTeamMembers: 10,
        },
      });
      const usage = createTestUsage({ repositories: 1, teamMembers: 1 });
      const updatedSub = createTestSubscription({ planId: "pro" as TenantSubscription["planId"] });

      mockGetPlanById.mockResolvedValue(targetPlan);
      mockGetTenantUsage.mockResolvedValue(usage);
      mockGetSubscriptionByTenant.mockResolvedValue(null); // no previous subscription
      mockChangePlan.mockResolvedValue(updatedSub);

      const response = await request(app).put("/api/v1/subscription/plan").send({ planId: "pro" });

      expect(response.status).toBe(200);
      // DEFAULT_PLAN_ID is "free"
      expect(response.body.data.previousPlanId).toBe("free");
    });

    it("should include exceeding metric details in 409 response", async () => {
      const targetPlan = createTestPlan({
        id: "free" as Plan["id"],
        limits: {
          maxRepositories: 3,
          maxAnalysesMonthly: 50,
          maxIntegrations: 1,
          maxTeamMembers: 3,
        },
      });
      // Only teamMembers exceeds
      const usage = createTestUsage({
        repositories: 3, // at limit = OK
        analysesThisMonth: 50, // at limit = OK
        integrations: 1, // at limit = OK
        teamMembers: 4, // over limit = blocked
      });

      mockGetPlanById.mockResolvedValue(targetPlan);
      mockGetTenantUsage.mockResolvedValue(usage);

      const response = await request(app).put("/api/v1/subscription/plan").send({ planId: "free" });

      expect(response.status).toBe(409);
      expect(response.body.error.details).toHaveLength(1);
      expect(response.body.error.details[0]).toEqual({
        metric: "teamMembers",
        current: 4,
        limit: 3,
      });
    });
  });
});
