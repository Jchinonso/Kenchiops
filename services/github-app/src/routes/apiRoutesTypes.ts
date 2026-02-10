/**
 * Types for API Routes
 *
 * @module routes/apiRoutesTypes
 */

/**
 * Rerun request payload
 */
export interface RerunRequestBody {
  readonly installationId: number;
  readonly repository: string;
  readonly workflowRunId?: number;
  readonly checkRunId?: number;
  readonly commitSha?: string;
  readonly approvedBy?: string;
}
