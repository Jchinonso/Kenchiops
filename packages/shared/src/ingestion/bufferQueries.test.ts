/**
 * Unit tests for ingestion/bufferQueries.ts
 *
 * Tests the read-only operations and flush trigger evaluation:
 * - getMetadata: returns BufferMetadata or null, fail-open
 * - getSummary: returns IncidentSummary or null, fail-open
 * - updateSummary: stores JSON summary with TTL, fail-open
 * - checkFlushTriggers: time elapsed, volume threshold, budget-aware throttling, inactive buffer
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// ==================== Redis Mock ====================

const mockRedisStore: Record<string, string> = {};
const mockHashes: Record<string, Record<string, string>> = {};
const mockSortedSetSizes: Record<string, number> = {};

const mockRedisClient = {
  status: "ready" as string,

  hgetall: jest.fn(async (key: string): Promise<Record<string, string>> => {
    return mockHashes[key] ?? {};
  }),

  get: jest.fn(async (key: string): Promise<string | null> => {
    return mockRedisStore[key] ?? null;
  }),

  setex: jest.fn(async (key: string, _ttl: number, value: string): Promise<string> => {
    mockRedisStore[key] = value;
    return "OK";
  }),

  zcard: jest.fn(async (key: string): Promise<number> => {
    return mockSortedSetSizes[key] ?? 0;
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

// Mock isClientReady from bufferOperations (it depends on same Redis client)
jest.mock("./bufferOperations.js", () => ({
  isClientReady: (): boolean => mockRedisClient.status === "ready",
}));

// ==================== Helpers ====================

const clearMockRedis = (): void => {
  Object.keys(mockRedisStore).forEach((key) => delete mockRedisStore[key]);
  Object.keys(mockHashes).forEach((key) => delete mockHashes[key]);
  Object.keys(mockSortedSetSizes).forEach((key) => delete mockSortedSetSizes[key]);
  jest.clearAllMocks();
  mockRedisClient.status = "ready";
};

// ==================== Import after mocks ====================

import { getMetadata, getSummary, updateSummary, checkFlushTriggers } from "./bufferQueries.js";
import type { IncidentSummary } from "./types.js";

// ==================== Test Fixtures ====================

const createTestMetadata = (overrides: Record<string, string> = {}): Record<string, string> => ({
  entityId: "entity-1",
  tenantId: "tenant-1",
  platform: "vercel",
  status: "active",
  createdAt: "2026-03-26T09:00:00.000Z",
  lastFlushAt: "2026-03-26T09:30:00.000Z",
  windowCount: "2",
  totalLinesIngested: "50",
  ...overrides,
});

const createTestSummary = (overrides: Partial<IncidentSummary> = {}): IncidentSummary => ({
  version: 1,
  windowCount: 2,
  timeRange: { start: "2026-03-26T09:00:00Z", end: "2026-03-26T09:30:00Z" },
  currentStatus: "investigating",
  keyFindings: ["memory leak detected"],
  errorTimeline: [
    { timestamp: "2026-03-26T09:10:00Z", severity: "critical", message: "OOM killed" },
  ],
  unresolvedIssues: ["high memory usage"],
  metricsSnapshot: "cpu=80%,mem=95%",
  tokenCount: 500,
  ...overrides,
});

// ==================== Tests ====================

describe("bufferQueries", () => {
  beforeEach(() => {
    clearMockRedis();
  });

  // ==================== getMetadata ====================

  describe("getMetadata", () => {
    it("should return null when Redis client is not ready", async () => {
      mockRedisClient.status = "connecting";

      const result = await getMetadata("entity-1", "tenant-1");

      expect(result).toBeNull();
      expect(mockRedisClient.hgetall).not.toHaveBeenCalled();
    });

    it("should return null when no metadata exists for the entity", async () => {
      const result = await getMetadata("nonexistent", "tenant-1");

      expect(result).toBeNull();
    });

    it("should return deserialized BufferMetadata when metadata exists", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata();

      const result = await getMetadata("entity-1", "tenant-1");

      expect(result).toEqual({
        entityId: "entity-1",
        tenantId: "tenant-1",
        platform: "vercel",
        status: "active",
        createdAt: "2026-03-26T09:00:00.000Z",
        lastFlushAt: "2026-03-26T09:30:00.000Z",
        windowCount: 2,
        totalLinesIngested: 50,
      });
    });

    it("should return null for lastFlushAt when stored as empty string", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: "" });

      const result = await getMetadata("entity-1", "tenant-1");

      expect(result?.lastFlushAt).toBeNull();
    });

    it("should parse windowCount and totalLinesIngested as numbers", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({
        windowCount: "15",
        totalLinesIngested: "12345",
      });

      const result = await getMetadata("entity-1", "tenant-1");

      expect(result?.windowCount).toBe(15);
      expect(result?.totalLinesIngested).toBe(12345);
    });

    it("should default windowCount and totalLinesIngested to 0 for non-numeric values", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({
        windowCount: "not-a-number",
        totalLinesIngested: "",
      });

      const result = await getMetadata("entity-1", "tenant-1");

      expect(result?.windowCount).toBe(0);
      expect(result?.totalLinesIngested).toBe(0);
    });

    it("should return null on Redis error (fail-open)", async () => {
      mockRedisClient.hgetall.mockRejectedValueOnce(new Error("Connection lost"));

      const result = await getMetadata("entity-1", "tenant-1");

      expect(result).toBeNull();
    });

    it("should use correct tenant-scoped key", async () => {
      await getMetadata("deploy-abc", "org-xyz");

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith(
        "kenchi:log-buffer-meta:org-xyz:deploy-abc"
      );
    });
  });

  // ==================== getSummary ====================

  describe("getSummary", () => {
    it("should return null when Redis client is not ready", async () => {
      mockRedisClient.status = "connecting";

      const result = await getSummary("entity-1", "tenant-1");

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it("should return null when no summary exists", async () => {
      const result = await getSummary("entity-1", "tenant-1");

      expect(result).toBeNull();
    });

    it("should return parsed IncidentSummary when summary exists", async () => {
      const summary = createTestSummary();
      const summaryKey = "kenchi:log-summary:tenant-1:entity-1";
      mockRedisStore[summaryKey] = JSON.stringify(summary);

      const result = await getSummary("entity-1", "tenant-1");

      expect(result).toEqual(summary);
    });

    it("should return null on Redis error (fail-open)", async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error("Timeout"));

      const result = await getSummary("entity-1", "tenant-1");

      expect(result).toBeNull();
    });

    it("should use correct tenant-scoped key", async () => {
      await getSummary("deploy-abc", "org-xyz");

      expect(mockRedisClient.get).toHaveBeenCalledWith("kenchi:log-summary:org-xyz:deploy-abc");
    });
  });

  // ==================== updateSummary ====================

  describe("updateSummary", () => {
    it("should do nothing when Redis client is not ready", async () => {
      mockRedisClient.status = "connecting";
      const summary = createTestSummary();

      await updateSummary("entity-1", "tenant-1", summary);

      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it("should store summary as JSON with TTL", async () => {
      const summary = createTestSummary();

      await updateSummary("entity-1", "tenant-1", summary);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        "kenchi:log-summary:tenant-1:entity-1",
        86_400,
        JSON.stringify(summary)
      );
    });

    it("should overwrite existing summary", async () => {
      const summaryKey = "kenchi:log-summary:tenant-1:entity-1";
      mockRedisStore[summaryKey] = JSON.stringify(createTestSummary({ windowCount: 1 }));

      const updatedSummary = createTestSummary({ windowCount: 3, currentStatus: "resolved" });
      await updateSummary("entity-1", "tenant-1", updatedSummary);

      const stored = JSON.parse(mockRedisStore[summaryKey]) as IncidentSummary;
      expect(stored.windowCount).toBe(3);
      expect(stored.currentStatus).toBe("resolved");
    });

    it("should not throw on Redis error (fail-open)", async () => {
      mockRedisClient.setex.mockRejectedValueOnce(new Error("Write error"));
      const summary = createTestSummary();

      await expect(updateSummary("entity-1", "tenant-1", summary)).resolves.toBeUndefined();
    });

    it("should preserve all summary fields through serialization round-trip", async () => {
      const summary = createTestSummary({
        keyFindings: ["finding 1", "finding 2"],
        errorTimeline: [
          { timestamp: "2026-03-26T09:10:00Z", severity: "critical", message: "crash" },
          { timestamp: "2026-03-26T09:15:00Z", severity: "warning", message: "high latency" },
        ],
        unresolvedIssues: ["issue A", "issue B"],
      });

      await updateSummary("entity-1", "tenant-1", summary);

      const summaryKey = "kenchi:log-summary:tenant-1:entity-1";
      const stored = JSON.parse(mockRedisStore[summaryKey]) as IncidentSummary;
      expect(stored).toEqual(summary);
    });
  });

  // ==================== checkFlushTriggers ====================

  describe("checkFlushTriggers", () => {
    it("should return no-flush when Redis client is not ready", async () => {
      mockRedisClient.status = "connecting";

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result).toEqual({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 0,
        timeSinceLastFlushMs: 0,
      });
    });

    it("should return no-flush when no metadata exists for the entity", async () => {
      const result = await checkFlushTriggers("nonexistent", "tenant-1", "vercel");

      expect(result).toEqual({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 0,
        timeSinceLastFlushMs: 0,
      });
    });

    it("should return no-flush when buffer status is not active", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ status: "closed" });

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result).toEqual({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 0,
        timeSinceLastFlushMs: 0,
      });
    });

    it("should trigger time_elapsed when time since last flush exceeds platform window", async () => {
      // Vercel timeWindowSeconds = 180 (3 min)
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: fourMinutesAgo });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 10;

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result.shouldFlush).toBe(true);
      expect(result.reason).toBe("time_elapsed");
      expect(result.timeSinceLastFlushMs).toBeGreaterThanOrEqual(4 * 60 * 1000 - 100);
    });

    it("should use createdAt as base time when lastFlushAt is null", async () => {
      // Created 6 minutes ago, no flush yet → should trigger for Vercel (180s window)
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({
        createdAt: sixMinutesAgo,
        lastFlushAt: "",
      });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 5;

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result.shouldFlush).toBe(true);
      expect(result.reason).toBe("time_elapsed");
    });

    it("should trigger volume_exceeded when buffer tokens exceed platform threshold", async () => {
      // Vercel volumeThresholdTokens = 8_000
      // 8000 / 23 (TOKENS_PER_LINE_ESTIMATE) ~= 348 lines needed
      const recentFlush = new Date(Date.now() - 10_000).toISOString(); // 10s ago → time not triggered
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: recentFlush });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 400; // 400 * 23 = 9200 > 8000

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result.shouldFlush).toBe(true);
      expect(result.reason).toBe("volume_exceeded");
      expect(result.estimatedBufferTokens).toBe(400 * 23);
    });

    it("should not trigger when both time and volume are below thresholds", async () => {
      const recentFlush = new Date(Date.now() - 30_000).toISOString(); // 30s ago
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: recentFlush });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 10; // 10 * 23 = 230 tokens

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result.shouldFlush).toBe(false);
      expect(result.reason).toBe("none");
    });

    it("should use railway platform flush config (300s, 10000 tokens)", async () => {
      // Railway: 300s time window, 10_000 volume threshold
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: fourMinutesAgo });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 5;

      const result = await checkFlushTriggers("entity-1", "tenant-1", "railway");

      // 4 min = 240s < 300s → should NOT trigger for railway
      expect(result.shouldFlush).toBe(false);
    });

    it("should prioritize time trigger over volume trigger", async () => {
      // Both conditions met, but time is checked first
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: tenMinutesAgo });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 1000; // volume also exceeded

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result.shouldFlush).toBe(true);
      expect(result.reason).toBe("time_elapsed");
    });

    // ==================== Budget-Aware Throttling ====================

    describe("budget-aware throttling", () => {
      it("should use normal config when budgetRatio is undefined", async () => {
        // Vercel: 180s window normally
        const threeMinPlusAgo = new Date(Date.now() - 190_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: threeMinPlusAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", undefined);

        expect(result.shouldFlush).toBe(true);
        expect(result.reason).toBe("time_elapsed");
      });

      it("should use normal config when budgetRatio >= 0.3 (above moderate threshold)", async () => {
        const threeMinPlusAgo = new Date(Date.now() - 190_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: threeMinPlusAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.5);

        expect(result.shouldFlush).toBe(true);
        expect(result.reason).toBe("time_elapsed");
      });

      it("should use moderate throttle (3x window) when budgetRatio is between 0.1 and 0.3", async () => {
        // Vercel normal: 180s → moderate: 180 * 3 = 540s
        // 5 minutes = 300s < 540s → should NOT trigger
        const fiveMinAgo = new Date(Date.now() - 300_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: fiveMinAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.2);

        expect(result.shouldFlush).toBe(false);
        expect(result.reason).toBe("none");
      });

      it("should trigger with moderate throttle when time exceeds 3x window", async () => {
        // Vercel normal: 180s → moderate: 540s
        // 10 minutes = 600s > 540s → should trigger
        const tenMinAgo = new Date(Date.now() - 600_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: tenMinAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.2);

        expect(result.shouldFlush).toBe(true);
        expect(result.reason).toBe("time_elapsed");
      });

      it("should use moderate volume threshold (0.5x) when budget is moderate", async () => {
        // Vercel normal volume: 8000 → moderate: 8000 * 0.5 = 4000
        const recentFlush = new Date(Date.now() - 10_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: recentFlush });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        // 200 lines * 23 = 4600 > 4000 → should trigger
        mockSortedSetSizes[bufferKey] = 200;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.2);

        expect(result.shouldFlush).toBe(true);
        expect(result.reason).toBe("volume_exceeded");
      });

      it("should use severe throttle (6x window) when budgetRatio < 0.1", async () => {
        // Vercel normal: 180s → severe: 180 * 6 = 1080s (18 min)
        // 15 minutes = 900s < 1080s → should NOT trigger
        const fifteenMinAgo = new Date(Date.now() - 900_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: fifteenMinAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.05);

        expect(result.shouldFlush).toBe(false);
        expect(result.reason).toBe("none");
      });

      it("should trigger with severe throttle when time exceeds 6x window", async () => {
        // Vercel: 180s → severe: 1080s
        // 20 minutes = 1200s > 1080s → should trigger
        const twentyMinAgo = new Date(Date.now() - 1_200_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: twentyMinAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.05);

        expect(result.shouldFlush).toBe(true);
        expect(result.reason).toBe("time_elapsed");
      });

      it("should use severe volume threshold (0.25x) when budget is severely depleted", async () => {
        // Vercel normal volume: 8000 → severe: 8000 * 0.25 = 2000
        const recentFlush = new Date(Date.now() - 10_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: recentFlush });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        // 100 lines * 23 = 2300 > 2000 → should trigger
        mockSortedSetSizes[bufferKey] = 100;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.05);

        expect(result.shouldFlush).toBe(true);
        expect(result.reason).toBe("volume_exceeded");
      });

      it("should use normal config at exact moderate boundary (0.3)", async () => {
        // budgetRatio >= 0.3 → normal (not moderate)
        const threeMinPlusAgo = new Date(Date.now() - 190_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: threeMinPlusAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.3);

        // Normal vercel config: 180s window → 190s > 180s → should trigger
        expect(result.shouldFlush).toBe(true);
        expect(result.reason).toBe("time_elapsed");
      });

      it("should use moderate config at exact severe boundary (0.1)", async () => {
        // budgetRatio = 0.1 is >= SEVERE (0.1) but < MODERATE (0.3) → moderate tier
        const fiveMinAgo = new Date(Date.now() - 300_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: fiveMinAgo });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0.1);

        // Moderate: 180 * 3 = 540s → 300s < 540s → should NOT trigger
        expect(result.shouldFlush).toBe(false);
      });

      it("should handle budgetRatio of 0 as severe throttle", async () => {
        // budgetRatio = 0 < 0.1 → severe tier
        const recentFlush = new Date(Date.now() - 10_000).toISOString();
        const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
        mockHashes[metaKey] = createTestMetadata({ lastFlushAt: recentFlush });

        const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
        mockSortedSetSizes[bufferKey] = 5;

        const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel", 0);

        // 10s with severe 6x window (1080s) and small buffer → no trigger
        expect(result.shouldFlush).toBe(false);
      });
    });

    it("should return no-flush on Redis error (fail-open)", async () => {
      mockRedisClient.hgetall.mockRejectedValueOnce(new Error("Timeout"));

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result).toEqual({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 0,
        timeSinceLastFlushMs: 0,
      });
    });

    it("should fetch metadata and buffer size in parallel", async () => {
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata();
      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 10;

      await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith(metaKey);
      expect(mockRedisClient.zcard).toHaveBeenCalledWith(bufferKey);
    });

    it("should report estimatedBufferTokens even when not triggering flush", async () => {
      const recentFlush = new Date(Date.now() - 10_000).toISOString();
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: recentFlush });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 50;

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      expect(result.estimatedBufferTokens).toBe(50 * 23);
      expect(result.shouldFlush).toBe(false);
    });

    it("should report timeSinceLastFlushMs even when not triggering flush", async () => {
      const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
      const metaKey = "kenchi:log-buffer-meta:tenant-1:entity-1";
      mockHashes[metaKey] = createTestMetadata({ lastFlushAt: thirtySecondsAgo });

      const bufferKey = "kenchi:log-buffer:tenant-1:entity-1";
      mockSortedSetSizes[bufferKey] = 5;

      const result = await checkFlushTriggers("entity-1", "tenant-1", "vercel");

      // Should be approximately 30 seconds
      expect(result.timeSinceLastFlushMs).toBeGreaterThanOrEqual(29_000);
      expect(result.timeSinceLastFlushMs).toBeLessThanOrEqual(32_000);
    });
  });
});
