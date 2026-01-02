/**
 * Fine-Tuning Job Service
 *
 * Manages fine-tuning job lifecycle including creation, monitoring, and cancellation.
 *
 * @module services/finetuning/jobService
 */

import {
  createLogger,
  getErrorMessage,
  submitFineTuningWorkflow,
  getFineTuningJob,
  cancelFineTuningJob,
  listFineTuningJobs,
  registerModelVersion,
  createModelVersion,
  FINE_TUNING_STATUS,
  type FineTuningJobResult,
  type DatasetStats,
} from "@kenchi/shared";
import { extractDataset } from "./datasetService.js";

const logger = createLogger("job-service");

// ==================== Types ====================

/**
 * Options for starting a fine-tuning job.
 */
export interface StartJobOptions {
  readonly tenantId?: string;
  readonly epochs?: number;
  readonly suffix?: string;
  readonly dryRun?: boolean;
}

/**
 * Result of starting a fine-tuning job.
 */
export interface StartJobResult {
  readonly success: boolean;
  readonly jobId?: string;
  readonly status?: string;
  readonly fileId?: string;
  readonly model?: string;
  readonly datasetStats?: DatasetStats;
  readonly error?: string;
  readonly validationIssues?: readonly string[];
}

// ==================== Public API ====================

/**
 * Starts a fine-tuning job.
 *
 * @param options - Job options
 * @returns Job start result
 */
export const startFineTuningJob = async (options: StartJobOptions): Promise<StartJobResult> => {
  logger.info("Starting fine-tuning job", { ...options });

  try {
    // Extract dataset
    const dataset = await extractDataset({
      tenantId: options.tenantId,
    });

    // Validate dataset
    if (!dataset.validation.valid) {
      logger.warn("Dataset validation failed", {
        issues: dataset.validation.issues,
      });

      return {
        success: false,
        error: "Dataset validation failed",
        validationIssues: dataset.validation.issues,
        datasetStats: dataset.stats,
      };
    }

    // Check if dry run
    if (options.dryRun) {
      logger.info("Dry run - not submitting job");
      return {
        success: true,
        status: "dry_run",
        datasetStats: dataset.stats,
      };
    }

    // Submit fine-tuning workflow
    const workflowResult = await submitFineTuningWorkflow(dataset.jsonl, {
      epochs: options.epochs,
      suffix: options.suffix ?? `kenchi_${Date.now()}`,
    });

    logger.info("Fine-tuning job submitted", {
      jobId: workflowResult.job.jobId,
      status: workflowResult.job.status,
    });

    return {
      success: true,
      jobId: workflowResult.job.jobId,
      status: workflowResult.job.status,
      fileId: workflowResult.fileId,
      model: workflowResult.job.model,
      datasetStats: dataset.stats,
    };
  } catch (error) {
    logger.error("Failed to start fine-tuning job", {
      error: getErrorMessage(error),
    });

    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};

/**
 * Gets fine-tuning job status.
 *
 * @param jobId - Job ID
 * @returns Job result or null if not found
 */
export const getJobStatus = async (jobId: string): Promise<FineTuningJobResult | null> => {
  try {
    return await getFineTuningJob(jobId);
  } catch (error) {
    logger.error("Failed to get job status", {
      jobId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Cancels a fine-tuning job.
 *
 * @param jobId - Job ID to cancel
 * @returns True if cancelled successfully
 */
export const cancelJob = async (jobId: string): Promise<boolean> => cancelFineTuningJob(jobId);

/**
 * Lists fine-tuning jobs.
 *
 * @param limit - Maximum number of jobs to return
 * @returns Array of job results
 */
export const listJobs = async (limit: number = 20): Promise<readonly FineTuningJobResult[]> =>
  listFineTuningJobs(limit);

/**
 * Handles completion of a fine-tuning job.
 * Registers the new model version when a job succeeds.
 *
 * @param job - Completed job result
 */
export const handleJobCompletion = async (job: FineTuningJobResult): Promise<void> => {
  if (job.status !== FINE_TUNING_STATUS.SUCCEEDED || !job.fineTunedModel) {
    logger.warn("Job not in completed state", {
      jobId: job.jobId,
      status: job.status,
    });
    return;
  }

  try {
    // Register the new model version in database
    const version = await createModelVersion({
      name: `Fine-tuned ${new Date().toISOString().split("T")[0]}`,
      modelId: job.fineTunedModel,
      description: `Fine-tuned from ${job.model} via job ${job.jobId}`,
      metadata: {
        parentModelId: job.model,
        trainingDatasetId: job.trainingFileId,
      },
    });

    // Also register in-memory
    registerModelVersion({
      id: version.id,
      name: version.name,
      modelId: version.modelId,
      description: version.description,
      createdAt: version.createdAt,
      isBaseline: false,
      metadata: version.metadata,
    });

    logger.info("Fine-tuned model version registered", {
      versionId: version.id,
      modelId: version.modelId,
      jobId: job.jobId,
    });
  } catch (error) {
    logger.error("Failed to register completed model", {
      jobId: job.jobId,
      error: getErrorMessage(error),
    });
  }
};
