/**
 * Unit tests for queue/tenantQuota.ts
 *
 * Tests per-tenant resource quota enforcement:
 * - Queue depth quota checks and counter management
 * - Processing time quota tracking
 * - Plan-based quota lookup
 * - Fail-open behavior when Redis is unavailable
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// ==================== Redis Mock ====================

const mockRedisStore: Record<string, string> = {};

const mockRedisClient = {
  status: "ready" as string,
  get: jest.fn(async (key: string): Promise<string | null> => {
    return mockRedisStore[key] ?? null;
  }),
  set: jest.fn(async (key: string, value: string): Promise<string> => {
    mockRedisStore[key] = value;
    return "OK";
  }),
  incr: jest.fn(async (key: string): Promise<number> => {
    const current = parseInt(mockRedisStore[key] ?? "0", 10);
    const next = current + 1;
    mockRedisStore[key] = String(next);
    return next;
  }),
  decr: jest.fn(async (key: string): Promise<number> => {
    const current = parseInt(mockRedisStore[key] ?? "0", 10);
    const next = current - 1;
    mockRedisStore[key] = String(next);
    return next;
  }),
  incrby: jest.fn(async (key: string, amount: number): Promise<number> => {
    const current = parseInt(mockRedisStore[key] ?? "0", 10);
    const next = current + amount;
    mockRedisStore[key] = String(next);
    return next;
  }),
  expire: jest.fn(async (): Promise<number> => 1),
};

jest.mock("../../queue/redisClient.js", () => ({
  getRedisClient: () => mockRedisClient,
}));

// ==================== Helpers ====================

const clearMockRedis = (): void => {
  Object.keys(mockRedisStore).forEach((key) => delete mockRedisStore[key]);
  jest.clearAllMocks();
  mockRedisClient.status = "ready";
};

// ==================== Import after mocks ====================

import {
  getQuotaForPlan,
  checkQueueDepthQuota,
  incrementQueueDepth,
  decrementQueueDepth,
  recordProcessingTime,
  checkProcessingTimeQuota,
} from "../../queue/tenantQuota.js";

// ==================== Tests ====================

describe("Tenant Quota", () => {
  beforeEach(() => {
    clearMockRedis();
  });

  describe("getQuotaForPlan", () => {
    it("should return free plan defaults for unknown plan", () => {
      const quota = getQuotaForPlan("nonexistent-plan");
      expect(quota.maxQueueDepth).toBe(10);
      expect(quota.maxConcurrentJobs).toBe(1);
      expect(quota.maxProcessingTimePerHourMs).toBe(300_000);
    });

    it("should return correct limits for pro plan", () => {
      const quota = getQuotaForPlan("pro");
      expect(quota.maxQueueDepth).toBe(50);
      expect(quota.maxConcurrentJobs).toBe(3);
      expect(quota.maxProcessingTimePerHourMs).toBe(1_800_000);
    });

    it("should return correct limits for team plan", () => {
      const quota = getQuotaForPlan("team");
      expect(quota.maxQueueDepth).toBe(200);
      expect(quota.maxConcurrentJobs).toBe(5);
    });

    it("should return correct limits for enterprise plan", () => {
      const quota = getQuotaForPlan("enterprise");
      expect(quota.maxQueueDepth).toBe(1000);
      expect(quota.maxConcurrentJobs).toBe(10);
      expect(quota.maxProcessingTimePerHourMs).toBe(7_200_000);
    });
  });

  describe("checkQueueDepthQuota", () => {
    it("should allow when queue depth is below limit", async () => {
      mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"] = "5";

      const result = await checkQueueDepthQuota("tenant-1", "ci-analysis", "pro");

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(5);
      expect(result.limit).toBe(50);
    });

    it("should deny when queue depth meets limit", async () => {
      mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"] = "10";

      const result = await checkQueueDepthQuota("tenant-1", "ci-analysis", "free");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Queue depth limit reached");
      expect(result.currentUsage).toBe(10);
      expect(result.limit).toBe(10);
    });

    it("should deny when queue depth exceeds limit", async () => {
      mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"] = "15";

      const result = await checkQueueDepthQuota("tenant-1", "ci-analysis", "free");

      expect(result.allowed).toBe(false);
    });

    it("should allow when key does not exist (zero usage)", async () => {
      const result = await checkQueueDepthQuota("new-tenant", "ci-analysis", "free");

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(0);
    });

    it("should use free plan when planId is not provided", async () => {
      mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"] = "10";

      const result = await checkQueueDepthQuota("tenant-1", "ci-analysis");

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(10);
    });
  });

  describe("incrementQueueDepth / decrementQueueDepth", () => {
    it("should increment the queue depth counter", async () => {
      await incrementQueueDepth("tenant-1", "ci-analysis");

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        "kenchi:quota:tenant-1:queue-depth:ci-analysis"
      );
      expect(mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"]).toBe("1");
    });

    it("should decrement the queue depth counter", async () => {
      mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"] = "5";

      await decrementQueueDepth("tenant-1", "ci-analysis");

      expect(mockRedisClient.decr).toHaveBeenCalledWith(
        "kenchi:quota:tenant-1:queue-depth:ci-analysis"
      );
      expect(mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"]).toBe("4");
    });

    it("should floor queue depth at 0 to prevent negative drift", async () => {
      mockRedisStore["kenchi:quota:tenant-1:queue-depth:ci-analysis"] = "0";

      await decrementQueueDepth("tenant-1", "ci-analysis");

      // After decr returns -1, set should be called with "0"
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "kenchi:quota:tenant-1:queue-depth:ci-analysis",
        "0"
      );
    });
  });

  describe("recordProcessingTime", () => {
    it("should record processing time with INCRBY", async () => {
      await recordProcessingTime("tenant-1", 5000);

      expect(mockRedisClient.incrby).toHaveBeenCalledWith(
        expect.stringContaining("kenchi:quota:tenant-1:processing-time:"),
        5000
      );
    });

    it("should set TTL on first write to a new hour bucket", async () => {
      await recordProcessingTime("tenant-1", 3000);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        expect.stringContaining("kenchi:quota:tenant-1:processing-time:"),
        7200
      );
    });

    it("should not set TTL on subsequent writes to same bucket", async () => {
      // Pre-populate the bucket so incrby returns a value > the increment
      const hourBucket = new Date().toISOString().slice(0, 13);
      const key = `kenchi:quota:tenant-1:processing-time:${hourBucket}`;
      mockRedisStore[key] = "2000";

      await recordProcessingTime("tenant-1", 3000);

      // expire should NOT be called because current (5000) !== the increment (3000)
      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });
  });

  describe("checkProcessingTimeQuota", () => {
    it("should allow when processing time is below limit", async () => {
      const hourBucket = new Date().toISOString().slice(0, 13);
      const key = `kenchi:quota:tenant-1:processing-time:${hourBucket}`;
      mockRedisStore[key] = "100000";

      const result = await checkProcessingTimeQuota("tenant-1", "free");

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(100000);
      expect(result.limit).toBe(300_000);
    });

    it("should deny when processing time exceeds limit", async () => {
      const hourBucket = new Date().toISOString().slice(0, 13);
      const key = `kenchi:quota:tenant-1:processing-time:${hourBucket}`;
      mockRedisStore[key] = "350000";

      const result = await checkProcessingTimeQuota("tenant-1", "free");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Processing time limit reached");
    });
  });

  describe("fail-open behavior", () => {
    it("should allow when Redis is not ready", async () => {
      mockRedisClient.status = "connecting";

      const result = await checkQueueDepthQuota("tenant-1", "ci-analysis", "free");

      expect(result.allowed).toBe(true);
    });

    it("should allow when Redis throws an error", async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await checkQueueDepthQuota("tenant-1", "ci-analysis", "free");

      expect(result.allowed).toBe(true);
    });

    it("should silently handle increment failures", async () => {
      mockRedisClient.incr.mockRejectedValueOnce(new Error("Timeout"));

      // Should not throw
      await expect(incrementQueueDepth("tenant-1", "ci-analysis")).resolves.toBeUndefined();
    });

    it("should silently handle processing time recording failures", async () => {
      mockRedisClient.incrby.mockRejectedValueOnce(new Error("Timeout"));

      // Should not throw
      await expect(recordProcessingTime("tenant-1", 5000)).resolves.toBeUndefined();
    });
  });
});
