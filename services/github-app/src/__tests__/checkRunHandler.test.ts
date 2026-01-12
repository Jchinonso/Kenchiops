/**
 * Unit tests for Check Run Handler
 *
 * Tests the simplified CI failure analysis pipeline:
 * 1. Fetch workflow logs from GitHub
 * 2. Preprocess and send to LLM
 * 3. Return formatted outputs
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
          root_cause: "Missing dependency",
          confidence: "high",
          category: "dependency",
          phase: "dependency",
          annotations: [],
          next_steps: ["Run npm install"],
        },
        status: 200,
        retryCount: 0,
        duration: 100,
      })
    ),
    preprocessLogsWithMetadata: jest.fn((logs: string) => ({
      logs: logs.substring(0, 1000),
      originalSize: logs.length,
      processedSize: Math.min(logs.length, 1000),
      wasTruncated: logs.length > 1000,
      secretsRedacted: 0,
    })),
    formatGitHubComment: jest.fn(() => ({
      markdown: "## Test Comment",
      truncated: false,
    })),
    formatSlackMessage: jest.fn(() => ({
      blocks: [],
      text: "Test message",
    })),
    config: {
      API_URL: "http://localhost:3001",
    },
  };
});

// Mock githubService to prevent @octokit/auth-app ESM import issues
jest.mock("../services/githubService.js", () => ({
  getOctokit: jest.fn(() =>
    Promise.resolve({
      rest: {
        repos: {
          listPullRequestsAssociatedWithCommit: jest.fn(() =>
            Promise.resolve({ data: [{ number: 123 }] })
          ),
        },
        actions: {
          listWorkflowRunsForRepo: jest.fn(() =>
            Promise.resolve({
              data: {
                workflow_runs: [
                  {
                    id: 1,
                    head_sha: "abc123def456789012345678901234567890abcd",
                    logs_url: "https://api.github.com/logs",
                  },
                ],
              },
            })
          ),
          downloadWorkflowRunLogs: jest.fn(() => Promise.resolve({ data: "test log content" })),
        },
      },
    })
  ),
  postPRComment: jest.fn(() => Promise.resolve()),
  createCheckRunWithAnnotations: jest.fn(() => Promise.resolve()),
}));

// Mock workflow fetcher
jest.mock("../services/context/workflowFetcher.js", () => ({
  fetchWorkflowLogs: jest.fn(() => Promise.resolve("Error: Test failure log\nStack trace here")),
}));

// Mock success handler
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
import { fetchWorkflowLogs } from "../services/context/workflowFetcher.js";
import { resilientPost, preprocessLogsWithMetadata } from "@kenchi/shared";

// Get the mocked functions
const mockResilientPost = resilientPost as jest.MockedFunction<typeof resilientPost>;
const mockFetchWorkflowLogs = fetchWorkflowLogs as jest.MockedFunction<typeof fetchWorkflowLogs>;
const mockPreprocessLogs = preprocessLogsWithMetadata as jest.MockedFunction<
  typeof preprocessLogsWithMetadata
>;

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

    // Reset mocks to default implementations
    mockFetchWorkflowLogs.mockResolvedValue("Error: Test failure log\nStack trace here");
    mockResilientPost.mockResolvedValue({
      data: {
        root_cause: "Missing dependency",
        confidence: "high",
        category: "dependency",
        phase: "dependency",
        annotations: [],
        next_steps: ["Run npm install"],
      },
      status: 200,
      retryCount: 0,
      duration: 100,
    });
    mockPreprocessLogs.mockReturnValue({
      logs: "Error: Test failure log",
      originalSize: 100,
      processedSize: 100,
      wasTruncated: false,
      secretsRedacted: 0,
    });
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

    it("should process successful check runs for passive learning", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.SUCCESS,
        },
      });

      const result = await handleCheckRun(webhook);

      // Success is handled for passive learning
      expect(result.handled).toBe(true);
      expect(result.message).toContain("passive learning");
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
      expect(mockFetchWorkflowLogs).toHaveBeenCalled();
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
      expect(mockFetchWorkflowLogs).not.toHaveBeenCalled();
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
  });

  describe("handleCheckRunFailure", () => {
    it("should fetch workflow logs", async () => {
      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockFetchWorkflowLogs).toHaveBeenCalledWith(
        12345,
        "testowner",
        "testrepo",
        "abc123def456789012345678901234567890abcd"
      );
    });

    it("should preprocess logs before sending to API", async () => {
      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockPreprocessLogs).toHaveBeenCalled();
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

    it("should handle missing installation ID", async () => {
      const webhook = createMockWebhook({ installation: undefined });
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });

    it("should handle API errors gracefully", async () => {
      mockResilientPost.mockRejectedValueOnce(new Error("API error"));

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });

    it("should handle missing workflow logs", async () => {
      mockFetchWorkflowLogs.mockResolvedValueOnce(null);

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });

    it("should include repository info in API payload", async () => {
      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          repository: "testowner/testrepo",
          failure_log: expect.any(String),
        })
      );
    });

    it("should return success result when analysis succeeds", async () => {
      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(true);
      expect(result.eventId).toContain("12345");
    });

    it("should handle network errors", async () => {
      mockResilientPost.mockRejectedValueOnce(new Error("Network error"));

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });
  });

  describe("simplified analysis pipeline", () => {
    it("should call workflow fetcher with correct parameters", async () => {
      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockFetchWorkflowLogs).toHaveBeenCalledWith(
        12345, // installation ID
        "testowner", // owner
        "testrepo", // repo
        "abc123def456789012345678901234567890abcd" // head SHA
      );
    });

    it("should send preprocessed logs to API", async () => {
      mockPreprocessLogs.mockReturnValue({
        logs: "preprocessed log content",
        originalSize: 1000,
        processedSize: 500,
        wasTruncated: true,
        secretsRedacted: 2,
      });

      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          failure_log: "preprocessed log content",
        })
      );
    });

    it("should handle empty logs gracefully", async () => {
      mockFetchWorkflowLogs.mockResolvedValueOnce("");

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      // Empty logs should fail gracefully
      expect(result.handled).toBe(false);
    });
  });
});
