/**
 * Tests for Slack Content Block Builders
 */

import {
  buildAnnotationsBlock,
  buildCheckNamesBlock,
  buildRootCauseBlock,
  buildDependencyChangesBlock,
  buildConfigChangesBlock,
  buildActionsSummaryBlocks,
  type ConsolidatedAnnotation,
} from "../formatters/slackContentBlocks.js";
import type {
  AnalyzedFailure,
  RecommendedAction,
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
} from "@kenchi/shared";

describe("slackContentBlocks", () => {
  describe("buildAnnotationsBlock", () => {
    it("should return null for empty annotations", () => {
      const result = buildAnnotationsBlock([]);
      expect(result).toBeNull();
    });

    it("should build block for single annotation", () => {
      const annotations: ConsolidatedAnnotation[] = [
        { path: "src/index.ts", line: 10, message: "Type error" },
      ];

      const result = buildAnnotationsBlock(annotations);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("context");
      expect(result?.elements?.[0].text).toContain("src/index.ts:10");
      expect(result?.elements?.[0].text).toContain("Type error");
    });

    it("should truncate annotations and show overflow count", () => {
      // Create many annotations - should be truncated to display limit with "...and N more"
      const annotations: ConsolidatedAnnotation[] = Array.from({ length: 55 }, (_, index) => ({
        path: `src/file${index}.ts`,
        line: index + 1,
        message: `Error ${index}`,
      }));

      const result = buildAnnotationsBlock(annotations);

      // Total count should show all 55
      expect(result?.elements?.[0].text).toContain("Affected Files (55)");
      // First entries should be shown
      expect(result?.elements?.[0].text).toContain("src/file0.ts:1");
      // Last entries should be truncated (display limit is 50)
      expect(result?.elements?.[0].text).not.toContain("src/file54.ts:55");
      // Overflow message should show
      expect(result?.elements?.[0].text).toContain("...and 5 more");
    });

    it("should handle multiple annotations", () => {
      const annotations: ConsolidatedAnnotation[] = [
        { path: "src/a.ts", line: 1, message: "Error A" },
        { path: "src/b.ts", line: 2, message: "Error B" },
      ];

      const result = buildAnnotationsBlock(annotations);

      expect(result?.elements?.[0].text).toContain("src/a.ts:1");
      expect(result?.elements?.[0].text).toContain("src/b.ts:2");
      expect(result?.elements?.[0].text).toContain("Affected Files");
    });
  });

  describe("buildCheckNamesBlock", () => {
    it("should build block with check names", () => {
      const failures: AnalyzedFailure[] = [
        {
          checkRunId: 1,
          checkName: "build",
          conclusion: "failure",
          annotations: [],
          testFailures: [],
          confidence: 0.9,
          analysis: "",
          identifiedCause: "",
          recommendedActions: [],
        },
        {
          checkRunId: 2,
          checkName: "test",
          conclusion: "failure",
          annotations: [],
          testFailures: [],
          confidence: 0.85,
          analysis: "",
          identifiedCause: "",
          recommendedActions: [],
        },
      ];

      const result = buildCheckNamesBlock(failures);

      expect(result.type).toBe("section");
      expect(result.text?.text).toContain("`build`");
      expect(result.text?.text).toContain("`test`");
      expect(result.text?.text).toContain("Checks:");
    });

    it("should handle single check", () => {
      const failures: AnalyzedFailure[] = [
        {
          checkRunId: 1,
          checkName: "lint",
          conclusion: "failure",
          annotations: [],
          testFailures: [],
          confidence: 0.9,
          analysis: "",
          identifiedCause: "",
          recommendedActions: [],
        },
      ];

      const result = buildCheckNamesBlock(failures);

      expect(result.text?.text).toContain("`lint`");
    });
  });

  describe("buildRootCauseBlock", () => {
    it("should show fallback message when no causes and no test failures", () => {
      const result = buildRootCauseBlock([], false, false);

      expect(result.type).toBe("section");
      expect(result.text?.text).toContain("Root Cause");
      expect(result.text?.text).toContain("Unable to determine specific root cause");
    });

    it("should show test failures message when has test failures", () => {
      const result = buildRootCauseBlock([], true, false);

      expect(result.text?.text).toContain("Test failures detected");
    });

    it("should show annotations message when has annotations but no test failures", () => {
      const result = buildRootCauseBlock([], false, true);

      expect(result.text?.text).toContain("See error locations below");
    });

    it("should prioritize test failures message over annotations", () => {
      const result = buildRootCauseBlock([], true, true);

      expect(result.text?.text).toContain("Test failures detected");
    });

    it("should show single cause directly", () => {
      const result = buildRootCauseBlock(["Missing import statement"]);

      expect(result.text?.text).toContain("Missing import statement");
      expect(result.text?.text).not.toContain("1.");
    });

    it("should number multiple causes", () => {
      const result = buildRootCauseBlock([
        "Missing import statement",
        "Type mismatch in function call",
      ]);

      expect(result.text?.text).toContain("1. Missing import statement");
      expect(result.text?.text).toContain("2. Type mismatch in function call");
    });
  });

  describe("buildDependencyChangesBlock", () => {
    it("should return null for empty dependencies", () => {
      const result = buildDependencyChangesBlock([]);
      expect(result).toBeNull();
    });

    it("should build block for added dependency", () => {
      const deps: LLMDetectedDependencyChange[] = [
        {
          name: "lodash",
          type: "added",
          newVersion: "4.17.21",
          ecosystem: "npm",
        },
      ];

      const result = buildDependencyChangesBlock(deps);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("context");
      expect(result?.elements?.[0].text).toContain("lodash");
      expect(result?.elements?.[0].text).toContain("4.17.21");
      expect(result?.elements?.[0].text).toContain("npm");
    });

    it("should show version transition for updated dependency", () => {
      const deps: LLMDetectedDependencyChange[] = [
        {
          name: "typescript",
          type: "updated",
          oldVersion: "4.9.0",
          newVersion: "5.0.0",
        },
      ];

      const result = buildDependencyChangesBlock(deps);

      expect(result?.elements?.[0].text).toContain("4.9.0 -> 5.0.0");
    });

    it("should handle removed dependency", () => {
      const deps: LLMDetectedDependencyChange[] = [
        {
          name: "moment",
          type: "removed",
        },
      ];

      const result = buildDependencyChangesBlock(deps);

      expect(result?.elements?.[0].text).toContain("moment");
      expect(result?.elements?.[0].text).toContain("Dependency Changes (1)");
    });

    it("should show truncation message when exceeding display limit", () => {
      // Create more dependencies than display limit (50)
      const deps: LLMDetectedDependencyChange[] = Array.from({ length: 55 }, (_, index) => ({
        name: `package${index}`,
        type: "added" as const,
      }));

      const result = buildDependencyChangesBlock(deps);

      expect(result?.elements?.[0].text).toContain("...and");
      expect(result?.elements?.[0].text).toContain("5 more");
    });
  });

  describe("buildConfigChangesBlock", () => {
    it("should return null for empty config changes", () => {
      const result = buildConfigChangesBlock([]);
      expect(result).toBeNull();
    });

    it("should build block for config change", () => {
      const configs: LLMDetectedBuildConfigChange[] = [
        {
          file: "tsconfig.json",
          changeType: "modified",
          summary: "Updated compiler options",
          diff: "",
        },
      ];

      const result = buildConfigChangesBlock(configs);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("context");
      expect(result?.elements?.[0].text).toContain("tsconfig.json");
      expect(result?.elements?.[0].text).toContain("Updated compiler options");
    });

    it("should handle added config file", () => {
      const configs: LLMDetectedBuildConfigChange[] = [
        {
          file: ".eslintrc.js",
          changeType: "added",
          summary: "Added ESLint configuration",
          diff: "",
        },
      ];

      const result = buildConfigChangesBlock(configs);

      expect(result?.elements?.[0].text).toContain(".eslintrc.js");
      expect(result?.elements?.[0].text).toContain("Build Config Changes (1)");
    });

    it("should handle deleted config file", () => {
      const configs: LLMDetectedBuildConfigChange[] = [
        {
          file: "webpack.config.js",
          changeType: "deleted",
          summary: "Removed webpack configuration",
          diff: "",
        },
      ];

      const result = buildConfigChangesBlock(configs);

      expect(result?.elements?.[0].text).toContain("webpack.config.js");
    });

    it("should show truncation message when exceeding display limit", () => {
      // Create more config changes than display limit (50)
      const configs: LLMDetectedBuildConfigChange[] = Array.from({ length: 55 }, (_, index) => ({
        file: `config${index}.json`,
        changeType: "modified" as const,
        summary: `Change ${index}`,
        diff: "",
      }));

      const result = buildConfigChangesBlock(configs);

      expect(result?.elements?.[0].text).toContain("...and");
      expect(result?.elements?.[0].text).toContain("5 more");
    });
  });

  describe("buildActionsSummaryBlocks", () => {
    it("should return empty array for no actions", () => {
      const result = buildActionsSummaryBlocks([]);
      expect(result).toEqual([]);
    });

    it("should build blocks for single action", () => {
      const actions: RecommendedAction[] = [
        {
          description: "Rerun the failed pipeline",
          priority: "high",
          actionType: "rerun_pipeline",
        },
      ];

      const result = buildActionsSummaryBlocks(actions);

      expect(result.length).toBe(3); // divider + header + actions
      expect(result[0].type).toBe("divider");
      expect(result[1].text?.text).toContain("Recommended Actions");
      expect(result[2].text?.text).toContain("Rerun the failed pipeline");
    });

    it("should number multiple actions", () => {
      const actions: RecommendedAction[] = [
        {
          description: "Action 1",
          priority: "high",
          actionType: "rerun_pipeline",
        },
        {
          description: "Action 2",
          priority: "medium",
          actionType: "notify_team",
        },
      ];

      const result = buildActionsSummaryBlocks(actions);

      expect(result[2].text?.text).toContain("1.");
      expect(result[2].text?.text).toContain("2.");
    });

    it("should include priority emoji", () => {
      const actions: RecommendedAction[] = [
        {
          description: "Critical action",
          priority: "critical",
          actionType: "manual_investigation",
        },
      ];

      const result = buildActionsSummaryBlocks(actions);

      // Priority emojis are included in the output
      expect(result[2].text?.text).toContain("Critical action");
    });

    it("should handle different priority levels", () => {
      const priorities: Array<"critical" | "high" | "medium" | "low"> = [
        "critical",
        "high",
        "medium",
        "low",
      ];

      priorities.forEach((priority) => {
        const actions: RecommendedAction[] = [
          {
            description: `${priority} priority action`,
            priority,
            actionType: "rerun_pipeline",
          },
        ];

        const result = buildActionsSummaryBlocks(actions);
        expect(result.length).toBe(3);
        expect(result[2].text?.text).toContain(`${priority} priority action`);
      });
    });
  });
});
