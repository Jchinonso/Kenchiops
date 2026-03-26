/**
 * CircleCI Log Fetcher Adapter
 *
 * Implements CILogFetcherPort for CircleCI.
 * Fetches job step output logs via the CircleCI v2 endpoint.
 * Uses Circle-Token header authentication resolved from provider_connections.
 *
 * @module adapters/circleciLogFetcherAdapter
 */

import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  mapWithConcurrency,
  resilientGet,
  findByTenantAndProvider,
  withCircuitBreaker,
  buildTenantCircuitKey,
  CIRCLECI_API_BASE_URL,
  CIRCLECI_MAX_FAILED_JOBS,
  CIRCLECI_FAILURE_STATUSES,
  type CILogFetcherPort,
  type FetchedBuildLogs,
  type RequestContext,
} from "@kenchi/shared";
import type {
  ResolvedCircleCIConnection,
  CircleCIPaginatedResponse,
  CircleCIWorkflowSummary,
  CircleCIJobSummary,
  CircleCIJobStep,
} from "../types/circleciTypes.js";

const logger = createLogger("circleci-log-fetcher");

const CIRCLECI_TIMEOUT_MS = 30_000;
const LOG_FETCH_CONCURRENCY = 5;

// ==================== Token Resolution ====================

/**
 * Resolve the CircleCI token from provider_connections, scoped to the requesting tenant.
 * Prevents cross-tenant token leakage by filtering on tenantId.
 */
const resolveCircleCIToken = async (
  context: RequestContext
): Promise<ResolvedCircleCIConnection> => {
  const connection = await findByTenantAndProvider(context.tenantId, "circleci");

  if (!connection?.accessToken) {
    logger.error("No CircleCI token found for tenant", {
      provider: "circleci",
      operation: "resolveCircleCIToken",
      ...context,
    });
    throw new ExternalServiceError(
      "circleci",
      "No CircleCI token configured. Add a CircleCI provider connection with a token.",
      { retryable: false }
    );
  }

  return {
    apiToken: connection.accessToken,
    projectSlug: connection.externalOrgId ?? "",
  };
};

// ==================== Helpers ====================

/**
 * Build standard CircleCI headers.
 */
const buildHeaders = (token: string): Readonly<Record<string, string>> => ({
  "Circle-Token": token,
});

/**
 * Encode a CircleCI project slug for safe URL interpolation.
 * Format: "gh/owner/repo" — each segment is encoded individually to preserve slashes.
 */
const encodeProjectSlug = (slug: string): string =>
  slug.split("/").map(encodeURIComponent).join("/");

/**
 * Fetch the step output (logs) for a CircleCI job by job number.
 *
 * CircleCI v2 provides job details with step actions. Each step action
 * may include an output_url that contains the log content.
 * We fetch the job details and concatenate all step outputs.
 */
const fetchJobStepLogs = async (
  projectSlug: string,
  jobNumber: number,
  token: string,
  context: RequestContext
): Promise<string> => {
  const url = `${CIRCLECI_API_BASE_URL}/project/${encodeProjectSlug(projectSlug)}/${encodeURIComponent(String(jobNumber))}`;
  const startTime = Date.now();

  try {
    const jobDetailsResult = await resilientGet<{ readonly steps: readonly CircleCIJobStep[] }>(
      url,
      {
        headers: buildHeaders(token),
        timeout: CIRCLECI_TIMEOUT_MS,
      }
    );

    const durationMs = Date.now() - startTime;

    // Collect output URLs from all step actions, filtering to trusted CircleCI domains only
    const CIRCLECI_ALLOWED_HOSTS = new Set([
      "circleci.com",
      "dl.circleci.com",
      "output.circle-artifacts.com",
    ]);

    const isTrustedCircleCIUrl = (urlString: string): boolean => {
      try {
        const parsed = new URL(urlString);
        return parsed.protocol === "https:" && CIRCLECI_ALLOWED_HOSTS.has(parsed.hostname);
      } catch {
        return false;
      }
    };

    const outputUrls = jobDetailsResult.data.steps.flatMap((step) =>
      step.actions
        .filter(
          (action) =>
            action.output_url !== undefined && isTrustedCircleCIUrl(action.output_url as string)
        )
        .map((action) => action.output_url as string)
    );

    // Fetch each output URL — do NOT send API token to output URLs (SSRF defense-in-depth)
    const logParts = await mapWithConcurrency(
      outputUrls,
      async (outputUrl): Promise<string> => {
        try {
          const outputResult = await resilientGet<string>(outputUrl, {
            timeout: CIRCLECI_TIMEOUT_MS,
            responseType: "text",
          });
          return outputResult.data;
        } catch (error) {
          logger.warn("Failed to fetch CircleCI step output", {
            provider: "circleci",
            operation: "fetchStepOutput",
            durationMs: Date.now() - startTime,
            error: getErrorMessage(error),
            ...context,
          });
          return "";
        }
      },
      LOG_FETCH_CONCURRENCY
    );

    const logs = logParts.join("\n");

    logger.info("CircleCI job logs fetched", {
      provider: "circleci",
      operation: "fetchJobStepLogs",
      durationMs,
      statusCode: jobDetailsResult.status,
      jobNumber,
      projectSlug,
      stepCount: jobDetailsResult.data.steps.length,
      logLength: logs.length,
      ...context,
    });

    return logs;
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    logger.error("CircleCI job log fetch failed", {
      provider: "circleci",
      operation: "fetchJobStepLogs",
      durationMs: Date.now() - startTime,
      jobNumber,
      projectSlug,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "circleci",
      `Failed to fetch job logs: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

/**
 * List recent pipelines for a project filtered by a commit SHA.
 * CircleCI v2 does not support filtering by SHA directly, so we
 * fetch recent pipelines and filter client-side.
 */
const findPipelineForCommit = async (
  projectSlug: string,
  commitSha: string,
  token: string,
  context: RequestContext
): Promise<string | null> => {
  const url = `${CIRCLECI_API_BASE_URL}/project/${encodeProjectSlug(projectSlug)}/pipeline`;
  const startTime = Date.now();

  try {
    const pipelineResult = await resilientGet<
      CircleCIPaginatedResponse<{
        readonly id: string;
        readonly vcs?: { readonly revision: string };
      }>
    >(url, {
      headers: buildHeaders(token),
      timeout: CIRCLECI_TIMEOUT_MS,
    });

    const durationMs = Date.now() - startTime;
    const matchingPipeline = pipelineResult.data.items.find(
      (pipeline) => pipeline.vcs?.revision === commitSha
    );

    logger.info("CircleCI pipeline lookup completed", {
      provider: "circleci",
      operation: "findPipelineForCommit",
      durationMs,
      statusCode: pipelineResult.status,
      commitSha: commitSha.substring(0, 7),
      found: matchingPipeline !== undefined,
      pipelinesChecked: pipelineResult.data.items.length,
      ...context,
    });

    return matchingPipeline?.id ?? null;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.warn("CircleCI pipeline lookup failed, returning null", {
      provider: "circleci",
      operation: "findPipelineForCommit",
      durationMs,
      commitSha: commitSha.substring(0, 7),
      error: getErrorMessage(error),
      ...context,
    });

    return null;
  }
};

/**
 * Fetch all workflows for a CircleCI pipeline.
 */
const fetchPipelineWorkflows = async (
  pipelineId: string,
  token: string,
  context: RequestContext
): Promise<readonly CircleCIWorkflowSummary[]> => {
  const url = `${CIRCLECI_API_BASE_URL}/pipeline/${encodeURIComponent(pipelineId)}/workflow`;
  const startTime = Date.now();

  try {
    const workflowResult = await resilientGet<CircleCIPaginatedResponse<CircleCIWorkflowSummary>>(
      url,
      {
        headers: buildHeaders(token),
        timeout: CIRCLECI_TIMEOUT_MS,
      }
    );

    const durationMs = Date.now() - startTime;

    logger.info("CircleCI workflows fetched", {
      provider: "circleci",
      operation: "fetchPipelineWorkflows",
      durationMs,
      statusCode: workflowResult.status,
      pipelineId,
      workflowCount: workflowResult.data.items.length,
      ...context,
    });

    return workflowResult.data.items;
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("CircleCI workflows fetch failed", {
      provider: "circleci",
      operation: "fetchPipelineWorkflows",
      durationMs,
      pipelineId,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "circleci",
      `Failed to fetch pipeline workflows: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

/**
 * Fetch jobs for a CircleCI workflow.
 */
const fetchWorkflowJobs = async (
  workflowId: string,
  token: string,
  context: RequestContext
): Promise<readonly CircleCIJobSummary[]> => {
  const url = `${CIRCLECI_API_BASE_URL}/workflow/${encodeURIComponent(workflowId)}/job`;
  const startTime = Date.now();

  try {
    const jobsResult = await resilientGet<CircleCIPaginatedResponse<CircleCIJobSummary>>(url, {
      headers: buildHeaders(token),
      timeout: CIRCLECI_TIMEOUT_MS,
    });

    const durationMs = Date.now() - startTime;

    logger.info("CircleCI workflow jobs fetched", {
      provider: "circleci",
      operation: "fetchWorkflowJobs",
      durationMs,
      statusCode: jobsResult.status,
      workflowId,
      jobCount: jobsResult.data.items.length,
      ...context,
    });

    return jobsResult.data.items;
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("CircleCI workflow jobs fetch failed", {
      provider: "circleci",
      operation: "fetchWorkflowJobs",
      durationMs,
      workflowId,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "circleci",
      `Failed to fetch workflow jobs: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

// ==================== Adapter ====================

/**
 * Creates a CircleCI log fetcher adapter implementing CILogFetcherPort.
 *
 * Resolves the CircleCI token from provider_connections at call time.
 * For CircleCI, installationId is unused (always 0).
 */
export const createCircleCILogFetcherAdapter = (): CILogFetcherPort => ({
  fetchBuildLogs: async (
    buildId: string,
    owner: string,
    repo: string,
    _installationId: number,
    context: RequestContext
  ): Promise<FetchedBuildLogs> => {
    const { apiToken } = await resolveCircleCIToken(context);
    const projectSlug = `gh/${owner}/${repo}`;
    const startTime = Date.now();

    // buildId for CircleCI is the job number (from webhook payload job.number)
    const jobNumber = parseInt(buildId, 10);
    const logs = await fetchJobStepLogs(projectSlug, jobNumber, apiToken, context);
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
    const circuitKey = buildTenantCircuitKey("circleci", context.tenantId);
    const { apiToken } = await resolveCircleCIToken(context);
    const projectSlug = `gh/${owner}/${repo}`;
    const startTime = Date.now();

    // 1. Find the pipeline for this commit
    const pipelineId = await withCircuitBreaker(circuitKey, async () =>
      findPipelineForCommit(projectSlug, commitSha, apiToken, context)
    );

    if (!pipelineId) {
      logger.info("No CircleCI pipeline found for commit", {
        provider: "circleci",
        operation: "fetchAllFailedLogs",
        commitSha: commitSha.substring(0, 7),
        projectSlug,
        ...context,
      });
      return [];
    }

    // 2. Fetch workflows for the pipeline
    const workflows = await withCircuitBreaker(circuitKey, async () =>
      fetchPipelineWorkflows(pipelineId, apiToken, context)
    );

    // 3. Fetch jobs from all workflows and filter to failures
    const allJobs = await mapWithConcurrency(
      workflows,
      async (workflow) =>
        withCircuitBreaker(circuitKey, async () =>
          fetchWorkflowJobs(workflow.id, apiToken, context)
        ),
      LOG_FETCH_CONCURRENCY
    );

    const allFailedJobs = allJobs.flat().filter((job) => CIRCLECI_FAILURE_STATUSES.has(job.status));

    if (allFailedJobs.length === 0) {
      logger.info("No failed jobs in CircleCI pipeline", {
        provider: "circleci",
        operation: "fetchAllFailedLogs",
        pipelineId,
        commitSha: commitSha.substring(0, 7),
        ...context,
      });
      return [];
    }

    // 4. Cap the number of failed jobs
    const failedJobs =
      allFailedJobs.length > CIRCLECI_MAX_FAILED_JOBS
        ? allFailedJobs.slice(0, CIRCLECI_MAX_FAILED_JOBS)
        : allFailedJobs;

    if (allFailedJobs.length > CIRCLECI_MAX_FAILED_JOBS) {
      logger.warn("Failed jobs exceed cap, processing only first batch", {
        provider: "circleci",
        operation: "fetchAllFailedLogs",
        pipelineId,
        totalFailedJobs: allFailedJobs.length,
        cappedAt: CIRCLECI_MAX_FAILED_JOBS,
        commitSha: commitSha.substring(0, 7),
        ...context,
      });
    }

    // 5. Fetch logs for each failed job
    const results = await mapWithConcurrency(
      failedJobs,
      async (job): Promise<FetchedBuildLogs> => {
        const logs = await fetchJobStepLogs(projectSlug, job.job_number, apiToken, context);

        // Calculate duration from started_at/stopped_at if available
        const durationMs =
          job.started_at && job.stopped_at
            ? new Date(job.stopped_at).getTime() - new Date(job.started_at).getTime()
            : undefined;

        return {
          buildId: String(job.job_number),
          buildName: job.name,
          logs,
          durationMs,
        };
      },
      LOG_FETCH_CONCURRENCY
    );

    logger.info("Fetched all failed CircleCI job logs", {
      provider: "circleci",
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
