/**
 * Unit tests for formatting/logChunking.ts (Stage 1)
 *
 * Tests the smart log chunking module that splits CI logs into
 * chunks while respecting protected zones and natural boundaries.
 */
import { describe, it, expect } from "@jest/globals";
import {
  estimateTokens,
  estimateTokensForLines,
  detectCIPlatform,
  detectProtectedZones,
  findNaturalBoundaries,
  chunkLog,
  normalizeChunkingOptions,
} from "../../formatting/chunking/index.js";
import {
  CI_PLATFORMS,
  CHUNKING_DEFAULTS,
  PROTECTED_ZONE_TYPES,
  BOUNDARY_TYPES,
} from "../../constants/index.js";

describe("Log Chunking (Stage 1)", () => {
  describe("estimateTokens", () => {
    it("should estimate tokens based on character count", () => {
      const text = "Hello world"; // 11 chars
      const tokens = estimateTokens(text);
      // ~3.5 chars per token = ~3.14 tokens, ceil = 4
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(5);
    });

    it("should return 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("should handle long text", () => {
      const text = "a".repeat(3500); // ~1000 tokens
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThanOrEqual(900);
      expect(tokens).toBeLessThanOrEqual(1100);
    });
  });

  describe("estimateTokensForLines", () => {
    it("should estimate tokens for array of lines", () => {
      const lines = ["line one", "line two", "line three"];
      const tokens = estimateTokensForLines(lines);
      expect(tokens).toBeGreaterThan(0);
    });

    it("should handle empty array", () => {
      expect(estimateTokensForLines([])).toBe(0);
    });
  });

  describe("detectCIPlatform", () => {
    it("should detect GitHub Actions", () => {
      const content = `##[group]Run npm test
npm test
##[endgroup]`;
      expect(detectCIPlatform(content)).toBe(CI_PLATFORMS.GITHUB_ACTIONS);
    });

    it("should detect GitLab CI", () => {
      const content = `section_start:1234567890:build
Building project...
section_end:1234567890:build`;
      expect(detectCIPlatform(content)).toBe(CI_PLATFORMS.GITLAB_CI);
    });

    it("should detect Jenkins", () => {
      const content = `[Pipeline] Start of Pipeline
[INFO] Building project 1.0.0`;
      expect(detectCIPlatform(content)).toBe(CI_PLATFORMS.JENKINS);
    });

    it("should detect CircleCI", () => {
      const content = `Spin up environment
circleci/node:14`;
      expect(detectCIPlatform(content)).toBe(CI_PLATFORMS.CIRCLECI);
    });

    it("should detect Azure DevOps", () => {
      const content = `##vso[task.logissue type=error]Build failed
azure-pipelines.yml`;
      expect(detectCIPlatform(content)).toBe(CI_PLATFORMS.AZURE_DEVOPS);
    });

    it("should return unknown for unrecognized content", () => {
      const content = "Some random log content without CI markers";
      expect(detectCIPlatform(content)).toBe(CI_PLATFORMS.UNKNOWN);
    });
  });

  describe("detectProtectedZones", () => {
    it("should detect JavaScript stack traces", () => {
      const lines = [
        "Error: Something went wrong",
        "    at Object.<anonymous> (/app/src/index.js:10:5)",
        "    at Module._compile (internal/modules/cjs/loader.js:1085:14)",
        "    at Module.load (internal/modules/cjs/loader.js:928:32)",
        "Done.",
      ];
      const zones = detectProtectedZones(lines);
      expect(zones.length).toBeGreaterThanOrEqual(1);
      expect(zones[0].type).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
    });

    it("should detect Python tracebacks", () => {
      const lines = [
        "Traceback (most recent call last):",
        '  File "/app/main.py", line 10, in <module>',
        "    raise ValueError('test')",
        "ValueError: test",
        "",
        "Process finished.",
      ];
      const zones = detectProtectedZones(lines);
      expect(zones.length).toBeGreaterThanOrEqual(1);
      expect(zones[0].type).toBe(PROTECTED_ZONE_TYPES.STACK_TRACE);
    });

    it("should detect test failure blocks", () => {
      const lines = [
        "Running tests...",
        "FAIL src/app.test.ts",
        "  ✕ should work correctly",
        "    Expected: true",
        "    Received: false",
        "",
        "Test Suites: 1 failed",
      ];
      const zones = detectProtectedZones(lines);
      expect(zones.some((zone) => zone.type === PROTECTED_ZONE_TYPES.TEST_OUTPUT)).toBe(true);
    });

    it("should detect compiler errors", () => {
      const lines = [
        "Compiling...",
        "src/app.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.",
        "  10 |   const x: number = 'hello';",
        "     |         ^",
        "Found 1 error.",
      ];
      const zones = detectProtectedZones(lines);
      expect(zones.some((zone) => zone.type === PROTECTED_ZONE_TYPES.COMPILER_ERROR)).toBe(true);
    });

    it("should detect CI group markers", () => {
      const lines = [
        "##[group]Installing dependencies",
        "npm install",
        "added 100 packages",
        "##[endgroup]",
        "Done.",
      ];
      const zones = detectProtectedZones(lines);
      expect(zones.some((zone) => zone.type === PROTECTED_ZONE_TYPES.CI_GROUP)).toBe(true);
    });

    it("should handle empty lines array", () => {
      const zones = detectProtectedZones([]);
      expect(zones).toEqual([]);
    });

    it("should handle content with no protected zones", () => {
      const lines = ["Line 1", "Line 2", "Line 3"];
      const zones = detectProtectedZones(lines);
      expect(zones).toEqual([]);
    });
  });

  describe("findNaturalBoundaries", () => {
    it("should find GitHub Actions boundaries", () => {
      const lines = [
        "##[group]Step 1",
        "Running step 1",
        "##[endgroup]",
        "##[group]Step 2",
        "Running step 2",
      ];
      const boundaries = findNaturalBoundaries(lines, CI_PLATFORMS.GITHUB_ACTIONS);
      expect(boundaries.length).toBeGreaterThan(0);
    });

    it("should find blank line boundaries", () => {
      const lines = ["Content block 1", "", "Content block 2", "", "Content block 3"];
      const boundaries = findNaturalBoundaries(lines, CI_PLATFORMS.UNKNOWN);
      // Blank lines followed by content are boundaries
      expect(boundaries).toContain(2); // Line after first blank
    });

    it("should find separator line boundaries", () => {
      const lines = ["Header", "========", "Content", "--------", "More content"];
      const boundaries = findNaturalBoundaries(lines, CI_PLATFORMS.UNKNOWN);
      expect(boundaries.length).toBeGreaterThan(0);
    });
  });

  describe("chunkLog", () => {
    it("should skip chunking for small logs", () => {
      const content = "Small log content\nLine 2\nLine 3";
      const result = chunkLog(content, { smallLogThreshold: 10000 });
      expect(result.skippedChunking).toBe(true);
      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].content).toBe(content);
    });

    it("should chunk large logs", () => {
      // Create a log large enough to require chunking
      const lines = Array.from({ length: 500 }, (_, index) => `Log line ${index + 1}`);
      const content = lines.join("\n");

      const result = chunkLog(content, {
        targetTokens: 500,
        maxTokens: 600,
        smallLogThreshold: 100,
      });

      expect(result.skippedChunking).toBe(false);
      expect(result.chunks.length).toBeGreaterThan(1);
    });

    it("should preserve total line count", () => {
      const lines = Array.from({ length: 100 }, (_, index) => `Line ${index + 1}`);
      const content = lines.join("\n");

      const result = chunkLog(content, { smallLogThreshold: 10 });
      expect(result.totalLines).toBe(100);
    });

    it("should set correct line offsets", () => {
      const lines = Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`);
      const content = lines.join("\n");

      const result = chunkLog(content, {
        targetTokens: 200,
        maxTokens: 300,
        smallLogThreshold: 10,
        overlapLines: 0,
      });

      // First chunk should start at line 1
      expect(result.chunks[0].lineOffset).toBe(1);

      // Subsequent chunks should have increasing offsets
      result.chunks.forEach((chunk, index) => {
        if (index > 0) {
          expect(chunk.lineOffset).toBeGreaterThan(result.chunks[index - 1].lineOffset);
        }
      });
    });

    it("should detect CI platform", () => {
      const content = `##[group]Build
npm run build
##[endgroup]`;
      const result = chunkLog(content);
      expect(result.detectedPlatform).toBe(CI_PLATFORMS.GITHUB_ACTIONS);
    });

    it("should respect maxChunks limit", () => {
      const lines = Array.from({ length: 1000 }, (_, index) => `Line ${index + 1}`);
      const content = lines.join("\n");

      const result = chunkLog(content, {
        targetTokens: 50,
        maxTokens: 100,
        smallLogThreshold: 10,
        maxChunks: 5,
      });

      expect(result.chunks.length).toBeLessThanOrEqual(5);
    });

    it("should assign sequential chunk IDs", () => {
      const lines = Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`);
      const content = lines.join("\n");

      const result = chunkLog(content, {
        targetTokens: 100,
        smallLogThreshold: 10,
      });

      result.chunks.forEach((chunk, index) => {
        expect(chunk.chunkId).toBe(index);
      });
    });

    it("should include boundary type for each chunk", () => {
      const lines = Array.from({ length: 100 }, (_, index) => `Line ${index + 1}`);
      const content = lines.join("\n");

      const result = chunkLog(content, { smallLogThreshold: 10 });

      result.chunks.forEach((chunk) => {
        expect([BOUNDARY_TYPES.NATURAL, BOUNDARY_TYPES.FORCED]).toContain(chunk.boundaryType);
      });
    });
  });

  describe("normalizeChunkingOptions", () => {
    it("should apply defaults for empty options", () => {
      const normalized = normalizeChunkingOptions({});
      expect(normalized.targetTokens).toBe(CHUNKING_DEFAULTS.TARGET_TOKENS);
      expect(normalized.maxTokens).toBe(CHUNKING_DEFAULTS.MAX_TOKENS);
      expect(normalized.overlapLines).toBe(CHUNKING_DEFAULTS.OVERLAP_LINES);
      expect(normalized.maxChunks).toBe(CHUNKING_DEFAULTS.MAX_CHUNKS);
      expect(normalized.smallLogThreshold).toBe(CHUNKING_DEFAULTS.SMALL_LOG_THRESHOLD);
    });

    it("should preserve provided options", () => {
      const options = {
        targetTokens: 1000,
        maxTokens: 2000,
        overlapLines: 20,
        maxChunks: 50,
        smallLogThreshold: 500,
      };
      const normalized = normalizeChunkingOptions(options);
      expect(normalized).toEqual(options);
    });

    it("should mix defaults with provided options", () => {
      const normalized = normalizeChunkingOptions({ targetTokens: 1500 });
      expect(normalized.targetTokens).toBe(1500);
      expect(normalized.maxTokens).toBe(CHUNKING_DEFAULTS.MAX_TOKENS);
    });
  });
});
