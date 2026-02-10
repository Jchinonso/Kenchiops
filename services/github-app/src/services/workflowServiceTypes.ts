/**
 * Types for Workflow Service
 *
 * @module services/workflowServiceTypes
 */

/**
 * Result of a workflow rerun attempt
 */
export interface RerunResult {
  readonly success: boolean;
  readonly message: string;
  readonly runId?: number;
  readonly error?: string;
}
