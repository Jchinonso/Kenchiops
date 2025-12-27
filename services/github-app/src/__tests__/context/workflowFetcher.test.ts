/**
 * Unit tests for Workflow Fetcher Service
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { fetchWorkflowLogs, fetchWorkflowTiming } from "../../services/context/workflowFetcher.js";

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
  GITHUB_RETRY_CONFIG: {
    MAX_RETRIES: 3,
    BASE_DELAY_MS: 1000,
    BACKOFF_BASE: 2,
  },
}));

jest.mock("../../services/context/logParser.js", () => ({
  truncateWithContext: jest.fn((content: string) => content),
}));

// Mock Octokit instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListWorkflowRunsForRepo = jest.fn() as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListJobsForWorkflowRun = jest.fn() as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDownloadJobLogsForWorkflowRun = jest.fn() as jest.MockedFunction<any>;

const mockOctokit = {
  rest: {
    actions: {
      listWorkflowRunsForRepo: mockListWorkflowRunsForRepo,
      listJobsForWorkflowRun: mockListJobsForWorkflowRun,
      downloadJobLogsForWorkflowRun: mockDownloadJobLogsForWorkflowRun,
    },
  },
};

jest.mock("../../services/githubService.js", () => ({
  getOctokit: jest.fn(() => Promise.resolve(mockOctokit)),
}));

// Import mocks after jest.mock
import { getOctokit } from "../../services/githubService.js";
import { truncateWithContext } from "../../services/context/logParser.js";
const mockGetOctokit = getOctokit as jest.MockedFunction<typeof getOctokit>;
const mockTruncateWithContext = truncateWithContext as jest.MockedFunction<
  typeof truncateWithContext
>;

describe("Workflow Fetcher Service", () => {
  // Test fixtures
  const mockInstallationId = 12345;
  const mockOwner = "testowner";
  const mockRepo = "testrepo";
  const mockHeadSha = "abc123def456789012345678901234567890abcd";

  const createMockWorkflowRun = (overrides = {}) => ({
    id: 987654321,
    name: "CI Workflow",
    head_sha: mockHeadSha,
    conclusion: "failure",
    status: "completed",
    run_started_at: "2024-01-01T10:00:00Z",
    updated_at: "2024-01-01T10:05:00Z",
    ...overrides,
  });

  const createMockJob = (overrides = {}) => ({
    id: 111222333,
    name: "Build and Test",
    conclusion: "failure",
    status: "completed",
    started_at: "2024-01-01T10:00:00Z",
    completed_at: "2024-01-01T10:05:00Z",
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mock implementations
    mockGetOctokit.mockResolvedValue(mockOctokit as any);
    mockTruncateWithContext.mockImplementation((content: string) => content);

    mockListWorkflowRunsForRepo.mockResolvedValue({
      data: {
        workflow_runs: [createMockWorkflowRun()],
      },
    } as any);

    mockListJobsForWorkflowRun.mockResolvedValue({
      data: {
        jobs: [createMockJob()],
      },
    } as any);

    mockDownloadJobLogsForWorkflowRun.mockResolvedValue({
      data: "Sample workflow logs\nError: Test failed\nExit code 1",
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("fetchWorkflowLogs", () => {
    it("should fetch workflow logs successfully", async () => {
      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBe("Sample workflow logs\nError: Test failed\nExit code 1");
      expect(mockGetOctokit).toHaveBeenCalledWith(mockInstallationId);
      expect(mockListWorkflowRunsForRepo).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        head_sha: mockHeadSha,
        per_page: 5,
      });
    });

    it("should fetch logs for failed workflow run", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({ conclusion: "success" }),
            createMockWorkflowRun({ conclusion: "failure", id: 555 }),
          ],
        },
      } as any);

      await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(mockListJobsForWorkflowRun).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        run_id: 555,
      });
    });

    it("should use first run when no failed run exists", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({ conclusion: "success", id: 111 }),
            createMockWorkflowRun({ conclusion: "success", id: 222 }),
          ],
        },
      } as any);

      await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(mockListJobsForWorkflowRun).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        run_id: 111,
      });
    });

    it("should return null when no workflow runs found", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [],
        },
      } as any);

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
      expect(mockListJobsForWorkflowRun).not.toHaveBeenCalled();
    });

    it("should return null when no failed jobs found", async () => {
      mockListJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            createMockJob({ conclusion: "success" }),
            createMockJob({ conclusion: "success" }),
          ],
        },
      } as any);

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
      expect(mockDownloadJobLogsForWorkflowRun).not.toHaveBeenCalled();
    });

    it("should fetch logs for first failed job", async () => {
      const failedJob1 = createMockJob({ id: 111, conclusion: "failure" });
      const failedJob2 = createMockJob({ id: 222, conclusion: "failure" });

      mockListJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [failedJob1, failedJob2],
        },
      } as any);

      await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(mockDownloadJobLogsForWorkflowRun).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        job_id: 111,
      });
    });

    it("should truncate logs when exceeding max size", async () => {
      const longLogs = "x".repeat(60000);
      mockDownloadJobLogsForWorkflowRun.mockResolvedValue({
        data: longLogs,
      } as any);

      mockTruncateWithContext.mockReturnValue("truncated logs");

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(mockTruncateWithContext).toHaveBeenCalledWith(longLogs, 50000);
      expect(logs).toBe("truncated logs");
    });

    it("should handle string log data", async () => {
      mockDownloadJobLogsForWorkflowRun.mockResolvedValue({
        data: "String logs",
      } as any);

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBe("String logs");
    });

    it("should convert non-string log data to string", async () => {
      mockDownloadJobLogsForWorkflowRun.mockResolvedValue({
        data: Buffer.from("Buffer logs"),
      } as any);

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(typeof logs).toBe("string");
    });

    it("should return null when log download fails", async () => {
      mockDownloadJobLogsForWorkflowRun.mockRejectedValue(new Error("Logs not available"));

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
    });

    it("should return null when workflow runs API fails", async () => {
      mockListWorkflowRunsForRepo.mockRejectedValue(new Error("GitHub API error"));

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
    });

    it("should return null when jobs API fails", async () => {
      mockListJobsForWorkflowRun.mockRejectedValue(new Error("Jobs API error"));

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
    });

    describe("DNS error retry logic", () => {
      it("should retry on EAI_AGAIN DNS error", async () => {
        mockDownloadJobLogsForWorkflowRun
          .mockRejectedValueOnce(new Error("DNS lookup failed: EAI_AGAIN"))
          .mockResolvedValueOnce({ data: "Logs after retry" } as any);

        const promise = fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

        // Run timers for retry delays
        await jest.runAllTimersAsync();
        const logs = await promise;

        expect(mockDownloadJobLogsForWorkflowRun).toHaveBeenCalledTimes(2);
        expect(logs).toBe("Logs after retry");
      });

      it("should retry on ENOTFOUND DNS error", async () => {
        mockDownloadJobLogsForWorkflowRun
          .mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"))
          .mockResolvedValueOnce({ data: "Logs after retry" } as any);

        const promise = fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

        await jest.runAllTimersAsync();
        const logs = await promise;

        expect(mockDownloadJobLogsForWorkflowRun).toHaveBeenCalledTimes(2);
        expect(logs).toBe("Logs after retry");
      });

      it("should use exponential backoff for retries", async () => {
        mockDownloadJobLogsForWorkflowRun
          .mockRejectedValueOnce(new Error("EAI_AGAIN"))
          .mockRejectedValueOnce(new Error("EAI_AGAIN"))
          .mockResolvedValueOnce({ data: "Logs after retries" } as any);

        const promise = fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

        await jest.runAllTimersAsync();
        const logs = await promise;

        expect(mockDownloadJobLogsForWorkflowRun).toHaveBeenCalledTimes(3);
        expect(logs).toBe("Logs after retries");
      });

      it("should stop retrying after max retries", async () => {
        mockDownloadJobLogsForWorkflowRun.mockRejectedValue(new Error("EAI_AGAIN"));

        const promise = fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

        await jest.runAllTimersAsync();
        const logs = await promise;

        expect(mockDownloadJobLogsForWorkflowRun).toHaveBeenCalledTimes(3);
        expect(logs).toBeNull();
      });

      it("should not retry on non-DNS errors", async () => {
        mockDownloadJobLogsForWorkflowRun.mockRejectedValue(new Error("404 Not Found"));

        const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

        expect(mockDownloadJobLogsForWorkflowRun).toHaveBeenCalledTimes(1);
        expect(logs).toBeNull();
      });
    });

    it("should handle multiple workflow runs", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({ id: 1, conclusion: "success" }),
            createMockWorkflowRun({ id: 2, conclusion: "failure" }),
            createMockWorkflowRun({ id: 3, conclusion: "cancelled" }),
          ],
        },
      } as any);

      await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(mockListJobsForWorkflowRun).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        run_id: 2,
      });
    });

    it("should handle mixed success and failure jobs", async () => {
      mockListJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            createMockJob({ id: 1, conclusion: "success" }),
            createMockJob({ id: 2, conclusion: "failure" }),
            createMockJob({ id: 3, conclusion: "success" }),
            createMockJob({ id: 4, conclusion: "failure" }),
          ],
        },
      } as any);

      await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(mockDownloadJobLogsForWorkflowRun).toHaveBeenCalledWith({
        owner: mockOwner,
        repo: mockRepo,
        job_id: 2,
      });
    });
  });

  describe("fetchWorkflowTiming", () => {
    it("should fetch workflow timing successfully", async () => {
      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing).toEqual({
        workflowName: "CI Workflow",
        jobName: "Build and Test",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:05:00Z",
        durationMs: 5 * 60 * 1000, // 5 minutes
        conclusion: "failure",
      });
    });

    it("should calculate duration correctly", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({
              run_started_at: "2024-01-01T10:00:00Z",
              updated_at: "2024-01-01T10:02:30Z",
            }),
          ],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.durationMs).toBe(150000); // 2.5 minutes in ms
    });

    it("should return null duration when timestamps missing", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({
              run_started_at: null,
              updated_at: null,
            }),
          ],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.durationMs).toBeNull();
    });

    it("should return null when no workflow runs found", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing).toBeNull();
    });

    it("should use failed run for timing", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({ id: 1, conclusion: "success", name: "Success Run" }),
            createMockWorkflowRun({ id: 2, conclusion: "failure", name: "Failed Run" }),
          ],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.workflowName).toBe("Failed Run");
    });

    it("should include failed job name", async () => {
      mockListJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            createMockJob({ id: 1, name: "Build", conclusion: "success" }),
            createMockJob({ id: 2, name: "Test", conclusion: "failure" }),
          ],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.jobName).toBe("Test");
    });

    it("should return null job name when no failed jobs", async () => {
      mockListJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            createMockJob({ conclusion: "success" }),
            createMockJob({ conclusion: "success" }),
          ],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.jobName).toBeNull();
    });

    it("should handle workflow with unknown name", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [createMockWorkflowRun({ name: null })],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.workflowName).toBe("Unknown workflow");
    });

    it("should handle null conclusion", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [createMockWorkflowRun({ conclusion: null })],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.conclusion).toBeNull();
    });

    it("should return null when API call fails", async () => {
      mockListWorkflowRunsForRepo.mockRejectedValue(new Error("GitHub API error"));

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing).toBeNull();
    });

    it("should return null when jobs API fails", async () => {
      mockListJobsForWorkflowRun.mockRejectedValue(new Error("Jobs API error"));

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing).toBeNull();
    });

    it("should handle workflow runs with various conclusions", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({ conclusion: "success" }),
            createMockWorkflowRun({ conclusion: "failure" }),
            createMockWorkflowRun({ conclusion: "cancelled" }),
            createMockWorkflowRun({ conclusion: "skipped" }),
          ],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.conclusion).toBe("failure");
    });

    it("should include all timing fields", async () => {
      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing).toHaveProperty("workflowName");
      expect(timing).toHaveProperty("jobName");
      expect(timing).toHaveProperty("startedAt");
      expect(timing).toHaveProperty("completedAt");
      expect(timing).toHaveProperty("durationMs");
      expect(timing).toHaveProperty("conclusion");
    });

    it("should handle empty jobs array", async () => {
      mockListJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.jobName).toBeNull();
      expect(timing?.workflowName).toBe("CI Workflow");
    });
  });

  describe("error handling", () => {
    it("should handle unknown error types in fetchWorkflowLogs", async () => {
      mockListWorkflowRunsForRepo.mockRejectedValue("string error");

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
    });

    it("should handle unknown error types in fetchWorkflowTiming", async () => {
      mockListWorkflowRunsForRepo.mockRejectedValue({ custom: "error" });

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing).toBeNull();
    });

    it("should handle error objects without message property", async () => {
      mockDownloadJobLogsForWorkflowRun.mockRejectedValue({
        toString: () => "Custom error",
      });

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle workflow run with empty name", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [createMockWorkflowRun({ name: "" })],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.workflowName).toBe("Unknown workflow");
    });

    it("should handle job with null name", async () => {
      mockListJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [createMockJob({ name: null, conclusion: "failure" })],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.jobName).toBeNull();
    });

    it("should handle zero duration workflows", async () => {
      mockListWorkflowRunsForRepo.mockResolvedValue({
        data: {
          workflow_runs: [
            createMockWorkflowRun({
              run_started_at: "2024-01-01T10:00:00Z",
              updated_at: "2024-01-01T10:00:00Z",
            }),
          ],
        },
      } as any);

      const timing = await fetchWorkflowTiming(
        mockInstallationId,
        mockOwner,
        mockRepo,
        mockHeadSha
      );

      expect(timing?.durationMs).toBe(0);
    });

    it("should handle per_page limit correctly", async () => {
      await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(mockListWorkflowRunsForRepo).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 5,
        })
      );
    });

    it("should handle empty log content", async () => {
      mockDownloadJobLogsForWorkflowRun.mockResolvedValue({
        data: "",
      } as any);

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBe("");
    });

    it("should handle getOctokit failure", async () => {
      mockGetOctokit.mockRejectedValue(new Error("Failed to get Octokit"));

      const logs = await fetchWorkflowLogs(mockInstallationId, mockOwner, mockRepo, mockHeadSha);

      expect(logs).toBeNull();
    });
  });
});
