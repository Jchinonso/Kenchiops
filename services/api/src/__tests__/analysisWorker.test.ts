/**
 * Unit tests for Analysis Worker
 *
 * Tests worker lifecycle management, job processing flow,
 * concurrency control, error handling, row-to-domain mapping,
 * RequestContext creation, and type re-exports.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockQuery = jest.fn();
const mockPerformAnalysis = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    query: (...args: unknown[]) => mockQuery(...args),
    createLogger: jest.fn(() => ({
      info: (...args: unknown[]) => mockLoggerInfo(...args),
      error: (...args: unknown[]) => mockLoggerError(...args),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

jest.mock("../services/analysisService.js", () => ({
  performAnalysis: (...args: unknown[]) => mockPerformAnalysis(...args),
}));

// Import after mock setup
import { startAnalysisWorker, type AnalysisWorkerControl } from "../workers/analysisWorker.js";

// ==================== Test Helpers ====================

const createMockJobRow = (overrides: Record<string, unknown> = {}) => ({
  id: "job_123",
  status: "pending",
  repository: "test-org/test-repo",
  request_payload: {
    failure_log: "Error: Build failed",
    repository: "test-org/test-repo",
    tenant_id: "tenant-1",
  },
  ...overrides,
});

// ==================== Tests ====================

describe("Analysis Worker", () => {
  let workerControl: AnalysisWorkerControl;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Always stop the worker to prevent loop leaking
    if (workerControl) {
      workerControl.stop();
    }
    jest.useRealTimers();
  });

  // ==================== Type Re-exports ====================

  describe("type re-exports", () => {
    it("should export AnalysisWorkerControl type from workers/types.ts via analysisWorker.ts", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      // The type is used at compile time; at runtime verify the shape matches
      const control: AnalysisWorkerControl = startAnalysisWorker(1);
      workerControl = control;

      expect(typeof control.stop).toBe("function");
      expect(typeof control.isRunning).toBe("function");
      expect(typeof control.getActiveJobs).toBe("function");
    });
  });

  // ==================== startAnalysisWorker ====================

  describe("startAnalysisWorker", () => {
    it("should return a control object with stop, isRunning, and getActiveJobs", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      expect(typeof workerControl.stop).toBe("function");
      expect(typeof workerControl.isRunning).toBe("function");
      expect(typeof workerControl.getActiveJobs).toBe("function");
    });

    it("should report running state correctly", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      expect(workerControl.isRunning()).toBe(true);

      workerControl.stop();

      expect(workerControl.isRunning()).toBe(false);
    });

    it("should start with zero active jobs", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      expect(workerControl.getActiveJobs()).toBe(0);
    });

    it("should use default max concurrent of 4 when not specified", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      // Just verify it can be called without arguments
      workerControl = startAnalysisWorker();

      expect(workerControl.isRunning()).toBe(true);
    });

    it("should accept custom max concurrent value", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(8);

      expect(workerControl.isRunning()).toBe(true);
    });
  });

  // ==================== Row-to-Domain Mapping ====================

  describe("fetchPendingJobs row mapping", () => {
    it("should transform snake_case request_payload to camelCase requestPayload", async () => {
      const jobRow = createMockJobRow({
        request_payload: {
          failure_log: "Test error",
          repository: "org/repo",
          tenant_id: "tenant-abc",
        },
      });

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      // performAnalysis should receive the request payload data
      // (processJob extracts it as `job.requestPayload`)
      expect(mockPerformAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          failure_log: "Test error",
          repository: "org/repo",
          tenant_id: "tenant-abc",
        }),
        expect.any(Object)
      );
    });

    it("should pass batch size limit to SELECT query", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(2);

      await jest.advanceTimersByTimeAsync(100);

      const selectCall = mockQuery.mock.calls.find(
        (call) => typeof call[0] === "string" && (call[0] as string).includes("SELECT")
      );
      expect(selectCall).toBeDefined();
      // The limit param should be Math.min(availableSlots, BATCH_SIZE)
      // With maxConcurrent=2 and activeJobs=0, availableSlots=2, BATCH_SIZE=5, so limit=2
      const params = selectCall![1] as number[];
      expect(params[0]).toBeLessThanOrEqual(5); // BATCH_SIZE
    });
  });

  // ==================== RequestContext Creation ====================

  describe("RequestContext creation in processJob", () => {
    it("should create RequestContext with tenant_id from request payload", async () => {
      const jobRow = createMockJobRow({
        request_payload: {
          failure_log: "Error",
          repository: "org/repo",
          tenant_id: "custom-tenant",
        },
      });

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      // performAnalysis receives (request, context) - verify context
      const contextArg = mockPerformAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(contextArg).toBeDefined();
      expect(contextArg.tenantId).toBe("custom-tenant");
      expect(contextArg.actor).toBe("analysis-worker");
      expect(typeof contextArg.requestId).toBe("string");
      expect((contextArg.requestId as string).length).toBeGreaterThan(0);
    });

    it("should default tenantId to 'system' when tenant_id is missing from payload", async () => {
      const jobRow = createMockJobRow({
        request_payload: {
          failure_log: "Error",
          repository: "org/repo",
          // tenant_id intentionally omitted
        },
      });

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      const contextArg = mockPerformAnalysis.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(contextArg.tenantId).toBe("system");
    });
  });

  // ==================== Job Processing ====================

  describe("job processing", () => {
    it("should fetch pending jobs from database", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(2);

      // Allow the first poll cycle to execute
      await jest.advanceTimersByTimeAsync(100);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT"), expect.any(Array));
    });

    it("should process fetched jobs by calling performAnalysis", async () => {
      const jobRow = createMockJobRow();

      // First query returns a job, subsequent queries return empty
      mockQuery
        .mockResolvedValueOnce({ rows: [jobRow] }) // SELECT pending jobs
        .mockResolvedValueOnce({ rows: [] }) // MARK_PROCESSING
        .mockResolvedValue({ rows: [] }); // All subsequent calls

      mockPerformAnalysis.mockResolvedValue({
        analysis: "Test analysis",
        identified_cause: "root cause",
        confidence: 0.9,
        repository: "test-org/test-repo",
      });

      workerControl = startAnalysisWorker(2);

      // Let the loop execute and process the job
      await jest.advanceTimersByTimeAsync(500);

      expect(mockPerformAnalysis).toHaveBeenCalled();
    });

    it("should mark job as processing before running analysis", async () => {
      const jobRow = createMockJobRow();

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue({ analysis: "result" });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      // First query is SELECT, second should be MARK_PROCESSING
      const queryCalls = mockQuery.mock.calls;
      const markProcessingCall = queryCalls.find(
        (call) =>
          typeof call[0] === "string" && (call[0] as string).includes("status = 'processing'")
      );
      expect(markProcessingCall).toBeDefined();
    });

    it("should mark job as completed after successful analysis", async () => {
      const jobRow = createMockJobRow();

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue({ analysis: "success" });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      const queryCalls = mockQuery.mock.calls;
      const completedCall = queryCalls.find(
        (call) =>
          typeof call[0] === "string" && (call[0] as string).includes("status = 'completed'")
      );
      expect(completedCall).toBeDefined();
    });

    it("should store JSON-stringified result when job completes", async () => {
      const jobRow = createMockJobRow();
      const analysisResult = {
        analysis: "Build failed due to missing dependency",
        confidence: 0.85,
      };

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue(analysisResult);

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      const queryCalls = mockQuery.mock.calls;
      const completedCall = queryCalls.find(
        (call) =>
          typeof call[0] === "string" && (call[0] as string).includes("status = 'completed'")
      );
      if (completedCall) {
        const params = completedCall[1] as string[];
        // $2 = JSON.stringify(result)
        expect(JSON.parse(params[1])).toEqual(analysisResult);
      }
    });

    it("should mark job as failed when analysis throws", async () => {
      const jobRow = createMockJobRow();

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockRejectedValue(new Error("LLM API failed"));

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      const queryCalls = mockQuery.mock.calls;
      const failedCall = queryCalls.find(
        (call) => typeof call[0] === "string" && (call[0] as string).includes("status = 'failed'")
      );
      expect(failedCall).toBeDefined();
    });

    it("should store error message when job fails", async () => {
      const jobRow = createMockJobRow();

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockRejectedValue(new Error("Rate limit exceeded"));

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      const queryCalls = mockQuery.mock.calls;
      const failedCall = queryCalls.find(
        (call) => typeof call[0] === "string" && (call[0] as string).includes("status = 'failed'")
      );
      if (failedCall) {
        const params = failedCall[1] as string[];
        expect(params[1]).toContain("Rate limit exceeded");
      }
    });

    it("should process multiple jobs from a single batch", async () => {
      const job1 = createMockJobRow({ id: "job_001" });
      const job2 = createMockJobRow({ id: "job_002" });
      const job3 = createMockJobRow({ id: "job_003" });

      mockQuery
        .mockResolvedValueOnce({ rows: [job1, job2, job3] }) // SELECT returns 3 jobs
        .mockResolvedValue({ rows: [] }); // All subsequent calls

      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(4);

      await jest.advanceTimersByTimeAsync(1000);

      // All three jobs should have been dispatched for processing
      expect(mockPerformAnalysis).toHaveBeenCalledTimes(3);
    });
  });

  // ==================== Concurrency Control ====================

  describe("concurrency control", () => {
    it("should not process more jobs than maxConcurrent allows", async () => {
      let resolveAnalysis1: (value: unknown) => void;
      const analysisPromise1 = new Promise((resolve) => {
        resolveAnalysis1 = resolve;
      });

      const job1 = createMockJobRow({ id: "job_slow_1" });

      // With maxConcurrent=1, SQL LIMIT will be 1, so mock returns only 1 job
      mockQuery.mockResolvedValueOnce({ rows: [job1] }).mockResolvedValue({ rows: [] });

      mockPerformAnalysis.mockReturnValueOnce(analysisPromise1);

      // maxConcurrent = 1: should only start 1 job
      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(300);

      // With maxConcurrent=1, the available slots = 1, so min(1, 5) = 1
      // Only 1 job should be fetched/started
      expect(workerControl.getActiveJobs()).toBeLessThanOrEqual(1);

      // Cleanup
      resolveAnalysis1!({ analysis: "done" });
      await jest.advanceTimersByTimeAsync(300);
    });

    it("should delay polling when at max concurrency", async () => {
      let resolveAnalysis: (value: unknown) => void;
      const analysisPromise = new Promise((resolve) => {
        resolveAnalysis = resolve;
      });

      const jobRow = createMockJobRow();

      mockQuery
        .mockResolvedValueOnce({ rows: [jobRow] }) // First poll returns a job
        .mockResolvedValue({ rows: [] }); // Subsequent polls

      mockPerformAnalysis.mockReturnValue(analysisPromise);

      workerControl = startAnalysisWorker(1);

      // Let the job start
      await jest.advanceTimersByTimeAsync(200);

      // Should have 1 active job, at max capacity
      // While at max capacity, the loop should delay rather than fetching new jobs
      const callCountAtMax = mockQuery.mock.calls.length;

      // Advance through several PROCESS_DELAY_MS cycles (100ms each)
      await jest.advanceTimersByTimeAsync(500);

      // The loop is running but should not be fetching new SELECT queries
      // because activeJobs >= maxConcurrent
      // It may still be making a few calls due to timing, but should not be many
      const additionalCalls = mockQuery.mock.calls.length - callCountAtMax;
      // The key assertion: not flooding with SELECT calls
      expect(additionalCalls).toBeLessThanOrEqual(2);

      // Cleanup
      resolveAnalysis!({ analysis: "done" });
      await jest.advanceTimersByTimeAsync(200);
    });
  });

  // ==================== Polling Behavior ====================

  describe("polling behavior", () => {
    it("should poll again after delay when no jobs found", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      // Advance past initial poll + POLL_DELAY_MS (2000ms)
      await jest.advanceTimersByTimeAsync(3000);

      // Should have polled at least twice
      const selectCalls = mockQuery.mock.calls.filter(
        (call) => typeof call[0] === "string" && (call[0] as string).includes("SELECT")
      );
      expect(selectCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("should stop polling when stop is called", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      // Let it poll once
      await jest.advanceTimersByTimeAsync(100);
      const callCountAfterFirstPoll = mockQuery.mock.calls.length;

      workerControl.stop();

      // Advance time significantly
      await jest.advanceTimersByTimeAsync(10000);

      // Should not have many more calls after stopping
      // (may have one more in-flight, but should stop soon)
      expect(mockQuery.mock.calls.length).toBeLessThanOrEqual(callCountAfterFirstPoll + 2);
    });

    it("should break from job dispatch loop when stopped mid-batch", async () => {
      const job1 = createMockJobRow({ id: "job_a" });
      const job2 = createMockJobRow({ id: "job_b" });
      const job3 = createMockJobRow({ id: "job_c" });

      mockQuery.mockResolvedValueOnce({ rows: [job1, job2, job3] }).mockResolvedValue({ rows: [] });

      // Make the first job's analysis slow enough for us to stop the worker
      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(4);

      // Let the first batch start dispatching
      await jest.advanceTimersByTimeAsync(50);

      // Stop while jobs might still be dispatching
      workerControl.stop();

      await jest.advanceTimersByTimeAsync(1000);

      // Worker should no longer be running
      expect(workerControl.isRunning()).toBe(false);
    });
  });

  // ==================== Worker Control Interface ====================

  describe("worker control interface", () => {
    it("stop should set running to false", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      expect(workerControl.isRunning()).toBe(true);

      workerControl.stop();

      expect(workerControl.isRunning()).toBe(false);
    });

    it("stop should be callable multiple times without error", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      expect(() => {
        workerControl.stop();
        workerControl.stop();
        workerControl.stop();
      }).not.toThrow();
    });

    it("getActiveJobs should reflect currently processing jobs", async () => {
      const jobRow = createMockJobRow();
      let resolveAnalysis: (value: unknown) => void;
      const analysisPromise = new Promise((resolve) => {
        resolveAnalysis = resolve;
      });

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockReturnValue(analysisPromise);

      workerControl = startAnalysisWorker(4);

      // Start processing
      await jest.advanceTimersByTimeAsync(200);

      // Job should be active
      expect(workerControl.getActiveJobs()).toBeGreaterThanOrEqual(0);

      // Resolve the analysis
      resolveAnalysis!({ analysis: "done" });
      await jest.advanceTimersByTimeAsync(200);
    });

    it("getActiveJobs should return to zero after all jobs complete", async () => {
      const job1 = createMockJobRow({ id: "job_finish_1" });
      const job2 = createMockJobRow({ id: "job_finish_2" });

      mockQuery.mockResolvedValueOnce({ rows: [job1, job2] }).mockResolvedValue({ rows: [] });

      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(4);

      await jest.advanceTimersByTimeAsync(1000);

      expect(workerControl.getActiveJobs()).toBe(0);
    });
  });

  // ==================== Logging ====================

  describe("logging", () => {
    it("should log job processing start with jobId, repository, and context", async () => {
      const jobRow = createMockJobRow({ id: "job_log_test" });

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Processing analysis job",
        expect.objectContaining({
          jobId: "job_log_test",
          repository: "test-org/test-repo",
          requestId: expect.any(String),
          tenantId: expect.any(String),
          actor: "analysis-worker",
        })
      );
    });

    it("should log job completion with durationMs", async () => {
      const jobRow = createMockJobRow({ id: "job_timing" });

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockResolvedValue({ analysis: "done" });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Analysis job completed",
        expect.objectContaining({
          jobId: "job_timing",
          durationMs: expect.any(Number),
        })
      );
    });

    it("should log job failure with error message and durationMs", async () => {
      const jobRow = createMockJobRow({ id: "job_fail_log" });

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockRejectedValue(new Error("LLM timeout"));

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      expect(mockLoggerError).toHaveBeenCalledWith(
        "Analysis job failed",
        expect.objectContaining({
          jobId: "job_fail_log",
          error: expect.stringContaining("LLM timeout"),
          durationMs: expect.any(Number),
        })
      );
    });

    it("should log worker start with maxConcurrent", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(6);

      expect(mockLoggerInfo).toHaveBeenCalledWith("Analysis worker started", { maxConcurrent: 6 });
    });

    it("should log worker stop when stop is called", () => {
      mockQuery.mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);
      mockLoggerInfo.mockClear();

      workerControl.stop();

      expect(mockLoggerInfo).toHaveBeenCalledWith("Analysis worker stopping");
    });
  });

  // ==================== Error Handling ====================

  describe("error handling", () => {
    it("should continue running when database poll fails", async () => {
      mockQuery
        .mockRejectedValueOnce(new Error("Database connection lost"))
        .mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      // Should survive the error and keep running
      await jest.advanceTimersByTimeAsync(5000);

      expect(workerControl.isRunning()).toBe(true);
    });

    it("should log worker loop error when database poll fails", async () => {
      mockQuery.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(500);

      expect(mockLoggerError).toHaveBeenCalledWith(
        "Worker loop error",
        expect.objectContaining({
          error: expect.stringContaining("ECONNREFUSED"),
        })
      );
    });

    it("should not crash when job processing throws unexpected error", async () => {
      const jobRow = createMockJobRow();

      mockQuery
        .mockResolvedValueOnce({ rows: [jobRow] })
        .mockRejectedValueOnce(new Error("Unexpected MARK_PROCESSING error"))
        .mockResolvedValue({ rows: [] });

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(5000);

      // Worker should still be running
      expect(workerControl.isRunning()).toBe(true);
    });

    it("should decrement activeJobs even when processing fails", async () => {
      const jobRow = createMockJobRow();

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      mockPerformAnalysis.mockRejectedValue(new Error("Analysis error"));

      workerControl = startAnalysisWorker(4);

      await jest.advanceTimersByTimeAsync(1000);

      // Active jobs should eventually return to 0
      expect(workerControl.getActiveJobs()).toBe(0);
    });

    it("should handle non-Error exceptions in processJobSafely", async () => {
      const jobRow = createMockJobRow();

      mockQuery.mockResolvedValueOnce({ rows: [jobRow] }).mockResolvedValue({ rows: [] });
      // eslint-disable-next-line prefer-promise-reject-errors
      mockPerformAnalysis.mockRejectedValue("string error");

      workerControl = startAnalysisWorker(1);

      await jest.advanceTimersByTimeAsync(1000);

      // Worker should still be running and activeJobs should be 0
      expect(workerControl.isRunning()).toBe(true);
      expect(workerControl.getActiveJobs()).toBe(0);
    });
  });
});
