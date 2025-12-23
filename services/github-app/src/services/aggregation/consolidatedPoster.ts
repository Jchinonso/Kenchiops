/**
 * Consolidated Poster Service
 *
 * Handles posting consolidated CI failure analysis to GitHub and Slack.
 * Called by the FailureAggregator when aggregation is ready.
 */

import { createLogger, ExternalServiceError } from "@kenchi/shared";
import type {
  AggregatedFailures,
  ConsolidatedPostResult,
} from "./types.js";
import {
  buildConsolidatedPRComment,
  buildConsolidatedSlackPayload,
  buildConsolidatedCheckAnnotations,
  buildConsolidatedCheckSummary,
} from "../../formatters/consolidatedFormatter.js";
import {
  postPRComment,
  createCheckRunWithAnnotations,
} from "../githubService.js";

const logger = createLogger("github-app");

/**
 * Service URLs for CI failure processing
 */
const SLACK_URL = process.env.SLACK_URL || "http://slack-bot:3001/slack/message";

/**
 * Post consolidated analysis to a single PR
 */
const postToPR = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commentBody: string
): Promise<boolean> => {
  try {
    await postPRComment(installationId, owner, repo, prNumber, commentBody);
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
 * Post consolidated analysis to GitHub (PR comments and check annotations)
 */
const postToGitHub = async (
  aggregation: AggregatedFailures
): Promise<{ prCommentsPosted: number; checkAnnotationsCreated: boolean; errors: string[] }> => {
  const { repository, installationId, pullRequestNumbers, commitSha } = aggregation;
  const errors: string[] = [];
  let prCommentsPosted = 0;
  let checkAnnotationsCreated = false;

  const owner = repository.owner;
  const repo = repository.name;

  // Build consolidated PR comment
  const commentBody = buildConsolidatedPRComment(aggregation);

  // Post to all PRs in parallel
  if (pullRequestNumbers.length > 0) {
    const results = await Promise.all(
      pullRequestNumbers.map((prNumber) =>
        postToPR(installationId, owner, repo, prNumber, commentBody)
      )
    );

    prCommentsPosted = results.filter(Boolean).length;

    if (prCommentsPosted < pullRequestNumbers.length) {
      errors.push(
        `Failed to post to ${pullRequestNumbers.length - prCommentsPosted} PR(s)`
      );
    }

    logger.info("Posted consolidated PR comments", {
      repository: repository.fullName,
      totalPRs: pullRequestNumbers.length,
      successfulPosts: prCommentsPosted,
    });
  }

  // Create check run with consolidated annotations
  const annotations = buildConsolidatedCheckAnnotations(aggregation);
  if (annotations.length > 0) {
    try {
      const summary = buildConsolidatedCheckSummary(aggregation);

      await createCheckRunWithAnnotations(
        installationId,
        owner,
        repo,
        commitSha,
        "KenchiOps Analysis",
        summary,
        annotations
      );

      checkAnnotationsCreated = true;

      logger.info("Created consolidated check run with annotations", {
        repository: repository.fullName,
        annotationCount: annotations.length,
        failureCount: aggregation.failures.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to create check annotations: ${errorMsg}`);
      logger.error("Failed to create consolidated check annotations", {
        error: errorMsg,
      });
    }
  }

  return { prCommentsPosted, checkAnnotationsCreated, errors };
};

/**
 * Post consolidated analysis to Slack
 */
const postToSlack = async (
  aggregation: AggregatedFailures
): Promise<{ success: boolean; error?: string }> => {
  const slackPayload = buildConsolidatedSlackPayload(aggregation);

  try {
    const response = await fetch(SLACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consolidated: true,
        payload: slackPayload,
        repository: aggregation.repository.fullName,
        installation_id: aggregation.installationId,
        commit_sha: aggregation.commitSha,
        failure_count: aggregation.failures.length,
      }),
    });

    if (!response.ok) {
      throw new ExternalServiceError("Slack", `Slack service returned ${response.status}`);
    }

    logger.info("Posted consolidated Slack message", {
      repository: aggregation.repository.fullName,
      failureCount: aggregation.failures.length,
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
