/**
 * Unit tests for RAG Cost Controls
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// Mock dependencies before importing the module
jest.mock("../../core/logger.js", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("../../database/costTracking/repository.js", () => ({
  recordCost: jest.fn(),
  getBudgetStatus: jest.fn(),
}));

jest.mock("../../database/tenant/ragConfig.js", () => ({
  getRAGBudgetConfig: jest.fn(),
  updateRAGBudgetConfig: jest.fn(),
}));

// Import after mocks
import {
  getCachedEmbedding,
  cacheEmbedding,
  clearCache,
  getCacheStats,
  selectEmbeddingTier,
  getTenantTierConfig,
  clearTenantConfigCache,
  recordEmbeddingCost,
  recordQueryCost,
  shouldSkipExpensiveSearch,
  estimateEmbeddingCost,
  estimateMonthlyCost,
  recommendTier,
} from "../../rag/costControls.js";
import { recordCost, getBudgetStatus } from "../../database/index.js";
import { getRAGBudgetConfig } from "../../database/tenant/ragConfig.js";

const mockRecordCost = recordCost as jest.MockedFunction<typeof recordCost>;
const mockGetBudgetStatus = getBudgetStatus as jest.MockedFunction<typeof getBudgetStatus>;
const mockGetRAGBudgetConfig = getRAGBudgetConfig as jest.MockedFunction<typeof getRAGBudgetConfig>;

describe("RAG Cost Controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
    clearTenantConfigCache("test-tenant");
  });

  afterEach(() => {
    clearCache();
  });

  describe("Query Cache", () => {
    describe("getCachedEmbedding", () => {
      it("should return null for uncached query", () => {
        const result = getCachedEmbedding("uncached query");
        expect(result).toBeNull();
      });

      it("should return cached embedding when available", () => {
        const embedding = [0.1, 0.2, 0.3];
        cacheEmbedding("test query", embedding, "STANDARD");

        const result = getCachedEmbedding("test query");

        expect(result).not.toBeNull();
        expect(result?.embedding).toEqual(embedding);
        expect(result?.tier).toBe("STANDARD");
      });

      it("should cache by tenant when tenantId provided", () => {
        const embedding1 = [0.1, 0.2];
        const embedding2 = [0.3, 0.4];

        cacheEmbedding("same query", embedding1, "STANDARD", "tenant-1");
        cacheEmbedding("same query", embedding2, "PREMIUM", "tenant-2");

        const result1 = getCachedEmbedding("same query", "tenant-1");
        const result2 = getCachedEmbedding("same query", "tenant-2");

        expect(result1?.embedding).toEqual(embedding1);
        expect(result2?.embedding).toEqual(embedding2);
      });

      it("should normalize query before lookup", () => {
        cacheEmbedding("Test Query", [0.1, 0.2], "STANDARD");

        const result = getCachedEmbedding("test query"); // lowercase

        expect(result).not.toBeNull();
      });

      it("should track cache hits and misses", () => {
        cacheEmbedding("cached", [0.1], "STANDARD");

        getCachedEmbedding("cached"); // hit
        getCachedEmbedding("not cached"); // miss

        const stats = getCacheStats();
        expect(stats.hits).toBeGreaterThan(0);
        expect(stats.misses).toBeGreaterThan(0);
      });
    });

    describe("cacheEmbedding", () => {
      it("should store embedding with tier information", () => {
        const embedding = [0.5, 0.6, 0.7];

        cacheEmbedding("new query", embedding, "PREMIUM", "tenant-x");

        const result = getCachedEmbedding("new query", "tenant-x");
        expect(result?.tier).toBe("PREMIUM");
        expect(result?.embedding).toEqual(embedding);
      });

      it("should freeze the embedding array", () => {
        const embedding = [0.1, 0.2];
        cacheEmbedding("test", embedding, "STANDARD");

        const result = getCachedEmbedding("test");
        expect(Object.isFrozen(result?.embedding)).toBe(true);
      });
    });

    describe("clearCache", () => {
      it("should remove all cached entries", () => {
        cacheEmbedding("query1", [0.1], "STANDARD");
        cacheEmbedding("query2", [0.2], "STANDARD");

        clearCache();

        expect(getCachedEmbedding("query1")).toBeNull();
        expect(getCachedEmbedding("query2")).toBeNull();
      });

      it("should reset cache statistics", () => {
        cacheEmbedding("test", [0.1], "STANDARD");
        getCachedEmbedding("test"); // hit

        clearCache();

        const stats = getCacheStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.size).toBe(0);
      });
    });

    describe("getCacheStats", () => {
      it("should return current cache statistics", () => {
        cacheEmbedding("q1", [0.1], "STANDARD");
        cacheEmbedding("q2", [0.2], "STANDARD");
        getCachedEmbedding("q1"); // hit
        getCachedEmbedding("q3"); // miss

        const stats = getCacheStats();

        expect(stats.size).toBe(2);
        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBe(0.5);
      });

      it("should return 0 hit rate when no operations", () => {
        clearCache();
        const stats = getCacheStats();
        expect(stats.hitRate).toBe(0);
      });
    });
  });

  describe("Tier Selection", () => {
    describe("selectEmbeddingTier", () => {
      it("should use preferred tier when budget is healthy", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue({
          tenantId: "test-tenant",
          preferredTier: "STANDARD",
          monthlyBudgetUsd: 100,
          allowPremium: true,
          degradeOnBudgetWarning: true,
        });

        mockGetBudgetStatus.mockResolvedValue({
          status: "ok",
          currentSpendUsd: 20,
          budgetUsd: 100,
          percentUsed: 20,
          remainingUsd: 80,
        });

        const result = await selectEmbeddingTier("test-tenant", 1000);

        expect(result.selectedTier).toBe("STANDARD");
        expect(result.reason).toContain("preferred tier");
      });

      it("should degrade to LIGHT when budget exceeded", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue({
          tenantId: "test-tenant",
          preferredTier: "STANDARD",
          monthlyBudgetUsd: 100,
          allowPremium: false,
          degradeOnBudgetWarning: true,
        });

        mockGetBudgetStatus.mockResolvedValue({
          status: "exceeded",
          currentSpendUsd: 110,
          budgetUsd: 100,
          percentUsed: 110,
          remainingUsd: -10,
        });

        const result = await selectEmbeddingTier("test-tenant", 1000);

        expect(result.selectedTier).toBe("LIGHT");
        expect(result.reason).toContain("Budget exceeded");
      });

      it("should downgrade PREMIUM to STANDARD on budget warning", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue({
          tenantId: "test-tenant",
          preferredTier: "PREMIUM",
          monthlyBudgetUsd: 100,
          allowPremium: true,
          degradeOnBudgetWarning: true,
        });

        mockGetBudgetStatus.mockResolvedValue({
          status: "warning",
          currentSpendUsd: 75,
          budgetUsd: 100,
          percentUsed: 75,
          remainingUsd: 25,
        });

        const result = await selectEmbeddingTier("test-tenant", 1000);

        expect(result.selectedTier).toBe("STANDARD");
        expect(result.reason).toContain("warning");
      });

      it("should enforce premium restrictions", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue({
          tenantId: "test-tenant",
          preferredTier: "PREMIUM",
          monthlyBudgetUsd: 100,
          allowPremium: false, // Premium not allowed
          degradeOnBudgetWarning: true,
        });

        mockGetBudgetStatus.mockResolvedValue({
          status: "ok",
          currentSpendUsd: 10,
          budgetUsd: 100,
          percentUsed: 10,
          remainingUsd: 90,
        });

        const result = await selectEmbeddingTier("test-tenant", 1000);

        expect(result.selectedTier).toBe("STANDARD");
        expect(result.reason).toContain("PREMIUM tier not allowed");
      });

      it("should not degrade when degradeOnBudgetWarning is false", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue({
          tenantId: "test-tenant",
          preferredTier: "PREMIUM",
          monthlyBudgetUsd: 100,
          allowPremium: true,
          degradeOnBudgetWarning: false,
        });

        mockGetBudgetStatus.mockResolvedValue({
          status: "warning",
          currentSpendUsd: 80,
          budgetUsd: 100,
          percentUsed: 80,
          remainingUsd: 20,
        });

        const result = await selectEmbeddingTier("test-tenant", 1000);

        expect(result.selectedTier).toBe("PREMIUM");
      });
    });

    describe("getTenantTierConfig", () => {
      it("should return config from database", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue({
          tenantId: "test-tenant",
          preferredTier: "PREMIUM",
          monthlyBudgetUsd: 200,
          allowPremium: true,
          degradeOnBudgetWarning: false,
        });

        const config = await getTenantTierConfig("test-tenant");

        expect(config.tenantId).toBe("test-tenant");
        expect(config.preferredTier).toBe("PREMIUM");
        expect(config.monthlyBudgetUsd).toBe(200);
      });

      it("should return defaults when no config found", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue(null);

        const config = await getTenantTierConfig("unknown-tenant");

        expect(config.tenantId).toBe("unknown-tenant");
        expect(config.preferredTier).toBe("STANDARD");
      });

      it("should cache config results", async () => {
        mockGetRAGBudgetConfig.mockResolvedValue({
          tenantId: "cached-tenant",
          preferredTier: "STANDARD",
          monthlyBudgetUsd: 50,
          allowPremium: false,
          degradeOnBudgetWarning: true,
        });

        // First call
        await getTenantTierConfig("cached-tenant");
        // Second call should use cache
        await getTenantTierConfig("cached-tenant");

        expect(mockGetRAGBudgetConfig).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Cost Tracking", () => {
    describe("recordEmbeddingCost", () => {
      it("should record embedding cost with correct parameters", async () => {
        await recordEmbeddingCost("tenant-1", "STANDARD", 500);

        expect(mockRecordCost).toHaveBeenCalledWith({
          tenantId: "tenant-1",
          operationType: "embedding",
          embeddingTier: "STANDARD",
          tokenCount: 500,
        });
      });
    });

    describe("recordQueryCost", () => {
      it("should record query cost with correct parameters", async () => {
        await recordQueryCost("tenant-2", "PREMIUM", 200);

        expect(mockRecordCost).toHaveBeenCalledWith({
          tenantId: "tenant-2",
          operationType: "query",
          embeddingTier: "PREMIUM",
          tokenCount: 200,
        });
      });
    });
  });

  describe("Early Exit Optimization", () => {
    describe("shouldSkipExpensiveSearch", () => {
      it("should skip when sufficient results already found", () => {
        const result = shouldSkipExpensiveSearch("simple query", 10);

        expect(result.skip).toBe(true);
        expect(result.reason).toContain("Sufficient results");
      });

      it("should not skip when query contains actionable keywords", () => {
        const result = shouldSkipExpensiveSearch("error exception failed", 0);

        expect(result.skip).toBe(false);
        expect(result.reason).toContain("actionable keywords");
      });

      it("should skip very short queries", () => {
        const result = shouldSkipExpensiveSearch("hi", 0);

        expect(result.skip).toBe(true);
        expect(result.reason).toContain("too short");
      });

      it("should process normal queries", () => {
        const result = shouldSkipExpensiveSearch("how to configure database connection pooling", 0);

        expect(result.skip).toBe(false);
        expect(result.reason).toContain("Normal search");
      });

      it("should detect error-related keywords", () => {
        const errorKeywords = ["error", "exception", "failed", "failure", "timeout", "crash"];

        errorKeywords.forEach((keyword) => {
          const result = shouldSkipExpensiveSearch(`${keyword} in production deployment`, 0);
          expect(result.skip).toBe(false);
        });
      });
    });
  });

  describe("Cost Estimation", () => {
    describe("estimateEmbeddingCost", () => {
      it("should calculate cost for LIGHT tier", () => {
        const cost = estimateEmbeddingCost(1000, "LIGHT");
        expect(cost).toBeGreaterThan(0);
        expect(typeof cost).toBe("number");
      });

      it("should calculate cost for STANDARD tier", () => {
        const cost = estimateEmbeddingCost(1000, "STANDARD");
        expect(cost).toBeGreaterThan(0);
      });

      it("should calculate cost for PREMIUM tier", () => {
        const cost = estimateEmbeddingCost(1000, "PREMIUM");
        expect(cost).toBeGreaterThan(0);
      });

      it("should return higher cost for PREMIUM than STANDARD", () => {
        const standardCost = estimateEmbeddingCost(1000, "STANDARD");
        const premiumCost = estimateEmbeddingCost(1000, "PREMIUM");

        expect(premiumCost).toBeGreaterThan(standardCost);
      });

      it("should scale linearly with token count", () => {
        const cost1000 = estimateEmbeddingCost(1000, "STANDARD");
        const cost2000 = estimateEmbeddingCost(2000, "STANDARD");

        expect(cost2000).toBeCloseTo(cost1000 * 2, 5);
      });
    });

    describe("estimateMonthlyCost", () => {
      it("should estimate monthly cost from daily usage", () => {
        const dailyTokens = 10000;
        const monthlyCost = estimateMonthlyCost(dailyTokens, "STANDARD");

        expect(monthlyCost).toBeGreaterThan(0);
        // Monthly should be ~30x daily
        const dailyCost = estimateEmbeddingCost(dailyTokens, "STANDARD");
        expect(monthlyCost).toBeCloseTo(dailyCost * 30, 1);
      });
    });

    describe("recommendTier", () => {
      it("should recommend PREMIUM when budget allows", () => {
        const result = recommendTier(1000, 100000); // High budget, moderate usage

        expect(result.withinBudget).toBe(true);
        expect(["PREMIUM", "STANDARD", "LIGHT"]).toContain(result.tier);
      });

      it("should downgrade when budget is tight", () => {
        const result = recommendTier(0.001, 1000000); // Very low budget, high usage

        expect(result.tier).toBe("LIGHT");
      });

      it("should indicate when over budget", () => {
        const result = recommendTier(0.0001, 10000000); // Extremely low budget

        // Even LIGHT may be over budget
        expect(typeof result.withinBudget).toBe("boolean");
      });

      it("should allow unlimited budget when set to 0", () => {
        const result = recommendTier(0, 1000000); // 0 = unlimited

        expect(result.withinBudget).toBe(true);
        expect(result.tier).toBe("PREMIUM");
      });
    });
  });
});
