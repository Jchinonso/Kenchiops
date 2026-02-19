/**
 * Netlify Deployment Handler
 *
 * Processes Netlify deploy failure webhooks (state: "error").
 * Adds failures to the pending aggregation in Redis, following the same pattern
 * as checkRunAnalysis.ts for GitHub Actions.
 *
 * @module handlers/netlifyDeploymentHandler
 */

import {
  createLogger,
  getErrorMessage,
  addPendingCheckToRedis,
  createEvent,
  publish,
  CI_PROVIDERS,
  NETLIFY_FAILURE_STATES,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  type PendingCheckRun,
  type PendingCheckContext,
  type AggregationKey,
} from "@kenchi/shared";
import type { NetlifyDeployPayload } from "../types/netlifyTypes.js";
import type { WebhookHandlerResult } from "../routes/webhookRoutesTypes.js";
import {
  extractGitContext,
  mapNetlifyConclusion,
  type NetlifyGitContext,
} from "../helpers/netlifyHelpers.js";

const logger = createLogger("github-app");

// ==================== Helpers ====================

/**
 * Build aggregation key from git context.
 * Includes provider to prevent cross-provider key collisions.
 */
const buildAggregationKey = (git: NetlifyGitContext): AggregationKey => ({
  repositoryFullName: `${git.owner}/${git.repo}`,
  commitSha: git.commitSha,
  provider: CI_PROVIDERS.NETLIFY,
});

/**
 * Build pending check from Netlify deploy payload.
 */
const buildPendingCheck = (payload: NetlifyDeployPayload): PendingCheckRun => ({
  checkRunId: 0,
  checkName: `netlify-${payload.name}`,
  conclusion: mapNetlifyConclusion(payload.state),
  timestamp: new Date(payload.created_at),
});

/**
 * Build pending check context from git context.
 */
const buildPendingCheckContext = (git: NetlifyGitContext): PendingCheckContext => ({
  repositoryInfo: {
    owner: git.owner,
    name: git.repo,
    fullName: `${git.owner}/${git.repo}`,
  },
  installationId: 0,
  pullRequestNumbers: git.prNumber !== undefined ? [git.prNumber] : [],
  provider: CI_PROVIDERS.NETLIFY,
});

// ==================== Event Persistence & Notification ====================

/**
 * Persist a Netlify deploy failure event to the database and publish
 * a dashboard notification via Redis pub/sub. Both operations are best-effort
 * and must not block the aggregation pipeline.
 */
const persistEventAndNotify = async (
  payload: NetlifyDeployPayload,
  git: NetlifyGitContext
): Promise<void> => {
  const repoFullName = `${git.owner}/${git.repo}`;
  const checkName = `netlify-${payload.name}`;
  const conclusion = mapNetlifyConclusion(payload.state);

  try {
    await createEvent({
      type: EVENT_TYPES.CICD_FAILURE,
      source: EVENT_SOURCES.GITHUB_APP,
      severity: EVENT_SEVERITY.HIGH,
      timestamp: new Date(payload.created_at).toISOString(),
      payload: {
        repository: repoFullName,
        checkName,
        conclusion,
        headSha: git.commitSha,
        checkRunId: 0,
        pullRequestCount: git.prNumber !== undefined ? 1 : 0,
        provider: CI_PROVIDERS.NETLIFY,
      },
      metadata: {
        owner: git.owner,
        repo: git.repo,
        netlifySiteId: payload.site_id,
        netlifyBuildId: payload.build_id,
      },
      tenantId: null,
    });

    await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.NEW_FAILURE, {
      tenantId: null,
      repository: repoFullName,
      checkName,
      commitSha: git.commitSha,
      provider: CI_PROVIDERS.NETLIFY,
    });
  } catch (error) {
    logger.warn("Failed to persist Netlify event or publish notification", {
      error: getErrorMessage(error),
      deployId: payload.id,
    });
  }
};

// ==================== Main Handler ====================

/**
 * Process a Netlify deploy failure webhook.
 *
 * @param payload - The Netlify deploy payload (flat, no envelope)
 * @returns Handler result indicating whether the event was processed
 */
export const handleNetlifyDeployment = async (
  payload: NetlifyDeployPayload
): Promise<WebhookHandlerResult> => {
  if (!NETLIFY_FAILURE_STATES.has(payload.state)) {
    return {
      handled: false,
      message: `Netlify deploy state '${payload.state}' not a failure -- skipped`,
    };
  }

  const git = extractGitContext(payload);

  if (!git.commitSha || !git.owner || !git.repo) {
    logger.warn("Netlify deploy missing git context, cannot aggregate", {
      deployId: payload.id,
      deployName: payload.name,
      hasCommitSha: !!git.commitSha,
      hasOwner: !!git.owner,
      hasRepo: !!git.repo,
    });
    return {
      handled: false,
      message: "Deploy missing git context (no commit SHA or repo info)",
    };
  }

  logger.info("Adding Netlify deploy failure to pending aggregation", {
    deployId: payload.id,
    deployName: payload.name,
    commitSha: git.commitSha.substring(0, 7),
    repository: `${git.owner}/${git.repo}`,
  });

  try {
    const aggregationKey = buildAggregationKey(git);
    const pendingCheck = buildPendingCheck(payload);
    const checkContext = buildPendingCheckContext(git);

    await addPendingCheckToRedis(aggregationKey, pendingCheck, checkContext);

    logger.info("Netlify deploy failure added to pending aggregation", {
      deployId: payload.id,
      repository: aggregationKey.repositoryFullName,
    });

    // Persist event to DB and publish to dashboard SSE (fire-and-forget)
    void persistEventAndNotify(payload, git);

    return {
      handled: true,
      message: "Netlify deploy failure added to aggregation",
      eventId: payload.id,
    };
  } catch (error) {
    logger.error("Failed to add Netlify failure to aggregation", {
      error: getErrorMessage(error),
      deployId: payload.id,
    });
    return {
      handled: true,
      message: "Failed to process Netlify deploy failure",
    };
  }
};
