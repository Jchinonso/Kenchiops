/**
 * Tests for Alert Budget Quota Enforcement
 *
 * Covers: plan lookups, analysis/stream/window quota checks,
 * counter increments/decrements, TTL management, and fail-open behavior.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "../core/types.js";

// ==================== Mock Setup ====================

const mockGet = jest.fn<() => Promise<string | null>>();
const mockIncr = jest.fn<() => Promise<number>>();
const mockDecr = jest.fn<() => Promise<number>>();
const mockExpire = jest.fn<() => Promise<number>>();
const mockSet = jest.fn<() => Promise<string>>();

const mockClient = {
  get: mockGet,
  incr: mockIncr,
  decr: mockDecr,
  expire: mockExpire,
  set: mockSet,
  status: "ready",
};

jest.mock("./redisClient.js", () => ({
  getRedisClient: () => mockClient,
}));

jest.mock("../core/index.js", () => {
  const actual = jest.requireActual("../core/index.js") as Record<string, unknown>;
  return {
    ...actual,
    createLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
    withTimeout: <T>(promise: Promise<T>, _timeout: number) => promise,
  };
});

import {
  getAlertBudgetForPlan,
  checkAlertAnalysisQuota,
  incrementAlertAnalysisCount,
  checkActiveStreamQuota,
  incrementActiveStreamCount,
  decrementActiveStreamCount,
  checkWindowQuota,
  incrementWindowCount,
} from "./alertBudgetQuota.js";

import { ALERT_BUDGET_BY_PLAN, ALERT_BUDGET_REDIS_TTL } from "../constants/index.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_TENANT_ID = "tenant-abc";

// ==================== Tests ====================

describe("alertBudgetQuota", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.status = "ready";
    mockGet.mockResolvedValue(null);
    mockIncr.mockResolvedValue(1);
    mockDecr.mockResolvedValue(0);
    mockExpire.mockResolvedValue(1);
    mockSet.mockResolvedValue("OK");
  });

  // ==================== getAlertBudgetForPlan ====================

  describe("getAlertBudgetForPlan", () => {
    it("should return free plan config for 'free'", () => {
      const result = getAlertBudgetForPlan("free");
      expect(result).toEqual(ALERT_BUDGET_BY_PLAN.free);
    });

    it("should return pro plan config for 'pro'", () => {
      const result = getAlertBudgetForPlan("pro");
      expect(result).toEqual(ALERT_BUDGET_BY_PLAN.pro);
    });

    it("should return team plan config for 'team'", () => {
      const result = getAlertBudgetForPlan("team");
      expect(result).toEqual(ALERT_BUDGET_BY_PLAN.team);
    });

    it("should return enterprise plan config for 'enterprise'", () => {
      const result = getAlertBudgetForPlan("enterprise");
      expect(result).toEqual(ALERT_BUDGET_BY_PLAN.enterprise);
    });

    it("should fall back to free plan for unknown plan ID", () => {
      const result = getAlertBudgetForPlan("nonexistent-plan");
      expect(result).toEqual(ALERT_BUDGET_BY_PLAN.free);
    });

    it("should fall back to free plan for empty string", () => {
      const result = getAlertBudgetForPlan("");
      expect(result).toEqual(ALERT_BUDGET_BY_PLAN.free);
    });

    it("should return correct maxAnalysesPerDay for each plan tier", () => {
      expect(getAlertBudgetForPlan("free").maxAnalysesPerDay).toBe(10);
      expect(getAlertBudgetForPlan("pro").maxAnalysesPerDay).toBe(100);
      expect(getAlertBudgetForPlan("team").maxAnalysesPerDay).toBe(500);
      expect(getAlertBudgetForPlan("enterprise").maxAnalysesPerDay).toBe(0);
    });

    it("should return correct maxActiveStreams for each plan tier", () => {
      expect(getAlertBudgetForPlan("free").maxActiveStreams).toBe(1);
      expect(getAlertBudgetForPlan("pro").maxActiveStreams).toBe(5);
      expect(getAlertBudgetForPlan("team").maxActiveStreams).toBe(20);
      expect(getAlertBudgetForPlan("enterprise").maxActiveStreams).toBe(0);
    });

    it("should return correct maxWindowsPerDay for each plan tier", () => {
      expect(getAlertBudgetForPlan("free").maxWindowsPerDay).toBe(12);
      expect(getAlertBudgetForPlan("pro").maxWindowsPerDay).toBe(288);
      expect(getAlertBudgetForPlan("team").maxWindowsPerDay).toBe(0);
      expect(getAlertBudgetForPlan("enterprise").maxWindowsPerDay).toBe(0);
    });
  });

  // ==================== checkAlertAnalysisQuota ====================

  describe("checkAlertAnalysisQuota", () => {
    it("should allow when current usage is under the limit", async () => {
      mockGet.mockResolvedValue("5");

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 5,
        limit: 10,
      });
    });

    it("should deny when current usage equals the limit", async () => {
      mockGet.mockResolvedValue("10");

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(10);
      expect(result.limit).toBe(10);
      expect(result.reason).toContain("Daily analysis limit reached");
    });

    it("should deny when current usage exceeds the limit", async () => {
      mockGet.mockResolvedValue("15");

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(15);
      expect(result.reason).toContain("15/10");
    });

    it("should allow when no counter exists yet (null from Redis)", async () => {
      mockGet.mockResolvedValue(null);

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 0,
        limit: 10,
      });
    });

    it("should allow unconditionally when plan limit is unlimited (0)", async () => {
      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "enterprise", testContext);

      expect(result).toEqual({ allowed: true });
      // Should not call Redis at all for unlimited plans
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should fall back to free plan when planId is undefined", async () => {
      mockGet.mockResolvedValue("9");

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, undefined, testContext);

      // Free plan limit is 10
      expect(result).toEqual({
        allowed: true,
        currentUsage: 9,
        limit: 10,
      });
    });

    it("should fall back to free plan when planId is unknown", async () => {
      mockGet.mockResolvedValue("10");

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "bogus-plan", testContext);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(10); // free plan limit
    });

    it("should fail open when Redis is not ready", async () => {
      mockClient.status = "connecting";

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should fail open when Redis get throws an error", async () => {
      mockGet.mockRejectedValue(new Error("Redis connection lost"));

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should use correct Redis key format with tenantId and day bucket", async () => {
      mockGet.mockResolvedValue("0");

      await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      const calledKey = mockGet.mock.calls[0]?.[0] as string;
      expect(calledKey).toMatch(/^kenchi:alert-budget:tenant-abc:analyses:\d{4}-\d{2}-\d{2}$/);
    });

    it("should use pro plan limits for pro plan", async () => {
      mockGet.mockResolvedValue("99");

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "pro", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 99,
        limit: 100,
      });
    });
  });

  // ==================== incrementAlertAnalysisCount ====================

  describe("incrementAlertAnalysisCount", () => {
    it("should increment the analysis counter via Redis INCR", async () => {
      mockIncr.mockResolvedValue(5);

      await incrementAlertAnalysisCount(TEST_TENANT_ID, testContext);

      expect(mockIncr).toHaveBeenCalledTimes(1);
      const calledKey = mockIncr.mock.calls[0]?.[0] as string;
      expect(calledKey).toMatch(/^kenchi:alert-budget:tenant-abc:analyses:\d{4}-\d{2}-\d{2}$/);
    });

    it("should set TTL when counter is first created (INCR returns 1)", async () => {
      mockIncr.mockResolvedValue(1);

      await incrementAlertAnalysisCount(TEST_TENANT_ID, testContext);

      expect(mockExpire).toHaveBeenCalledTimes(1);
      const [key, ttl] = mockExpire.mock.calls[0] as [string, number];
      expect(key).toMatch(/^kenchi:alert-budget:tenant-abc:analyses:/);
      expect(ttl).toBe(ALERT_BUDGET_REDIS_TTL);
    });

    it("should not set TTL when counter already exists (INCR returns > 1)", async () => {
      mockIncr.mockResolvedValue(2);

      await incrementAlertAnalysisCount(TEST_TENANT_ID, testContext);

      expect(mockExpire).not.toHaveBeenCalled();
    });

    it("should silently skip when Redis is not ready", async () => {
      mockClient.status = "connecting";

      await incrementAlertAnalysisCount(TEST_TENANT_ID, testContext);

      expect(mockIncr).not.toHaveBeenCalled();
    });

    it("should swallow errors without throwing", async () => {
      mockIncr.mockRejectedValue(new Error("Redis timeout"));

      await expect(
        incrementAlertAnalysisCount(TEST_TENANT_ID, testContext)
      ).resolves.toBeUndefined();
    });
  });

  // ==================== checkActiveStreamQuota ====================

  describe("checkActiveStreamQuota", () => {
    it("should allow when current streams are under the limit", async () => {
      mockGet.mockResolvedValue("0");

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 0,
        limit: 1,
      });
    });

    it("should deny when stream count equals the limit", async () => {
      mockGet.mockResolvedValue("1");

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(1);
      expect(result.limit).toBe(1);
      expect(result.reason).toContain("Active stream limit reached");
    });

    it("should deny when stream count exceeds the limit", async () => {
      mockGet.mockResolvedValue("3");

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("3/1");
    });

    it("should allow when no counter exists yet (null from Redis)", async () => {
      mockGet.mockResolvedValue(null);

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 0,
        limit: 1,
      });
    });

    it("should allow unconditionally when plan limit is unlimited (0)", async () => {
      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "enterprise", testContext);

      expect(result).toEqual({ allowed: true });
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should use pro plan limits for pro plan (5 streams)", async () => {
      mockGet.mockResolvedValue("4");

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "pro", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 4,
        limit: 5,
      });
    });

    it("should deny pro plan at exactly 5 streams", async () => {
      mockGet.mockResolvedValue("5");

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "pro", testContext);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("5/5");
    });

    it("should fail open when Redis is not ready", async () => {
      mockClient.status = "connecting";

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should fail open when Redis throws an error", async () => {
      mockGet.mockRejectedValue(new Error("Redis down"));

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should use correct Redis key format without day bucket", async () => {
      mockGet.mockResolvedValue("0");

      await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(mockGet).toHaveBeenCalledWith(`kenchi:alert-budget:${TEST_TENANT_ID}:active-streams`);
    });
  });

  // ==================== incrementActiveStreamCount ====================

  describe("incrementActiveStreamCount", () => {
    it("should increment the active stream counter via Redis INCR", async () => {
      await incrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockIncr).toHaveBeenCalledWith(`kenchi:alert-budget:${TEST_TENANT_ID}:active-streams`);
    });

    it("should not set any TTL (streams have no expiry)", async () => {
      await incrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockExpire).not.toHaveBeenCalled();
    });

    it("should silently skip when Redis is not ready", async () => {
      mockClient.status = "connecting";

      await incrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockIncr).not.toHaveBeenCalled();
    });

    it("should swallow errors without throwing", async () => {
      mockIncr.mockRejectedValue(new Error("Redis timeout"));

      await expect(
        incrementActiveStreamCount(TEST_TENANT_ID, testContext)
      ).resolves.toBeUndefined();
    });
  });

  // ==================== decrementActiveStreamCount ====================

  describe("decrementActiveStreamCount", () => {
    it("should decrement the active stream counter via Redis DECR", async () => {
      mockDecr.mockResolvedValue(2);

      await decrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockDecr).toHaveBeenCalledWith(`kenchi:alert-budget:${TEST_TENANT_ID}:active-streams`);
    });

    it("should not floor when result is zero", async () => {
      mockDecr.mockResolvedValue(0);

      await decrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockDecr).toHaveBeenCalledTimes(1);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it("should not floor when result is positive", async () => {
      mockDecr.mockResolvedValue(3);

      await decrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockSet).not.toHaveBeenCalled();
    });

    it("should floor to zero when DECR goes negative", async () => {
      mockDecr.mockResolvedValue(-1);

      await decrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockSet).toHaveBeenCalledWith(
        `kenchi:alert-budget:${TEST_TENANT_ID}:active-streams`,
        "0"
      );
    });

    it("should floor to zero when DECR goes deeply negative", async () => {
      mockDecr.mockResolvedValue(-5);

      await decrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockSet).toHaveBeenCalledWith(
        `kenchi:alert-budget:${TEST_TENANT_ID}:active-streams`,
        "0"
      );
    });

    it("should silently skip when Redis is not ready", async () => {
      mockClient.status = "connecting";

      await decrementActiveStreamCount(TEST_TENANT_ID, testContext);

      expect(mockDecr).not.toHaveBeenCalled();
    });

    it("should swallow errors without throwing", async () => {
      mockDecr.mockRejectedValue(new Error("Redis timeout"));

      await expect(
        decrementActiveStreamCount(TEST_TENANT_ID, testContext)
      ).resolves.toBeUndefined();
    });

    it("should swallow errors from the SET floor operation", async () => {
      mockDecr.mockResolvedValue(-1);
      mockSet.mockRejectedValue(new Error("Redis write failed"));

      await expect(
        decrementActiveStreamCount(TEST_TENANT_ID, testContext)
      ).resolves.toBeUndefined();
    });
  });

  // ==================== checkWindowQuota ====================

  describe("checkWindowQuota", () => {
    it("should allow when current windows are under the limit", async () => {
      mockGet.mockResolvedValue("5");

      const result = await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 5,
        limit: 12,
      });
    });

    it("should deny when window count equals the limit", async () => {
      mockGet.mockResolvedValue("12");

      const result = await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(12);
      expect(result.limit).toBe(12);
      expect(result.reason).toContain("Daily window limit reached");
    });

    it("should deny when window count exceeds the limit", async () => {
      mockGet.mockResolvedValue("20");

      const result = await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("20/12");
    });

    it("should allow when no counter exists yet (null from Redis)", async () => {
      mockGet.mockResolvedValue(null);

      const result = await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 0,
        limit: 12,
      });
    });

    it("should allow unconditionally when plan limit is unlimited (0)", async () => {
      // team plan has maxWindowsPerDay: 0 (unlimited)
      const result = await checkWindowQuota(TEST_TENANT_ID, "team", testContext);

      expect(result).toEqual({ allowed: true });
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should allow unconditionally for enterprise plan", async () => {
      const result = await checkWindowQuota(TEST_TENANT_ID, "enterprise", testContext);

      expect(result).toEqual({ allowed: true });
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("should use pro plan limits (288 windows/day)", async () => {
      mockGet.mockResolvedValue("287");

      const result = await checkWindowQuota(TEST_TENANT_ID, "pro", testContext);

      expect(result).toEqual({
        allowed: true,
        currentUsage: 287,
        limit: 288,
      });
    });

    it("should deny pro plan at exactly 288 windows", async () => {
      mockGet.mockResolvedValue("288");

      const result = await checkWindowQuota(TEST_TENANT_ID, "pro", testContext);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("288/288");
    });

    it("should fail open when Redis is not ready", async () => {
      mockClient.status = "connecting";

      const result = await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should fail open when Redis throws an error", async () => {
      mockGet.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should use correct Redis key format with tenantId and day bucket", async () => {
      mockGet.mockResolvedValue("0");

      await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      const calledKey = mockGet.mock.calls[0]?.[0] as string;
      expect(calledKey).toMatch(/^kenchi:alert-budget:tenant-abc:windows:\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ==================== incrementWindowCount ====================

  describe("incrementWindowCount", () => {
    it("should increment the window counter via Redis INCR", async () => {
      mockIncr.mockResolvedValue(5);

      await incrementWindowCount(TEST_TENANT_ID, testContext);

      expect(mockIncr).toHaveBeenCalledTimes(1);
      const calledKey = mockIncr.mock.calls[0]?.[0] as string;
      expect(calledKey).toMatch(/^kenchi:alert-budget:tenant-abc:windows:\d{4}-\d{2}-\d{2}$/);
    });

    it("should set TTL when counter is first created (INCR returns 1)", async () => {
      mockIncr.mockResolvedValue(1);

      await incrementWindowCount(TEST_TENANT_ID, testContext);

      expect(mockExpire).toHaveBeenCalledTimes(1);
      const [key, ttl] = mockExpire.mock.calls[0] as [string, number];
      expect(key).toMatch(/^kenchi:alert-budget:tenant-abc:windows:/);
      expect(ttl).toBe(ALERT_BUDGET_REDIS_TTL);
    });

    it("should not set TTL when counter already exists (INCR returns > 1)", async () => {
      mockIncr.mockResolvedValue(10);

      await incrementWindowCount(TEST_TENANT_ID, testContext);

      expect(mockExpire).not.toHaveBeenCalled();
    });

    it("should silently skip when Redis is not ready", async () => {
      mockClient.status = "connecting";

      await incrementWindowCount(TEST_TENANT_ID, testContext);

      expect(mockIncr).not.toHaveBeenCalled();
    });

    it("should swallow errors without throwing", async () => {
      mockIncr.mockRejectedValue(new Error("Redis write failed"));

      await expect(incrementWindowCount(TEST_TENANT_ID, testContext)).resolves.toBeUndefined();
    });

    it("should swallow errors from the EXPIRE operation", async () => {
      mockIncr.mockResolvedValue(1);
      mockExpire.mockRejectedValue(new Error("Redis expire failed"));

      await expect(incrementWindowCount(TEST_TENANT_ID, testContext)).resolves.toBeUndefined();
    });
  });

  // ==================== Cross-cutting: fail-open ====================

  describe("fail-open behavior", () => {
    it("should allow analysis quota check when getRedisClient throws", async () => {
      // Simulate getRedisClient itself throwing (e.g., not initialized)
      mockGet.mockImplementation(() => {
        throw new Error("Client not initialized");
      });

      const result = await checkAlertAnalysisQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should allow active stream quota check when getRedisClient throws", async () => {
      mockGet.mockImplementation(() => {
        throw new Error("Client not initialized");
      });

      const result = await checkActiveStreamQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should allow window quota check when getRedisClient throws", async () => {
      mockGet.mockImplementation(() => {
        throw new Error("Client not initialized");
      });

      const result = await checkWindowQuota(TEST_TENANT_ID, "free", testContext);

      expect(result).toEqual({ allowed: true });
    });

    it("should not throw from incrementAlertAnalysisCount on any error", async () => {
      mockClient.status = "ready";
      mockIncr.mockRejectedValue(new Error("Catastrophic Redis failure"));

      await expect(
        incrementAlertAnalysisCount(TEST_TENANT_ID, testContext)
      ).resolves.toBeUndefined();
    });

    it("should not throw from incrementActiveStreamCount on any error", async () => {
      mockIncr.mockRejectedValue(new Error("Catastrophic Redis failure"));

      await expect(
        incrementActiveStreamCount(TEST_TENANT_ID, testContext)
      ).resolves.toBeUndefined();
    });

    it("should not throw from decrementActiveStreamCount on any error", async () => {
      mockDecr.mockRejectedValue(new Error("Catastrophic Redis failure"));

      await expect(
        decrementActiveStreamCount(TEST_TENANT_ID, testContext)
      ).resolves.toBeUndefined();
    });

    it("should not throw from incrementWindowCount on any error", async () => {
      mockIncr.mockRejectedValue(new Error("Catastrophic Redis failure"));

      await expect(incrementWindowCount(TEST_TENANT_ID, testContext)).resolves.toBeUndefined();
    });
  });
});
