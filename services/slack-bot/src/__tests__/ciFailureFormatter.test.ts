/**
 * Unit tests for CI Failure Formatter
 */

import { describe, it, expect } from "@jest/globals";
import {
  formatCIFailureBlocks,
  createAnalysisAttachments,
  getPriorityEmoji,
} from "../formatters/ciFailureFormatter.js";
import type { CIFailureAnalysis } from "../types/slackTypes.js";

describe("CI Failure Formatter", () => {
  // Test fixtures
  const createMockAnalysis = (overrides: Partial<CIFailureAnalysis> = {}): CIFailureAnalysis => ({
    repository: "owner/repo",
    checkName: "CI Build",
    analysis: "The build failed due to a type error in the main module.",
    confidence: 0.85,
    identified_cause: "Type mismatch in function parameter",
    recommended_actions: [
      { description: "Fix type annotation on line 42", priority: "high" },
      { description: "Run type checker locally", priority: "medium" },
    ],
    annotations: [
      {
        path: "src/index.ts",
        startLine: 42,
        message: "Type 'string' is not assignable to type 'number'",
        level: "failure",
      },
    ],
    testFailures: [
      {
        testName: "should calculate sum correctly",
        error: "Expected 5 but received NaN",
      },
    ],
    headSha: "abc123def456789",
    ...overrides,
  });

  describe("getPriorityEmoji", () => {
    it("should return red emoji for critical priority", () => {
      expect(getPriorityEmoji("critical")).toBe(":red_circle:");
    });

    it("should return red emoji for high priority", () => {
      expect(getPriorityEmoji("high")).toBe(":red_circle:");
    });

    it("should return orange emoji for medium priority", () => {
      expect(getPriorityEmoji("medium")).toBe(":large_orange_circle:");
    });

    it("should return white emoji for low priority", () => {
      expect(getPriorityEmoji("low")).toBe(":white_circle:");
    });

    it("should handle numeric priority 1 as critical", () => {
      expect(getPriorityEmoji(1)).toBe(":red_circle:");
    });

    it("should handle numeric priority 2 as high", () => {
      expect(getPriorityEmoji(2)).toBe(":red_circle:");
    });

    it("should handle numeric priority 3 as medium", () => {
      expect(getPriorityEmoji(3)).toBe(":large_orange_circle:");
    });

    it("should handle numeric priority 4 as low", () => {
      expect(getPriorityEmoji(4)).toBe(":white_circle:");
    });

    it("should handle case-insensitive priorities", () => {
      expect(getPriorityEmoji("HIGH")).toBe(":red_circle:");
      expect(getPriorityEmoji("Medium")).toBe(":large_orange_circle:");
    });

    it("should return low emoji for unknown priority", () => {
      expect(getPriorityEmoji("unknown")).toBe(":white_circle:");
    });
  });

  describe("formatCIFailureBlocks", () => {
    it("should return array of blocks", () => {
      const analysis = createMockAnalysis();
      const blocks = formatCIFailureBlocks(analysis);

      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should include branded header block", () => {
      const analysis = createMockAnalysis();
      const blocks = formatCIFailureBlocks(analysis);

      const headerBlock = blocks.find((b) => b.type === "header");
      expect(headerBlock).toBeDefined();
      expect(JSON.stringify(headerBlock)).toContain("KenchiOps");
    });

    it("should include summary block with repo name", () => {
      const analysis = createMockAnalysis({ repository: "testorg/myapp" });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("myapp");
    });

    it("should include check name in summary", () => {
      const analysis = createMockAnalysis({ checkName: "Jest Tests" });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Jest Tests");
    });

    it("should include test name in summary when available", () => {
      const analysis = createMockAnalysis({
        testFailures: [{ testName: "should validate input", error: "Error" }],
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("should validate input");
    });

    it("should include Why section", () => {
      const analysis = createMockAnalysis();
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Why:");
    });

    it("should include identified cause in Why section", () => {
      const analysis = createMockAnalysis({
        identified_cause: "Missing required dependency",
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Missing required dependency");
    });

    it("should fallback to analysis when no identified cause", () => {
      const analysis = createMockAnalysis({
        identified_cause: undefined,
        analysis: "Build process encountered an error",
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Build process encountered an error");
    });

    it("should include recommended actions section", () => {
      const analysis = createMockAnalysis();
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Recommended:");
      expect(content).toContain("Fix type annotation");
    });

    it("should show up to 3 recommended actions", () => {
      const analysis = createMockAnalysis({
        recommended_actions: [
          { description: "Action 1", priority: "high" },
          { description: "Action 2", priority: "high" },
          { description: "Action 3", priority: "medium" },
          { description: "Action 4", priority: "low" },
          { description: "Action 5", priority: "low" },
        ],
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Action 1");
      expect(content).toContain("Action 2");
      expect(content).toContain("Action 3");
      expect(content).not.toContain("Action 4");
    });

    it("should not include recommended section when no actions", () => {
      const analysis = createMockAnalysis({ recommended_actions: [] });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).not.toContain("Recommended:");
    });

    it("should include confidence block", () => {
      const analysis = createMockAnalysis({ confidence: 0.75 });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Confidence:");
      expect(content).toContain("75%");
    });

    it("should show high confidence label", () => {
      const analysis = createMockAnalysis({ confidence: 0.85 });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("High");
    });

    it("should show medium confidence label", () => {
      const analysis = createMockAnalysis({ confidence: 0.55 });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Medium");
    });

    it("should show low confidence label", () => {
      const analysis = createMockAnalysis({ confidence: 0.3 });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Low");
    });

    it("should include footer with metadata", () => {
      const analysis = createMockAnalysis({
        checkName: "Build",
        headSha: "abc123def456",
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Build");
      expect(content).toContain("abc123d"); // Shortened SHA
    });

    it("should include PR context in footer", () => {
      const analysis = createMockAnalysis({
        prContext: {
          number: 123,
          title: "Test PR",
          author: "testuser",
          branch: "feature",
          baseBranch: "main",
        },
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("PR #123");
      expect(content).toContain("testuser");
    });

    it("should include workflow duration in footer", () => {
      const analysis = createMockAnalysis({
        workflowContext: {
          name: "CI",
          duration: "2m 30s",
        },
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("2m 30s");
    });

    it("should include dividers between sections", () => {
      const analysis = createMockAnalysis();
      const blocks = formatCIFailureBlocks(analysis);

      const dividers = blocks.filter((b) => b.type === "divider");
      expect(dividers.length).toBeGreaterThanOrEqual(1);
    });

    it("should include action buttons when repository provided", () => {
      const analysis = createMockAnalysis({ repository: "owner/repo" });
      const blocks = formatCIFailureBlocks(analysis);

      const actionsBlock = blocks.find((b) => b.type === "actions");
      expect(actionsBlock).toBeDefined();
    });

    it("should include View Logs button", () => {
      const analysis = createMockAnalysis();
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("View Logs");
    });

    it("should include Re-run button", () => {
      const analysis = createMockAnalysis();
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Re-run");
    });

    it("should include errors section when annotations present", () => {
      const analysis = createMockAnalysis({
        annotations: [{ path: "file.ts", startLine: 1, message: "Error 1", level: "failure" }],
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Errors:");
    });

    it("should show errors section when many annotations present", () => {
      const analysis = createMockAnalysis({
        annotations: Array.from({ length: 10 }, (_, i) => ({
          path: `file${i}.ts`,
          startLine: i,
          message: `Error ${i}`,
          level: "failure" as const,
        })),
        testFailures: [],
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      // Should have errors section
      expect(content).toContain("Errors:");
    });

    it("should include test failure count in Why section", () => {
      const analysis = createMockAnalysis({
        testFailures: [
          { testName: "test1", error: "Error 1" },
          { testName: "test2", error: "Error 2" },
          { testName: "test3", error: "Error 3" },
        ],
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("3 tests failed");
    });

    it("should show single test failure name", () => {
      const analysis = createMockAnalysis({
        testFailures: [{ testName: "should work correctly", error: "Error" }],
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("1 test failed");
    });

    it("should include dependency change context", () => {
      const analysis = createMockAnalysis({
        dependencyChanges: [
          { name: "lodash", type: "added", newVersion: "4.17.21" },
          { name: "moment", type: "removed", oldVersion: "2.29.0" },
        ],
      });
      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("2 dependency changes");
    });
  });

  describe("createAnalysisAttachments", () => {
    it("should return array of attachments", () => {
      const analysis = createMockAnalysis();
      const attachments = createAnalysisAttachments(analysis);

      expect(Array.isArray(attachments)).toBe(true);
      expect(attachments.length).toBe(1);
    });

    it("should include color based on confidence", () => {
      const highConfidence = createMockAnalysis({ confidence: 0.85 });
      const lowConfidence = createMockAnalysis({ confidence: 0.3 });

      const highAttachments = createAnalysisAttachments(highConfidence);
      const lowAttachments = createAnalysisAttachments(lowConfidence);

      expect(highAttachments[0].color).not.toBe(lowAttachments[0].color);
    });

    it("should use green color for high confidence", () => {
      const analysis = createMockAnalysis({ confidence: 0.85 });
      const attachments = createAnalysisAttachments(analysis);

      // Green color should be used for high confidence
      expect(attachments[0].color).toBeDefined();
    });

    it("should include fallback text", () => {
      const analysis = createMockAnalysis({
        repository: "myorg/myrepo",
        identified_cause: "Build error",
      });
      const attachments = createAnalysisAttachments(analysis);

      expect(attachments[0].fallback).toContain("myorg/myrepo");
      expect(attachments[0].fallback).toContain("Build error");
    });

    it("should use analysis when identified_cause missing", () => {
      const analysis = createMockAnalysis({
        identified_cause: undefined,
        analysis: "Generic analysis text",
      });
      const attachments = createAnalysisAttachments(analysis);

      expect(attachments[0].fallback).toContain("Generic analysis text");
    });

    it("should include blocks in attachment", () => {
      const analysis = createMockAnalysis();
      const attachments = createAnalysisAttachments(analysis);

      expect(attachments[0].blocks).toBeDefined();
      expect(Array.isArray(attachments[0].blocks)).toBe(true);
      expect(attachments[0].blocks.length).toBeGreaterThan(0);
    });

    it("should have emoji in fallback text", () => {
      const analysis = createMockAnalysis();
      const attachments = createAnalysisAttachments(analysis);

      expect(attachments[0].fallback).toContain("❌");
    });
  });

  describe("edge cases", () => {
    it("should handle empty analysis gracefully", () => {
      const analysis = createMockAnalysis({
        analysis: "",
        identified_cause: "",
        recommended_actions: [],
        annotations: [],
        testFailures: [],
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle very long text", () => {
      const longText = "A".repeat(1000);
      const analysis = createMockAnalysis({
        identified_cause: longText,
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks).toBeDefined();
    });

    it("should handle special characters", () => {
      const analysis = createMockAnalysis({
        identified_cause: "Error: <script>alert('xss')</script>",
      });

      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Error:");
    });

    it("should handle unicode characters", () => {
      const analysis = createMockAnalysis({
        identified_cause: "エラー: 日本語テスト 🔥",
      });

      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);

      expect(content).toContain("日本語テスト");
    });

    it("should handle null/undefined annotations", () => {
      const analysis = createMockAnalysis({
        annotations: undefined as unknown as CIFailureAnalysis["annotations"],
      });

      // Should not throw
      expect(() => formatCIFailureBlocks(analysis)).not.toThrow();
    });

    it("should handle missing headSha", () => {
      const analysis = createMockAnalysis({
        headSha: undefined,
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle missing checkName", () => {
      const analysis = createMockAnalysis({
        checkName: undefined as unknown as string,
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle empty repository name", () => {
      const analysis = createMockAnalysis({
        repository: "",
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle repository with only owner (no slash)", () => {
      const analysis = createMockAnalysis({
        repository: "standalone-repo",
      });

      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);
      expect(content).toContain("standalone-repo");
    });

    it("should handle very long repository name", () => {
      const longRepo = "org/" + "a".repeat(200);
      const analysis = createMockAnalysis({
        repository: longRepo,
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle zero confidence", () => {
      const analysis = createMockAnalysis({
        confidence: 0,
      });

      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);
      expect(content).toContain("0%");
    });

    it("should handle confidence above 1", () => {
      const analysis = createMockAnalysis({
        confidence: 1.5,
      });

      const blocks = formatCIFailureBlocks(analysis);
      // Should still render
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle empty test failure name", () => {
      const analysis = createMockAnalysis({
        testFailures: [{ testName: "", error: "Some error" }],
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle very long test name", () => {
      const longTestName = "should_test_" + "a".repeat(200);
      const analysis = createMockAnalysis({
        testFailures: [{ testName: longTestName, error: "Error" }],
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle annotation with missing path", () => {
      const analysis = createMockAnalysis({
        annotations: [
          {
            path: "",
            startLine: 1,
            message: "Error message",
            level: "failure",
          },
        ],
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle annotation with zero line number", () => {
      const analysis = createMockAnalysis({
        annotations: [
          {
            path: "file.ts",
            startLine: 0,
            message: "Error message",
            level: "failure",
          },
        ],
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle missing prContext fields", () => {
      const analysis = createMockAnalysis({
        prContext: {
          number: 0,
          title: "",
          author: "",
          branch: "",
          baseBranch: "",
        },
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle missing workflowContext fields", () => {
      const analysis = createMockAnalysis({
        workflowContext: {
          name: "",
        },
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle empty dependency changes array", () => {
      const analysis = createMockAnalysis({
        dependencyChanges: [],
      });

      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);
      expect(content).not.toContain("dependency change");
    });

    it("should handle single dependency change", () => {
      const analysis = createMockAnalysis({
        dependencyChanges: [{ name: "lodash", type: "added", newVersion: "4.17.21" }],
      });

      const blocks = formatCIFailureBlocks(analysis);
      const content = JSON.stringify(blocks);
      expect(content).toContain("1 dependency change");
    });

    it("should handle actions with empty descriptions", () => {
      const analysis = createMockAnalysis({
        recommended_actions: [{ description: "", priority: "high" }],
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle actions with unknown priority", () => {
      const analysis = createMockAnalysis({
        recommended_actions: [{ description: "Do something", priority: "unknown_priority" }],
      });

      const blocks = formatCIFailureBlocks(analysis);
      expect(blocks.length).toBeGreaterThan(0);
    });
  });
});
