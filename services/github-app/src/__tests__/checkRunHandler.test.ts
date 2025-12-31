/**
 * Unit tests for Check Run Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    // Mock resilient HTTP client - prevent actual network calls
    resilientPost: jest.fn(() =>
      Promise.resolve({
        data: {
          confidence: 0.85,
          analysis: "Build failure analysis",
          identified_cause: "Missing dependency",
          recommended_actions: [{ description: "Run npm install", priority: "high" }],
        },
        status: 200,
        retryCount: 0,
        duration: 100,
      })
    ),
    // Cache mocks - return null/miss to trigger API call
    getCachedCheckAnalysis: jest.fn(() => Promise.resolve(null)),
    cacheCheckAnalysis: jest.fn(() => Promise.resolve()),
    getCachedAnalysisByLogHash: jest.fn(() => Promise.resolve(null)),
    cacheAnalysisByLogHash: jest.fn(() => Promise.resolve()),
    generateLogHash: jest.fn(() => "test-hash-123"),
    buildCachedAnalysis: jest.fn(
      (
        repo: string,
        sha: string,
        check: string,
        data: { confidence?: number; identified_cause?: string; analysis?: string }
      ) => ({
        repository: repo,
        commitSha: sha,
        checkName: check,
        confidence: data.confidence ?? 0.5,
        identifiedCause: data.identified_cause ?? "",
        analysis: data.analysis ?? "",
        annotations: [],
        recommendedActions: [],
        analyzedAt: new Date().toISOString(),
      })
    ),
    // Redis aggregator mock
    addFailureToRedis: jest.fn(() => Promise.resolve()),
  };
});

jest.mock("../services/context/index.js", () => ({
  gatherEnrichedContext: jest.fn(() =>
    Promise.resolve({
      workflowLogs: "test logs",
      prDiff: "test diff",
      commitInfo: {
        sha: "abc123def456789012345678901234567890abcd",
        message: "test commit",
        author: "testuser",
        committer: "testuser",
        timestamp: "2024-01-15T10:00:00Z",
        changedFiles: ["src/index.ts"],
      },
      prMetadata: {
        number: 123,
        title: "Test PR",
        description: "Test description",
        author: "testuser",
        headBranch: "feature",
        baseBranch: "main",
        labels: [],
        isDraft: false,
        reviewStatus: "pending" as const,
        reviewers: [],
        comments: [],
      },
      annotations: [],
      testFailures: [],
      sourceFiles: [],
      workflowTiming: {
        workflowName: "CI",
        jobName: "build",
        startedAt: "2024-01-15T10:00:00Z",
        completedAt: "2024-01-15T10:02:00Z",
        durationMs: 120000,
        conclusion: "failure",
      },
      dependencyChanges: [],
      buildConfigChanges: [],
      repositoryMetadata: null,
    })
  ),
  fetchPRsByCommit: jest.fn(() => Promise.resolve([123])),
}));

jest.mock("../formatters/checkRunFormatter.js", () => ({
  buildEnrichedLogContent: jest.fn(() => "enriched log content"),
}));

jest.mock("../handlers/checkRunSuccessHandler.js", () => ({
  handleCheckRunSuccess: jest.fn(() =>
    Promise.resolve({
      handled: true,
      message: "Success processed for passive learning",
    })
  ),
}));

// Import handlers after mocks
import { handleCheckRun, handleCheckRunFailure } from "../handlers/checkRunHandler.js";
import { gatherEnrichedContext, fetchPRsByCommit } from "../services/context/index.js";
import { resilientPost, addFailureToRedis } from "@kenchi/shared";

// Get the mocked functions
const mockResilientPost = resilientPost as jest.MockedFunction<typeof resilientPost>;
const mockAddFailureToRedis = addFailureToRedis as jest.MockedFunction<typeof addFailureToRedis>;

const mockGatherEnrichedContext = gatherEnrichedContext as jest.MockedFunction<
  typeof gatherEnrichedContext
>;
const mockFetchPRsByCommit = fetchPRsByCommit as jest.MockedFunction<typeof fetchPRsByCommit>;

describe("Check Run Handler", () => {
  // Test fixtures
  const createMockWebhook = (overrides: Partial<CheckRunWebhook> = {}): CheckRunWebhook => ({
    action: GITHUB_CHECK_ACTIONS.COMPLETED,
    check_run: {
      id: 12345,
      name: "CI Build",
      conclusion: GITHUB_CHECK_CONCLUSIONS.FAILURE,
      head_sha: "abc123def456789012345678901234567890abcd",
      output: {
        title: "Build failed",
        summary: "Tests failed",
        text: "Error details",
      },
      pull_requests: [
        {
          number: 123,
          head: { sha: "abc123", ref: "feature" },
          base: { sha: "def456", ref: "main" },
        },
      ],
    },
    repository: {
      full_name: "testowner/testrepo",
      owner: { login: "testowner" },
      name: "testrepo",
    },
    installation: { id: 12345 },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations - reset resilientPost to default success response
    mockResilientPost.mockResolvedValue({
      data: {
        confidence: 0.85,
        analysis: "Build failure analysis",
        identified_cause: "Missing dependency",
        recommended_actions: [{ description: "Run npm install", priority: "high" }],
      },
      status: 200,
      retryCount: 0,
      duration: 100,
    });

    mockGatherEnrichedContext.mockResolvedValue({
      workflowLogs: "test logs",
      prDiff: "test diff",
      commitInfo: {
        sha: "abc123def456789012345678901234567890abcd",
        message: "test commit",
        author: "testuser",
        committer: "testuser",
        timestamp: "2024-01-15T10:00:00Z",
        changedFiles: ["src/index.ts"],
      },
      prMetadata: {
        number: 123,
        title: "Test PR",
        description: "Test description",
        author: "testuser",
        headBranch: "feature",
        baseBranch: "main",
        labels: [],
        isDraft: false,
        reviewStatus: "pending" as const,
        reviewers: [],
        comments: [],
      },
      annotations: [],
      testFailures: [],
      sourceFiles: [],
      workflowTiming: {
        workflowName: "CI",
        jobName: "build",
        startedAt: "2024-01-15T10:00:00Z",
        completedAt: "2024-01-15T10:02:00Z",
        durationMs: 120000,
        conclusion: "failure",
      },
      dependencyChanges: [],
      buildConfigChanges: [],
      repositoryMetadata: null,
    });

    mockFetchPRsByCommit.mockResolvedValue([123]);

    // Reset Redis aggregator mock
    mockAddFailureToRedis.mockResolvedValue();
  });

  describe("handleCheckRun", () => {
    it("should process failure check runs", async () => {
      const webhook = createMockWebhook();
      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("analyzed");
      expect(result.eventId).toBeDefined();
    });

    it("should skip non-completed check runs", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_CHECK_ACTIONS.CREATED,
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("skipped");
    });

    it("should process successful check runs for passive learning without failure analysis", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.SUCCESS,
        },
      });

      const result = await handleCheckRun(webhook);

      // Success is now handled for passive learning (fix comment capture)
      expect(result.handled).toBe(true);
      expect(result.message).toContain("passive learning");
      // But should not gather enriched context (that's for failures)
      expect(mockGatherEnrichedContext).not.toHaveBeenCalled();
    });

    it("should process timed_out conclusions as failures", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.TIMED_OUT,
        },
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(true);
      expect(mockGatherEnrichedContext).toHaveBeenCalled();
    });

    it("should skip neutral conclusions", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.NEUTRAL,
        },
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(false);
      expect(mockGatherEnrichedContext).not.toHaveBeenCalled();
    });

    it("should skip cancelled conclusions", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.CANCELLED,
        },
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(false);
    });

    it("should process successful check runs for passive learning", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.SUCCESS,
          pull_requests: [
            {
              number: 123,
              head: { sha: "abc", ref: "feat1" },
              base: { sha: "def", ref: "main" },
            },
            {
              number: 456,
              head: { sha: "ghi", ref: "feat2" },
              base: { sha: "jkl", ref: "main" },
            },
          ],
        },
      });

      const result = await handleCheckRun(webhook);

      // Success is handled for passive learning (fix comment capture)
      expect(result.handled).toBe(true);
      expect(result.message).toContain("passive learning");
      // But should not gather enriched context (that's for failures)
      expect(mockGatherEnrichedContext).not.toHaveBeenCalled();
    });

    it("should fetch PRs by commit when not in webhook", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          pull_requests: [],
        },
      });

      mockFetchPRsByCommit.mockResolvedValue([123, 456]);

      await handleCheckRun(webhook);

      expect(mockFetchPRsByCommit).toHaveBeenCalledWith(
        12345,
        "testowner",
        "testrepo",
        webhook.check_run.head_sha
      );
    });
  });

  describe("handleCheckRunFailure", () => {
    it("should gather enriched context", async () => {
      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockGatherEnrichedContext).toHaveBeenCalledWith(webhook);
    });

    it("should call API for analysis", async () => {
      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.stringContaining("analyze"),
        expect.objectContaining({
          failure_log: expect.any(String),
          repository: "testowner/testrepo",
        })
      );
    });

    it("should add failure to Redis aggregator", async () => {
      const webhook = createMockWebhook();

      await handleCheckRunFailure(webhook);

      expect(mockAddFailureToRedis).toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      mockResilientPost.mockRejectedValueOnce(new Error("API error"));

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("Failed");
    });

    it("should handle missing installation ID", async () => {
      const webhook = createMockWebhook({ installation: undefined });
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });

    it("should include analysis metadata in Redis aggregator", async () => {
      const webhook = createMockWebhook();

      await handleCheckRunFailure(webhook);

      expect(mockAddFailureToRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryFullName: "testowner/testrepo",
          commitSha: webhook.check_run.head_sha,
        }),
        expect.objectContaining({
          checkRunId: webhook.check_run.id,
          checkName: webhook.check_run.name,
          confidence: 0.85,
          identifiedCause: "Missing dependency",
        }),
        expect.objectContaining({
          installationId: 12345,
          repositoryInfo: expect.any(Object),
          pullRequestNumbers: expect.any(Array),
        })
      );
    });

    it("should handle network errors", async () => {
      mockResilientPost.mockRejectedValueOnce(new Error("Network error"));

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });

    it("should convert AI annotations when available", async () => {
      mockResilientPost.mockResolvedValueOnce({
        data: {
          confidence: 0.85,
          analysis: "Analysis",
          identified_cause: "Cause",
          recommended_actions: [],
          full_analysis: {
            codeAnnotations: [
              {
                path: "src/index.ts",
                line: 10,
                level: "failure",
                message: "Error here",
                title: "Test Error",
              },
            ],
          },
        },
        status: 200,
        retryCount: 0,
        duration: 100,
      });

      const webhook = createMockWebhook();

      await handleCheckRunFailure(webhook);

      expect(mockAddFailureToRedis).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          annotations: expect.arrayContaining([
            expect.objectContaining({
              path: "src/index.ts",
              line: 10,
              level: "failure",
            }),
          ]),
        }),
        expect.objectContaining({
          installationId: expect.any(Number),
          repositoryInfo: expect.any(Object),
          pullRequestNumbers: expect.any(Array),
        })
      );
    });

    it("should fallback to GitHub annotations when no AI annotations", async () => {
      mockGatherEnrichedContext.mockResolvedValue({
        workflowLogs: "logs",
        prDiff: "diff",
        commitInfo: {
          sha: "abc123def456789012345678901234567890abcd",
          message: "commit",
          author: "testuser",
          committer: "testuser",
          timestamp: "2024-01-15T10:00:00Z",
          changedFiles: ["test.ts"],
        },
        prMetadata: null,
        annotations: [
          {
            path: "test.ts",
            startLine: 5,
            endLine: 5,
            level: "warning",
            message: "GitHub annotation",
            title: "Warning",
          },
        ],
        testFailures: [],
        sourceFiles: [],
        workflowTiming: null,
        dependencyChanges: [],
        buildConfigChanges: [],
        repositoryMetadata: null,
      });

      const webhook = createMockWebhook();

      await handleCheckRunFailure(webhook);

      expect(mockAddFailureToRedis).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          annotations: expect.arrayContaining([
            expect.objectContaining({
              path: "test.ts",
              line: 5,
            }),
          ]),
        }),
        expect.objectContaining({
          installationId: expect.any(Number),
          repositoryInfo: expect.any(Object),
          pullRequestNumbers: expect.any(Array),
        })
      );
    });

    it("should include PR context when available", async () => {
      const webhook = createMockWebhook();

      await handleCheckRunFailure(webhook);

      expect(mockAddFailureToRedis).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          prContext: expect.objectContaining({
            number: 123,
            title: "Test PR",
            author: "testuser",
          }),
        })
      );
    });

    it("should include workflow context when available", async () => {
      const webhook = createMockWebhook();

      await handleCheckRunFailure(webhook);

      expect(mockAddFailureToRedis).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          workflowContext: expect.objectContaining({
            name: "CI Build",
            duration: expect.any(String),
          }),
        })
      );
    });

    it("should handle aggregator errors", async () => {
      mockAddFailureToRedis.mockRejectedValueOnce(new Error("Aggregator error"));

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });
  });
});
