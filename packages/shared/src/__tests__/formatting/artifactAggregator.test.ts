/**
 * Unit tests for formatting/artifactAggregator.ts (Stage 3)
 *
 * Tests the artifact aggregation module that deduplicates, ranks,
 * and aggregates artifacts from extraction results.
 */
import { describe, it, expect } from "@jest/globals";
import {
  computeArtifactSignature,
  computeArtifactSignatureSync,
  computeAbsoluteEvidenceId,
  computePriorityScore,
  createRankedArtifact,
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
  aggregateArtifacts,
  checkAggregationViability,
  createEmptyAggregatedEvidence,
} from "../../formatting/artifactAggregator.js";
import type {
  ExtractedArtifact,
  ExtractionResult,
  BatchExtractionResult,
  ChunkResult,
} from "../../formatting/chunkingTypes.js";
import {
  ARTIFACT_TYPES,
  ARTIFACT_SEVERITY,
  ARTIFACT_CONFIDENCE,
  ARTIFACT_PRIORITY_WEIGHTS,
  BOUNDARY_TYPES,
} from "../../constants/index.js";

describe("Artifact Aggregator (Stage 3)", () => {
  // Helper to create a mock artifact
  const createMockArtifact = (overrides: Partial<ExtractedArtifact> = {}): ExtractedArtifact => ({
    evidenceId: "chunk#0:L1-L5",
    type: ARTIFACT_TYPES.GENERIC_ERROR,
    severity: ARTIFACT_SEVERITY.ERROR,
    errorMessage: "Test error message",
    snippet: "Error: test",
    snippetLineStart: 1,
    confidence: ARTIFACT_CONFIDENCE.MEDIUM,
    ...overrides,
  });

  // Helper to create a mock extraction result
  const createMockExtractionResult = (
    chunkId: number,
    artifacts: ExtractedArtifact[],
    success: boolean = true
  ): ExtractionResult => ({
    chunkId,
    artifacts,
    extractionTimeMs: 100,
    modelUsed: "test-model",
    success,
    error: success ? undefined : "Extraction failed",
  });

  // Helper to create a mock chunk
  const createMockChunk = (chunkId: number, lineOffset: number): ChunkResult => ({
    chunkId,
    content: "test content",
    lineOffset,
    lineCount: 10,
    estimatedTokens: 50,
    protectedZones: [],
    boundaryType: BOUNDARY_TYPES.NATURAL,
  });

  describe("computeArtifactSignature", () => {
    it("should compute a signature hash", async () => {
      const artifact = createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE });
      const signature = await computeArtifactSignature(artifact);

      expect(signature.hash).toBeDefined();
      expect(signature.hash.length).toBeGreaterThan(0);
      expect(signature.components.type).toBe(ARTIFACT_TYPES.STACK_TRACE);
    });

    it("should produce same hash for same artifact", async () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        filePath: "src/app.test.ts",
        lineNumber: 42,
      });

      const sig1 = await computeArtifactSignature(artifact);
      const sig2 = await computeArtifactSignature(artifact);

      expect(sig1.hash).toBe(sig2.hash);
    });

    it("should produce different hash for different artifacts", async () => {
      const artifact1 = createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE });
      const artifact2 = createMockArtifact({ type: ARTIFACT_TYPES.COMPILER_ERROR });

      const sig1 = await computeArtifactSignature(artifact1);
      const sig2 = await computeArtifactSignature(artifact2);

      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it("should include file path in signature (lowercased)", async () => {
      const artifact = createMockArtifact({ filePath: "SRC/App.ts" });
      const signature = await computeArtifactSignature(artifact);

      expect(signature.components.filePath).toBe("src/app.ts");
    });
  });

  describe("computeArtifactSignatureSync", () => {
    it("should compute a signature synchronously", () => {
      const artifact = createMockArtifact();
      const signature = computeArtifactSignatureSync(artifact);

      expect(signature.hash).toBeDefined();
      expect(signature.hash.length).toBeGreaterThan(0);
    });

    it("should be deterministic", () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        testName: "should work",
      });

      const sig1 = computeArtifactSignatureSync(artifact);
      const sig2 = computeArtifactSignatureSync(artifact);

      expect(sig1.hash).toBe(sig2.hash);
    });
  });

  describe("computeAbsoluteEvidenceId", () => {
    it("should compute absolute line numbers", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0:L10-L15" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 100);

      expect(absoluteId).toBe("chunk#0:L109-L114");
    });

    it("should handle chunk offset of 1", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#0:L1-L5" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 1);

      expect(absoluteId).toBe("chunk#0:L1-L5");
    });

    it("should return original if parsing fails", () => {
      const artifact = createMockArtifact({ evidenceId: "invalid-format" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 100);

      expect(absoluteId).toBe("invalid-format");
    });

    it("should preserve chunk ID in absolute evidence ID", () => {
      const artifact = createMockArtifact({ evidenceId: "chunk#5:L10-L20" });
      const absoluteId = computeAbsoluteEvidenceId(artifact, 50);

      expect(absoluteId).toContain("chunk#5:");
    });
  });

  describe("computePriorityScore", () => {
    it("should return correct priority for infra_killer", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.INFRA_KILLER);
      expect(score).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.INFRA_KILLER]);
      expect(score).toBe(10);
    });

    it("should return correct priority for ci_boundary", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.CI_BOUNDARY);
      // CI_BOUNDARY has low priority (3) - it's only used when no specific artifact is found
      expect(score).toBe(3);
    });

    it("should return correct priority for stack_trace", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.STACK_TRACE);
      expect(score).toBe(6);
    });

    it("should return correct priority for generic_error", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.GENERIC_ERROR);
      expect(score).toBe(2);
    });

    it("should rank infra_killer higher than stack_trace", () => {
      const infraScore = computePriorityScore(ARTIFACT_TYPES.INFRA_KILLER);
      const stackScore = computePriorityScore(ARTIFACT_TYPES.STACK_TRACE);
      expect(infraScore).toBeGreaterThan(stackScore);
    });
  });

  describe("createRankedArtifact", () => {
    it("should create a ranked artifact with all fields", () => {
      const artifact = createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE });
      const ranked = createRankedArtifact(artifact, 2, 50, 3);

      expect(ranked.type).toBe(ARTIFACT_TYPES.STACK_TRACE);
      expect(ranked.priorityScore).toBe(6);
      expect(ranked.firstOccurrenceChunk).toBe(2);
      expect(ranked.occurrenceCount).toBe(3);
      expect(ranked.signature).toBeDefined();
      expect(ranked.absoluteEvidenceId).toBeDefined();
    });

    it("should preserve original artifact fields", () => {
      const artifact = createMockArtifact({
        filePath: "src/test.ts",
        lineNumber: 42,
        errorMessage: "Test error",
      });
      const ranked = createRankedArtifact(artifact, 0, 1, 1);

      expect(ranked.filePath).toBe("src/test.ts");
      expect(ranked.lineNumber).toBe(42);
      expect(ranked.errorMessage).toBe("Test error");
    });
  });

  describe("deduplicateArtifacts", () => {
    it("should deduplicate identical artifacts", () => {
      const artifact = createMockArtifact({
        type: ARTIFACT_TYPES.STACK_TRACE,
        filePath: "src/app.ts",
        lineNumber: 10,
      });

      const results: ExtractionResult[] = [
        createMockExtractionResult(0, [artifact]),
        createMockExtractionResult(1, [artifact]),
        createMockExtractionResult(2, [artifact]),
      ];

      const offsets = new Map([
        [0, 1],
        [1, 100],
        [2, 200],
      ]);

      const { artifacts, totalExtracted, duplicatesRemoved } = deduplicateArtifacts(
        results,
        offsets
      );

      expect(totalExtracted).toBe(3);
      expect(duplicatesRemoved).toBe(2);
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].occurrenceCount).toBe(3);
    });

    it("should keep different artifacts separate", () => {
      const artifact1 = createMockArtifact({
        type: ARTIFACT_TYPES.STACK_TRACE,
        filePath: "src/a.ts",
      });
      const artifact2 = createMockArtifact({
        type: ARTIFACT_TYPES.COMPILER_ERROR,
        filePath: "src/b.ts",
      });

      const results = [
        createMockExtractionResult(0, [artifact1]),
        createMockExtractionResult(1, [artifact2]),
      ];

      const offsets = new Map([
        [0, 1],
        [1, 100],
      ]);

      const { artifacts, duplicatesRemoved } = deduplicateArtifacts(results, offsets);

      expect(artifacts.length).toBe(2);
      expect(duplicatesRemoved).toBe(0);
    });

    it("should skip failed extraction results", () => {
      const artifact = createMockArtifact();
      const results = [
        createMockExtractionResult(0, [artifact], true),
        createMockExtractionResult(1, [], false),
      ];

      const offsets = new Map([
        [0, 1],
        [1, 100],
      ]);

      const { artifacts, totalExtracted } = deduplicateArtifacts(results, offsets);

      expect(totalExtracted).toBe(1);
      expect(artifacts.length).toBe(1);
    });

    it("should track first occurrence chunk", () => {
      const artifact = createMockArtifact();
      const results = [
        createMockExtractionResult(2, [artifact]),
        createMockExtractionResult(5, [artifact]),
      ];

      const offsets = new Map([
        [2, 1],
        [5, 100],
      ]);

      const { artifacts } = deduplicateArtifacts(results, offsets);

      expect(artifacts[0].firstOccurrenceChunk).toBe(2);
    });
  });

  describe("sortArtifactsByPriority", () => {
    it("should sort by priority score descending", () => {
      const lowPriority = createRankedArtifact(
        createMockArtifact({ type: ARTIFACT_TYPES.GENERIC_ERROR }),
        0,
        1,
        1
      );
      const highPriority = createRankedArtifact(
        createMockArtifact({ type: ARTIFACT_TYPES.INFRA_KILLER }),
        1,
        1,
        1
      );

      const sorted = sortArtifactsByPriority([lowPriority, highPriority]);

      expect(sorted[0].type).toBe(ARTIFACT_TYPES.INFRA_KILLER);
      expect(sorted[1].type).toBe(ARTIFACT_TYPES.GENERIC_ERROR);
    });

    it("should use first occurrence as tiebreaker", () => {
      const early = createRankedArtifact(
        createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE }),
        0,
        1,
        1
      );
      const late = createRankedArtifact(
        createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE }),
        5,
        1,
        1
      );

      const sorted = sortArtifactsByPriority([late, early]);

      expect(sorted[0].firstOccurrenceChunk).toBe(0);
      expect(sorted[1].firstOccurrenceChunk).toBe(5);
    });

    it("should not mutate original array", () => {
      const artifacts = [
        createRankedArtifact(createMockArtifact({ type: ARTIFACT_TYPES.GENERIC_ERROR }), 0, 1, 1),
        createRankedArtifact(createMockArtifact({ type: ARTIFACT_TYPES.INFRA_KILLER }), 1, 1, 1),
      ];

      const originalFirst = artifacts[0];
      sortArtifactsByPriority(artifacts);

      expect(artifacts[0]).toBe(originalFirst);
    });
  });

  describe("detectCommonFramework", () => {
    it("should return most common framework", () => {
      const artifacts = [
        createMockArtifact({ framework: "jest" }),
        createMockArtifact({ framework: "jest" }),
        createMockArtifact({ framework: "mocha" }),
      ];

      const framework = detectCommonFramework(artifacts);
      expect(framework).toBe("jest");
    });

    it("should return undefined when no frameworks", () => {
      const artifacts = [createMockArtifact(), createMockArtifact()];

      const framework = detectCommonFramework(artifacts);
      expect(framework).toBeUndefined();
    });

    it("should handle single artifact with framework", () => {
      const artifacts = [createMockArtifact({ framework: "pytest" })];

      const framework = detectCommonFramework(artifacts);
      expect(framework).toBe("pytest");
    });

    it("should handle empty array", () => {
      const framework = detectCommonFramework([]);
      expect(framework).toBeUndefined();
    });
  });

  describe("aggregateArtifacts", () => {
    it("should aggregate artifacts from batch results", () => {
      const artifact = createMockArtifact({ type: ARTIFACT_TYPES.STACK_TRACE });
      const batchResult: BatchExtractionResult = {
        results: [createMockExtractionResult(0, [artifact])],
        totalChunks: 1,
        successfulChunks: 1,
        failedChunks: 0,
        totalArtifacts: 1,
        aborted: false,
      };

      const chunks = [createMockChunk(0, 1)];

      const aggregated = aggregateArtifacts(batchResult, chunks);

      expect(aggregated.artifacts.length).toBe(1);
      expect(aggregated.totalExtracted).toBe(1);
      expect(aggregated.chunksProcessed).toBe(1);
      expect(aggregated.primaryFailureType).toBe(ARTIFACT_TYPES.STACK_TRACE);
    });

    it("should limit artifacts to maxArtifacts", () => {
      // Each artifact needs unique signature fields (filePath, lineNumber, errorCode, testName)
      // errorMessage is NOT part of signature computation
      const artifacts = Array.from({ length: 50 }, (_, index) =>
        createMockArtifact({
          type: ARTIFACT_TYPES.GENERIC_ERROR,
          filePath: `src/file${index}.ts`,
          lineNumber: index + 1,
          errorMessage: `Error ${index}`,
          evidenceId: `chunk#0:L${index}-L${index + 1}`,
        })
      );

      const batchResult: BatchExtractionResult = {
        results: [createMockExtractionResult(0, artifacts)],
        totalChunks: 1,
        successfulChunks: 1,
        failedChunks: 0,
        totalArtifacts: 50,
        aborted: false,
      };

      const chunks = [createMockChunk(0, 1)];

      const aggregated = aggregateArtifacts(batchResult, chunks, 10);

      expect(aggregated.artifacts.length).toBe(10);
      expect(aggregated.totalExtracted).toBe(50);
    });

    it("should detect CI platform", () => {
      const batchResult: BatchExtractionResult = {
        results: [],
        totalChunks: 0,
        successfulChunks: 0,
        failedChunks: 0,
        totalArtifacts: 0,
        aborted: false,
      };

      const aggregated = aggregateArtifacts(batchResult, [], 25, "github_actions");

      expect(aggregated.detectedCIPlatform).toBe("github_actions");
    });

    it("should detect common framework", () => {
      const artifacts = [
        createMockArtifact({ framework: "vitest" }),
        createMockArtifact({ framework: "vitest" }),
      ];

      const batchResult: BatchExtractionResult = {
        results: [createMockExtractionResult(0, artifacts)],
        totalChunks: 1,
        successfulChunks: 1,
        failedChunks: 0,
        totalArtifacts: 2,
        aborted: false,
      };

      const aggregated = aggregateArtifacts(batchResult, [createMockChunk(0, 1)]);

      expect(aggregated.detectedFramework).toBe("vitest");
    });
  });

  describe("checkAggregationViability", () => {
    it("should return undefined for viable batch", () => {
      const batchResult: BatchExtractionResult = {
        results: [],
        totalChunks: 10,
        successfulChunks: 8,
        failedChunks: 2,
        totalArtifacts: 20,
        aborted: false,
      };

      const error = checkAggregationViability(batchResult);
      expect(error).toBeUndefined();
    });

    it("should return error for aborted batch", () => {
      const batchResult: BatchExtractionResult = {
        results: [],
        totalChunks: 10,
        successfulChunks: 2,
        failedChunks: 8,
        totalArtifacts: 5,
        aborted: true,
        abortReason: "Too many failures",
      };

      const error = checkAggregationViability(batchResult);
      expect(error).toBe("Too many failures");
    });

    it("should return error for zero chunks", () => {
      const batchResult: BatchExtractionResult = {
        results: [],
        totalChunks: 0,
        successfulChunks: 0,
        failedChunks: 0,
        totalArtifacts: 0,
        aborted: false,
      };

      const error = checkAggregationViability(batchResult);
      expect(error).toBe("No chunks to process");
    });

    it("should return error when failure rate exceeds threshold", () => {
      const batchResult: BatchExtractionResult = {
        results: [],
        totalChunks: 10,
        successfulChunks: 3,
        failedChunks: 7,
        totalArtifacts: 5,
        aborted: false,
      };

      const error = checkAggregationViability(batchResult, 0.5);
      expect(error).toContain("failure rate");
      expect(error).toContain("70.0%");
    });

    it("should respect custom threshold", () => {
      const batchResult: BatchExtractionResult = {
        results: [],
        totalChunks: 10,
        successfulChunks: 3,
        failedChunks: 7,
        totalArtifacts: 5,
        aborted: false,
      };

      // With high threshold, should pass
      const error = checkAggregationViability(batchResult, 0.9);
      expect(error).toBeUndefined();
    });
  });

  describe("createEmptyAggregatedEvidence", () => {
    it("should create empty evidence with defaults", () => {
      const evidence = createEmptyAggregatedEvidence();

      expect(evidence.artifacts).toEqual([]);
      expect(evidence.totalExtracted).toBe(0);
      expect(evidence.duplicatesRemoved).toBe(0);
      expect(evidence.chunksProcessed).toBe(0);
      expect(evidence.chunksFailed).toBe(0);
      expect(evidence.primaryFailureType).toBeUndefined();
      expect(evidence.detectedFramework).toBeUndefined();
    });

    it("should accept custom values", () => {
      const evidence = createEmptyAggregatedEvidence(5, 2, "gitlab_ci");

      expect(evidence.chunksProcessed).toBe(5);
      expect(evidence.chunksFailed).toBe(2);
      expect(evidence.detectedCIPlatform).toBe("gitlab_ci");
    });
  });
});
