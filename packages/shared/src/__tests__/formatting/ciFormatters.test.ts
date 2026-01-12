/**
 * Unit tests for formatting/ciFormatters.ts
 *
 * Tests for simplified CI formatting utilities:
 * - Dependency change formatting
 * - Path utilities (re-exported from pathUtils)
 */
import { describe, it, expect } from "@jest/globals";
import {
  formatDependencyChange,
  formatDependencyChanges,
  canonicalizeEvidencePaths,
  normalizeTestFilePath,
  extractValidFileLocation,
  extractServiceFromPath,
  formatServiceNameKebab,
  formatServiceNameTitle,
  groupByServicePath,
  stripAbsolutePaths,
  type DependencyChange,
} from "../../formatting/ciFormatters.js";

describe("CI Formatters", () => {
  describe("formatDependencyChange", () => {
    it("should format added dependency", () => {
      const dep: DependencyChange = {
        name: "lodash",
        type: "added",
        newVersion: "4.17.21",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("Added");
      expect(result).toContain("lodash@4.17.21");
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
    });

    it("should format updated dependency", () => {
      const dep: DependencyChange = {
        name: "react",
        type: "updated",
        oldVersion: "17.0.2",
        newVersion: "18.2.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("Updated");
      expect(result).toContain("react");
      expect(result).toContain("17.0.2");
      expect(result).toContain("18.2.0");
    });

    it("should handle unknown type gracefully", () => {
      const dep = {
        name: "test",
        type: "unknown" as DependencyChange["type"],
        oldVersion: "1.0.0",
        newVersion: "2.0.0",
      };

      const result = formatDependencyChange(dep);

      expect(result).toContain("test");
    });
  });

  describe("formatDependencyChanges", () => {
    it("should format multiple dependency changes", () => {
      const deps: DependencyChange[] = [
        { name: "lodash", type: "added", newVersion: "4.17.21" },
        { name: "moment", type: "removed", oldVersion: "2.29.1" },
      ];

      const result = formatDependencyChanges(deps);

      expect(result).toContain("lodash");
      expect(result).toContain("moment");
      expect(result.split("\n")).toHaveLength(2);
    });

    it("should return empty string for empty array", () => {
      const result = formatDependencyChanges([]);

      expect(result).toBe("");
    });
  });

  describe("canonicalizeEvidencePaths", () => {
    it("should canonicalize evidence paths across test failures and annotations", () => {
      const testFailures = [
        { file: "/home/user/project/src/index.ts", error: "failed" },
        { file: "utils.ts", error: "failed" },
      ];
      const annotations = [
        { path: "src/utils.ts", line: 20 },
        { path: "index.ts", line: 10 },
      ];

      const result = canonicalizeEvidencePaths(testFailures, annotations);

      // Function returns an object with testFailures, annotations, and pathMap
      expect(result).toHaveProperty("testFailures");
      expect(result).toHaveProperty("annotations");
      expect(result).toHaveProperty("pathMap");
      expect(result.testFailures).toHaveLength(2);
      expect(result.annotations).toHaveLength(2);
    });

    it("should handle empty arrays", () => {
      const result = canonicalizeEvidencePaths([], []);

      expect(result.testFailures).toHaveLength(0);
      expect(result.annotations).toHaveLength(0);
    });
  });

  describe("normalizeTestFilePath", () => {
    it("should normalize backslashes to forward slashes", () => {
      expect(normalizeTestFilePath("src\\test.ts")).toBe("src/test.ts");
      expect(normalizeTestFilePath("src\\__tests__\\index.test.ts")).toBe(
        "src/tests/index.test.ts"
      );
    });

    it("should convert __tests__ to tests", () => {
      expect(normalizeTestFilePath("src/__tests__/utils.test.ts")).toBe("src/tests/utils.test.ts");
    });

    it("should handle already normalized paths", () => {
      expect(normalizeTestFilePath("src/test.ts")).toBe("src/test.ts");
    });
  });

  describe("extractValidFileLocation", () => {
    it("should return formatted location with path and line", () => {
      const result = extractValidFileLocation("src/index.ts", 42);

      expect(result).toBe("src/index.ts:42");
    });

    it("should return path only when line is 0", () => {
      const result = extractValidFileLocation("src/index.ts", 0);

      expect(result).toBe("src/index.ts");
    });

    it("should return null for empty path", () => {
      expect(extractValidFileLocation("", 10)).toBeNull();
    });

    it("should return null for unknown path", () => {
      expect(extractValidFileLocation("unknown", 10)).toBeNull();
    });
  });

  describe("extractServiceFromPath", () => {
    it("should extract service name from path", () => {
      // Function returns up to 2 directory levels after skipping common prefixes
      expect(extractServiceFromPath("services/api/src/index.ts")).toBe("services/api");
      expect(extractServiceFromPath("services/github-app/src/handler.ts")).toBe(
        "services/github-app"
      );
      expect(extractServiceFromPath("packages/shared/src/utils.ts")).toBe("packages/shared");
    });

    it("should return 'other' for unknown structure", () => {
      // Single directory with just a file returns 'other'
      expect(extractServiceFromPath("index.ts")).toBe("other");
    });

    it("should skip common directory prefixes", () => {
      // 'src' is a skip directory, so it returns the next meaningful dir
      expect(extractServiceFromPath("src/utils/helpers.ts")).toBe("utils");
    });
  });

  describe("formatServiceNameKebab", () => {
    it("should format service name in kebab case", () => {
      expect(formatServiceNameKebab("api")).toBe("api");
      expect(formatServiceNameKebab("github-app")).toBe("github-app");
    });

    it("should convert slashes to hyphens", () => {
      expect(formatServiceNameKebab("services/api")).toBe("services-api");
      expect(formatServiceNameKebab("packages/shared")).toBe("packages-shared");
    });
  });

  describe("formatServiceNameTitle", () => {
    it("should format service name in title case", () => {
      expect(formatServiceNameTitle("api")).toBe("Api");
    });

    it("should convert slashes to spaces and title case each word", () => {
      expect(formatServiceNameTitle("services/api")).toBe("Services Api");
      expect(formatServiceNameTitle("packages/shared")).toBe("Packages Shared");
    });
  });

  describe("groupByServicePath", () => {
    it("should group items by service path", () => {
      const items = [
        { path: "services/api/src/index.ts", message: "Error 1" },
        { path: "services/api/src/utils.ts", message: "Error 2" },
        { path: "services/github-app/src/handler.ts", message: "Error 3" },
      ];

      const result = groupByServicePath(items);

      // Returns a Map
      expect(result).toBeInstanceOf(Map);
      expect(result.has("services/api")).toBe(true);
      expect(result.has("services/github-app")).toBe(true);
      expect(result.get("services/api")).toHaveLength(2);
      expect(result.get("services/github-app")).toHaveLength(1);
    });

    it("should handle empty array", () => {
      const result = groupByServicePath([]);

      expect(result.size).toBe(0);
    });
  });

  describe("stripAbsolutePaths", () => {
    it("should strip absolute paths from text", () => {
      const text = "Error in /home/user/project/src/index.ts at line 42";
      const result = stripAbsolutePaths(text);

      expect(result).not.toContain("/home/user/project");
      expect(result).toContain("src/index.ts");
    });

    it("should handle text without absolute paths", () => {
      const text = "Error in src/index.ts at line 42";
      const result = stripAbsolutePaths(text);

      expect(result).toBe(text);
    });

    it("should handle empty string", () => {
      expect(stripAbsolutePaths("")).toBe("");
    });
  });
});
