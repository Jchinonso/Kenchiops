/**
 * Check Run Handler
 *
 * Handles GitHub check run webhook events (CI failures).
 * Gathers enriched context, analyzes with OpenAI, and adds failures
 * to the aggregator for consolidated posting.
 *
 * Flow: GitHub → Gather Context → API (OpenAI) → Aggregator → Consolidated Post
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
  KENCHI_BRANDING,
  type AggregationKey,
} from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";
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

// ==================== Type Definitions ====================

/**
 * Result of handling a check run webhook
 */
export interface CheckRunHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
}

/**
 * Context metadata for debugging
 */
interface ContextMetadata {
  readonly hasWorkflowLogs: boolean;
  readonly hasPRDiff: boolean;
  readonly hasCommitInfo: boolean;
  readonly hasPRMetadata: boolean;
  readonly annotationsCount: number;
  readonly testFailuresCount: number;
  readonly sourceFilesCount: number;
}

// ==================== Utility Functions ====================

/**
 * Build context metadata from enriched context
 */
const buildContextMetadata = (context: EnrichedContext): ContextMetadata => ({
  hasWorkflowLogs: !!context.workflowLogs,
  hasPRDiff: !!context.prDiff,
  hasCommitInfo: !!context.commitInfo,
  hasPRMetadata: !!context.prMetadata,
  annotationsCount: context.annotations.length,
  testFailuresCount: context.testFailures.length,
  sourceFilesCount: context.sourceFiles.length,
});

/**
 * Fetch analysis from cache or API service
 * Uses multi-level caching: by check, then by log hash
 */
const fetchAnalysis = async (
  enrichedLog: string,
  repositoryFullName: string,
  commitSha: string,
  checkName: string
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
  Promise.all([
    cacheCheckAnalysis(cachedAnalysis),
    cacheAnalysisByLogHash(logHash, cachedAnalysis),
  ]).catch((error) => {
    logger.warn("Failed to cache analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });

  return response.data;
};

/**
 * Process CI failure: gather context, analyze, add to aggregator
 */
const processCIFailure = async (webhook: CheckRunWebhook): Promise<boolean> => {
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

  // Step 2: Get analysis (from cache or API)
  logger.info("Fetching analysis from cache or API...", {
    repository: repository.full_name,
    commitSha: check_run.head_sha.substring(0, 7),
  });

  let analysis: ApiAnalysis;
  try {
    analysis = await fetchAnalysis(
      enrichedLog,
      repository.full_name,
      check_run.head_sha,
      check_run.name
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
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }

  // Step 3: Add to Redis aggregator (will be enqueued and posted consolidated later)
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

  try {
    await addFailureToRedis(
      aggregationKey,
      analyzedFailure,
      repositoryInfo,
      installation.id,
      pullRequestNumbers,
      prContext,
      workflowContext
    );

    logger.info("Failure added to Redis aggregator", {
      repository: repository.full_name,
      checkName: check_run.name,
      commitSha: check_run.head_sha.substring(0, 7),
    });

    return true;
  } catch (error) {
    logger.error("Failed to add failure to Redis aggregator", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};

// ==================== Handler Functions ====================

/**
 * Handle check run completed with failure
 */
export const handleCheckRunFailure = async (
  webhook: CheckRunWebhook
): Promise<CheckRunHandlerResult> => {
  const { check_run, repository } = webhook;

  logger.warn("CI check failed - processing", {
    name: check_run.name,
    repository: repository.full_name,
    conclusion: check_run.conclusion,
    pullRequests: check_run.pull_requests.length,
  });

  const processed = await processCIFailure(webhook);

  if (processed) {
    return {
      handled: true,
      message: "CI failure analyzed and added to aggregator",
      eventId: `check_${check_run.id}`,
    };
  }

  return {
    handled: false,
    message: "Failed to process CI failure",
  };
};

/**
 * Conclusions that represent actual CI failures worth analyzing
 */
const FAILURE_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.FAILURE,
  GITHUB_CHECK_CONCLUSIONS.TIMED_OUT,
]);

/**
 * Conclusions that should be skipped (not actual failures)
 */
const SKIP_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.CANCELLED,
  GITHUB_CHECK_CONCLUSIONS.SKIPPED,
  GITHUB_CHECK_CONCLUSIONS.STALE,
]);

/**
 * Check if the check run should be processed.
 * Filters out our own KenchiOps check runs to prevent infinite loops.
 */
const shouldProcessCheckRun = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;

  // Skip our own check runs to prevent feedback loop
  if (check_run.name === KENCHI_BRANDING.CHECK_RUN_NAME) {
    logger.debug("Skipping own KenchiOps check run", {
      checkName: check_run.name,
      repository: webhook.repository.full_name,
    });
    return false;
  }

  // Only process completed check runs with failure conclusions
  return (
    action === GITHUB_CHECK_ACTIONS.COMPLETED && FAILURE_CONCLUSIONS.has(check_run.conclusion || "")
  );
};

/**
 * Handle check run webhook
 */
export const handleCheckRun = async (webhook: CheckRunWebhook): Promise<CheckRunHandlerResult> => {
  // Skip non-failure check runs
  if (!shouldProcessCheckRun(webhook)) {
    logger.info("Check run event skipped", {
      action: webhook.action,
      conclusion: webhook.check_run.conclusion,
      repository: webhook.repository.full_name,
    });

    return {
      handled: false,
      message: "Check run event skipped (not a failure)",
    };
  }

  return handleCheckRunFailure(webhook);
};
