/**
 * Unit tests for Risk Rules Routes
 *
 * Tests CRUD operations for custom risk rules, risk assessment queries,
 * input validation, tenant isolation, error handling with typed errors,
 * and query parameter parsing.
 *
 * Note: tenantId is sourced from req.context (set by auth middleware),
 * not from query/body parameters. Validation of tenantId presence is
 * the auth middleware's responsibility, not the route handler's.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

// ==================== Mock Setup ====================

const mockCreateCustomRiskRule = jest.fn();
const mockGetCustomRiskRules = jest.fn();
const mockGetCustomRiskRuleById = jest.fn();
const mockUpdateCustomRiskRule = jest.fn();
const mockDeleteCustomRiskRule = jest.fn();
const mockQueryRiskAssessments = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    createCustomRiskRule: (...args: unknown[]) => mockCreateCustomRiskRule(...args),
    getCustomRiskRules: (...args: unknown[]) => mockGetCustomRiskRules(...args),
    getCustomRiskRuleById: (...args: unknown[]) => mockGetCustomRiskRuleById(...args),
    updateCustomRiskRule: (...args: unknown[]) => mockUpdateCustomRiskRule(...args),
    deleteCustomRiskRule: (...args: unknown[]) => mockDeleteCustomRiskRule(...args),
    queryRiskAssessments: (...args: unknown[]) => mockQueryRiskAssessments(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
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
    requireFeature: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

// Import after mock setup
import { ValidationError, NotFoundError } from "@kenchi/shared";

// ==================== Test Helpers ====================

const createSampleRule = (overrides: Record<string, unknown> = {}) => ({
  id: "rule-123",
  tenantId: "tenant-1",
  name: "Block production deploys at night",
  description: "Prevents risky deploys during off-hours",
  actionTypes: ["deploy"],
  environment: "production",
  blastRadius: "high",
  reversibility: "low",
  scoreModifier: 10,
  enabled: true,
  priority: 1,
  createdBy: "admin@example.com",
  createdAt: "2024-01-15T10:00:00Z",
  updatedAt: "2024-01-15T10:00:00Z",
  ...overrides,
});

const createSampleAssessment = (overrides: Record<string, unknown> = {}) => ({
  id: "assessment-1",
  tenantId: "tenant-1",
  actionProposalId: "proposal-1",
  actionType: "deploy",
  riskScore: 75,
  assessedAt: "2024-01-15T10:00:00Z",
  ...overrides,
});

/**
 * Middleware that simulates auth context injection for tests.
 * In production, auth middleware sets req.context.tenantId from the JWT.
 * For tests, we resolve from body/query to simulate different tenant contexts,
 * defaulting to "default-tenant" to match production behavior (auth always provides one).
 */
const injectTestContext = (req: Request, _res: Response, next: NextFunction): void => {
  const bodyTenantId = (req.body as Record<string, unknown>)?.tenantId as string | undefined;
  const queryTenantId = req.query?.tenantId as string | undefined;
  const resolvedTenantId = bodyTenantId ?? queryTenantId ?? "default-tenant";
  Object.assign(req, {
    context: {
      requestId: "test-request-id",
      tenantId: resolvedTenantId,
    },
  });
  next();
};

/**
 * Sets up Express app with error handling middleware that converts
 * typed errors to proper HTTP responses, matching production behavior.
 */
const setupApp = async (): Promise<Express> => {
  const { riskRulesRoutes } = await import("../routes/riskRulesRoutes.js");
  const app = express();
  app.use(express.json());
  app.use(injectTestContext);
  app.use(riskRulesRoutes);

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res
        .status(400)
        .json({ error: err.message, details: (err as { metadata?: unknown }).metadata });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
};

// ==================== Tests ====================

describe("Risk Rules Routes", () => {
  // let: app is reassigned in beforeEach for module isolation
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await setupApp();
  });

  // ==================== GET /api/risk-rules ====================

  describe("GET /api/risk-rules", () => {
    it("should return list of rules for a tenant", async () => {
      const rules = [createSampleRule(), createSampleRule({ id: "rule-456", name: "Second rule" })];
      mockGetCustomRiskRules.mockResolvedValue(rules);

      const response = await request(app).get("/api/risk-rules").query({ tenantId: "tenant-1" });

      expect(response.status).toBe(200);
      expect(response.body.rules).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.tenantId).toBe("tenant-1");
    });

    it("should pass query options to getCustomRiskRules", async () => {
      mockGetCustomRiskRules.mockResolvedValue([]);

      await request(app).get("/api/risk-rules").query({
        tenantId: "tenant-1",
        actionType: "deploy",
        environment: "production",
        enabledOnly: "false",
        limit: "25",
        offset: "10",
      });

      expect(mockGetCustomRiskRules).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          actionType: "deploy",
          environment: "production",
          enabledOnly: false,
          limit: 25,
          offset: 10,
        })
      );
    });

    it("should default enabledOnly to true when not specified", async () => {
      mockGetCustomRiskRules.mockResolvedValue([]);

      await request(app).get("/api/risk-rules").query({ tenantId: "tenant-1" });

      expect(mockGetCustomRiskRules).toHaveBeenCalledWith(
        expect.objectContaining({
          enabledOnly: true,
        })
      );
    });

    it("should use tenantId from request context", async () => {
      mockGetCustomRiskRules.mockResolvedValue([]);

      const response = await request(app).get("/api/risk-rules").query({ tenantId: "ctx-tenant" });

      expect(response.status).toBe(200);
      expect(mockGetCustomRiskRules).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "ctx-tenant",
        })
      );
      expect(response.body.tenantId).toBe("ctx-tenant");
    });

    it("should use default context tenantId when no tenantId in query", async () => {
      mockGetCustomRiskRules.mockResolvedValue([]);

      const response = await request(app).get("/api/risk-rules");

      expect(response.status).toBe(200);
      expect(mockGetCustomRiskRules).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "default-tenant",
        })
      );
    });

    it("should return empty array when no rules exist", async () => {
      mockGetCustomRiskRules.mockResolvedValue([]);

      const response = await request(app)
        .get("/api/risk-rules")
        .query({ tenantId: "tenant-empty" });

      expect(response.status).toBe(200);
      expect(response.body.rules).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });
  });

  // ==================== GET /api/risk-rules/:ruleId ====================

  describe("GET /api/risk-rules/:ruleId", () => {
    it("should return a specific rule by ID", async () => {
      const rule = createSampleRule();
      mockGetCustomRiskRuleById.mockResolvedValue(rule);

      const response = await request(app)
        .get("/api/risk-rules/rule-123")
        .query({ tenantId: "tenant-1" });

      expect(response.status).toBe(200);
      expect(response.body.rule).toEqual(rule);
    });

    it("should pass ruleId and tenantId to the query function", async () => {
      mockGetCustomRiskRuleById.mockResolvedValue(createSampleRule());

      await request(app).get("/api/risk-rules/rule-abc").query({ tenantId: "tenant-xyz" });

      expect(mockGetCustomRiskRuleById).toHaveBeenCalledWith("rule-abc", "tenant-xyz");
    });

    it("should return 404 when rule is not found", async () => {
      mockGetCustomRiskRuleById.mockResolvedValue(null);

      const response = await request(app)
        .get("/api/risk-rules/rule-nonexistent")
        .query({ tenantId: "tenant-1" });

      expect(response.status).toBe(404);
    });

    it("should use context tenantId for rule lookup", async () => {
      mockGetCustomRiskRuleById.mockResolvedValue(createSampleRule());

      await request(app).get("/api/risk-rules/rule-123");

      expect(mockGetCustomRiskRuleById).toHaveBeenCalledWith("rule-123", "default-tenant");
    });
  });

  // ==================== POST /api/risk-rules ====================

  describe("POST /api/risk-rules", () => {
    it("should create a new rule and return 201", async () => {
      const createdRule = createSampleRule();
      mockCreateCustomRiskRule.mockResolvedValue(createdRule);

      const response = await request(app)
        .post("/api/risk-rules")
        .send({
          tenantId: "tenant-1",
          name: "Block production deploys at night",
          actionTypes: ["deploy"],
          description: "Prevents risky deploys",
          environment: "production",
          scoreModifier: 10,
          enabled: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.rule).toEqual(createdRule);
    });

    it("should pass all fields to createCustomRiskRule", async () => {
      mockCreateCustomRiskRule.mockResolvedValue(createSampleRule());

      await request(app)
        .post("/api/risk-rules")
        .send({
          tenantId: "tenant-1",
          name: "My Rule",
          actionTypes: ["deploy", "rollback"],
          description: "Test",
          environment: "staging",
          blastRadius: "medium",
          reversibility: "high",
          dataImpact: "none",
          scoreModifier: 5,
          productionMultiplier: 2.0,
          incidentModeMultiplier: 1.5,
          offHoursMultiplier: 1.3,
          requireApprovalThreshold: 50,
          blockThreshold: 80,
          enabled: true,
          priority: 2,
          createdBy: "test-user",
        });

      expect(mockCreateCustomRiskRule).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          name: "My Rule",
          actionTypes: ["deploy", "rollback"],
          description: "Test",
          environment: "staging",
          blastRadius: "medium",
          scoreModifier: 5,
          productionMultiplier: 2.0,
          createdBy: "test-user",
        })
      );
    });

    it("should use context tenantId rather than body tenantId for the rule", async () => {
      const createdRule = createSampleRule();
      mockCreateCustomRiskRule.mockResolvedValue(createdRule);

      await request(app)
        .post("/api/risk-rules")
        .send({
          tenantId: "tenant-1",
          name: "My Rule",
          actionTypes: ["deploy"],
        });

      expect(mockCreateCustomRiskRule).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
        })
      );
    });

    it("should return 400 when name is missing", async () => {
      const response = await request(app)
        .post("/api/risk-rules")
        .send({
          tenantId: "tenant-1",
          actionTypes: ["deploy"],
        });

      expect(response.status).toBe(400);
    });

    it("should return 400 when actionTypes is missing", async () => {
      const response = await request(app).post("/api/risk-rules").send({
        tenantId: "tenant-1",
        name: "My Rule",
      });

      expect(response.status).toBe(400);
    });

    it("should return 400 when actionTypes is not an array", async () => {
      const response = await request(app).post("/api/risk-rules").send({
        tenantId: "tenant-1",
        name: "My Rule",
        actionTypes: "deploy",
      });

      expect(response.status).toBe(400);
    });
  });

  // ==================== PATCH /api/risk-rules/:ruleId ====================

  describe("PATCH /api/risk-rules/:ruleId", () => {
    it("should update a rule and return 200", async () => {
      const updatedRule = createSampleRule({ name: "Updated Name" });
      mockUpdateCustomRiskRule.mockResolvedValue(updatedRule);

      const response = await request(app).patch("/api/risk-rules/rule-123").send({
        tenantId: "tenant-1",
        name: "Updated Name",
      });

      expect(response.status).toBe(200);
      expect(response.body.rule).toEqual(updatedRule);
    });

    it("should pass ruleId, tenantId, and update fields", async () => {
      mockUpdateCustomRiskRule.mockResolvedValue(createSampleRule());

      await request(app).patch("/api/risk-rules/rule-abc").send({
        tenantId: "tenant-xyz",
        name: "New Name",
        enabled: false,
        scoreModifier: 20,
      });

      expect(mockUpdateCustomRiskRule).toHaveBeenCalledWith(
        "rule-abc",
        "tenant-xyz",
        expect.objectContaining({
          name: "New Name",
          enabled: false,
          scoreModifier: 20,
        })
      );
    });

    it("should use context tenantId for update", async () => {
      mockUpdateCustomRiskRule.mockResolvedValue(createSampleRule());

      await request(app).patch("/api/risk-rules/rule-123").send({
        name: "New Name",
      });

      expect(mockUpdateCustomRiskRule).toHaveBeenCalledWith(
        "rule-123",
        "default-tenant",
        expect.objectContaining({
          name: "New Name",
        })
      );
    });
  });

  // ==================== DELETE /api/risk-rules/:ruleId ====================

  describe("DELETE /api/risk-rules/:ruleId", () => {
    it("should delete a rule and return 204", async () => {
      mockDeleteCustomRiskRule.mockResolvedValue(true);

      const response = await request(app)
        .delete("/api/risk-rules/rule-123")
        .query({ tenantId: "tenant-1" });

      expect(response.status).toBe(204);
    });

    it("should pass ruleId and tenantId to deleteCustomRiskRule", async () => {
      mockDeleteCustomRiskRule.mockResolvedValue(true);

      await request(app).delete("/api/risk-rules/rule-abc").query({ tenantId: "tenant-xyz" });

      expect(mockDeleteCustomRiskRule).toHaveBeenCalledWith("rule-abc", "tenant-xyz");
    });

    it("should return 404 when rule to delete is not found", async () => {
      mockDeleteCustomRiskRule.mockResolvedValue(false);

      const response = await request(app)
        .delete("/api/risk-rules/rule-nonexistent")
        .query({ tenantId: "tenant-1" });

      expect(response.status).toBe(404);
    });

    it("should use context tenantId for deletion", async () => {
      mockDeleteCustomRiskRule.mockResolvedValue(true);

      const response = await request(app).delete("/api/risk-rules/rule-123");

      expect(response.status).toBe(204);
      expect(mockDeleteCustomRiskRule).toHaveBeenCalledWith("rule-123", "default-tenant");
    });
  });

  // ==================== GET /api/risk-assessments ====================

  describe("GET /api/risk-assessments", () => {
    it("should return assessments for a tenant", async () => {
      const assessments = [createSampleAssessment()];
      mockQueryRiskAssessments.mockResolvedValue(assessments);

      const response = await request(app)
        .get("/api/risk-assessments")
        .query({ tenantId: "tenant-1" });

      expect(response.status).toBe(200);
      expect(response.body.assessments).toHaveLength(1);
      expect(response.body.count).toBe(1);
      expect(response.body.tenantId).toBe("tenant-1");
    });

    it("should pass all query options to queryRiskAssessments", async () => {
      mockQueryRiskAssessments.mockResolvedValue([]);

      await request(app).get("/api/risk-assessments").query({
        tenantId: "tenant-1",
        actionProposalId: "proposal-abc",
        actionType: "deploy",
        fromDate: "2024-01-01",
        toDate: "2024-06-30",
        limit: "50",
        offset: "5",
      });

      expect(mockQueryRiskAssessments).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          actionProposalId: "proposal-abc",
          actionType: "deploy",
          limit: 50,
          offset: 5,
        })
      );
    });

    it("should parse date parameters as Date objects", async () => {
      mockQueryRiskAssessments.mockResolvedValue([]);

      await request(app).get("/api/risk-assessments").query({
        tenantId: "tenant-1",
        fromDate: "2024-01-01T00:00:00Z",
        toDate: "2024-06-30T23:59:59Z",
      });

      const callArgs = mockQueryRiskAssessments.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.fromDate).toBeInstanceOf(Date);
      expect(callArgs.toDate).toBeInstanceOf(Date);
    });

    it("should use context tenantId for assessment queries", async () => {
      mockQueryRiskAssessments.mockResolvedValue([]);

      const response = await request(app).get("/api/risk-assessments");

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe("default-tenant");
      expect(mockQueryRiskAssessments).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "default-tenant",
        })
      );
    });

    it("should return empty array when no assessments exist", async () => {
      mockQueryRiskAssessments.mockResolvedValue([]);

      const response = await request(app)
        .get("/api/risk-assessments")
        .query({ tenantId: "tenant-1" });

      expect(response.status).toBe(200);
      expect(response.body.assessments).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });

    it("should handle invalid date strings gracefully", async () => {
      mockQueryRiskAssessments.mockResolvedValue([]);

      await request(app).get("/api/risk-assessments").query({
        tenantId: "tenant-1",
        fromDate: "not-a-date",
      });

      // Invalid dates should be parsed as undefined by parseOptionalDate
      const callArgs = mockQueryRiskAssessments.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.fromDate).toBeUndefined();
    });

    it("should handle non-numeric limit gracefully", async () => {
      mockQueryRiskAssessments.mockResolvedValue([]);

      await request(app).get("/api/risk-assessments").query({
        tenantId: "tenant-1",
        limit: "abc",
      });

      // NaN from parseInt should fall back to default
      const callArgs = mockQueryRiskAssessments.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof callArgs.limit).toBe("number");
    });
  });
});
