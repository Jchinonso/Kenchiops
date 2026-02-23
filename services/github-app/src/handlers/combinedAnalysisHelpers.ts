/**
 * Combined Analysis Helpers
 *
 * Pure helper functions for the combined analysis handler:
 * - Confidence scoring and duration formatting
 * - Test failure processing and file inference
 * - Result conversion (JobAnalysisResult -> AnalyzedFailure)
 * - Payload deserialization
 * - Provider-agnostic log conversion
 *
 * @module handlers/combinedAnalysisHelpers
 */

import {
  createLogger,
  getErrorMessage,
  getOriginalLineNumber,
  parseLintOutput,
  TEST_FAILURE_FILE_INFERENCE_PATTERN,
  TEST_FAILURE_BARE_FILE_PATTERN,
  LINT_JOB_KEYWORDS,
  findActiveByProvider,
  CI_PROVIDERS,
  type PendingAggregationPayload,
  type AnalyzedFailure,
  type TestFailureInfo,
  type LLMLintError,
  type CIProvider,
  type FetchedBuildLogs,
} from "@kenchi/shared";
import type { AllFailedJobsLogs } from "../services/context/types.js";
import type { JobAnalysisResult, RecommendedActionResponse } from "./combinedAnalysisTypes.js";

const logger = createLogger("github-app");

// ==================== Confidence & Formatting ====================

/**
 * Map confidence to numeric score (handles both string and number).
 */
export const confidenceToScore = (confidence: string | number | undefined): number => {
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
 * Format milliseconds into a human-readable duration string (e.g., "2m 34s").
 * Returns null for non-positive values.
 */
export const formatDuration = (ms: number | null): string | null => {
  if (ms === null || ms <= 0) {
    return null;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
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

// ==================== Test Failure Processing ====================

/**
 * Attempt to infer a file path from a test failure's error text or test name.
 * Uses shared pattern to find references like `path/to/file.ts:123`.
 */
const inferFileFromError = (testFailure: TestFailureInfo): TestFailureInfo => {
  if (testFailure.file) {
    return testFailure;
  }

  const textToSearch = [testFailure.error, testFailure.testName].filter(Boolean).join(" ");

  // Primary: requires `/` (real path structure) + `.ext` -- high confidence
  const primaryMatch = TEST_FAILURE_FILE_INFERENCE_PATTERN.exec(textToSearch);
  if (primaryMatch) {
    const inferredFile = primaryMatch[1];
    const inferredLine = primaryMatch[2] ? Number(primaryMatch[2]) : testFailure.line;
    return { ...testFailure, file: inferredFile, line: inferredLine };
  }

  // Fallback: bare filename with extension + line number (e.g., `test.ts:123`)
  const fallbackMatch = TEST_FAILURE_BARE_FILE_PATTERN.exec(textToSearch);
  if (fallbackMatch) {
    const inferredFile = fallbackMatch[1];
    const inferredLine = fallbackMatch[2] ? Number(fallbackMatch[2]) : testFailure.line;
    return { ...testFailure, file: inferredFile, line: inferredLine };
  }

  return testFailure;
};

/**
 * Post-process test failures to infer missing file paths from error text.
 */
export const postProcessTestFailures = (
  testFailures: readonly TestFailureInfo[]
): readonly TestFailureInfo[] => testFailures.map(inferFileFromError);

/**
 * Check if a CI job name indicates a lint/format/typecheck job.
 * Only these jobs should contribute deterministic lint errors.
 */
export const isLintRelatedJob = (jobName: string): boolean => LINT_JOB_KEYWORDS.test(jobName);

/**
 * Generate a summary from extracted test failures.
 * Only used when we have structured test data to summarize.
 */
export const summarizeTestFailures = (testFailures: readonly TestFailureInfo[]): string | null => {
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

// ==================== Result Conversion ====================

/**
 * Convert per-job analysis result to AnalyzedFailure.
 * Uses LLM-extracted test failures with expected/actual values.
 *
 * V1.1: Uses line mappings to recover original line numbers for annotations.
 */
export const convertJobResultToFailure = (
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
 * Create a fallback failure when LLM analysis fails.
 * Returns empty test failures - LLM is the source of truth.
 */
export const createFallbackFailure = (
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

// ==================== Payload & Provider Helpers ====================

/**
 * Deserialize pending aggregation payload from queue.
 */
export const deserializePendingPayload = (
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
  provider: CIProvider;
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
    provider: (pending.provider as CIProvider) ?? CI_PROVIDERS.GITHUB_ACTIONS,
  };
};

/**
 * Convert FetchedBuildLogs from the CI log fetcher port into the AllFailedJobsLogs
 * shape expected by the rest of the pipeline.
 *
 * For non-GitHub providers, there is no workflow run concept, so we synthesize
 * a workflow name from the repository and set workflowRunId to 0.
 */
export const convertFetchedLogsToAllJobsLogs = (
  fetchedLogs: readonly FetchedBuildLogs[],
  repositoryFullName: string
): AllFailedJobsLogs | null => {
  if (fetchedLogs.length === 0) {
    return null;
  }

  const jobs = fetchedLogs.map((fetched) => ({
    jobName: fetched.buildName,
    jobId: Number(fetched.buildId) || 0,
    logs: fetched.logs,
  }));

  const combinedLogs = jobs.map((job) => `=== ${job.jobName} ===\n${job.logs}`).join("\n\n");

  return {
    workflowName: `CI Pipeline (${repositoryFullName})`,
    workflowRunId: 0,
    jobs,
    combinedLogs,
  };
};

/**
 * Resolve tenant ID for a non-GitHub provider by looking up the first active
 * provider connection. The connection record already contains the tenantId
 * so no additional lookup is needed.
 */
export const resolveTenantForProvider = async (
  provider: CIProvider
): Promise<string | undefined> => {
  try {
    const connections = await findActiveByProvider(provider);
    return connections[0]?.tenantId;
  } catch (resolveError) {
    logger.warn("Failed to resolve tenant for provider", {
      provider,
      error: getErrorMessage(resolveError),
    });
    return undefined;
  }
};

/**
 * Parse lint errors deterministically from raw CI logs (no LLM).
 * Only parse lint-related jobs -- test/build/deploy jobs produce false positives
 * from CI infrastructure output (e.g., `##[error]Process completed with exit code 1`).
 */
export const parseLintErrorsByJob = (
  jobs: ReadonlyArray<{ readonly jobName: string; readonly logs: string }>
): ReadonlyMap<string, readonly LLMLintError[]> =>
  new Map(
    jobs
      .filter((job) => isLintRelatedJob(job.jobName))
      .map((job) => [job.jobName.toLowerCase(), parseLintOutput(job.logs)] as const)
  );
