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
  type CachedAnalysis,
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
  getAggregator,
  type AnalyzedFailure,
  type AggregationKey,
  type RepositoryInfo,
  type PRContext,
  type WorkflowContext,
  type CodeAnnotation,
  type RecommendedAction,
} from "../services/aggregation/index.js";
import { deleteKenchiOpsComments } from "../services/githubService.js";

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

/**
 * AI-generated code annotation from analysis
 */
interface AICodeAnnotation {
  readonly path: string;
  readonly line: number;
  readonly level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title?: string;
}

/**
 * Full LLM analysis result (subset of fields we use)
 */
interface FullAnalysisResult {
  readonly codeAnnotations?: readonly AICodeAnnotation[];
}

/**
 * API analysis response type
 */
interface ApiAnalysis {
  repository?: string;
  confidence?: number;
  analysis?: string;
  identified_cause?: string;
  recommended_actions?: Array<{
    description: string;
    priority: string | number;
    actionType?: string;
    reasoning?: string;
  }>;
  full_analysis?: FullAnalysisResult;
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
 * Format duration in milliseconds to human-readable string
 */
const formatDuration = (ms: number | undefined): string => {
  if (!ms) return "";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
};

// ==================== Conversion Functions ====================

/**
 * Convert AI annotations to aggregation CodeAnnotation format
 */
const convertAIAnnotations = (
  aiAnnotations: readonly AICodeAnnotation[] | undefined,
  githubAnnotations: EnrichedContext["annotations"]
): CodeAnnotation[] => {
  // Prefer AI annotations when available
  if (aiAnnotations && aiAnnotations.length > 0) {
    return aiAnnotations.map((ann) => ({
      path: ann.path,
      line: ann.line,
      level: ann.level,
      message: ann.message,
      title: ann.title,
    }));
  }

  // Fallback to GitHub annotations
  return githubAnnotations.map((ann) => ({
    path: ann.path,
    line: ann.startLine,
    level: ann.level,
    message: ann.message,
    title: ann.title,
  }));
};

/**
 * Convert API recommended actions to aggregation format
 */
const convertRecommendedActions = (
  actions: ApiAnalysis["recommended_actions"]
): RecommendedAction[] => {
  if (!actions) return [];

  return actions.map((action) => ({
    description: action.description,
    priority: action.priority,
    actionType: action.actionType,
    reasoning: action.reasoning,
  }));
};

/**
 * Build AnalyzedFailure from API analysis result
 */
const buildAnalyzedFailure = (
  checkRun: CheckRunWebhook["check_run"],
  analysis: ApiAnalysis,
  context: EnrichedContext
): AnalyzedFailure => ({
  checkRunId: checkRun.id,
  checkName: checkRun.name,
  conclusion: checkRun.conclusion || "failure",
  confidence: analysis.confidence ?? 0.5,
  identifiedCause: analysis.identified_cause || "",
  analysis: analysis.analysis || "Analysis unavailable",
  annotations: convertAIAnnotations(analysis.full_analysis?.codeAnnotations, context.annotations),
  recommendedActions: convertRecommendedActions(analysis.recommended_actions),
  timestamp: new Date(),
});

/**
 * Build repository info from webhook
 */
const buildRepositoryInfo = (repository: CheckRunWebhook["repository"]): RepositoryInfo => ({
  fullName: repository.full_name,
  owner: repository.owner.login,
  name: repository.name,
});

/**
 * Build PR context from enriched context
 */
const buildPRContext = (context: EnrichedContext, prNumber: number): PRContext | null => {
  if (!context.prMetadata) return null;

  return {
    number: prNumber,
    title: context.prMetadata.title ?? "",
    author: context.prMetadata.author ?? "",
    branch: context.prMetadata.headBranch ?? "",
    baseBranch: context.prMetadata.baseBranch ?? "",
    labels: context.prMetadata.labels ?? [],
  };
};

/**
 * Build workflow context from enriched context
 */
const buildWorkflowContext = (
  checkName: string,
  context: EnrichedContext
): WorkflowContext | null => {
  if (!context.workflowTiming) return null;

  return {
    name: checkName,
    duration: formatDuration(context.workflowTiming.durationMs ?? undefined),
  };
};

// ==================== Core Processing ====================

/**
 * Convert cached analysis to API analysis format
 */
const cachedToApiAnalysis = (cached: CachedAnalysis): ApiAnalysis => ({
  repository: cached.repository,
  confidence: cached.confidence,
  analysis: cached.analysis,
  identified_cause: cached.identifiedCause,
  recommended_actions: cached.recommendedActions.map((a) => ({
    description: a.description,
    priority: a.priority,
    actionType: a.actionType,
    reasoning: a.reasoning,
  })),
  full_analysis: {
    codeAnnotations: cached.annotations.map((a) => ({
      path: a.path,
      line: a.line,
      level: a.level,
      message: a.message,
      title: a.title,
    })),
  },
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
  const cachedByCheck = await getCachedCheckAnalysis(repositoryFullName, commitSha, checkName);

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

  // Step 3: Add to aggregator (will be posted consolidated later)
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
    const aggregator = getAggregator();
    aggregator.addFailure(
      aggregationKey,
      analyzedFailure,
      repositoryInfo,
      installation.id,
      pullRequestNumbers,
      prContext,
      workflowContext
    );

    logger.info("Failure added to aggregator", {
      repository: repository.full_name,
      checkName: check_run.name,
      commitSha: check_run.head_sha.substring(0, 7),
    });

    return true;
  } catch (error) {
    logger.error("Failed to add failure to aggregator", {
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
 * Conclusions that represent actual CI failures
 */
const FAILURE_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.FAILURE,
  GITHUB_CHECK_CONCLUSIONS.TIMED_OUT,
]);

/**
 * Check if the check run should be processed
 */
const shouldProcessCheckRun = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;

  // Only process completed check runs with failure conclusions
  return (
    action === GITHUB_CHECK_ACTIONS.COMPLETED && FAILURE_CONCLUSIONS.has(check_run.conclusion || "")
  );
};

/**
 * Check if this is a successful check run that should trigger comment cleanup
 */
const isSuccessfulCheckRun = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;
  return (
    action === GITHUB_CHECK_ACTIONS.COMPLETED &&
    check_run.conclusion === GITHUB_CHECK_CONCLUSIONS.SUCCESS
  );
};

/**
 * Clean up old KenchiOps comments when CI passes
 * This removes stale failure analysis comments after issues are fixed
 */
const cleanupOnSuccess = async (webhook: CheckRunWebhook): Promise<void> => {
  const { check_run, repository, installation } = webhook;

  if (!installation?.id) return;

  // Find PRs associated with this check run
  let prNumbers = check_run.pull_requests.map((pr) => pr.number);
  if (prNumbers.length === 0) {
    prNumbers = await fetchPRsByCommit(
      installation.id,
      repository.owner.login,
      repository.name,
      check_run.head_sha
    );
  }

  // Delete old KenchiOps comments on each PR
  await Promise.all(
    prNumbers.map((prNumber) =>
      deleteKenchiOpsComments(installation.id, repository.owner.login, repository.name, prNumber)
    )
  );
};

/**
 * Handle check run webhook
 */
export const handleCheckRun = async (webhook: CheckRunWebhook): Promise<CheckRunHandlerResult> => {
  // Handle successful check runs - clean up old failure comments
  if (isSuccessfulCheckRun(webhook)) {
    logger.info("Check run succeeded - cleaning up old comments", {
      action: webhook.action,
      conclusion: webhook.check_run.conclusion,
      repository: webhook.repository.full_name,
    });

    await cleanupOnSuccess(webhook);

    return {
      handled: true,
      message: "Check run succeeded - cleaned up old failure comments",
    };
  }

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
