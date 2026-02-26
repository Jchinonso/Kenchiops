/**
 * Pre-defined Queue Instances
 *
 * Centralizes all singleton queue instances used across the application.
 * Separated from messageQueue.ts to avoid circular dependencies
 * (fairScheduler.ts imports createQueue from messageQueue.ts).
 *
 * @module queue/queueInstances
 */

import { createQueue } from "./messageQueue.js";
import { createFairQueue } from "./fairScheduler.js";
import { QUEUE_NAMES, QUEUE_RETRY_CONFIG, QUEUE_VISIBILITY_TIMEOUT } from "../constants/index.js";

/**
 * Queue for CI analysis jobs (async processing).
 * Uses fair scheduling with per-tenant sub-queues to prevent tenant starvation.
 */
export const ciAnalysisQueue = createFairQueue({
  name: QUEUE_NAMES.CI_ANALYSIS,
  maxRetries: QUEUE_RETRY_CONFIG.CI_ANALYSIS,
  deadLetterQueue: `${QUEUE_NAMES.CI_ANALYSIS}:dlq`,
});

/**
 * Queue for Slack notification jobs
 */
export const slackNotificationQueue = createQueue({
  name: QUEUE_NAMES.SLACK_NOTIFICATIONS,
  maxRetries: QUEUE_RETRY_CONFIG.SLACK_NOTIFICATION,
  visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.SLACK_NOTIFICATION,
});

/**
 * Queue for GitHub action jobs (rerun pipeline, post comment, etc.)
 */
export const githubActionQueue = createQueue({
  name: QUEUE_NAMES.GITHUB_ACTIONS,
  maxRetries: QUEUE_RETRY_CONFIG.GITHUB_ACTION,
  visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.GITHUB_ACTION,
});
