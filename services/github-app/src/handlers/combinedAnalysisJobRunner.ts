/**
 * Combined Analysis Job Runner
 *
 * Handles LLM analysis job lifecycle:
 * - Job submission to the API
 * - Async polling for job completion
 * - Per-job log analysis with preprocessing
 * - Error handling wrapper for individual jobs
 * - PR placeholder comment posting
 * - PR diff context fetching
 *
 * @module handlers/combinedAnalysisJobRunner
 */

import {
  createLogger,
  delay,
  resilientPost,
  resilientGet,
  getErrorMessage,
  preprocessLogsWithMetadata,
  sanitizeForChunkingWithMapping,
  parseTestSummary,
  GITHUB_COMMENT_TEMPLATES,
  GITHUB_CONTEXT_LIMITS,
  ExternalServiceError,
  getOrFetchPullRequest,
  getOrFetchPullRequestDiff,
  getOrFetchPullRequestFiles,
  type SanitizationResultWithMapping,
  type LLMChangeCorrelation,
  type TestFailureInfo,
  type LLMLintError,
} from "@kenchi/shared";
import { postPRComment } from "../services/githubComments.js";
import { getOctokit } from "../services/githubService.js";
import type {
  JobSubmissionResponse,
  JobStatusResponse,
  PerJobAnalysisApiResponse,
  JobAnalysisResult,
  AnalysisResultWithError,
  PRDiffContext,
  AnalyzeJobOptions,
  AnalyzeJobWithErrorHandlingOptions,
} from "./combinedAnalysisTypes.js";
import { postProcessTestFailures } from "./combinedAnalysisHelpers.js";

const logger = createLogger("github-app");

// ==================== Async Job Polling Configuration ====================

/**
 * Configuration for polling async analysis jobs.
 * The API now returns 202 immediately with a job_id, and we poll for completion.
 */
const POLLING_CONFIG = {
  /** Maximum time to wait for job completion (20 minutes for large logs with many chunks) */
  MAX_WAIT_MS: 1_200_000,
  /** Interval between status polls */
  INTERVAL_MS: 5_000,
  /** Timeout for individual HTTP requests */
  REQUEST_TIMEOUT_MS: 30_000,
} as const;

// ==================== API Response Extractors ====================

/**
 * Extract LLM test failures from API response.
 * The API already returns testFailures in the correct format (camelCase).
 */
const extractTestFailures = (response: PerJobAnalysisApiResponse): readonly TestFailureInfo[] =>
  response.full_analysis?.testFailures ?? [];

/**
 * Extract LLM lint errors from API response.
 * The API returns lintErrors in the correct format (camelCase).
 */
const extractLintErrors = (response: PerJobAnalysisApiResponse): readonly LLMLintError[] =>
  response.full_analysis?.lintErrors ?? [];

/**
 * Extract test command from API response.
 * The LLM generates this based on detected framework.
 */
const extractTestCommand = (response: PerJobAnalysisApiResponse): string | undefined =>
  response.full_analysis?.testCommand;

/**
 * Extract change correlations from API response.
 * Maps changed functions to failing tests from LLM PR diff analysis.
 */
const extractChangeCorrelations = (
  response: PerJobAnalysisApiResponse
): readonly LLMChangeCorrelation[] => response.full_analysis?.changeCorrelations ?? [];

// ==================== PR Diff Context ====================

/**
 * Fetch PR diff context for the first associated PR.
 * Uses cached GitHub API utilities for efficient retrieval.
 * Returns null if no PRs exist or fetch fails (graceful degradation).
 */
export const fetchPRDiffContext = async (
  installationId: number,
  owner: string,
  repo: string,
  pullRequestNumbers: readonly number[]
): Promise<PRDiffContext | null> => {
  if (pullRequestNumbers.length === 0) {
    return null;
  }

  const prNumber = pullRequestNumbers[0];
  const startTime = Date.now();

  try {
    const [prData, diff, changedFiles] = await Promise.all([
      getOrFetchPullRequest(owner, repo, prNumber, async () => {
        const octokit = await getOctokit(installationId);
        const response = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });
        return {
          number: response.data.number,
          title: response.data.title,
          body: response.data.body,
          author: response.data.user?.login ?? "unknown",
          headBranch: response.data.head.ref,
          baseBranch: response.data.base.ref,
          headSha: response.data.head.sha,
          labels: response.data.labels.map((label) => label.name),
          state: response.data.state,
          draft: response.data.draft ?? false,
        };
      }),
      getOrFetchPullRequestDiff(owner, repo, prNumber, async () => {
        const octokit = await getOctokit(installationId);
        const response = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
          mediaType: { format: "diff" },
        });
        return response.data as unknown as string;
      }),
      getOrFetchPullRequestFiles(owner, repo, prNumber, async () => {
        const octokit = await getOctokit(installationId);
        const response = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: prNumber,
          per_page: 100,
        });
        return response.data.map((file) => file.filename);
      }),
    ]);

    const truncatedDiff =
      diff.length > GITHUB_CONTEXT_LIMITS.MAX_DIFF_SIZE
        ? diff.substring(0, GITHUB_CONTEXT_LIMITS.MAX_DIFF_SIZE)
        : diff;

    logger.info("Fetched PR diff context", {
      provider: "github",
      operation: "fetchPRDiffContext",
      durationMs: Date.now() - startTime,
      owner,
      repo,
      prNumber,
      changedFileCount: changedFiles.length,
      diffSize: diff.length,
      truncated: diff.length > GITHUB_CONTEXT_LIMITS.MAX_DIFF_SIZE,
    });

    return {
      prNumber,
      diff: truncatedDiff,
      changedFiles,
      title: prData.title,
      author: prData.author,
      baseBranch: prData.baseBranch,
      branch: prData.headBranch,
      labels: [...prData.labels],
    };
  } catch (fetchError) {
    logger.warn("Failed to fetch PR diff context, continuing without it", {
      provider: "github",
      operation: "fetchPRDiffContext",
      durationMs: Date.now() - startTime,
      owner,
      repo,
      prNumber,
      error: getErrorMessage(fetchError),
    });
    return null;
  }
};

// ==================== PR Placeholder ====================

/**
 * Post a placeholder comment on a single PR.
 * Returns silently on failure -- placeholder is best-effort.
 */
const postPlaceholderToPR = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  placeholderBody: string
): Promise<void> => {
  try {
    await postPRComment(installationId, owner, repo, prNumber, placeholderBody, true);
  } catch (postError) {
    logger.warn("Failed to post analyzing placeholder", {
      prNumber,
      error: getErrorMessage(postError),
    });
  }
};

/**
 * Post a placeholder comment on PRs to indicate analysis is in progress.
 * Best-effort: failures are logged but do not block the analysis pipeline.
 */
export const postAnalyzingPlaceholder = async (
  installationId: number,
  owner: string,
  repo: string,
  pullRequestNumbers: readonly number[],
  checkNames: readonly string[]
): Promise<void> => {
  if (pullRequestNumbers.length === 0) {
    return;
  }

  const placeholderBody = GITHUB_COMMENT_TEMPLATES.ANALYZING_PLACEHOLDER(checkNames);

  await Promise.all(
    pullRequestNumbers.map((prNumber) =>
      postPlaceholderToPR(installationId, owner, repo, prNumber, placeholderBody)
    )
  );

  logger.info("Posted analyzing placeholder", {
    owner,
    repo,
    prCount: pullRequestNumbers.length,
    checkNames,
  });
};

// ==================== Job Polling ====================

/**
 * Poll for job completion from the API.
 * The API processes analysis jobs asynchronously to avoid HTTP timeouts.
 */
const pollForJobCompletion = async (
  jobId: string,
  apiBaseUrl: string,
  jobName: string,
  tenantId?: string
): Promise<PerJobAnalysisApiResponse> => {
  const startTime = Date.now();
  // Include tenant_id as query parameter (belt-and-suspenders alongside header)
  // to ensure tenant context is available for GET requests where body is absent
  const statusUrl = tenantId
    ? `${apiBaseUrl}/api/jobs/${jobId}?tenant_id=${encodeURIComponent(tenantId)}`
    : `${apiBaseUrl}/api/jobs/${jobId}`;

  logger.info("Polling for job completion", { jobId, jobName });

  while (Date.now() - startTime < POLLING_CONFIG.MAX_WAIT_MS) {
    const response = await resilientGet<JobStatusResponse>(statusUrl, {
      timeout: POLLING_CONFIG.REQUEST_TIMEOUT_MS,
      internalAuth: true,
      ...(tenantId && { headers: { "x-kenchi-tenant-id": tenantId } }),
    });

    const { status, result, error: jobError } = response.data;

    if (status === "completed" && result) {
      logger.info("Job completed successfully", {
        jobId,
        jobName,
        durationMs: Date.now() - startTime,
      });
      return result;
    }

    if (status === "failed") {
      logger.error("Job failed", {
        jobId,
        jobName,
        error: jobError,
        durationMs: Date.now() - startTime,
      });
      throw new ExternalServiceError("api", jobError ?? "Job failed without error message", {
        metadata: { jobId, jobName, status },
        retryable: false,
      });
    }

    // Still pending or processing, wait before polling again
    await delay(POLLING_CONFIG.INTERVAL_MS);
  }

  // Timeout reached
  const durationMs = Date.now() - startTime;
  logger.error("Job polling timed out", {
    jobId,
    jobName,
    durationMs,
    maxWaitMs: POLLING_CONFIG.MAX_WAIT_MS,
  });
  throw new ExternalServiceError("api", `Job ${jobId} timed out after ${durationMs}ms`, {
    metadata: { jobId, jobName, durationMs },
    retryable: false,
  });
};

// ==================== Job Analysis ====================

/**
 * Analyze a single job's logs via LLM API.
 * LLM extracts test failures with expected/actual values.
 *
 * V1.1: Uses chunking pipeline preprocessing with line mapping for
 * original line number recovery in annotations.
 *
 * V2: Uses async job pattern to avoid HTTP timeouts for large logs.
 * Submits job, receives 202 with job_id, then polls for completion.
 */
export const analyzeJobLogs = async (options: AnalyzeJobOptions): Promise<JobAnalysisResult> => {
  const { jobName, jobLogs, repository, apiUrl, tenantId, workflowId, prDiffContext, ciProvider } =
    options;

  // Parse deterministic test summary from raw logs BEFORE any sanitization
  const parsedTestSummary = parseTestSummary(jobLogs);

  // V1.1: Use chunking pipeline preprocessing for better size reduction and line mapping
  const sanitized: SanitizationResultWithMapping = sanitizeForChunkingWithMapping(jobLogs);

  // Also get test framework detection from legacy preprocessor
  const legacyPreprocessed = preprocessLogsWithMetadata(jobLogs);

  logger.info("Submitting job for async analysis", {
    jobName,
    repository,
    originalSize: sanitized.originalSize,
    processedSize: sanitized.finalSize,
    reductionPercent: sanitized.reductionPercent,
    secretsRedacted: sanitized.secretsRedacted,
    linesCollapsed: sanitized.linesCollapsed,
    progressLinesRemoved: sanitized.progressLinesRemoved,
    lineMappingsCount: sanitized.lineMappings.length,
    detectedFramework: legacyPreprocessed.testFramework?.name,
  });

  // Build request payload with optional context via spread (immutable)
  const requestPayload: Readonly<Record<string, unknown>> = {
    failure_log: sanitized.text,
    repository,
    job_name: jobName,
    ...(tenantId && { tenant_id: tenantId }),
    ...(workflowId && { workflow_id: workflowId }),
    ...(ciProvider && { ci_provider: ciProvider }),
    ...(legacyPreprocessed.testFramework && {
      test_framework: {
        name: legacyPreprocessed.testFramework.name,
        language: legacyPreprocessed.testFramework.language,
        assertion_hint: legacyPreprocessed.testFramework.assertionHint,
      },
    }),
    ...(prDiffContext && {
      pr_number: prDiffContext.prNumber,
      pr_diff: prDiffContext.diff,
      pr_changed_files: prDiffContext.changedFiles,
      pr_title: prDiffContext.title,
    }),
  };

  // Step 1: Submit job for async processing (returns 202 with job_id)
  const submitResponse = await resilientPost<JobSubmissionResponse>(apiUrl, requestPayload, {
    timeout: POLLING_CONFIG.REQUEST_TIMEOUT_MS,
    internalAuth: true,
  });

  const { job_id: jobId } = submitResponse.data;

  logger.info("Job submitted for async analysis", {
    jobId,
    jobName,
    repository,
  });

  // Step 2: Poll for job completion
  // Extract base URL from apiUrl (e.g., "http://localhost:3000/api/analyze" -> "http://localhost:3000")
  const apiBaseUrl = apiUrl.replace(/\/api\/analyze$/, "");
  const analysisResponse = await pollForJobCompletion(jobId, apiBaseUrl, jobName, tenantId);

  // Extract LLM test failures with expected/actual values, then infer missing file paths
  const rawTestFailures = extractTestFailures(analysisResponse);
  const testFailures = postProcessTestFailures(rawTestFailures);

  // Extract LLM lint errors with specific symbols
  const lintErrors = extractLintErrors(analysisResponse);

  // Extract LLM-generated test command
  const testCommand = extractTestCommand(analysisResponse);

  // Extract change correlations from LLM PR diff analysis
  const changeCorrelations = extractChangeCorrelations(analysisResponse);

  logger.info("Async analysis complete", {
    jobId,
    jobName,
    repository,
    testFailureCount: testFailures.length,
    parsedTestSummary: parsedTestSummary
      ? { failed: parsedTestSummary.failed, framework: parsedTestSummary.framework }
      : null,
    lintErrorCount: lintErrors.length,
    testCommand,
  });

  return {
    jobName,
    jobLogs,
    response: analysisResponse,
    testFailures,
    lintErrors,
    testCommand,
    changeCorrelations,
    lineMappings: sanitized.lineMappings,
    parsedTestSummary,
  };
};

/**
 * Analyze a single job with error handling.
 * Returns a result object with failed flag if analysis fails.
 */
export const analyzeJobWithErrorHandling = async (
  options: AnalyzeJobWithErrorHandlingOptions
): Promise<AnalysisResultWithError> => {
  const { job, repository, apiUrl, tenantId, workflowId, prDiffContext, ciProvider } = options;

  try {
    return await analyzeJobLogs({
      jobName: job.jobName,
      jobLogs: job.logs,
      repository,
      apiUrl,
      tenantId,
      workflowId,
      prDiffContext,
      ciProvider,
    });
  } catch (analysisError) {
    logger.error("Failed to analyze job", {
      jobName: job.jobName,
      error: getErrorMessage(analysisError),
    });
    return {
      jobName: job.jobName,
      jobLogs: job.logs,
      response: {} as PerJobAnalysisApiResponse,
      testFailures: [],
      lintErrors: [],
      changeCorrelations: [],
      lineMappings: [],
      failed: true,
      error: getErrorMessage(analysisError),
    };
  }
};
