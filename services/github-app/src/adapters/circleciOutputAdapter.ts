/**
 * CircleCI Output Adapter
 *
 * Implements CIOutputPort for CircleCI.
 * CircleCI does not support posting comments back to builds natively,
 * so this adapter posts results via Slack notifications only.
 * PR comments are handled by the platform adapter (GitHub/GitLab/Bitbucket).
 *
 * @module adapters/circleciOutputAdapter
 */

import {
  createLogger,
  getErrorMessage,
  isRedisHealthy,
  enqueueConsolidatedNotification,
  type CIOutputPort,
  type AggregatedFailures,
  type ConsolidatedPostResult,
  type RequestContext,
} from "@kenchi/shared";
import { buildConsolidatedSlackPayload } from "../services/formatters/slackPayloadFormatter.js";

const logger = createLogger("circleci-output");

// ==================== Slack Notification ====================

/**
 * Best-effort Slack notification via the shared queue.
 * Returns true if the notification was enqueued, false otherwise.
 */
const sendSlackNotification = async (
  aggregation: AggregatedFailures,
  context: RequestContext
): Promise<boolean> => {
  try {
    const redisHealthy = await isRedisHealthy();
    if (!redisHealthy) {
      logger.warn("Redis unavailable, skipping Slack notification for CircleCI", {
        provider: "circleci",
        operation: "sendSlackNotification",
        ...context,
      });
      return false;
    }

    const slackPayload = buildConsolidatedSlackPayload(aggregation);
    await enqueueConsolidatedNotification(aggregation, slackPayload);
    return true;
  } catch (error) {
    logger.warn("Failed to enqueue Slack notification for CircleCI", {
      provider: "circleci",
      operation: "sendSlackNotification",
      error: getErrorMessage(error),
      ...context,
    });
    return false;
  }
};

// ==================== Adapter Factory ====================

/**
 * Create a CircleCI output adapter.
 *
 * CircleCI does not have a native comment/annotation mechanism for builds,
 * so this adapter only sends Slack notifications. PR comments are posted
 * by the platform adapter (GitHub, GitLab) when the repository is connected.
 */
export const createCircleCIOutputAdapter = (): CIOutputPort => ({
  postAnalysisResults: async (
    aggregation: AggregatedFailures,
    context: RequestContext
  ): Promise<ConsolidatedPostResult> => {
    const startTime = Date.now();

    // CircleCI has no native annotation/comment mechanism -- only Slack
    const slackMessageSent = await sendSlackNotification(aggregation, context);

    const durationMs = Date.now() - startTime;
    logger.info("CircleCI output completed", {
      provider: "circleci",
      operation: "postAnalysisResults",
      durationMs,
      slackMessageSent,
      failureCount: aggregation.failures.length,
      ...context,
    });

    return {
      success: slackMessageSent,
      prCommentsPosted: 0,
      slackMessageSent,
      checkAnnotationsCreated: false,
      errors: slackMessageSent ? [] : ["Slack notification failed or unavailable"],
    };
  },
});
