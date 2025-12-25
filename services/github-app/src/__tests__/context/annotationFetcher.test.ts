/**
 * Unit tests for Annotation Fetcher Service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { fetchCheckRunAnnotations } from "../../services/context/annotationFetcher.js";
import type { CheckRunAnnotation } from "../../services/context/types.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  GITHUB_CONTEXT_LIMITS: {
    MAX_LOG_SIZE: 50000,
    MAX_DIFF_SIZE: 30000,
    MAX_FILE_SIZE: 10000,
    MAX_FILES: 5,
    MAX_ANNOTATIONS: 20,
  },
}));

// Mock Octokit instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListAnnotations = jest.fn() as jest.MockedFunction<any>;

const mockOctokit = {
  rest: {
    checks: {
      listAnnotations: mockListAnnotations,
    },
  },
};

jest.mock("../../services/githubService.js", () => ({
  getOctokit: jest.fn(() => Promise.resolve(mockOctokit)),
}));

// Import mocks after jest.mock
import { getOctokit } from "../../services/githubService.js";
const mockGetOctokit = getOctokit as jest.MockedFunction<typeof getOctokit>;

describe("Annotation Fetcher Service", () => {
  // Test fixtures
  const mockInstallationId = 12345;
  const mockOwner = "testowner";
  const mockRepo = "testrepo";
  const mockCheckRunId = 987654321;

  const createMockAnnotation = (overrides = {}) => ({
    path: "src/index.ts",
    start_line: 10,
    end_line: 10,
    annotation_level: "failure" as const,
    message: "Type error: expected string",
    title: "Type Error",
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockGetOctokit.mockResolvedValue(mockOctokit as any);

    mockListAnnotations.mockResolvedValue({
      data: [createMockAnnotation()],
    } as any);
  });

  describe("fetchCheckRunAnnotations", () => {
    it("should fetch annotations successfully", async () => {
      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([
        {
          path: "src/index.ts",
          startLine: 10,
          endLine: 10,
          level: "failure",
          message: "Type error: expected string",
          title: "Type Error",
        },
      ]);
      expect(mockGetOctokit).toHaveBeenCalledWith(mockInstallationId);
      expect(mockListAnnotations).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        check_run_id: mockCheckRunId,
        per_page: 20,
      });
    });

    it("should handle multiple annotations with various levels", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            path: "src/error.ts",
            start_line: 5,
            end_line: 5,
            annotation_level: "failure",
            message: "Critical error",
            title: "Error",
          }),
          createMockAnnotation({
            path: "src/warning.ts",
            start_line: 15,
            end_line: 15,
            annotation_level: "warning",
            message: "Potential issue",
            title: "Warning",
          }),
          createMockAnnotation({
            path: "src/info.ts",
            start_line: 20,
            end_line: 20,
            annotation_level: "notice",
            message: "FYI",
            title: "Notice",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toHaveLength(3);
      expect(annotations[0].level).toBe("failure");
      expect(annotations[1].level).toBe("warning");
      expect(annotations[2].level).toBe("notice");
    });

    it("should filter out annotations without messages", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            path: "src/valid.ts",
            message: "Valid error message",
          }),
          createMockAnnotation({
            path: "src/empty.ts",
            message: "",
          }),
          createMockAnnotation({
            path: "src/null.ts",
            message: null,
          }),
          createMockAnnotation({
            path: "src/undefined.ts",
            message: undefined,
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toHaveLength(1);
      expect(annotations[0].path).toBe("src/valid.ts");
      expect(annotations[0].message).toBe("Valid error message");
    });

    it("should map annotation data correctly", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          {
            path: "src/component.tsx",
            start_line: 42,
            end_line: 45,
            annotation_level: "warning",
            message: "Unused variable 'count'",
            title: "ESLint: no-unused-vars",
          },
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([
        {
          path: "src/component.tsx",
          startLine: 42,
          endLine: 45,
          level: "warning",
          message: "Unused variable 'count'",
          title: "ESLint: no-unused-vars",
        },
      ]);
    });

    it("should handle annotations without title", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            title: null,
          }),
          createMockAnnotation({
            title: undefined,
          }),
          createMockAnnotation({
            title: "",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toHaveLength(3);
      expect(annotations[0].title).toBeUndefined();
      expect(annotations[1].title).toBeUndefined();
      expect(annotations[2].title).toBeUndefined();
    });

    it("should handle empty annotations array", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
      expect(mockListAnnotations).toHaveBeenCalled();
    });

    it("should respect GITHUB_CONTEXT_LIMITS.MAX_ANNOTATIONS", async () => {
      await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(mockListAnnotations).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        check_run_id: mockCheckRunId,
        per_page: 20,
      });
    });

    it("should handle API errors gracefully and return empty array", async () => {
      mockListAnnotations.mockRejectedValue(new Error("GitHub API error"));

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });

    it("should handle getOctokit failure and return empty array", async () => {
      mockGetOctokit.mockRejectedValue(new Error("Failed to get Octokit"));

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
      expect(mockListAnnotations).not.toHaveBeenCalled();
    });

    it("should handle network errors gracefully", async () => {
      mockListAnnotations.mockRejectedValue(new Error("ECONNREFUSED"));

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });

    it("should handle 404 errors gracefully", async () => {
      const error = new Error("Not Found");
      (error as any).status = 404;
      mockListAnnotations.mockRejectedValue(error);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });

    it("should handle 403 forbidden errors gracefully", async () => {
      const error = new Error("Forbidden");
      (error as any).status = 403;
      mockListAnnotations.mockRejectedValue(error);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });

    it("should handle rate limit errors gracefully", async () => {
      const error = new Error("Rate limit exceeded");
      (error as any).status = 429;
      mockListAnnotations.mockRejectedValue(error);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });

    it("should handle unknown error types gracefully", async () => {
      mockListAnnotations.mockRejectedValue("string error");

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });

    it("should handle error objects without message property", async () => {
      mockListAnnotations.mockRejectedValue({
        toString: () => "Custom error",
      });

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });
  });

  describe("annotation level mapping", () => {
    it("should map 'failure' level correctly", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            annotation_level: "failure",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].level).toBe("failure");
    });

    it("should map 'warning' level correctly", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            annotation_level: "warning",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].level).toBe("warning");
    });

    it("should map 'notice' level correctly", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            annotation_level: "notice",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].level).toBe("notice");
    });
  });

  describe("annotation data completeness", () => {
    it("should include all required annotation fields", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [createMockAnnotation()],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      const annotation = annotations[0];
      expect(annotation).toHaveProperty("path");
      expect(annotation).toHaveProperty("startLine");
      expect(annotation).toHaveProperty("endLine");
      expect(annotation).toHaveProperty("level");
      expect(annotation).toHaveProperty("message");
    });

    it("should handle multi-line annotations", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            start_line: 10,
            end_line: 15,
            message: "Multi-line error spanning 5 lines",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].startLine).toBe(10);
      expect(annotations[0].endLine).toBe(15);
    });

    it("should handle single-line annotations", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            start_line: 42,
            end_line: 42,
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].startLine).toBe(42);
      expect(annotations[0].endLine).toBe(42);
    });

    it("should handle annotations with long messages", async () => {
      const longMessage = "A".repeat(500);
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            message: longMessage,
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].message).toBe(longMessage);
      expect(annotations[0].message.length).toBe(500);
    });

    it("should handle annotations with special characters in messages", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            message: "Error: <div> element should use \"className\" instead of 'class'",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].message).toContain("<div>");
      expect(annotations[0].message).toContain('"className"');
      expect(annotations[0].message).toContain("'class'");
    });

    it("should handle annotations with newlines in messages", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            message: "Error on line 1\nCaused by line 2\nSee line 3",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].message).toContain("\n");
      expect(annotations[0].message.split("\n")).toHaveLength(3);
    });

    it("should handle annotations with various file paths", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({ path: "src/index.ts" }),
          createMockAnnotation({ path: "packages/shared/src/utils.ts" }),
          createMockAnnotation({ path: "test/__tests__/unit.test.ts" }),
          createMockAnnotation({ path: "README.md" }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].path).toBe("src/index.ts");
      expect(annotations[1].path).toBe("packages/shared/src/utils.ts");
      expect(annotations[2].path).toBe("test/__tests__/unit.test.ts");
      expect(annotations[3].path).toBe("README.md");
    });
  });

  describe("edge cases", () => {
    it("should handle maximum number of annotations", async () => {
      const maxAnnotations = Array.from({ length: 20 }, (_, i) =>
        createMockAnnotation({
          path: `src/file${i}.ts`,
          message: `Error ${i}`,
        })
      );

      mockListAnnotations.mockResolvedValue({
        data: maxAnnotations,
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toHaveLength(20);
    });

    it("should handle annotations at line 0", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            start_line: 0,
            end_line: 0,
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].startLine).toBe(0);
      expect(annotations[0].endLine).toBe(0);
    });

    it("should handle annotations with very large line numbers", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            start_line: 999999,
            end_line: 999999,
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].startLine).toBe(999999);
    });

    it("should handle mixed valid and invalid annotations", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({ message: "Valid message 1" }),
          createMockAnnotation({ message: "" }),
          createMockAnnotation({ message: "Valid message 2" }),
          createMockAnnotation({ message: null }),
          createMockAnnotation({ message: "Valid message 3" }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toHaveLength(3);
      expect(annotations[0].message).toBe("Valid message 1");
      expect(annotations[1].message).toBe("Valid message 2");
      expect(annotations[2].message).toBe("Valid message 3");
    });

    it("should handle null data response", async () => {
      mockListAnnotations.mockResolvedValue({
        data: null,
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });

    it("should handle undefined data response", async () => {
      mockListAnnotations.mockResolvedValue({
        data: undefined,
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations).toEqual([]);
    });
  });

  describe("real-world scenarios", () => {
    it("should handle TypeScript compiler errors", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            path: "src/types.ts",
            start_line: 15,
            end_line: 15,
            annotation_level: "failure",
            message: "Type 'string' is not assignable to type 'number'.",
            title: "TS2322",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].level).toBe("failure");
      expect(annotations[0].message).toContain("not assignable");
      expect(annotations[0].title).toBe("TS2322");
    });

    it("should handle ESLint warnings", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            path: "src/component.tsx",
            start_line: 42,
            end_line: 42,
            annotation_level: "warning",
            message: "'React' must be in scope when using JSX",
            title: "react/react-in-jsx-scope",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].level).toBe("warning");
      expect(annotations[0].message).toContain("React");
      expect(annotations[0].title).toContain("react/");
    });

    it("should handle test failure annotations", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            path: "src/__tests__/app.test.ts",
            start_line: 25,
            end_line: 25,
            annotation_level: "failure",
            message: "Expected 200 to be 201",
            title: "Test Failure",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].path).toContain("__tests__");
      expect(annotations[0].message).toContain("Expected");
    });

    it("should handle security vulnerability annotations", async () => {
      mockListAnnotations.mockResolvedValue({
        data: [
          createMockAnnotation({
            path: "package.json",
            start_line: 1,
            end_line: 1,
            annotation_level: "warning",
            message: "Dependency lodash has known security vulnerabilities",
            title: "Security Alert",
          }),
        ],
      } as any);

      const annotations = await fetchCheckRunAnnotations(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockCheckRunId
      );

      expect(annotations[0].level).toBe("warning");
      expect(annotations[0].message).toContain("security");
    });
  });
});
