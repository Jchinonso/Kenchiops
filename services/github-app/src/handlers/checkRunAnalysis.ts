/**
 * Check Run Analysis Functions
 *
 * Analysis and context processing for CI failures.
 * Handles caching, API calls, and aggregation.
 */

import {
  createLogger,
  config,
  resilientPost,
  getCachedCheckAnalysis,
  cacheCheckAnalysis,
  buildCachedAnalysis,
  generateLogHash,
  getCachedAnalysisByLogHash,
  cacheAnalysisByLogHash,
  addFailureToRedis,
  trackPRFailure,
  createFailureSummary,
  getErrorMessage,
  findByGitHubInstallation,
  type AggregationKey,
  type FailureContext,
} from "@kenchi/shared";
import { GITHUB_CHECK_CONCLUSIONS, type CheckRunWebhook } from "../types/githubTypes.js";
import {
  gatherEnrichedContext,
  fetchPRsByCommit,
  type EnrichedContext,
} from "../services/context/index.js";
import { buildEnrichedLogContent } from "../formatters/checkRunFormatter.js";
import {
  type ApiAnalysis,
  buildAnalyzedFailure,
  buildRepositoryInfo,
  buildPRContext,
  buildWorkflowContext,
  cachedToApiAnalysis,
} from "./checkRunConverters.js";

const logger = createLogger("github-app");

// ==================== Types ====================

/**
 * Context metadata for debugging
 */
export interface ContextMetadata {
  readonly hasWorkflowLogs: boolean;
  readonly hasPRDiff: boolean;
  readonly hasCommitInfo: boolean;
  readonly hasPRMetadata: boolean;
  readonly annotationsCount: number;
  readonly testFailuresCount: number;
  readonly sourceFilesCount: number;
}

// ==================== Constants ====================

/**
 * Conclusions that should be skipped (not actual failures)
 */
export const SKIP_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.CANCELLED,
  GITHUB_CHECK_CONCLUSIONS.SKIPPED,
  GITHUB_CHECK_CONCLUSIONS.STALE,
]);

// ==================== Helper Functions ====================

/**
 * Build context metadata from enriched context.
 */
export const buildContextMetadata = (context: EnrichedContext): ContextMetadata => ({
  hasWorkflowLogs: !!context.workflowLogs,
  hasPRDiff: !!context.prDiff,
  hasCommitInfo: !!context.commitInfo,
  hasPRMetadata: !!context.prMetadata,
  annotationsCount: context.annotations.length,
  testFailuresCount: context.testFailures.length,
  sourceFilesCount: context.sourceFiles.length,
});

// ==================== Analysis Functions ====================

/**
 * Fetch analysis from cache or API service.
 * Uses multi-level caching: by check, then by log hash.
 */
export const fetchAnalysis = async (
  enrichedLog: string,
  repositoryFullName: string,
  commitSha: string,
  checkName: string,
  tenantId?: string
): Promise<ApiAnalysis> => {
  // Level 1: Check if we have cached analysis for this exact check
  logger.info("Checking cache (level 1: by check)...");
  const cachedByCheck = await getCachedCheckAnalysis(repositoryFullName, commitSha, checkName);
  logger.info("Cache check (level 1) completed", { found: !!cachedByCheck });

  if (cachedByCheck) {
    logger.info("Analysis cache hit (by check)", {
      repository: repositoryFullName,
      commitSha: commitSha.substring(0, 7),
      checkName,
    });
    return cachedToApiAnalysis(cachedByCheck);
  }

  // Level 2: Check if we have cached analysis for same log content
  const logHash = generateLogHash(enrichedLog);
  const cachedByLog = await getCachedAnalysisByLogHash(logHash);

  if (cachedByLog) {
    logger.info("Analysis cache hit (by log hash)", {
      repository: repositoryFullName,
      logHash,
    });

    // Cache by check for faster future lookups
    await cacheCheckAnalysis({
      ...cachedByLog,
      repository: repositoryFullName,
      commitSha,
      checkName,
    });

    return cachedToApiAnalysis(cachedByLog);
  }

  // Level 3: Fetch from API
  const apiUrl = `${config.API_URL}/api/analyze`;

  const response = await resilientPost<ApiAnalysis>(apiUrl, {
    failure_log: enrichedLog,
    repository: repositoryFullName,
    tenant_id: tenantId,
  });

  logger.debug("Analysis API response", {
    status: response.status,
    retryCount: response.retryCount,
    duration: response.duration,
  });

  // Cache the result for future use
  const cachedAnalysis = buildCachedAnalysis(
    repositoryFullName,
    commitSha,
    checkName,
    response.data
  );

  // Cache by both check and log hash (fire and forget)
  void (async () => {
    try {
      await Promise.all([
        cacheCheckAnalysis(cachedAnalysis),
        cacheAnalysisByLogHash(logHash, cachedAnalysis),
      ]);
    } catch (error) {
      logger.warn("Failed to cache analysis", {
        error: getErrorMessage(error),
      });
    }
  })();

  return response.data;
};

/**
 * Process CI failure: gather context, analyze, add to aggregator.
 *
 * @returns true if failure was successfully processed and added to aggregator
 */
export const processCIFailure = async (webhook: CheckRunWebhook): Promise<boolean> => {
  const { check_run, repository, installation } = webhook;

  // Step 1: Gather enriched context from GitHub
  logger.info("Gathering enriched context for CI failure", {
    repository: repository.full_name,
    checkName: check_run.name,
    headSha: check_run.head_sha.substring(0, 7),
  });

  const context = await gatherEnrichedContext(webhook);

  // Skip if workflow was cancelled (job might show as "failure" but workflow was cancelled)
  const workflowConclusion = context.workflowTiming?.conclusion;
  if (workflowConclusion && SKIP_CONCLUSIONS.has(workflowConclusion)) {
    logger.info("Skipping analysis - workflow was cancelled/skipped", {
      repository: repository.full_name,
      checkName: check_run.name,
      workflowConclusion,
    });
    return false;
  }

  const enrichedLog = buildEnrichedLogContent(webhook, context);
  const contextMetadata = buildContextMetadata(context);

  // Find PRs if not in webhook
  let pullRequestNumbers = check_run.pull_requests.map((pr) => pr.number);
  if (pullRequestNumbers.length === 0 && installation?.id) {
    pullRequestNumbers = await fetchPRsByCommit(
      installation.id,
      repository.owner.login,
      repository.name,
      check_run.head_sha
    );
  }

  logger.info("Context gathered", {
    repository: repository.full_name,
    ...contextMetadata,
    pullRequestCount: pullRequestNumbers.length,
  });

  // Step 2: Look up tenant for cost tracking
  let tenantId: string | undefined;
  if (installation?.id) {
    try {
      const tenant = await findByGitHubInstallation(installation.id);
      tenantId = tenant?.id;
      logger.debug("Tenant lookup for cost tracking", {
        installationId: installation.id,
        tenantId,
        found: !!tenant,
      });
    } catch (error) {
      logger.warn("Failed to look up tenant, continuing without cost tracking", {
        installationId: installation.id,
        error: getErrorMessage(error),
      });
    }
  }

  // Step 3: Get analysis (from cache or API)
  logger.info("Fetching analysis from cache or API...", {
    repository: repository.full_name,
    commitSha: check_run.head_sha.substring(0, 7),
    tenantId,
  });

  let analysis: ApiAnalysis;
  try {
    analysis = await fetchAnalysis(
      enrichedLog,
      repository.full_name,
      check_run.head_sha,
      check_run.name,
      tenantId
    );

    const aiAnnotationCount = analysis.full_analysis?.codeAnnotations?.length ?? 0;
    logger.info("Analysis received", {
      repository: repository.full_name,
      confidence: analysis.confidence,
      aiAnnotationCount,
      hasAIAnnotations: aiAnnotationCount > 0,
    });
  } catch (error) {
    logger.error("Failed to get analysis", {
      error: getErrorMessage(error),
    });
    return false;
  }

  // Step 4: Add to Redis aggregator (will be enqueued and posted consolidated later)
  if (!installation?.id) {
    logger.warn("No installation ID, skipping aggregation");
    return false;
  }

  const aggregationKey: AggregationKey = {
    repositoryFullName: repository.full_name,
    commitSha: check_run.head_sha,
  };

  const analyzedFailure = buildAnalyzedFailure(check_run, analysis, context);
  const repositoryInfo = buildRepositoryInfo(repository);
  const prContext =
    pullRequestNumbers.length > 0 ? buildPRContext(context, pullRequestNumbers[0]) : null;
  const workflowContext = buildWorkflowContext(check_run.name, context);

  const failureContext: FailureContext = {
    repositoryInfo,
    installationId: installation.id,
    pullRequestNumbers,
    prContext,
    workflowContext,
  };

  try {
    await addFailureToRedis(aggregationKey, analyzedFailure, failureContext);

    logger.info("Failure added to Redis aggregator", {
      repository: repository.full_name,
      checkName: check_run.name,
      commitSha: check_run.head_sha.substring(0, 7),
    });

    // Track failure for linked commit ingestion (when PR merges)
    if (pullRequestNumbers.length > 0) {
      const failureSummary = createFailureSummary({
        checkName: check_run.name,
        conclusion: check_run.conclusion ?? "failure",
        identifiedCause: analysis.identified_cause ?? "",
        analysis: analysis.analysis ?? "",
        confidence: analysis.confidence ?? 0,
        errorPatterns: context.annotations.map((annotation) => annotation.message),
        testFailures: context.testFailures.map((testFailure) => testFailure.testName),
      });

      // Track for each associated PR
      await Promise.all(
        pullRequestNumbers.map((prNumber) =>
          trackPRFailure(repository.full_name, prNumber, failureSummary)
        )
      );

      logger.debug("Failure tracked for linked commit ingestion", {
        repository: repository.full_name,
        pullRequestNumbers,
        checkName: check_run.name,
      });
    }

    return true;
  } catch (error) {
    logger.error("Failed to add failure to Redis aggregator", {
      error: getErrorMessage(error),
    });
    return false;
  }
};
