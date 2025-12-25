/**
 * Unit tests for Comment Formatter
 */

import { describe, it, expect } from "@jest/globals";
import {
  formatGitHubComment,
  formatAllClearComment,
  type AnalysisData,
} from "../formatters/commentFormatter.js";

describe("Comment Formatter", () => {
  // Test fixtures
  const createMockAnalysis = (overrides: Partial<AnalysisData> = {}): AnalysisData => ({
    summary: "Build failed due to type errors",
    analysis: "The CI pipeline failed because of TypeScript type mismatches in the main module.",
    identified_cause: "Type mismatch in function parameter",
    confidence: 0.85,
    recommended_actions: [
      { description: "Fix type annotation on line 42", priority: "high" },
      { description: "Run type checker locally before pushing", priority: "medium" },
      { description: "Update TypeScript to latest version", priority: "low" },
    ],
    repository: "owner/repo",
    checkName: "CI Build",
    headSha: "abc123def456789012345678901234567890abcd",
    annotations: [
      {
        path: "src/index.ts",
        startLine: 42,
        message: "Type 'string' is not assignable to type 'number'",
        level: "failure",
      },
      {
        path: "src/utils.ts",
        startLine: 15,
        message: "Property 'foo' does not exist on type 'Bar'",
        level: "warning",
      },
    ],
    testFailures: [
      {
        testName: "should calculate sum correctly",
        error: "Expected 5 but received NaN",
        file: "src/__tests__/math.test.ts",
      },
      {
        testName: "should handle edge cases",
        error: "TypeError: Cannot read property 'length' of undefined",
        file: "src/__tests__/utils.test.ts",
      },
    ],
    prContext: {
      number: 123,
      title: "Add new feature",
      author: "testuser",
      branch: "feature-branch",
    },
    workflowContext: {
      name: "CI Pipeline",
      duration: "2m 30s",
    },
    dependencyChanges: [
      {
        type: "added",
        name: "lodash",
        newVersion: "4.17.21",
      },
      {
        type: "updated",
        name: "react",
        oldVersion: "18.0.0",
        newVersion: "18.2.0",
      },
      {
        type: "removed",
        name: "moment",
        oldVersion: "2.29.0",
      },
    ],
    ...overrides,
  });

  describe("formatGitHubComment", () => {
    it("should return string content", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(typeof comment).toBe("string");
      expect(comment.length).toBeGreaterThan(0);
    });

    it("should include header section", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("## ");
      expect(comment).toContain("KenchiOps");
      expect(comment).toContain("CI Failure Analysis");
    });

    it("should include summary line with repo name", () => {
      const analysis = createMockAnalysis({ repository: "testorg/myapp" });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("myapp");
    });

    it("should include check name in summary", () => {
      const analysis = createMockAnalysis({ checkName: "Jest Tests" });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("Jest Tests");
    });

    it("should include test name in summary when available", () => {
      const analysis = createMockAnalysis({
        testFailures: [{ testName: "should validate input", error: "Error" }],
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("should validate input");
    });

    it("should truncate long test names in summary", () => {
      const longTestName = "A".repeat(150);
      const analysis = createMockAnalysis({
        testFailures: [{ testName: longTestName, error: "Error" }],
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain(longTestName);
      expect(comment).toContain("...");
    });

    it("should include Evidence section", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("### ");
      expect(comment).toContain("Evidence");
    });

    it("should include identified cause as quote", () => {
      const analysis = createMockAnalysis({
        identified_cause: "Missing required dependency",
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("> Missing required dependency");
    });

    it("should fallback to analysis first sentence when no identified cause", () => {
      const analysis = createMockAnalysis({
        identified_cause: undefined,
        analysis: "This is the first sentence. This is the second sentence.",
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("> This is the first sentence");
      expect(comment).not.toContain("second sentence");
    });

    it("should include test failures subsection", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("**Test Failures:**");
      expect(comment).toContain("2 tests failed");
      expect(comment).toContain("should calculate sum correctly");
    });

    it("should pluralize test count correctly", () => {
      const singleTest = createMockAnalysis({
        testFailures: [{ testName: "test1", error: "Error" }],
      });
      const multipleTests = createMockAnalysis({
        testFailures: [
          { testName: "test1", error: "Error" },
          { testName: "test2", error: "Error" },
        ],
      });

      const singleComment = formatGitHubComment(singleTest);
      const multipleComment = formatGitHubComment(multipleTests);

      expect(singleComment).toContain("1 test failed");
      expect(multipleComment).toContain("2 tests failed");
    });

    it("should include test file name when available", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("src/__tests__/math.test.ts");
    });

    it("should truncate long test names in list", () => {
      const longTestName = "A".repeat(200);
      const analysis = createMockAnalysis({
        testFailures: [{ testName: longTestName, error: "Error" }],
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain(longTestName);
    });

    it("should limit test failures to MAX_LIST_ITEMS", () => {
      const manyTests = Array.from({ length: 15 }, (_, i) => ({
        testName: `test${i}`,
        error: `Error ${i}`,
      }));
      const analysis = createMockAnalysis({ testFailures: manyTests });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("test0");
      expect(comment).toContain("...and");
      expect(comment).toContain("more failures");
    });

    it("should include error locations subsection", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("**Error Locations:**");
      expect(comment).toContain("`src/index.ts:42`");
    });

    it("should only show failure-level annotations in error locations", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("src/index.ts:42");
      expect(comment).not.toContain("src/utils.ts:15"); // warning level
    });

    it("should truncate long annotation messages", () => {
      const longMessage = "A".repeat(300);
      const analysis = createMockAnalysis({
        annotations: [
          {
            path: "test.ts",
            startLine: 1,
            message: longMessage,
            level: "failure",
          },
        ],
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain(longMessage);
    });

    it("should limit annotations to MAX_LIST_ITEMS", () => {
      const manyAnnotations = Array.from({ length: 15 }, (_, i) => ({
        path: `file${i}.ts`,
        startLine: i,
        message: `Error ${i}`,
        level: "failure" as const,
      }));
      const analysis = createMockAnalysis({ annotations: manyAnnotations });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("file0.ts");
      expect(comment).toContain("...and");
      expect(comment).toContain("more errors");
    });

    it("should include dependency changes subsection", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("**Dependency Changes:**");
      expect(comment).toContain("3 change(s)");
      expect(comment).toContain("`lodash`");
    });

    it("should show version info for dependencies", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("4.17.21"); // added
      expect(comment).toContain("18.0.0 → 18.2.0"); // updated
      expect(comment).toContain("`moment`"); // removed (no version shown by formatter)
    });

    it("should use correct emoji for dependency types", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      // Should contain emoji markers for different dependency types
      expect(comment).toContain("lodash");
      expect(comment).toContain("react");
      expect(comment).toContain("moment");
    });

    it("should limit dependencies to MAX_LIST_ITEMS", () => {
      const manyDeps = Array.from({ length: 15 }, (_, i) => ({
        type: "added" as const,
        name: `package${i}`,
        newVersion: "1.0.0",
      }));
      const analysis = createMockAnalysis({ dependencyChanges: manyDeps });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("package0");
      expect(comment).toContain("...and");
      expect(comment).toContain("more changes");
    });

    it("should include Impact section", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("### ");
      expect(comment).toContain("Impact");
    });

    it("should show test count in impact", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("2 tests failing");
    });

    it("should show error count in impact", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("1 error detected");
    });

    it("should show workflow blocked in impact", () => {
      const analysis = createMockAnalysis({ checkName: "Build" });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("`Build` workflow blocked");
    });

    it("should show PR merge blocked in impact", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("PR cannot be merged");
    });

    it("should show fallback impact when no specific impacts", () => {
      const analysis = createMockAnalysis({
        testFailures: [],
        annotations: [],
        checkName: undefined,
        prContext: undefined,
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("CI pipeline blocked");
    });

    it("should pluralize errors correctly in impact", () => {
      const singleError = createMockAnalysis({
        annotations: [{ path: "a.ts", startLine: 1, message: "Error", level: "failure" }],
      });
      const multipleErrors = createMockAnalysis({
        annotations: [
          { path: "a.ts", startLine: 1, message: "Error 1", level: "failure" },
          { path: "b.ts", startLine: 2, message: "Error 2", level: "failure" },
        ],
      });

      const singleComment = formatGitHubComment(singleError);
      const multipleComment = formatGitHubComment(multipleErrors);

      expect(singleComment).toContain("1 error detected");
      expect(multipleComment).toContain("2 errors detected");
    });

    it("should include Recommendation section", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("### ");
      expect(comment).toContain("Recommendation");
    });

    it("should show recommended actions with priority emoji", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("1. ");
      expect(comment).toContain("Fix type annotation");
      expect(comment).toContain("2. ");
      expect(comment).toContain("Run type checker");
    });

    it("should limit recommendations to MAX_ACTIONS", () => {
      const manyActions = Array.from({ length: 10 }, (_, i) => ({
        description: `Action ${i}`,
        priority: "high",
      }));
      const analysis = createMockAnalysis({ recommended_actions: manyActions });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("Action 0");
      expect(comment).toContain("recommendations available");
    });

    it("should not show recommendation section when no actions", () => {
      const analysis = createMockAnalysis({ recommended_actions: [] });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain("Recommendation");
    });

    it("should include Error Details section", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("### ");
      expect(comment).toContain("Error Details");
    });

    it("should show errors in code block", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("```");
      expect(comment).toContain("Type 'string' is not assignable");
    });

    it("should truncate long error messages", () => {
      const longError = "A".repeat(500);
      const analysis = createMockAnalysis({
        annotations: [{ path: "test.ts", startLine: 1, message: longError, level: "failure" }],
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain(longError);
    });

    it("should limit error details to MAX_ERROR_DETAILS", () => {
      const manyErrors = Array.from({ length: 25 }, (_, i) => ({
        path: `file${i}.ts`,
        startLine: i,
        message: `Error ${i}`,
        level: "failure" as const,
      }));
      const analysis = createMockAnalysis({ annotations: manyErrors });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("Error 0");
      expect(comment).toContain("...and");
      expect(comment).toContain("more errors");
    });

    it("should not show error details when no errors", () => {
      const analysis = createMockAnalysis({
        annotations: [],
        testFailures: [],
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain("Error Details");
    });

    it("should include confidence section", () => {
      const analysis = createMockAnalysis({ confidence: 0.75 });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("**Analysis Confidence:**");
      expect(comment).toContain("75%");
    });

    it("should show confidence label", () => {
      const high = createMockAnalysis({ confidence: 0.85 });
      const medium = createMockAnalysis({ confidence: 0.55 });
      const low = createMockAnalysis({ confidence: 0.3 });

      const highComment = formatGitHubComment(high);
      const mediumComment = formatGitHubComment(medium);
      const lowComment = formatGitHubComment(low);

      expect(highComment).toContain("High");
      expect(mediumComment).toContain("Medium");
      expect(lowComment).toContain("Low");
    });

    it("should use confidence emoji", () => {
      const high = createMockAnalysis({ confidence: 0.9 });
      const comment = formatGitHubComment(high);

      // Should have an emoji before Analysis Confidence
      expect(comment).toMatch(/\S+\s+\*\*Analysis Confidence:\*\*/);
    });

    it("should include metadata section", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("<details>");
      expect(comment).toContain("Details");
      expect(comment).toContain("</details>");
    });

    it("should show workflow in metadata", () => {
      const analysis = createMockAnalysis({ checkName: "Build" });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("**Workflow:**");
      expect(comment).toContain("Build");
    });

    it("should show commit SHA in metadata", () => {
      const analysis = createMockAnalysis({
        headSha: "abc123def456789012345678901234567890abcd",
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("**Commit:**");
      expect(comment).toContain("`abc123d`"); // Shortened SHA
    });

    it("should show duration in metadata", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("**Duration:**");
      expect(comment).toContain("2m 30s");
    });

    it("should not show metadata section when no metadata", () => {
      const analysis = createMockAnalysis({
        checkName: undefined,
        headSha: undefined,
        workflowContext: undefined,
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain("<details>");
    });

    it("should include footer", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("---");
      expect(comment).toContain("Powered by");
      expect(comment).toContain("KenchiOps");
    });

    it("should handle missing optional fields gracefully", () => {
      const minimal: AnalysisData = {
        confidence: 0.5,
        repository: "test/repo",
      };
      const comment = formatGitHubComment(minimal);

      expect(comment).toBeDefined();
      expect(comment).toContain("KenchiOps");
      expect(comment).toContain("50%");
    });

    it("should not show evidence subsections when empty", () => {
      const analysis = createMockAnalysis({
        testFailures: [],
        annotations: [],
        dependencyChanges: [],
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).not.toContain("**Test Failures:**");
      expect(comment).not.toContain("**Error Locations:**");
      expect(comment).not.toContain("**Dependency Changes:**");
    });

    it("should handle empty cause gracefully", () => {
      const analysis = createMockAnalysis({
        identified_cause: "",
        analysis: "",
      });
      const comment = formatGitHubComment(analysis);

      expect(comment).toBeDefined();
      expect(comment).not.toContain("> >");
    });

    it("should use separators between sections", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      // Check for multiple newlines (section separators)
      expect(comment).toContain("\n\n");
    });
  });

  describe("formatAllClearComment", () => {
    it("should return string content", () => {
      const analysis = createMockAnalysis();
      const comment = formatAllClearComment(analysis);

      expect(typeof comment).toBe("string");
      expect(comment.length).toBeGreaterThan(0);
    });

    it("should include success header", () => {
      const analysis = createMockAnalysis();
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("## ");
      expect(comment).toContain("KenchiOps");
      expect(comment).toContain("CI Analysis Complete");
    });

    it("should include repo name", () => {
      const analysis = createMockAnalysis({ repository: "testorg/myapp" });
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("myapp");
      expect(comment).toContain("analysis completed successfully");
    });

    it("should include Summary section", () => {
      const analysis = createMockAnalysis();
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("### ");
      expect(comment).toContain("Summary");
    });

    it("should show identified cause as quote", () => {
      const analysis = createMockAnalysis({
        identified_cause: "All tests passed successfully",
      });
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("> All tests passed successfully");
    });

    it("should fallback to analysis when no identified cause", () => {
      const analysis = createMockAnalysis({
        identified_cause: undefined,
        analysis: "Build completed without errors",
      });
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("> Build completed without errors");
    });

    it("should show default message when no cause or analysis", () => {
      const analysis = createMockAnalysis({
        identified_cause: undefined,
        analysis: undefined,
      });
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("> No critical issues detected");
    });

    it("should show confidence percentage", () => {
      const analysis = createMockAnalysis({ confidence: 0.92 });
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("**Analysis Confidence:**");
      expect(comment).toContain("92%");
    });

    it("should include high confidence emoji", () => {
      const analysis = createMockAnalysis({ confidence: 0.85 });
      const comment = formatAllClearComment(analysis);

      // Should have an emoji before Analysis Confidence
      expect(comment).toMatch(/\S+\s+\*\*Analysis Confidence:\*\*/);
    });

    it("should include footer", () => {
      const analysis = createMockAnalysis();
      const comment = formatAllClearComment(analysis);

      expect(comment).toContain("---");
      expect(comment).toContain("Powered by");
      expect(comment).toContain("KenchiOps");
    });

    it("should be shorter than failure comment", () => {
      const analysis = createMockAnalysis();
      const failureComment = formatGitHubComment(analysis);
      const successComment = formatAllClearComment(analysis);

      expect(successComment.length).toBeLessThan(failureComment.length);
    });

    it("should not include failure-specific sections", () => {
      const analysis = createMockAnalysis();
      const comment = formatAllClearComment(analysis);

      expect(comment).not.toContain("Impact");
      expect(comment).not.toContain("Recommendation");
      expect(comment).not.toContain("Error Details");
      expect(comment).not.toContain("Test Failures");
    });
  });

  describe("edge cases", () => {
    it("should handle very long text gracefully", () => {
      const longText = "A".repeat(5000);
      const analysis = createMockAnalysis({
        identified_cause: longText,
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toBeDefined();
    });

    it("should handle special characters", () => {
      const analysis = createMockAnalysis({
        identified_cause: "Error: <script>alert('xss')</script>",
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toContain("Error:");
    });

    it("should handle unicode characters", () => {
      const analysis = createMockAnalysis({
        identified_cause: "エラー: 日本語テスト 🔥",
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toContain("日本語テスト");
      expect(comment).toContain("🔥");
    });

    it("should handle malformed repository names", () => {
      const analysis = createMockAnalysis({
        repository: "invalid",
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toBeDefined();
    });

    it("should handle zero confidence", () => {
      const analysis = createMockAnalysis({ confidence: 0 });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("0%");
    });

    it("should handle confidence over 1", () => {
      const analysis = createMockAnalysis({ confidence: 1.5 });
      const comment = formatGitHubComment(analysis);

      expect(comment).toContain("150%");
    });

    it("should handle empty arrays gracefully", () => {
      const analysis = createMockAnalysis({
        recommended_actions: [],
        annotations: [],
        testFailures: [],
        dependencyChanges: [],
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toBeDefined();
    });

    it("should handle missing titles in annotations", () => {
      const analysis = createMockAnalysis({
        annotations: [
          {
            path: "test.ts",
            startLine: 1,
            message: "Error message",
            level: "failure",
          },
        ],
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toContain("test.ts");
    });

    it("should handle annotations with single line", () => {
      const analysis = createMockAnalysis({
        annotations: [
          {
            path: "test.ts",
            startLine: 42,
            message: "Error",
            level: "failure",
          },
        ],
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toContain("test.ts:42");
    });

    it("should handle test failures without file", () => {
      const analysis = createMockAnalysis({
        testFailures: [{ testName: "test without file", error: "Error" }],
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toContain("test without file");
    });

    it("should handle dependencies without version info", () => {
      const analysis = createMockAnalysis({
        dependencyChanges: [
          {
            type: "added",
            name: "package-without-version",
          },
        ],
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toContain("package-without-version");
    });

    it("should handle missing PR context", () => {
      const analysis = createMockAnalysis({
        prContext: undefined,
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).not.toContain("PR cannot be merged");
    });

    it("should handle missing workflow context", () => {
      const analysis = createMockAnalysis({
        workflowContext: undefined,
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).not.toContain("**Duration:**");
    });

    it("should handle workflow context without duration", () => {
      const analysis = createMockAnalysis({
        workflowContext: {
          name: "CI",
          duration: undefined,
        },
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).not.toContain("**Duration:**");
    });

    it("should handle short SHA", () => {
      const analysis = createMockAnalysis({
        headSha: "abc",
      });

      const comment = formatGitHubComment(analysis);
      expect(comment).toContain("`abc`");
    });

    it("should not throw on null/undefined arrays", () => {
      const analysis: AnalysisData = {
        confidence: 0.5,
        repository: "test/repo",
        annotations: undefined as unknown as AnalysisData["annotations"],
        testFailures: undefined as unknown as AnalysisData["testFailures"],
        recommended_actions: undefined as unknown as AnalysisData["recommended_actions"],
        dependencyChanges: undefined as unknown as AnalysisData["dependencyChanges"],
      };

      expect(() => formatGitHubComment(analysis)).not.toThrow();
    });
  });

  describe("formatting consistency", () => {
    it("should use consistent markdown heading levels", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      // Should have ## for main header and ### for sections
      expect(comment).toContain("## ");
      expect(comment).toContain("### ");
    });

    it("should use consistent emoji placement", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      // Emoji should appear before section titles
      expect(comment).toMatch(/\S+\s+Evidence/);
      expect(comment).toMatch(/\S+\s+Impact/);
    });

    it("should maintain proper markdown structure", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      // Check for proper markdown elements
      expect(comment).toContain("##");
      expect(comment).toContain("**");
      expect(comment).toContain("`");
      expect(comment).toContain(">");
      expect(comment).toContain("---");
    });

    it("should produce valid markdown", () => {
      const analysis = createMockAnalysis();
      const comment = formatGitHubComment(analysis);

      // Basic markdown validation
      const backtickCount = (comment.match(/`/g) || []).length;
      expect(backtickCount % 2).toBe(0); // Backticks should be paired

      const boldCount = (comment.match(/\*\*/g) || []).length;
      expect(boldCount % 2).toBe(0); // Bold markers should be paired
    });
  });
});
