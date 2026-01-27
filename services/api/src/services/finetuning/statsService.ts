/**
 * Fine-Tuning Statistics Service
 *
 * Provides statistics for fine-tuning readiness and progress.
 *
 * @module services/finetuning/statsService
 */

import {
  createLogger,
  getErrorMessage,
  listFineTuningJobs,
  FINE_TUNING_STATUS,
  FINE_TUNING_READINESS,
  SERVICE_NAMES,
} from "@kenchi/shared";
import type { FineTuningStats } from "../../types/fineTuningTypes.js";
import { countFeedbackByType, countFeedbackSinceDate } from "../feedbackStatsService.js";
import { getModelVersions } from "./modelService.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Helper Functions ====================

/**
 * Calculates date N days ago.
 */
const daysAgo = (days: number): Date =>
  new Date(Date.now() - days * FINE_TUNING_READINESS.MS_PER_DAY);

/**
 * Checks if a job is in pending state.
 */
const isPendingJob = (status: string): boolean =>
  status === FINE_TUNING_STATUS.QUEUED ||
  status === FINE_TUNING_STATUS.RUNNING ||
  status === FINE_TUNING_STATUS.VALIDATING_FILES;

// ==================== Public API ====================

/**
 * Gets fine-tuning statistics.
 *
 * @param tenantId - Optional tenant ID to filter by
 * @returns Fine-tuning statistics
 */
export const getFineTuningStats = async (tenantId?: string): Promise<FineTuningStats> => {
  try {
    // Get feedback counts
    const feedbackCounts = await countFeedbackByType(tenantId);
    const feedbackLast7Days = await countFeedbackSinceDate(
      daysAgo(FINE_TUNING_READINESS.RECENT_FEEDBACK_DAYS_7),
      tenantId
    );
    const feedbackLast30Days = await countFeedbackSinceDate(
      daysAgo(FINE_TUNING_READINESS.RECENT_FEEDBACK_DAYS_30),
      tenantId
    );

    // Get job counts
    const jobs = await listFineTuningJobs(FINE_TUNING_READINESS.STATS_JOB_LIST_LIMIT);
    const pendingJobs = jobs.filter((job) => isPendingJob(job.status)).length;
    const completedJobs = jobs.filter((job) => job.status === FINE_TUNING_STATUS.SUCCEEDED).length;

    const lastCompletedJob = jobs.find((job) => job.status === FINE_TUNING_STATUS.SUCCEEDED);

    // Get model version count
    const versions = await getModelVersions();
    const activeVersions = versions.filter((version) => !version.isBaseline).length;

    // Calculate if ready for training
    const totalFeedback = feedbackCounts.helpful + feedbackCounts.not_helpful;
    const minRequired = FINE_TUNING_READINESS.MIN_FEEDBACK_FOR_TRAINING;
    const readyForTraining = totalFeedback >= minRequired;

    return {
      totalFeedback,
      positiveFeedback: feedbackCounts.helpful,
      negativeFeedback: feedbackCounts.not_helpful,
      feedbackLast7Days,
      feedbackLast30Days,
      activeModelVersions: activeVersions,
      pendingJobs,
      completedJobs,
      lastJobCompletedAt: lastCompletedJob?.createdAt,
      readyForTraining,
      readyReason: readyForTraining
        ? undefined
        : `Need ${minRequired - totalFeedback} more feedback samples`,
    };
  } catch (error) {
    logger.error("Failed to get fine-tuning stats", {
      error: getErrorMessage(error),
    });

    return {
      totalFeedback: 0,
      positiveFeedback: 0,
      negativeFeedback: 0,
      feedbackLast7Days: 0,
      feedbackLast30Days: 0,
      activeModelVersions: 0,
      pendingJobs: 0,
      completedJobs: 0,
      readyForTraining: false,
      readyReason: "Failed to fetch statistics",
    };
  }
};
