/**
 * Check Run Analysis Functions
 *
 * Entry point for CI failure analysis. Routes to simplified pipeline.
 * Posts results to GitHub PR comments and Slack.
 */

import { createLogger, config, resilientPost, getErrorMessage } from "@kenchi/shared";
import { GITHUB_CHECK_CONCLUSIONS, type CheckRunWebhook } from "../types/githubTypes.js";
import { processSimplifiedAnalysis, type SimplifiedAnalysisResult } from "./simplifiedAnalysis.js";
import { postPRComment } from "../services/githubComments.js";

const logger = createLogger("github-app");

// ==================== Constants ====================

/**
 * Conclusions that should be skipped (not actual failures)
 */
export const SKIP_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.CANCELLED,
  GITHUB_CHECK_CONCLUSIONS.SKIPPED,
  GITHUB_CHECK_CONCLUSIONS.STALE,
]);

// ==================== Posting Functions ====================

/**
 * Post analysis result to GitHub PR comment.
 */
const postToGitHub = async (
  webhook: CheckRunWebhook,
  result: SimplifiedAnalysisResult
): Promise<boolean> => {
  const { check_run, repository, installation } = webhook;
  const prNumber = check_run.pull_requests[0]?.number;

  if (!prNumber) {
    logger.info("No PR associated with check run, skipping GitHub comment", {
      repository: repository.full_name,
      checkName: check_run.name,
    });
    return true;
  }

  if (!installation?.id) {
    logger.warn("No installation ID, cannot post GitHub comment", {
      repository: repository.full_name,
    });
    return false;
  }

  if (!result.githubComment?.body) {
    logger.warn("No GitHub comment body generated", {
      repository: repository.full_name,
    });
    return false;
  }

  try {
    await postPRComment(
      installation.id,
      repository.owner.login,
      repository.name,
      prNumber,
      result.githubComment.body,
      true // Delete old KenchiOps comments
    );

    logger.info("Posted CI failure analysis to GitHub PR", {
      repository: repository.full_name,
      prNumber,
      checkName: check_run.name,
    });

    return true;
  } catch (error) {
    logger.error("Failed to post GitHub comment", {
      error: getErrorMessage(error),
      repository: repository.full_name,
      prNumber,
    });
    return false;
  }
};

/**
 * Post analysis result to Slack.
 */
const postToSlack = async (
  webhook: CheckRunWebhook,
  result: SimplifiedAnalysisResult
): Promise<boolean> => {
  const { repository } = webhook;

  if (!result.slackMessage) {
    logger.warn("No Slack message generated", {
      repository: repository.full_name,
    });
    return false;
  }

  try {
    const slackUrl = `${config.SLACK_BOT_URL}/slack/message`;

    await resilientPost<{ success: boolean }>(slackUrl, {
      type: "ci_failure",
      payload: result.slackMessage,
    });

    logger.info("Posted CI failure analysis to Slack", {
      repository: repository.full_name,
    });

    return true;
  } catch (error) {
    logger.error("Failed to post Slack message", {
      error: getErrorMessage(error),
      repository: repository.full_name,
    });
    return false;
  }
};

// ==================== Main Handler ====================

/**
 * Process CI failure using simplified analysis pipeline.
 * Posts results to GitHub and Slack.
 *
 * @param webhook - The check run webhook payload
 * @returns true if failure was successfully processed
 */
export const processCIFailure = async (webhook: CheckRunWebhook): Promise<boolean> => {
  const { check_run, repository } = webhook;

  logger.info("Processing CI failure with simplified pipeline", {
    repository: repository.full_name,
    checkName: check_run.name,
    headSha: check_run.head_sha.substring(0, 7),
  });

  const result = await processSimplifiedAnalysis(webhook);

  if (!result.success) {
    logger.warn("Simplified analysis failed", {
      repository: repository.full_name,
      checkName: check_run.name,
      error: result.error,
    });
    return false;
  }

  // Post to GitHub and Slack in parallel
  const [githubSuccess, slackSuccess] = await Promise.all([
    postToGitHub(webhook, result),
    postToSlack(webhook, result),
  ]);

  logger.info("CI failure analysis posted", {
    repository: repository.full_name,
    checkName: check_run.name,
    githubSuccess,
    slackSuccess,
    confidence: result.analysis?.confidence,
  });

  return githubSuccess || slackSuccess;
};
