/**
 * Per-Job CI Failure Analysis Handler
 *
 * Processes pending aggregations by:
 * 1. Fetching logs for ALL failed jobs
 * 2. Sending each job's logs to the LLM separately (in parallel)
 * 3. Converting results to AggregatedFailures format
 * 4. Posting using consolidatedPoster
 *
 * Each job gets its own LLM analysis call to ensure specific,
 * accurate analysis for each failure type (tests, linting, formatting, etc.).
 */

import {
  createLogger,
  config,
  delay,
  resilientPost,
  resilientGet,
  getErrorMessage,
  preprocessLogsWithMetadata,
  mapWithConcurrency,
  LLM_CONCURRENCY_DEFAULTS,
  ExternalServiceError,
  GITHUB_COMMENT_TEMPLATES,
  GITHUB_CONTEXT_LIMITS,
  // V1.1: Chunking pipeline for improved preprocessing and line mapping
  sanitizeForChunkingWithMapping,
  getOriginalLineNumber,
  // Deterministic test summary parser (regex-based, no LLM)
  parseTestSummary,
  // Tenant lookup
  findByGitHubInstallation,
  // PR context caching
  getOrFetchPullRequest,
  getOrFetchPullRequestDiff,
  getOrFetchPullRequestFiles,
  type PendingAggregationPayload,
  type AggregatedFailures,
  type AnalyzedFailure,
  type ConsolidatedPostResult,
  type TestFailureInfo,
  type LLMLintError,
  type LLMChangeCorrelation,
  type SanitizationResultWithMapping,
  CI_PROVIDERS,
} from "@kenchi/shared";
import { fetchAllFailedJobsLogs } from "../services/context/workflowFetcher.js";
import { fetchCheckRunAnnotations } from "../services/context/annotationFetcher.js";
import { postConsolidatedAnalysis } from "../services/aggregation/consolidatedPoster.js";
import { postPRComment } from "../services/githubComments.js";
import { getOctokit } from "../services/githubService.js";
import type { CheckRunAnnotation } from "../services/context/types.js";
import type {
  JobSubmissionResponse,
  JobStatusResponse,
  PerJobAnalysisApiResponse,
  JobAnalysisResult,
  RecommendedActionResponse,
  PRDiffContext,
  AnalysisResultWithError,
} from "./combinedAnalysisTypes.js";

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

// ==================== Annotation Enrichment ====================

/**
 * Formats check run annotations as text to append to job logs.
 * Provides structured lint/type error context that the LLM can analyze.
 */
const formatAnnotationsAsText = (annotations: readonly CheckRunAnnotation[]): string => {
  const header = `${"=".repeat(60)}\nCHECK RUN ANNOTATIONS (file-level errors/warnings)\n${"=".repeat(60)}`;

  const lines = annotations.map((annotation) => {
    const level = annotation.level.toUpperCase();
    const location = `${annotation.path}:${annotation.startLine}`;
    const title = annotation.title ? ` [${annotation.title}]` : "";
    return `${level}: ${location}${title}\n  ${annotation.message}`;
  });

  return `${header}\n${lines.join("\n\n")}`;
};

/**
 * Enriches job logs with check run annotations from GitHub.
 *
 * For lint/format checks, job logs are often minimal (1-3 lines like "5 errors found").
 * Annotations contain the actual file-level errors (path, line, message) that the
 * LLM needs for meaningful analysis.
 *
 * @param jobs - Job logs from the workflow run
 * @param pendingChecks - Pending check runs with checkRunIds for annotation lookup
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Enriched jobs with annotations appended to logs
 */
const enrichJobLogsWithAnnotations = async (
  jobs: ReadonlyArray<{ readonly jobName: string; readonly jobId: number; readonly logs: string }>,
  pendingChecks: ReadonlyArray<{ readonly checkRunId: number; readonly checkName: string }>,
  installationId: number,
  owner: string,
  repo: string
): Promise<
  ReadonlyArray<{ readonly jobName: string; readonly jobId: number; readonly logs: string }>
> => {
  // Fetch annotations for all pending checks in parallel (bounded — typically 2-5 checks)
  const annotationResults = await Promise.all(
    pendingChecks.map(async (check) => {
      const annotations = await fetchCheckRunAnnotations(
        installationId,
        owner,
        repo,
        check.checkRunId
      );
      return { checkName: check.checkName.toLowerCase(), annotations };
    })
  );

  // Build lookup map: lowercased check name → annotation text
  const annotationsMap = new Map<string, string>();
  annotationResults
    .filter((result) => result.annotations.length > 0)
    .forEach((result) => {
      annotationsMap.set(result.checkName, formatAnnotationsAsText(result.annotations));
    });

  if (annotationsMap.size === 0) {
    return jobs;
  }

  logger.info("Enriching job logs with annotations", {
    checksWithAnnotations: [...annotationsMap.keys()],
    totalAnnotationChecks: annotationsMap.size,
  });

  // Enrich matching jobs by appending annotations to their logs
  return jobs.map((job) => {
    const jobNameLower = job.jobName.toLowerCase();

    // Try exact match, then partial match (e.g., check "Lint & Format" matches job "lint")
    const annotationText =
      annotationsMap.get(jobNameLower) ??
      [...annotationsMap.entries()].find(
        ([checkName]) => jobNameLower.includes(checkName) || checkName.includes(jobNameLower)
      )?.[1];

    if (!annotationText) {
      return job;
    }

    return {
      ...job,
      logs: `${job.logs}\n\n${annotationText}`,
    };
  });
};

/**
 * Fetch annotations for all pending checks and return as a lookup map.
 * Uses the cached annotation fetcher — safe to call even if enrichJobLogsWithAnnotations
 * already fetched them (cache hit will be instant).
 */
const fetchAnnotationsForChecks = async (
  pendingChecks: ReadonlyArray<{ readonly checkRunId: number; readonly checkName: string }>,
  installationId: number,
  owner: string,
  repo: string
): Promise<ReadonlyMap<string, readonly CheckRunAnnotation[]>> => {
  const results = await Promise.all(
    pendingChecks.map(async (check) => {
      const annotations = await fetchCheckRunAnnotations(
        installationId,
        owner,
        repo,
        check.checkRunId
      );
      return { checkName: check.checkName.toLowerCase(), annotations } as const;
    })
  );
  return new Map(results.map((result) => [result.checkName, result.annotations]));
};

/**
 * Convert GitHub check run annotations directly to structured lint errors.
 * Bypasses LLM extraction for annotations where we already have structured data
 * (path, line, message) from the GitHub API.
 */
const convertAnnotationsToLintErrors = (
  annotations: readonly CheckRunAnnotation[]
): readonly LLMLintError[] =>
  annotations
    .filter((annotation) => annotation.level === "warning" || annotation.level === "failure")
    .map((annotation) => ({
      file: annotation.path,
      line: annotation.startLine,
      message: annotation.message,
      code: annotation.title ?? "lint-error",
    }));

/**
 * Merge annotation-derived lint errors with LLM-extracted ones.
 * Annotation-derived errors take priority (they have accurate file paths from GitHub API).
 * LLM-extracted errors with unknown/missing file paths are dropped.
 * Deduplicates by file + line.
 */
const mergeLintErrors = (
  annotationErrors: readonly LLMLintError[],
  llmErrors: readonly LLMLintError[]
): readonly LLMLintError[] => {
  const seen = new Set(annotationErrors.map((error) => `${error.file}:${error.line}`));

  // Keep LLM errors only if they have real file paths and aren't duplicates
  const uniqueLlmErrors = llmErrors.filter((error) => {
    if (!error.file || error.file.toLowerCase().includes("unknown")) {
      return false;
    }
    return !seen.has(`${error.file}:${error.line}`);
  });

  return [...annotationErrors, ...uniqueLlmErrors];
};

/**
 * Enrich a job analysis result with annotation-derived lint errors.
 * If annotations exist for this check, converts them to LLMLintError and merges
 * with LLM-extracted lint errors (which often have "unknown" file paths).
 */
const enrichResultWithAnnotationLintErrors = (
  result: JobAnalysisResult,
  annotations: readonly CheckRunAnnotation[]
): JobAnalysisResult => {
  if (annotations.length === 0) {
    return result;
  }

  const annotationLintErrors = convertAnnotationsToLintErrors(annotations);
  if (annotationLintErrors.length === 0) {
    return result;
  }

  return { ...result, lintErrors: mergeLintErrors(annotationLintErrors, result.lintErrors) };
};

/**
 * Fetch PR diff context for the first associated PR.
 * Uses cached GitHub API utilities for efficient retrieval.
 * Returns null if no PRs exist or fetch fails (graceful degradation).
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param pullRequestNumbers - PR numbers associated with this commit
 * @returns PR diff context or null
 */
const fetchPRDiffContext = async (
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
  } catch (error) {
    logger.warn("Failed to fetch PR diff context, continuing without it", {
      provider: "github",
      operation: "fetchPRDiffContext",
      durationMs: Date.now() - startTime,
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });
    return null;
  }
};

// ==================== Helpers ====================

/**
 * Map confidence to numeric score (handles both string and number).
 */
const confidenceToScore = (confidence: string | number | undefined): number => {
  if (typeof confidence === "number") {
    return confidence;
  }
  const confidenceScores: Record<string, number> = {
    high: 0.9,
    medium: 0.6,
    low: 0.3,
    unknown: 0.1,
  };
  return confidenceScores[confidence ?? "unknown"] ?? 0.1;
};

/**
 * Convert recommended actions from API response.
 */
const convertRecommendedActions = (
  actions: readonly RecommendedActionResponse[] | undefined
): ReadonlyArray<{ description: string; priority: string }> =>
  actions?.map((action) => ({
    description: action.description ?? "",
    priority: action.priority ?? "medium",
  })) ?? [];

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

/**
 * Convert per-job analysis result to AnalyzedFailure.
 * Uses LLM-extracted test failures with expected/actual values.
 *
 * V1.1: Uses line mappings to recover original line numbers for annotations.
 */
const convertJobResultToFailure = (
  result: JobAnalysisResult,
  checkRunId: number,
  checkName: string,
  timestamp: Date
): AnalyzedFailure => {
  const { response, lineMappings } = result;
  const identifiedCause = response.identified_cause ?? response.analysis ?? "Unknown failure";

  return {
    checkRunId,
    checkName,
    conclusion: "failure",
    confidence: confidenceToScore(response.confidence),
    identifiedCause,
    analysis: identifiedCause,
    annotations:
      response.annotations?.map((annotation) => {
        const sanitizedLine = annotation.line ?? 0;
        // V1.1: Recover original line number using line mappings
        const originalLineNumber =
          sanitizedLine > 0 ? getOriginalLineNumber(lineMappings, sanitizedLine) : null;

        return {
          path: annotation.path ?? "",
          line: sanitizedLine,
          level: (annotation.level as "failure" | "warning" | "notice") ?? "failure",
          message: annotation.message ?? "",
          title: annotation.title,
          original_line_number: originalLineNumber,
        };
      }) ?? [],
    recommendedActions: convertRecommendedActions(response.recommended_actions),
    testFailures: result.testFailures,
    lintErrors: result.lintErrors,
    testCommand: result.testCommand,
    changeCorrelations:
      result.changeCorrelations.length > 0 ? result.changeCorrelations : undefined,
    parsedTestSummary: result.parsedTestSummary,
    timestamp,
  };
};

/**
 * Generate a summary from extracted test failures.
 * Only used when we have structured test data to summarize.
 */
const summarizeTestFailures = (testFailures: readonly TestFailureInfo[]): string | null => {
  if (testFailures.length === 0) {
    return null;
  }

  const uniqueFiles = [...new Set(testFailures.map((failure) => failure.file).filter(Boolean))];
  const fileInfo =
    uniqueFiles.length > 0
      ? ` in ${uniqueFiles
          .slice(0, 2)
          .map((filePath) => `\`${filePath?.split("/").pop()}\``)
          .join(", ")}${uniqueFiles.length > 2 ? " and more" : ""}`
      : "";

  return `${testFailures.length} test${testFailures.length > 1 ? "s" : ""} failed${fileInfo}`;
};

/**
 * Create a fallback failure when LLM analysis fails.
 * Returns empty test failures - LLM is the source of truth.
 */
const createFallbackFailure = (
  checkName: string,
  checkRunId: number,
  timestamp: Date,
  errorMessage: string
): AnalyzedFailure => ({
  checkRunId,
  checkName,
  conclusion: "failure",
  confidence: 0.3,
  identifiedCause: errorMessage,
  analysis: errorMessage,
  annotations: [],
  recommendedActions: [],
  testFailures: [],
  lintErrors: [],
  timestamp,
});

/**
 * Post a placeholder comment on a single PR.
 * Returns silently on failure — placeholder is best-effort.
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
  } catch (error) {
    logger.warn("Failed to post analyzing placeholder", {
      prNumber,
      error: getErrorMessage(error),
    });
  }
};

/**
 * Post a placeholder comment on PRs to indicate analysis is in progress.
 * Best-effort: failures are logged but do not block the analysis pipeline.
 */
const postAnalyzingPlaceholder = async (
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

/**
 * Poll for job completion from the API.
 * The API processes analysis jobs asynchronously to avoid HTTP timeouts.
 *
 * @param jobId - The job ID returned from job submission
 * @param apiBaseUrl - Base URL for the API (e.g., http://localhost:3000)
 * @param jobName - Job name for logging context
 * @returns The analysis result when job completes
 * @throws ExternalServiceError if job fails or times out
 */
const pollForJobCompletion = async (
  jobId: string,
  apiBaseUrl: string,
  jobName: string
): Promise<PerJobAnalysisApiResponse> => {
  const startTime = Date.now();
  const statusUrl = `${apiBaseUrl}/api/jobs/${jobId}`;

  logger.info("Polling for job completion", { jobId, jobName });

  while (Date.now() - startTime < POLLING_CONFIG.MAX_WAIT_MS) {
    const response = await resilientGet<JobStatusResponse>(statusUrl, {
      timeout: POLLING_CONFIG.REQUEST_TIMEOUT_MS,
      internalAuth: true,
    });

    const { status, result, error } = response.data;

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
        error,
        durationMs: Date.now() - startTime,
      });
      throw new ExternalServiceError("api", error ?? "Job failed without error message", {
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
const analyzeJobLogs = async (
  jobName: string,
  jobLogs: string,
  repository: string,
  apiUrl: string,
  tenantId?: string,
  workflowId?: string,
  prDiffContext?: PRDiffContext | null
): Promise<JobAnalysisResult> => {
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
  const analysisResponse = await pollForJobCompletion(jobId, apiBaseUrl, jobName);

  // Extract LLM test failures with expected/actual values
  const testFailures = extractTestFailures(analysisResponse);

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
 * Deserialize pending aggregation payload from queue.
 */
const deserializePendingPayload = (
  payload: PendingAggregationPayload
): {
  commitSha: string;
  repository: { fullName: string; owner: string; name: string };
  installationId: number;
  pullRequestNumbers: readonly number[];
  pendingChecks: ReadonlyArray<{
    checkRunId: number;
    checkName: string;
    conclusion: string;
    timestamp: Date;
  }>;
  firstFailureAt: Date;
  lastFailureAt: Date;
} => {
  const pending = payload.pendingAggregation;
  return {
    commitSha: pending.commitSha,
    repository: pending.repository,
    installationId: pending.installationId,
    pullRequestNumbers: pending.pullRequestNumbers,
    pendingChecks: pending.pendingChecks.map((check) => ({
      checkRunId: check.checkRunId,
      checkName: check.checkName,
      conclusion: check.conclusion,
      timestamp: new Date(check.timestamp),
    })),
    firstFailureAt: new Date(pending.firstFailureAt),
    lastFailureAt: new Date(pending.lastFailureAt),
  };
};

// ==================== Main Handler ====================

/**
 * Analyze a single job with error handling.
 * Returns a result object with failed flag if analysis fails.
 */
const analyzeJobWithErrorHandling = async (
  job: { jobName: string; logs: string },
  repository: string,
  apiUrl: string,
  tenantId?: string,
  workflowId?: string,
  prDiffContext?: PRDiffContext | null
): Promise<AnalysisResultWithError> => {
  try {
    return await analyzeJobLogs(
      job.jobName,
      job.logs,
      repository,
      apiUrl,
      tenantId,
      workflowId,
      prDiffContext
    );
  } catch (error) {
    logger.error("Failed to analyze job", {
      jobName: job.jobName,
      error: getErrorMessage(error),
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
      error: getErrorMessage(error),
    };
  }
};

/**
 * Process pending aggregation with per-job analysis.
 *
 * Each job's logs are analyzed separately via LLM to ensure
 * specific, accurate analysis for each failure type.
 *
 * @param payload - The pending aggregation payload from queue
 * @returns Consolidated post result
 */
export const processCombinedAnalysis = async (
  payload: PendingAggregationPayload
): Promise<ConsolidatedPostResult> => {
  const pending = deserializePendingPayload(payload);
  const { repository, installationId, commitSha } = pending;

  logger.info("Starting per-job analysis for pending aggregation", {
    repository: repository.fullName,
    commitSha: commitSha.substring(0, 7),
    pendingCheckCount: pending.pendingChecks.length,
    checkNames: pending.pendingChecks.map((check) => check.checkName),
  });

  try {
    // Step 1: Fetch logs for ALL failed jobs
    const allJobsLogs = await fetchAllFailedJobsLogs(
      installationId,
      repository.owner,
      repository.name,
      commitSha
    );

    if (!allJobsLogs) {
      logger.warn("No workflow logs available for analysis", {
        repository: repository.fullName,
        commitSha: commitSha.substring(0, 7),
      });

      return {
        success: false,
        prCommentsPosted: 0,
        slackMessageSent: false,
        checkAnnotationsCreated: false,
        errors: ["No workflow logs available"],
      };
    }

    logger.info("Fetched all failed job logs", {
      repository: repository.fullName,
      workflowName: allJobsLogs.workflowName,
      jobCount: allJobsLogs.jobs.length,
    });

    // Post placeholder comment so users see analysis is in progress
    const checkNames = pending.pendingChecks.map((check) => check.checkName);
    await postAnalyzingPlaceholder(
      installationId,
      repository.owner,
      repository.name,
      pending.pullRequestNumbers,
      checkNames
    );

    const apiUrl = `${config.API_URL}/api/analyze`;

    // Look up tenant for analysis context
    const tenant = await findByGitHubInstallation(installationId);
    const tenantId = tenant?.id;
    const workflowId = allJobsLogs.workflowName;

    // Fetch PR diff context for LLM correlation (cached, graceful degradation)
    const prDiffContext = await fetchPRDiffContext(
      installationId,
      repository.owner,
      repository.name,
      pending.pullRequestNumbers
    );

    // Step 1.5: Enrich job logs with check run annotations.
    // Lint/format checks often have minimal logs (1-3 lines) but detailed annotations
    // (file-level errors). Appending annotations gives the LLM actual error context.
    const enrichedJobs = await enrichJobLogsWithAnnotations(
      allJobsLogs.jobs,
      pending.pendingChecks,
      installationId,
      repository.owner,
      repository.name
    );

    // Step 2: Analyze each job separately (with concurrency limit)
    const maxConcurrent =
      config.LLM_MAX_CONCURRENT_ANALYSIS ?? LLM_CONCURRENCY_DEFAULTS.MAX_CONCURRENT_ANALYSIS;

    logger.info("Analyzing jobs with concurrency limit", {
      repository: repository.fullName,
      jobCount: enrichedJobs.length,
      maxConcurrent,
      jobNames: enrichedJobs.map((job) => job.jobName),
    });

    // Analyze all jobs with concurrency limiting to avoid rate limits
    const analysisResults = await mapWithConcurrency(
      enrichedJobs,
      (job) =>
        analyzeJobWithErrorHandling(
          job,
          repository.fullName,
          apiUrl,
          tenantId,
          workflowId,
          prDiffContext
        ),
      maxConcurrent,
      config.LLM_QUEUE_TIMEOUT_MS
    );

    // Create a map of job name to analysis result (functional construction)
    const analysisMap = new Map(
      analysisResults.map((result) => [result.jobName.toLowerCase(), result] as const)
    );

    logger.info("All job analyses complete", {
      repository: repository.fullName,
      successCount: analysisResults.filter((result) => !result.failed).length,
      failedCount: analysisResults.filter((result) => result.failed).length,
    });

    // Step 2.5: Fetch annotations for direct lint error conversion (cached from enrichment step)
    const annotationsByCheck = await fetchAnnotationsForChecks(
      pending.pendingChecks,
      installationId,
      repository.owner,
      repository.name
    );

    // Step 3: Map each pending check to its analysis
    const failures: readonly AnalyzedFailure[] = pending.pendingChecks.map((check) => {
      const checkAnnotations = annotationsByCheck.get(check.checkName.toLowerCase()) ?? [];

      // Try to find matching analysis by check name
      const analysisResult = analysisMap.get(check.checkName.toLowerCase());

      if (analysisResult && !analysisResult.failed) {
        const enrichedResult = enrichResultWithAnnotationLintErrors(
          analysisResult,
          checkAnnotations
        );
        return convertJobResultToFailure(
          enrichedResult,
          check.checkRunId,
          check.checkName,
          check.timestamp
        );
      }

      // If no analysis found, try to find by partial match
      const partialMatch = [...analysisMap.entries()].find(
        ([jobName]) =>
          check.checkName.toLowerCase().includes(jobName) ||
          jobName.includes(check.checkName.toLowerCase())
      );

      if (partialMatch && !partialMatch[1].failed) {
        const enrichedResult = enrichResultWithAnnotationLintErrors(
          partialMatch[1],
          checkAnnotations
        );
        return convertJobResultToFailure(
          enrichedResult,
          check.checkRunId,
          check.checkName,
          check.timestamp
        );
      }

      // Fallback: create failure with error or generic message
      // LLM is the source of truth - if it returned test failures, use them
      const llmTestFailures = analysisResult?.testFailures ?? [];
      const errorMsg = analysisResult?.error
        ? `Analysis failed: ${analysisResult.error}`
        : (summarizeTestFailures(llmTestFailures) ?? "CI check failed - see logs for details");

      return createFallbackFailure(check.checkName, check.checkRunId, check.timestamp, errorMsg);
    });

    // Step 4: Build the aggregated failures object
    const aggregation: AggregatedFailures = {
      commitSha,
      repository,
      installationId,
      pullRequestNumbers: [...pending.pullRequestNumbers],
      failures,
      prContext: prDiffContext
        ? {
            number: prDiffContext.prNumber,
            title: prDiffContext.title,
            author: prDiffContext.author,
            branch: prDiffContext.branch,
            baseBranch: prDiffContext.baseBranch,
            labels: [...prDiffContext.labels],
            changedFiles: [...prDiffContext.changedFiles],
          }
        : null,
      workflowContext: {
        name: allJobsLogs.workflowName,
        duration: "unknown",
      },
      firstFailureAt: pending.firstFailureAt,
      lastFailureAt: pending.lastFailureAt,
      provider: CI_PROVIDERS.GITHUB_ACTIONS,
    };

    logger.info("Per-job analysis complete, posting results", {
      repository: repository.fullName,
      commitSha: commitSha.substring(0, 7),
      failureCount: failures.length,
    });

    // Step 5: Post using existing consolidated poster
    return await postConsolidatedAnalysis(aggregation);
  } catch (error) {
    logger.error("Per-job analysis failed", {
      error: getErrorMessage(error),
      repository: repository.fullName,
      commitSha: commitSha.substring(0, 7),
    });

    return {
      success: false,
      prCommentsPosted: 0,
      slackMessageSent: false,
      checkAnnotationsCreated: false,
      errors: [getErrorMessage(error)],
    };
  }
};
