/**
 * Unit tests for Analysis Chunking Pipeline
 *
 * Tests the multi-stage chunking pipeline and evidence conversion.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { AggregatedEvidence, RankedArtifact, PrimaryFailure } from "@kenchi/shared";

// ==================== Mock Setup ====================

const mockChunkLog = jest.fn();
const mockExtractFromAllChunks = jest.fn();
const mockAggregateArtifacts = jest.fn();
const mockCheckAggregationViability = jest.fn();
const mockCreateDegradedResult = jest.fn();
const mockExtractorFn = jest.fn();
const mockCreateLLMExtractor = jest.fn().mockReturnValue(mockExtractorFn);

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    chunkLog: (...args: unknown[]) => mockChunkLog(...args),
    extractFromAllChunks: (...args: unknown[]) => mockExtractFromAllChunks(...args),
    aggregateArtifacts: (...args: unknown[]) => mockAggregateArtifacts(...args),
    checkAggregationViability: (...args: unknown[]) => mockCheckAggregationViability(...args),
    createDegradedResult: (...args: unknown[]) => mockCreateDegradedResult(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

jest.mock("../adapters/llmExtraction.js", () => ({
  createLLMExtractor: () => mockCreateLLMExtractor(),
}));

// Import after mock setup
import {
  executeChunkingPipeline,
  convertAggregatedToEvidence,
  CHUNKING_PIPELINE_CONFIG,
} from "../services/analysisChunkingPipeline.js";

// ==================== Test Helpers ====================

const testContext = { requestId: "test-req-123", tenantId: "test-tenant" };

const createMockRankedArtifact = (overrides: Partial<RankedArtifact> = {}): RankedArtifact => ({
  evidenceId: "chunk#0:L1-L3",
  type: "test_failure",
  severity: "error",
  errorMessage: "Expected true but got false",
  snippet: "assert.equal(result, true)",
  snippetLineStart: 1,
  confidence: "high",
  assertion_hash: "abc123",
  priorityScore: 100,
  firstOccurrenceChunk: 0,
  occurrenceCount: 1,
  signature: { typeKey: "test_failure", messageKey: "expected-true-but-got-false" },
  absoluteEvidenceId: "chunk#0:L1-L3",
  ...overrides,
});

const createMockPrimaryFailure = (overrides: Partial<PrimaryFailure> = {}): PrimaryFailure => ({
  type: "test_failure",
  artifactIndex: 0,
  confidence: "high",
  reason: "Test failure is the root cause",
  evidenceId: "chunk#0:L1-L3",
  ...overrides,
});

const createMockAggregatedEvidence = (
  overrides: Partial<AggregatedEvidence> = {}
): AggregatedEvidence => ({
  artifacts: [createMockRankedArtifact()],
  totalExtracted: 1,
  duplicatesRemoved: 0,
  chunksProcessed: 1,
  chunksFailed: 0,
  primaryFailureType: "test_failure",
  detectedFramework: "jest",
  detectedCIPlatform: "github_actions",
  primaryFailure: createMockPrimaryFailure(),
  degraded_mode: false,
  ...overrides,
});

// ==================== Tests ====================

describe("Analysis Chunking Pipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== CHUNKING_PIPELINE_CONFIG ====================

  describe("CHUNKING_PIPELINE_CONFIG", () => {
    it("should have TOKEN_THRESHOLD of 0 (always chunk)", () => {
      expect(CHUNKING_PIPELINE_CONFIG.TOKEN_THRESHOLD).toBe(0);
    });

    it("should have EXTRACTION_TIMEOUT_MS of 60000", () => {
      expect(CHUNKING_PIPELINE_CONFIG.EXTRACTION_TIMEOUT_MS).toBe(60000);
    });

    it("should have EXTRACTION_CONCURRENCY of 15", () => {
      expect(CHUNKING_PIPELINE_CONFIG.EXTRACTION_CONCURRENCY).toBe(15);
    });

    it("should have a dynamic EXTRACTION_MODEL getter", () => {
      expect(typeof CHUNKING_PIPELINE_CONFIG.EXTRACTION_MODEL).toBe("string");
      expect(CHUNKING_PIPELINE_CONFIG.EXTRACTION_MODEL.length).toBeGreaterThan(0);
    });
  });

  // ==================== executeChunkingPipeline ====================

  describe("executeChunkingPipeline", () => {
    it("should execute all three pipeline stages successfully", async () => {
      const mockChunkingResult = {
        chunks: [{ content: "chunk1", tokenCount: 100, index: 0, startLine: 0, endLine: 10 }],
        totalTokens: 100,
        skippedChunking: false,
        detectedPlatform: "github_actions",
      };

      const mockBatchResult = {
        successfulChunks: 1,
        failedChunks: 0,
        totalArtifacts: 2,
        aborted: false,
        results: [],
      };

      const mockAggregated = createMockAggregatedEvidence();

      mockChunkLog.mockReturnValue(mockChunkingResult);
      mockExtractFromAllChunks.mockResolvedValue(mockBatchResult);
      mockCheckAggregationViability.mockReturnValue(undefined);
      mockAggregateArtifacts.mockReturnValue(mockAggregated);

      const result = await executeChunkingPipeline("log content", "test-repo", testContext);

      expect(mockChunkLog).toHaveBeenCalledWith("log content");
      expect(mockExtractFromAllChunks).toHaveBeenCalledWith(
        mockChunkingResult.chunks,
        mockExtractorFn,
        {
          concurrency: CHUNKING_PIPELINE_CONFIG.EXTRACTION_CONCURRENCY,
          timeoutMs: CHUNKING_PIPELINE_CONFIG.EXTRACTION_TIMEOUT_MS,
          model: CHUNKING_PIPELINE_CONFIG.EXTRACTION_MODEL,
        }
      );
      expect(mockCheckAggregationViability).toHaveBeenCalledWith(mockBatchResult);
      expect(mockAggregateArtifacts).toHaveBeenCalledWith(
        mockBatchResult,
        mockChunkingResult.chunks,
        undefined,
        "github_actions"
      );
      expect(result).toEqual(mockAggregated);
    });

    it("should use degraded mode when viability check fails", async () => {
      const mockChunkingResult = {
        chunks: [{ content: "chunk1", tokenCount: 100, index: 0, startLine: 0, endLine: 10 }],
        totalTokens: 100,
        skippedChunking: false,
        detectedPlatform: "github_actions",
      };

      const mockBatchResult = {
        successfulChunks: 0,
        failedChunks: 1,
        totalArtifacts: 0,
        aborted: true,
        results: [],
      };

      const degradedResult = createMockAggregatedEvidence({ degraded_mode: true });

      mockChunkLog.mockReturnValue(mockChunkingResult);
      mockExtractFromAllChunks.mockResolvedValue(mockBatchResult);
      mockCheckAggregationViability.mockReturnValue("All chunks failed");
      mockCreateDegradedResult.mockReturnValue(degradedResult);

      const result = await executeChunkingPipeline("log content", "test-repo", testContext);

      expect(mockCreateDegradedResult).toHaveBeenCalledWith(
        "log content",
        "All chunks failed",
        0,
        1,
        "github_actions"
      );
      expect(mockAggregateArtifacts).not.toHaveBeenCalled();
      expect(result.degraded_mode).toBe(true);
    });

    it("should propagate errors from chunk extraction", async () => {
      const mockChunkingResult = {
        chunks: [{ content: "chunk1", tokenCount: 100, index: 0, startLine: 0, endLine: 10 }],
        totalTokens: 100,
        skippedChunking: false,
        detectedPlatform: undefined,
      };

      mockChunkLog.mockReturnValue(mockChunkingResult);
      mockExtractFromAllChunks.mockRejectedValue(new Error("Extraction failed"));

      await expect(
        executeChunkingPipeline("log content", "test-repo", testContext)
      ).rejects.toThrow("Extraction failed");
    });
  });

  // ==================== convertAggregatedToEvidence ====================

  describe("convertAggregatedToEvidence", () => {
    const eventId = "evt_test_123";
    const collectedAt = "2024-01-15T10:00:00.000Z";

    it("should convert aggregated evidence with correct structure", () => {
      const aggregated = createMockAggregatedEvidence();

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      expect(result.eventId).toBe(eventId);
      expect(result.collectedAt).toBe(collectedAt);
      expect(result.logs).toBeDefined();
      expect(result.logs!.length).toBeGreaterThan(0);
    });

    it("should include artifact summary as first log entry", () => {
      const aggregated = createMockAggregatedEvidence();

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      // Primary failure is prepended before summary, so summary is at index 1
      // when primary failure exists
      const summaryLog = result.logs!.find((l) => l.id === "artifact_summary");
      expect(summaryLog).toBeDefined();
      expect(summaryLog!.level).toBe("INFO");
      expect(summaryLog!.message).toContain("ARTIFACT SUMMARY");
      expect(summaryLog!.message).toContain("Total 1 artifacts extracted");
      expect(summaryLog!.source).toBe("ci");
    });

    it("should include primary failure entry when primary failure has valid index", () => {
      const aggregated = createMockAggregatedEvidence({
        primaryFailure: createMockPrimaryFailure({ artifactIndex: 0, confidence: "high" }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const primaryLog = result.logs!.find((l) => l.id === "primary_failure");
      expect(primaryLog).toBeDefined();
      expect(primaryLog!.level).toBe("ERROR");
      expect(primaryLog!.message).toContain("PRIMARY FAILURE");
      expect(primaryLog!.message).toContain("high confidence");
    });

    it("should not include primary failure entry when artifactIndex is -1", () => {
      const aggregated = createMockAggregatedEvidence({
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const primaryLog = result.logs!.find((l) => l.id === "primary_failure");
      expect(primaryLog).toBeUndefined();
    });

    it("should convert artifacts to log entries with correct IDs", () => {
      const artifacts = [
        createMockRankedArtifact({ type: "test_failure", errorMessage: "Error 1" }),
        createMockRankedArtifact({ type: "build_error", errorMessage: "Error 2" }),
      ];
      const aggregated = createMockAggregatedEvidence({
        artifacts,
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const artifactLogs = result.logs!.filter(
        (l) => l.id.startsWith("artifact_") && l.id !== "artifact_summary"
      );
      expect(artifactLogs).toHaveLength(2);
      expect(artifactLogs[0].id).toBe("artifact_0");
      expect(artifactLogs[1].id).toBe("artifact_1");
    });

    it("should set ERROR level for fatal severity artifacts", () => {
      const artifacts = [createMockRankedArtifact({ severity: "fatal" })];
      const aggregated = createMockAggregatedEvidence({
        artifacts,
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const artifactLog = result.logs!.find((l) => l.id === "artifact_0");
      expect(artifactLog!.level).toBe("ERROR");
    });

    it("should set INFO level for non-fatal severity artifacts", () => {
      const artifacts = [createMockRankedArtifact({ severity: "error" })];
      const aggregated = createMockAggregatedEvidence({
        artifacts,
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const artifactLog = result.logs!.find((l) => l.id === "artifact_0");
      expect(artifactLog!.level).toBe("INFO");
    });

    it("should format test_failure artifacts with structured metadata", () => {
      const artifact = createMockRankedArtifact({
        type: "test_failure",
        testName: "should validate input",
        filePath: "src/test.ts",
        lineNumber: 42,
        errorMessage: "Expected true",
        snippet: "expect(result).toBe(true)",
        expected: "true",
        actual: "false",
      });
      const aggregated = createMockAggregatedEvidence({
        artifacts: [artifact],
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const artifactLog = result.logs!.find((l) => l.id === "artifact_0");
      expect(artifactLog!.message).toContain("[test_failure]");
      expect(artifactLog!.message).toContain("Test: should validate input");
      expect(artifactLog!.message).toContain("File: src/test.ts:42");
      expect(artifactLog!.message).toContain("Expected: true");
      expect(artifactLog!.message).toContain("Actual: false");
      expect(artifactLog!.message).toContain("Error: Expected true");
      expect(artifactLog!.message).toContain("Snippet:");
    });

    it("should format non-test_failure artifacts with simple format", () => {
      const artifact = createMockRankedArtifact({
        type: "build_error",
        errorMessage: "Compilation failed",
        snippet: "error TS2345: argument type mismatch",
      });
      const aggregated = createMockAggregatedEvidence({
        artifacts: [artifact],
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const artifactLog = result.logs!.find((l) => l.id === "artifact_0");
      expect(artifactLog!.message).toContain("[build_error]");
      expect(artifactLog!.message).toContain("Compilation failed");
      expect(artifactLog!.message).toContain("Snippet:");
      // Should NOT contain test-specific fields
      expect(artifactLog!.message).not.toContain("Test:");
      expect(artifactLog!.message).not.toContain("File:");
    });

    it("should include test failure count in artifact summary", () => {
      const artifacts = [
        createMockRankedArtifact({ type: "test_failure" }),
        createMockRankedArtifact({ type: "test_failure" }),
        createMockRankedArtifact({ type: "build_error" }),
      ];
      const aggregated = createMockAggregatedEvidence({
        artifacts,
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const summaryLog = result.logs!.find((l) => l.id === "artifact_summary");
      expect(summaryLog!.message).toContain("ALL 2 test failures");
    });

    it("should handle empty artifacts array", () => {
      const aggregated = createMockAggregatedEvidence({
        artifacts: [],
        totalExtracted: 0,
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      expect(result.logs).toBeDefined();
      const summaryLog = result.logs!.find((l) => l.id === "artifact_summary");
      expect(summaryLog!.message).toContain("Total 0 artifacts extracted");
    });

    it("should offset timestamps between artifact log entries", () => {
      const artifacts = [
        createMockRankedArtifact({ type: "test_failure", errorMessage: "Error 1" }),
        createMockRankedArtifact({ type: "test_failure", errorMessage: "Error 2" }),
      ];
      const aggregated = createMockAggregatedEvidence({
        artifacts,
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const artifactLogs = result.logs!.filter(
        (l) => l.id.startsWith("artifact_") && l.id !== "artifact_summary"
      );
      const baseTime = new Date(collectedAt).getTime();
      expect(new Date(artifactLogs[0].timestamp!).getTime()).toBe(baseTime);
      expect(new Date(artifactLogs[1].timestamp!).getTime()).toBe(baseTime + 1000);
    });

    it("should handle test_failure without optional fields", () => {
      const artifact = createMockRankedArtifact({
        type: "test_failure",
        testName: undefined,
        filePath: undefined,
        lineNumber: undefined,
        expected: undefined,
        actual: undefined,
      });
      const aggregated = createMockAggregatedEvidence({
        artifacts: [artifact],
        primaryFailure: createMockPrimaryFailure({ artifactIndex: -1 }),
      });

      const result = convertAggregatedToEvidence(aggregated, eventId, collectedAt);

      const artifactLog = result.logs!.find((l) => l.id === "artifact_0");
      expect(artifactLog!.message).toContain("[test_failure]");
      expect(artifactLog!.message).not.toContain("Test:");
      expect(artifactLog!.message).not.toContain("File:");
      expect(artifactLog!.message).not.toContain("Expected:");
      expect(artifactLog!.message).not.toContain("Actual:");
    });
  });
});
