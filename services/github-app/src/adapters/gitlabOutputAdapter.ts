/**
 * GitLab CI Output Adapter
 *
 * Implements CIOutputPort for GitLab CI.
 * Posts analysis results as Merge Request notes (comments) via the GitLab REST API
 * and enqueues Slack notifications for team visibility.
 *
 * @module adapters/gitlabOutputAdapter
 */

import {
  createLogger,
  getErrorMessage,
  resilientPost,
  isRedisHealthy,
  enqueueConsolidatedNotification,
  findActiveByProvider,
  refreshGitLabTokenIfNeeded,
  type CIOutputPort,
  type AggregatedFailures,
  type ConsolidatedPostResult,
  type RequestContext,
} from "@kenchi/shared";
import { refreshGitLabToken } from "./gitlabTokenRefresh.js";
import { buildGitLabMRComment } from "../services/formatters/gitlabFormatter.js";
import { buildConsolidatedSlackPayload } from "../services/formatters/slackPayloadFormatter.js";

const logger = createLogger("gitlab-output");

const GITLAB_MR_NOTE_TIMEOUT_MS = 15_000;
const GITLAB_DEFAULT_BASE_URL = "https://gitlab.com";

// ==================== Token Resolution ====================

/**
 * Resolve a GitLab access token and base URL from provider connections.
 * Returns null if no active connection with an access token exists.
 */
const resolveGitLabConnection = async (
  context: RequestContext
): Promise<{ readonly accessToken: string; readonly baseUrl: string } | null> => {
  const connections = await findActiveByProvider("gitlab_ci");
  const connection = connections.find((conn) => conn.accessToken !== null);

  if (!connection?.accessToken) {
    logger.warn("No GitLab access token found in provider connections", {
      provider: "gitlab",
      operation: "resolveGitLabConnection",
      connectionCount: connections.length,
      ...context,
    });
    return null;
  }

  // Proactively refresh token if expiring soon (pass connection to avoid redundant DB lookup)
  const freshToken = await refreshGitLabTokenIfNeeded(
    connection.tenantId,
    refreshGitLabToken,
    context,
    connection
  );

  return {
    accessToken: freshToken ?? connection.accessToken,
    baseUrl: connection.baseUrl ?? GITLAB_DEFAULT_BASE_URL,
  };
};

// ==================== MR Note Posting ====================

/**
 * Post a single note (comment) to a GitLab Merge Request.
 * Returns true on success, false on failure.
 */
const postMRNote = async (
  baseUrl: string,
  projectPath: string,
  mrIid: number,
  body: string,
  accessToken: string,
  context: RequestContext
): Promise<boolean> => {
  const encodedPath = encodeURIComponent(projectPath);
  const url = `${baseUrl}/api/v4/projects/${encodedPath}/merge_requests/${mrIid}/notes`;
  const startTime = Date.now();

  try {
    const response = await resilientPost<unknown>(
      url,
      { body },
      {
        headers: { "PRIVATE-TOKEN": accessToken },
        timeout: GITLAB_MR_NOTE_TIMEOUT_MS,
      }
    );

    logger.info("Posted MR note", {
      provider: "gitlab",
      operation: "postMRNote",
      durationMs: response.duration,
      statusCode: response.status,
      mrIid,
      projectPath,
      ...context,
    });
    return true;
  } catch (error) {
    logger.error("Failed to post MR note", {
      provider: "gitlab",
      operation: "postMRNote",
      durationMs: Date.now() - startTime,
      mrIid,
      projectPath,
      error: getErrorMessage(error),
      ...context,
    });
    return false;
  }
};

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
      logger.warn("Redis unavailable, skipping Slack notification for GitLab", {
        provider: "gitlab",
        operation: "sendSlackNotification",
        ...context,
      });
      return false;
    }

    const slackPayload = buildConsolidatedSlackPayload(aggregation);
    await enqueueConsolidatedNotification(aggregation, slackPayload);
    return true;
  } catch (error) {
    logger.warn("Failed to enqueue Slack notification for GitLab", {
      provider: "gitlab",
      operation: "sendSlackNotification",
      error: getErrorMessage(error),
      ...context,
    });
    return false;
  }
};

// ==================== Adapter Factory ====================

/**
 * Create a GitLab output adapter that posts MR notes and Slack notifications.
 */
export const createGitLabOutputAdapter = (): CIOutputPort => ({
  postAnalysisResults: async (
    aggregation: AggregatedFailures,
    context: RequestContext
  ): Promise<ConsolidatedPostResult> => {
    const startTime = Date.now();
    const errors: string[] = [];
    const projectPath = aggregation.repository.fullName;

    // 1. Resolve GitLab access token
    const connection = await resolveGitLabConnection(context);

    if (!connection) {
      return {
        success: false,
        prCommentsPosted: 0,
        slackMessageSent: false,
        checkAnnotationsCreated: false,
        errors: ["No GitLab access token found in provider connections"],
      };
    }

    // 2. Build MR comment
    const commentBody = buildGitLabMRComment(aggregation);

    // 3. Post to each MR (sequential to avoid overwhelming the API)
    // let: counter incremented per successful MR post
    let prCommentsPosted = 0;
    for (const mrIid of aggregation.pullRequestNumbers) {
      const success = await postMRNote(
        connection.baseUrl,
        projectPath,
        mrIid,
        commentBody,
        connection.accessToken,
        context
      );
      if (success) {
        prCommentsPosted++;
      } else {
        errors.push(`Failed to post note to MR !${mrIid}`);
      }
    }

    // 4. Send Slack notification (best-effort, non-blocking)
    const slackMessageSent = await sendSlackNotification(aggregation, context);

    const durationMs = Date.now() - startTime;
    logger.info("GitLab output completed", {
      provider: "gitlab",
      operation: "postAnalysisResults",
      durationMs,
      prCommentsPosted,
      slackMessageSent,
      repository: projectPath,
      mrCount: aggregation.pullRequestNumbers.length,
      failureCount: aggregation.failures.length,
      ...context,
    });

    const success =
      (prCommentsPosted > 0 || aggregation.pullRequestNumbers.length === 0) && slackMessageSent;

    return {
      success,
      prCommentsPosted,
      slackMessageSent,
      checkAnnotationsCreated: false, // GitLab does not have check annotations
      errors,
    };
  },
});
