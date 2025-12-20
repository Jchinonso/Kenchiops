/**
 * Pull Request Handler
 *
 * Handles GitHub pull request webhook events
 */

import { createLogger } from "@kenchi/shared";
import type { PullRequestWebhook } from "../types/githubTypes.js";
import { GITHUB_PR_ACTIONS } from "../types/githubTypes.js";

const logger = createLogger("github-app");

/**
 * Result of handling a PR webhook
 */
export interface PRHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
}

/**
 * Handle pull request opened event
 *
 * NOTE: PR opened comments are DISABLED.
 * We only post comments for CI failures (handled by checkRunHandler).
 * This prevents spam when PRs are opened and lets users focus on actual CI issues.
 */
export const handlePullRequestOpened = async (
  webhook: PullRequestWebhook
): Promise<PRHandlerResult> => {
  const { pull_request, repository } = webhook;

  // Just log the PR opened event - don't post a comment
  // CI failure analysis is handled separately by checkRunHandler
  logger.info("PR opened (no comment posted - waiting for CI results)", {
    title: pull_request.title,
    repository: repository.full_name,
    number: pull_request.number,
    author: pull_request.user.login,
  });

  return {
    handled: true,
    message: "PR opened event logged (comment will be posted if CI fails)",
  };
};

/**
 * Handle pull request webhook
 */
export const handlePullRequest = async (webhook: PullRequestWebhook): Promise<PRHandlerResult> => {
  const { action } = webhook;

  // Only handle opened PRs for now
  if (action === GITHUB_PR_ACTIONS.OPENED) {
    return handlePullRequestOpened(webhook);
  }

  logger.info("PR event not handled", {
    action,
    repository: webhook.repository.full_name,
    prNumber: webhook.pull_request.number,
  });

  return {
    handled: false,
    message: `Event action '${action}' not handled`,
  };
};
