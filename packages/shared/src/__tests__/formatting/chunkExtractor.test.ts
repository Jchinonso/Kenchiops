/**
 * Unit tests for formatting/chunkExtractor.ts (Stage 2)
 *
 * Tests the artifact extraction module that processes log chunks
 * using LLM to extract structured error information.
 */
import { describe, it, expect } from "@jest/globals";
import {
  buildChunkExtractorSystemPrompt,
  buildChunkExtractorPrompt,
  parseExtractionResponse,
  normalizeExtractionOptions,
  extractFromChunk,
  extractFromAllChunks,
  type ExtractorFunction,
} from "../../formatting/extraction/index.js";
import type { ChunkResult } from "../../formatting/chunking/index.js";
import {
  EXTRACTION_DEFAULTS,
  ARTIFACT_TYPES,
  ARTIFACT_SEVERITY,
  ARTIFACT_CONFIDENCE,
  BOUNDARY_TYPES,
} from "../../constants/index.js";

describe("Chunk Extractor (Stage 2)", () => {
  // Helper to create a mock chunk
  const createMockChunk = (
    chunkId: number,
    content: string,
    lineOffset: number = 1
  ): ChunkResult => ({
    chunkId,
    content,
    lineOffset,
    lineCount: content.split("\n").length,
    estimatedTokens: Math.ceil(content.length / 3.5),
    protectedZones: [],
    boundaryType: BOUNDARY_TYPES.NATURAL,
  });

  describe("buildChunkExtractorSystemPrompt", () => {
    it("should return a non-empty system prompt", () => {
      const prompt = buildChunkExtractorSystemPrompt();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it("should include extraction rules", () => {
      const prompt = buildChunkExtractorSystemPrompt();
      expect(prompt).toContain("RULES");
      expect(prompt).toContain("JSON");
    });

    it("should mention no speculation", () => {
      const prompt = buildChunkExtractorSystemPrompt();
      expect(prompt.toLowerCase()).toContain("no speculation");
    });
  });

  describe("buildChunkExtractorPrompt", () => {
    it("should include chunk ID", () => {
      const chunk = createMockChunk(5, "Error: test");
      const prompt = buildChunkExtractorPrompt(chunk);
      expect(prompt).toContain("Chunk ID: 5");
    });

    it("should include line offset", () => {
      const chunk = createMockChunk(0, "Error: test", 100);
      const prompt = buildChunkExtractorPrompt(chunk);
      expect(prompt).toContain("Line offset in original log: 100");
    });

    it("should include chunk content", () => {
      const content = "TypeError: Cannot read property 'foo' of undefined";
      const chunk = createMockChunk(0, content);
      const prompt = buildChunkExtractorPrompt(chunk);
      expect(prompt).toContain(content);
    });

    it("should include framework hint when provided", () => {
      const chunk = createMockChunk(0, "test content");
      const prompt = buildChunkExtractorPrompt(chunk, "jest");
      expect(prompt).toContain("Detected framework: jest");
    });

    it("should include CI platform hint when provided", () => {
      const chunk = createMockChunk(0, "test content");
      const prompt = buildChunkExtractorPrompt(chunk, undefined, "github_actions");
      expect(prompt).toContain("CI platform: github_actions");
    });

    it("should not include hints section when no hints provided", () => {
      const chunk = createMockChunk(0, "test content");
      const prompt = buildChunkExtractorPrompt(chunk);
      expect(prompt).not.toContain("Hints:");
    });

    it("should list all artifact types", () => {
      const chunk = createMockChunk(0, "test");
      const prompt = buildChunkExtractorPrompt(chunk);
      expect(prompt).toContain("infra_killer");
      expect(prompt).toContain("stack_trace");
      expect(prompt).toContain("test_failure");
      expect(prompt).toContain("compiler_error");
    });
  });

  describe("parseExtractionResponse", () => {
    it("should parse valid JSON array response", () => {
      const response = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L3",
          type: "stack_trace",
          severity: "error",
          error_message: "TypeError: foo is undefined",
          snippet: "TypeError: foo is undefined\n    at bar",
          snippet_line_start: 1,
          confidence: "high",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe(ARTIFACT_TYPES.STACK_TRACE);
      expect(artifacts[0].severity).toBe(ARTIFACT_SEVERITY.ERROR);
      expect(artifacts[0].confidence).toBe(ARTIFACT_CONFIDENCE.HIGH);
    });

    it("should handle markdown code blocks", () => {
      const response = `\`\`\`json
[{
  "evidence_id": "chunk#0:L1-L2",
  "type": "generic_error",
  "severity": "error",
  "error_message": "Something failed",
  "snippet": "Error: Something failed",
  "snippet_line_start": 1,
  "confidence": "medium"
}]
\`\`\``;

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });

    it("should return empty array for empty response", () => {
      const artifacts = parseExtractionResponse("[]", 0);
      expect(artifacts).toEqual([]);
    });

    it("should return empty array for invalid JSON", () => {
      const artifacts = parseExtractionResponse("not valid json", 0);
      expect(artifacts).toEqual([]);
    });

    it("should filter out invalid artifacts", () => {
      const response = JSON.stringify([
        {
          // Missing required fields
          type: "stack_trace",
        },
        {
          evidence_id: "chunk#0:L1-L2",
          type: "stack_trace",
          severity: "error",
          error_message: "Valid error",
          snippet: "Error",
          snippet_line_start: 1,
          confidence: "high",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });

    it("should respect maxArtifacts limit", () => {
      const manyArtifacts = Array.from({ length: 30 }, (_, index) => ({
        evidence_id: `chunk#0:L${index}-L${index + 1}`,
        type: "generic_error",
        severity: "error",
        error_message: `Error ${index}`,
        snippet: `Error ${index}`,
        snippet_line_start: index + 1,
        confidence: "low",
      }));

      const artifacts = parseExtractionResponse(JSON.stringify(manyArtifacts), 0, 10);
      expect(artifacts.length).toBe(10);
    });

    it("should validate artifact types", () => {
      const response = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L2",
          type: "invalid_type",
          severity: "error",
          error_message: "Error",
          snippet: "Error",
          snippet_line_start: 1,
          confidence: "high",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(0);
    });

    it("should default invalid severity to error", () => {
      const response = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L2",
          type: "generic_error",
          severity: "invalid",
          error_message: "Error",
          snippet: "Error",
          snippet_line_start: 1,
          confidence: "high",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts[0].severity).toBe(ARTIFACT_SEVERITY.ERROR);
    });

    it("should default invalid confidence to medium", () => {
      const response = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L2",
          type: "generic_error",
          severity: "error",
          error_message: "Error",
          snippet: "Error",
          snippet_line_start: 1,
          confidence: "invalid",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts[0].confidence).toBe(ARTIFACT_CONFIDENCE.MEDIUM);
    });

    it("should extract optional fields when present", () => {
      const response = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L2",
          type: "test_failure",
          severity: "error",
          error_message: "Test failed",
          snippet: "expect(true).toBe(false)",
          snippet_line_start: 1,
          confidence: "high",
          file_path: "src/app.test.ts",
          line_number: 42,
          column: 5,
          test_name: "should work",
          test_suite: "App",
          expected: "true",
          actual: "false",
          framework: "jest",
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts[0].filePath).toBe("src/app.test.ts");
      expect(artifacts[0].lineNumber).toBe(42);
      expect(artifacts[0].column).toBe(5);
      expect(artifacts[0].testName).toBe("should work");
      expect(artifacts[0].testSuite).toBe("App");
      expect(artifacts[0].expected).toBe("true");
      expect(artifacts[0].actual).toBe("false");
      expect(artifacts[0].framework).toBe("jest");
    });

    it("should handle null expected/actual values", () => {
      const response = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L2",
          type: "test_failure",
          severity: "error",
          error_message: "Test failed",
          snippet: "test",
          snippet_line_start: 1,
          confidence: "high",
          expected: null,
          actual: null,
        },
      ]);

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts[0].expected).toBeNull();
      expect(artifacts[0].actual).toBeNull();
    });

    it("should extract JSON from response with surrounding text", () => {
      const response = `Here are the artifacts I found:
[{
  "evidence_id": "chunk#0:L1-L2",
  "type": "generic_error",
  "severity": "error",
  "error_message": "Error found",
  "snippet": "Error",
  "snippet_line_start": 1,
  "confidence": "medium"
}]
That's all I found.`;

      const artifacts = parseExtractionResponse(response, 0);
      expect(artifacts.length).toBe(1);
    });
  });

  describe("normalizeExtractionOptions", () => {
    it("should apply defaults for empty options", () => {
      const normalized = normalizeExtractionOptions({});
      expect(normalized.concurrency).toBe(EXTRACTION_DEFAULTS.CONCURRENCY);
      expect(normalized.timeoutMs).toBe(EXTRACTION_DEFAULTS.TIMEOUT_MS);
      expect(normalized.retryDelayMs).toBe(EXTRACTION_DEFAULTS.RETRY_DELAY_MS);
      expect(normalized.maxArtifactsPerChunk).toBe(EXTRACTION_DEFAULTS.MAX_ARTIFACTS_PER_CHUNK);
      expect(normalized.chunkFailureThreshold).toBe(EXTRACTION_DEFAULTS.CHUNK_FAILURE_THRESHOLD);
    });

    it("should preserve provided options", () => {
      const options = {
        concurrency: 10,
        timeoutMs: 5000,
        retryDelayMs: 2000,
        maxArtifactsPerChunk: 15,
        chunkFailureThreshold: 0.3,
      };
      const normalized = normalizeExtractionOptions(options);
      expect(normalized.concurrency).toBe(10);
      expect(normalized.timeoutMs).toBe(5000);
    });

    it("should preserve optional hints", () => {
      const normalized = normalizeExtractionOptions({
        frameworkHint: "pytest",
        ciPlatformHint: "gitlab_ci",
      });
      expect(normalized.frameworkHint).toBe("pytest");
      expect(normalized.ciPlatformHint).toBe("gitlab_ci");
    });
  });

  describe("extractFromChunk", () => {
    it("should call extractor with correct prompts", async () => {
      const chunk = createMockChunk(0, "Error: test failure");
      let capturedSystemPrompt = "";
      let capturedUserPrompt = "";

      const mockExtractor: ExtractorFunction = async (system, user) => {
        capturedSystemPrompt = system;
        capturedUserPrompt = user;
        return "[]";
      };

      await extractFromChunk(chunk, mockExtractor, normalizeExtractionOptions({}));

      expect(capturedSystemPrompt).toContain("CI log artifact extractor");
      expect(capturedUserPrompt).toContain("Chunk ID: 0");
      expect(capturedUserPrompt).toContain("Error: test failure");
    });

    it("should return successful result with artifacts", async () => {
      const chunk = createMockChunk(0, "Error: test");
      const mockResponse = JSON.stringify([
        {
          evidence_id: "chunk#0:L1-L1",
          type: "generic_error",
          severity: "error",
          error_message: "Error: test",
          snippet: "Error: test",
          snippet_line_start: 1,
          confidence: "high",
        },
      ]);

      const mockExtractor: ExtractorFunction = async () => mockResponse;

      const result = await extractFromChunk(chunk, mockExtractor, normalizeExtractionOptions({}));

      expect(result.success).toBe(true);
      expect(result.chunkId).toBe(0);
      expect(result.artifacts.length).toBe(1);
      expect(result.extractionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should retry on failure and return failed result after retries exhausted", async () => {
      const chunk = createMockChunk(0, "Error: test");
      let callCount = 0;

      const mockExtractor: ExtractorFunction = async () => {
        callCount++;
        throw new Error("Network error");
      };

      const result = await extractFromChunk(
        chunk,
        mockExtractor,
        normalizeExtractionOptions({ retryDelayMs: 10 })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
      expect(callCount).toBe(2); // Initial + 1 retry
    });

    it("should succeed on retry after initial failure", async () => {
      const chunk = createMockChunk(0, "Error: test");
      let callCount = 0;

      const mockExtractor: ExtractorFunction = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary error");
        }
        return "[]";
      };

      const result = await extractFromChunk(
        chunk,
        mockExtractor,
        normalizeExtractionOptions({ retryDelayMs: 10 })
      );

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });
  });

  describe("extractFromAllChunks", () => {
    it("should process all chunks", async () => {
      const chunks = [
        createMockChunk(0, "Error 1"),
        createMockChunk(1, "Error 2"),
        createMockChunk(2, "Error 3"),
      ];

      const mockExtractor: ExtractorFunction = async () => "[]";

      const result = await extractFromAllChunks(chunks, mockExtractor, {
        concurrency: 2,
      });

      expect(result.totalChunks).toBe(3);
      expect(result.results.length).toBe(3);
      expect(result.successfulChunks).toBe(3);
      expect(result.failedChunks).toBe(0);
    });

    it("should handle mixed success and failure", async () => {
      const chunks = [
        createMockChunk(0, "Error 1"),
        createMockChunk(1, "Error 2"),
        createMockChunk(2, "Error 3"),
      ];

      const mockExtractor: ExtractorFunction = async (_, user) => {
        if (user.includes("Chunk ID: 1")) {
          throw new Error("Failed");
        }
        return "[]";
      };

      const result = await extractFromAllChunks(chunks, mockExtractor, {
        concurrency: 1,
        retryDelayMs: 10,
        chunkFailureThreshold: 0.9, // High threshold to not abort
      });

      expect(result.successfulChunks).toBe(2);
      expect(result.failedChunks).toBe(1);
    });

    it("should abort when failure threshold exceeded", async () => {
      const chunks = Array.from({ length: 10 }, (_, index) =>
        createMockChunk(index, `Error ${index}`)
      );

      let callCount = 0;
      const mockExtractor: ExtractorFunction = async () => {
        callCount++;
        throw new Error("All fail");
      };

      const result = await extractFromAllChunks(chunks, mockExtractor, {
        concurrency: 2,
        retryDelayMs: 10,
        chunkFailureThreshold: 0.5,
      });

      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain("failure rate");
      // Should have stopped before processing all chunks
      expect(callCount).toBeLessThan(20); // Less than 10 chunks * 2 retries each
    });

    it("should count total artifacts", async () => {
      const chunks = [createMockChunk(0, "Error 1"), createMockChunk(1, "Error 2")];

      const mockExtractor: ExtractorFunction = async (_, user) => {
        const artifacts = [
          {
            evidence_id: user.includes("Chunk ID: 0") ? "chunk#0:L1-L1" : "chunk#1:L1-L1",
            type: "generic_error",
            severity: "error",
            error_message: "Error",
            snippet: "Error",
            snippet_line_start: 1,
            confidence: "high",
          },
        ];
        return JSON.stringify(artifacts);
      };

      const result = await extractFromAllChunks(chunks, mockExtractor);

      expect(result.totalArtifacts).toBe(2);
    });

    it("should handle empty chunks array", async () => {
      const mockExtractor: ExtractorFunction = async () => "[]";
      const result = await extractFromAllChunks([], mockExtractor);

      expect(result.totalChunks).toBe(0);
      expect(result.results.length).toBe(0);
      expect(result.aborted).toBe(false);
    });
  });
});
