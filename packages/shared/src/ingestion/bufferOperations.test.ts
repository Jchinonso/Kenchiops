/**
 * Unit tests for ingestion/bufferOperations.ts
 *
 * Tests the core write operations of the Redis-backed ingestion buffer:
 * - isClientReady: connection state checking
 * - append: dedup, eviction, metadata tracking, fail-open
 * - flush: distributed locking, window numbering, summary carry-forward, old line cleanup
 * - close: multi-key cleanup, fail-open
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// ==================== Redis Mock ====================

const mockRedisStore: Record<string, string> = {};
const mockSortedSets: Record<string, Array<{ score: number; member: string }>> = {};
const mockHashes: Record<string, Record<string, string>> = {};

const mockRedisClient = {
  status: "ready" as string,

  // Sorted set operations
  zadd: jest.fn(
    async (_key: string, _nx: string, ...args: Array<string | number>): Promise<number> => {
      const key = _key;
      if (!mockSortedSets[key]) {
        mockSortedSets[key] = [];
      }
      let added = 0; // let: accumulates count of newly inserted members
      for (let i = 0; i < args.length; i += 2) {
        // let: loop counter for pair iteration
        const score = Number(args[i]);
        const member = String(args[i + 1]);
        const exists = mockSortedSets[key].some((e) => e.member === member);
        if (!exists) {
          mockSortedSets[key].push({ score, member });
          added += 1;
        }
      }
      return added;
    }
  ),

  zcard: jest.fn(async (key: string): Promise<number> => {
    return mockSortedSets[key]?.length ?? 0;
  }),

  zrangebyscore: jest.fn(async (key: string, min: string, max: string): Promise<string[]> => {
    const set = mockSortedSets[key] ?? [];
    const minVal =
      min === "-inf" ? -Infinity : min.startsWith("(") ? Number(min.slice(1)) + 0.001 : Number(min);
    const maxVal = max === "+inf" ? Infinity : Number(max);
    return set
      .filter((e) => e.score >= minVal && e.score <= maxVal)
      .sort((a, b) => a.score - b.score)
      .map((e) => e.member);
  }),

  zremrangebyrank: jest.fn(async (key: string, start: number, stop: number): Promise<number> => {
    const set = mockSortedSets[key];
    if (!set) return 0;
    set.sort((a, b) => a.score - b.score);
    const removed = set.splice(start, stop - start + 1);
    return removed.length;
  }),

  zremrangebyscore: jest.fn(async (key: string, min: string, max: string): Promise<number> => {
    const set = mockSortedSets[key];
    if (!set) return 0;
    const minVal = min === "-inf" ? -Infinity : Number(min);
    const maxVal = max === "+inf" ? Infinity : Number(max);
    const before = set.length;
    mockSortedSets[key] = set.filter((e) => e.score < minVal || e.score > maxVal);
    return before - mockSortedSets[key].length;
  }),

  // Hash operations
  hgetall: jest.fn(async (key: string): Promise<Record<string, string>> => {
    return mockHashes[key] ?? {};
  }),

  hset: jest.fn(async (key: string, fields: Record<string, string>): Promise<number> => {
    mockHashes[key] = { ...mockHashes[key], ...fields };
    return Object.keys(fields).length;
  }),

  // Key operations
  expire: jest.fn(async (): Promise<number> => 1),

  del: jest.fn(async (...keys: string[]): Promise<number> => {
    let deleted = 0; // let: accumulates deletion count
    for (const key of keys) {
      if (mockRedisStore[key] || mockSortedSets[key] || mockHashes[key]) {
        delete mockRedisStore[key];
        delete mockSortedSets[key];
        delete mockHashes[key];
        deleted += 1;
      }
    }
    return deleted;
  }),

  // Lock operations
  set: jest.fn(
    async (
      key: string,
      value: string,
      _ex?: string,
      _ttl?: number,
      _nx?: string
    ): Promise<string | null> => {
      if (_nx === "NX" && mockRedisStore[key]) {
        return null;
      }
      mockRedisStore[key] = value;
      return "OK";
    }
  ),

  // String operations
  get: jest.fn(async (key: string): Promise<string | null> => {
    return mockRedisStore[key] ?? null;
  }),

  setex: jest.fn(async (key: string, _ttl: number, value: string): Promise<string> => {
    mockRedisStore[key] = value;
    return "OK";
  }),
};

jest.mock("../queue/redisClient.js", () => ({
  getRedisClient: () => mockRedisClient,
}));

jest.mock("../core/index.js", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  withTimeout: <T>(promise: Promise<T>, _timeout: number): Promise<T> => promise,
  getErrorMessage: (err: unknown): string => (err instanceof Error ? err.message : String(err)),
}));

// ==================== Helpers ====================

const clearMockRedis = (): void => {
  Object.keys(mockRedisStore).forEach((key) => delete mockRedisStore[key]);
  Object.keys(mockSortedSets).forEach((key) => delete mockSortedSets[key]);
  Object.keys(mockHashes).forEach((key) => delete mockHashes[key]);
  jest.clearAllMocks();
  mockRedisClient.status = "ready";
};

// ==================== Import after mocks ====================

import { isClientReady, append, flush, close } from "./bufferOperations.js";
import type { RequestContext } from "../core/types.js";
import type { LogLine } from "../ports/deployLogSourcePort.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createLogLine = (overrides: Partial<LogLine> = {}): LogLine => ({
  timestamp: new Date("2026-03-26T10:00:00Z"),
  message: "Test log line message",
  level: "info",
  source: "stdout",
  ...overrides,
});

const createLogLines = (
  count: number,
  baseTime = new Date("2026-03-26T10:00:00Z")
): readonly LogLine[] =>
  Array.from({ length: count }, (_, i) =>
    createLogLine({
      timestamp: new Date(baseTime.getTime() + i * 1000),
      message: `Log line ${i}`,
    })
  );

// ==================== Tests ====================

describe("bufferOperations", () => {
  beforeEach(() => {
    clearMockRedis();
  });

  // ==================== isClientReady ====================

  describe("isClientReady", () => {
    it("should return true when Redis client status is ready", () => {
      mockRedisClient.status = "ready";
      expect(isClientReady()).toBe(true);
    });

    it("should return false when Redis client status is not ready", () => {
      mockRedisClient.status = "connecting";
      expect(isClientReady()).toBe(false);
    });

    it("should return false when Redis client status is end", () => {
      mockRedisClient.status = "end";
      expect(isClientReady()).toBe(false);
    });
  });

  // ==================== append ====================

  describe("append", () => {
    it("should return empty result when lines array is empty", async () => {
      const result = await append("entity-1", "tenant-1", "vercel", [], testContext);

      expect(result).toEqual({
        linesAccepted: 0,
        linesDeduplicated: 0,
        estimatedBufferTokens: 0,
        linesEvicted: 0,
      });
      expect(mockRedisClient.zadd).not.toHaveBeenCalled();
    });

    it("should return empty result when Redis client is not ready", async () => {
      mockRedisClient.status = "connecting";
      const lines = createLogLines(3);

      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      expect(result).toEqual({
        linesAccepted: 0,
        linesDeduplicated: 0,
        estimatedBufferTokens: 0,
        linesEvicted: 0,
      });
      expect(mockRedisClient.zadd).not.toHaveBeenCalled();
    });

    it("should append lines to the buffer sorted set with ZADD NX", async () => {
      const lines = createLogLines(3);

      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      expect(result.linesAccepted).toBe(3);
      expect(result.linesDeduplicated).toBe(0);
      expect(mockRedisClient.zadd).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.zadd).toHaveBeenCalledWith(
        expect.stringContaining("tenant-1:entity-1"),
        "NX",
        expect.any(Number),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        expect.any(Number),
        expect.any(String)
      );
    });

    it("should deduplicate lines with identical messages", async () => {
      const duplicateLine = createLogLine({ message: "duplicate message" });
      const lines = [duplicateLine, duplicateLine, duplicateLine];

      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      // ZADD NX only adds unique members; same message = same hash = same member
      expect(result.linesAccepted).toBe(1);
      expect(result.linesDeduplicated).toBe(2);
    });

    it("should deduplicate across separate append calls within the same buffer", async () => {
      const line = createLogLine({ message: "repeated line" });

      const result1 = await append("entity-1", "tenant-1", "vercel", [line], testContext);
      expect(result1.linesAccepted).toBe(1);

      const result2 = await append("entity-1", "tenant-1", "vercel", [line], testContext);
      expect(result2.linesAccepted).toBe(0);
      expect(result2.linesDeduplicated).toBe(1);
    });

    it("should refresh buffer TTL on each append", async () => {
      const lines = createLogLines(1);

      await append("entity-1", "tenant-1", "vercel", lines, testContext);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        expect.stringContaining("tenant-1:entity-1"),
        86_400
      );
    });

    it("should create new metadata when buffer has no prior metadata", async () => {
      const lines = createLogLines(2);

      await append("entity-1", "tenant-1", "vercel", lines, testContext);

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        expect.stringContaining("tenant-1:entity-1"),
        expect.objectContaining({
          entityId: "entity-1",
          tenantId: "tenant-1",
          platform: "vercel",
          status: "active",
          totalLinesIngested: "2",
          windowCount: "0",
        })
      );
    });

    it("should preserve existing metadata fields and accumulate totalLinesIngested", async () => {
      // Seed existing metadata
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = {
        entityId: "entity-1",
        tenantId: "tenant-1",
        platform: "vercel",
        status: "active",
        createdAt: "2026-03-26T09:00:00.000Z",
        lastFlushAt: "2026-03-26T09:30:00.000Z",
        windowCount: "2",
        totalLinesIngested: "50",
      };

      const lines = createLogLines(5);
      await append("entity-1", "tenant-1", "vercel", lines, testContext);

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        metaKey,
        expect.objectContaining({
          createdAt: "2026-03-26T09:00:00.000Z",
          lastFlushAt: "2026-03-26T09:30:00.000Z",
          windowCount: "2",
          totalLinesIngested: "55",
        })
      );
    });

    it("should evict oldest lines when buffer exceeds max token ceiling", async () => {
      // MAX_BUFFER_TOKENS = 100_000, TOKENS_PER_LINE_ESTIMATE = 23
      // Need > 100_000 / 23 ~= 4348 lines to trigger eviction
      // We mock zcard to return a large number
      mockRedisClient.zcard.mockResolvedValueOnce(5000);

      const lines = createLogLines(1);
      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      // 5000 * 23 = 115_000 > 100_000 → eviction should trigger
      // evictCount = ceil(5000 * 0.2) = 1000
      expect(result.linesEvicted).toBe(1000);
      expect(mockRedisClient.zremrangebyrank).toHaveBeenCalledWith(
        expect.stringContaining("tenant-1:entity-1"),
        0,
        999
      );
    });

    it("should not evict when buffer is under max token ceiling", async () => {
      const lines = createLogLines(3);
      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      expect(result.linesEvicted).toBe(0);
      expect(mockRedisClient.zremrangebyrank).not.toHaveBeenCalled();
    });

    it("should return empty result on Redis error (fail-open)", async () => {
      mockRedisClient.zadd.mockRejectedValueOnce(new Error("Connection lost"));

      const lines = createLogLines(2);
      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      expect(result).toEqual({
        linesAccepted: 0,
        linesDeduplicated: 0,
        estimatedBufferTokens: 0,
        linesEvicted: 0,
      });
    });

    it("should report estimatedBufferTokens based on buffer size and token estimate", async () => {
      const lines = createLogLines(10);
      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      // 10 lines * 23 tokens/line = 230
      expect(result.estimatedBufferTokens).toBe(10 * 23);
    });

    it("should use correct buffer key scoped to tenantId and entityId", async () => {
      const lines = createLogLines(1);

      await append("deploy-abc", "org-xyz", "railway", lines, testContext);

      expect(mockRedisClient.zadd).toHaveBeenCalledWith(
        "kenchi:log-buffer:org-xyz:deploy-abc",
        "NX",
        expect.any(Number),
        expect.any(String)
      );
    });

    it("should use timestamp as sorted set score", async () => {
      const ts = new Date("2026-03-26T12:00:00Z");
      const lines = [createLogLine({ timestamp: ts, message: "scored line" })];

      await append("entity-1", "tenant-1", "vercel", lines, testContext);

      const callArgs = mockRedisClient.zadd.mock.calls[0];
      // args[2] is the first score
      expect(callArgs[2]).toBe(ts.getTime());
    });

    it("should handle non-numeric ZADD return gracefully", async () => {
      mockRedisClient.zadd.mockResolvedValueOnce("3" as unknown as number);

      const lines = createLogLines(5);
      const result = await append("entity-1", "tenant-1", "vercel", lines, testContext);

      // parseInt("3", 10) = 3 → linesDeduplicated = 5 - 3 = 2
      expect(result.linesAccepted).toBe(3);
      expect(result.linesDeduplicated).toBe(2);
    });
  });

  // ==================== flush ====================

  describe("flush", () => {
    it("should return empty result when Redis client is not ready", async () => {
      mockRedisClient.status = "connecting";

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result).toEqual({
        lines: [],
        lineCount: 0,
        estimatedTokens: 0,
        windowNumber: 0,
        previousSummary: null,
      });
    });

    it("should return empty result when flush lock cannot be acquired", async () => {
      // Pre-set the lock key to simulate another instance holding it
      const lockKey = "kenchi:flush-lock:tenant-1:entity-1";
      mockRedisStore[lockKey] = "1";

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result).toEqual({
        lines: [],
        lineCount: 0,
        estimatedTokens: 0,
        windowNumber: 0,
        previousSummary: null,
      });
    });

    it("should return empty result when buffer has no lines since last flush", async () => {
      // No sorted set data → zrangebyscore returns []
      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result).toEqual({
        lines: [],
        lineCount: 0,
        estimatedTokens: 0,
        windowNumber: 0,
        previousSummary: null,
      });
    });

    it("should return flushed lines with messages extracted from sorted set members", async () => {
      // Seed buffer with lines via append
      const lines = createLogLines(3);
      await append("entity-1", "tenant-1", "vercel", lines, testContext);
      jest.clearAllMocks();

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result.lineCount).toBe(3);
      expect(result.lines).toHaveLength(3);
      // Messages should be extracted (hash prefix stripped)
      result.lines.forEach((line) => {
        expect(line).toMatch(/^Log line \d$/);
      });
    });

    it("should increment window number from metadata", async () => {
      // Seed metadata with existing windowCount
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = {
        entityId: "entity-1",
        tenantId: "tenant-1",
        platform: "vercel",
        status: "active",
        createdAt: "2026-03-26T09:00:00.000Z",
        lastFlushAt: "",
        windowCount: "3",
        totalLinesIngested: "100",
      };

      // Seed buffer lines
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:test line" }];

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result.windowNumber).toBe(4);
    });

    it("should start at window 1 when no prior metadata exists", async () => {
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:first window line" }];

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result.windowNumber).toBe(1);
    });

    it("should include previous summary when one exists in Redis", async () => {
      const summary = {
        version: 1,
        windowCount: 2,
        timeRange: { start: "2026-03-26T09:00:00Z", end: "2026-03-26T09:30:00Z" },
        currentStatus: "investigating",
        keyFindings: ["memory leak detected"],
        errorTimeline: [],
        unresolvedIssues: ["high memory usage"],
        metricsSnapshot: "cpu=80%",
        tokenCount: 500,
      };

      const summaryKey = "kenchi:log-summary:tenant-1:entity-1";
      mockRedisStore[summaryKey] = JSON.stringify(summary);

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:some log line" }];

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result.previousSummary).toEqual(summary);
    });

    it("should return null previousSummary when no summary exists", async () => {
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:some line" }];

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result.previousSummary).toBeNull();
    });

    it("should update lastFlushAt and windowCount in metadata after flush", async () => {
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:line one" }];

      await flush("entity-1", "tenant-1", testContext);

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        "kenchi:log-buffer-meta:tenant-1:entity-1",
        expect.objectContaining({
          windowCount: "1",
        })
      );

      const metaUpdate = mockRedisClient.hset.mock.calls[0][1] as Record<string, string>;
      expect(metaUpdate.lastFlushAt).toBeDefined();
      expect(new Date(metaUpdate.lastFlushAt).getTime()).toBeGreaterThan(0);
    });

    it("should only return lines scored after lastFlushAt", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      const lastFlushTime = new Date("2026-03-26T10:00:00Z").getTime();
      mockHashes[metaKey] = {
        entityId: "entity-1",
        tenantId: "tenant-1",
        platform: "vercel",
        status: "active",
        createdAt: "2026-03-26T09:00:00.000Z",
        lastFlushAt: new Date(lastFlushTime).toISOString(),
        windowCount: "1",
        totalLinesIngested: "10",
      };

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [
        { score: lastFlushTime - 5000, member: "aaa111222333:old line before flush" },
        { score: lastFlushTime + 1000, member: "bbb444555666:new line after flush" },
        { score: lastFlushTime + 2000, member: "ccc777888999:another new line" },
      ];

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result.lineCount).toBe(2);
      expect(result.lines).toEqual(["new line after flush", "another new line"]);
    });

    it("should clean up old lines scored at or before lastFlushAt", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      const lastFlushTime = new Date("2026-03-26T10:00:00Z").getTime();
      mockHashes[metaKey] = {
        entityId: "entity-1",
        tenantId: "tenant-1",
        platform: "vercel",
        status: "active",
        createdAt: "2026-03-26T09:00:00.000Z",
        lastFlushAt: new Date(lastFlushTime).toISOString(),
        windowCount: "1",
        totalLinesIngested: "10",
      };

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [
        { score: lastFlushTime - 5000, member: "aaa111222333:old line" },
        { score: lastFlushTime + 1000, member: "bbb444555666:new line" },
      ];

      await flush("entity-1", "tenant-1", testContext);

      expect(mockRedisClient.zremrangebyscore).toHaveBeenCalledWith(
        bufferKey,
        "-inf",
        String(lastFlushTime)
      );
    });

    it("should not clean up old lines when there is no lastFlushAt", async () => {
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:first ever line" }];

      await flush("entity-1", "tenant-1", testContext);

      expect(mockRedisClient.zremrangebyscore).not.toHaveBeenCalled();
    });

    it("should release flush lock after successful flush", async () => {
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:test line" }];

      await flush("entity-1", "tenant-1", testContext);

      // Lock should be released via del
      expect(mockRedisClient.del).toHaveBeenCalledWith("kenchi:flush-lock:tenant-1:entity-1");
    });

    it("should release flush lock even when an error occurs during flush", async () => {
      // Make hgetall succeed (lock acquired) but zrangebyscore fail
      mockRedisClient.zrangebyscore.mockRejectedValueOnce(new Error("Redis failure"));

      const result = await flush("entity-1", "tenant-1", testContext);

      // Fail-open returns empty
      expect(result.lineCount).toBe(0);
      // Lock should still be released
      expect(mockRedisClient.del).toHaveBeenCalledWith("kenchi:flush-lock:tenant-1:entity-1");
    });

    it("should return empty result on Redis error (fail-open)", async () => {
      mockRedisClient.set.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await flush("entity-1", "tenant-1", testContext);

      expect(result).toEqual({
        lines: [],
        lineCount: 0,
        estimatedTokens: 0,
        windowNumber: 0,
        previousSummary: null,
      });
    });

    it("should estimate tokens for flushed lines", async () => {
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSets[bufferKey] = [{ score: Date.now(), member: "abc123456789:hello world" }];

      const result = await flush("entity-1", "tenant-1", testContext);

      // "hello world" = 11 chars / 3.5 chars per token = ceil(3.14) = 4
      expect(result.estimatedTokens).toBe(Math.ceil(11 / 3.5));
    });
  });

  // ==================== close ====================

  describe("close", () => {
    it("should do nothing when Redis client is not ready", async () => {
      mockRedisClient.status = "connecting";

      await close("entity-1", "tenant-1", testContext);

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it("should delete all four Redis keys for the buffer", async () => {
      await close("entity-1", "tenant-1", testContext);

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        "kenchi:log-buffer:tenant-1:entity-1",
        "kenchi:log-buffer-meta:tenant-1:entity-1",
        "kenchi:log-summary:tenant-1:entity-1",
        "kenchi:flush-lock:tenant-1:entity-1"
      );
    });

    it("should not throw on Redis error (fail-open)", async () => {
      mockRedisClient.del.mockRejectedValueOnce(new Error("Connection lost"));

      // Should not throw
      await expect(close("entity-1", "tenant-1", testContext)).resolves.toBeUndefined();
    });

    it("should use correct tenant-scoped keys", async () => {
      await close("deploy-xyz", "org-abc", testContext);

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        "kenchi:log-buffer:org-abc:deploy-xyz",
        "kenchi:log-buffer-meta:org-abc:deploy-xyz",
        "kenchi:log-summary:org-abc:deploy-xyz",
        "kenchi:flush-lock:org-abc:deploy-xyz"
      );
    });
  });
});
