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
  delay,
  SERVICE_NAMES,
  getErrorMessage,
  query,
  getSubscriptionByTenant,
  SUBSCRIPTION_STATUS,
  FAIR_QUEUE_DEFAULTS,
  type RequestContext,
} from "@kenchi/shared";
import { performAnalysis } from "../services/analysisService.js";
import type { AnalyzeRequest } from "../types/apiTypes.js";
import type {
  JobStatus,
  AnalysisJob,
  WorkerState,
  AnalysisWorkerControl,
} from "./analysisWorkerTypes.js";

export type { AnalysisWorkerControl };

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Database Queries ====================

const QUERIES = {
  /**
   * Fair-scheduled job selection.
   *
   * Uses ROW_NUMBER() partitioned by workspace_id to limit how many jobs
   * any single tenant can contribute per batch. This prevents a high-volume
   * tenant from monopolizing all worker slots while others wait.
   *
   * $1 = total batch limit, $2 = max jobs per tenant per batch
   */
  SELECT_PENDING: `
    WITH candidates AS (
      SELECT id, status, repository_full_name AS repository, log_ref AS request_payload,
             workspace_id, created_at
      FROM analysis_jobs
      WHERE status = 'pending'
        AND analysis_enqueued_at IS NULL
        AND cancelled_at IS NULL
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
    ),
    ranked AS (
      SELECT id, status, repository, request_payload, workspace_id,
             ROW_NUMBER() OVER (PARTITION BY COALESCE(workspace_id, id::text) ORDER BY created_at ASC) AS tenant_rank
      FROM candidates
    )
    SELECT id, status, repository, request_payload, workspace_id
    FROM ranked
    WHERE tenant_rank <= $2
    ORDER BY tenant_rank ASC, id ASC
    LIMIT $1
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

// ==================== Helper Functions ====================

/**
 * Fetch pending jobs from database.
 */
const fetchPendingJobs = async (limit: number): Promise<readonly AnalysisJob[]> => {
  const result = await query<{
    readonly id: string;
    readonly status: string;
    readonly repository: string;
    readonly request_payload: Record<string, unknown>;
    readonly workspace_id: string | null;
  }>(QUERIES.SELECT_PENDING, [limit, FAIR_QUEUE_DEFAULTS.MAX_JOBS_PER_TENANT_PER_BATCH]);

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status as JobStatus,
    repository: row.repository,
    requestPayload: row.request_payload,
    workspaceId: row.workspace_id,
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

  // Check subscription status before processing (fail-open)
  const tenantId = job.workspaceId ?? (request.tenant_id as string | undefined) ?? null;
  if (tenantId && tenantId !== "default" && tenantId !== "system") {
    try {
      const subscription = await getSubscriptionByTenant(tenantId);
      const blockedStatuses: ReadonlySet<string> = new Set([
        SUBSCRIPTION_STATUS.CANCELED,
        SUBSCRIPTION_STATUS.PAST_DUE,
      ]);
      if (subscription && blockedStatuses.has(subscription.status)) {
        logger.info("Skipping job for inactive subscription", {
          ...context,
          jobId: job.id,
          subscriptionTenantId: tenantId,
          subscriptionStatus: subscription.status,
        });
        await query(QUERIES.UPDATE_FAILED, [job.id, `Subscription ${subscription.status}`]);
        return;
      }
    } catch (subError: unknown) {
      // Fail-open: proceed if subscription check fails
      logger.warn("Subscription check failed, proceeding", {
        ...context,
        jobId: job.id,
        subscriptionTenantId: tenantId,
        error: getErrorMessage(subError),
      });
    }
  }

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
