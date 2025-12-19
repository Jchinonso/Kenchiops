/**
 * Pull Request Handler
 *
 * Handles GitHub pull request webhook events
 */

import { createLogger } from '@kenchi/shared';
import type { PullRequestWebhook } from '../types/githubTypes.js';
import { GITHUB_PR_ACTIONS } from '../types/githubTypes.js';
import {
  createEventFromPR,
  performAnalysis,
  postPRComment,
  formatAnalysisComment,
} from '../services/githubService.js';
import { appConfig } from '../config/appConfig.js';

const logger = createLogger('github-app');

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
 */
export const handlePullRequestOpened = async (
  webhook: PullRequestWebhook
): Promise<PRHandlerResult> => {
  const { pull_request, repository } = webhook;

  logger.info('PR opened', {
    title: pull_request.title,
    repository: repository.full_name,
    number: pull_request.number,
    author: pull_request.user.login,
  });

  // Get installation ID from webhook or config
  const installationId =
    webhook.installation?.id ?? appConfig.github.installationId;

  if (!installationId) {
    logger.warn('No installation ID available for PR', {
      repository: repository.full_name,
      prNumber: pull_request.number,
    });
    return {
      handled: false,
      message: 'No GitHub installation ID configured',
    };
  }

  try {
    // Create event and perform analysis
    const event = createEventFromPR(webhook);
    const result = await performAnalysis(event);

    // Only post comment if confidence is sufficient
    if (result.confidence.gatingDecision !== 'block') {
      const comment = formatAnalysisComment(result);
      await postPRComment(
        installationId,
        repository.owner.login,
        repository.name,
        pull_request.number,
        comment
      );

      return {
        handled: true,
        message: 'PR analyzed and comment posted',
        eventId: event.id,
      };
    }

    logger.info('Skipped posting comment due to low confidence', {
      eventId: event.id,
      confidence: result.confidence.finalScore,
      gating: result.confidence.gatingDecision,
    });

    return {
      handled: true,
      message: 'PR analyzed but comment skipped due to low confidence',
      eventId: event.id,
    };
  } catch (error) {
    logger.error('Error handling PR opened', {
      repository: repository.full_name,
      prNumber: pull_request.number,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      handled: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Handle pull request webhook
 */
export const handlePullRequest = async (
  webhook: PullRequestWebhook
): Promise<PRHandlerResult> => {
  const { action } = webhook;

  // Only handle opened PRs for now
  if (action === GITHUB_PR_ACTIONS.OPENED) {
    return handlePullRequestOpened(webhook);
  }

  logger.info('PR event not handled', {
    action,
    repository: webhook.repository.full_name,
    prNumber: webhook.pull_request.number,
  });

  return {
    handled: false,
    message: `Event action '${action}' not handled`,
  };
};
