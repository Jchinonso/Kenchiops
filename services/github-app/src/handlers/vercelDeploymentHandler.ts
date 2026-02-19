/**
 * Vercel Deployment Handler
 *
 * Processes Vercel deployment failure webhooks (deployment.error, deployment.canceled).
 * Adds failures to the pending aggregation in Redis, following the same pattern
 * as checkRunAnalysis.ts for GitHub Actions.
 *
 * @module handlers/vercelDeploymentHandler
 */

import {
  createLogger,
  getErrorMessage,
  addPendingCheckToRedis,
  createEvent,
  publish,
  CI_PROVIDERS,
  VERCEL_FAILURE_EVENTS,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  type PendingCheckRun,
  type PendingCheckContext,
  type AggregationKey,
} from "@kenchi/shared";
import type { VercelWebhook } from "../types/vercelTypes.js";
import type { WebhookHandlerResult } from "../routes/webhookRoutesTypes.js";
import {
  extractGitContext,
  mapVercelConclusion,
  type VercelGitContext,
} from "../helpers/vercelHelpers.js";

const logger = createLogger("github-app");

// ==================== Helpers ====================

/**
 * Build aggregation key from git context.
 * Includes provider to prevent cross-provider key collisions.
 */
const buildAggregationKey = (git: VercelGitContext): AggregationKey => ({
  repositoryFullName: `${git.owner}/${git.repo}`,
  commitSha: git.commitSha,
  provider: CI_PROVIDERS.VERCEL,
});

/**
 * Build pending check from Vercel webhook.
 */
const buildPendingCheck = (webhook: VercelWebhook): PendingCheckRun => ({
  checkRunId: 0,
  checkName: `vercel-${webhook.payload.deployment.name}`,
  conclusion: mapVercelConclusion(webhook.type),
  timestamp: new Date(webhook.createdAt),
});

/**
 * Build pending check context from git context.
 */
const buildPendingCheckContext = (git: VercelGitContext): PendingCheckContext => ({
  repositoryInfo: {
    owner: git.owner,
    name: git.repo,
    fullName: `${git.owner}/${git.repo}`,
  },
  installationId: 0,
  pullRequestNumbers: git.prNumber !== undefined ? [git.prNumber] : [],
  provider: CI_PROVIDERS.VERCEL,
});

// ==================== Event Persistence & Notification ====================

/**
 * Persist a Vercel deployment failure event to the database and publish
 * a dashboard notification via Redis pub/sub. Both operations are best-effort
 * and must not block the aggregation pipeline.
 */
const persistEventAndNotify = async (
  webhook: VercelWebhook,
  git: VercelGitContext
): Promise<void> => {
  const { deployment } = webhook.payload;
  const repoFullName = `${git.owner}/${git.repo}`;
  const checkName = `vercel-${deployment.name}`;
  const conclusion = mapVercelConclusion(webhook.type);

  try {
    await createEvent({
      type: EVENT_TYPES.CICD_FAILURE,
      source: EVENT_SOURCES.GITHUB_APP,
      severity: EVENT_SEVERITY.HIGH,
      timestamp: new Date(webhook.createdAt).toISOString(),
      payload: {
        repository: repoFullName,
        checkName,
        conclusion,
        headSha: git.commitSha,
        checkRunId: 0,
        pullRequestCount: git.prNumber !== undefined ? 1 : 0,
        provider: CI_PROVIDERS.VERCEL,
      },
      metadata: {
        owner: git.owner,
        repo: git.repo,
        vercelDeploymentId: deployment.id,
        vercelProjectId: webhook.payload.project.id,
      },
      tenantId: null,
    });

    await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.NEW_FAILURE, {
      tenantId: null,
      repository: repoFullName,
      checkName,
      commitSha: git.commitSha,
      provider: CI_PROVIDERS.VERCEL,
    });
  } catch (error) {
    logger.warn("Failed to persist Vercel event or publish notification", {
      error: getErrorMessage(error),
      deploymentId: deployment.id,
    });
  }
};

// ==================== Main Handler ====================

/**
 * Process a Vercel deployment failure webhook.
 *
 * @param webhook - The Vercel webhook payload
 * @returns Handler result indicating whether the event was processed
 */
export const handleVercelDeployment = async (
  webhook: VercelWebhook
): Promise<WebhookHandlerResult> => {
  const { deployment } = webhook.payload;

  if (!VERCEL_FAILURE_EVENTS.has(webhook.type)) {
    return {
      handled: false,
      message: `Vercel event type '${webhook.type}' not a failure — skipped`,
    };
  }

  const git = extractGitContext(deployment.meta);

  if (!git.commitSha || !git.owner || !git.repo) {
    logger.warn("Vercel deployment missing git context, cannot aggregate", {
      deploymentId: deployment.id,
      deploymentName: deployment.name,
      hasCommitSha: !!git.commitSha,
      hasOwner: !!git.owner,
      hasRepo: !!git.repo,
    });
    return {
      handled: false,
      message: "Deployment missing git context (no commit SHA or repo info)",
    };
  }

  logger.info("Adding Vercel deployment failure to pending aggregation", {
    deploymentId: deployment.id,
    deploymentName: deployment.name,
    commitSha: git.commitSha.substring(0, 7),
    repository: `${git.owner}/${git.repo}`,
  });

  try {
    const aggregationKey = buildAggregationKey(git);
    const pendingCheck = buildPendingCheck(webhook);
    const context = buildPendingCheckContext(git);

    await addPendingCheckToRedis(aggregationKey, pendingCheck, context);

    logger.info("Vercel deployment failure added to pending aggregation", {
      deploymentId: deployment.id,
      repository: aggregationKey.repositoryFullName,
    });

    // Persist event to DB and publish to dashboard SSE (fire-and-forget)
    void persistEventAndNotify(webhook, git);

    return {
      handled: true,
      message: "Vercel deployment failure added to aggregation",
      eventId: deployment.id,
    };
  } catch (error) {
    logger.error("Failed to add Vercel failure to aggregation", {
      error: getErrorMessage(error),
      deploymentId: deployment.id,
    });
    return {
      handled: true,
      message: "Failed to process Vercel deployment failure",
    };
  }
};
