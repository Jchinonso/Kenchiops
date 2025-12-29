/**
 * Workflow Service
 *
 * Handles GitHub workflow rerun and check suite operations.
 * Extracted from githubService for better separation of concerns.
 */

import { createLogger, getErrorMessage } from "@kenchi/shared";
import { getOctokit } from "./githubService.js";

const logger = createLogger("github-app");

// ==================== Types ====================

/**
 * Result of a workflow rerun attempt
 */
export interface RerunResult {
  readonly success: boolean;
  readonly message: string;
  readonly runId?: number;
  readonly error?: string;
}

// ==================== Workflow Operations ====================

/**
 * Rerun a failed workflow by workflow run ID
 */
export const rerunWorkflow = async (
  installationId: number,
  owner: string,
  repo: string,
  workflowRunId: number
): Promise<RerunResult> => {
  try {
    const octokit = await getOctokit(installationId);

    await octokit.rest.actions.reRunWorkflow({
      owner,
      repo,
      run_id: workflowRunId,
    });

    logger.info("Workflow rerun triggered", {
      owner,
      repo,
      workflowRunId,
    });

    return {
      success: true,
      message: `Workflow rerun triggered for run ${workflowRunId}`,
      runId: workflowRunId,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to rerun workflow", {
      owner,
      repo,
      workflowRunId,
      error: errorMessage,
    });

    return {
      success: false,
      message: "Failed to rerun workflow",
      error: errorMessage,
    };
  }
};

/**
 * Rerun failed jobs in a workflow run
 * More efficient than rerunning the entire workflow
 */
export const rerunFailedJobs = async (
  installationId: number,
  owner: string,
  repo: string,
  workflowRunId: number
): Promise<RerunResult> => {
  try {
    const octokit = await getOctokit(installationId);

    await octokit.rest.actions.reRunWorkflowFailedJobs({
      owner,
      repo,
      run_id: workflowRunId,
    });

    logger.info("Failed jobs rerun triggered", {
      owner,
      repo,
      workflowRunId,
    });

    return {
      success: true,
      message: `Failed jobs rerun triggered for run ${workflowRunId}`,
      runId: workflowRunId,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to rerun failed jobs", {
      owner,
      repo,
      workflowRunId,
      error: errorMessage,
    });

    return {
      success: false,
      message: "Failed to rerun failed jobs",
      error: errorMessage,
    };
  }
};

/**
 * Rerequest a check suite (triggers all checks in the suite)
 */
export const rerequestCheckSuite = async (
  installationId: number,
  owner: string,
  repo: string,
  checkSuiteId: number
): Promise<RerunResult> => {
  try {
    const octokit = await getOctokit(installationId);

    await octokit.rest.checks.rerequestSuite({
      owner,
      repo,
      check_suite_id: checkSuiteId,
    });

    logger.info("Check suite rerequest triggered", {
      owner,
      repo,
      checkSuiteId,
    });

    return {
      success: true,
      message: `Check suite rerequest triggered for suite ${checkSuiteId}`,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to rerequest check suite", {
      owner,
      repo,
      checkSuiteId,
      error: errorMessage,
    });

    return {
      success: false,
      message: "Failed to rerequest check suite",
      error: errorMessage,
    };
  }
};

// ==================== Check Run/Suite Queries ====================

/**
 * Get check suite ID for a check run
 * Needed when we only have check_run_id but need to rerequest the suite
 */
export const getCheckSuiteIdForRun = async (
  installationId: number,
  owner: string,
  repo: string,
  checkRunId: number
): Promise<number | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: checkRun } = await octokit.rest.checks.get({
      owner,
      repo,
      check_run_id: checkRunId,
    });

    return checkRun.check_suite?.id ?? null;
  } catch (error) {
    logger.error("Failed to get check suite ID", {
      owner,
      repo,
      checkRunId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Get workflow run ID from a check run
 * Check runs created by GitHub Actions have an associated workflow run
 */
export const getWorkflowRunIdForCheckRun = async (
  installationId: number,
  owner: string,
  repo: string,
  checkRunId: number
): Promise<number | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: checkRun } = await octokit.rest.checks.get({
      owner,
      repo,
      check_run_id: checkRunId,
    });

    // GitHub Actions check runs have the workflow run in the details_url
    // Pattern: https://github.com/owner/repo/actions/runs/RUN_ID/job/JOB_ID
    const detailsUrl = checkRun.details_url;
    if (detailsUrl) {
      const match = detailsUrl.match(/\/actions\/runs\/(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  } catch (error) {
    logger.error("Failed to get workflow run ID for check run", {
      owner,
      repo,
      checkRunId,
      error: getErrorMessage(error),
    });
    return null;
  }
};
