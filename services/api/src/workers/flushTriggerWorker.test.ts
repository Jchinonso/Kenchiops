/**
 * Flush Trigger Worker Tests
 *
 * Unit tests for the flush trigger worker which periodically scans
 * active ingestion buffers and triggers windowed analysis.
 *
 * @module workers/flushTriggerWorker.test
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { IngestionBufferPort, BufferMetadata } from "@kenchi/shared";
import type { DeployAnalysisService } from "../services/deployAnalysisService.js";

// ==================== Mock Setup ====================

const mockRedisClient = {
  status: "ready",
  scan: jest.fn<(...args: readonly unknown[]) => Promise<[string, string[]]>>(),
};

const mockGetRedisClient = jest.fn(() => mockRedisClient);

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    createLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
    getRedisClient: (...args: readonly unknown[]) => mockGetRedisClient(...args),
    withTimeout: jest.fn((promise: Promise<unknown>) => promise),
  };
});

const { startFlushTriggerWorker } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require("./flushTriggerWorker.js") as typeof import("./flushTriggerWorker.js");
const { INGESTION_REDIS_KEYS, STREAM_LIFECYCLE, REDIS_SCAN } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require("@kenchi/shared") as typeof import("@kenchi/shared");

// ==================== Test Fixtures ====================

const createMockBuffer = (): jest.Mocked<IngestionBufferPort> => ({
  append: jest.fn(),
  flush: jest.fn(),
  getMetadata: jest.fn(),
  getSummary: jest.fn(),
  updateSummary: jest.fn(),
  close: jest.fn(),
  checkFlushTriggers: jest.fn(),
});

const createMockDeployService = (): jest.Mocked<DeployAnalysisService> => ({
  processDeployWebhook: jest.fn(),
  processLogDrainBatch: jest.fn(),
  forceFlush: jest.fn(),
});

const createTestMetadata = (overrides?: Partial<BufferMetadata>): BufferMetadata => ({
  entityId: "deploy-1",
  tenantId: "tenant-1",
  platform: "vercel",
  status: "active",
  createdAt: new Date().toISOString(),
  lastFlushAt: new Date().toISOString(),
  windowCount: 1,
  totalLinesIngested: 50,
  ...overrides,
});

// ==================== Helpers ====================

/**
 * Advances fake timers and flushes the microtask queue so async interval
 * callbacks (scanAndFlush) fully resolve their promise chains.
 */
const advanceAndFlush = async (ms: number): Promise<void> => {
  jest.advanceTimersByTime(ms);
  // Flush microtasks from async interval callbacks
  // Each await drains one level of the promise chain
  for (let i = 0; i < 20; i++) {
    // let: loop counter for repeated microtask flushing
    await Promise.resolve();
  }
};

// ==================== Tests ====================

describe("startFlushTriggerWorker", () => {
  // let: reassigned in beforeEach
  let mockBuffer: jest.Mocked<IngestionBufferPort>;
  let mockDeployService: jest.Mocked<DeployAnalysisService>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockBuffer = createMockBuffer();
    mockDeployService = createMockDeployService();
    mockRedisClient.status = "ready";
    // Default: no keys found
    mockRedisClient.scan.mockResolvedValue(["0", []]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==================== Worker Lifecycle ====================

  describe("worker lifecycle", () => {
    it("should return a control handle with a stop method", () => {
      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      expect(control).toHaveProperty("stop");
      expect(typeof control.stop).toBe("function");
      control.stop();
    });

    it("should start polling at the expected interval", () => {
      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      // No scan yet (interval fires after first period)
      expect(mockRedisClient.scan).not.toHaveBeenCalled();

      // Advance by one poll interval (30s)
      jest.advanceTimersByTime(30_000);

      expect(mockRedisClient.scan).toHaveBeenCalled();
      control.stop();
    });

    it("should stop polling after stop() is called", () => {
      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      jest.advanceTimersByTime(30_000);
      expect(mockRedisClient.scan).toHaveBeenCalledTimes(1);

      control.stop();
      jest.advanceTimersByTime(60_000);

      // No additional scans after stop
      expect(mockRedisClient.scan).toHaveBeenCalledTimes(1);
    });

    it("should execute multiple scan cycles when running", () => {
      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      jest.advanceTimersByTime(90_000); // 3 intervals

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(3);
      control.stop();
    });
  });

  // ==================== Redis Status Check ====================

  describe("Redis status check", () => {
    it("should skip scan when Redis client is not ready", () => {
      mockRedisClient.status = "connecting";
      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      jest.advanceTimersByTime(30_000);

      expect(mockRedisClient.scan).not.toHaveBeenCalled();
      control.stop();
    });

    it("should proceed with scan when Redis client is ready", () => {
      mockRedisClient.status = "ready";
      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      jest.advanceTimersByTime(30_000);

      expect(mockRedisClient.scan).toHaveBeenCalled();
      control.stop();
    });
  });

  // ==================== Buffer Scanning ====================

  describe("buffer scanning", () => {
    it("should scan using the correct buffer metadata pattern", () => {
      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      jest.advanceTimersByTime(30_000);

      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        REDIS_SCAN.INITIAL_CURSOR,
        "MATCH",
        `${INGESTION_REDIS_KEYS.BUFFER_META}:*`,
        "COUNT",
        REDIS_SCAN.BATCH_SIZE
      );
      control.stop();
    });

    it("should follow SCAN cursor until it returns to initial value", async () => {
      // First scan returns cursor "42" with keys, second returns "0" (done)
      mockRedisClient.scan
        .mockResolvedValueOnce(["42", [`${INGESTION_REDIS_KEYS.BUFFER_META}:tenant-1:deploy-1`]])
        .mockResolvedValueOnce(["0", []]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata());
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 100,
        timeSinceLastFlushMs: 5000,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      control.stop();
    });

    it("should skip keys that do not match the expected format", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", ["invalid:key:format"]]);

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.getMetadata).not.toHaveBeenCalled();
      control.stop();
    });

    it("should skip keys missing the separator between tenantId and entityId", async () => {
      mockRedisClient.scan.mockResolvedValue([
        "0",
        [`${INGESTION_REDIS_KEYS.BUFFER_META}:noseparator`],
      ]);

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.getMetadata).not.toHaveBeenCalled();
      control.stop();
    });

    it("should parse tenantId and entityId from valid buffer metadata keys", async () => {
      mockRedisClient.scan.mockResolvedValue([
        "0",
        [`${INGESTION_REDIS_KEYS.BUFFER_META}:my-tenant:my-deploy`],
      ]);
      mockBuffer.getMetadata.mockResolvedValue(
        createTestMetadata({
          entityId: "my-deploy",
          tenantId: "my-tenant",
        })
      );
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 0,
        timeSinceLastFlushMs: 0,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.getMetadata).toHaveBeenCalledWith("my-deploy", "my-tenant");
      control.stop();
    });

    it("should skip buffers with no metadata (null)", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(null);

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.checkFlushTriggers).not.toHaveBeenCalled();
      control.stop();
    });

    it("should skip buffers with 'closed' status", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata({ status: "closed" }));

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.checkFlushTriggers).not.toHaveBeenCalled();
      control.stop();
    });
  });

  // ==================== Idle Timeout ====================

  describe("idle timeout", () => {
    it("should close buffers that exceed the idle timeout", async () => {
      const idleTime = (STREAM_LIFECYCLE.IDLE_TIMEOUT_SECONDS + 1) * 1000;
      const oldTimestamp = new Date(Date.now() - idleTime).toISOString();

      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(
        createTestMetadata({
          lastFlushAt: oldTimestamp,
          createdAt: oldTimestamp,
        })
      );

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.close).toHaveBeenCalledWith(
        "d1",
        "t1",
        expect.objectContaining({
          requestId: expect.any(String),
          tenantId: "system",
        })
      );
      expect(mockBuffer.checkFlushTriggers).not.toHaveBeenCalled();
      control.stop();
    });

    it("should use createdAt for idle check when lastFlushAt is null", async () => {
      const idleTime = (STREAM_LIFECYCLE.IDLE_TIMEOUT_SECONDS + 1) * 1000;
      const oldTimestamp = new Date(Date.now() - idleTime).toISOString();

      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(
        createTestMetadata({
          lastFlushAt: null,
          createdAt: oldTimestamp,
        })
      );

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.close).toHaveBeenCalled();
      control.stop();
    });

    it("should not close buffers within the idle timeout", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(
        createTestMetadata({
          lastFlushAt: new Date().toISOString(), // just now
        })
      );
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 100,
        timeSinceLastFlushMs: 5000,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.close).not.toHaveBeenCalled();
      control.stop();
    });
  });

  // ==================== Max Windows Guard ====================

  describe("max windows per stream guard", () => {
    it("should close buffers that exceed the max window count", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(
        createTestMetadata({
          windowCount: STREAM_LIFECYCLE.MAX_WINDOWS_PER_STREAM,
        })
      );

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.close).toHaveBeenCalledWith("d1", "t1", expect.any(Object));
      expect(mockBuffer.checkFlushTriggers).not.toHaveBeenCalled();
      control.stop();
    });

    it("should not close buffers below the max window count", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(
        createTestMetadata({
          windowCount: STREAM_LIFECYCLE.MAX_WINDOWS_PER_STREAM - 1,
        })
      );
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 100,
        timeSinceLastFlushMs: 5000,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.close).not.toHaveBeenCalled();
      control.stop();
    });
  });

  // ==================== Flush Trigger Evaluation ====================

  describe("flush trigger evaluation", () => {
    it("should call forceFlush when trigger is met", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata({ platform: "vercel" }));
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "time_elapsed",
        estimatedBufferTokens: 3000,
        timeSinceLastFlushMs: 120000,
      });
      mockDeployService.forceFlush.mockResolvedValue({
        entityId: "deploy-1",
        linesAccepted: 0,
        flushed: true,
        windowResult: null,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockDeployService.forceFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: "d1",
          tenantId: "t1",
          platform: "vercel",
        }),
        expect.objectContaining({
          requestId: expect.any(String),
          tenantId: "system",
          actor: "flush-trigger-worker",
        })
      );
      control.stop();
    });

    it("should not call forceFlush when trigger is not met", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata());
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 100,
        timeSinceLastFlushMs: 5000,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockDeployService.forceFlush).not.toHaveBeenCalled();
      control.stop();
    });

    it("should process multiple buffers in a single scan", async () => {
      mockRedisClient.scan.mockResolvedValue([
        "0",
        [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`, `${INGESTION_REDIS_KEYS.BUFFER_META}:t2:d2`],
      ]);
      mockBuffer.getMetadata
        .mockResolvedValueOnce(createTestMetadata({ entityId: "d1", tenantId: "t1" }))
        .mockResolvedValueOnce(createTestMetadata({ entityId: "d2", tenantId: "t2" }));
      mockBuffer.checkFlushTriggers
        .mockResolvedValueOnce({
          shouldFlush: true,
          reason: "volume_exceeded",
          estimatedBufferTokens: 5000,
          timeSinceLastFlushMs: 10000,
        })
        .mockResolvedValueOnce({
          shouldFlush: false,
          reason: "none",
          estimatedBufferTokens: 100,
          timeSinceLastFlushMs: 1000,
        });
      mockDeployService.forceFlush.mockResolvedValue({
        entityId: "d1",
        linesAccepted: 0,
        flushed: true,
        windowResult: null,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockBuffer.getMetadata).toHaveBeenCalledTimes(2);
      expect(mockDeployService.forceFlush).toHaveBeenCalledTimes(1);
      expect(mockDeployService.forceFlush).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: "d1" }),
        expect.any(Object)
      );
      control.stop();
    });
  });

  // ==================== Worker Context ====================

  describe("worker context", () => {
    it("should create RequestContext with system tenantId", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata());
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "time_elapsed",
        estimatedBufferTokens: 3000,
        timeSinceLastFlushMs: 120000,
      });
      mockDeployService.forceFlush.mockResolvedValue({
        entityId: "deploy-1",
        linesAccepted: 0,
        flushed: true,
        windowResult: null,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockDeployService.forceFlush).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          tenantId: "system",
          actor: "flush-trigger-worker",
          requestId: expect.any(String),
        })
      );
      control.stop();
    });

    it("should create a unique requestId for each scan cycle", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata());
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "time_elapsed",
        estimatedBufferTokens: 3000,
        timeSinceLastFlushMs: 120000,
      });
      mockDeployService.forceFlush.mockResolvedValue({
        entityId: "deploy-1",
        linesAccepted: 0,
        flushed: true,
        windowResult: null,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      // First cycle
      await advanceAndFlush(30_000);
      const firstContext = (mockDeployService.forceFlush.mock.calls[0] as unknown[])[1] as {
        requestId: string;
      };

      // Second cycle
      await advanceAndFlush(30_000);
      const secondContext = (mockDeployService.forceFlush.mock.calls[1] as unknown[])[1] as {
        requestId: string;
      };

      expect(firstContext.requestId).not.toBe(secondContext.requestId);
      control.stop();
    });
  });

  // ==================== Error Handling ====================

  describe("error handling", () => {
    it("should not crash when Redis scan throws an error", async () => {
      mockRedisClient.scan.mockRejectedValue(new Error("Redis connection lost"));

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      // Worker continues — next cycle should still fire
      mockRedisClient.scan.mockResolvedValue(["0", []]);
      await advanceAndFlush(30_000);

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      control.stop();
    });

    it("should not crash when getMetadata throws an error", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockRejectedValue(new Error("Metadata read failed"));

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);

      // Should not throw — error is caught internally
      await advanceAndFlush(30_000);

      control.stop();
    });

    it("should continue processing remaining keys when one key fails", async () => {
      mockRedisClient.scan.mockResolvedValue([
        "0",
        [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`, `${INGESTION_REDIS_KEYS.BUFFER_META}:t2:d2`],
      ]);
      // First key fails, second succeeds
      mockBuffer.getMetadata
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(createTestMetadata({ entityId: "d2", tenantId: "t2" }));
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 0,
        timeSinceLastFlushMs: 0,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      control.stop();
    });
  });

  // ==================== forceFlush Metadata Construction ====================

  describe("forceFlush metadata construction", () => {
    it("should construct DeployEntityContext with correct platform from metadata", async () => {
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata({ platform: "railway" }));
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "volume_exceeded",
        estimatedBufferTokens: 5000,
        timeSinceLastFlushMs: 30000,
      });
      mockDeployService.forceFlush.mockResolvedValue({
        entityId: "deploy-1",
        linesAccepted: 0,
        flushed: true,
        windowResult: null,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      expect(mockDeployService.forceFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: "railway",
          metadata: expect.objectContaining({
            status: "deploying",
          }),
        }),
        expect.any(Object)
      );
      control.stop();
    });

    it("should set startedAt from buffer createdAt timestamp", async () => {
      const createdAt = "2026-03-01T12:00:00.000Z";
      mockRedisClient.scan.mockResolvedValue(["0", [`${INGESTION_REDIS_KEYS.BUFFER_META}:t1:d1`]]);
      mockBuffer.getMetadata.mockResolvedValue(createTestMetadata({ createdAt }));
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "time_elapsed",
        estimatedBufferTokens: 2000,
        timeSinceLastFlushMs: 60000,
      });
      mockDeployService.forceFlush.mockResolvedValue({
        entityId: "deploy-1",
        linesAccepted: 0,
        flushed: true,
        windowResult: null,
      });

      const control = startFlushTriggerWorker(mockBuffer, mockDeployService);
      await advanceAndFlush(30_000);

      const entityContext = (mockDeployService.forceFlush.mock.calls[0] as unknown[])[0] as {
        metadata: { startedAt: Date };
      };
      expect(entityContext.metadata.startedAt).toEqual(new Date(createdAt));
      control.stop();
    });
  });
});
