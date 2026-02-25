/**
 * GitLab CI Log Fetcher Adapter
 *
 * Implements CILogFetcherPort for GitLab CI.
 * Fetches job traces (logs) and pipeline job lists via the GitLab REST API.
 * Uses PRIVATE-TOKEN header authentication resolved from provider_connections.
 *
 * @module adapters/gitlabLogFetcherAdapter
 */

import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  mapWithConcurrency,
  cleanGitLabLog,
  resilientGet,
  findActiveByProvider,
  withCircuitBreaker,
  buildTenantCircuitKey,
  type CILogFetcherPort,
  type FetchedBuildLogs,
  type RequestContext,
} from "@kenchi/shared";
import type {
  ResolvedGitLabConnection,
  GitLabPipelineSummary,
  GitLabJobSummary,
} from "../types/gitlabTypes.js";

const logger = createLogger("gitlab-log-fetcher");

const GITLAB_TRACE_TIMEOUT_MS = 30_000;
const LOG_FETCH_CONCURRENCY = 5;
const GITLAB_DEFAULT_BASE_URL = "https://gitlab.com";

// ==================== Token Resolution ====================

/**
 * Resolve the GitLab access token from provider_connections.
 * Finds the first active gitlab_ci connection with an access token.
 * In the future this can be refined to match by externalOrgId/project.
 */
const resolveAccessToken = async (context: RequestContext): Promise<ResolvedGitLabConnection> => {
  const connections = await findActiveByProvider("gitlab_ci");
  const connection = connections.find((conn) => conn.accessToken !== null);

  if (!connection?.accessToken) {
    logger.error("No GitLab access token found in provider connections", {
      provider: "gitlab",
      operation: "resolveAccessToken",
      connectionCount: connections.length,
      ...context,
    });
    throw new ExternalServiceError(
      "gitlab",
      "No GitLab access token configured. Add a GitLab CI provider connection with an access token.",
      { retryable: false }
    );
  }

  return {
    accessToken: connection.accessToken,
    baseUrl: connection.baseUrl ?? GITLAB_DEFAULT_BASE_URL,
  };
};

// ==================== API Helpers ====================

/**
 * Build an encoded GitLab API project path from owner/repo.
 * GitLab requires URL-encoding of the full project path (e.g., "group%2Fproject").
 */
const encodeProjectPath = (owner: string, repo: string): string =>
  encodeURIComponent(`${owner}/${repo}`);

/**
 * Fetch a single job's log trace from GitLab.
 * The trace endpoint returns plain text, so we cannot use resilientGet (JSON-only).
 * Uses bare fetch with AbortSignal.timeout for the text response.
 */
const fetchJobTrace = async (
  baseUrl: string,
  encodedPath: string,
  jobId: string,
  accessToken: string,
  context: RequestContext
): Promise<string> => {
  const startTime = Date.now();
  const url = `${baseUrl}/api/v4/projects/${encodedPath}/jobs/${jobId}/trace`;

  try {
    const response = await fetch(url, {
      headers: { "PRIVATE-TOKEN": accessToken },
      signal: AbortSignal.timeout(GITLAB_TRACE_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      logger.error("GitLab job trace fetch failed", {
        provider: "gitlab",
        operation: "fetchJobTrace",
        durationMs,
        statusCode: response.status,
        jobId,
        ...context,
      });
      throw new ExternalServiceError(
        "gitlab",
        `Job trace fetch failed with status ${response.status}`,
        {
          retryable: response.status >= 500 || response.status === 429,
        }
      );
    }

    const rawText = await response.text();

    logger.info("GitLab job trace fetched", {
      provider: "gitlab",
      operation: "fetchJobTrace",
      durationMs,
      statusCode: response.status,
      jobId,
      logLength: rawText.length,
      ...context,
    });

    return cleanGitLabLog(rawText);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;
    logger.error("GitLab job trace fetch failed", {
      provider: "gitlab",
      operation: "fetchJobTrace",
      durationMs,
      jobId,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "gitlab",
      `Failed to fetch job trace: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

/**
 * Fetch failed jobs for a GitLab pipeline.
 * Uses resilientGet for automatic retry and circuit breaker.
 */
const fetchFailedJobs = async (
  baseUrl: string,
  encodedPath: string,
  pipelineId: string,
  accessToken: string,
  context: RequestContext
): Promise<readonly GitLabJobSummary[]> => {
  const url = `${baseUrl}/api/v4/projects/${encodedPath}/pipelines/${pipelineId}/jobs?scope[]=failed&per_page=100`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<readonly GitLabJobSummary[]>(url, {
      headers: { "PRIVATE-TOKEN": accessToken },
    });

    const durationMs = Date.now() - startTime;

    logger.info("GitLab failed jobs fetched", {
      provider: "gitlab",
      operation: "fetchFailedJobs",
      durationMs,
      statusCode: response.status,
      pipelineId,
      jobCount: response.data.length,
      ...context,
    });

    return response.data;
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitLab failed jobs fetch failed", {
      provider: "gitlab",
      operation: "fetchFailedJobs",
      durationMs,
      pipelineId,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "gitlab",
      `Failed to fetch pipeline jobs: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

/**
 * Find the most recent pipeline for a commit SHA.
 * Uses resilientGet for automatic retry and circuit breaker.
 */
const findPipelineForCommit = async (
  baseUrl: string,
  encodedPath: string,
  commitSha: string,
  accessToken: string,
  context: RequestContext
): Promise<GitLabPipelineSummary | null> => {
  const url = `${baseUrl}/api/v4/projects/${encodedPath}/pipelines?sha=${commitSha}&per_page=1&order_by=id&sort=desc`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<readonly GitLabPipelineSummary[]>(url, {
      headers: { "PRIVATE-TOKEN": accessToken },
    });

    const durationMs = Date.now() - startTime;

    logger.info("GitLab pipeline lookup completed", {
      provider: "gitlab",
      operation: "findPipelineForCommit",
      durationMs,
      statusCode: response.status,
      commitSha: commitSha.substring(0, 7),
      found: response.data.length > 0,
      ...context,
    });

    return response.data[0] ?? null;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.warn("GitLab pipeline lookup failed, returning null", {
      provider: "gitlab",
      operation: "findPipelineForCommit",
      durationMs,
      commitSha: commitSha.substring(0, 7),
      error: getErrorMessage(error),
      ...context,
    });

    return null;
  }
};

// ==================== Adapter ====================

/**
 * Creates a GitLab CI log fetcher adapter implementing CILogFetcherPort.
 *
 * Resolves the GitLab access token from provider_connections at call time.
 * For GitLab, installationId is unused (always 0).
 */
export const createGitLabLogFetcherAdapter = (): CILogFetcherPort => ({
  fetchBuildLogs: async (
    buildId: string,
    owner: string,
    repo: string,
    _installationId: number,
    context: RequestContext
  ): Promise<FetchedBuildLogs> => {
    const circuitKey = buildTenantCircuitKey("gitlab", context.tenantId);
    const { accessToken, baseUrl } = await resolveAccessToken(context);
    const encodedPath = encodeProjectPath(owner, repo);
    const startTime = Date.now();
    const logs = await withCircuitBreaker(circuitKey, async () =>
      fetchJobTrace(baseUrl, encodedPath, buildId, accessToken, context)
    );
    const durationMs = Date.now() - startTime;

    return { buildId, buildName: `job-${buildId}`, logs, durationMs };
  },

  fetchAllFailedLogs: async (
    commitSha: string,
    owner: string,
    repo: string,
    _installationId: number,
    context: RequestContext
  ): Promise<readonly FetchedBuildLogs[]> => {
    const circuitKey = buildTenantCircuitKey("gitlab", context.tenantId);
    const { accessToken, baseUrl } = await resolveAccessToken(context);
    const encodedPath = encodeProjectPath(owner, repo);
    const startTime = Date.now();

    // Find the pipeline for this commit
    const pipeline = await withCircuitBreaker(circuitKey, async () =>
      findPipelineForCommit(baseUrl, encodedPath, commitSha, accessToken, context)
    );

    if (!pipeline) {
      logger.info("No GitLab pipeline found for commit", {
        provider: "gitlab",
        operation: "fetchAllFailedLogs",
        commitSha: commitSha.substring(0, 7),
        ...context,
      });
      return [];
    }

    const pipelineId = String(pipeline.id);
    const failedJobs = await withCircuitBreaker(circuitKey, async () =>
      fetchFailedJobs(baseUrl, encodedPath, pipelineId, accessToken, context)
    );

    if (failedJobs.length === 0) {
      logger.info("No failed jobs in GitLab pipeline", {
        provider: "gitlab",
        operation: "fetchAllFailedLogs",
        pipelineId,
        commitSha: commitSha.substring(0, 7),
        ...context,
      });
      return [];
    }

    const results = await mapWithConcurrency(
      failedJobs,
      async (job): Promise<FetchedBuildLogs> => {
        const logs = await withCircuitBreaker(circuitKey, async () =>
          fetchJobTrace(baseUrl, encodedPath, String(job.id), accessToken, context)
        );
        return {
          buildId: String(job.id),
          buildName: job.name,
          logs,
          // GitLab job durations are in seconds -- convert to milliseconds
          durationMs: job.duration === null ? undefined : job.duration * 1000,
        };
      },
      LOG_FETCH_CONCURRENCY
    );

    logger.info("Fetched all failed GitLab job logs", {
      provider: "gitlab",
      operation: "fetchAllFailedLogs",
      durationMs: Date.now() - startTime,
      pipelineId,
      commitSha: commitSha.substring(0, 7),
      jobCount: results.length,
      ...context,
    });

    return results;
  },
});
