/**
 * Analysis Job Worker
 *
 * Processes analysis jobs from the database, runs the analysis pipeline,
 * and updates job status. Uses database polling instead of Redis queue
 * to avoid queue collision issues.
 *
 * @module workers/analysisWorker
 */

import crypto from "node:crypto";
import {
  createLogger,
  SERVICE_NAMES,
  getErrorMessage,
  query,
  type RequestContext,
} from "@kenchi/shared";
import { performAnalysis } from "../services/analysisService.js";
import type { AnalyzeRequest } from "../types/apiTypes.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Types ====================

type JobStatus = "pending" | "processing" | "completed" | "failed";

interface AnalysisJob {
  readonly id: string;
  readonly status: JobStatus;
  readonly repository: string;
  readonly requestPayload: Record<string, unknown>;
}

// ==================== Database Queries ====================

const QUERIES = {
  SELECT_PENDING: `
    SELECT id, status, repository_full_name as repository, log_ref as request_payload
    FROM analysis_jobs
    WHERE status = 'pending'
      AND analysis_enqueued_at IS NULL
      AND cancelled_at IS NULL
    ORDER BY created_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,

  MARK_PROCESSING: `
    UPDATE analysis_jobs SET
      status = 'processing',
      analysis_enqueued_at = NOW(),
      processing_started_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `,

  UPDATE_COMPLETED: `
    UPDATE analysis_jobs SET
      status = 'completed',
      result = $2::jsonb,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `,

  UPDATE_FAILED: `
    UPDATE analysis_jobs SET
      status = 'failed',
      error = $2,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `,
} as const;

// ==================== Worker Configuration ====================

const WORKER_CONFIG = {
  /** Delay between poll cycles when no jobs found (ms) */
  POLL_DELAY_MS: 2000,
  /** Delay between processing cycles (ms) */
  PROCESS_DELAY_MS: 100,
  /** Maximum concurrent jobs to process */
  DEFAULT_MAX_CONCURRENT: 4,
  /** Batch size for fetching pending jobs */
  BATCH_SIZE: 5,
} as const;

// ==================== Worker State ====================

interface WorkerState {
  running: boolean;
  activeJobs: number;
}

export interface AnalysisWorkerControl {
  stop: () => void;
  isRunning: () => boolean;
  getActiveJobs: () => number;
}

// ==================== Helper Functions ====================

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Fetch pending jobs from database.
 */
const fetchPendingJobs = async (limit: number): Promise<readonly AnalysisJob[]> => {
  const result = await query<{
    id: string;
    status: string;
    repository: string;
    request_payload: Record<string, unknown>;
  }>(QUERIES.SELECT_PENDING, [limit]);

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status as JobStatus,
    repository: row.repository,
    requestPayload: row.request_payload,
  }));
};

/**
 * Process a single analysis job.
 */
const processJob = async (job: AnalysisJob): Promise<void> => {
  // Create RequestContext for worker job (per CLAUDE.md Non-HTTP Entrypoints)
  const request = job.requestPayload as unknown as AnalyzeRequest;
  const context: RequestContext = {
    requestId: crypto.randomUUID(),
    tenantId: request.tenant_id ?? "system",
    actor: "analysis-worker",
  };

  logger.info("Processing analysis job", {
    jobId: job.id,
    repository: job.repository,
    ...context,
  });

  const startTime = Date.now();

  try {
    // Mark as processing
    await query(QUERIES.MARK_PROCESSING, [job.id]);

    // Run the full analysis pipeline
    const result = await performAnalysis(request, context);

    // Store result
    await query(QUERIES.UPDATE_COMPLETED, [job.id, JSON.stringify(result)]);

    logger.info("Analysis job completed", {
      jobId: job.id,
      repository: job.repository,
      durationMs: Date.now() - startTime,
      ...context,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await query(QUERIES.UPDATE_FAILED, [job.id, errorMessage]);

    logger.error("Analysis job failed", {
      jobId: job.id,
      repository: job.repository,
      durationMs: Date.now() - startTime,
      error: errorMessage,
      ...context,
    });
  }
};

/**
 * Process a job with error handling wrapper.
 */
const processJobSafely = async (job: AnalysisJob, state: WorkerState): Promise<void> => {
  try {
    await processJob(job);
  } catch (error) {
    logger.error("Job processing error", { jobId: job.id, error: getErrorMessage(error) });
  } finally {
    state.activeJobs--;
  }
};

// ==================== Main Worker ====================

/**
 * Starts the analysis worker.
 * Polls the database for pending jobs and processes them.
 */
export const startAnalysisWorker = (
  maxConcurrent: number = WORKER_CONFIG.DEFAULT_MAX_CONCURRENT
): AnalysisWorkerControl => {
  const state: WorkerState = {
    running: true,
    activeJobs: 0,
  };

  const processLoop = async (): Promise<void> => {
    while (state.running) {
      // Check if we can process more jobs
      if (state.activeJobs >= maxConcurrent) {
        await delay(WORKER_CONFIG.PROCESS_DELAY_MS);
        continue;
      }

      try {
        // Fetch pending jobs
        const availableSlots = maxConcurrent - state.activeJobs;
        const jobs = await fetchPendingJobs(Math.min(availableSlots, WORKER_CONFIG.BATCH_SIZE));

        if (jobs.length === 0) {
          // No jobs found, wait before polling again
          await delay(WORKER_CONFIG.POLL_DELAY_MS);
          continue;
        }

        // Process jobs concurrently
        for (const job of jobs) {
          if (!state.running) {
            break;
          }

          state.activeJobs++;
          void processJobSafely(job, state);
        }

        await delay(WORKER_CONFIG.PROCESS_DELAY_MS);
      } catch (error) {
        logger.error("Worker loop error", { error: getErrorMessage(error) });
        await delay(WORKER_CONFIG.POLL_DELAY_MS);
      }
    }
  };

  // Start the worker loop
  void processLoop();

  logger.info("Analysis worker started", { maxConcurrent });

  return {
    stop: () => {
      state.running = false;
      logger.info("Analysis worker stopping");
    },
    isRunning: () => state.running,
    getActiveJobs: () => state.activeJobs,
  };
};
