/**
 * Check Run Handler
 *
 * Handles GitHub check run webhook events (CI failures).
 * Routes events to appropriate handlers for analysis or learning.
 *
 * This is a barrel export that re-exports from focused modules:
 * - checkRunAnalysis.ts: Context gathering, caching, and API analysis
 */

import { createLogger, getErrorMessage, KENCHI_BRANDING } from "@kenchi/shared";
import {
  GITHUB_CHECK_ACTIONS,
  GITHUB_CHECK_CONCLUSIONS,
  type CheckRunWebhook,
} from "../types/githubTypes.js";
import { handleCheckRunSuccess } from "./checkRunSuccessHandler.js";
import { processCIFailure } from "./checkRunAnalysis.js";

// Re-export analysis functions for consumers
export { processCIFailure, SKIP_CONCLUSIONS } from "./checkRunAnalysis.js";

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

// ==================== Constants ====================

/**
 * Conclusions that represent actual CI failures worth analyzing
 */
const FAILURE_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.FAILURE,
  GITHUB_CHECK_CONCLUSIONS.TIMED_OUT,
]);

// ==================== Helper Functions ====================

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
 * Check if this is a successful check run we should capture knowledge from.
 */
const isSuccessfulCheckRun = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;

  // Skip our own check runs
  if (check_run.name === KENCHI_BRANDING.CHECK_RUN_NAME) {
    return false;
  }

  return (
    action === GITHUB_CHECK_ACTIONS.COMPLETED &&
    check_run.conclusion === GITHUB_CHECK_CONCLUSIONS.SUCCESS
  );
};

/**
 * Process successful check run for passive learning (fire and forget).
 */
const processSuccessForLearning = async (webhook: CheckRunWebhook): Promise<void> => {
  try {
    await handleCheckRunSuccess(webhook);
  } catch (error) {
    logger.warn("Failed to capture fix knowledge from successful check", {
      error: getErrorMessage(error),
      repository: webhook.repository.full_name,
      checkName: webhook.check_run.name,
    });
  }
};

// ==================== Handler Functions ====================

/**
 * Handle check run completed with failure.
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
 * Handle check run webhook.
 * Routes to failure analysis or success learning handlers.
 */
export const handleCheckRun = async (webhook: CheckRunWebhook): Promise<CheckRunHandlerResult> => {
  // Process failures for analysis
  if (shouldProcessCheckRun(webhook)) {
    return handleCheckRunFailure(webhook);
  }

  // Process successes for passive learning (fire and forget)
  if (isSuccessfulCheckRun(webhook)) {
    void processSuccessForLearning(webhook);

    return {
      handled: true,
      message: "Success event queued for passive learning",
    };
  }

  logger.info("Check run event skipped", {
    action: webhook.action,
    conclusion: webhook.check_run.conclusion,
    repository: webhook.repository.full_name,
  });

  return {
    handled: false,
    message: "Check run event skipped (not a failure or success)",
  };
};
