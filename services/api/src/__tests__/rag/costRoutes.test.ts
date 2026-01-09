/**
 * Unit tests for RAG Cost Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";

// Mock functions
const mockGetTenantTierConfig = jest.fn();
const mockSetTenantTierConfig = jest.fn();
const mockGetRAGCacheStats = jest.fn();
const mockClearCache = jest.fn();
const mockClearExpiredCache = jest.fn();
const mockEstimateEmbeddingCost = jest.fn();
const mockEstimateMonthlyCost = jest.fn();
const mockRecommendTier = jest.fn();

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  SERVICE_NAMES: { API: "api" },
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  API_ROUTES: {
    RAG_TENANT_TIER: "/tenant/:tenantId/tier",
    RAG_CACHE_STATS: "/cache/stats",
    RAG_CACHE_CLEAR: "/cache/clear",
    RAG_COST_ESTIMATE: "/cost/estimate",
    RAG_COST_STATS: "/cost-stats",
  },
  getTenantTierConfig: mockGetTenantTierConfig,
  setTenantTierConfig: mockSetTenantTierConfig,
  getRAGCacheStats: mockGetRAGCacheStats,
  clearCache: mockClearCache,
  clearExpiredCache: mockClearExpiredCache,
  estimateEmbeddingCost: mockEstimateEmbeddingCost,
  estimateMonthlyCost: mockEstimateMonthlyCost,
  recommendTier: mockRecommendTier,
  asyncHandler:
    (fn: (req: unknown, res: unknown, next: unknown) => Promise<unknown>) =>
    async (req: unknown, res: unknown, next: unknown) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        (next as (err: unknown) => void)(error);
      }
    },
  validate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  validators: {
    required: (value: unknown) => value !== undefined && value !== null,
  },
}));

describe("RAG Cost Routes", () => {
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock implementations
    mockGetTenantTierConfig.mockResolvedValue({
      tenantId: "tenant-1",
      preferredTier: "STANDARD",
      monthlyBudgetUsd: 100,
      allowPremium: true,
      degradeOnBudgetWarning: true,
    });

    mockSetTenantTierConfig.mockResolvedValue(undefined);

    mockGetRAGCacheStats.mockReturnValue({
      size: 100,
      hits: 500,
      misses: 50,
      hitRate: 0.91,
    });

    mockClearCache.mockReturnValue(undefined);
    mockClearExpiredCache.mockReturnValue(25);

    mockEstimateEmbeddingCost.mockReturnValue(0.0002);
    mockEstimateMonthlyCost.mockReturnValue(0.006);
    mockRecommendTier.mockReturnValue({
      tier: "STANDARD",
      withinBudget: true,
      estimatedMonthlyCost: 0.15,
    });

    const { ragCostRoutes } = await import("../../routes/rag/costRoutes.js");
    app = express();
    app.use(express.json());
    app.use(ragCostRoutes);
  });

  describe("GET /tenant/:tenantId/tier", () => {
    it("should return tenant tier config", async () => {
      const response = await request(app).get("/tenant/tenant-1/tier");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenantId).toBe("tenant-1");
      expect(response.body.data.preferredTier).toBe("STANDARD");
      expect(response.body.data.monthlyBudgetUsd).toBe(100);
    });

    it("should return config for different tenants", async () => {
      mockGetTenantTierConfig.mockResolvedValue({
        tenantId: "tenant-2",
        preferredTier: "PREMIUM",
        monthlyBudgetUsd: 500,
        allowPremium: true,
        degradeOnBudgetWarning: false,
      });

      const response = await request(app).get("/tenant/tenant-2/tier");

      expect(response.status).toBe(200);
      expect(response.body.data.preferredTier).toBe("PREMIUM");
      expect(response.body.data.monthlyBudgetUsd).toBe(500);
    });
  });

  describe("PUT /tenant/:tenantId/tier", () => {
    it("should update tenant tier config", async () => {
      const response = await request(app).put("/tenant/tenant-1/tier").send({
        preferredTier: "PREMIUM",
        monthlyBudgetUsd: 200,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSetTenantTierConfig).toHaveBeenCalled();
    });

    it("should merge with existing config", async () => {
      await request(app).put("/tenant/tenant-1/tier").send({
        preferredTier: "LIGHT",
      });

      expect(mockSetTenantTierConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          preferredTier: "LIGHT",
          monthlyBudgetUsd: 100, // Original value preserved
        })
      );
    });

    it("should update all provided fields", async () => {
      await request(app).put("/tenant/tenant-1/tier").send({
        preferredTier: "PREMIUM",
        monthlyBudgetUsd: 300,
        allowPremium: false,
        degradeOnBudgetWarning: false,
      });

      expect(mockSetTenantTierConfig).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        preferredTier: "PREMIUM",
        monthlyBudgetUsd: 300,
        allowPremium: false,
        degradeOnBudgetWarning: false,
      });
    });
  });

  describe("GET /cache/stats", () => {
    it("should return cache statistics", async () => {
      const response = await request(app).get("/cache/stats");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.size).toBe(100);
      expect(response.body.data.hits).toBe(500);
      expect(response.body.data.misses).toBe(50);
      expect(response.body.data.hitRate).toBe(0.91);
    });

    it("should handle empty cache", async () => {
      mockGetRAGCacheStats.mockReturnValue({
        size: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
      });

      const response = await request(app).get("/cache/stats");

      expect(response.status).toBe(200);
      expect(response.body.data.size).toBe(0);
    });
  });

  describe("POST /cache/clear", () => {
    it("should clear all cache", async () => {
      const response = await request(app).post("/cache/clear").send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe("full");
      expect(mockClearCache).toHaveBeenCalled();
    });

    it("should clear only expired cache", async () => {
      const response = await request(app).post("/cache/clear").send({ expiredOnly: true });

      expect(response.status).toBe(200);
      expect(response.body.data.type).toBe("expired");
      expect(response.body.data.cleared).toBe(25);
      expect(mockClearExpiredCache).toHaveBeenCalled();
    });

    it("should not call clearCache when expiredOnly", async () => {
      await request(app).post("/cache/clear").send({ expiredOnly: true });

      expect(mockClearCache).not.toHaveBeenCalled();
      expect(mockClearExpiredCache).toHaveBeenCalled();
    });
  });

  describe("POST /cost/estimate", () => {
    it("should estimate embedding cost", async () => {
      const response = await request(app).post("/cost/estimate").send({
        tokenCount: 1000,
        tier: "STANDARD",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tokenCount).toBe(1000);
      expect(response.body.data.tier).toBe("STANDARD");
      expect(response.body.data.estimatedCostUsd).toBeDefined();
    });

    it("should default to STANDARD tier", async () => {
      await request(app).post("/cost/estimate").send({
        tokenCount: 1000,
      });

      expect(mockEstimateEmbeddingCost).toHaveBeenCalledWith(1000, "STANDARD");
    });

    it("should include monthly projection", async () => {
      const response = await request(app).post("/cost/estimate").send({
        tokenCount: 1000,
        dailyTokens: 10000,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.monthlyProjection).toBeDefined();
      expect(mockEstimateMonthlyCost).toHaveBeenCalledWith(10000, "STANDARD");
    });

    it("should include tier recommendation", async () => {
      const response = await request(app).post("/cost/estimate").send({
        tokenCount: 1000,
        dailyTokens: 10000,
        monthlyBudget: 50,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.recommendation).toBeDefined();
      expect(response.body.data.recommendation.tier).toBe("STANDARD");
      expect(response.body.data.recommendation.withinBudget).toBe(true);
    });
  });

  describe("GET /cost-stats", () => {
    it("should return cost stats for tenant", async () => {
      const response = await request(app).get("/cost-stats?tenantId=tenant-1");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenantId).toBe("tenant-1");
      expect(response.body.data.tierConfig).toBeDefined();
      expect(response.body.data.cacheStats).toBeDefined();
    });

    it("should require tenantId", async () => {
      const response = await request(app).get("/cost-stats");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("tenantId");
    });

    it("should include cache and tier stats together", async () => {
      const response = await request(app).get("/cost-stats?tenantId=tenant-1");

      expect(response.body.data.tierConfig.preferredTier).toBe("STANDARD");
      expect(response.body.data.cacheStats.hitRate).toBe(0.91);
    });
  });

  describe("error handling", () => {
    it("should handle tier config fetch error", async () => {
      mockGetTenantTierConfig.mockRejectedValue(new Error("DB error"));

      const response = await request(app).get("/tenant/tenant-1/tier");

      expect(response.status).toBe(500);
    });

    it("should handle tier config update error", async () => {
      mockSetTenantTierConfig.mockRejectedValue(new Error("Update failed"));

      const response = await request(app)
        .put("/tenant/tenant-1/tier")
        .send({ preferredTier: "PREMIUM" });

      expect(response.status).toBe(500);
    });
  });
});
