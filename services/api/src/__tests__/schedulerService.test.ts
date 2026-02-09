/**
 * Unit tests for Fine-Tuning Scheduler Service
 *
 * Tests scheduler lifecycle (start/stop), job polling, job status processing,
 * auto-trigger logic, completion cleanup, and edge cases around the
 * stateful module-level scheduler state.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockListFineTuningJobs = jest.fn();
const mockGetFineTuningJob = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    listFineTuningJobs: (...args: unknown[]) => mockListFineTuningJobs(...args),
    getFineTuningJob: (...args: unknown[]) => mockGetFineTuningJob(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Mock the jobService and statsService dependencies
const mockHandleJobCompletion = jest.fn();
const mockStartFineTuningJob = jest.fn();

jest.mock("../services/finetuning/jobService.js", () => ({
  handleJobCompletion: (...args: unknown[]) => mockHandleJobCompletion(...args),
  startFineTuningJob: (...args: unknown[]) => mockStartFineTuningJob(...args),
}));

const mockGetFineTuningStats = jest.fn();

jest.mock("../services/finetuning/statsService.js", () => ({
  getFineTuningStats: (...args: unknown[]) => mockGetFineTuningStats(...args),
}));

// Import after mock setup
import {
  startScheduler,
  stopScheduler,
  trackJob,
  getSchedulerStatus,
  cleanupProcessedCompletions,
  _resetStateForTesting,
} from "../services/finetuning/schedulerService.js";

// ==================== Helpers ====================

/** Flush pending promise microtasks from fire-and-forget async chains */
const flushAsyncChain = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await jest.advanceTimersByTimeAsync(0);
  }
};

// ==================== Tests ====================

describe("Scheduler Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Fully reset module state to prevent leaking between tests
    _resetStateForTesting();
  });

  afterEach(() => {
    _resetStateForTesting();
    jest.useRealTimers();
  });

  // ==================== startScheduler ====================

  describe("startScheduler", () => {
    it("should set isRunning to true", () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({ autoTriggerEnabled: false });

      const status = getSchedulerStatus();
      expect(status.isRunning).toBe(true);
    });

    it("should not start twice when already running", () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({ autoTriggerEnabled: false });
      startScheduler({ autoTriggerEnabled: false }); // Second call should be no-op

      const status = getSchedulerStatus();
      expect(status.isRunning).toBe(true);
    });

    it("should run initial poll immediately", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({ autoTriggerEnabled: false });

      // Let the initial microtask resolve
      await jest.advanceTimersByTimeAsync(0);

      expect(mockListFineTuningJobs).toHaveBeenCalled();
    });

    it("should accept custom configuration", () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({
        pollIntervalMs: 5000,
        autoTriggerEnabled: false,
        minDaysBetweenJobs: 14,
      });

      const status = getSchedulerStatus();
      expect(status.isRunning).toBe(true);
      expect(status.autoTriggerEnabled).toBe(false);
    });
  });

  // ==================== stopScheduler ====================

  describe("stopScheduler", () => {
    it("should set isRunning to false", () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({ autoTriggerEnabled: false });
      stopScheduler();

      const status = getSchedulerStatus();
      expect(status.isRunning).toBe(false);
    });

    it("should be safe to call when not running", () => {
      expect(() => stopScheduler()).not.toThrow();
    });

    it("should stop polling after being stopped", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({
        pollIntervalMs: 1000,
        autoTriggerEnabled: false,
      });

      // Let initial poll execute
      await jest.advanceTimersByTimeAsync(100);
      const callsAfterStart = mockListFineTuningJobs.mock.calls.length;

      stopScheduler();

      // Advance well past poll interval
      await jest.advanceTimersByTimeAsync(10000);

      // Calls should not have increased significantly
      expect(mockListFineTuningJobs.mock.calls.length).toBeLessThanOrEqual(callsAfterStart + 1);
    });
  });

  // ==================== trackJob ====================

  describe("trackJob", () => {
    it("should increment tracked job count", () => {
      trackJob("ftjob-new-1");

      const status = getSchedulerStatus();
      expect(status.trackedJobCount).toBeGreaterThanOrEqual(1);
    });

    it("should not duplicate when tracking same job ID twice", () => {
      // Set is used internally, so duplicates should be ignored
      trackJob("ftjob-dup");
      const before = getSchedulerStatus().trackedJobCount;
      trackJob("ftjob-dup");
      const after = getSchedulerStatus().trackedJobCount;

      expect(after).toBe(before);
    });
  });

  // ==================== getSchedulerStatus ====================

  describe("getSchedulerStatus", () => {
    it("should return initial status when scheduler has not been started", () => {
      const status = getSchedulerStatus();

      expect(status.isRunning).toBe(false);
      expect(status.trackedJobCount).toBeGreaterThanOrEqual(0);
      expect(status.processedCompletionCount).toBeGreaterThanOrEqual(0);
    });

    it("should return ISO string for lastAutoTriggerCheck when set", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningStats.mockResolvedValue({
        readyForTraining: false,
        readyReason: "Need more feedback",
        totalFeedback: 0,
      });

      startScheduler({
        pollIntervalMs: 1000,
        autoTriggerEnabled: true,
        autoTriggerCheckIntervalMs: 0, // Immediately eligible
      });

      // Let polling + auto-trigger check happen
      await jest.advanceTimersByTimeAsync(2000);

      const status = getSchedulerStatus();
      // If auto-trigger ran, lastAutoTriggerCheck should be a valid ISO string or null
      if (status.lastAutoTriggerCheck !== null) {
        expect(new Date(status.lastAutoTriggerCheck).toISOString()).toBe(
          status.lastAutoTriggerCheck
        );
      }
    });

    it("should return null for lastJobTriggeredAt when no auto-trigger has occurred", () => {
      const status = getSchedulerStatus();

      expect(status.lastJobTriggeredAt).toBeNull();
    });
  });

  // ==================== cleanupProcessedCompletions ====================

  describe("cleanupProcessedCompletions", () => {
    it("should not throw when called", () => {
      expect(() => cleanupProcessedCompletions()).not.toThrow();
    });

    it("should not clear completions when under threshold", () => {
      // With no processed completions, cleanup should be a no-op
      const beforeCount = getSchedulerStatus().processedCompletionCount;
      cleanupProcessedCompletions();
      const afterCount = getSchedulerStatus().processedCompletionCount;

      expect(afterCount).toBe(beforeCount);
    });
  });

  // ==================== Job Polling & Processing ====================

  describe("job polling", () => {
    it("should process succeeded jobs by calling handleJobCompletion", async () => {
      const succeededJob = {
        jobId: "ftjob-success-1",
        status: "succeeded",
        fineTunedModel: "ft:model:kenchi:xyz",
        model: "gpt-4o-mini",
        trainingFileId: "file-1",
      };

      mockListFineTuningJobs.mockResolvedValue([succeededJob]);
      mockHandleJobCompletion.mockResolvedValue(undefined);

      startScheduler({
        pollIntervalMs: 5000,
        autoTriggerEnabled: false,
      });

      // Let the initial poll complete
      await jest.advanceTimersByTimeAsync(100);

      expect(mockHandleJobCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "ftjob-success-1",
          status: "succeeded",
        })
      );
    });

    it("should not re-process already completed jobs", async () => {
      const succeededJob = {
        jobId: "ftjob-already-done",
        status: "succeeded",
        fineTunedModel: "ft:model",
        model: "base",
        trainingFileId: "file-1",
      };

      mockListFineTuningJobs.mockResolvedValue([succeededJob]);
      mockHandleJobCompletion.mockResolvedValue(undefined);

      startScheduler({
        pollIntervalMs: 1000,
        autoTriggerEnabled: false,
      });

      // First poll
      await jest.advanceTimersByTimeAsync(100);
      const firstCallCount = mockHandleJobCompletion.mock.calls.length;

      // Second poll
      await jest.advanceTimersByTimeAsync(2000);

      // Should not call handleJobCompletion again for same job
      expect(mockHandleJobCompletion.mock.calls.length).toBe(firstCallCount);
    });

    it("should handle failed jobs by marking them as processed without completion", async () => {
      const failedJob = {
        jobId: "ftjob-failed-1",
        status: "failed",
        error: "Training data too small",
        model: "base",
      };

      mockListFineTuningJobs.mockResolvedValue([failedJob]);

      startScheduler({
        pollIntervalMs: 5000,
        autoTriggerEnabled: false,
      });

      await jest.advanceTimersByTimeAsync(100);

      // Should NOT call handleJobCompletion for failed jobs
      expect(mockHandleJobCompletion).not.toHaveBeenCalled();
    });

    it("should handle cancelled jobs by marking them as processed", async () => {
      const cancelledJob = {
        jobId: "ftjob-cancelled-1",
        status: "cancelled",
        model: "base",
      };

      mockListFineTuningJobs.mockResolvedValue([cancelledJob]);

      startScheduler({
        pollIntervalMs: 5000,
        autoTriggerEnabled: false,
      });

      await jest.advanceTimersByTimeAsync(100);

      expect(mockHandleJobCompletion).not.toHaveBeenCalled();
    });

    it("should track active (in-progress) jobs", async () => {
      const activeJob = {
        jobId: "ftjob-running-1",
        status: "running",
        model: "base",
      };

      mockListFineTuningJobs.mockResolvedValue([activeJob]);

      startScheduler({
        pollIntervalMs: 5000,
        autoTriggerEnabled: false,
      });

      await jest.advanceTimersByTimeAsync(100);

      const status = getSchedulerStatus();
      expect(status.trackedJobCount).toBeGreaterThanOrEqual(1);
    });

    it("should poll tracked jobs individually when not in recent list", async () => {
      // First poll: track a running job
      mockListFineTuningJobs.mockResolvedValueOnce([
        { jobId: "ftjob-tracked", status: "running", model: "base" },
      ]);

      // Second poll: job no longer in list, but should be polled individually
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningJob.mockResolvedValue({
        jobId: "ftjob-tracked",
        status: "succeeded",
        fineTunedModel: "ft:model:new",
        model: "base",
        trainingFileId: "file-1",
      });
      mockHandleJobCompletion.mockResolvedValue(undefined);

      startScheduler({
        pollIntervalMs: 1000,
        autoTriggerEnabled: false,
      });

      // First poll - tracks the job
      await jest.advanceTimersByTimeAsync(100);

      // Second poll - should fetch tracked job individually
      await jest.advanceTimersByTimeAsync(2000);

      expect(mockGetFineTuningJob).toHaveBeenCalledWith("ftjob-tracked");
    });

    it("should survive polling errors without crashing", async () => {
      mockListFineTuningJobs.mockRejectedValueOnce(new Error("Network error"));
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({
        pollIntervalMs: 1000,
        autoTriggerEnabled: false,
      });

      // First poll fails
      await jest.advanceTimersByTimeAsync(100);

      // Scheduler should still be running
      expect(getSchedulerStatus().isRunning).toBe(true);

      // Second poll should work (initial poll + 1 interval = 2 calls)
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockListFineTuningJobs).toHaveBeenCalledTimes(2);
    });

    it("should survive individual tracked job poll failure", async () => {
      // First: track a job
      mockListFineTuningJobs.mockResolvedValueOnce([
        { jobId: "ftjob-flaky", status: "running", model: "base" },
      ]);

      // Second poll: tracked job fetch fails
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningJob.mockRejectedValue(new Error("Timeout"));

      startScheduler({
        pollIntervalMs: 1000,
        autoTriggerEnabled: false,
      });

      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(2000);

      // Should not crash
      expect(getSchedulerStatus().isRunning).toBe(true);
    });
  });

  // ==================== Auto-Trigger ====================

  describe("auto-trigger", () => {
    it("should not check auto-trigger when disabled", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);

      startScheduler({
        pollIntervalMs: 1000,
        autoTriggerEnabled: false,
      });

      await jest.advanceTimersByTimeAsync(5000);

      expect(mockGetFineTuningStats).not.toHaveBeenCalled();
    });

    it("should check stats when auto-trigger is enabled and interval has passed", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningStats.mockResolvedValue({
        readyForTraining: false,
        readyReason: "Need more feedback",
        totalFeedback: 10,
      });

      startScheduler({
        pollIntervalMs: 500,
        autoTriggerEnabled: true,
        autoTriggerCheckIntervalMs: 0, // check immediately
      });

      // Flush the deep async chain: pollJobs → checkAutoTrigger → getFineTuningStats
      await flushAsyncChain();
      await jest.advanceTimersByTimeAsync(1000);
      await flushAsyncChain();

      expect(mockGetFineTuningStats).toHaveBeenCalled();
    });

    it("should trigger a job when ready for training with no active jobs", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningStats.mockResolvedValue({
        readyForTraining: true,
        totalFeedback: 100,
        positiveFeedback: 80,
        negativeFeedback: 20,
      });
      mockStartFineTuningJob.mockResolvedValue({
        success: true,
        jobId: "ftjob-auto-1",
        fileId: "file-auto-1",
      });

      startScheduler({
        pollIntervalMs: 500,
        autoTriggerEnabled: true,
        autoTriggerCheckIntervalMs: 0,
        minDaysBetweenJobs: 0, // No minimum wait
      });

      // Flush the deep async chain: pollJobs → checkAutoTrigger → getFineTuningStats → startFineTuningJob
      await flushAsyncChain();
      await jest.advanceTimersByTimeAsync(1000);
      await flushAsyncChain();

      expect(mockStartFineTuningJob).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: false,
          suffix: expect.stringContaining("auto-"),
        })
      );
    });

    it("should not trigger when there are tracked jobs already running", async () => {
      // First poll: track a running job
      mockListFineTuningJobs.mockResolvedValueOnce([
        { jobId: "ftjob-existing", status: "running", model: "base" },
      ]);
      mockListFineTuningJobs.mockResolvedValue([
        { jobId: "ftjob-existing", status: "running", model: "base" },
      ]);
      mockGetFineTuningStats.mockResolvedValue({
        readyForTraining: true,
        totalFeedback: 100,
      });

      startScheduler({
        pollIntervalMs: 500,
        autoTriggerEnabled: true,
        autoTriggerCheckIntervalMs: 0,
        minDaysBetweenJobs: 0,
      });

      await jest.advanceTimersByTimeAsync(2000);

      // Should NOT trigger a new job because one is running
      expect(mockStartFineTuningJob).not.toHaveBeenCalled();
    });

    it("should not trigger when not ready for training", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningStats.mockResolvedValue({
        readyForTraining: false,
        readyReason: "Need 40 more feedback samples",
        totalFeedback: 10,
      });

      startScheduler({
        pollIntervalMs: 500,
        autoTriggerEnabled: true,
        autoTriggerCheckIntervalMs: 0,
        minDaysBetweenJobs: 0,
      });

      await jest.advanceTimersByTimeAsync(2000);

      expect(mockStartFineTuningJob).not.toHaveBeenCalled();
    });

    it("should handle auto-trigger stats fetch error gracefully", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningStats.mockRejectedValue(new Error("DB down"));

      startScheduler({
        pollIntervalMs: 500,
        autoTriggerEnabled: true,
        autoTriggerCheckIntervalMs: 0,
        minDaysBetweenJobs: 0,
      });

      await jest.advanceTimersByTimeAsync(2000);

      // Should not crash, should not trigger job
      expect(getSchedulerStatus().isRunning).toBe(true);
      expect(mockStartFineTuningJob).not.toHaveBeenCalled();
    });

    it("should handle failed auto-trigger job start gracefully", async () => {
      mockListFineTuningJobs.mockResolvedValue([]);
      mockGetFineTuningStats.mockResolvedValue({
        readyForTraining: true,
        totalFeedback: 100,
        positiveFeedback: 80,
        negativeFeedback: 20,
      });
      mockStartFineTuningJob.mockResolvedValue({
        success: false,
        error: "Dataset too small",
        validationIssues: ["Not enough positive examples"],
      });

      startScheduler({
        pollIntervalMs: 500,
        autoTriggerEnabled: true,
        autoTriggerCheckIntervalMs: 0,
        minDaysBetweenJobs: 0,
      });

      await jest.advanceTimersByTimeAsync(2000);

      // Should not crash
      expect(getSchedulerStatus().isRunning).toBe(true);
    });
  });
});
