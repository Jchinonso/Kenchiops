/**
 * Types for Analysis Job Worker
 *
 * @module workers/analysisWorkerTypes
 */

// ==================== Job Types ====================

/**
 * Valid job status values.
 */
export type JobStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Analysis job fetched from the database.
 */
export interface AnalysisJob {
  readonly id: string;
  readonly status: JobStatus;
  readonly repository: string;
  readonly requestPayload: Record<string, unknown>;
}

/**
 * Internal worker state for tracking running/active jobs.
 */
export interface WorkerState {
  running: boolean;
  activeJobs: number;
}

/**
 * Control interface returned by startAnalysisWorker.
 */
export interface AnalysisWorkerControl {
  stop: () => void;
  isRunning: () => boolean;
  getActiveJobs: () => number;
}
