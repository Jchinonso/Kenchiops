/**
 * Unit tests for Context Aggregator
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { gatherEnrichedContext } from "../../services/context/contextAggregator.js";
import type { CheckRunWebhook } from "../../types/githubTypes.js";
import type {
  WorkflowTiming,
  CommitInfo,
  PRMetadata,
  CheckRunAnnotation,
  DependencyChange,
  BuildConfigChange,
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

// Mock PR fetcher
jest.mock("../../services/context/prFetcher.js", () => ({
  fetchPRDiff: jest.fn(),
  fetchPRMetadata: jest.fn(),
  fetchDependencyChanges: jest.fn(),
  fetchBuildConfigChanges: jest.fn(),
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
  truncateWithContext: jest.fn((content: string) => content), // Returns content unchanged
}));

// Import mocked functions after jest.mock
import { fetchWorkflowLogs, fetchWorkflowTiming } from "../../services/context/workflowFetcher.js";
import {
  fetchPRDiff,
  fetchPRMetadata,
  fetchDependencyChanges,
  fetchBuildConfigChanges,
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
const mockFetchDependencyChanges = fetchDependencyChanges as jest.MockedFunction<
  typeof fetchDependencyChanges
>;
const mockFetchBuildConfigChanges = fetchBuildConfigChanges as jest.MockedFunction<
  typeof fetchBuildConfigChanges
>;
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

  const createMockDependencyChanges = (): DependencyChange[] => [
    {
      name: "jest",
      type: "updated",
      oldVersion: "29.0.0",
      newVersion: "29.5.0",
    },
    {
      name: "typescript",
      type: "updated",
      oldVersion: "5.0.0",
      newVersion: "5.3.0",
    },
  ];

  const createMockBuildConfigChanges = (): BuildConfigChange[] => [
    {
      file: "tsconfig.json",
      diff: '- "target": "ES2020"\n+ "target": "ES2022"',
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
    mockFetchDependencyChanges.mockResolvedValue(createMockDependencyChanges());
    mockFetchBuildConfigChanges.mockResolvedValue(createMockBuildConfigChanges());
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
        expect(result.dependencyChanges).toHaveLength(2);
        expect(result.buildConfigChanges).toHaveLength(1);
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

        expect(mockFetchDependencyChanges).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          123
        );
        expect(mockFetchBuildConfigChanges).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          123
        );
        expect(mockFetchPRMetadata).toHaveBeenCalledWith(12345, "testowner", "testrepo", 123);
      });

      it("should fetch source files based on file references", async () => {
        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockFetchSourceFile).toHaveBeenCalled();
        expect(mockFetchSourceFile).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          expect.any(String),
          "abc123def456789012345678901234567890abcd",
          expect.any(Number)
        );
      });

      it("should extract test failures from workflow logs", async () => {
        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(mockExtractTestFailures).toHaveBeenCalledWith(expect.any(String));
        expect(result.testFailures).toHaveLength(1);
        expect(result.testFailures[0].testName).toBe("should calculate sum correctly");
      });

      it("should extract file references from logs and annotations", async () => {
        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockExtractFileReferences).toHaveBeenCalledWith(expect.stringContaining("FAIL"));
      });

      it("should combine file references from annotations and logs", async () => {
        mockExtractFileReferences.mockReturnValue([{ path: "src/new.ts", line: 5 }]);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        // Should have called fetchSourceFile for annotation files + log files
        expect(mockFetchSourceFile).toHaveBeenCalled();
      });

      it("should filter null source files", async () => {
        mockFetchSourceFile.mockResolvedValueOnce(null);
        mockFetchSourceFile.mockResolvedValueOnce(createMockSourceFile("src/valid.ts"));

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.sourceFiles).toHaveLength(1);
        expect(result.sourceFiles[0].path).toBe("src/valid.ts");
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

      it("should not call any fetchers when installation ID is missing", async () => {
        const webhook = createMockWebhook({
          installation: undefined,
        });

        await gatherEnrichedContext(webhook);

        expect(mockFetchWorkflowLogs).not.toHaveBeenCalled();
        expect(mockFetchCommitInfo).not.toHaveBeenCalled();
        expect(mockFetchPRDiff).not.toHaveBeenCalled();
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

      it("should redact secrets from commit messages", async () => {
        mockFetchCommitInfo.mockResolvedValue({
          sha: "abc123",
          message: "fix: update secret token",
          author: "Test Author",
          committer: "Test Committer",
          timestamp: "2024-01-01T09:00:00Z",
          changedFiles: ["src/index.ts"],
        });

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.commitInfo?.message).toContain("[REDACTED]");
      });

      it("should redact secrets from annotations", async () => {
        mockFetchCheckRunAnnotations.mockResolvedValue([
          {
            path: "src/index.ts",
            startLine: 10,
            endLine: 10,
            level: "failure",
            message: "Found secret in code",
            title: "Security Issue",
          },
        ]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.annotations[0].message).toContain("[REDACTED]");
      });

      it("should redact secrets from test failures", async () => {
        mockExtractTestFailures.mockReturnValue([
          {
            testName: "auth test",
            error: "Expected secret to be defined",
            file: "src/auth.test.ts",
          },
        ]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.testFailures[0].error).toContain("[REDACTED]");
      });

      it("should redact secrets from PR metadata description", async () => {
        mockFetchPRMetadata.mockResolvedValue({
          number: 123,
          title: "Update config",
          description: "Updated secret key configuration",
          author: "testuser",
          baseBranch: "main",
          headBranch: "feature",
          labels: [],
          isDraft: false,
          reviewStatus: "pending",
          reviewers: [],
          comments: [],
        });

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.prMetadata?.description).toContain("[REDACTED]");
      });

      it("should redact secrets from PR comments", async () => {
        mockFetchPRMetadata.mockResolvedValue({
          number: 123,
          title: "Update config",
          description: null,
          author: "testuser",
          baseBranch: "main",
          headBranch: "feature",
          labels: [],
          isDraft: false,
          reviewStatus: "pending",
          reviewers: [],
          comments: [
            {
              author: "reviewer",
              body: "Don't commit the secret key",
              createdAt: "2024-01-01T10:00:00Z",
            },
          ],
        });

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.prMetadata?.comments[0].body).toContain("[REDACTED]");
      });

      it("should redact secrets from build config changes", async () => {
        mockFetchBuildConfigChanges.mockResolvedValue([
          {
            file: ".env",
            diff: "+API_SECRET=secret_value\n-API_SECRET=old_secret",
          },
        ]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.buildConfigChanges[0].diff).toContain("[REDACTED]");
      });
    });

    describe("parallel execution", () => {
      it("should fetch phase 1 data in parallel", async () => {
        const webhook = createMockWebhook();

        await gatherEnrichedContext(webhook);

        // All phase 1 fetchers should be called
        expect(mockFetchWorkflowLogs).toHaveBeenCalled();
        expect(mockFetchCommitInfo).toHaveBeenCalled();
        expect(mockFetchCheckRunAnnotations).toHaveBeenCalled();
        expect(mockFetchRepositoryMetadata).toHaveBeenCalled();
        expect(mockFetchWorkflowTiming).toHaveBeenCalled();
      });

      it("should fetch phase 2 PR data in parallel after phase 1", async () => {
        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        // Phase 2 PR-specific fetchers should be called
        expect(mockFetchDependencyChanges).toHaveBeenCalled();
        expect(mockFetchBuildConfigChanges).toHaveBeenCalled();
        expect(mockFetchPRMetadata).toHaveBeenCalled();
      });

      it("should fetch source files in parallel", async () => {
        mockExtractFileReferences.mockReturnValue([
          { path: "src/file1.ts", line: 1 },
          { path: "src/file2.ts", line: 2 },
          { path: "src/file3.ts", line: 3 },
        ]);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        // fetchSourceFile should be called multiple times
        expect(mockFetchSourceFile.mock.calls.length).toBeGreaterThan(1);
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

      it("should handle annotations fetch failure", async () => {
        mockFetchCheckRunAnnotations.mockResolvedValue([]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.annotations).toHaveLength(0);
      });

      it("should handle repository metadata fetch failure", async () => {
        mockFetchRepositoryMetadata.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.repositoryMetadata).toBeNull();
      });

      it("should handle workflow timing fetch failure", async () => {
        mockFetchWorkflowTiming.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.workflowTiming).toBeNull();
      });

      it("should handle dependency changes fetch failure", async () => {
        mockFetchDependencyChanges.mockResolvedValue([]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.dependencyChanges).toHaveLength(0);
      });

      it("should handle build config changes fetch failure", async () => {
        mockFetchBuildConfigChanges.mockResolvedValue([]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.buildConfigChanges).toHaveLength(0);
      });

      it("should handle PR metadata fetch failure", async () => {
        mockFetchPRMetadata.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.prMetadata).toBeNull();
      });

      it("should handle source file fetch failures by filtering nulls", async () => {
        mockFetchSourceFile.mockResolvedValueOnce(null);
        mockFetchSourceFile.mockResolvedValueOnce(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.sourceFiles).toHaveLength(0);
      });

      it("should handle empty workflow logs", async () => {
        mockFetchWorkflowLogs.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.workflowLogs).toBeNull();
        expect(result.testFailures).toHaveLength(0);
      });

      it("should handle null PR metadata description", async () => {
        mockFetchPRMetadata.mockResolvedValue({
          number: 123,
          title: "Test",
          description: null,
          author: "testuser",
          baseBranch: "main",
          headBranch: "feature",
          labels: [],
          isDraft: false,
          reviewStatus: "pending",
          reviewers: [],
          comments: [],
        });

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.prMetadata?.description).toBeNull();
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

      it("should handle null check run output fields", async () => {
        const webhook = createMockWebhook({
          check_run: {
            id: 12345,
            name: "CI Build",
            conclusion: "failure",
            head_sha: "abc123def456789012345678901234567890abcd",
            output: {
              title: null,
              summary: null,
              text: null,
            },
            pull_requests: [],
          },
        });

        const result = await gatherEnrichedContext(webhook);

        expect(result).toBeDefined();
        expect(mockExtractFileReferences).toHaveBeenCalled();
      });

      it("should deduplicate file references", async () => {
        mockExtractFileReferences.mockReturnValue([
          { path: "src/index.ts", line: 10 },
          { path: "src/index.ts", line: 20 },
        ]);
        mockFetchCheckRunAnnotations.mockResolvedValue([
          {
            path: "src/index.ts",
            startLine: 10,
            endLine: 10,
            level: "failure",
            message: "Error",
          },
        ]);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        // deduplicateByKey should be called to remove duplicates
        const { deduplicateByKey } = jest.requireMock("@kenchi/shared") as {
          deduplicateByKey: jest.Mock;
        };
        expect(deduplicateByKey).toHaveBeenCalled();
      });

      it("should prioritize annotation files over log files", async () => {
        mockFetchCheckRunAnnotations.mockResolvedValue([
          {
            path: "src/important.ts",
            startLine: 10,
            endLine: 10,
            level: "failure",
            message: "Critical error",
          },
        ]);
        mockExtractFileReferences.mockReturnValue([{ path: "src/other.ts", line: 5 }]);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        const { deduplicateByKey } = jest.requireMock("@kenchi/shared") as {
          deduplicateByKey: jest.Mock;
        };
        const callArgs = deduplicateByKey.mock.calls[0];
        const fileRefs = callArgs[0] as { path: string; line?: number }[];

        // Annotation files should come first
        expect(fileRefs[0].path).toBe("src/important.ts");
      });

      it("should extract all unique file references without artificial limits", async () => {
        const manyRefs = Array.from({ length: 20 }, (_, i) => ({
          path: `src/file${i}.ts`,
          line: i,
        }));
        mockExtractFileReferences.mockReturnValue(manyRefs);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        const { deduplicateByKey } = jest.requireMock("@kenchi/shared") as {
          deduplicateByKey: jest.Mock;
        };
        const callArgs = deduplicateByKey.mock.calls[0];
        const fileRefs = callArgs[0] as { path: string; line?: number }[];

        // Should include log file references + any annotation files (no artificial limit)
        // The exact count may include annotations from the mock webhook
        expect(fileRefs.length).toBeGreaterThanOrEqual(20);
      });

      it("should handle annotations with warnings and notices", async () => {
        mockFetchCheckRunAnnotations.mockResolvedValue([
          {
            path: "src/index.ts",
            startLine: 10,
            endLine: 10,
            level: "failure",
            message: "Error",
          },
          {
            path: "src/utils.ts",
            startLine: 20,
            endLine: 20,
            level: "warning",
            message: "Warning",
          },
          {
            path: "src/config.ts",
            startLine: 30,
            endLine: 30,
            level: "notice",
            message: "Notice",
          },
        ]);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        const { deduplicateByKey } = jest.requireMock("@kenchi/shared") as {
          deduplicateByKey: jest.Mock;
        };
        const callArgs = deduplicateByKey.mock.calls[0];
        const fileRefs = callArgs[0] as { path: string; line?: number }[];

        // Should only include failure and warning level annotations in file refs
        const annotationRefs = fileRefs.filter(
          (ref: { path: string }) => ref.path === "src/index.ts" || ref.path === "src/utils.ts"
        );
        expect(annotationRefs.length).toBeGreaterThan(0);
      });

      it("should handle empty dependency changes", async () => {
        mockFetchDependencyChanges.mockResolvedValue([]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.dependencyChanges).toHaveLength(0);
      });

      it("should handle empty build config changes", async () => {
        mockFetchBuildConfigChanges.mockResolvedValue([]);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.buildConfigChanges).toHaveLength(0);
      });
    });

    describe("data extraction", () => {
      it("should extract test failures from logs when logs are present", async () => {
        const logs = "FAIL test.ts\nExpected 1 to equal 2";
        mockFetchWorkflowLogs.mockResolvedValue(logs);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockExtractTestFailures).toHaveBeenCalledWith(logs);
      });

      it("should not extract test failures when logs are null", async () => {
        mockFetchWorkflowLogs.mockResolvedValue(null);

        const webhook = createMockWebhook();
        const result = await gatherEnrichedContext(webhook);

        expect(result.testFailures).toHaveLength(0);
      });

      it("should combine logs from multiple sources for file extraction", async () => {
        const webhook = createMockWebhook({
          check_run: {
            id: 12345,
            name: "CI Build",
            conclusion: "failure",
            head_sha: "abc123def456789012345678901234567890abcd",
            output: {
              title: "Error in src/index.ts",
              summary: "Failed at src/utils.ts",
              text: "See src/config.ts",
            },
            pull_requests: [],
          },
        });

        await gatherEnrichedContext(webhook);

        expect(mockExtractFileReferences).toHaveBeenCalledWith(
          expect.stringContaining("Error in src/index.ts")
        );
        expect(mockExtractFileReferences).toHaveBeenCalledWith(
          expect.stringContaining("Failed at src/utils.ts")
        );
        expect(mockExtractFileReferences).toHaveBeenCalledWith(
          expect.stringContaining("See src/config.ts")
        );
      });

      it("should fetch source files with line context when available", async () => {
        mockExtractFileReferences.mockReturnValue([{ path: "src/custom.ts", line: 42 }]);
        mockFetchCheckRunAnnotations.mockResolvedValue([]);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockFetchSourceFile).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          "src/custom.ts",
          "abc123def456789012345678901234567890abcd",
          42
        );
      });

      it("should fetch source files without line context when not available", async () => {
        mockExtractFileReferences.mockReturnValue([{ path: "src/nocontext.ts" }]);
        mockFetchCheckRunAnnotations.mockResolvedValue([]);

        const webhook = createMockWebhook();
        await gatherEnrichedContext(webhook);

        expect(mockFetchSourceFile).toHaveBeenCalledWith(
          12345,
          "testowner",
          "testrepo",
          "src/nocontext.ts",
          "abc123def456789012345678901234567890abcd",
          undefined
        );
      });
    });
  });
});
