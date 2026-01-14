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
  resilientPost,
  getErrorMessage,
  preprocessLogsWithMetadata,
  type PendingAggregationPayload,
  type AggregatedFailures,
  type AnalyzedFailure,
  type ConsolidatedPostResult,
  type TestFailureInfo,
  type LLMLintError,
} from "@kenchi/shared";
import { fetchAllFailedJobsLogs } from "../services/context/workflowFetcher.js";
import { postConsolidatedAnalysis } from "../services/aggregation/consolidatedPoster.js";

const logger = createLogger("github-app");

// ==================== Types ====================

/**
 * Per-job API response structure.
 * Each job gets its own LLM analysis call.
 * full_analysis contains the LLMAnalysisResult with testFailures already in camelCase.
 */
interface PerJobAnalysisApiResponse {
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence?: number | string;
  readonly recommended_actions?: readonly RecommendedActionResponse[];
  readonly annotations?: readonly AnalysisAnnotation[];
  readonly full_analysis?: {
    readonly testFailures?: readonly TestFailureInfo[];
    readonly lintErrors?: readonly LLMLintError[];
    /** Command to run failing tests locally (LLM-generated based on detected framework) */
    readonly testCommand?: string;
  };
}

/**
 * Result of analyzing a single job.
 */
interface JobAnalysisResult {
  readonly jobName: string;
  readonly jobLogs: string;
  readonly response: PerJobAnalysisApiResponse;
  /** LLM-extracted test failures with expected/actual values */
  readonly testFailures: readonly TestFailureInfo[];
  /** LLM-extracted lint/compile errors with specific symbols */
  readonly lintErrors: readonly LLMLintError[];
  /** Command to run failing tests locally (LLM-generated based on detected framework) */
  readonly testCommand?: string;
}

/**
 * Recommended action from API response.
 */
interface RecommendedActionResponse {
  readonly actionType?: string;
  readonly description?: string;
  readonly reasoning?: string;
  readonly priority?: string;
}

/**
 * Annotation from API response.
 */
interface AnalysisAnnotation {
  readonly path?: string;
  readonly line?: number;
  readonly level?: string;
  readonly message?: string;
  readonly title?: string;
}

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
 * Convert per-job analysis result to AnalyzedFailure.
 * Uses LLM-extracted test failures with expected/actual values.
 */
const convertJobResultToFailure = (
  result: JobAnalysisResult,
  checkRunId: number,
  checkName: string,
  timestamp: Date
): AnalyzedFailure => {
  const { response } = result;
  const identifiedCause = response.identified_cause ?? response.analysis ?? "Unknown failure";

  return {
    checkRunId,
    checkName,
    conclusion: "failure",
    confidence: confidenceToScore(response.confidence),
    identifiedCause,
    analysis: identifiedCause,
    annotations:
      response.annotations?.map((annotation) => ({
        path: annotation.path ?? "",
        line: annotation.line ?? 0,
        level: (annotation.level as "failure" | "warning" | "notice") ?? "failure",
        message: annotation.message ?? "",
        title: annotation.title,
      })) ?? [],
    recommendedActions: convertRecommendedActions(response.recommended_actions),
    testFailures: result.testFailures,
    lintErrors: result.lintErrors,
    testCommand: result.testCommand,
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
 * Analyze a single job's logs via LLM API.
 * LLM extracts test failures with expected/actual values.
 */
const analyzeJobLogs = async (
  jobName: string,
  jobLogs: string,
  repository: string,
  apiUrl: string
): Promise<JobAnalysisResult> => {
  const preprocessed = preprocessLogsWithMetadata(jobLogs);

  logger.info("Analyzing job logs via LLM", {
    jobName,
    repository,
    originalSize: preprocessed.originalSize,
    processedSize: preprocessed.processedSize,
    detectedFramework: preprocessed.testFramework?.name,
  });

  // Build request payload with optional framework hint
  const requestPayload: Record<string, unknown> = {
    failure_log: preprocessed.logs,
    repository,
    job_name: jobName,
  };

  // Include framework hint if detected
  if (preprocessed.testFramework) {
    requestPayload.test_framework = {
      name: preprocessed.testFramework.name,
      language: preprocessed.testFramework.language,
      assertion_hint: preprocessed.testFramework.assertionHint,
    };
  }

  const response = await resilientPost<PerJobAnalysisApiResponse>(apiUrl, requestPayload);

  // Extract LLM test failures with expected/actual values
  const testFailures = extractTestFailures(response.data);

  // Extract LLM lint errors with specific symbols
  const lintErrors = extractLintErrors(response.data);

  // Extract LLM-generated test command
  const testCommand = extractTestCommand(response.data);

  logger.info("LLM analysis complete", {
    jobName,
    repository,
    testFailureCount: testFailures.length,
    lintErrorCount: lintErrors.length,
    testCommand,
  });

  return {
    jobName,
    jobLogs,
    response: response.data,
    testFailures,
    lintErrors,
    testCommand,
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
 * Result type for per-job analysis with optional error info.
 */
type AnalysisResultWithError = JobAnalysisResult & { failed?: true; error?: string };

/**
 * Analyze a single job with error handling.
 * Returns a result object with failed flag if analysis fails.
 */
const analyzeJobWithErrorHandling = async (
  job: { jobName: string; logs: string },
  repository: string,
  apiUrl: string
): Promise<AnalysisResultWithError> => {
  try {
    return await analyzeJobLogs(job.jobName, job.logs, repository, apiUrl);
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

    const apiUrl = `${config.API_URL}/api/analyze`;

    // Step 2: Analyze each job separately (in parallel)
    logger.info("Analyzing jobs in parallel", {
      repository: repository.fullName,
      jobCount: allJobsLogs.jobs.length,
      jobNames: allJobsLogs.jobs.map((job) => job.jobName),
    });

    // Analyze all jobs in parallel with error handling
    const analysisResults = await Promise.all(
      allJobsLogs.jobs.map((job) => analyzeJobWithErrorHandling(job, repository.fullName, apiUrl))
    );

    // Create a map of job name to analysis result
    const analysisMap = new Map<string, AnalysisResultWithError>();
    analysisResults.forEach((result) => {
      analysisMap.set(result.jobName.toLowerCase(), result);
    });

    logger.info("All job analyses complete", {
      repository: repository.fullName,
      successCount: analysisResults.filter((result) => !result.failed).length,
      failedCount: analysisResults.filter((result) => result.failed).length,
    });

    // Step 3: Map each pending check to its analysis
    const failures: AnalyzedFailure[] = pending.pendingChecks.map((check) => {
      // Try to find matching analysis by check name
      const analysisResult = analysisMap.get(check.checkName.toLowerCase());

      if (analysisResult && !analysisResult.failed) {
        return convertJobResultToFailure(
          analysisResult,
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
        return convertJobResultToFailure(
          partialMatch[1],
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
      prContext: null,
      workflowContext: {
        name: allJobsLogs.workflowName,
        duration: "unknown",
      },
      firstFailureAt: pending.firstFailureAt,
      lastFailureAt: pending.lastFailureAt,
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
