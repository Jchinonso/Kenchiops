/**
 * Workflow fetcher utilities.
 *
 * Fetches workflow logs and timing information from GitHub Actions.
 */

import { createLogger, GITHUB_RETRY_CONFIG, getErrorMessage } from "@kenchi/shared";
import { getOctokit } from "../githubService.js";
import type { WorkflowTiming } from "./types.js";

const logger = createLogger("github-app");

/**
 * Check if error is a DNS-related error
 */
const isDnsError = (errorMessage: string): boolean =>
  errorMessage.includes("EAI_AGAIN") || errorMessage.includes("ENOTFOUND");

/**
 * Calculate exponential backoff delay using centralized config
 */
const getBackoffDelay = (attempt: number): number =>
  GITHUB_RETRY_CONFIG.BASE_DELAY_MS * GITHUB_RETRY_CONFIG.BACKOFF_BASE ** (attempt - 1);

/**
 * Wait for a specified duration
 */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Fetch workflow run logs for a check run.
 *
 * Finds the failed workflow run for the given commit SHA and
 * downloads the logs for the first failed job.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param headSha - Commit SHA to find workflow runs for
 * @returns Workflow logs (truncated) or null if unavailable
 */
export const fetchWorkflowLogs = async (
  installationId: number,
  owner: string,
  repo: string,
  headSha: string
): Promise<string | null> => {
  try {
    const octokit = await getOctokit(installationId);

    // Find workflow runs for this commit
    const { data: workflowRuns } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      head_sha: headSha,
      per_page: 5,
    });

    if (workflowRuns.workflow_runs.length === 0) {
      logger.warn("No workflow runs found for commit", { owner, repo, headSha });
      return null;
    }

    logger.info("Found workflow runs for commit", {
      owner,
      repo,
      headSha,
      runCount: workflowRuns.workflow_runs.length,
      runIds: workflowRuns.workflow_runs.slice(0, 3).map((run) => run.id),
    });

    // Get the first (most recent) failed workflow run
    const failedRun =
      workflowRuns.workflow_runs.find((run) => run.conclusion === "failure") ||
      workflowRuns.workflow_runs[0];

    // Get jobs for this workflow run
    const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: failedRun.id,
    });

    // Find failed jobs
    const failedJobs = jobs.jobs.filter((job) => job.conclusion === "failure");
    if (failedJobs.length === 0) {
      logger.info("No failed jobs found in workflow run", { runId: failedRun.id });
      return null;
    }

    // Fetch logs for the first failed job with retry for DNS issues
    const failedJob = failedJobs[0];

    // Recursive retry function
    const fetchLogsWithRetry = async (attempt: number): Promise<string | null> => {
      try {
        const { data: logs } = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
          owner,
          repo,
          job_id: failedJob.id,
        });

        const logContent = typeof logs === "string" ? logs : String(logs);
        logger.info("Fetched workflow logs", {
          jobId: failedJob.id,
          logSize: logContent.length,
          attempt,
        });

        // Return full logs - truncation happens after test failure extraction
        return logContent;
      } catch (logError) {
        const errorMessage = logError instanceof Error ? logError.message : "Unknown error";
        const shouldRetry = isDnsError(errorMessage) && attempt < GITHUB_RETRY_CONFIG.MAX_RETRIES;

        if (shouldRetry) {
          logger.warn("DNS error fetching logs, retrying...", {
            jobId: failedJob.id,
            attempt,
            maxRetries: GITHUB_RETRY_CONFIG.MAX_RETRIES,
            error: errorMessage,
          });
          await wait(getBackoffDelay(attempt));
          return fetchLogsWithRetry(attempt + 1);
        }

        // Logs might not be available yet or expired
        logger.warn("Could not fetch job logs", {
          jobId: failedJob.id,
          attempt,
          error: errorMessage,
        });
        return null;
      }
    };

    return fetchLogsWithRetry(1);
  } catch (error) {
    logger.warn("Failed to fetch workflow logs", {
      headSha,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetch workflow timing information.
 *
 * Gets timing data for the workflow run including start time,
 * completion time, and duration.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param headSha - Commit SHA to find workflow runs for
 * @returns Workflow timing information or null if unavailable
 */
export const fetchWorkflowTiming = async (
  installationId: number,
  owner: string,
  repo: string,
  headSha: string
): Promise<WorkflowTiming | null> => {
  try {
    const octokit = await getOctokit(installationId);

    // Find workflow runs for this commit
    const { data: workflowRuns } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      head_sha: headSha,
      per_page: 5,
    });

    if (workflowRuns.workflow_runs.length === 0) {
      return null;
    }

    // Get the first (most recent) failed workflow run
    const failedRun =
      workflowRuns.workflow_runs.find((run) => run.conclusion === "failure") ||
      workflowRuns.workflow_runs[0];

    // Get jobs for timing info
    const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: failedRun.id,
    });

    const failedJob = jobs.jobs.find((job) => job.conclusion === "failure");

    // Calculate duration
    let durationMs: number | null = null;
    if (failedRun.run_started_at && failedRun.updated_at) {
      durationMs =
        new Date(failedRun.updated_at).getTime() - new Date(failedRun.run_started_at).getTime();
    }

    logger.info("Fetched workflow timing", {
      workflowName: failedRun.name,
      durationMs,
      conclusion: failedRun.conclusion,
    });

    return {
      workflowName: failedRun.name || "Unknown workflow",
      jobName: failedJob?.name || null,
      startedAt: failedRun.run_started_at || null,
      completedAt: failedRun.updated_at || null,
      durationMs,
      conclusion: failedRun.conclusion || null,
    };
  } catch (error) {
    logger.warn("Failed to fetch workflow timing", {
      headSha,
      error: getErrorMessage(error),
    });
    return null;
  }
};
