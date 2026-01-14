/**
 * Unit tests for Consolidated Poster Service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { postConsolidatedAnalysis } from "../services/aggregation/consolidatedPoster.js";
import type { AggregatedFailures } from "@kenchi/shared";

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
    // Mock Redis health check - return false to use HTTP fallback
    isRedisHealthy: jest.fn(() => Promise.resolve(false)),
    // Mock enqueue function (not used when Redis unhealthy, but needed for import)
    enqueueConsolidatedNotification: jest.fn(() => Promise.resolve("msg_123")),
    // Mock resilient HTTP client - prevent actual network calls and retries
    resilientPost: jest.fn(() =>
      Promise.resolve({
        data: { success: true },
        status: 200,
        retryCount: 0,
        duration: 50,
      })
    ),
  };
});

// Mock github service with module-level mocks
jest.mock("../services/githubService.js", () => ({
  postPRComment: jest.fn(),
  createCheckRunWithAnnotations: jest.fn(),
}));

// Import mocks after jest.mock - use explicit typing
import { postPRComment, createCheckRunWithAnnotations } from "../services/githubService.js";
import { resilientPost } from "@kenchi/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPostPRComment = postPRComment as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateCheckRunWithAnnotations = createCheckRunWithAnnotations as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResilientPost = resilientPost as jest.MockedFunction<any>;

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
        testFailures: [],
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
    // Reset resilientPost to default success response
    mockResilientPost.mockResolvedValue({
      data: { success: true },
      status: 200,
      retryCount: 0,
      duration: 50,
    });
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

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.stringContaining("slack"),
        expect.objectContaining({
          repository: "testowner/testrepo",
          consolidated: true,
        })
      );
    });

    it("should include consolidated flag in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ consolidated: true })
      );
    });

    it("should include repository info in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ repository: "testowner/testrepo" })
      );
    });

    it("should include failure count in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ failure_count: 1 })
      );
    });

    it("should create check annotations", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockCreateCheckRunWithAnnotations).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: 12345,
          owner: "testowner",
          repo: "testrepo",
          headSha: expect.any(String),
          name: "KenchiOps Analysis",
          summary: expect.any(String),
          annotations: expect.any(Array),
        })
      );
    });

    it("should handle PR comment failures gracefully", async () => {
      mockPostPRComment.mockRejectedValueOnce(new Error("GitHub API error"));

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle Slack failures gracefully", async () => {
      mockResilientPost.mockRejectedValueOnce(new Error("Slack API error"));

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
      mockResilientPost.mockImplementation(() => {
        callOrder.push("slack");
        return Promise.resolve({
          data: { success: true },
          status: 200,
          retryCount: 0,
          duration: 50,
        });
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
      mockPostPRComment.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Failed"));

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

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ commit_sha: "abc123def456789012345678901234567890abcd" })
      );
    });

    it("should include installation ID in Slack payload", async () => {
      const aggregation = createMockAggregation();
      await postConsolidatedAnalysis(aggregation);

      expect(mockResilientPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ installation_id: 12345 })
      );
    });

    it("should handle network errors for Slack", async () => {
      mockResilientPost.mockRejectedValueOnce(new Error("Network error"));

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.slackMessageSent).toBe(false);
      expect(result.errors.some((err) => err.includes("Network error"))).toBe(true);
    });

    it("should skip check annotations when none available", async () => {
      // Create aggregation with failures that have no annotations
      const aggregation = createMockAggregation();
      const aggregationWithNoAnnotations = {
        ...aggregation,
        failures: aggregation.failures.map((failure) => ({
          ...failure,
          annotations: [], // No annotations
        })),
      };

      await postConsolidatedAnalysis(aggregationWithNoAnnotations);

      expect(mockCreateCheckRunWithAnnotations).not.toHaveBeenCalled();
    });
  });

  describe("error collection", () => {
    it("should collect all errors from different services", async () => {
      mockPostPRComment.mockRejectedValueOnce(new Error("PR error"));
      mockCreateCheckRunWithAnnotations.mockRejectedValueOnce(new Error("Check error"));
      mockResilientPost.mockRejectedValueOnce(new Error("Slack error"));

      const aggregation = createMockAggregation();
      const result = await postConsolidatedAnalysis(aggregation);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.success).toBe(false);
    });
  });
});
