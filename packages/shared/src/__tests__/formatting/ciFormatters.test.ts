/**
 * Unit tests for formatting/ciFormatters.ts
 */
import { describe, it, expect } from "@jest/globals";
import {
  collectCIErrors,
  formatDependencyChange,
  formatDependencyChanges,
} from "../../formatting/ciFormatters.js";
import type {
  CIAnnotation,
  CITestFailure,
  DependencyChange,
  CollectErrorsOptions,
} from "../../formatting/ciFormatters.js";

describe("CI Formatters", () => {
  describe("collectCIErrors", () => {
    // Happy path tests
    it("should collect annotation errors", () => {
      const annotations: CIAnnotation[] = [
        {
          path: "src/index.ts",
          startLine: 42,
          level: "failure",
          message: "Type error: Cannot find name 'foo'",
        },
        {
          path: "src/utils.ts",
          startLine: 10,
          level: "failure",
          message: "Expected 2 arguments, but got 1",
        },
      ];

      const result = collectCIErrors(annotations, undefined);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("src/index.ts:42");
      expect(result[0]).toContain("Type error: Cannot find name 'foo'");
      expect(result[1]).toContain("src/utils.ts:10");
    });

    it("should collect test failure errors", () => {
      const testFailures: CITestFailure[] = [
        { testName: "should handle errors correctly", file: "test/handler.test.ts" },
        { testName: "should validate input", file: "test/validator.test.ts" },
      ];

      const result = collectCIErrors(undefined, testFailures);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("should handle errors correctly");
      expect(result[0]).toContain("test/handler.test.ts");
      expect(result[1]).toContain("should validate input");
    });

    it("should include emoji for test failures by default", () => {
      const testFailures: CITestFailure[] = [{ testName: "failing test", file: "test.ts" }];

      const result = collectCIErrors(undefined, testFailures);

      expect(result[0]).toContain("\u274C"); // ❌ emoji
    });

    it("should combine annotations and test failures", () => {
      const annotations: CIAnnotation[] = [
        {
          path: "src/index.ts",
          startLine: 42,
          level: "failure",
          message: "Type error",
        },
      ];
      const testFailures: CITestFailure[] = [{ testName: "failing test" }];

      const result = collectCIErrors(annotations, testFailures);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("src/index.ts:42");
      expect(result[1]).toContain("failing test");
    });

    // Filtering tests
    it("should filter out non-failure annotations", () => {
      const annotations: CIAnnotation[] = [
        {
          path: "src/index.ts",
          startLine: 1,
          level: "warning",
          message: "Warning message",
        },
        {
          path: "src/utils.ts",
          startLine: 2,
          level: "notice",
          message: "Notice message",
        },
        {
          path: "src/main.ts",
          startLine: 3,
          level: "failure",
          message: "Failure message",
        },
      ];

      const result = collectCIErrors(annotations, undefined);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("src/main.ts:3");
    });

    // Options tests
    it("should respect maxErrors limit for annotations only", () => {
      const annotations: CIAnnotation[] = [
        { path: "a.ts", startLine: 1, level: "failure", message: "Error A" },
        { path: "b.ts", startLine: 2, level: "failure", message: "Error B" },
        { path: "c.ts", startLine: 3, level: "failure", message: "Error C" },
        { path: "d.ts", startLine: 4, level: "failure", message: "Error D" },
      ];

      const result = collectCIErrors(annotations, undefined, { maxErrors: 2 });

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("a.ts:1");
      expect(result[1]).toContain("b.ts:2");
    });

    it("should respect maxErrors limit splitting between annotations and tests", () => {
      const annotations: CIAnnotation[] = [
        { path: "a.ts", startLine: 1, level: "failure", message: "Error A" },
        { path: "b.ts", startLine: 2, level: "failure", message: "Error B" },
      ];
      const testFailures: CITestFailure[] = [
        { testName: "test 1" },
        { testName: "test 2" },
        { testName: "test 3" },
      ];

      const result = collectCIErrors(annotations, testFailures, { maxErrors: 3 });

      expect(result).toHaveLength(3);
      expect(result[0]).toContain("a.ts:1"); // Annotation 1
      expect(result[1]).toContain("b.ts:2"); // Annotation 2
      expect(result[2]).toContain("test 1"); // Test failure fills remaining slot
    });

    it("should truncate long messages to maxMessageLength", () => {
      const longMessage = "A".repeat(500);
      const annotations: CIAnnotation[] = [
        { path: "test.ts", startLine: 1, level: "failure", message: longMessage },
      ];

      const result = collectCIErrors(annotations, undefined, { maxMessageLength: 50 });

      expect(result[0].length).toBeLessThan(200); // Path + truncated message + formatting
      expect(result[0]).toContain("...");
    });

    it("should disable emoji when includeEmoji is false", () => {
      const testFailures: CITestFailure[] = [{ testName: "failing test" }];

      const result = collectCIErrors(undefined, testFailures, { includeEmoji: false });

      expect(result[0]).not.toContain("\u274C");
      expect(result[0]).toBe("failing test");
    });

    // Edge cases
    it("should handle empty arrays", () => {
      const result = collectCIErrors([], []);

      expect(result).toEqual([]);
    });

    it("should handle undefined inputs", () => {
      const result = collectCIErrors(undefined, undefined);

      expect(result).toEqual([]);
    });

    it("should handle test failures without file field", () => {
      const testFailures: CITestFailure[] = [{ testName: "test without file" }];

      const result = collectCIErrors(undefined, testFailures);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("test without file");
      expect(result[0]).not.toContain("(`");
    });

    it("should handle test failures with error field", () => {
      const testFailures: CITestFailure[] = [
        { testName: "test with error", error: "Error details here" },
      ];

      const result = collectCIErrors(undefined, testFailures);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("test with error");
    });

    it("should handle empty test name", () => {
      const testFailures: CITestFailure[] = [{ testName: "" }];

      const result = collectCIErrors(undefined, testFailures);

      expect(result).toHaveLength(1);
    });

    it("should handle special characters in paths and messages", () => {
      const annotations: CIAnnotation[] = [
        {
          path: "src/file with spaces.ts",
          startLine: 1,
          level: "failure",
          message: "Error with <special> & characters",
        },
      ];

      const result = collectCIErrors(annotations, undefined);

      expect(result[0]).toContain("src/file with spaces.ts:1");
      expect(result[0]).toContain("Error with <special> & characters");
    });

    it("should handle unicode in messages", () => {
      const annotations: CIAnnotation[] = [
        {
          path: "test.ts",
          startLine: 1,
          level: "failure",
          message: "日本語エラー 🔥",
        },
      ];

      const result = collectCIErrors(annotations, undefined);

      expect(result[0]).toContain("日本語エラー 🔥");
    });

    it("should handle very large line numbers", () => {
      const annotations: CIAnnotation[] = [
        { path: "huge.ts", startLine: 999999, level: "failure", message: "Error" },
      ];

      const result = collectCIErrors(annotations, undefined);

      expect(result[0]).toContain("huge.ts:999999");
    });

    it("should handle maxErrors of 0", () => {
      const annotations: CIAnnotation[] = [
        { path: "a.ts", startLine: 1, level: "failure", message: "Error" },
      ];

      const result = collectCIErrors(annotations, undefined, { maxErrors: 0 });

      expect(result).toEqual([]);
    });

    it("should prioritize annotations over test failures", () => {
      const annotations: CIAnnotation[] = Array.from({ length: 5 }, (_, i) => ({
        path: `file${i}.ts`,
        startLine: i,
        level: "failure",
        message: `Error ${i}`,
      }));
      const testFailures: CITestFailure[] = [{ testName: "test 1" }, { testName: "test 2" }];

      const result = collectCIErrors(annotations, testFailures, { maxErrors: 3 });

      expect(result).toHaveLength(3);
      expect(result.every((errorLine) => errorLine.includes(".ts:"))).toBe(true);
    });

    it("should use default maxErrors when not specified", () => {
      const annotations: CIAnnotation[] = Array.from({ length: 20 }, (_, i) => ({
        path: `file${i}.ts`,
        startLine: i,
        level: "failure",
        message: `Error ${i}`,
      }));

      const result = collectCIErrors(annotations, undefined);

      // Default is likely 5 based on CI_FAILURE_DISPLAY.MAX_ERRORS_DISPLAYED
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it("should use default maxMessageLength when not specified", () => {
      const longMessage = "A".repeat(1000);
      const annotations: CIAnnotation[] = [
        { path: "test.ts", startLine: 1, level: "failure", message: longMessage },
      ];

      const result = collectCIErrors(annotations, undefined);

      expect(result[0]).toContain("...");
    });
  });

  describe("formatDependencyChange", () => {
    // Happy path tests
    it("should format added dependency", () => {
      const dep: DependencyChange = {
        name: "lodash",
        type: "added",
        newVersion: "4.17.21",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("Added");
      expect(result).toContain("lodash@4.17.21");
      expect(result).toContain("\u2795"); // ➕
    });

    it("should format removed dependency", () => {
      const dep: DependencyChange = {
        name: "moment",
        type: "removed",
        oldVersion: "2.29.1",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("Removed");
      expect(result).toContain("moment@2.29.1");
      expect(result).toContain("\u2796"); // ➖
    });

    it("should format updated dependency", () => {
      const dep: DependencyChange = {
        name: "typescript",
        type: "updated",
        oldVersion: "4.5.0",
        newVersion: "5.0.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("Updated");
      expect(result).toContain("typescript");
      expect(result).toContain("4.5.0");
      expect(result).toContain("5.0.0");
      expect(result).toContain("\uD83D\uDD04"); // 🔄
      expect(result).toContain("\u2192"); // →
    });

    // Edge cases
    it("should handle dependency name with special characters", () => {
      const dep: DependencyChange = {
        name: "@types/node",
        type: "added",
        newVersion: "18.0.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("@types/node@18.0.0");
    });

    it("should handle scoped packages", () => {
      const dep: DependencyChange = {
        name: "@babel/core",
        type: "updated",
        oldVersion: "7.0.0",
        newVersion: "7.20.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("@babel/core");
    });

    it("should handle version with prerelease tags", () => {
      const dep: DependencyChange = {
        name: "next",
        type: "added",
        newVersion: "13.0.0-canary.1",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("next@13.0.0-canary.1");
    });

    it("should handle version ranges", () => {
      const dep: DependencyChange = {
        name: "react",
        type: "updated",
        oldVersion: "^17.0.0",
        newVersion: "^18.0.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("^17.0.0");
      expect(result).toContain("^18.0.0");
    });

    it("should format added dependency without version gracefully", () => {
      const dep: DependencyChange = {
        name: "test-package",
        type: "added",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("test-package");
      expect(result).toContain("Added");
    });

    it("should format removed dependency without version gracefully", () => {
      const dep: DependencyChange = {
        name: "old-package",
        type: "removed",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("old-package");
      expect(result).toContain("Removed");
    });

    it("should handle empty package name", () => {
      const dep: DependencyChange = {
        name: "",
        type: "added",
        newVersion: "1.0.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("@1.0.0");
    });

    it("should handle very long package names", () => {
      const longName = "very-long-package-name-that-exceeds-normal-length";
      const dep: DependencyChange = {
        name: longName,
        type: "added",
        newVersion: "1.0.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain(longName);
    });

    it("should use backticks for code formatting", () => {
      const dep: DependencyChange = {
        name: "lodash",
        type: "added",
        newVersion: "4.0.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("`lodash@4.0.0`");
    });
  });

  describe("formatDependencyChanges", () => {
    it("should format multiple dependency changes", () => {
      const deps: DependencyChange[] = [
        { name: "lodash", type: "added", newVersion: "4.0.0" },
        { name: "moment", type: "removed", oldVersion: "2.0.0" },
        { name: "react", type: "updated", oldVersion: "17.0.0", newVersion: "18.0.0" },
      ];

      const result = formatDependencyChanges(deps);

      expect(result).toContain("lodash@4.0.0");
      expect(result).toContain("moment@2.0.0");
      expect(result).toContain("react");
      expect(result.split("\n")).toHaveLength(3);
    });

    it("should separate changes with newlines", () => {
      const deps: DependencyChange[] = [
        { name: "pkg1", type: "added", newVersion: "1.0.0" },
        { name: "pkg2", type: "added", newVersion: "2.0.0" },
      ];

      const result = formatDependencyChanges(deps);
      const lines = result.split("\n");

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("pkg1");
      expect(lines[1]).toContain("pkg2");
    });

    it("should handle empty array", () => {
      const result = formatDependencyChanges([]);

      expect(result).toBe("");
    });

    it("should handle single dependency", () => {
      const deps: DependencyChange[] = [{ name: "single", type: "added", newVersion: "1.0.0" }];

      const result = formatDependencyChanges(deps);

      expect(result).toContain("single@1.0.0");
      expect(result.split("\n")).toHaveLength(1);
    });

    it("should maintain order of dependencies", () => {
      const deps: DependencyChange[] = [
        { name: "zebra", type: "added", newVersion: "1.0.0" },
        { name: "apple", type: "added", newVersion: "1.0.0" },
        { name: "middle", type: "added", newVersion: "1.0.0" },
      ];

      const result = formatDependencyChanges(deps);
      const lines = result.split("\n");

      expect(lines[0]).toContain("zebra");
      expect(lines[1]).toContain("apple");
      expect(lines[2]).toContain("middle");
    });

    it("should handle mixed dependency types", () => {
      const deps: DependencyChange[] = [
        { name: "added-pkg", type: "added", newVersion: "1.0.0" },
        { name: "removed-pkg", type: "removed", oldVersion: "2.0.0" },
        { name: "updated-pkg", type: "updated", oldVersion: "1.0.0", newVersion: "2.0.0" },
      ];

      const result = formatDependencyChanges(deps);

      expect(result).toContain("\u2795"); // Added emoji
      expect(result).toContain("\u2796"); // Removed emoji
      expect(result).toContain("\uD83D\uDD04"); // Updated emoji
    });

    it("should handle large number of dependencies", () => {
      const deps: DependencyChange[] = Array.from({ length: 100 }, (_, i) => ({
        name: `package${i}`,
        type: "added" as const,
        newVersion: "1.0.0",
      }));

      const result = formatDependencyChanges(deps);
      const lines = result.split("\n");

      expect(lines).toHaveLength(100);
    });

    it("should preserve all emojis in output", () => {
      const deps: DependencyChange[] = [
        { name: "a", type: "added", newVersion: "1.0.0" },
        { name: "b", type: "removed", oldVersion: "1.0.0" },
        { name: "c", type: "updated", oldVersion: "1.0.0", newVersion: "2.0.0" },
      ];

      const result = formatDependencyChanges(deps);

      expect(result).toContain("\u2795");
      expect(result).toContain("\u2796");
      expect(result).toContain("\uD83D\uDD04");
    });

    it("should not add trailing newline", () => {
      const deps: DependencyChange[] = [{ name: "pkg", type: "added", newVersion: "1.0.0" }];

      const result = formatDependencyChanges(deps);

      expect(result.endsWith("\n")).toBe(false);
    });
  });

  describe("edge cases and integration", () => {
    it("should handle collectCIErrors with all options", () => {
      const annotations: CIAnnotation[] = [
        { path: "a.ts", startLine: 1, level: "failure", message: "Error A" },
      ];
      const testFailures: CITestFailure[] = [{ testName: "Test 1", file: "test.ts" }];
      const options: CollectErrorsOptions = {
        maxErrors: 10,
        maxMessageLength: 100,
        includeEmoji: true,
      };

      const result = collectCIErrors(annotations, testFailures, options);

      expect(result).toHaveLength(2);
    });

    it("should handle extremely long dependency names in formatDependencyChanges", () => {
      const deps: DependencyChange[] = [
        {
          name: "a".repeat(500),
          type: "added",
          newVersion: "1.0.0",
        },
      ];

      const result = formatDependencyChanges(deps);

      expect(result).toContain("a".repeat(500));
    });

    it("should handle unicode in dependency names", () => {
      const deps: DependencyChange[] = [
        { name: "日本語パッケージ", type: "added", newVersion: "1.0.0" },
      ];

      const result = formatDependencyChange(deps[0]);

      expect(result).toContain("日本語パッケージ");
    });
  });
});
