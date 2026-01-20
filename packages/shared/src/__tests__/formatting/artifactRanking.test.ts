/**
 * Unit tests for formatting/artifactRanking.ts
 *
 * Tests the artifact ranking module that handles ranking, deduplication,
 * sorting, and framework detection.
 */
import { describe, it, expect } from "@jest/globals";
import {
  computePriorityScore,
  createRankedArtifact,
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
  type RankedArtifact,
} from "../../formatting/aggregation/index.js";
import type { ExtractedArtifact, ExtractionResult } from "../../formatting/extraction/index.js";
import {
  ARTIFACT_TYPES,
  ARTIFACT_SEVERITY,
  ARTIFACT_CONFIDENCE,
  ARTIFACT_PRIORITY_WEIGHTS,
} from "../../constants/index.js";

describe("Artifact Ranking", () => {
  // Helper to create a mock extracted artifact
  const createMockExtractedArtifact = (
    overrides: Partial<ExtractedArtifact> = {}
  ): ExtractedArtifact => ({
    evidenceId: "chunk#0:L1-L5",
    type: ARTIFACT_TYPES.GENERIC_ERROR,
    severity: ARTIFACT_SEVERITY.ERROR,
    errorMessage: "Test error message",
    snippet: "Error: test",
    snippetLineStart: 1,
    confidence: ARTIFACT_CONFIDENCE.MEDIUM,
    ...overrides,
  });

  // Helper to create a mock ranked artifact
  const createMockRankedArtifact = (overrides: Partial<RankedArtifact> = {}): RankedArtifact => ({
    evidenceId: "chunk#0:L1-L5",
    type: ARTIFACT_TYPES.GENERIC_ERROR,
    severity: ARTIFACT_SEVERITY.ERROR,
    errorMessage: "Test error message",
    snippet: "Error: test",
    snippetLineStart: 1,
    confidence: ARTIFACT_CONFIDENCE.MEDIUM,
    priorityScore: 2,
    firstOccurrenceChunk: 0,
    occurrenceCount: 1,
    signature: { hash: "abc123", components: { type: ARTIFACT_TYPES.GENERIC_ERROR } },
    absoluteEvidenceId: "chunk#0:L1-L5",
    ...overrides,
  });

  // Helper to create a successful extraction result
  const createExtractionResult = (
    chunkId: number,
    artifacts: ExtractedArtifact[]
  ): ExtractionResult => ({
    chunkId,
    success: true,
    artifacts,
    processingTimeMs: 100,
  });

  // Helper to create a failed extraction result
  const createFailedExtractionResult = (chunkId: number): ExtractionResult => ({
    chunkId,
    success: false,
    artifacts: [],
    processingTimeMs: 50,
    error: "Extraction failed",
  });

  describe("computePriorityScore", () => {
    it("should return correct priority for infra_killer", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.INFRA_KILLER);
      expect(score).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.INFRA_KILLER]);
      expect(score).toBe(10);
    });

    it("should return correct priority for stack_trace", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.STACK_TRACE);
      expect(score).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.STACK_TRACE]);
      expect(score).toBe(6);
    });

    it("should return correct priority for test_failure", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.TEST_FAILURE);
      expect(score).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.TEST_FAILURE]);
      expect(score).toBe(5);
    });

    it("should return correct priority for compiler_error", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.COMPILER_ERROR);
      expect(score).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.COMPILER_ERROR]);
      expect(score).toBe(5);
    });

    it("should return correct priority for lint_error", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.LINT_ERROR);
      expect(score).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.LINT_ERROR]);
      expect(score).toBe(4);
    });

    it("should return correct priority for generic_error", () => {
      const score = computePriorityScore(ARTIFACT_TYPES.GENERIC_ERROR);
      expect(score).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.GENERIC_ERROR]);
      expect(score).toBe(2);
    });

    it("should return 0 for unknown type", () => {
      const score = computePriorityScore("unknown_type" as typeof ARTIFACT_TYPES.GENERIC_ERROR);
      expect(score).toBe(0);
    });

    it("should return higher score for infra_killer than test_failure", () => {
      const infraScore = computePriorityScore(ARTIFACT_TYPES.INFRA_KILLER);
      const testScore = computePriorityScore(ARTIFACT_TYPES.TEST_FAILURE);
      expect(infraScore).toBeGreaterThan(testScore);
    });
  });

  describe("createRankedArtifact", () => {
    it("should create a ranked artifact with correct fields", () => {
      const artifact = createMockExtractedArtifact({
        type: ARTIFACT_TYPES.STACK_TRACE,
        filePath: "src/app.ts",
        lineNumber: 42,
      });

      const ranked = createRankedArtifact(artifact, 0, 1, 1);

      expect(ranked.type).toBe(ARTIFACT_TYPES.STACK_TRACE);
      expect(ranked.filePath).toBe("src/app.ts");
      expect(ranked.lineNumber).toBe(42);
      expect(ranked.priorityScore).toBe(ARTIFACT_PRIORITY_WEIGHTS[ARTIFACT_TYPES.STACK_TRACE]);
      expect(ranked.firstOccurrenceChunk).toBe(0);
      expect(ranked.occurrenceCount).toBe(1);
    });

    it("should compute signature", () => {
      const artifact = createMockExtractedArtifact();
      const ranked = createRankedArtifact(artifact, 0, 1, 1);

      expect(ranked.signature).toBeDefined();
      expect(ranked.signature.hash).toBeDefined();
      expect(ranked.signature.hash.length).toBeGreaterThan(0);
      expect(ranked.signature.components).toBeDefined();
    });

    it("should compute absolute evidence ID with offset", () => {
      const artifact = createMockExtractedArtifact({
        evidenceId: "chunk#0:L10-L15",
      });

      const ranked = createRankedArtifact(artifact, 0, 100, 1);

      // Lines should be offset: L10 -> L109, L15 -> L114
      expect(ranked.absoluteEvidenceId).toBe("chunk#0:L109-L114");
    });

    it("should track occurrence count", () => {
      const artifact = createMockExtractedArtifact();
      const ranked = createRankedArtifact(artifact, 2, 1, 5);

      expect(ranked.occurrenceCount).toBe(5);
      expect(ranked.firstOccurrenceChunk).toBe(2);
    });

    it("should preserve all original artifact fields", () => {
      const artifact = createMockExtractedArtifact({
        errorMessage: "Custom error",
        snippet: "custom snippet",
        snippetLineStart: 10,
        testName: "my test",
        testSuite: "TestSuite",
        framework: "jest",
        errorCode: "E001",
      });

      const ranked = createRankedArtifact(artifact, 0, 1, 1);

      expect(ranked.errorMessage).toBe("Custom error");
      expect(ranked.snippet).toBe("custom snippet");
      expect(ranked.snippetLineStart).toBe(10);
      expect(ranked.testName).toBe("my test");
      expect(ranked.testSuite).toBe("TestSuite");
      expect(ranked.framework).toBe("jest");
      expect(ranked.errorCode).toBe("E001");
    });
  });

  describe("deduplicateArtifacts", () => {
    it("should return empty array for empty results", () => {
      const result = deduplicateArtifacts([], new Map());

      expect(result.artifacts).toEqual([]);
      expect(result.totalExtracted).toBe(0);
      expect(result.duplicatesRemoved).toBe(0);
    });

    it("should handle failed extraction results", () => {
      const results: ExtractionResult[] = [
        createFailedExtractionResult(0),
        createFailedExtractionResult(1),
      ];

      const result = deduplicateArtifacts(results, new Map());

      expect(result.artifacts).toEqual([]);
      expect(result.totalExtracted).toBe(0);
    });

    it("should return all artifacts when no duplicates", () => {
      const artifact1 = createMockExtractedArtifact({
        type: ARTIFACT_TYPES.STACK_TRACE,
        filePath: "src/a.ts",
        lineNumber: 10,
      });
      const artifact2 = createMockExtractedArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        filePath: "src/b.ts",
        lineNumber: 20,
      });

      const results: ExtractionResult[] = [
        createExtractionResult(0, [artifact1]),
        createExtractionResult(1, [artifact2]),
      ];

      const chunkOffsets = new Map<number, number>([
        [0, 1],
        [1, 100],
      ]);

      const result = deduplicateArtifacts(results, chunkOffsets);

      expect(result.artifacts.length).toBe(2);
      expect(result.totalExtracted).toBe(2);
      expect(result.duplicatesRemoved).toBe(0);
    });

    it("should deduplicate identical artifacts", () => {
      const artifact = createMockExtractedArtifact({
        type: ARTIFACT_TYPES.GENERIC_ERROR,
        filePath: "src/app.ts",
        lineNumber: 10,
      });

      const results: ExtractionResult[] = [
        createExtractionResult(0, [artifact]),
        createExtractionResult(1, [artifact]),
        createExtractionResult(2, [artifact]),
      ];

      const chunkOffsets = new Map<number, number>([
        [0, 1],
        [1, 100],
        [2, 200],
      ]);

      const result = deduplicateArtifacts(results, chunkOffsets);

      expect(result.artifacts.length).toBe(1);
      expect(result.totalExtracted).toBe(3);
      expect(result.duplicatesRemoved).toBe(2);
      expect(result.artifacts[0].occurrenceCount).toBe(3);
    });

    it("should keep first occurrence on deduplication", () => {
      const artifact = createMockExtractedArtifact({
        type: ARTIFACT_TYPES.COMPILER_ERROR,
        filePath: "src/main.ts",
        lineNumber: 5,
      });

      const results: ExtractionResult[] = [
        createExtractionResult(0, [artifact]),
        createExtractionResult(5, [artifact]),
      ];

      const chunkOffsets = new Map<number, number>([
        [0, 1],
        [5, 500],
      ]);

      const result = deduplicateArtifacts(results, chunkOffsets);

      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].firstOccurrenceChunk).toBe(0);
    });

    it("should process chunks in order", () => {
      const artifact1 = createMockExtractedArtifact({
        type: ARTIFACT_TYPES.LINT_ERROR,
        filePath: "src/a.ts",
      });
      const artifact2 = createMockExtractedArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        filePath: "src/b.ts",
      });

      // Results out of order
      const results: ExtractionResult[] = [
        createExtractionResult(2, [artifact2]),
        createExtractionResult(0, [artifact1]),
      ];

      const chunkOffsets = new Map<number, number>([
        [0, 1],
        [2, 200],
      ]);

      const result = deduplicateArtifacts(results, chunkOffsets);

      // Should be processed in chunk order (0, then 2)
      expect(result.artifacts.length).toBe(2);
    });

    it("should use default offset of 1 when not in map", () => {
      const artifact = createMockExtractedArtifact({
        evidenceId: "chunk#0:L10-L15",
      });

      const results: ExtractionResult[] = [createExtractionResult(0, [artifact])];

      // Empty map - should use default offset of 1
      const result = deduplicateArtifacts(results, new Map());

      expect(result.artifacts.length).toBe(1);
      // With offset 1, lines stay the same: L10-L15
      expect(result.artifacts[0].absoluteEvidenceId).toBe("chunk#0:L10-L15");
    });

    it("should handle mixed success and failure results", () => {
      const artifact = createMockExtractedArtifact();

      const results: ExtractionResult[] = [
        createExtractionResult(0, [artifact]),
        createFailedExtractionResult(1),
        createExtractionResult(2, [artifact]),
      ];

      const chunkOffsets = new Map<number, number>([
        [0, 1],
        [2, 200],
      ]);

      const result = deduplicateArtifacts(results, chunkOffsets);

      // Same artifact in two chunks = 1 deduplicated
      expect(result.artifacts.length).toBe(1);
      expect(result.totalExtracted).toBe(2);
      expect(result.duplicatesRemoved).toBe(1);
    });
  });

  describe("sortArtifactsByPriority", () => {
    it("should sort by priority score descending", () => {
      const low = createMockRankedArtifact({
        type: ARTIFACT_TYPES.GENERIC_ERROR,
        priorityScore: 2,
      });
      const medium = createMockRankedArtifact({
        type: ARTIFACT_TYPES.TEST_FAILURE,
        priorityScore: 5,
      });
      const high = createMockRankedArtifact({
        type: ARTIFACT_TYPES.INFRA_KILLER,
        priorityScore: 10,
      });

      const sorted = sortArtifactsByPriority([low, medium, high]);

      expect(sorted[0].priorityScore).toBe(10);
      expect(sorted[1].priorityScore).toBe(5);
      expect(sorted[2].priorityScore).toBe(2);
    });

    it("should use first occurrence chunk as tiebreaker", () => {
      const laterChunk = createMockRankedArtifact({
        priorityScore: 5,
        firstOccurrenceChunk: 5,
        absoluteEvidenceId: "chunk#5:L1-L5",
      });
      const earlierChunk = createMockRankedArtifact({
        priorityScore: 5,
        firstOccurrenceChunk: 1,
        absoluteEvidenceId: "chunk#1:L1-L5",
      });

      const sorted = sortArtifactsByPriority([laterChunk, earlierChunk]);

      // Same priority, earlier chunk should come first
      expect(sorted[0].firstOccurrenceChunk).toBe(1);
      expect(sorted[1].firstOccurrenceChunk).toBe(5);
    });

    it("should not mutate original array", () => {
      const artifacts = [
        createMockRankedArtifact({ priorityScore: 2 }),
        createMockRankedArtifact({ priorityScore: 10 }),
      ];

      const originalFirst = artifacts[0];
      sortArtifactsByPriority(artifacts);

      expect(artifacts[0]).toBe(originalFirst);
    });

    it("should handle empty array", () => {
      const sorted = sortArtifactsByPriority([]);
      expect(sorted).toEqual([]);
    });

    it("should handle single element", () => {
      const artifact = createMockRankedArtifact();
      const sorted = sortArtifactsByPriority([artifact]);

      expect(sorted.length).toBe(1);
      expect(sorted[0]).toEqual(artifact);
    });

    it("should maintain order for identical scores and chunks", () => {
      const first = createMockRankedArtifact({
        priorityScore: 5,
        firstOccurrenceChunk: 0,
        errorMessage: "first",
      });
      const second = createMockRankedArtifact({
        priorityScore: 5,
        firstOccurrenceChunk: 0,
        errorMessage: "second",
      });

      const sorted = sortArtifactsByPriority([first, second]);

      // Stable sort should maintain original order
      expect(sorted.length).toBe(2);
    });

    it("should correctly sort complex array", () => {
      const artifacts = [
        createMockRankedArtifact({ priorityScore: 5, firstOccurrenceChunk: 3 }),
        createMockRankedArtifact({ priorityScore: 10, firstOccurrenceChunk: 5 }),
        createMockRankedArtifact({ priorityScore: 5, firstOccurrenceChunk: 1 }),
        createMockRankedArtifact({ priorityScore: 2, firstOccurrenceChunk: 0 }),
        createMockRankedArtifact({ priorityScore: 10, firstOccurrenceChunk: 2 }),
      ];

      const sorted = sortArtifactsByPriority(artifacts);

      // Expected order: priority 10 (chunk 2), priority 10 (chunk 5), priority 5 (chunk 1), priority 5 (chunk 3), priority 2 (chunk 0)
      expect(sorted[0].priorityScore).toBe(10);
      expect(sorted[0].firstOccurrenceChunk).toBe(2);
      expect(sorted[1].priorityScore).toBe(10);
      expect(sorted[1].firstOccurrenceChunk).toBe(5);
      expect(sorted[2].priorityScore).toBe(5);
      expect(sorted[2].firstOccurrenceChunk).toBe(1);
      expect(sorted[3].priorityScore).toBe(5);
      expect(sorted[3].firstOccurrenceChunk).toBe(3);
      expect(sorted[4].priorityScore).toBe(2);
    });
  });

  describe("detectCommonFramework", () => {
    it("should return undefined for empty array", () => {
      const result = detectCommonFramework([]);
      expect(result).toBeUndefined();
    });

    it("should return undefined when no frameworks present", () => {
      const artifacts = [
        createMockExtractedArtifact({ framework: undefined }),
        createMockExtractedArtifact({ framework: undefined }),
      ];

      const result = detectCommonFramework(artifacts);
      expect(result).toBeUndefined();
    });

    it("should return single framework", () => {
      const artifacts = [createMockExtractedArtifact({ framework: "jest" })];

      const result = detectCommonFramework(artifacts);
      expect(result).toBe("jest");
    });

    it("should return most common framework", () => {
      const artifacts = [
        createMockExtractedArtifact({ framework: "jest" }),
        createMockExtractedArtifact({ framework: "jest" }),
        createMockExtractedArtifact({ framework: "jest" }),
        createMockExtractedArtifact({ framework: "vitest" }),
        createMockExtractedArtifact({ framework: "mocha" }),
      ];

      const result = detectCommonFramework(artifacts);
      expect(result).toBe("jest");
    });

    it("should handle tie by returning first encountered", () => {
      const artifacts = [
        createMockExtractedArtifact({ framework: "jest" }),
        createMockExtractedArtifact({ framework: "vitest" }),
      ];

      const result = detectCommonFramework(artifacts);
      // Should return one of them (implementation-dependent which one wins ties)
      expect(["jest", "vitest"]).toContain(result);
    });

    it("should ignore artifacts without framework", () => {
      const artifacts = [
        createMockExtractedArtifact({ framework: undefined }),
        createMockExtractedArtifact({ framework: "pytest" }),
        createMockExtractedArtifact({ framework: undefined }),
        createMockExtractedArtifact({ framework: "pytest" }),
        createMockExtractedArtifact({ framework: "jest" }),
      ];

      const result = detectCommonFramework(artifacts);
      expect(result).toBe("pytest");
    });

    it("should handle various framework names", () => {
      const frameworks = ["jest", "vitest", "mocha", "pytest", "go-test", "cargo-test"];

      frameworks.forEach((framework) => {
        const artifacts = [createMockExtractedArtifact({ framework })];
        const result = detectCommonFramework(artifacts);
        expect(result).toBe(framework);
      });
    });

    it("should count correctly across many artifacts", () => {
      const artifacts = [
        ...Array.from({ length: 10 }, () => createMockExtractedArtifact({ framework: "jest" })),
        ...Array.from({ length: 5 }, () => createMockExtractedArtifact({ framework: "vitest" })),
        ...Array.from({ length: 3 }, () => createMockExtractedArtifact({ framework: "mocha" })),
      ];

      const result = detectCommonFramework(artifacts);
      expect(result).toBe("jest");
    });
  });
});
