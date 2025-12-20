/**
 * Check Run Handler
 *
 * Handles GitHub check run webhook events (CI failures)
 */

import { createLogger } from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";
import {
  createEventFromCheckRun,
  performAnalysis,
  formatAnalysisComment,
  postPRComment,
} from "../services/githubService.js";
import { appConfig } from "../config/appConfig.js";

const logger = createLogger("github-app");

/**
 * Result of handling a check run webhook
 */
export interface CheckRunHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
  readonly analysis?: string;
}

/**
 * Handle check run completed with failure
 */
export const handleCheckRunFailure = async (
  webhook: CheckRunWebhook
): Promise<CheckRunHandlerResult> => {
  const { check_run, repository } = webhook;

  logger.warn("CI check failed", {
    name: check_run.name,
    repository: repository.full_name,
    conclusion: check_run.conclusion,
    pullRequests: check_run.pull_requests.length,
  });

  // Get installation ID from webhook or config
  const installationId = webhook.installation?.id ?? appConfig.github.installationId;

  if (!installationId) {
    logger.warn("No installation ID available for check run", {
      repository: repository.full_name,
      checkName: check_run.name,
    });
    return {
      handled: false,
      message: "No GitHub installation ID configured",
    };
  }

  try {
    // Create event and perform analysis
    const event = createEventFromCheckRun(webhook);
    const result = await performAnalysis(event);

    // Format the analysis for logging/returning
    const analysisComment = formatAnalysisComment(result);

    logger.info("Check run failure analyzed", {
      eventId: event.id,
      confidence: result.confidence.finalScore,
      gating: result.confidence.gatingDecision,
    });

    // Only post comment if confidence is sufficient
    if (result.confidence.gatingDecision === "block") {
      logger.info("Skipped posting comment due to low confidence", {
        eventId: event.id,
        confidence: result.confidence.finalScore,
        gating: result.confidence.gatingDecision,
      });

      return {
        handled: true,
        message: "Check run analyzed but comment skipped due to low confidence",
        eventId: event.id,
        analysis: analysisComment,
      };
    }

    // Post comment to associated PRs (check runs can be linked to multiple PRs)
    const associatedPRs = check_run.pull_requests;
    let commentPosted = false;

    if (associatedPRs.length > 0) {
      for (const pr of associatedPRs) {
        try {
          await postPRComment(
            installationId,
            repository.owner.login,
            repository.name,
            pr.number,
            analysisComment
          );
          commentPosted = true;
          logger.info("Posted CI failure analysis to PR", {
            eventId: event.id,
            prNumber: pr.number,
            repository: repository.full_name,
          });
        } catch (commentError) {
          logger.error("Failed to post comment to PR", {
            prNumber: pr.number,
            error: commentError instanceof Error ? commentError.message : "Unknown error",
          });
        }
      }
    } else {
      logger.info("No associated PRs found for check run", {
        eventId: event.id,
        checkName: check_run.name,
        headSha: check_run.head_sha,
      });
    }

    return {
      handled: true,
      message: commentPosted
        ? "Check run failure analyzed and comment posted"
        : "Check run failure analyzed (no associated PRs)",
      eventId: event.id,
      analysis: analysisComment,
    };
  } catch (error) {
    logger.error("Error handling check run failure", {
      checkName: check_run.name,
      repository: repository.full_name,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      handled: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Check if the check run should be analyzed
 */
const shouldAnalyzeCheckRun = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;

  // Only analyze completed check runs
  if (action !== GITHUB_CHECK_ACTIONS.COMPLETED) {
    return false;
  }

  // Only analyze failures
  if (check_run.conclusion === GITHUB_CHECK_CONCLUSIONS.SUCCESS) {
    return false;
  }

  return true;
};

/**
 * Handle check run webhook
 */
export const handleCheckRun = async (webhook: CheckRunWebhook): Promise<CheckRunHandlerResult> => {
  if (!shouldAnalyzeCheckRun(webhook)) {
    logger.info("Check run event not analyzed", {
      action: webhook.action,
      conclusion: webhook.check_run.conclusion,
      repository: webhook.repository.full_name,
    });

    return {
      handled: false,
      message: "Check run event not analyzed (not a failure)",
    };
  }

  return handleCheckRunFailure(webhook);
};
