/**
 * Windowed Analysis Tests
 *
 * Unit tests for the windowed analysis module which processes a single
 * window of buffered log lines using incremental summarization.
 *
 * @module services/windowedAnalysis.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  RequestContext,
  IncidentSummary,
  Evidence,
  Event,
  LLMAnalysisResult,
} from "@kenchi/shared";
import type { WindowAnalysisInput } from "./deployAnalysisTypes.js";

// ==================== Mock Setup ====================

const mockExecuteChunkingPipeline = jest.fn<(...args: readonly unknown[]) => Promise<unknown>>();
const mockConvertAggregatedToEvidence = jest.fn<(...args: readonly unknown[]) => Evidence>();
const mockAnalyzeFailure = jest.fn<(...args: readonly unknown[]) => Promise<LLMAnalysisResult>>();

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
  };
});

jest.mock("./analysisChunkingPipeline.js", () => ({
  executeChunkingPipeline: (...args: readonly unknown[]) => mockExecuteChunkingPipeline(...args),
  convertAggregatedToEvidence: (...args: readonly unknown[]) =>
    mockConvertAggregatedToEvidence(...args),
}));

jest.mock("./analysisService.js", () => ({
  analyzeFailure: (...args: readonly unknown[]) => mockAnalyzeFailure(...args),
}));

const { processWindow } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require("./windowedAnalysis.js") as typeof import("./windowedAnalysis.js");
const { WINDOW_ANALYSIS_BUDGET, EVENT_TYPES, EVENT_SEVERITY } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require("@kenchi/shared") as typeof import("@kenchi/shared");

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createTestPreviousSummary = (overrides?: Partial<IncidentSummary>): IncidentSummary => ({
  version: 1,
  windowCount: 1,
  timeRange: { start: "2026-03-01T00:00:00Z", end: "2026-03-01T00:05:00Z" },
  currentStatus: "investigating",
  keyFindings: ["Initial build failure detected"],
  errorTimeline: [
    {
      timestamp: "2026-03-01T00:05:00Z",
      severity: "critical" as const,
      message: "Build failed",
    },
  ],
  unresolvedIssues: ["Fix TypeScript errors"],
  metricsSnapshot: "Window 1: 50 lines, 1200 tokens",
  tokenCount: 100,
  ...overrides,
});

const createTestWindowInput = (overrides?: Partial<WindowAnalysisInput>): WindowAnalysisInput => ({
  entityId: "deploy-123",
  tenantId: "test-tenant",
  platform: "vercel",
  metadata: {
    repository: "owner/repo",
    branch: "main",
    commit: "abc123",
    startedAt: new Date("2026-03-01T00:00:00Z"),
    completedAt: new Date("2026-03-01T00:05:00Z"),
    status: "failed",
    projectId: "proj-1",
    projectName: "my-project",
  },
  lines: ["ERROR: Build failed", "at module.ts:42", "TypeScript compilation error"],
  estimatedTokens: 500,
  windowNumber: 1,
  previousSummary: null,
  ...overrides,
});

const createTestAnalysisResult = (overrides?: Partial<LLMAnalysisResult>): LLMAnalysisResult => ({
  summary: "Build failed due to TypeScript compilation errors",
  identifiedCause: "TypeScript type mismatch in module.ts:42",
  confidence: 0.9,
  recommendedActions: [
    { description: "Fix type errors in module.ts", priority: "high" },
    { description: "Run type check locally before pushing", priority: "medium" },
  ],
  logArtifacts: [],
  blastRadius: "contained",
  reversibility: "fully_reversible",
  dataImpact: "none",
  ...overrides,
});

// ==================== Tests ====================

describe("processWindow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyzeFailure.mockResolvedValue(createTestAnalysisResult());
  });

  // ==================== Small Window (Direct) ====================

  describe("small window handling (direct LLM call)", () => {
    it("should route small batches directly to LLM without chunking pipeline", async () => {
      const input = createTestWindowInput({ estimatedTokens: 500 });

      const result = await processWindow(input, testContext);

      expect(result.usedChunkingPipeline).toBe(false);
      expect(mockExecuteChunkingPipeline).not.toHaveBeenCalled();
    });

    it("should build direct evidence from joined log lines", async () => {
      const input = createTestWindowInput({
        lines: ["line 1", "line 2", "line 3"],
        estimatedTokens: 100,
      });

      await processWindow(input, testContext);

      // Verify analyzeFailure was called with evidence containing joined log
      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({
              message: "line 1\nline 2\nline 3",
              level: "ERROR",
              source: "deploy",
            }),
          ]),
        }),
        testContext
      );
    });

    it("should return correct result shape for small window", async () => {
      const input = createTestWindowInput({
        lines: ["error line"],
        estimatedTokens: 50,
        windowNumber: 3,
      });

      const result = await processWindow(input, testContext);

      expect(result.windowNumber).toBe(3);
      expect(result.linesProcessed).toBe(1);
      expect(result.tokensProcessed).toBe(50);
      expect(result.usedChunkingPipeline).toBe(false);
      expect(result.updatedSummary).toBeDefined();
    });

    it("should use threshold exactly at MAX_BATCH_TOKENS as direct (not chunked)", async () => {
      const input = createTestWindowInput({
        estimatedTokens: WINDOW_ANALYSIS_BUDGET.MAX_BATCH_TOKENS,
      });

      const result = await processWindow(input, testContext);

      expect(result.usedChunkingPipeline).toBe(false);
      expect(mockExecuteChunkingPipeline).not.toHaveBeenCalled();
    });
  });

  // ==================== Large Window (Chunking Pipeline) ====================

  describe("large window handling (chunking pipeline)", () => {
    it("should route large batches through the chunking pipeline", async () => {
      const input = createTestWindowInput({
        estimatedTokens: WINDOW_ANALYSIS_BUDGET.MAX_BATCH_TOKENS + 1,
      });
      const mockAggregated = { chunks: [] };
      mockExecuteChunkingPipeline.mockResolvedValue(mockAggregated);
      const mockEvidence: Evidence = {
        eventId: "test-event",
        logs: [
          {
            timestamp: "2026-03-01T00:00:00Z",
            message: "chunked output",
            level: "ERROR",
            source: "deploy",
          },
        ],
        collectedAt: "2026-03-01T00:00:00Z",
      };
      mockConvertAggregatedToEvidence.mockReturnValue(mockEvidence);

      const result = await processWindow(input, testContext);

      expect(result.usedChunkingPipeline).toBe(true);
      expect(mockExecuteChunkingPipeline).toHaveBeenCalledWith(
        input.lines.join("\n"),
        "owner/repo",
        testContext
      );
      expect(mockConvertAggregatedToEvidence).toHaveBeenCalledWith(
        mockAggregated,
        expect.stringContaining("window-deploy-123-"),
        expect.any(String)
      );
    });

    it("should fall back to direct evidence when chunking pipeline fails", async () => {
      const input = createTestWindowInput({
        estimatedTokens: WINDOW_ANALYSIS_BUDGET.MAX_BATCH_TOKENS + 1,
        lines: ["error in chunked log"],
      });
      mockExecuteChunkingPipeline.mockRejectedValue(new Error("Pipeline timeout"));

      const result = await processWindow(input, testContext);

      // Should still succeed with direct evidence fallback
      expect(result.usedChunkingPipeline).toBe(true); // flag reflects the attempt
      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({ message: "error in chunked log" }),
          ]),
        }),
        testContext
      );
    });
  });

  // ==================== Summary Carry-Forward ====================

  describe("summary carry-forward", () => {
    it("should include first-window prompt when no previous summary exists", async () => {
      const input = createTestWindowInput({ previousSummary: null });

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            previousAnalysisContext: expect.stringContaining("first window of log data"),
          }),
        }),
        expect.any(Object),
        testContext
      );
    });

    it("should include previous summary context in event payload", async () => {
      const previousSummary = createTestPreviousSummary({
        keyFindings: ["Module not found error"],
        currentStatus: "dependency_missing",
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            previousAnalysisContext: expect.stringContaining("dependency_missing"),
          }),
        }),
        expect.any(Object),
        testContext
      );
    });

    it("should include previous key findings in prompt context", async () => {
      const previousSummary = createTestPreviousSummary({
        keyFindings: ["Finding A", "Finding B"],
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });

      await processWindow(input, testContext);

      const call = mockAnalyzeFailure.mock.calls[0] as unknown[];
      const event = call[0] as Event;
      const previousContext = (event.payload as Record<string, unknown>)
        .previousAnalysisContext as string;
      expect(previousContext).toContain("Finding A");
      expect(previousContext).toContain("Finding B");
    });

    it("should include previous error timeline in prompt context", async () => {
      const previousSummary = createTestPreviousSummary({
        errorTimeline: [
          { timestamp: "2026-03-01T00:01:00Z", severity: "critical", message: "OOM crash" },
        ],
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });

      await processWindow(input, testContext);

      const call = mockAnalyzeFailure.mock.calls[0] as unknown[];
      const event = call[0] as Event;
      const previousContext = (event.payload as Record<string, unknown>)
        .previousAnalysisContext as string;
      expect(previousContext).toContain("OOM crash");
      expect(previousContext).toContain("critical");
    });

    it("should include unresolved issues in prompt context when present", async () => {
      const previousSummary = createTestPreviousSummary({
        unresolvedIssues: ["Fix memory leak", "Update deps"],
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });

      await processWindow(input, testContext);

      const call = mockAnalyzeFailure.mock.calls[0] as unknown[];
      const event = call[0] as Event;
      const previousContext = (event.payload as Record<string, unknown>)
        .previousAnalysisContext as string;
      expect(previousContext).toContain("Unresolved Issues");
      expect(previousContext).toContain("Fix memory leak");
    });

    it("should omit unresolved issues section when empty", async () => {
      const previousSummary = createTestPreviousSummary({
        unresolvedIssues: [],
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });

      await processWindow(input, testContext);

      const call = mockAnalyzeFailure.mock.calls[0] as unknown[];
      const event = call[0] as Event;
      const previousContext = (event.payload as Record<string, unknown>)
        .previousAnalysisContext as string;
      expect(previousContext).not.toContain("Unresolved Issues");
    });
  });

  // ==================== Updated Summary Construction ====================

  describe("buildUpdatedSummary", () => {
    it("should increment version from previous summary", async () => {
      const previousSummary = createTestPreviousSummary({ version: 3 });
      const input = createTestWindowInput({ previousSummary, windowNumber: 4 });

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.version).toBe(4);
    });

    it("should start version at 1 when no previous summary", async () => {
      const input = createTestWindowInput({ previousSummary: null });

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.version).toBe(1);
    });

    it("should preserve start time from previous summary", async () => {
      const previousSummary = createTestPreviousSummary({
        timeRange: { start: "2026-03-01T00:00:00Z", end: "2026-03-01T00:05:00Z" },
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.timeRange.start).toBe("2026-03-01T00:00:00Z");
    });

    it("should use identifiedCause as currentStatus when available", async () => {
      mockAnalyzeFailure.mockResolvedValue(
        createTestAnalysisResult({ identifiedCause: "OOM in container" })
      );
      const input = createTestWindowInput();

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.currentStatus).toBe("OOM in container");
    });

    it("should use 'investigating' as currentStatus when no identifiedCause", async () => {
      mockAnalyzeFailure.mockResolvedValue(
        createTestAnalysisResult({ identifiedCause: undefined })
      );
      const input = createTestWindowInput();

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.currentStatus).toBe("investigating");
    });

    it("should cap keyFindings at 10 entries", async () => {
      const previousSummary = createTestPreviousSummary({
        keyFindings: Array.from({ length: 9 }, (_, i) => `Finding ${String(i)}`),
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });
      mockAnalyzeFailure.mockResolvedValue(createTestAnalysisResult({ summary: "New finding" }));

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.keyFindings.length).toBeLessThanOrEqual(10);
    });

    it("should keep up to 7 previous key findings and append new one", async () => {
      const previousSummary = createTestPreviousSummary({
        keyFindings: Array.from({ length: 10 }, (_, i) => `Old finding ${String(i)}`),
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });
      mockAnalyzeFailure.mockResolvedValue(
        createTestAnalysisResult({ summary: "Brand new finding" })
      );

      const result = await processWindow(input, testContext);

      // Keeps up to 7 from previous, adds new, then caps at 10
      expect(result.updatedSummary.keyFindings).toContain("Brand new finding");
      expect(result.updatedSummary.keyFindings.length).toBeLessThanOrEqual(10);
    });

    it("should cap errorTimeline at 10 entries", async () => {
      const previousSummary = createTestPreviousSummary({
        errorTimeline: Array.from({ length: 9 }, (_, i) => ({
          timestamp: `2026-03-01T00:0${String(i)}:00Z`,
          severity: "warning" as const,
          message: `Error ${String(i)}`,
        })),
      });
      const input = createTestWindowInput({ previousSummary, windowNumber: 2 });

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.errorTimeline.length).toBeLessThanOrEqual(10);
    });

    it("should cap unresolvedIssues at 5 entries", async () => {
      mockAnalyzeFailure.mockResolvedValue(
        createTestAnalysisResult({
          recommendedActions: Array.from({ length: 8 }, (_, i) => ({
            description: `Action ${String(i)}`,
            priority: "high",
          })),
        })
      );
      const input = createTestWindowInput();

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.unresolvedIssues.length).toBeLessThanOrEqual(5);
    });

    it("should only include high and critical priority actions as unresolved issues", async () => {
      mockAnalyzeFailure.mockResolvedValue(
        createTestAnalysisResult({
          recommendedActions: [
            { description: "Critical fix", priority: "critical" },
            { description: "High fix", priority: "high" },
            { description: "Medium fix", priority: "medium" },
            { description: "Low fix", priority: "low" },
          ],
        })
      );
      const input = createTestWindowInput();

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.unresolvedIssues).toContain("Critical fix");
      expect(result.updatedSummary.unresolvedIssues).toContain("High fix");
      expect(result.updatedSummary.unresolvedIssues).not.toContain("Medium fix");
      expect(result.updatedSummary.unresolvedIssues).not.toContain("Low fix");
    });

    it("should produce empty unresolvedIssues when no recommended actions", async () => {
      mockAnalyzeFailure.mockResolvedValue(
        createTestAnalysisResult({ recommendedActions: undefined })
      );
      const input = createTestWindowInput();

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.unresolvedIssues).toEqual([]);
    });

    it("should include metricsSnapshot with window number, lines, and tokens", async () => {
      const input = createTestWindowInput({
        windowNumber: 7,
        lines: ["a", "b", "c", "d", "e"],
        estimatedTokens: 2500,
      });

      const result = await processWindow(input, testContext);

      expect(result.updatedSummary.metricsSnapshot).toBe("Window 7: 5 lines, 2500 tokens");
    });
  });

  // ==================== Event Construction ====================

  describe("event construction", () => {
    it("should build event with correct type and severity", async () => {
      const input = createTestWindowInput();

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EVENT_TYPES.CICD_FAILURE,
          severity: EVENT_SEVERITY.HIGH,
        }),
        expect.any(Object),
        testContext
      );
    });

    it("should include repository, branch, commit, and platform in event payload", async () => {
      const input = createTestWindowInput({
        metadata: {
          repository: "myorg/myrepo",
          branch: "feature-x",
          commit: "def456",
          startedAt: new Date(),
          completedAt: null,
          status: "failed",
          projectId: "p1",
          projectName: "proj",
        },
        platform: "railway",
      });

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            repository: "myorg/myrepo",
            branch: "feature-x",
            commit: "def456",
            platform: "railway",
          }),
        }),
        expect.any(Object),
        testContext
      );
    });

    it("should include entityId as deployId in event payload", async () => {
      const input = createTestWindowInput({ entityId: "dpl_xyz789" });

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            deployId: "dpl_xyz789",
          }),
        }),
        expect.any(Object),
        testContext
      );
    });

    it("should build event ID from entityId and windowNumber", async () => {
      const input = createTestWindowInput({ entityId: "deploy-42", windowNumber: 5 });

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "window-deploy-42-5",
        }),
        expect.any(Object),
        testContext
      );
    });

    it("should set event title with repository and window number", async () => {
      const input = createTestWindowInput({
        metadata: {
          ...createTestWindowInput().metadata,
          repository: "org/project",
        },
        windowNumber: 3,
      });

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Deploy failure in org/project (window 3)",
        }),
        expect.any(Object),
        testContext
      );
    });
  });

  // ==================== RequestContext Propagation ====================

  describe("RequestContext propagation", () => {
    it("should pass context to analyzeFailure", async () => {
      const input = createTestWindowInput();

      await processWindow(input, testContext);

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        testContext
      );
    });

    it("should pass context to chunking pipeline when used", async () => {
      const input = createTestWindowInput({
        estimatedTokens: WINDOW_ANALYSIS_BUDGET.MAX_BATCH_TOKENS + 1,
      });
      mockExecuteChunkingPipeline.mockResolvedValue({ chunks: [] });
      mockConvertAggregatedToEvidence.mockReturnValue({
        eventId: "test",
        collectedAt: "2026-03-01T00:00:00Z",
      } as Evidence);

      await processWindow(input, testContext);

      expect(mockExecuteChunkingPipeline).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        testContext
      );
    });
  });

  // ==================== Error Propagation ====================

  describe("error propagation", () => {
    it("should propagate analyzeFailure errors", async () => {
      mockAnalyzeFailure.mockRejectedValue(new Error("LLM service unavailable"));
      const input = createTestWindowInput();

      await expect(processWindow(input, testContext)).rejects.toThrow("LLM service unavailable");
    });
  });
});
