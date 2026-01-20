/**
 * Fine-Tuning Client for OpenAI Fine-Tuning API.
 *
 * Provides functions to submit fine-tuning jobs, track progress,
 * and manage fine-tuned models.
 *
 * @module finetuning/fineTuningClient
 */

import OpenAI from "openai";
import { config } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import { ExternalServiceError, getErrorMessage } from "../core/errors.js";
import {
  OPENAI_CONSTANTS,
  FINE_TUNING_CONFIG,
  FINE_TUNING_STATUS,
  type FineTuningStatus,
} from "../constants/index.js";
import type {
  FineTuningJobOptions,
  FineTuningJobResult,
  FileUploadOptions,
  FileUploadResult,
  FineTuningWorkflowResult,
  ProgressCallback,
  TerminalStatusHandler,
} from "./types.js";

const logger = createLogger("fine-tuning-client");

/** Service name for error reporting. */
const SERVICE_NAME = "OpenAI Fine-Tuning";

/** Terminal statuses that indicate job completion. */
const TERMINAL_STATUSES: readonly FineTuningStatus[] = [
  FINE_TUNING_STATUS.SUCCEEDED,
  FINE_TUNING_STATUS.FAILED,
  FINE_TUNING_STATUS.CANCELLED,
];

// ==================== Client Creation ====================

/**
 * Creates an OpenAI client for fine-tuning operations.
 */
const createFineTuningClient = (): OpenAI =>
  new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: OPENAI_CONSTANTS.DEFAULT_TIMEOUT_MS,
  });

// ==================== Helper Functions ====================

/**
 * Converts OpenAI timestamp (seconds) to ISO string.
 */
const toISOTimestamp = (seconds: number): string =>
  new Date(seconds * FINE_TUNING_CONFIG.TIMESTAMP_MULTIPLIER).toISOString();

/**
 * Maps OpenAI job to FineTuningJobResult.
 */
const mapJobToResult = (job: OpenAI.FineTuning.Jobs.FineTuningJob): FineTuningJobResult => ({
  jobId: job.id,
  status: job.status as FineTuningStatus,
  model: job.model,
  trainingFileId: job.training_file,
  validationFileId: job.validation_file ?? undefined,
  createdAt: toISOTimestamp(job.created_at),
  fineTunedModel: job.fine_tuned_model ?? undefined,
  error: job.error?.message,
});

// ==================== File Operations ====================

/**
 * Uploads a training file to OpenAI.
 *
 * @param options - File upload options
 * @returns File upload result
 * @throws {ExternalServiceError} If upload fails
 */
export const uploadTrainingFile = async (options: FileUploadOptions): Promise<FileUploadResult> => {
  const client = createFineTuningClient();
  const filename = options.filename ?? `training_${Date.now()}.jsonl`;

  try {
    logger.info("Uploading training file", { filename, contentLength: options.content.length });

    const file = await client.files.create({
      file: new File([options.content], filename, { type: "application/jsonl" }),
      purpose: "fine-tune",
    });

    const result: FileUploadResult = {
      fileId: file.id,
      filename: file.filename,
      bytes: file.bytes,
      createdAt: toISOTimestamp(file.created_at),
      purpose: file.purpose,
    };

    logger.info("Training file uploaded successfully", { fileId: file.id, bytes: file.bytes });

    return result;
  } catch (error: unknown) {
    logger.error("Failed to upload training file", { error: getErrorMessage(error) });
    throw new ExternalServiceError(
      SERVICE_NAME,
      `Failed to upload training file: ${getErrorMessage(error)}`
    );
  }
};

/**
 * Deletes a file from OpenAI.
 *
 * @param fileId - ID of the file to delete
 * @returns True if deletion succeeded
 */
export const deleteTrainingFile = async (fileId: string): Promise<boolean> => {
  const client = createFineTuningClient();

  try {
    await client.files.del(fileId);
    logger.info("Training file deleted", { fileId });
    return true;
  } catch (error: unknown) {
    logger.warn("Failed to delete training file", { fileId, error: getErrorMessage(error) });
    return false;
  }
};

// ==================== Job Operations ====================

/**
 * Creates a fine-tuning job.
 *
 * @param options - Fine-tuning job options
 * @returns Fine-tuning job result
 * @throws {ExternalServiceError} If job creation fails
 */
export const createFineTuningJob = async (
  options: FineTuningJobOptions
): Promise<FineTuningJobResult> => {
  const client = createFineTuningClient();
  const model = options.model ?? FINE_TUNING_CONFIG.DEFAULT_BASE_MODEL;

  try {
    logger.info("Creating fine-tuning job", {
      model,
      trainingFileId: options.trainingFileId,
      epochs: options.epochs ?? FINE_TUNING_CONFIG.DEFAULT_EPOCHS,
    });

    const job = await client.fineTuning.jobs.create({
      training_file: options.trainingFileId,
      validation_file: options.validationFileId,
      model,
      hyperparameters: {
        n_epochs: options.epochs ?? FINE_TUNING_CONFIG.DEFAULT_EPOCHS,
        ...(options.learningRateMultiplier && {
          learning_rate_multiplier: options.learningRateMultiplier,
        }),
        ...(options.batchSize && { batch_size: options.batchSize }),
      },
      suffix: options.suffix,
    });

    const result = mapJobToResult(job);

    logger.info("Fine-tuning job created successfully", { jobId: job.id, status: job.status });

    return result;
  } catch (error: unknown) {
    logger.error("Failed to create fine-tuning job", { error: getErrorMessage(error) });
    throw new ExternalServiceError(
      SERVICE_NAME,
      `Failed to create fine-tuning job: ${getErrorMessage(error)}`
    );
  }
};

/**
 * Gets the status of a fine-tuning job.
 *
 * @param jobId - ID of the fine-tuning job
 * @returns Fine-tuning job result with current status
 * @throws {ExternalServiceError} If job retrieval fails
 */
export const getFineTuningJob = async (jobId: string): Promise<FineTuningJobResult> => {
  const client = createFineTuningClient();

  try {
    const job = await client.fineTuning.jobs.retrieve(jobId);
    return mapJobToResult(job);
  } catch (error: unknown) {
    logger.error("Failed to get fine-tuning job", { jobId, error: getErrorMessage(error) });
    throw new ExternalServiceError(
      SERVICE_NAME,
      `Failed to get fine-tuning job: ${getErrorMessage(error)}`
    );
  }
};

/**
 * Cancels a fine-tuning job.
 *
 * @param jobId - ID of the fine-tuning job to cancel
 * @returns True if cancellation succeeded
 */
export const cancelFineTuningJob = async (jobId: string): Promise<boolean> => {
  const client = createFineTuningClient();

  try {
    await client.fineTuning.jobs.cancel(jobId);
    logger.info("Fine-tuning job cancelled", { jobId });
    return true;
  } catch (error: unknown) {
    logger.warn("Failed to cancel fine-tuning job", { jobId, error: getErrorMessage(error) });
    return false;
  }
};

/**
 * Lists recent fine-tuning jobs.
 *
 * @param limit - Maximum number of jobs to return
 * @returns Array of fine-tuning job results
 */
export const listFineTuningJobs = async (
  limit: number = FINE_TUNING_CONFIG.DEFAULT_JOB_LIST_LIMIT
): Promise<FineTuningJobResult[]> => {
  const client = createFineTuningClient();

  try {
    const jobs = await client.fineTuning.jobs.list({ limit });
    return jobs.data.map(mapJobToResult);
  } catch (error: unknown) {
    logger.error("Failed to list fine-tuning jobs", { error: getErrorMessage(error) });
    return [];
  }
};

// ==================== Polling Operations ====================

/**
 * Checks if a job has reached a terminal state.
 */
const isTerminalStatus = (status: FineTuningStatus): boolean => TERMINAL_STATUSES.includes(status);

/**
 * Delays execution for polling using Promise-based timeout.
 */
const pollDelay = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, FINE_TUNING_CONFIG.POLL_INTERVAL_MS);
  });

/** Handlers for terminal job statuses. */
const TERMINAL_STATUS_HANDLERS: readonly TerminalStatusHandler[] = [
  {
    status: FINE_TUNING_STATUS.FAILED,
    handle: (job) => {
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Fine-tuning job failed: ${job.error ?? "Unknown error"}`
      );
    },
  },
  {
    status: FINE_TUNING_STATUS.SUCCEEDED,
    handle: (job) => job,
  },
  {
    status: FINE_TUNING_STATUS.CANCELLED,
    handle: (job) => job,
  },
];

/**
 * Processes a job in terminal state using handler lookup.
 */
const processTerminalJob = (job: FineTuningJobResult): FineTuningJobResult => {
  const handler = TERMINAL_STATUS_HANDLERS.find(
    (terminalHandler) => terminalHandler.status === job.status
  );
  return handler?.handle(job) ?? job;
};

/**
 * Waits for a fine-tuning job to complete.
 *
 * @param jobId - ID of the fine-tuning job
 * @param onProgress - Optional callback for progress updates
 * @returns Final fine-tuning job result
 * @throws {ExternalServiceError} If job fails or times out
 */
export const waitForFineTuningJob = async (
  jobId: string,
  onProgress?: ProgressCallback
): Promise<FineTuningJobResult> => {
  let attempts = 0;

  const poll = async (): Promise<FineTuningJobResult> => {
    if (attempts >= FINE_TUNING_CONFIG.MAX_POLL_ATTEMPTS) {
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Fine-tuning job timed out after ${attempts} attempts`
      );
    }

    attempts += 1;
    const job = await getFineTuningJob(jobId);

    onProgress?.(job);

    if (isTerminalStatus(job.status)) {
      return processTerminalJob(job);
    }

    logger.debug("Polling fine-tuning job", { jobId, status: job.status, attempt: attempts });
    await pollDelay();
    return poll();
  };

  return poll();
};

// ==================== High-Level Operations ====================

/**
 * Submits a complete fine-tuning workflow.
 *
 * 1. Uploads training JSONL file
 * 2. Creates fine-tuning job
 * 3. Returns job details for tracking
 *
 * @param jsonlContent - JSONL training data content
 * @param options - Optional fine-tuning options
 * @returns Fine-tuning job result and file ID
 */
export const submitFineTuningWorkflow = async (
  jsonlContent: string,
  options: Partial<Omit<FineTuningJobOptions, "trainingFileId">> = {}
): Promise<FineTuningWorkflowResult> => {
  logger.info("Starting fine-tuning workflow", { contentLength: jsonlContent.length });

  // Upload training file
  const fileResult = await uploadTrainingFile({
    content: jsonlContent,
    filename: `kenchi_training_${Date.now()}.jsonl`,
  });

  // Create fine-tuning job
  const job = await createFineTuningJob({
    ...options,
    trainingFileId: fileResult.fileId,
  });

  logger.info("Fine-tuning workflow submitted", {
    jobId: job.jobId,
    fileId: fileResult.fileId,
    model: job.model,
  });

  return {
    job,
    fileId: fileResult.fileId,
  };
};
