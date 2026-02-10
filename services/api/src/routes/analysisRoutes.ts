/**
 * Analysis Routes
 *
 * Handles CI failure analysis endpoints.
 * Uses async job processing to avoid request timeouts for large logs.
 *
 * @module routes/analysisRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  query,
  NotFoundError,
  generateEventId,
} from "@kenchi/shared";
import type { AnalyzeRequest } from "../types/apiTypes.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Database Queries ====================

const QUERIES = {
  INSERT_JOB: `
    INSERT INTO analysis_jobs (
      id, idempotency_key, workspace_id, status, log_ref,
      repository_full_name, commit_sha, installation_id, created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, 'pending', $3::jsonb,
      $4, $5, $6, NOW()
    )
    RETURNING id, status
  `,

  SELECT_JOB: `
    SELECT id, status, result, error
    FROM analysis_jobs WHERE id = $1::uuid
  `,
} as const;

// ==================== Types ====================

interface JobRow {
  readonly id: string;
  readonly status: string;
  readonly result: Record<string, unknown> | null;
  readonly error: string | null;
}

interface AnalyzeJobResponse {
  readonly job_id: string;
  readonly status: "pending";
}

interface JobStatusResponse {
  readonly job_id: string;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly result?: Record<string, unknown>;
  readonly error?: string;
}

// ==================== Validation Rules ====================

/** Validation rule: required string */
const validateRequiredString = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return validators.string(fieldValue);
};

// ==================== Route Handlers ====================

/**
 * Handles CI failure analysis requests.
 * Creates a job in the database for async processing.
 * Returns 202 Accepted immediately with job ID for polling.
 */
const handleAnalyze = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AnalyzeRequest;
  const idempotencyKey = generateEventId("job");

  // Create job in database
  const result = await query<{ id: string; status: string }>(QUERIES.INSERT_JOB, [
    idempotencyKey,
    body.tenant_id ?? "default",
    JSON.stringify({
      failure_log: body.failure_log,
      repository: body.repository,
      commit: body.commit,
      tenant_id: body.tenant_id,
      workflow_id: body.workflow_id,
      test_framework: body.test_framework,
      pr_number: body.pr_number,
      pr_diff: body.pr_diff,
      pr_changed_files: body.pr_changed_files,
      pr_title: body.pr_title,
    }),
    body.repository,
    body.commit ?? "unknown",
    0, // installation_id - 0 for direct API calls
  ]);

  const job = result.rows[0];

  logger.info("Analysis job created", {
    jobId: job.id,
    repository: body.repository,
    hasCommit: !!body.commit,
  });

  const response: AnalyzeJobResponse = {
    job_id: job.id,
    status: "pending",
  };

  res.status(HTTP_STATUS.ACCEPTED).json(response);
};

/**
 * Handles job status polling requests.
 * Returns current job status and result if completed.
 */
const handleGetJobStatus = async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.id;

  const result = await query<JobRow>(QUERIES.SELECT_JOB, [jobId]);
  const job = result.rows[0];

  if (!job) {
    throw new NotFoundError("Job not found", { metadata: { jobId } });
  }

  const response: JobStatusResponse = {
    job_id: job.id,
    status: job.status as JobStatusResponse["status"],
    result: job.result ?? undefined,
    error: job.error ?? undefined,
  };

  res.status(HTTP_STATUS.OK).json(response);
};

// ==================== Route Definitions ====================

/** POST /api/analyze - CI failure analysis endpoint (async) */
router.post(
  API_ROUTES.ANALYZE,
  validate({
    body: {
      failure_log: validateRequiredString,
      repository: validateRequiredString,
    },
  }),
  asyncHandler(handleAnalyze)
);

/** GET /api/jobs/:id - Job status polling endpoint */
router.get("/api/jobs/:id", asyncHandler(handleGetJobStatus));

export { router as analysisRoutes };
