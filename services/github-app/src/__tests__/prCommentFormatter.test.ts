/**
 * Unit tests for PR Comment Formatter
 */

import { describe, it, expect } from "@jest/globals";
import { buildConsolidatedPRComment } from "../formatters/prCommentFormatter.js";
import type { AggregatedFailures, AnalyzedFailure, CodeAnnotation } from "@kenchi/shared";

describe("PR Comment Formatter", () => {
  const createAnnotation = (overrides: Partial<CodeAnnotation> = {}): CodeAnnotation => ({
    path: "src/index.ts",
    line: 42,
    level: "failure",
    message: "Test error message",
    title: "Test Error",
    ...overrides,
  });

  const createFailure = (overrides: Partial<AnalyzedFailure> = {}): AnalyzedFailure => ({
    checkRunId: 12345,
    checkName: "CI Build",
    conclusion: "failure",
    confidence: 0.85,
    analysis: "Build failed due to syntax error",
    identifiedCause: "Missing semicolon in index.ts",
    annotations: [],
    recommendedActions: [],
    testFailures: [],
    timestamp: new Date(),
    ...overrides,
  });

  const createAggregation = (overrides: Partial<AggregatedFailures> = {}): AggregatedFailures => ({
    repository: { fullName: "owner/repo", owner: "owner", name: "repo" },
    commitSha: "abc123def456789",
    installationId: 12345,
    pullRequestNumbers: [123],
    failures: [createFailure()],
    prContext: {
      number: 123,
      title: "Fix bug",
      author: "developer",
      branch: "feature/fix",
      baseBranch: "main",
      labels: [],
    },
    workflowContext: null,
    firstFailureAt: new Date(),
    lastFailureAt: new Date(),
    ...overrides,
  });

  describe("buildConsolidatedPRComment", () => {
    it("should include header with KenchiOps branding", () => {
      const aggregation = createAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("## 🤖 KenchiOps CI Failure Analysis");
    });

    it("should include commit SHA", () => {
      const aggregation = createAggregation({ commitSha: "abc123def" });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("`abc123d`");
    });

    it("should include failure count", () => {
      const aggregation = createAggregation({
        failures: [createFailure(), createFailure(), createFailure()],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("**Failed Checks:** 3");
    });

    it("should include overall confidence percentage", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ confidence: 0.8 }), createFailure({ confidence: 0.6 })],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("**Overall Confidence:** 70%");
    });

    it("should include branch info when PR context exists", () => {
      const aggregation = createAggregation({
        prContext: {
          number: 123,
          title: "Feature",
          author: "dev",
          branch: "feature/new",
          baseBranch: "develop",
          labels: [],
        },
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("`feature/new` → `develop`");
    });

    it("should not include branch info when no PR context", () => {
      const aggregation = createAggregation({ prContext: undefined });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).not.toContain("**Branch:**");
    });

    it("should include check names in consolidated view", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ checkName: "Unit Tests" })],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("**Checks:** `Unit Tests`");
    });

    it("should include root cause from identifiedCause", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ identifiedCause: "Missing import statement" })],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("### 🔍 Root Cause");
      expect(comment).toContain("Missing import statement");
    });

    it("should fall back to analysis when no identifiedCause", () => {
      const aggregation = createAggregation({
        failures: [createFailure({ identifiedCause: undefined, analysis: "Fallback analysis" })],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("### 🔍 Root Cause");
      expect(comment).toContain("Fallback analysis");
    });

    it("should include annotations when under limit", () => {
      const aggregation = createAggregation({
        failures: [
          createFailure({
            annotations: [
              createAnnotation({ path: "src/file1.ts", line: 10 }),
              createAnnotation({ path: "src/file2.ts", line: 20 }),
            ],
          }),
        ],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("### 📍 Affected Files");
      expect(comment).toContain("`src/file1.ts:10`");
      expect(comment).toContain("`src/file2.ts:20`");
    });

    it("should include annotation level icons", () => {
      const aggregation = createAggregation({
        failures: [
          createFailure({
            annotations: [
              createAnnotation({ level: "failure" }),
              createAnnotation({ level: "warning", path: "warn.ts" }),
              createAnnotation({ level: "notice", path: "notice.ts" }),
            ],
          }),
        ],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("❌");
      expect(comment).toContain("⚠️");
      expect(comment).toContain("ℹ️");
    });

    it("should show all annotations without truncation", () => {
      // Create many annotations - all should be shown (no display limit)
      const annotations = Array.from({ length: 110 }, (_, annotationIndex) =>
        createAnnotation({ path: `file${annotationIndex}.ts`, line: annotationIndex })
      );
      const aggregation = createAggregation({
        failures: [createFailure({ annotations })],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      // All 110 entries should be shown
      expect(comment).toContain("Affected Files (110)");
      expect(comment).toContain("file109.ts:109");
    });

    it("should include recommended actions with priority emoji", () => {
      const aggregation = createAggregation({
        failures: [
          createFailure({
            recommendedActions: [
              { description: "Fix the import", priority: "high", actionType: "fix" },
              { description: "Run tests", priority: "medium", actionType: "test" },
            ],
          }),
        ],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("## 🛠️ Recommended Actions");
      // high priority uses 🟠, medium uses 🟡
      expect(comment).toContain("🟠 Fix the import");
      expect(comment).toContain("🟡 Run tests");
    });

    it("should include footer with KenchiOps credit", () => {
      const aggregation = createAggregation();
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("*Generated by KenchiOps DevOps Assistant*");
    });

    it("should show all check names in consolidated view", () => {
      const failures = Array.from({ length: 5 }, (_, i) =>
        createFailure({ checkName: `Check ${i}` })
      );
      const aggregation = createAggregation({ failures });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("`Check 0`");
      expect(comment).toContain("`Check 4`");
    });

    it("should deduplicate test failures into Affected Files", () => {
      const failures = [
        createFailure({
          checkName: "Check 1",
          testFailures: [{ testName: "should work", file: "test.ts" }],
        }),
        createFailure({
          checkName: "Check 2",
          testFailures: [{ testName: "should work", file: "test.ts" }],
        }),
      ];
      const aggregation = createAggregation({ failures });
      const comment = buildConsolidatedPRComment(aggregation);

      // Test failures are now shown in Affected Files section
      expect(comment).toContain("### 📍 Affected Files");
      expect(comment).toContain("test.ts");
    });

    it("should deduplicate annotations across checks", () => {
      const failures = [
        createFailure({
          checkName: "Check 1",
          annotations: [createAnnotation({ path: "src/index.ts", line: 10 })],
        }),
        createFailure({
          checkName: "Check 2",
          annotations: [createAnnotation({ path: "src/index.ts", line: 10 })],
        }),
      ];
      const aggregation = createAggregation({ failures });
      const comment = buildConsolidatedPRComment(aggregation);

      // Should only show one entry for src/index.ts:10
      const matches = comment.match(/src\/index\.ts:10/g);
      expect(matches?.length).toBe(1);
    });

    it("should handle empty failures gracefully", () => {
      const aggregation = createAggregation({ failures: [] });
      const comment = buildConsolidatedPRComment(aggregation);

      expect(comment).toContain("**Failed Checks:** 0");
      expect(comment).toContain("**Overall Confidence:** 0%");
    });

    it("should deduplicate recommended actions", () => {
      const aggregation = createAggregation({
        failures: [
          createFailure({
            recommendedActions: [{ description: "Same fix", priority: "high", actionType: "fix" }],
          }),
          createFailure({
            recommendedActions: [{ description: "Same fix", priority: "high", actionType: "fix" }],
          }),
        ],
      });
      const comment = buildConsolidatedPRComment(aggregation);

      const matches = comment.match(/Same fix/g);
      expect(matches?.length).toBe(1);
    });
  });
});
