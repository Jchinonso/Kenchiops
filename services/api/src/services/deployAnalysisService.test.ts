/**
 * Deploy Analysis Service Tests
 *
 * Unit tests for the deploy analysis service which orchestrates
 * deployment log analysis for platforms like Vercel, Railway, Render, and Netlify.
 *
 * @module services/deployAnalysisService.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  RequestContext,
  DeployPlatform,
  IngestionBufferPort,
  DeployLogSourcePort,
  FlushResult,
} from "@kenchi/shared";
import type { AnalyzeRequest, AnalyzeResponse } from "../types/apiTypes.js";
import type {
  DeployAnalysisServiceDeps,
  DeployEntityContext,
  WindowAnalysisResult,
} from "./deployAnalysisTypes.js";

// ==================== Mock Setup ====================

const mockPerformAnalysis =
  jest.fn<(req: AnalyzeRequest, ctx: RequestContext) => Promise<AnalyzeResponse>>();
const mockProcessWindow = jest.fn<(...args: readonly unknown[]) => Promise<WindowAnalysisResult>>();
const mockCheckAlertAnalysisQuota =
  jest.fn<(...args: readonly unknown[]) => Promise<{ allowed: boolean; reason?: string }>>();
const mockIncrementAlertAnalysisCount = jest.fn<(...args: readonly unknown[]) => Promise<void>>();

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
    checkAlertAnalysisQuota: (...args: readonly unknown[]) => mockCheckAlertAnalysisQuota(...args),
    incrementAlertAnalysisCount: (...args: readonly unknown[]) =>
      mockIncrementAlertAnalysisCount(...args),
  };
});

jest.mock("./windowedAnalysis.js", () => ({
  processWindow: (...args: readonly unknown[]) => mockProcessWindow(...args),
}));

// Import after mocks — use require to avoid top-level await in Jest CJS transform
const { createDeployAnalysisService } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require("./deployAnalysisService.js") as typeof import("./deployAnalysisService.js");

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createMockBuffer = (): jest.Mocked<IngestionBufferPort> => ({
  append: jest.fn(),
  flush: jest.fn(),
  getMetadata: jest.fn(),
  getSummary: jest.fn(),
  updateSummary: jest.fn(),
  close: jest.fn(),
  checkFlushTriggers: jest.fn(),
});

const createMockAdapter = (): jest.Mocked<DeployLogSourcePort> => ({
  verifySignature: jest.fn(),
  handleWebhook: jest.fn(),
  fetchDeployLogs: jest.fn(),
  parseLogDrainBatch: jest.fn(),
});

const createTestMetadata = (
  overrides?: Partial<import("@kenchi/shared").DeployMetadata>
): import("@kenchi/shared").DeployMetadata => ({
  repository: "owner/repo",
  branch: "main",
  commit: "abc123",
  startedAt: new Date("2026-03-01T00:00:00Z"),
  completedAt: new Date("2026-03-01T00:05:00Z"),
  status: "failed",
  projectId: "proj-1",
  projectName: "my-project",
  ...overrides,
});

const createTestAnalyzeResponse = (overrides?: Partial<AnalyzeResponse>): AnalyzeResponse => ({
  analysis: "Build failed due to type errors",
  identified_cause: "TypeScript compilation error",
  confidence: 0.85,
  recommended_actions: [{ description: "Fix type errors", priority: "high" }],
  full_analysis: {
    summary: "Build failed",
    identifiedCause: "TypeScript compilation error",
    confidence: 0.85,
    recommendedActions: [{ description: "Fix type errors", priority: "high" }],
    logArtifacts: [],
    blastRadius: "contained",
    reversibility: "fully_reversible",
    dataImpact: "none",
  },
  repository: "owner/repo",
  ...overrides,
});

const createTestEntity = (overrides?: Partial<DeployEntityContext>): DeployEntityContext => ({
  entityId: "deploy-123",
  tenantId: "test-tenant",
  platform: "vercel" as DeployPlatform,
  metadata: createTestMetadata(),
  ...overrides,
});

const createTestWindowResult = (
  overrides?: Partial<WindowAnalysisResult>
): WindowAnalysisResult => ({
  windowNumber: 1,
  linesProcessed: 50,
  tokensProcessed: 1200,
  updatedSummary: {
    version: 1,
    windowCount: 1,
    timeRange: { start: "2026-03-01T00:00:00Z", end: "2026-03-01T00:05:00Z" },
    currentStatus: "investigating",
    keyFindings: ["Build failed"],
    errorTimeline: [
      { timestamp: "2026-03-01T00:05:00Z", severity: "critical" as const, message: "Build failed" },
    ],
    unresolvedIssues: [],
    metricsSnapshot: "Window 1: 50 lines, 1200 tokens",
    tokenCount: 100,
  },
  usedChunkingPipeline: false,
  ...overrides,
});

// ==================== Tests ====================

describe("createDeployAnalysisService", () => {
  // let: reassigned in beforeEach to get fresh mocks per test
  let mockBuffer: jest.Mocked<IngestionBufferPort>;
  let mockVercelAdapter: jest.Mocked<DeployLogSourcePort>;
  let mockDeps: DeployAnalysisServiceDeps;
  let service: ReturnType<typeof createDeployAnalysisService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuffer = createMockBuffer();
    mockVercelAdapter = createMockAdapter();
    mockDeps = { performAnalysis: mockPerformAnalysis };
    service = createDeployAnalysisService(mockDeps, mockBuffer, {
      vercel: mockVercelAdapter,
      railway: createMockAdapter(),
      render: createMockAdapter(),
      netlify: createMockAdapter(),
    });
    mockCheckAlertAnalysisQuota.mockResolvedValue({ allowed: true });
    mockIncrementAlertAnalysisCount.mockResolvedValue(undefined);
  });

  // ==================== processDeployWebhook ====================

  describe("processDeployWebhook", () => {
    it("should skip when adapter returns null (non-relevant event)", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue(null);

      const result = await service.processDeployWebhook("vercel", { type: "ping" }, testContext);

      expect(result).toEqual({ action: "skipped", reason: "Event not relevant for analysis" });
      expect(mockVercelAdapter.fetchDeployLogs).not.toHaveBeenCalled();
      expect(mockPerformAnalysis).not.toHaveBeenCalled();
    });

    it("should skip when event type is deploy_started", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_started",
        metadata: createTestMetadata({ status: "building" }),
        logs: null,
      });

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({
        action: "skipped",
        reason: "Deploy in progress — awaiting completion",
      });
      expect(mockVercelAdapter.fetchDeployLogs).not.toHaveBeenCalled();
    });

    it("should skip when event type is unhandled (e.g. log_batch)", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "log_batch",
        metadata: createTestMetadata(),
        logs: null,
      });

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({ action: "skipped", reason: "Unhandled event type: log_batch" });
    });

    it("should skip when analysis quota is exceeded", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata: createTestMetadata(),
        logs: null,
      });
      mockCheckAlertAnalysisQuota.mockResolvedValue({
        allowed: false,
        reason: "Monthly limit reached",
      });

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({ action: "skipped", reason: "Monthly limit reached" });
      expect(mockVercelAdapter.fetchDeployLogs).not.toHaveBeenCalled();
    });

    it("should use default reason when quota check has no reason", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata: createTestMetadata(),
        logs: null,
      });
      mockCheckAlertAnalysisQuota.mockResolvedValue({ allowed: false });

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({ action: "skipped", reason: "Analysis quota exceeded" });
    });

    it("should skip when fetched deploy logs are empty", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata: createTestMetadata(),
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-1",
        rawLog: "",
        totalLines: 0,
        isTruncated: false,
      });

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({ action: "skipped", reason: "Deploy logs are empty" });
      expect(mockPerformAnalysis).not.toHaveBeenCalled();
    });

    it("should skip when fetched deploy logs are whitespace only", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata: createTestMetadata(),
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-1",
        rawLog: "   \n  \t  ",
        totalLines: 0,
        isTruncated: false,
      });

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({ action: "skipped", reason: "Deploy logs are empty" });
    });

    it("should analyze deploy_failed events through the full pipeline", async () => {
      const metadata = createTestMetadata();
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata,
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-1",
        rawLog: "ERROR: TypeScript compilation failed\nTS2345: Argument of type...",
        totalLines: 2,
        isTruncated: false,
      });
      const mockResponse = createTestAnalyzeResponse();
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({ action: "analyzed", response: mockResponse });
      expect(mockPerformAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          failure_log: "ERROR: TypeScript compilation failed\nTS2345: Argument of type...",
          repository: "owner/repo",
          commit: "abc123",
          tenant_id: "test-tenant",
          ci_provider: "vercel",
          branch: "main",
        }),
        testContext
      );
    });

    it("should analyze deploy_completed events through the full pipeline", async () => {
      const metadata = createTestMetadata({ status: "success" });
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-2",
        platform: "vercel",
        eventType: "deploy_completed",
        metadata,
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-2",
        rawLog: "Build completed with warnings",
        totalLines: 1,
        isTruncated: false,
      });
      const mockResponse = createTestAnalyzeResponse();
      mockPerformAnalysis.mockResolvedValue(mockResponse);

      const result = await service.processDeployWebhook("vercel", {}, testContext);

      expect(result).toEqual({ action: "analyzed", response: mockResponse });
    });

    it("should increment analysis count after successful analysis", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata: createTestMetadata(),
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-1",
        rawLog: "error log content",
        totalLines: 1,
        isTruncated: false,
      });
      mockPerformAnalysis.mockResolvedValue(createTestAnalyzeResponse());

      await service.processDeployWebhook("vercel", {}, testContext);

      expect(mockIncrementAlertAnalysisCount).toHaveBeenCalledWith("test-tenant", testContext);
    });

    it("should close the buffer after successful analysis", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata: createTestMetadata(),
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-1",
        rawLog: "error log content",
        totalLines: 1,
        isTruncated: false,
      });
      mockPerformAnalysis.mockResolvedValue(createTestAnalyzeResponse());

      await service.processDeployWebhook("vercel", {}, testContext);

      expect(mockBuffer.close).toHaveBeenCalledWith("deploy-1", "test-tenant", testContext);
    });

    it("should map metadata with missing commit to undefined in AnalyzeRequest", async () => {
      const metadata = createTestMetadata({ commit: "" });
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata,
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-1",
        rawLog: "some log",
        totalLines: 1,
        isTruncated: false,
      });
      mockPerformAnalysis.mockResolvedValue(createTestAnalyzeResponse());

      await service.processDeployWebhook("vercel", {}, testContext);

      expect(mockPerformAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({ commit: undefined }),
        testContext
      );
    });

    it("should propagate RequestContext to adapter calls", async () => {
      mockVercelAdapter.handleWebhook.mockResolvedValue({
        entityId: "deploy-1",
        platform: "vercel",
        eventType: "deploy_failed",
        metadata: createTestMetadata(),
        logs: null,
      });
      mockVercelAdapter.fetchDeployLogs.mockResolvedValue({
        entityId: "deploy-1",
        rawLog: "some log",
        totalLines: 1,
        isTruncated: false,
      });
      mockPerformAnalysis.mockResolvedValue(createTestAnalyzeResponse());

      await service.processDeployWebhook("vercel", {}, testContext);

      expect(mockVercelAdapter.handleWebhook).toHaveBeenCalledWith({}, testContext);
      expect(mockVercelAdapter.fetchDeployLogs).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: "deploy-1" }),
        testContext
      );
    });

    it("should propagate adapter errors", async () => {
      mockVercelAdapter.handleWebhook.mockRejectedValue(new Error("Adapter failure"));

      await expect(service.processDeployWebhook("vercel", {}, testContext)).rejects.toThrow(
        "Adapter failure"
      );
    });
  });

  // ==================== processLogDrainBatch ====================

  describe("processLogDrainBatch", () => {
    const entity = createTestEntity();

    it("should return empty result when batch has no lines", async () => {
      mockVercelAdapter.parseLogDrainBatch.mockResolvedValue({
        entityId: "",
        lines: [],
        platform: "vercel",
      });

      const result = await service.processLogDrainBatch("vercel", {}, entity, testContext);

      expect(result).toEqual({
        entityId: "",
        linesAccepted: 0,
        flushed: false,
        windowResult: null,
      });
      expect(mockBuffer.append).not.toHaveBeenCalled();
    });

    it("should append lines to buffer and skip flush when not triggered", async () => {
      const lines = [
        { timestamp: new Date(), message: "Building...", level: "info", source: "build" },
        { timestamp: new Date(), message: "Installing deps...", level: "info", source: "build" },
      ];
      mockVercelAdapter.parseLogDrainBatch.mockResolvedValue({
        entityId: "deploy-123",
        lines,
        platform: "vercel",
      });
      mockBuffer.append.mockResolvedValue({
        linesAccepted: 2,
        linesDeduplicated: 0,
        estimatedBufferTokens: 50,
        linesEvicted: 0,
      });
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 50,
        timeSinceLastFlushMs: 5000,
      });

      const result = await service.processLogDrainBatch("vercel", {}, entity, testContext);

      expect(result).toEqual({
        entityId: "deploy-123",
        linesAccepted: 2,
        flushed: false,
        windowResult: null,
      });
      expect(mockBuffer.append).toHaveBeenCalledWith(
        "deploy-123",
        "test-tenant",
        "vercel",
        lines,
        testContext
      );
      expect(mockBuffer.checkFlushTriggers).toHaveBeenCalledWith(
        "deploy-123",
        "test-tenant",
        "vercel"
      );
    });

    it("should flush and run windowed analysis when flush trigger is met", async () => {
      const lines = [
        { timestamp: new Date(), message: "ERROR: build failed", level: "error", source: "build" },
      ];
      mockVercelAdapter.parseLogDrainBatch.mockResolvedValue({
        entityId: "deploy-123",
        lines,
        platform: "vercel",
      });
      mockBuffer.append.mockResolvedValue({
        linesAccepted: 1,
        linesDeduplicated: 0,
        estimatedBufferTokens: 5000,
        linesEvicted: 0,
      });
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "volume_exceeded",
        estimatedBufferTokens: 5000,
        timeSinceLastFlushMs: 10000,
      });
      const flushResult: FlushResult = {
        lines: ["line1", "line2", "line3"],
        lineCount: 3,
        estimatedTokens: 500,
        windowNumber: 1,
        previousSummary: null,
      };
      mockBuffer.flush.mockResolvedValue(flushResult);
      const windowResult = createTestWindowResult();
      mockProcessWindow.mockResolvedValue(windowResult);

      const result = await service.processLogDrainBatch("vercel", {}, entity, testContext);

      expect(result.flushed).toBe(true);
      expect(result.windowResult).toEqual(windowResult);
      expect(mockBuffer.flush).toHaveBeenCalledWith("deploy-123", "test-tenant", testContext);
      expect(mockProcessWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: "deploy-123",
          tenantId: "test-tenant",
          platform: "vercel",
          lines: ["line1", "line2", "line3"],
          estimatedTokens: 500,
          windowNumber: 1,
          previousSummary: null,
        }),
        testContext
      );
    });

    it("should update summary after windowed analysis", async () => {
      const lines = [{ timestamp: new Date(), message: "error", level: "error", source: "build" }];
      mockVercelAdapter.parseLogDrainBatch.mockResolvedValue({
        entityId: "deploy-123",
        lines,
        platform: "vercel",
      });
      mockBuffer.append.mockResolvedValue({
        linesAccepted: 1,
        linesDeduplicated: 0,
        estimatedBufferTokens: 5000,
        linesEvicted: 0,
      });
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "time_elapsed",
        estimatedBufferTokens: 5000,
        timeSinceLastFlushMs: 60000,
      });
      mockBuffer.flush.mockResolvedValue({
        lines: ["line1"],
        lineCount: 1,
        estimatedTokens: 100,
        windowNumber: 2,
        previousSummary: null,
      });
      const windowResult = createTestWindowResult({ windowNumber: 2 });
      mockProcessWindow.mockResolvedValue(windowResult);

      await service.processLogDrainBatch("vercel", {}, entity, testContext);

      expect(mockBuffer.updateSummary).toHaveBeenCalledWith(
        "deploy-123",
        "test-tenant",
        windowResult.updatedSummary
      );
    });

    it("should return zero lines flushed and no window result when buffer flush has zero lines", async () => {
      const lines = [{ timestamp: new Date(), message: "info", level: "info", source: "build" }];
      mockVercelAdapter.parseLogDrainBatch.mockResolvedValue({
        entityId: "deploy-123",
        lines,
        platform: "vercel",
      });
      mockBuffer.append.mockResolvedValue({
        linesAccepted: 1,
        linesDeduplicated: 0,
        estimatedBufferTokens: 100,
        linesEvicted: 0,
      });
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: true,
        reason: "event_trigger",
        estimatedBufferTokens: 100,
        timeSinceLastFlushMs: 30000,
      });
      mockBuffer.flush.mockResolvedValue({
        lines: [],
        lineCount: 0,
        estimatedTokens: 0,
        windowNumber: 1,
        previousSummary: null,
      });

      const result = await service.processLogDrainBatch("vercel", {}, entity, testContext);

      expect(result).toEqual({
        entityId: "deploy-123",
        linesAccepted: 0,
        flushed: false,
        windowResult: null,
      });
      expect(mockProcessWindow).not.toHaveBeenCalled();
    });

    it("should propagate RequestContext to all downstream calls", async () => {
      const lines = [{ timestamp: new Date(), message: "log", level: "info", source: "build" }];
      mockVercelAdapter.parseLogDrainBatch.mockResolvedValue({
        entityId: "deploy-123",
        lines,
        platform: "vercel",
      });
      mockBuffer.append.mockResolvedValue({
        linesAccepted: 1,
        linesDeduplicated: 0,
        estimatedBufferTokens: 50,
        linesEvicted: 0,
      });
      mockBuffer.checkFlushTriggers.mockResolvedValue({
        shouldFlush: false,
        reason: "none",
        estimatedBufferTokens: 50,
        timeSinceLastFlushMs: 1000,
      });

      await service.processLogDrainBatch("vercel", {}, entity, testContext);

      expect(mockVercelAdapter.parseLogDrainBatch).toHaveBeenCalledWith({}, testContext);
      expect(mockBuffer.append).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        testContext
      );
    });
  });

  // ==================== forceFlush ====================

  describe("forceFlush", () => {
    it("should flush the buffer and run windowed analysis", async () => {
      const entity = createTestEntity();
      const flushResult: FlushResult = {
        lines: ["error line 1", "error line 2"],
        lineCount: 2,
        estimatedTokens: 400,
        windowNumber: 3,
        previousSummary: null,
      };
      mockBuffer.flush.mockResolvedValue(flushResult);
      const windowResult = createTestWindowResult({ windowNumber: 3 });
      mockProcessWindow.mockResolvedValue(windowResult);

      const result = await service.forceFlush(entity, testContext);

      expect(result.flushed).toBe(true);
      expect(result.windowResult).toEqual(windowResult);
      expect(mockBuffer.flush).toHaveBeenCalledWith("deploy-123", "test-tenant", testContext);
    });

    it("should return unflushed result when buffer is empty", async () => {
      const entity = createTestEntity();
      mockBuffer.flush.mockResolvedValue({
        lines: [],
        lineCount: 0,
        estimatedTokens: 0,
        windowNumber: 1,
        previousSummary: null,
      });

      const result = await service.forceFlush(entity, testContext);

      expect(result).toEqual({
        entityId: "deploy-123",
        linesAccepted: 0,
        flushed: false,
        windowResult: null,
      });
      expect(mockProcessWindow).not.toHaveBeenCalled();
    });

    it("should update summary after force flush analysis", async () => {
      const entity = createTestEntity();
      mockBuffer.flush.mockResolvedValue({
        lines: ["line1"],
        lineCount: 1,
        estimatedTokens: 100,
        windowNumber: 1,
        previousSummary: null,
      });
      const windowResult = createTestWindowResult();
      mockProcessWindow.mockResolvedValue(windowResult);

      await service.forceFlush(entity, testContext);

      expect(mockBuffer.updateSummary).toHaveBeenCalledWith(
        "deploy-123",
        "test-tenant",
        windowResult.updatedSummary
      );
    });

    it("should pass entity metadata and platform to processWindow", async () => {
      const entity = createTestEntity({ platform: "railway" });
      mockBuffer.flush.mockResolvedValue({
        lines: ["line1"],
        lineCount: 1,
        estimatedTokens: 200,
        windowNumber: 5,
        previousSummary: null,
      });
      mockProcessWindow.mockResolvedValue(createTestWindowResult({ windowNumber: 5 }));

      await service.forceFlush(entity, testContext);

      expect(mockProcessWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: "deploy-123",
          tenantId: "test-tenant",
          platform: "railway",
          metadata: entity.metadata,
          windowNumber: 5,
        }),
        testContext
      );
    });

    it("should carry forward previous summary from flush result", async () => {
      const previousSummary = createTestWindowResult().updatedSummary;
      const entity = createTestEntity();
      mockBuffer.flush.mockResolvedValue({
        lines: ["line1"],
        lineCount: 1,
        estimatedTokens: 150,
        windowNumber: 2,
        previousSummary,
      });
      mockProcessWindow.mockResolvedValue(createTestWindowResult({ windowNumber: 2 }));

      await service.forceFlush(entity, testContext);

      expect(mockProcessWindow).toHaveBeenCalledWith(
        expect.objectContaining({ previousSummary }),
        testContext
      );
    });
  });

  // ==================== Platform Routing ====================

  describe("platform routing", () => {
    it("should route to the correct adapter based on platform", async () => {
      const railwayAdapter = createMockAdapter();
      railwayAdapter.handleWebhook.mockResolvedValue(null);

      const railwayService = createDeployAnalysisService(mockDeps, mockBuffer, {
        vercel: mockVercelAdapter,
        railway: railwayAdapter,
        render: createMockAdapter(),
        netlify: createMockAdapter(),
      });

      await railwayService.processDeployWebhook("railway", {}, testContext);

      expect(railwayAdapter.handleWebhook).toHaveBeenCalled();
      expect(mockVercelAdapter.handleWebhook).not.toHaveBeenCalled();
    });
  });
});
