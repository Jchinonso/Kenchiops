/**
 * Unit tests for Context Aggregator
 *
 * Note: fetchDependencyChanges and fetchBuildConfigChanges were removed
 * as part of the language-agnostic migration. dependencyChanges and
 * buildConfigChanges are now always empty arrays - AI extracts these
 * from the PR diff directly.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { gatherEnrichedContext } from "../../services/context/contextAggregator.js";
import type { CheckRunWebhook } from "../../types/githubTypes.js";
import type {
  WorkflowTiming,
  CommitInfo,
  PRMetadata,
  CheckRunAnnotation,
  SourceFile,
  TestFailure,
  RepositoryMetadata,
} from "../../services/context/types.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  GITHUB_CONTEXT_LIMITS: {
    MAX_FILES: 10,
    MAX_LOG_LENGTH: 50000,
    MAX_DIFF_LENGTH: 20000,
    MAX_FILE_LENGTH: 5000,
    MAX_LOG_SIZE: 100000,
  },
  redactSecrets: jest.fn((text: string) => text.replace(/secret/gi, "[REDACTED]")),
  redactSecretsWithStats: jest.fn((text: string) => {
    const redactedCount = (text.match(/secret/gi) || []).length;
    const redactedTypes = redactedCount > 0 ? ["generic"] : [];
    return {
      text: text.replace(/secret/gi, "[REDACTED]"),
      redactedCount,
      redactedTypes,
    };
  }),
  deduplicateByKey: jest.fn(<T>(items: T[], keyFn: (item: T) => string): T[] => {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of items) {
      const key = keyFn(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  }),
}));

// Mock workflow fetcher
jest.mock("../../services/context/workflowFetcher.js", () => ({
  fetchWorkflowLogs: jest.fn(),
  fetchWorkflowTiming: jest.fn(),
}));

// Mock PR fetcher (removed fetchDependencyChanges and fetchBuildConfigChanges)
jest.mock("../../services/context/prFetcher.js", () => ({
  fetchPRDiff: jest.fn(),
  fetchPRMetadata: jest.fn(),
  fetchChangedFiles: jest.fn(),
}));

// Mock commit fetcher
jest.mock("../../services/context/commitFetcher.js", () => ({
  fetchCommitInfo: jest.fn(),
  fetchSourceFile: jest.fn(),
  fetchRepositoryMetadata: jest.fn(),
}));

// Mock annotation fetcher
jest.mock("../../services/context/annotationFetcher.js", () => ({
  fetchCheckRunAnnotations: jest.fn(),
}));

// Mock log parser
jest.mock("../../services/context/logParser.js", () => ({
  extractFileReferences: jest.fn(),
  extractTestFailures: jest.fn(),
  truncateWithContext: jest.fn((content: string) => content),
}));

// Import mocked functions after jest.mock
import { fetchWorkflowLogs, fetchWorkflowTiming } from "../../services/context/workflowFetcher.js";
import {
  fetchPRDiff,
  fetchPRMetadata,
  fetchChangedFiles,
} from "../../services/context/prFetcher.js";
import {
  fetchCommitInfo,
  fetchSourceFile,
  fetchRepositoryMetadata,
} from "../../services/context/commitFetcher.js";
import { fetchCheckRunAnnotations } from "../../services/context/annotationFetcher.js";
import { extractFileReferences, extractTestFailures } from "../../services/context/logParser.js";

// Type mocked functions
const mockFetchWorkflowLogs = fetchWorkflowLogs as jest.MockedFunction<typeof fetchWorkflowLogs>;
const mockFetchWorkflowTiming = fetchWorkflowTiming as jest.MockedFunction<
  typeof fetchWorkflowTiming
>;
const mockFetchPRDiff = fetchPRDiff as jest.MockedFunction<typeof fetchPRDiff>;
const mockFetchPRMetadata = fetchPRMetadata as jest.MockedFunction<typeof fetchPRMetadata>;
const mockFetchChangedFiles = fetchChangedFiles as jest.MockedFunction<typeof fetchChangedFiles>;
const mockFetchCommitInfo = fetchCommitInfo as jest.MockedFunction<typeof fetchCommitInfo>;
const mockFetchSourceFile = fetchSourceFile as jest.MockedFunction<typeof fetchSourceFile>;
const mockFetchRepositoryMetadata = fetchRepositoryMetadata as jest.MockedFunction<
  typeof fetchRepositoryMetadata
>;
const mockFetchCheckRunAnnotations = fetchCheckRunAnnotations as jest.MockedFunction<
  typeof fetchCheckRunAnnotations
>;
const mockExtractFileReferences = extractFileReferences as jest.MockedFunction<
  typeof extractFileReferences
>;
const mockExtractTestFailures = extractTestFailures as jest.MockedFunction<
  typeof extractTestFailures
>;

describe("Context Aggregator", () => {
  // Test fixtures
  const createMockWebhook = (overrides: Partial<CheckRunWebhook> = {}): CheckRunWebhook => ({
    action: "completed",
    check_run: {
      id: 12345,
      name: "CI Build",
      conclusion: "failure",
      head_sha: "abc123def456789012345678901234567890abcd",
      output: {
        title: "Build Failed",
        summary: "Tests failed",
        text: "See logs for details",
      },
      pull_requests: [
        {
          number: 123,
          head: { sha: "abc123", ref: "feature-branch" },
          base: { sha: "def456", ref: "main" },
        },
      ],
    },
    repository: {
      full_name: "testowner/testrepo",
      owner: { login: "testowner" },
      name: "testrepo",
    },
    installation: {
      id: 12345,
    },
    ...overrides,
  });

  const createMockWorkflowLogs = (): string => `
    [2024-01-01T10:00:00Z] Running tests...
    [2024-01-01T10:00:01Z] FAIL src/index.test.ts
    [2024-01-01T10:00:01Z] ● Test suite failed
    [2024-01-01T10:00:01Z] Error: Expected 2 to equal 3
  `;

  const createMockWorkflowTiming = (): WorkflowTiming => ({
    workflowName: "CI",
    jobName: "build-and-test",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: "2024-01-01T10:05:30Z",
    durationMs: 330000,
    conclusion: "failure",
  });

  const createMockCommitInfo = (): CommitInfo => ({
    sha: "abc123def456789012345678901234567890abcd",
    message: "feat: add new feature",
    author: "Test Author",
    committer: "Test Committer",
    timestamp: "2024-01-01T09:00:00Z",
    changedFiles: ["src/index.ts", "src/utils.ts"],
  });

  const createMockPRMetadata = (): PRMetadata => ({
    number: 123,
    title: "Add new feature",
    description: "This PR adds a new feature",
    author: "testuser",
    baseBranch: "main",
    headBranch: "feature-branch",
    labels: ["enhancement"],
    isDraft: false,
    reviewStatus: "pending",
    reviewers: ["reviewer1", "reviewer2"],
    comments: [
      {
        author: "reviewer1",
        body: "Looks good!",
        createdAt: "2024-01-01T09:30:00Z",
      },
    ],
  });

  const createMockAnnotations = (): CheckRunAnnotation[] => [
    {
      path: "src/index.ts",
      startLine: 10,
      endLine: 10,
      level: "failure",
      message: "Type error: Expected string but got number",
      title: "Type Error",
    },
    {
      path: "src/utils.ts",
      startLine: 25,
      endLine: 27,
      level: "warning",
      message: "Unused variable",
      title: "Warning",
    },
  ];

  const createMockSourceFile = (path: string): SourceFile => ({
    path,
    content: `// File: ${path}\nexport const foo = 'bar';`,
    startLine: 1,
    endLine: 50,
  });

  const createMockTestFailures = (): TestFailure[] => [
    {
      testName: "should calculate sum correctly",
      error: "Expected 5 to equal 6",
      file: "src/math.test.ts",
    },
  ];

  const createMockRepositoryMetadata = (): RepositoryMetadata => ({
    id: 123456,
    name: "testrepo",
    fullName: "testowner/testrepo",
    owner: "testowner",
    defaultBranch: "main",
    isPrivate: false,
    language: "TypeScript",
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock return values
    mockFetchWorkflowLogs.mockResolvedValue(createMockWorkflowLogs());
    mockFetchWorkflowTiming.mockResolvedValue(createMockWorkflowTiming());
    mockFetchCommitInfo.mockResolvedValue(createMockCommitInfo());
    mockFetchPRDiff.mockResolvedValue("diff --git a/src/index.ts b/src/index.ts\n+new code");
    mockFetchPRMetadata.mockResolvedValue(createMockPRMetadata());
    mockFetchChangedFiles.mockResolvedValue(["src/index.ts", "package.json"]);
    mockFetchCheckRunAnnotations.mockResolvedValue(createMockAnnotations());
    mockFetchRepositoryMetadata.mockResolvedValue(createMockRepositoryMetadata());
    mockExtractFileReferences.mockReturnValue([
      { path: "src/index.ts", line: 10 },
      { path: "src/utils.ts", line: 25 },
    ]);
    mockExtractTestFailures.mockReturnValue(createMockTestFailures());
    mockFetchSourceFile.mockResolvedValue(createMockSourceFile("src/index.ts"));
  });

  describe("gatherEnrichedContext", () => {
    describe("successful context gathering", () => {
      it("should gather all context when PR is present", async () => {
        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result).toBeDefined();
        expect(result.workflowLogs).toBeDefined();
        expect(result.commitInfo).toBeDefined();
        expect(result.prDiff).toBeDefined();
        expect(result.annotations).toHaveLength(2);
        expect(result.testFailures).toHaveLength(1);
        expect(result.sourceFiles.length).toBeGreaterThan(0);
        expect(result.prMetadata).toBeDefined();
        // AI extracts these from diff now - always empty arrays
        expect(result.dependencyChanges).toHaveLength(0);
        expect(result.buildConfigChanges).toHaveLength(0);
        expect(result.repositoryMetadata).toBeDefined();
        expect(result.workflowTiming).toBeDefined();
      });

      it("should call all fetchers with correct parameters", async () => {
        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockFetchWorkflowLogs).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          "abc123def456789012345678901234567890abcd"
        );
        expect(mockFetchCommitInfo).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          "abc123def456789012345678901234567890abcd"
        );
        expect(mockFetchPRDiff).toHaveBeenCalledWith(12345, "testowner", "testrepo", 123);
        expect(mockFetchCheckRunAnnotations).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          12345
        );
        expect(mockFetchRepositoryMetadata).toHaveBeenCalledWith(12345, "testowner", "testrepo");
        expect(mockFetchWorkflowTiming).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          "abc123def456789012345678901234567890abcd"
        );
      });

      it("should fetch PR-specific context when PR exists", async () => {
        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockFetchPRMetadata).toHaveBeenCalledWith(12345, "testowner", "testrepo", 123);
        expect(mockFetchChangedFiles).toHaveBeenCalledWith(12345, "testowner", "testrepo", 123);
      });

      it("should fetch source files based on file references", async () => {
        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockFetchSourceFile).toHaveBeenCalled();
      });

      it("should extract test failures from workflow logs", async () => {
        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(mockExtractTestFailures).toHaveBeenCalledWith(expect.any(String));
        expect(result.testFailures).toHaveLength(1);
        expect(result.testFailures[0].testName).toBe("should calculate sum correctly");
      });
    });

    describe("context gathering without PR", () => {
      it("should handle check runs without PRs", async () => {
        const webhook = createMockWebhook({
          check_run: {
            id: 12345,
            name: "CI Build",
            conclusion: "failure",
            head_sha: "abc123def456789012345678901234567890abcd",
            output: { title: "Failed", summary: "Error", text: null },
            pull_requests: [],
          },
        });

        const result = await gatherEnrichedContext(webhook);

        expect(result.prDiff).toBeNull();
        expect(result.prMetadata).toBeNull();
        expect(result.dependencyChanges).toHaveLength(0);
        expect(result.buildConfigChanges).toHaveLength(0);
        expect(mockFetchPRDiff).not.toHaveBeenCalled();
        expect(mockFetchPRMetadata).not.toHaveBeenCalled();
      });

      it("should still gather non-PR context", async () => {
        const webhook = createMockWebhook({
          check_run: {
            id: 12345,
            name: "CI Build",
            conclusion: "failure",
            head_sha: "abc123def456789012345678901234567890abcd",
            output: { title: "Failed", summary: "Error", text: null },
            pull_requests: [],
          },
        });

        const result = await gatherEnrichedContext(webhook);

        expect(result.workflowLogs).toBeDefined();
        expect(result.commitInfo).toBeDefined();
        expect(result.annotations).toBeDefined();
        expect(result.repositoryMetadata).toBeDefined();
        expect(result.workflowTiming).toBeDefined();
      });
    });

    describe("missing installation ID", () => {
      it("should return empty context when installation ID is missing", async () => {
        const webhook = createMockWebhook({
          installation: undefined,
        });

        const result = await gatherEnrichedContext(webhook);

        expect(result.workflowLogs).toBeNull();
        expect(result.prDiff).toBeNull();
        expect(result.sourceFiles).toHaveLength(0);
        expect(result.commitInfo).toBeNull();
        expect(result.annotations).toHaveLength(0);
        expect(result.dependencyChanges).toHaveLength(0);
        expect(result.buildConfigChanges).toHaveLength(0);
        expect(result.testFailures).toHaveLength(0);
        expect(result.prMetadata).toBeNull();
        expect(result.repositoryMetadata).toBeNull();
        expect(result.workflowTiming).toBeNull();
      });
    });

    describe("secret redaction", () => {
      it("should redact secrets from workflow logs", async () => {
        mockFetchWorkflowLogs.mockResolvedValue("API_KEY=secret123\nRun tests");

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.workflowLogs).toContain("[REDACTED]");
        expect(result.workflowLogs).not.toContain("secret123");
      });

      it("should redact secrets from PR diff", async () => {
        mockFetchPRDiff.mockResolvedValue("+const SECRET='secret_value'");

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.prDiff).toContain("[REDACTED]");
      });

      it("should redact secrets from source files", async () => {
        mockFetchSourceFile.mockResolvedValue({
          path: "src/config.ts",
          content: "export const API_KEY = 'secret_key';",
          startLine: 1,
          endLine: 10,
        });

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.sourceFiles[0].content).toContain("[REDACTED]");
      });
    });

    describe("error handling", () => {
      it("should handle workflow logs fetch failure gracefully", async () => {
        mockFetchWorkflowLogs.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.workflowLogs).toBeNull();
        expect(result.testFailures).toHaveLength(0);
      });

      it("should handle commit info fetch failure", async () => {
        mockFetchCommitInfo.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.commitInfo).toBeNull();
      });

      it("should handle PR diff fetch failure", async () => {
        mockFetchPRDiff.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.prDiff).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should handle check run with multiple PRs", async () => {
        const webhook = createMockWebhook({
          check_run: {
            id: 12345,
            name: "CI Build",
            conclusion: "failure",
            head_sha: "abc123def456789012345678901234567890abcd",
            output: { title: "Failed", summary: "Error", text: null },
            pull_requests: [
              {
                number: 123,
                head: { sha: "abc123", ref: "feature1" },
                base: { sha: "def456", ref: "main" },
              },
              {
                number: 456,
                head: { sha: "abc123", ref: "feature2" },
                base: { sha: "def456", ref: "main" },
              },
            ],
          },
        });

        await gatherEnrichedContext(webhook);

        // Should use the first PR
        expect(mockFetchPRDiff).toHaveBeenCalledWith(12345, "testowner", "testrepo", 123);
      });

      it("should handle empty annotations", async () => {
        mockFetchCheckRunAnnotations.mockResolvedValue([]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.annotations).toHaveLength(0);
      });

      it("should handle no file references found", async () => {
        mockExtractFileReferences.mockReturnValue([]);
        mockFetchCheckRunAnnotations.mockResolvedValue([]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.sourceFiles).toHaveLength(0);
      });
    });

    describe("AI-first approach", () => {
      it("should always return empty arrays for dependency and build config changes", async () => {
        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        // AI extracts these from diff - not pre-parsed
        expect(result.dependencyChanges).toEqual([]);
        expect(result.buildConfigChanges).toEqual([]);
      });

      it("should provide diff for AI to analyze", async () => {
        const expectedDiff = "diff --git a/package.json b/package.json\n+axios@1.0.0";
        mockFetchPRDiff.mockResolvedValue(expectedDiff);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        // Diff is available for AI analysis
        expect(result.prDiff).toBe(expectedDiff);
      });
    });
  });
});
