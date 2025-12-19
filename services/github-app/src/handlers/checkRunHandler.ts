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
} from "../services/githubService.js";

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
  });

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

    // TODO: Post comment to associated PR or create issue
    // This requires finding the associated PR from the check run

    return {
      handled: true,
      message: "Check run failure analyzed",
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
