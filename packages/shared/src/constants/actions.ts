/**
 * Action Executor Constants
 *
 * Centralized configuration for action execution messages and validation.
 */

/**
 * Action execution error and status messages.
 */
export const ACTION_MESSAGES = {
  MISSING_WORKFLOW_CONTEXT: "Cannot rerun pipeline: No workflow run ID or check run ID provided",
  MISSING_PR_NUMBER: "Cannot post comment: No PR number provided",
  EXECUTION_FAILED: "Action execution failed",
  ACTION_COMPLETED: "Action completed",
  RERUN_REQUEST_FAILED: "Rerun request failed",
} as const;
