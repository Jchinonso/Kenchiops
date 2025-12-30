/**
 * Tests for Workflow Service
 */

import {
  rerunWorkflow,
  rerunFailedJobs,
  rerequestCheckSuite,
  getCheckSuiteIdForRun,
  getWorkflowRunIdForCheckRun,
} from "../services/workflowService.js";
import { getOctokit } from "../services/githubService.js";

// Mock the githubService
jest.mock("../services/githubService.js", () => ({
  getOctokit: jest.fn(),
}));

const mockGetOctokit = getOctokit as jest.MockedFunction<typeof getOctokit>;

describe("workflowService", () => {
  const testInstallationId = 12345;
  const testOwner = "test-owner";
  const testRepo = "test-repo";
  const testWorkflowRunId = 98765;
  const testCheckSuiteId = 54321;
  const testCheckRunId = 11111;

  let mockOctokit: {
    rest: {
      actions: {
        reRunWorkflow: jest.Mock;
        reRunWorkflowFailedJobs: jest.Mock;
      };
      checks: {
        rerequestSuite: jest.Mock;
        get: jest.Mock;
      };
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockOctokit = {
      rest: {
        actions: {
          reRunWorkflow: jest.fn(),
          reRunWorkflowFailedJobs: jest.fn(),
        },
        checks: {
          rerequestSuite: jest.fn(),
          get: jest.fn(),
        },
      },
    };

    mockGetOctokit.mockResolvedValue(
      mockOctokit as unknown as Awaited<ReturnType<typeof getOctokit>>
    );
  });

  describe("rerunWorkflow", () => {
    it("should successfully rerun a workflow", async () => {
      mockOctokit.rest.actions.reRunWorkflow.mockResolvedValue({});

      const result = await rerunWorkflow(
        testInstallationId,
        testOwner,
        testRepo,
        testWorkflowRunId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain(String(testWorkflowRunId));
      expect(result.runId).toBe(testWorkflowRunId);
      expect(mockOctokit.rest.actions.reRunWorkflow).toHaveBeenCalledWith({
        owner: testOwner,
        repo: testRepo,
        run_id: testWorkflowRunId,
      });
    });

    it("should handle rerun failure", async () => {
      const errorMessage = "Workflow not found";
      mockOctokit.rest.actions.reRunWorkflow.mockRejectedValue(new Error(errorMessage));

      const result = await rerunWorkflow(
        testInstallationId,
        testOwner,
        testRepo,
        testWorkflowRunId
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Failed to rerun workflow");
      expect(result.error).toBe(errorMessage);
    });

    it("should handle API errors gracefully", async () => {
      mockOctokit.rest.actions.reRunWorkflow.mockRejectedValue(
        new Error("API rate limit exceeded")
      );

      const result = await rerunWorkflow(
        testInstallationId,
        testOwner,
        testRepo,
        testWorkflowRunId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("API rate limit exceeded");
    });
  });

  describe("rerunFailedJobs", () => {
    it("should successfully rerun failed jobs", async () => {
      mockOctokit.rest.actions.reRunWorkflowFailedJobs.mockResolvedValue({});

      const result = await rerunFailedJobs(
        testInstallationId,
        testOwner,
        testRepo,
        testWorkflowRunId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("Failed jobs rerun triggered");
      expect(result.runId).toBe(testWorkflowRunId);
      expect(mockOctokit.rest.actions.reRunWorkflowFailedJobs).toHaveBeenCalledWith({
        owner: testOwner,
        repo: testRepo,
        run_id: testWorkflowRunId,
      });
    });

    it("should handle failure when rerunning failed jobs", async () => {
      const errorMessage = "No failed jobs to rerun";
      mockOctokit.rest.actions.reRunWorkflowFailedJobs.mockRejectedValue(new Error(errorMessage));

      const result = await rerunFailedJobs(
        testInstallationId,
        testOwner,
        testRepo,
        testWorkflowRunId
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Failed to rerun failed jobs");
      expect(result.error).toBe(errorMessage);
    });
  });

  describe("rerequestCheckSuite", () => {
    it("should successfully rerequest a check suite", async () => {
      mockOctokit.rest.checks.rerequestSuite.mockResolvedValue({});

      const result = await rerequestCheckSuite(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckSuiteId
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("Check suite rerequest triggered");
      expect(mockOctokit.rest.checks.rerequestSuite).toHaveBeenCalledWith({
        owner: testOwner,
        repo: testRepo,
        check_suite_id: testCheckSuiteId,
      });
    });

    it("should handle failure when rerequesting check suite", async () => {
      const errorMessage = "Check suite not found";
      mockOctokit.rest.checks.rerequestSuite.mockRejectedValue(new Error(errorMessage));

      const result = await rerequestCheckSuite(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckSuiteId
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("Failed to rerequest check suite");
      expect(result.error).toBe(errorMessage);
    });
  });

  describe("getCheckSuiteIdForRun", () => {
    it("should return check suite ID when found", async () => {
      mockOctokit.rest.checks.get.mockResolvedValue({
        data: {
          check_suite: {
            id: testCheckSuiteId,
          },
        },
      });

      const result = await getCheckSuiteIdForRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBe(testCheckSuiteId);
      expect(mockOctokit.rest.checks.get).toHaveBeenCalledWith({
        owner: testOwner,
        repo: testRepo,
        check_run_id: testCheckRunId,
      });
    });

    it("should return null when check suite is not present", async () => {
      mockOctokit.rest.checks.get.mockResolvedValue({
        data: {
          check_suite: null,
        },
      });

      const result = await getCheckSuiteIdForRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBeNull();
    });

    it("should return null when check_suite.id is undefined", async () => {
      mockOctokit.rest.checks.get.mockResolvedValue({
        data: {
          check_suite: {},
        },
      });

      const result = await getCheckSuiteIdForRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBeNull();
    });

    it("should return null on API error", async () => {
      mockOctokit.rest.checks.get.mockRejectedValue(new Error("API error"));

      const result = await getCheckSuiteIdForRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBeNull();
    });
  });

  describe("getWorkflowRunIdForCheckRun", () => {
    it("should extract workflow run ID from details_url", async () => {
      mockOctokit.rest.checks.get.mockResolvedValue({
        data: {
          details_url: "https://github.com/test-owner/test-repo/actions/runs/123456/job/789",
        },
      });

      const result = await getWorkflowRunIdForCheckRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBe(123456);
    });

    it("should return null when details_url is missing", async () => {
      mockOctokit.rest.checks.get.mockResolvedValue({
        data: {
          details_url: null,
        },
      });

      const result = await getWorkflowRunIdForCheckRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBeNull();
    });

    it("should return null when details_url does not contain workflow run pattern", async () => {
      mockOctokit.rest.checks.get.mockResolvedValue({
        data: {
          details_url: "https://github.com/test-owner/test-repo/pull/123",
        },
      });

      const result = await getWorkflowRunIdForCheckRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBeNull();
    });

    it("should return null on API error", async () => {
      mockOctokit.rest.checks.get.mockRejectedValue(new Error("API error"));

      const result = await getWorkflowRunIdForCheckRun(
        testInstallationId,
        testOwner,
        testRepo,
        testCheckRunId
      );

      expect(result).toBeNull();
    });

    it("should handle various workflow run URL formats", async () => {
      // Test different URL formats
      const testCases = [
        {
          url: "https://github.com/owner/repo/actions/runs/999999",
          expected: 999999,
        },
        {
          url: "https://github.com/owner/repo/actions/runs/1/job/2",
          expected: 1,
        },
        {
          url: "https://github.com/owner/repo/actions/runs/12345678901234",
          expected: 12345678901234,
        },
      ];

      for (const testCase of testCases) {
        mockOctokit.rest.checks.get.mockResolvedValue({
          data: {
            details_url: testCase.url,
          },
        });

        const result = await getWorkflowRunIdForCheckRun(
          testInstallationId,
          testOwner,
          testRepo,
          testCheckRunId
        );

        expect(result).toBe(testCase.expected);
      }
    });
  });
});
