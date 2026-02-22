/**
 * Consolidated Poster Service
 *
 * Handles posting consolidated CI failure analysis to GitHub and Slack.
 * Called by the FailureAggregator when aggregation is ready.
 *
 * Uses message queue for Slack notifications for reliable delivery.
 */

import crypto from "node:crypto";
import {
  createLogger,
  config,
  isRedisHealthy,
  enqueueConsolidatedNotification,
  resilientPost,
  getErrorMessage,
  generateFeedbackUrl,
  KENCHI_BRANDING,
  SHORT_COMMIT_SHA_LENGTH,
  CI_PROVIDERS,
  type AggregatedFailures,
  type ConsolidatedPostResult,
  type RequestContext,
} from "@kenchi/shared";
import { getCIProviderAdapters, hasCIProvider } from "../../adapters/ciProviderRegistry.js";
import {
  postPRComment,
  createCheckRunWithAnnotations,
  type CheckAnnotation,
} from "../githubService.js";
import {
  type FeedbackLinks,
  buildConsolidatedPRComment,
  buildConsolidatedSlackPayload,
  buildConsolidatedCheckAnnotations,
  buildConsolidatedCheckSummary,
} from "../formatters/index.js";

const logger = createLogger("github-app");

// ==================== Feedback Links ====================

/**
 * Create feedback links for the comment.
 */
const createFeedbackLinks = async (analysisId: string): Promise<FeedbackLinks | null> => {
  const webhookSecret = config.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return null;
  }

  try {
    const baseUrl = `${config.GITHUB_APP_URL}/api/feedback`;
    const [correctUrl, incorrectUrl] = await Promise.all([
      generateFeedbackUrl(baseUrl, analysisId, "correct", webhookSecret),
      generateFeedbackUrl(baseUrl, analysisId, "incorrect", webhookSecret),
    ]);
    return { correctUrl, incorrectUrl };
  } catch {
    return null;
  }
};

// ==================== GitHub Posting ====================

/**
 * Post consolidated analysis to a single PR.
 * Deletes old KenchiOps comments first to keep PR clean.
 */
const postToPR = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commentBody: string
): Promise<boolean> => {
  try {
    await postPRComment(installationId, owner, repo, prNumber, commentBody, true);
    return true;
  } catch (error) {
    logger.error("Failed to post consolidated comment to PR", {
      prNumber,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Post PR comments and return count of successful posts.
 */
const postPRComments = async (
  installationId: number,
  owner: string,
  repo: string,
  pullRequestNumbers: readonly number[],
  commentBody: string
): Promise<{ successCount: number; errors: string[] }> => {
  if (pullRequestNumbers.length === 0) {
    return { successCount: 0, errors: [] };
  }

  const results = await Promise.all(
    pullRequestNumbers.map((prNumber) =>
      postToPR(installationId, owner, repo, prNumber, commentBody)
    )
  );

  const successCount = results.filter(Boolean).length;
  const failCount = pullRequestNumbers.length - successCount;
  const errors = failCount > 0 ? [`Failed to post to ${failCount} PR(s)`] : [];

  return { successCount, errors };
};

/**
 * Create check run with annotations.
 * Returns success status and any errors.
 */
const createCheckAnnotations = async (
  aggregation: AggregatedFailures,
  annotations: CheckAnnotation[]
): Promise<{ created: boolean; errors: string[] }> => {
  if (annotations.length === 0) {
    return { created: false, errors: [] };
  }

  const { repository, installationId, commitSha } = aggregation;

  try {
    const summary = buildConsolidatedCheckSummary(aggregation);

    await createCheckRunWithAnnotations({
      installationId,
      owner: repository.owner,
      repo: repository.name,
      headSha: commitSha,
      name: KENCHI_BRANDING.CHECK_RUN_NAME,
      summary,
      annotations,
    });

    logger.info("Created consolidated check run with annotations", {
      repository: repository.fullName,
      annotationCount: annotations.length,
      failureCount: aggregation.failures.length,
    });

    return { created: true, errors: [] };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    logger.error("Failed to create consolidated check annotations", { error: errorMsg });
    return { created: false, errors: [`Failed to create check annotations: ${errorMsg}`] };
  }
};

/**
 * Post consolidated analysis to GitHub (PR comments and check annotations).
 */
const postToGitHub = async (
  aggregation: AggregatedFailures
): Promise<{ prCommentsPosted: number; checkAnnotationsCreated: boolean; errors: string[] }> => {
  const { repository, installationId, pullRequestNumbers } = aggregation;
  const analysisId = `${repository.fullName}:${aggregation.commitSha}`;
  const feedbackLinks = await createFeedbackLinks(analysisId);

  // Build consolidated PR comment
  const commentBody = buildConsolidatedPRComment(aggregation, feedbackLinks ?? undefined);

  // Post PR comments
  const prResult = await postPRComments(
    installationId,
    repository.owner,
    repository.name,
    pullRequestNumbers,
    commentBody
  );

  if (prResult.successCount > 0) {
    logger.info("Posted consolidated PR comments", {
      repository: repository.fullName,
      totalPRs: pullRequestNumbers.length,
      successfulPosts: prResult.successCount,
    });
  }

  // Create check annotations
  const annotations = buildConsolidatedCheckAnnotations(aggregation);
  const annotationResult = await createCheckAnnotations(aggregation, annotations);

  return {
    prCommentsPosted: prResult.successCount,
    checkAnnotationsCreated: annotationResult.created,
    errors: [...prResult.errors, ...annotationResult.errors],
  };
};

// ==================== Slack Posting ====================

/**
 * Check if Redis is available, with error handling.
 */
const checkRedisAvailability = async (): Promise<boolean> => {
  try {
    return await isRedisHealthy();
  } catch {
    return false;
  }
};

/**
 * Post consolidated analysis to Slack via message queue.
 * Falls back to direct HTTP if Redis is unavailable.
 */
const postToSlack = async (
  aggregation: AggregatedFailures
): Promise<{ success: boolean; error?: string }> => {
  const slackPayload = buildConsolidatedSlackPayload(aggregation);

  // Check if Redis is available for queue-based delivery
  const redisAvailable = await checkRedisAvailability();

  if (redisAvailable) {
    try {
      const messageId = await enqueueConsolidatedNotification(aggregation, slackPayload);

      logger.info("Enqueued consolidated Slack notification", {
        messageId,
        repository: aggregation.repository.fullName,
        failureCount: aggregation.failures.length,
      });

      return { success: true };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      logger.warn("Failed to enqueue Slack notification, falling back to direct HTTP", {
        error: errorMsg,
      });
      // Fall through to direct HTTP
    }
  }

  // Direct HTTP fallback (when Redis unavailable)
  const slackUrl = `${config.SLACK_BOT_URL}/slack/message`;

  try {
    const response = await resilientPost<{ success: boolean }>(
      slackUrl,
      {
        consolidated: true,
        payload: slackPayload,
        repository: aggregation.repository.fullName,
        installation_id: aggregation.installationId,
        commit_sha: aggregation.commitSha,
        failure_count: aggregation.failures.length,
      },
      { internalAuth: true }
    );

    logger.info("Posted consolidated Slack message (direct HTTP)", {
      repository: aggregation.repository.fullName,
      failureCount: aggregation.failures.length,
      retryCount: response.retryCount,
      duration: response.duration,
    });

    return { success: true };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    logger.error("Failed to post consolidated Slack message", {
      error: errorMsg,
    });
    return { success: false, error: errorMsg };
  }
};

// ==================== Non-GitHub Provider Output ====================

/**
 * Post analysis results via a non-GitHub CI provider's output adapter.
 */
const postToNonGitHubProvider = async (
  aggregation: AggregatedFailures,
  context: RequestContext
): Promise<{
  readonly prCommentsPosted: number;
  readonly checkAnnotationsCreated: boolean;
  readonly errors: readonly string[];
}> => {
  const { provider } = aggregation;

  if (!provider || !hasCIProvider(provider)) {
    return {
      prCommentsPosted: 0,
      checkAnnotationsCreated: false,
      errors: [`No output adapter for provider "${provider ?? "unknown"}"`],
    };
  }

  try {
    const adapters = getCIProviderAdapters(provider);
    const result = await adapters.output.postAnalysisResults(aggregation, context);

    logger.info("Posted analysis via CI provider adapter", {
      provider,
      repository: aggregation.repository.fullName,
      prCommentsPosted: result.prCommentsPosted,
      checkAnnotationsCreated: result.checkAnnotationsCreated,
      ...context,
    });

    return {
      prCommentsPosted: result.prCommentsPosted,
      checkAnnotationsCreated: result.checkAnnotationsCreated,
      errors: [...result.errors],
    };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    logger.error("Failed to post analysis via CI provider adapter", {
      provider,
      repository: aggregation.repository.fullName,
      error: errorMsg,
      ...context,
    });
    return {
      prCommentsPosted: 0,
      checkAnnotationsCreated: false,
      errors: [errorMsg],
    };
  }
};

// ==================== Main Export ====================

/**
 * Post consolidated analysis to all channels (CI provider + Slack).
 *
 * This is the main callback for the FailureAggregator.
 * Routes to GitHub-specific posting or the provider's output adapter.
 */
export const postConsolidatedAnalysis = async (
  aggregation: AggregatedFailures
): Promise<ConsolidatedPostResult> => {
  const errors: string[] = [];
  const provider = aggregation.provider ?? CI_PROVIDERS.GITHUB_ACTIONS;
  const isGitHub = provider === CI_PROVIDERS.GITHUB_ACTIONS;

  logger.info("Posting consolidated analysis", {
    repository: aggregation.repository.fullName,
    commitSha: aggregation.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH),
    failureCount: aggregation.failures.length,
    checkNames: aggregation.failures.map((failure) => failure.checkName),
    prCount: aggregation.pullRequestNumbers.length,
    provider,
  });

  // Post to CI provider and Slack in parallel
  // GitHub uses the existing postToGitHub; other providers use their output adapter
  const workerContext: RequestContext = {
    requestId: crypto.randomUUID(),
    tenantId: "system",
  };
  const ciResultPromise = isGitHub
    ? postToGitHub(aggregation)
    : postToNonGitHubProvider(aggregation, workerContext);
  const [ciResult, slackResult] = await Promise.all([ciResultPromise, postToSlack(aggregation)]);

  // Collect errors
  errors.push(...ciResult.errors);
  if (slackResult.error) {
    errors.push(slackResult.error);
  }

  const success =
    (ciResult.prCommentsPosted > 0 || aggregation.pullRequestNumbers.length === 0) &&
    slackResult.success;

  return {
    success,
    prCommentsPosted: ciResult.prCommentsPosted,
    slackMessageSent: slackResult.success,
    checkAnnotationsCreated: ciResult.checkAnnotationsCreated,
    errors,
  };
};
