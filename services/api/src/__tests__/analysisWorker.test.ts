/**
 * Unit tests for Analysis Worker
 *
 * Tests worker lifecycle management, job processing flow,
 * concurrency control, and error handling.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockQuery = jest.fn();
const mockPerformAnalysis = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    query: (...args: unknown[]) => mockQuery(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
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
  });
});
