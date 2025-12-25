/**
 * Unit tests for Consolidated Poster Service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { postConsolidatedAnalysis } from "../services/aggregation/consolidatedPoster.js";
import type { AggregatedFailures } from "../services/aggregation/types.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared");
  return {
    ...actual,
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

jest.mock("../formatters/consolidatedFormatter.js", () => ({
  buildConsolidatedPRComment: jest.fn(() => "## Consolidated PR Comment\nTest content"),
  buildConsolidatedSlackPayload: jest.fn(() => ({
    blocks: [{ type: "section", text: { type: "mrkdwn", text: "Test" } }],
    text: "CI Failure notification",
  })),
  buildConsolidatedCheckAnnotations: jest.fn(() => [
    {
      path: "src/index.ts",
      start_line: 10,
      end_line: 10,
      annotation_level: "failure",
      message: "Test error",
      title: "Error",
    },
  ]),
  buildConsolidatedCheckSummary: jest.fn(() => "## Summary\nTest summary"),
}));

// Mock global fetch - use type assertion to avoid strict typing issues
const mockFetch = jest.fn<typeof fetch>();
(global as { fetch: typeof fetch }).fetch = mockFetch;

// Mock github service with module-level mocks
jest.mock("../services/githubService.js", () => ({
  postPRComment: jest.fn(),
  createCheckRunWithAnnotations: jest.fn(),
}));

// Import mocks after jest.mock - use explicit typing
import { postPRComment, createCheckRunWithAnnotations } from "../services/githubService.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPostPRComment = postPRComment as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateCheckRunWithAnnotations = createCheckRunWithAnnotations as jest.MockedFunction<any>;

describe("Consolidated Poster Service", () => {
  // Test fixtures
  const createMockAggregation = (
    overrides: Partial<AggregatedFailures> = {}
  ): AggregatedFailures => ({
    commitSha: "abc123def456789012345678901234567890abcd",
    repository: {
      owner: "testowner",
      name: "testrepo",
      fullName: "testowner/testrepo",
    },
    installationId: 12345,
    pullRequestNumbers: [123],
    failures: [
      {
        checkRunId: 1,
        checkName: "CI Build",
        conclusion: "failure",
        analysis: "Build failed",
        confidence: 0.85,
        identifiedCause: "Missing dependency",
        recommendedActions: [{ description: "Run npm install", priority: "high" }],
        annotations: [{ path: "src/index.ts", line: 10, message: "Error", level: "failure" }],
        timestamp: new Date("2024-01-01T10:00:00Z"),
      },
    ],
    prContext: {
      number: 123,
      title: "Test PR",
      author: "testuser",
      branch: "feature",
      baseBranch: "main",
      labels: [],
    },
    workflowContext: null,
    firstFailureAt: new Date("2024-01-01T10:00:00Z"),
    lastFailureAt: new Date("2024-01-01T10:05:00Z"),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as Response);
  });

  describe("postConsolidatedAnalysis", () => {
    it("should return success result when all posts succeed", async () => {
      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.success).toBe(true);
      expect(result.prCommentsPosted).toBeGreaterThanOrEqual(0);
      expect(result.slackMessageSent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should post to GitHub PRs", async () => {
      const aggregation = createMockAggregation({ pullRequestNumbers: [123, 456] });
      await postConsolidatedAnalysis(aggregation);

      expect(mockPostPRComment).toHaveBeenCalled();
    });

    it("should post to Slack", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("slack"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should include consolidated flag in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.consolidated).toBe(true);
    });

    it("should include repository info in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.repository).toBe("testowner/testrepo");
    });

    it("should include failure count in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.failure_count).toBe(1);
    });

    it("should create check annotations", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockCreateCheckRunWithAnnotations).toHaveBeenCalledWith(
        12345,
        "testowner",
        "testrepo",
        expect.any(String),
        "KenchiOps Analysis",
        expect.any(String),
        expect.any(Array)
      );
    });

    it("should handle PR comment failures gracefully", async () => {
      mockPostPRComment.mockRejectedValueOnce(new Error("GitHub API error"));

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle Slack failures gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.slackMessageSent).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle check annotation failures gracefully", async () => {
      mockCreateCheckRunWithAnnotations.mockRejectedValueOnce(new Error("Check API error"));

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      // Should still succeed if PR comments and Slack work
      expect(result.checkAnnotationsCreated).toBe(false);
    });

    it("should handle no PRs gracefully", async () => {
      const aggregation = createMockAggregation({ pullRequestNumbers: [] });
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.prCommentsPosted).toBe(0);
      // Should still be successful if Slack works
      expect(result.slackMessageSent).toBe(true);
    });

    it("should post to multiple PRs", async () => {
      const aggregation = createMockAggregation({
        pullRequestNumbers: [123, 456, 789],
      });
      await postConsolidatedAnalysis(aggregation);

      // Should be called for each PR
      expect(mockPostPRComment).toHaveBeenCalledTimes(3);
    });

    it("should delete old comments before posting new ones", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      // The last argument should be true (deleteOldComments)
      expect(mockPostPRComment).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        true
      );
    });

    it("should run GitHub and Slack posts in parallel", async () => {
      // Track call order
      const callOrder: string[] = [];
      mockPostPRComment.mockImplementation(() => {
        callOrder.push("github");
        return Promise.resolve();
      });
      mockFetch.mockImplementation(() => {
        callOrder.push("slack");
        return Promise.resolve({ ok: true } as Response);
      });

      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      // Both should be called (order doesn't matter for parallel)
      expect(callOrder).toContain("github");
      expect(callOrder).toContain("slack");
    });

    it("should return correct result structure", async () => {
      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("prCommentsPosted");
      expect(result).toHaveProperty("slackMessageSent");
      expect(result).toHaveProperty("checkAnnotationsCreated");
      expect(result).toHaveProperty("errors");
    });

    it("should report partial success when some posts fail", async () => {
      // First PR succeeds, second fails
      mockPostPRComment
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Failed"));

      const aggregation = createMockAggregation({
        pullRequestNumbers: [123, 456],
      });
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.prCommentsPosted).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should include commit SHA in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.commit_sha).toBe("abc123def456789012345678901234567890abcd");
    });

    it("should include installation ID in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.installation_id).toBe(12345);
    });

    it("should handle network errors for Slack", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.slackMessageSent).toBe(false);
      expect(result.errors).toContain("Network error");
    });

    it("should skip check annotations when none available", async () => {
      const { buildConsolidatedCheckAnnotations } = jest.requireMock(
        "../formatters/consolidatedFormatter.js"
      ) as { buildConsolidatedCheckAnnotations: jest.Mock };
      buildConsolidatedCheckAnnotations.mockReturnValue([]);

      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockCreateCheckRunWithAnnotations).not.toHaveBeenCalled();
    });
  });

  describe("error collection", () => {
    it("should collect all errors from different services", async () => {
      mockPostPRComment.mockRejectedValueOnce(new Error("PR error"));
      mockCreateCheckRunWithAnnotations.mockRejectedValueOnce(new Error("Check error"));
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.success).toBe(false);
    });
  });
});
