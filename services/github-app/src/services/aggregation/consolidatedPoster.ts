/**
 * Consolidated Poster Service
 *
 * Handles posting consolidated CI failure analysis to GitHub and Slack.
 * Called by the FailureAggregator when aggregation is ready.
 */

import { createLogger, config, resilientPost } from "@kenchi/shared";
import type { AggregatedFailures, ConsolidatedPostResult } from "./types.js";
import {
  buildConsolidatedPRComment,
  buildConsolidatedSlackPayload,
  buildConsolidatedCheckAnnotations,
  buildConsolidatedCheckSummary,
} from "../../formatters/consolidatedFormatter.js";
import { postPRComment, createCheckRunWithAnnotations } from "../githubService.js";

const logger = createLogger("github-app");

/**
 * Post consolidated analysis to a single PR
 * Deletes old KenchiOps comments first to keep PR clean
 */
const postToPR = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commentBody: string
): Promise<boolean> => {
  try {
    // Delete old comments and post new one (deleteOldComments = true)
    await postPRComment(installationId, owner, repo, prNumber, commentBody, true);
    return true;
  } catch (error) {
    logger.error("Failed to post consolidated comment to PR", {
      prNumber,
      error: error instanceof Error ? error.message : "Unknown error",
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
  annotations: ReturnType<typeof buildConsolidatedCheckAnnotations>
): Promise<{ created: boolean; errors: string[] }> => {
  if (annotations.length === 0) {
    return { created: false, errors: [] };
  }

  const { repository, installationId, commitSha } = aggregation;

  try {
    const summary = buildConsolidatedCheckSummary(aggregation);

    await createCheckRunWithAnnotations(
      installationId,
      repository.owner,
      repository.name,
      commitSha,
      "KenchiOps Analysis",
      summary,
      annotations
    );

    logger.info("Created consolidated check run with annotations", {
      repository: repository.fullName,
      annotationCount: annotations.length,
      failureCount: aggregation.failures.length,
    });

    return { created: true, errors: [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to create consolidated check annotations", { error: errorMsg });
    return { created: false, errors: [`Failed to create check annotations: ${errorMsg}`] };
  }
};

/**
 * Post consolidated analysis to GitHub (PR comments and check annotations).
 * Uses functional composition - no let declarations.
 */
const postToGitHub = async (
  aggregation: AggregatedFailures
): Promise<{ prCommentsPosted: number; checkAnnotationsCreated: boolean; errors: string[] }> => {
  const { repository, installationId, pullRequestNumbers } = aggregation;

  // Build consolidated PR comment
  const commentBody = buildConsolidatedPRComment(aggregation);

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

/**
 * Post consolidated analysis to Slack using resilient HTTP client
 */
const postToSlack = async (
  aggregation: AggregatedFailures
): Promise<{ success: boolean; error?: string }> => {
  const slackPayload = buildConsolidatedSlackPayload(aggregation);
  const slackUrl = `${config.SLACK_BOT_URL}/slack/message`;

  try {
    const response = await resilientPost<{ success: boolean }>(slackUrl, {
      consolidated: true,
      payload: slackPayload,
      repository: aggregation.repository.fullName,
      installation_id: aggregation.installationId,
      commit_sha: aggregation.commitSha,
      failure_count: aggregation.failures.length,
    });

    logger.info("Posted consolidated Slack message", {
      repository: aggregation.repository.fullName,
      failureCount: aggregation.failures.length,
      retryCount: response.retryCount,
      duration: response.duration,
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to post consolidated Slack message", {
      error: errorMsg,
    });
    return { success: false, error: errorMsg };
  }
};

/**
 * Post consolidated analysis to all channels (GitHub + Slack)
 *
 * This is the main callback for the FailureAggregator.
 */
export const postConsolidatedAnalysis = async (
  aggregation: AggregatedFailures
): Promise<ConsolidatedPostResult> => {
  const errors: string[] = [];

  logger.info("Posting consolidated analysis", {
    repository: aggregation.repository.fullName,
    commitSha: aggregation.commitSha.substring(0, 7),
    failureCount: aggregation.failures.length,
    checkNames: aggregation.failures.map((f) => f.checkName),
    prCount: aggregation.pullRequestNumbers.length,
  });

  // Post to GitHub and Slack in parallel
  const [githubResult, slackResult] = await Promise.all([
    postToGitHub(aggregation),
    postToSlack(aggregation),
  ]);

  // Collect errors
  errors.push(...githubResult.errors);
  if (slackResult.error) {
    errors.push(slackResult.error);
  }

  const success =
    (githubResult.prCommentsPosted > 0 || aggregation.pullRequestNumbers.length === 0) &&
    slackResult.success;

  return {
    success,
    prCommentsPosted: githubResult.prCommentsPosted,
    slackMessageSent: slackResult.success,
    checkAnnotationsCreated: githubResult.checkAnnotationsCreated,
    errors,
  };
};
