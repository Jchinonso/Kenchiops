/**
 * Unit tests for queue/fairScheduler.ts
 *
 * Tests fair (weighted round-robin) queue scheduling to verify:
 * - Tenant B jobs are processed within first 2 rounds even when tenant A has 10x more jobs
 * - Tenant cleanup occurs when all jobs are processed
 * - Backwards compatibility with base queue operations
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// ==================== Redis Mock ====================

const mockRedisData: Record<string, string[]> = {};
const mockRedisSets: Record<string, Set<string>> = {};

const mockRedisClient = {
  status: "ready" as string,
  lpush: jest.fn(async (key: string, value: string): Promise<number> => {
    if (!mockRedisData[key]) {
      mockRedisData[key] = [];
    }
    mockRedisData[key].unshift(value);
    return mockRedisData[key].length;
  }),
  rpoplpush: jest.fn(async (source: string, dest: string): Promise<string | null> => {
    const list = mockRedisData[source];
    if (!list || list.length === 0) {
      return null;
    }
    const item = list.pop()!;
    if (!mockRedisData[dest]) {
      mockRedisData[dest] = [];
    }
    mockRedisData[dest].unshift(item);
    return item;
  }),
  lrem: jest.fn(async (key: string, _count: number, value: string): Promise<number> => {
    const list = mockRedisData[key];
    if (!list) return 0;
    const idx = list.indexOf(value);
    if (idx === -1) return 0;
    list.splice(idx, 1);
    return 1;
  }),
  llen: jest.fn(async (key: string): Promise<number> => {
    return (mockRedisData[key] ?? []).length;
  }),
  sadd: jest.fn(async (key: string, member: string): Promise<number> => {
    if (!mockRedisSets[key]) {
      mockRedisSets[key] = new Set<string>();
    }
    const had = mockRedisSets[key].has(member);
    mockRedisSets[key].add(member);
    return had ? 0 : 1;
  }),
  srem: jest.fn(async (key: string, member: string): Promise<number> => {
    if (!mockRedisSets[key]) return 0;
    const had = mockRedisSets[key].has(member);
    mockRedisSets[key].delete(member);
    return had ? 1 : 0;
  }),
  srandmember: jest.fn(async (key: string): Promise<string | null> => {
    const set = mockRedisSets[key];
    if (!set || set.size === 0) return null;
    const members = Array.from(set);
    // Deterministic: return first member for test predictability
    return members[0];
  }),
  smembers: jest.fn(async (key: string): Promise<string[]> => {
    const set = mockRedisSets[key];
    return set ? Array.from(set) : [];
  }),
  del: jest.fn(async (..._keys: string[]): Promise<number> => {
    return 0;
  }),
  publish: jest.fn(async (): Promise<number> => 0),
};

jest.mock("../../queue/redisClient.js", () => ({
  getRedisClient: () => mockRedisClient,
  getSubscriberClient: () => mockRedisClient,
}));

// ==================== Helpers ====================

const clearMockRedis = (): void => {
  Object.keys(mockRedisData).forEach((key) => delete mockRedisData[key]);
  Object.keys(mockRedisSets).forEach((key) => delete mockRedisSets[key]);
  jest.clearAllMocks();
};

// ==================== Import after mocks ====================

import { createFairQueue } from "../../queue/fairScheduler.js";

// ==================== Tests ====================

describe("Fair Queue Scheduler", () => {
  beforeEach(() => {
    clearMockRedis();
  });

  describe("createFairQueue", () => {
    it("should return a FairQueueManager with all expected methods", () => {
      const queue = createFairQueue({ name: "test-queue" });

      expect(queue.name).toBe("test-queue");
      expect(typeof queue.enqueue).toBe("function");
      expect(typeof queue.process).toBe("function");
      expect(typeof queue.enqueueFair).toBe("function");
      expect(typeof queue.processFair).toBe("function");
      expect(typeof queue.getTenantStats).toBe("function");
      expect(typeof queue.getStats).toBe("function");
      expect(typeof queue.clear).toBe("function");
    });
  });

  describe("enqueueFair", () => {
    it("should enqueue a job into the tenant sub-queue", async () => {
      const queue = createFairQueue({ name: "kenchi:test" });
      const messageId = await queue.enqueueFair("analysis", { data: "payload" }, "tenant-a");

      expect(messageId).toBeDefined();
      expect(messageId).toMatch(/^msg_/);

      // Verify it was pushed to the tenant sub-queue
      expect(mockRedisClient.lpush).toHaveBeenCalledWith(
        "kenchi:test:tenant:tenant-a",
        expect.any(String)
      );

      // Verify tenant was added to active set
      expect(mockRedisClient.sadd).toHaveBeenCalledWith("kenchi:test:active-tenants", "tenant-a");
    });

    it("should include tenantId in metadata", async () => {
      const queue = createFairQueue({ name: "kenchi:test" });
      await queue.enqueueFair("analysis", { value: 42 }, "tenant-b", { extra: "info" });

      const pushCall = mockRedisClient.lpush.mock.calls[0];
      const serialized = JSON.parse(pushCall[1] as string);
      expect(serialized.metadata.tenantId).toBe("tenant-b");
      expect(serialized.metadata.extra).toBe("info");
    });
  });

  describe("processFair - round-robin fairness", () => {
    it("should process tenant B within first 2 rounds even when tenant A has 10x more jobs", async () => {
      const queue = createFairQueue({ name: "kenchi:fair" });

      // Enqueue 10 jobs for tenant A, 1 for tenant B
      for (const _ of Array.from({ length: 10 })) {
        await queue.enqueueFair("analysis", { tenant: "a" }, "tenant-a");
      }
      await queue.enqueueFair("analysis", { tenant: "b" }, "tenant-b");

      // Track which tenants get processed
      const processedTenants: string[] = [];
      const handler = jest.fn(async (message: { metadata?: { tenantId?: string } }) => {
        processedTenants.push(message.metadata?.tenantId ?? "unknown");
        return { success: true };
      });

      // Make srandmember return tenants in round-robin fashion
      // let: mutable counter for mock cycling
      let callCount = 0; // let: tracks srandmember call count for cycling
      mockRedisClient.srandmember.mockImplementation(async (key: string) => {
        const set = mockRedisSets[key];
        if (!set || set.size === 0) return null;
        const members = Array.from(set);
        const idx = callCount % members.length;
        callCount++;
        return members[idx];
      });

      // Process 2 rounds
      await queue.processFair(handler);
      await queue.processFair(handler);

      // Tenant B should appear within the first 2 processed jobs
      expect(processedTenants).toContain("tenant-b");
    });
  });

  describe("processFair - tenant cleanup", () => {
    it("should remove tenant from active set when their queue is empty", async () => {
      const queue = createFairQueue({ name: "kenchi:cleanup" });

      // Enqueue 1 job for tenant A
      await queue.enqueueFair("analysis", { data: "only-one" }, "tenant-cleanup");

      const handler = jest.fn(async () => ({ success: true }));

      // Process the single job
      await queue.processFair(handler);

      // Verify tenant was removed from active set after processing its only job
      expect(mockRedisClient.srem).toHaveBeenCalledWith(
        "kenchi:cleanup:active-tenants",
        "tenant-cleanup"
      );
    });

    it("should try another tenant when selected tenant queue is empty", async () => {
      const queue = createFairQueue({ name: "kenchi:fallback" });

      // Add tenant-empty to active set but with no jobs
      mockRedisSets["kenchi:fallback:active-tenants"] = new Set(["tenant-empty", "tenant-full"]);

      // Only tenant-full has a job
      await queue.enqueueFair("analysis", { data: "job" }, "tenant-full");

      // Make srandmember return tenant-empty first, then tenant-full
      // let: mutable counter for mock cycling
      let idx = 0; // let: tracks srandmember call sequence
      mockRedisClient.srandmember.mockImplementation(async () => {
        const members = ["tenant-empty", "tenant-full"];
        const member = members[idx % members.length];
        idx++;
        return member;
      });

      const processedPayloads: unknown[] = [];
      const handler = jest.fn(async (message: { payload?: unknown }) => {
        processedPayloads.push(message.payload);
        return { success: true };
      });

      await queue.processFair(handler);

      // Should have processed tenant-full's job after skipping tenant-empty
      expect(handler).toHaveBeenCalled();
      expect(processedPayloads).toHaveLength(1);
    });
  });

  describe("processFair - backwards compatibility", () => {
    it("should fall back to base queue when no active tenants exist", async () => {
      const queue = createFairQueue({ name: "kenchi:compat" });

      // Enqueue via the base queue (not enqueueFair)
      await queue.enqueue("analysis", { base: true });

      const handler = jest.fn(async () => ({ success: true }));

      // processFair should fall back to the base queue
      await queue.processFair(handler);

      // The base queue's rpoplpush should have been called for the main queue
      expect(mockRedisClient.rpoplpush).toHaveBeenCalledWith(
        "kenchi:compat",
        "kenchi:compat:processing"
      );
    });
  });

  describe("getTenantStats", () => {
    it("should return stats for a specific tenant", async () => {
      const queue = createFairQueue({ name: "kenchi:stats" });

      await queue.enqueueFair("analysis", { n: 1 }, "tenant-stats");
      await queue.enqueueFair("analysis", { n: 2 }, "tenant-stats");

      const stats = await queue.getTenantStats("tenant-stats");

      expect(stats.pending).toBe(2);
      expect(stats.processing).toBe(0);
    });

    it("should return zero stats for a tenant with no jobs", async () => {
      const queue = createFairQueue({ name: "kenchi:empty" });

      const stats = await queue.getTenantStats("nonexistent");

      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
    });
  });

  describe("getStats (aggregate)", () => {
    it("should sum pending jobs across all tenant sub-queues", async () => {
      const queue = createFairQueue({ name: "kenchi:agg" });

      await queue.enqueueFair("analysis", { n: 1 }, "tenant-x");
      await queue.enqueueFair("analysis", { n: 2 }, "tenant-x");
      await queue.enqueueFair("analysis", { n: 3 }, "tenant-y");

      const stats = await queue.getStats();

      expect(stats.pending).toBe(3);
    });
  });
});
