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
 *
 * Helper modules:
 * - combinedAnalysisHelpers.ts: Pure helpers, converters, payload deserialization
 * - combinedAnalysisAnnotations.ts: Annotation enrichment and lint error processing
 * - combinedAnalysisJobRunner.ts: Job submission, polling, and error handling
 */

import {
  createLogger,
  config,
  getErrorMessage,
  mapWithConcurrency,
  LLM_CONCURRENCY_DEFAULTS,
  findTenantByGitHubInstallation,
  CI_PROVIDERS,
  acquireAnalysisSlot,
  releaseAnalysisSlot,
  type PendingAggregationPayload,
  type AggregatedFailures,
  type AnalyzedFailure,
  type ConsolidatedPostResult,
  type RequestContext,
  type CIProvider,
  type LLMLintError,
} from "@kenchi/shared";
import {
  fetchAllFailedJobsLogs,
  fetchWorkflowTiming,
} from "../services/context/workflowFetcher.js";
import { getCIProviderAdapters } from "../adapters/ciProviderRegistry.js";
import { postConsolidatedAnalysis } from "../services/aggregation/consolidatedPoster.js";
import type { CheckRunAnnotation, AllFailedJobsLogs } from "../services/context/types.js";
import type { AnalysisResultWithError, PRDiffContext } from "./combinedAnalysisTypes.js";
import {
  deserializePendingPayload,
  formatDuration,
  convertFetchedLogsToAllJobsLogs,
  resolveTenantForProvider,
  convertJobResultToFailure,
  createFallbackFailure,
  summarizeTestFailures,
  parseLintErrorsByJob,
} from "./combinedAnalysisHelpers.js";
import {
  enrichJobLogsWithAnnotations,
  fetchAnnotationsForChecks,
  enrichResultWithParsedLintErrors,
} from "./combinedAnalysisAnnotations.js";
import {
  fetchPRDiffContext,
  postAnalyzingPlaceholder,
  analyzeJobWithErrorHandling,
} from "./combinedAnalysisJobRunner.js";

const logger = createLogger("github-app");

// ==================== Pipeline Step Interfaces ====================

interface FetchFailedLogsOptions {
  readonly isGitHub: boolean;
  readonly installationId: number;
  readonly owner: string;
  readonly repoName: string;
  readonly repositoryFullName: string;
  readonly commitSha: string;
  readonly provider: CIProvider;
}

interface AnalysisCollectionOptions {
  readonly enrichedJobs: ReadonlyArray<{
    readonly jobName: string;
    readonly jobId: number;
    readonly logs: string;
  }>;
  readonly allJobsLogs: AllFailedJobsLogs;
  readonly repositoryFullName: string;
  readonly apiUrl: string;
  readonly tenantId: string | undefined;
  readonly workflowId: string;
  readonly prDiffContext: PRDiffContext | null;
  readonly provider: CIProvider;
  readonly isGitHub: boolean;
  readonly pendingChecks: ReadonlyArray<{
    readonly checkRunId: number;
    readonly checkName: string;
    readonly timestamp: Date;
  }>;
  readonly installationId: number;
  readonly owner: string;
  readonly repoName: string;
}

interface BuildAggregationOptions {
  readonly commitSha: string;
  readonly repository: { readonly fullName: string; readonly owner: string; readonly name: string };
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  readonly failures: readonly AnalyzedFailure[];
  readonly prDiffContext: PRDiffContext | null;
  readonly workflowName: string;
  readonly formattedDuration: string | null;
  readonly firstFailureAt: Date;
  readonly lastFailureAt: Date;
  readonly provider: CIProvider;
}

// ==================== Pipeline Steps ====================

/**
 * Fetch logs for all failed jobs, using the appropriate CI provider adapter.
 */
const fetchFailedLogs = async (
  options: FetchFailedLogsOptions
): Promise<AllFailedJobsLogs | null> => {
  const { isGitHub, installationId, owner, repoName, repositoryFullName, commitSha, provider } =
    options;

  if (isGitHub) {
    return fetchAllFailedJobsLogs(installationId, owner, repoName, commitSha);
  }

  const context: RequestContext = {
    requestId: crypto.randomUUID(),
    tenantId: "system",
  };
  const adapters = getCIProviderAdapters(provider);
  const fetchedLogs = await adapters.logFetcher.fetchAllFailedLogs(
    commitSha,
    owner,
    repoName,
    installationId,
    context
  );
  return convertFetchedLogsToAllJobsLogs(fetchedLogs, repositoryFullName);
};

/**
 * Map each pending check to its analysis result, producing AnalyzedFailure entries.
 */
const mapChecksToFailures = (
  pendingChecks: ReadonlyArray<{
    readonly checkRunId: number;
    readonly checkName: string;
    readonly timestamp: Date;
  }>,
  analysisMap: ReadonlyMap<string, AnalysisResultWithError>,
  annotationsByCheck: ReadonlyMap<string, readonly CheckRunAnnotation[]>,
  parsedLintByJob: ReadonlyMap<string, readonly LLMLintError[]>
): readonly AnalyzedFailure[] =>
  pendingChecks.map((check) => {
    const checkAnnotations = annotationsByCheck.get(check.checkName.toLowerCase()) ?? [];
    const parsedLintErrors = parsedLintByJob.get(check.checkName.toLowerCase()) ?? [];

    // Try to find matching analysis by check name
    const analysisResult = analysisMap.get(check.checkName.toLowerCase());

    if (analysisResult && !analysisResult.failed) {
      const enrichedResult = enrichResultWithParsedLintErrors(
        analysisResult,
        parsedLintErrors,
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
      const enrichedResult = enrichResultWithParsedLintErrors(
        partialMatch[1],
        parsedLintErrors,
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
    const llmTestFailures = analysisResult?.testFailures ?? [];
    const errorMsg = analysisResult?.error
      ? `Analysis failed: ${analysisResult.error}`
      : (summarizeTestFailures(llmTestFailures) ?? "CI check failed - see logs for details");

    return createFallbackFailure(check.checkName, check.checkRunId, check.timestamp, errorMsg);
  });

/**
 * Run LLM analysis on all enriched jobs with concurrency limiting,
 * then collect lint errors and annotations for post-processing.
 */
const runAnalysisAndCollectResults = async (
  options: AnalysisCollectionOptions
): Promise<readonly AnalyzedFailure[]> => {
  const {
    enrichedJobs,
    allJobsLogs,
    repositoryFullName,
    apiUrl,
    tenantId,
    workflowId,
    prDiffContext,
    provider,
    isGitHub,
    pendingChecks,
    installationId,
    owner,
    repoName,
  } = options;

  const maxConcurrent =
    config.LLM_MAX_CONCURRENT_ANALYSIS ?? LLM_CONCURRENCY_DEFAULTS.MAX_CONCURRENT_ANALYSIS;

  logger.info("Analyzing jobs with concurrency limit", {
    repository: repositoryFullName,
    jobCount: enrichedJobs.length,
    maxConcurrent,
    jobNames: enrichedJobs.map((job) => job.jobName),
  });

  const analysisResults = await mapWithConcurrency(
    enrichedJobs,
    (job) =>
      analyzeJobWithErrorHandling({
        job,
        repository: repositoryFullName,
        apiUrl,
        tenantId,
        workflowId,
        prDiffContext,
        ciProvider: provider,
      }),
    maxConcurrent,
    config.LLM_QUEUE_TIMEOUT_MS
  );

  const analysisMap = new Map(
    analysisResults.map((result) => [result.jobName.toLowerCase(), result] as const)
  );

  logger.info("All job analyses complete", {
    repository: repositoryFullName,
    successCount: analysisResults.filter((result) => !result.failed).length,
    failedCount: analysisResults.filter((result) => result.failed).length,
  });

  // Parse lint errors deterministically from raw CI logs (no LLM)
  const parsedLintByJob = parseLintErrorsByJob(allJobsLogs.jobs);
  const totalParsedLint = [...parsedLintByJob.values()].reduce(
    (sum, errors) => sum + errors.length,
    0
  );

  if (totalParsedLint > 0) {
    logger.info("Deterministic lint parser extracted errors from raw logs", {
      repository: repositoryFullName,
      totalParsedLint,
      byJob: Object.fromEntries(
        [...parsedLintByJob.entries()]
          .filter(([, errors]) => errors.length > 0)
          .map(([jobName, errors]) => [jobName, errors.length])
      ),
    });
  }

  // Fetch annotations for direct lint error conversion (GitHub-only)
  const annotationsByCheck = isGitHub
    ? await fetchAnnotationsForChecks(pendingChecks, installationId, owner, repoName)
    : new Map<string, readonly CheckRunAnnotation[]>();

  return mapChecksToFailures(pendingChecks, analysisMap, annotationsByCheck, parsedLintByJob);
};

/**
 * Build the AggregatedFailures object from pipeline results.
 */
const buildAggregation = (options: BuildAggregationOptions): AggregatedFailures => ({
  commitSha: options.commitSha,
  repository: options.repository,
  installationId: options.installationId,
  pullRequestNumbers: [...options.pullRequestNumbers],
  failures: options.failures,
  prContext: options.prDiffContext
    ? {
        number: options.prDiffContext.prNumber,
        title: options.prDiffContext.title,
        author: options.prDiffContext.author,
        branch: options.prDiffContext.branch,
        baseBranch: options.prDiffContext.baseBranch,
        labels: [...options.prDiffContext.labels],
        changedFiles: [...options.prDiffContext.changedFiles],
      }
    : null,
  workflowContext: {
    name: options.workflowName,
    duration: options.formattedDuration ?? undefined,
  },
  firstFailureAt: options.firstFailureAt,
  lastFailureAt: options.lastFailureAt,
  provider: options.provider,
});

// ==================== Main Handler ====================

/**
 * Process pending aggregation with per-job analysis.
 *
 * Each job's logs are analyzed separately via LLM to ensure
 * specific, accurate analysis for each failure type.
 */
export const processCombinedAnalysis = async (
  payload: PendingAggregationPayload
): Promise<ConsolidatedPostResult> => {
  const pending = deserializePendingPayload(payload);
  const { repository, installationId, commitSha, provider } = pending;
  const isGitHub = provider === CI_PROVIDERS.GITHUB_ACTIONS;

  logger.info("Starting per-job analysis for pending aggregation", {
    repository: repository.fullName,
    commitSha: commitSha.substring(0, 7),
    pendingCheckCount: pending.pendingChecks.length,
    checkNames: pending.pendingChecks.map((check) => check.checkName),
    provider,
  });

  try {
    const allJobsLogs = await fetchFailedLogs({
      isGitHub,
      installationId,
      owner: repository.owner,
      repoName: repository.name,
      repositoryFullName: repository.fullName,
      commitSha,
      provider,
    });

    if (!allJobsLogs) {
      logger.warn("No workflow logs available for analysis", {
        repository: repository.fullName,
        commitSha: commitSha.substring(0, 7),
        provider,
      });
      return {
        success: false,
        prCommentsPosted: 0,
        slackMessageSent: false,
        checkAnnotationsCreated: false,
        errors: ["No workflow logs available"],
      };
    }

    const workflowTiming = isGitHub
      ? await fetchWorkflowTiming(installationId, repository.owner, repository.name, commitSha)
      : null;
    const formattedDuration = formatDuration(workflowTiming?.durationMs ?? null);

    logger.info("Fetched all failed job logs", {
      repository: repository.fullName,
      workflowName: allJobsLogs.workflowName,
      jobCount: allJobsLogs.jobs.length,
      durationMs: workflowTiming?.durationMs ?? null,
      formattedDuration,
      provider,
    });

    if (isGitHub) {
      const checkNames = pending.pendingChecks.map((check) => check.checkName);
      await postAnalyzingPlaceholder(
        installationId,
        repository.owner,
        repository.name,
        pending.pullRequestNumbers,
        checkNames
      );
    }

    const apiUrl = `${config.API_URL}/api/analyze`;
    const tenantId = isGitHub
      ? (await findTenantByGitHubInstallation(installationId))?.id
      : await resolveTenantForProvider(provider);

    // Enforce per-tenant concurrency limit on analysis jobs
    const slotResult = tenantId ? acquireAnalysisSlot(tenantId) : null;
    if (slotResult && !slotResult.acquired) {
      logger.warn("Tenant concurrency limit reached, rejecting analysis", {
        tenantId,
        activeCount: slotResult.activeCount,
        limit: slotResult.limit,
        repository: repository.fullName,
        commitSha: commitSha.substring(0, 7),
        provider,
      });

      return {
        success: false,
        prCommentsPosted: 0,
        slackMessageSent: false,
        checkAnnotationsCreated: false,
        errors: ["Tenant concurrency limit reached"],
      };
    }

    try {
      const prDiffContext = isGitHub
        ? await fetchPRDiffContext(
            installationId,
            repository.owner,
            repository.name,
            pending.pullRequestNumbers
          )
        : null;
      const enrichedJobs = isGitHub
        ? await enrichJobLogsWithAnnotations(
            allJobsLogs.jobs,
            pending.pendingChecks,
            installationId,
            repository.owner,
            repository.name
          )
        : allJobsLogs.jobs;

      const failures = await runAnalysisAndCollectResults({
        enrichedJobs,
        allJobsLogs,
        repositoryFullName: repository.fullName,
        apiUrl,
        tenantId,
        workflowId: allJobsLogs.workflowName,
        prDiffContext,
        provider,
        isGitHub,
        pendingChecks: pending.pendingChecks,
        installationId,
        owner: repository.owner,
        repoName: repository.name,
      });

      const aggregation = buildAggregation({
        commitSha,
        repository,
        installationId,
        pullRequestNumbers: pending.pullRequestNumbers,
        failures,
        prDiffContext,
        workflowName: allJobsLogs.workflowName,
        formattedDuration,
        firstFailureAt: pending.firstFailureAt,
        lastFailureAt: pending.lastFailureAt,
        provider,
      });

      logger.info("Per-job analysis complete, posting results", {
        repository: repository.fullName,
        commitSha: commitSha.substring(0, 7),
        failureCount: failures.length,
        provider,
      });

      return await postConsolidatedAnalysis(aggregation);
    } finally {
      if (tenantId && slotResult?.acquired) {
        releaseAnalysisSlot(tenantId);
      }
    }
  } catch (pipelineError) {
    logger.error("Per-job analysis failed", {
      error: getErrorMessage(pipelineError),
      repository: repository.fullName,
      commitSha: commitSha.substring(0, 7),
      provider,
    });

    return {
      success: false,
      prCommentsPosted: 0,
      slackMessageSent: false,
      checkAnnotationsCreated: false,
      errors: [getErrorMessage(pipelineError)],
    };
  }
};
