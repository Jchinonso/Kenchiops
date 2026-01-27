/**
 * Fine-Tuning Scheduler Service
 *
 * Background worker that polls OpenAI for fine-tuning job status,
 * handles job completions by registering new model versions,
 * and automatically triggers new fine-tuning jobs when ready.
 *
 * @module services/finetuning/schedulerService
 */

import {
  createLogger,
  getErrorMessage,
  listFineTuningJobs,
  getFineTuningJob,
  FINE_TUNING_STATUS,
  FINE_TUNING_CONFIG,
  FINE_TUNING_SCHEDULER,
  SERVICE_NAMES,
  type FineTuningJobResult,
} from "@kenchi/shared";
import type {
  SchedulerConfig,
  SchedulerState,
  SchedulerStatus,
} from "../../types/fineTuningTypes.js";
import { handleJobCompletion, startFineTuningJob } from "./jobService.js";
import { getFineTuningStats } from "./statsService.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Constants ====================

const DEFAULT_CONFIG: SchedulerConfig = {
  pollIntervalMs: FINE_TUNING_CONFIG.POLL_INTERVAL_MS,
  maxConcurrentPolls: FINE_TUNING_SCHEDULER.MAX_CONCURRENT_POLLS,
  autoTriggerEnabled: FINE_TUNING_SCHEDULER.AUTO_TRIGGER_ENABLED,
  autoTriggerCheckIntervalMs: FINE_TUNING_SCHEDULER.AUTO_TRIGGER_CHECK_INTERVAL_MS,
  minDaysBetweenJobs: FINE_TUNING_SCHEDULER.MIN_DAYS_BETWEEN_JOBS,
} as const;

const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  FINE_TUNING_STATUS.QUEUED,
  FINE_TUNING_STATUS.RUNNING,
  FINE_TUNING_STATUS.VALIDATING_FILES,
]);

// ==================== State ====================

const state: SchedulerState = {
  isRunning: false,
  intervalId: null,
  trackedJobs: new Set(),
  processedCompletions: new Set(),
  lastAutoTriggerCheck: 0,
  lastJobTriggeredAt: null,
};

/** Current scheduler configuration */
let currentConfig: SchedulerConfig = { ...DEFAULT_CONFIG };

// ==================== Helper Functions ====================

/**
 * Checks if a job is in an active (non-terminal) state.
 */
const isActiveJob = (status: string): boolean => ACTIVE_STATUSES.has(status);

/**
 * Processes a single job update.
 */
const processJobUpdate = async (job: FineTuningJobResult): Promise<void> => {
  const { jobId, status, fineTunedModel } = job;

  // Skip if already processed
  if (state.processedCompletions.has(jobId)) {
    return;
  }

  // Handle successful completion
  if (status === FINE_TUNING_STATUS.SUCCEEDED && fineTunedModel) {
    logger.info("Fine-tuning job completed successfully", {
      jobId,
      fineTunedModel,
    });

    await handleJobCompletion(job);
    state.processedCompletions.add(jobId);
    state.trackedJobs.delete(jobId);
    return;
  }

  // Handle failed job
  if (status === FINE_TUNING_STATUS.FAILED) {
    logger.error("Fine-tuning job failed", {
      jobId,
      error: job.error,
    });

    state.processedCompletions.add(jobId);
    state.trackedJobs.delete(jobId);
    return;
  }

  // Handle cancelled job
  if (status === FINE_TUNING_STATUS.CANCELLED) {
    logger.warn("Fine-tuning job was cancelled", { jobId });

    state.processedCompletions.add(jobId);
    state.trackedJobs.delete(jobId);
    return;
  }

  // Job is still active, keep tracking
  if (isActiveJob(status)) {
    state.trackedJobs.add(jobId);
    logger.debug("Job still in progress", { jobId, status });
  }
};

/**
 * Checks if enough time has passed since the last job was triggered.
 */
const hasEnoughTimePassed = (): boolean => {
  if (!state.lastJobTriggeredAt) {
    return true;
  }
  const daysSinceLastJob =
    (Date.now() - state.lastJobTriggeredAt) / FINE_TUNING_SCHEDULER.MS_PER_DAY;
  return daysSinceLastJob >= currentConfig.minDaysBetweenJobs;
};

const recordAutoTriggeredJob = (jobId: string, fileId: string | undefined): void => {
  state.lastJobTriggeredAt = Date.now();
  state.trackedJobs.add(jobId);
  logger.info("Auto-triggered fine-tuning job started", {
    jobId,
    fileId,
  });
};

/**
 * Checks if it's time to run the auto-trigger check.
 */
const shouldRunAutoTriggerCheck = (): boolean => {
  if (!currentConfig.autoTriggerEnabled) {
    return false;
  }
  const timeSinceLastCheck = Date.now() - state.lastAutoTriggerCheck;
  return timeSinceLastCheck >= currentConfig.autoTriggerCheckIntervalMs;
};

/**
 * Checks conditions and automatically triggers a fine-tuning job if ready.
 */
const checkAutoTrigger = async (): Promise<void> => {
  if (!shouldRunAutoTriggerCheck()) {
    return;
  }

  state.lastAutoTriggerCheck = Date.now();

  try {
    // Check if there are any pending jobs
    if (state.trackedJobs.size > 0) {
      logger.debug("Skipping auto-trigger: jobs already in progress", {
        trackedJobCount: state.trackedJobs.size,
      });
      return;
    }

    // Check if enough time has passed since last job
    if (!hasEnoughTimePassed()) {
      logger.debug("Skipping auto-trigger: not enough time since last job", {
        minDaysBetweenJobs: currentConfig.minDaysBetweenJobs,
      });
      return;
    }

    // Get stats to check if ready for training
    const stats = await getFineTuningStats();

    if (!stats.readyForTraining) {
      logger.debug("Skipping auto-trigger: not ready for training", {
        reason: stats.readyReason,
        totalFeedback: stats.totalFeedback,
      });
      return;
    }

    // All conditions met - trigger fine-tuning job
    logger.info("Auto-triggering fine-tuning job", {
      totalFeedback: stats.totalFeedback,
      positiveFeedback: stats.positiveFeedback,
      negativeFeedback: stats.negativeFeedback,
    });

    const result = await startFineTuningJob({
      suffix: `auto-${Date.now()}`,
      dryRun: false,
    });

    if (result.success && result.jobId) {
      recordAutoTriggeredJob(result.jobId, result.fileId);
    } else {
      logger.warn("Auto-triggered fine-tuning job failed to start", {
        error: result.error,
        validationIssues: result.validationIssues,
      });
    }
  } catch (error) {
    logger.error("Failed to check auto-trigger conditions", {
      error: getErrorMessage(error),
    });
  }
};

/**
 * Polls for active jobs and processes updates.
 */
const pollJobs = async (): Promise<void> => {
  try {
    // Get recent jobs from OpenAI
    const jobs = await listFineTuningJobs(DEFAULT_CONFIG.maxConcurrentPolls * 2);

    // Process each job
    await Promise.all(
      jobs
        .filter((job) => !state.processedCompletions.has(job.jobId))
        .map((job) => processJobUpdate(job))
    );

    // Also poll any tracked jobs that might not be in the recent list
    const trackedJobIds = Array.from(state.trackedJobs);
    await Promise.all(
      trackedJobIds.map(async (jobId) => {
        try {
          const job = await getFineTuningJob(jobId);
          await processJobUpdate(job);
        } catch (error) {
          logger.warn("Failed to poll tracked job", {
            jobId,
            error: getErrorMessage(error),
          });
        }
      })
    );

    logger.debug("Poll cycle complete", {
      trackedJobs: state.trackedJobs.size,
      processedCompletions: state.processedCompletions.size,
    });

    // Check if we should auto-trigger a new fine-tuning job
    await checkAutoTrigger();
  } catch (error) {
    logger.error("Failed to poll jobs", {
      error: getErrorMessage(error),
    });
  }
};

// ==================== Public API ====================

/**
 * Starts the fine-tuning job scheduler.
 *
 * @param config - Optional scheduler configuration
 */
export const startScheduler = (config: Partial<SchedulerConfig> = {}): void => {
  if (state.isRunning) {
    logger.warn("Scheduler already running");
    return;
  }

  currentConfig = { ...DEFAULT_CONFIG, ...config };

  logger.info("Starting fine-tuning scheduler", {
    pollIntervalMs: currentConfig.pollIntervalMs,
    autoTriggerEnabled: currentConfig.autoTriggerEnabled,
    minDaysBetweenJobs: currentConfig.minDaysBetweenJobs,
  });

  state.isRunning = true;

  // Run initial poll
  pollJobs();

  // Set up interval for continuous polling
  state.intervalId = setInterval(() => {
    pollJobs();
  }, currentConfig.pollIntervalMs);
};

/**
 * Stops the fine-tuning job scheduler.
 */
export const stopScheduler = (): void => {
  if (!state.isRunning) {
    logger.warn("Scheduler not running");
    return;
  }

  logger.info("Stopping fine-tuning scheduler");

  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  state.isRunning = false;
};

/**
 * Tracks a new job for status monitoring.
 *
 * @param jobId - Job ID to track
 */
export const trackJob = (jobId: string): void => {
  state.trackedJobs.add(jobId);
  logger.info("Now tracking job", { jobId });
};

/**
 * Gets the current scheduler status.
 *
 * @returns Scheduler status
 */
export const getSchedulerStatus = (): SchedulerStatus => ({
  isRunning: state.isRunning,
  trackedJobCount: state.trackedJobs.size,
  processedCompletionCount: state.processedCompletions.size,
  autoTriggerEnabled: currentConfig.autoTriggerEnabled,
  lastAutoTriggerCheck: state.lastAutoTriggerCheck
    ? new Date(state.lastAutoTriggerCheck).toISOString()
    : null,
  lastJobTriggeredAt: state.lastJobTriggeredAt
    ? new Date(state.lastJobTriggeredAt).toISOString()
    : null,
});

/**
 * Cleans up old processed completions to prevent memory leaks.
 * Call periodically (e.g., daily) to clear stale entries.
 */
export const cleanupProcessedCompletions = (): void => {
  // Clear all if the set exceeds max size
  if (state.processedCompletions.size > FINE_TUNING_SCHEDULER.MAX_PROCESSED_COMPLETIONS) {
    logger.info("Clearing processed completions cache", {
      previousSize: state.processedCompletions.size,
    });
    state.processedCompletions.clear();
  }
};
