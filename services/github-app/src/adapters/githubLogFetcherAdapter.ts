/**
 * GitHub Actions Log Fetcher Adapter
 *
 * Implements CILogFetcherPort for GitHub Actions.
 * Wraps existing workflowFetcher functions that use Octokit.
 *
 * @module adapters/githubLogFetcherAdapter
 */

import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  withCircuitBreaker,
  buildTenantCircuitKey,
  type CILogFetcherPort,
  type FetchedBuildLogs,
  type RequestContext,
} from "@kenchi/shared";
import { fetchAllFailedJobsLogs } from "../services/context/workflowFetcher.js";

const logger = createLogger("github-log-fetcher");

// ==================== Adapter ====================

export const githubLogFetcherAdapter: CILogFetcherPort = {
  fetchBuildLogs: async (
    buildId: string,
    owner: string,
    repo: string,
    installationId: number,
    context: RequestContext
  ): Promise<FetchedBuildLogs> => {
    const startTime = Date.now();
    const circuitKey = buildTenantCircuitKey("github", context.tenantId);

    try {
      // For GitHub Actions, we fetch all failed logs and filter by buildId.
      // Individual job log fetching is not exposed separately in workflowFetcher.
      const result = await withCircuitBreaker(circuitKey, async () =>
        fetchAllFailedJobsLogs(installationId, owner, repo, buildId)
      );
      const durationMs = Date.now() - startTime;

      if (!result) {
        logger.warn("No logs found for build", {
          provider: "github",
          operation: "fetchBuildLogs",
          durationMs,
          buildId,
          ...context,
        });
        return { buildId, buildName: "unknown", logs: "", durationMs };
      }

      const job = result.jobs.find((j) => String(j.jobId) === buildId);

      logger.info("Fetched build logs", {
        provider: "github",
        operation: "fetchBuildLogs",
        durationMs,
        // statusCode: N/A — wraps internal Octokit SDK, HTTP status not propagated
        buildId,
        jobFound: !!job,
        ...context,
      });

      return {
        buildId,
        buildName: job?.jobName ?? result.workflowName,
        logs: job?.logs ?? result.combinedLogs,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Failed to fetch build logs", {
        provider: "github",
        operation: "fetchBuildLogs",
        durationMs,
        buildId,
        error: getErrorMessage(error),
        ...context,
      });
      throw new ExternalServiceError(
        "github",
        `Failed to fetch build logs: ${getErrorMessage(error)}`,
        { retryable: true }
      );
    }
  },

  fetchAllFailedLogs: async (
    commitSha: string,
    owner: string,
    repo: string,
    installationId: number,
    context: RequestContext
  ): Promise<readonly FetchedBuildLogs[]> => {
    const startTime = Date.now();
    const circuitKey = buildTenantCircuitKey("github", context.tenantId);

    try {
      const result = await withCircuitBreaker(circuitKey, async () =>
        fetchAllFailedJobsLogs(installationId, owner, repo, commitSha)
      );
      const durationMs = Date.now() - startTime;

      if (!result) {
        logger.info("No failed jobs found for commit", {
          provider: "github",
          operation: "fetchAllFailedLogs",
          durationMs,
          commitSha: commitSha.substring(0, 7),
          ...context,
        });
        return [];
      }

      const logs: readonly FetchedBuildLogs[] = result.jobs.map((job) => ({
        buildId: String(job.jobId),
        buildName: job.jobName,
        logs: job.logs,
        durationMs,
      }));

      logger.info("Fetched all failed job logs", {
        provider: "github",
        operation: "fetchAllFailedLogs",
        durationMs,
        // statusCode: N/A — wraps internal Octokit SDK, HTTP status not propagated
        commitSha: commitSha.substring(0, 7),
        jobCount: logs.length,
        ...context,
      });

      return logs;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Failed to fetch all failed logs", {
        provider: "github",
        operation: "fetchAllFailedLogs",
        durationMs,
        commitSha: commitSha.substring(0, 7),
        error: getErrorMessage(error),
        ...context,
      });
      throw new ExternalServiceError(
        "github",
        `Failed to fetch failed job logs: ${getErrorMessage(error)}`,
        { retryable: true }
      );
    }
  },
};
