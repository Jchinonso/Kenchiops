/**
 * Unit tests for Consolidated Formatter
 */

import { describe, it, expect } from "@jest/globals";
import {
  buildConsolidatedPRComment,
  buildConsolidatedSlackPayload,
  buildConsolidatedCheckAnnotations,
  buildConsolidatedCheckSummary,
} from "../formatters/consolidatedFormatter.js";
import type {
  AggregatedFailures,
  AnalyzedFailure,
  RepositoryInfo,
  PRContext,
} from "../services/aggregation/types.js";

describe("Consolidated Formatter", () => {
  // Test fixtures
  const createMockRepoInfo = (overrides: Partial<RepositoryInfo> = {}): RepositoryInfo => ({
    owner: "testowner",
    name: "testrepo",
    fullName: "testowner/testrepo",
    ...overrides,
  });

  const createMockPRContext = (overrides: Partial<PRContext> = {}): PRContext => ({
    number: 123,
    title: "Test PR Title",
    author: "testuser",
    branch: "feature-branch",
    baseBranch: "main",
    labels: [],
    ...overrides,
  });

  const createMockFailure = (overrides: Partial<AnalyzedFailure> = {}): AnalyzedFailure => ({
    checkRunId: 12345,
    checkName: "CI Build",
    conclusion: "failure",
    analysis: "Build failed due to missing dependency",
    confidence: 0.85,
    identifiedCause: "Missing npm package 'lodash'",
    recommendedActions: [
      { description: "Run npm install to install dependencies", priority: "high" },
      { description: "Check package.json for missing entries", priority: "medium" },
    ],
    annotations: [
      {
        path: "src/index.ts",
        line: 10,
        message: "Cannot find module 'lodash'",
        level: "failure",
        title: "Module not found",
      },
    ],
    timestamp: new Date("2024-01-01T10:00:00Z"),
    ...overrides,
  });

  const createMockAggregation = (
    overrides: Partial<AggregatedFailures> = {}
  ): AggregatedFailures => ({
    commitSha: "abc123def456789012345678901234567890abcd",
    repository: createMockRepoInfo(),
    installationId: 12345,
    pullRequestNumbers: [123],
    failures: [createMockFailure()],
    prContext: createMockPRContext(),
    workflowContext: null,
    firstFailureAt: new Date("2024-01-01T10:00:00Z"),
    lastFailureAt: new Date("2024-01-01T10:05:00Z"),
    ...overrides,
  });

  describe("buildConsolidatedPRComment", () => {
    it("should generate valid PR comment markdown", () => {
      const aggregation = createMockAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("## 🤖 KenchiOps CI Failure Analysis");
      expect(comment).toContain("abc123d");
      expect(comment).toContain("Failed Checks:** 1");
    });

    it("should include commit SHA (shortened)", () => {
      const aggregation = createMockAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("`abc123d`");
    });

    it("should include failure details", () => {
      const aggregation = createMockAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("### ❌ CI Build");
      expect(comment).toContain("Missing npm package 'lodash'");
    });

    it("should include confidence percentage", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ confidence: 0.75 })],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("75%");
    });

    it("should include PR branch information when available", () => {
      const aggregation = createMockAggregation({
        prContext: createMockPRContext({
          branch: "my-feature",
          baseBranch: "develop",
        }),
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("`my-feature`");
      expect(comment).toContain("`develop`");
    });

    it("should handle missing PR context", () => {
      const aggregation = createMockAggregation({ prContext: null });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("## 🤖 KenchiOps CI Failure Analysis");
      expect(comment).not.toContain("Branch:");
    });

    it("should include recommended actions", () => {
      const aggregation = createMockAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("## 🛠️ Recommended Actions");
      expect(comment).toContain("Run npm install");
    });

    it("should include annotations in affected files section", () => {
      const aggregation = createMockAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("**Affected Files:**");
      expect(comment).toContain("`src/index.ts:10`");
    });

    it("should handle multiple failures", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({ checkRunId: 1, checkName: "Build" }),
          createMockFailure({ checkRunId: 2, checkName: "Test" }),
          createMockFailure({ checkRunId: 3, checkName: "Lint" }),
        ],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("Failed Checks:** 3");
      expect(comment).toContain("### ❌ Build");
      expect(comment).toContain("### ❌ Test");
      expect(comment).toContain("### ❌ Lint");
    });

    it("should limit displayed checks when exceeding threshold", () => {
      const manyFailures = Array.from({ length: 15 }, (_, i) =>
        createMockFailure({ checkRunId: i, checkName: `Check${i}` })
      );
      const aggregation = createMockAggregation({ failures: manyFailures });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("... and 5 more failed checks");
    });

    it("should deduplicate recommended actions", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({
            checkRunId: 1,
            recommendedActions: [{ description: "Fix the bug", priority: "high" }],
          }),
          createMockFailure({
            checkRunId: 2,
            recommendedActions: [{ description: "Fix the bug", priority: "high" }],
          }),
        ],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      // Count occurrences of "Fix the bug"
      const matches = comment.match(/Fix the bug/g) || [];
      expect(matches.length).toBe(1);
    });

    it("should include footer", () => {
      const aggregation = createMockAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("Generated by KenchiOps DevOps Assistant");
    });

    it("should handle failure without annotations", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ annotations: [] })],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).not.toContain("**Affected Files:**");
    });

    it("should use analysis when identifiedCause is missing", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({
            identifiedCause: undefined as unknown as string,
            analysis: "Analysis fallback text",
          }),
        ],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("Analysis fallback text");
    });
  });

  describe("buildConsolidatedSlackPayload", () => {
    it("should return valid Slack payload structure", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);

      expect(payload).toHaveProperty("blocks");
      expect(payload).toHaveProperty("text");
      expect(payload).toHaveProperty("metadata");
      expect(Array.isArray(payload.blocks)).toBe(true);
    });

    it("should include header block", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const blocks = payload.blocks as Array<{ type: string }>;

      const headerBlock = blocks.find((b) => b.type === "header");
      expect(headerBlock).toBeDefined();
    });

    it("should include repository information", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("testowner/testrepo");
    });

    it("should include commit link", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("https://github.com/testowner/testrepo/commit/");
    });

    it("should include PR link when context available", () => {
      const aggregation = createMockAggregation({
        prContext: createMockPRContext({ number: 456 }),
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("/pull/456");
    });

    it("should include confidence with emoji", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ confidence: 0.85 })],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("85%");
      expect(content).toContain("🟢"); // High confidence emoji
    });

    it("should use yellow emoji for medium confidence", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ confidence: 0.55 })],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("🟡");
    });

    it("should use red emoji for low confidence", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ confidence: 0.25 })],
      });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("🔴");
    });

    it("should include failure blocks", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("CI Build");
      expect(content).toContain("Missing npm package");
    });

    it("should include recommended actions", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("Recommended Actions");
      expect(content).toContain("npm install");
    });

    it("should limit failures to 5 in blocks", () => {
      const manyFailures = Array.from({ length: 8 }, (_, i) =>
        createMockFailure({ checkRunId: i, checkName: `Check${i}` })
      );
      const aggregation = createMockAggregation({ failures: manyFailures });
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("and 3 more failed checks");
    });

    it("should include metadata", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const metadata = payload.metadata as Record<string, unknown>;

      expect(metadata.repository).toBe("testowner/testrepo");
      expect(metadata.failureCount).toBe(1);
      expect(metadata.isConsolidated).toBe(true);
    });

    it("should include fallback text", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);

      expect(payload.text).toContain("CI Failure");
      expect(payload.text).toContain("testowner/testrepo");
    });

    it("should include footer", () => {
      const aggregation = createMockAggregation();
      const payload = buildConsolidatedSlackPayload(aggregation);
      const content = JSON.stringify(payload);

      expect(content).toContain("KenchiOps DevOps Assistant");
    });

    it("should handle missing PR context gracefully", () => {
      const aggregation = createMockAggregation({ prContext: null });
      const payload = buildConsolidatedSlackPayload(aggregation);

      expect(payload).toBeDefined();
      expect(payload.blocks).toBeDefined();
    });
  });

  describe("buildConsolidatedCheckAnnotations", () => {
    it("should return array of GitHub annotations", () => {
      const aggregation = createMockAggregation();
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(Array.isArray(annotations)).toBe(true);
      expect(annotations.length).toBeGreaterThan(0);
    });

    it("should format annotations correctly", () => {
      const aggregation = createMockAggregation();
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      const annotation = annotations[0];
      expect(annotation).toHaveProperty("path", "src/index.ts");
      expect(annotation).toHaveProperty("start_line", 10);
      expect(annotation).toHaveProperty("end_line", 10);
      expect(annotation).toHaveProperty("annotation_level", "failure");
      expect(annotation).toHaveProperty("message");
      expect(annotation).toHaveProperty("title");
    });

    it("should include check name in message", () => {
      const aggregation = createMockAggregation();
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(annotations[0].message).toContain("[CI Build]");
    });

    it("should handle multiple failures with annotations", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({
            checkRunId: 1,
            checkName: "Build",
            annotations: [{ path: "a.ts", line: 1, message: "Error A", level: "failure" }],
          }),
          createMockFailure({
            checkRunId: 2,
            checkName: "Test",
            annotations: [{ path: "b.ts", line: 2, message: "Error B", level: "warning" }],
          }),
        ],
      });
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(annotations.length).toBe(2);
      expect(annotations[0].path).toBe("a.ts");
      expect(annotations[1].path).toBe("b.ts");
    });

    it("should deduplicate annotations by path:line", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({
            checkRunId: 1,
            annotations: [{ path: "src/index.ts", line: 10, message: "Error 1", level: "failure" }],
          }),
          createMockFailure({
            checkRunId: 2,
            annotations: [{ path: "src/index.ts", line: 10, message: "Error 2", level: "failure" }],
          }),
        ],
      });
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(annotations.length).toBe(1);
    });

    it("should limit annotations to 50", () => {
      const manyAnnotations = Array.from({ length: 60 }, (_, i) => ({
        path: `file${i}.ts`,
        line: i,
        message: `Error ${i}`,
        level: "failure" as const,
      }));
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ annotations: manyAnnotations })],
      });
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(annotations.length).toBe(50);
    });

    it("should handle failures with no annotations", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ annotations: [] })],
      });
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(annotations).toEqual([]);
    });

    it("should use annotation title when available", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({
            annotations: [
              {
                path: "test.ts",
                line: 5,
                message: "Error message",
                level: "failure",
                title: "Custom Title",
              },
            ],
          }),
        ],
      });
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(annotations[0].title).toBe("Custom Title");
    });

    it("should use checkName as title fallback", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({
            checkName: "My Check",
            annotations: [{ path: "test.ts", line: 5, message: "Error", level: "failure" }],
          }),
        ],
      });
      const annotations = buildConsolidatedCheckAnnotations(aggregation);

      expect(annotations[0].title).toBe("My Check");
    });
  });

  describe("buildConsolidatedCheckSummary", () => {
    it("should return markdown summary", () => {
      const aggregation = createMockAggregation();
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(summary).toContain("## CI Failure Summary");
    });

    it("should include failure count", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({ checkRunId: 1 }),
          createMockFailure({ checkRunId: 2 }),
        ],
      });
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(summary).toContain("**Failed Checks:** 2");
    });

    it("should include overall confidence", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ confidence: 0.8 })],
      });
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(summary).toContain("**Overall Confidence:** 80%");
    });

    it("should calculate average confidence for multiple failures", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({ checkRunId: 1, confidence: 0.6 }),
          createMockFailure({ checkRunId: 2, confidence: 0.8 }),
        ],
      });
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(summary).toContain("**Overall Confidence:** 70%");
    });

    it("should list all failed checks", () => {
      const aggregation = createMockAggregation({
        failures: [
          createMockFailure({ checkRunId: 1, checkName: "Build", identifiedCause: "Build error" }),
          createMockFailure({ checkRunId: 2, checkName: "Test", identifiedCause: "Test failed" }),
        ],
      });
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(summary).toContain("**Build**");
      expect(summary).toContain("Build error");
      expect(summary).toContain("**Test**");
      expect(summary).toContain("Test failed");
    });

    it("should use fallback text when identifiedCause is missing", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ identifiedCause: undefined as unknown as string })],
      });
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(summary).toContain("Analysis in progress");
    });

    it("should include Failed Checks section header", () => {
      const aggregation = createMockAggregation();
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(summary).toContain("### Failed Checks");
    });
  });

  describe("edge cases", () => {
    it("should handle empty failures array", () => {
      const aggregation = createMockAggregation({ failures: [] });

      const prComment = buildConsolidatedPRComment(aggregation);
      const slackPayload = buildConsolidatedSlackPayload(aggregation);
      const annotations = buildConsolidatedCheckAnnotations(aggregation);
      const summary = buildConsolidatedCheckSummary(aggregation);

      expect(prComment).toContain("Failed Checks:** 0");
      expect(slackPayload).toBeDefined();
      expect(annotations).toEqual([]);
      expect(summary).toContain("**Failed Checks:** 0");
    });

    it("should handle very long analysis text", () => {
      const longText = "A".repeat(5000);
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ analysis: longText })],
      });

      const prComment = buildConsolidatedPRComment(aggregation);
      expect(prComment).toBeDefined();
    });

    it("should handle special characters in check names", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ checkName: "Build & Test <special>" })],
      });

      const prComment = buildConsolidatedPRComment(aggregation);
      expect(prComment).toContain("Build & Test <special>");
    });

    it("should handle unicode in messages", () => {
      const aggregation = createMockAggregation({
        failures: [createMockFailure({ identifiedCause: "Error: 日本語テスト 🔥" })],
      });

      const prComment = buildConsolidatedPRComment(aggregation);
      expect(prComment).toContain("日本語テスト");
      expect(prComment).toContain("🔥");
    });
  });
});
