/**
 * Combined CI Failure Analysis Handler
 *
 * Processes pending aggregations by:
 * 1. Fetching logs for ALL failed jobs
 * 2. Sending combined logs to a single LLM call
 * 3. Converting results to AggregatedFailures format
 * 4. Posting using consolidatedPoster
 *
 * This is the new approach that analyzes all failures together
 * instead of analyzing each check separately.
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
} from "@kenchi/shared";
import { fetchAllFailedJobsLogs } from "../services/context/workflowFetcher.js";
import { postConsolidatedAnalysis } from "../services/aggregation/consolidatedPoster.js";

const logger = createLogger("github-app");

// ==================== Types ====================

/**
 * Combined analysis API response structure.
 * The LLM analyzes all jobs together and returns per-job results.
 */
interface CombinedAnalysisApiResponse {
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence?: number;
  readonly job_analyses?: readonly JobAnalysis[];
  readonly overall_summary?: string;
  readonly recommended_actions?: readonly RecommendedActionResponse[];
}

/**
 * Per-job analysis from the LLM.
 */
interface JobAnalysis {
  readonly job_name: string;
  readonly identified_cause?: string;
  readonly confidence?: string;
  readonly category?: string;
  readonly annotations?: readonly AnalysisAnnotation[];
  readonly next_steps?: readonly string[];
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
 * Map confidence string to numeric score.
 */
const confidenceToScore = (confidence: string | undefined): number => {
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
 * Convert job analysis to AnalyzedFailure.
 */
const convertJobAnalysisToFailure = (
  jobAnalysis: JobAnalysis,
  checkRunId: number,
  timestamp: Date,
  overallActions: readonly RecommendedActionResponse[] | undefined
): AnalyzedFailure => {
  // Use job-specific next_steps if available, otherwise fall back to overall actions
  const jobActions = jobAnalysis.next_steps?.map((step) => ({
    description: step,
    priority: "medium" as string,
  }));
  const recommendedActions =
    jobActions && jobActions.length > 0 ? jobActions : convertRecommendedActions(overallActions);

  return {
    checkRunId,
    checkName: jobAnalysis.job_name,
    conclusion: "failure",
    confidence: confidenceToScore(jobAnalysis.confidence),
    identifiedCause: jobAnalysis.identified_cause ?? "Unknown failure",
    analysis: jobAnalysis.identified_cause ?? "Unknown failure",
    annotations:
      jobAnalysis.annotations?.map((annotation) => ({
        path: annotation.path ?? "",
        line: annotation.line ?? 0,
        level: (annotation.level as "failure" | "warning" | "notice") ?? "failure",
        message: annotation.message ?? "",
        title: annotation.title,
      })) ?? [],
    recommendedActions,
    testFailures: [],
    timestamp,
  };
};

/**
 * Create a fallback failure when we can't find per-job analysis.
 */
const createFallbackFailure = (
  checkName: string,
  checkRunId: number,
  overallCause: string,
  timestamp: Date,
  overallActions: readonly RecommendedActionResponse[] | undefined
): AnalyzedFailure => ({
  checkRunId,
  checkName,
  conclusion: "failure",
  confidence: 0.5,
  identifiedCause: overallCause,
  analysis: overallCause,
  annotations: [],
  recommendedActions: convertRecommendedActions(overallActions),
  testFailures: [],
  timestamp,
});

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
 * Process pending aggregation with combined analysis.
 *
 * @param payload - The pending aggregation payload from queue
 * @returns Consolidated post result
 */
export const processCombinedAnalysis = async (
  payload: PendingAggregationPayload
): Promise<ConsolidatedPostResult> => {
  const pending = deserializePendingPayload(payload);
  const { repository, installationId, commitSha } = pending;

  logger.info("Starting combined analysis for pending aggregation", {
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
      logger.warn("No workflow logs available for combined analysis", {
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
      combinedLogSize: allJobsLogs.combinedLogs.length,
    });

    // Step 2: Preprocess combined logs
    const preprocessed = preprocessLogsWithMetadata(allJobsLogs.combinedLogs);

    logger.info("Preprocessed combined logs", {
      repository: repository.fullName,
      originalSize: preprocessed.originalSize,
      processedSize: preprocessed.processedSize,
      wasTruncated: preprocessed.wasTruncated,
    });

    // Step 3: Send to LLM for combined analysis
    const apiUrl = `${config.API_URL}/api/analyze`;

    logger.info("Sending combined logs to LLM", {
      repository: repository.fullName,
      apiUrl,
      logSize: preprocessed.processedSize,
      jobCount: allJobsLogs.jobs.length,
    });

    const response = await resilientPost<CombinedAnalysisApiResponse>(apiUrl, {
      failure_log: preprocessed.logs,
      repository: repository.fullName,
      combined_analysis: true,
      job_names: allJobsLogs.jobs.map((job) => job.jobName),
    });

    const apiResponse = response.data;

    // Step 4: Convert API response to AggregatedFailures
    const overallCause =
      apiResponse.overall_summary ??
      apiResponse.identified_cause ??
      apiResponse.analysis ??
      "Unknown failure";

    // Get overall recommended actions from API response
    const overallActions = apiResponse.recommended_actions;

    // Map each pending check to an analyzed failure
    const failures: AnalyzedFailure[] = pending.pendingChecks.map((check) => {
      // Try to find matching job analysis
      const jobAnalysis = apiResponse.job_analyses?.find(
        (analysis) =>
          analysis.job_name.toLowerCase() === check.checkName.toLowerCase() ||
          check.checkName.toLowerCase().includes(analysis.job_name.toLowerCase())
      );

      if (jobAnalysis) {
        return convertJobAnalysisToFailure(
          jobAnalysis,
          check.checkRunId,
          check.timestamp,
          overallActions
        );
      }

      // Fallback: use overall analysis for this check
      return createFallbackFailure(
        check.checkName,
        check.checkRunId,
        overallCause,
        check.timestamp,
        overallActions
      );
    });

    // Build the aggregated failures object
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

    logger.info("Combined analysis complete, posting results", {
      repository: repository.fullName,
      commitSha: commitSha.substring(0, 7),
      failureCount: failures.length,
      confidence: apiResponse.confidence,
    });

    // Step 5: Post using existing consolidated poster
    return await postConsolidatedAnalysis(aggregation);
  } catch (error) {
    logger.error("Combined analysis failed", {
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
