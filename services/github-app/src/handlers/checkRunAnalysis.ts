/**
 * Check Run Analysis Functions
 *
 * Entry point for CI failure handling. Collects pending check info
 * for aggregation. Analysis is deferred until all checks are collected.
 */

import {
  createLogger,
  getErrorMessage,
  addPendingCheckToRedis,
  createEvent,
  publish,
  findTenantByGitHubInstallation,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  CI_PROVIDERS,
  type PendingCheckRun,
  type PendingCheckContext,
  type AggregationKey,
} from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { isStatusCheck } from "../helpers/githubCheckFilters.js";

const logger = createLogger("github-app");

// ==================== Helpers ====================

/**
 * Build aggregation key from webhook.
 */
const buildAggregationKey = (webhook: CheckRunWebhook): AggregationKey => ({
  repositoryFullName: webhook.repository.full_name,
  commitSha: webhook.check_run.head_sha,
  provider: CI_PROVIDERS.GITHUB_ACTIONS,
});

/**
 * Build pending check from webhook.
 */
const buildPendingCheck = (webhook: CheckRunWebhook): PendingCheckRun => ({
  checkRunId: webhook.check_run.id,
  checkName: webhook.check_run.name,
  conclusion: webhook.check_run.conclusion || "failure",
  timestamp: new Date(),
});

/**
 * Build pending check context from webhook.
 */
const buildPendingCheckContext = (webhook: CheckRunWebhook): PendingCheckContext => {
  const { repository, installation, check_run } = webhook;

  return {
    repositoryInfo: {
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name,
    },
    installationId: installation?.id ?? 0,
    pullRequestNumbers: check_run.pull_requests.map((pr) => pr.number),
    provider: CI_PROVIDERS.GITHUB_ACTIONS,
  };
};

// ==================== Event Persistence & Notification ====================

/**
 * Persist a CI failure event to the database and publish a dashboard
 * notification via Redis pub/sub. Both operations are best-effort and
 * must not block the aggregation pipeline.
 */
const persistEventAndNotify = async (webhook: CheckRunWebhook): Promise<void> => {
  const { check_run, repository, installation } = webhook;
  const installationId = installation?.id ?? 0;

  try {
    // Look up tenant for event scoping
    const tenant = installationId > 0 ? await findTenantByGitHubInstallation(installationId) : null;
    const tenantId = tenant?.id ?? null;

    await createEvent({
      type: EVENT_TYPES.CICD_FAILURE,
      source: EVENT_SOURCES.GITHUB_APP,
      severity: EVENT_SEVERITY.HIGH,
      timestamp: new Date().toISOString(),
      payload: {
        repository: repository.full_name,
        checkName: check_run.name,
        conclusion: check_run.conclusion,
        headSha: check_run.head_sha,
        checkRunId: check_run.id,
        pullRequestCount: check_run.pull_requests.length,
        provider: CI_PROVIDERS.GITHUB_ACTIONS,
      },
      metadata: {
        owner: repository.owner.login,
        repo: repository.name,
        installationId,
      },
      tenantId,
    });

    // Publish to dashboard SSE channel
    await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.NEW_FAILURE, {
      tenantId,
      repository: repository.full_name,
      checkName: check_run.name,
      commitSha: check_run.head_sha,
      provider: CI_PROVIDERS.GITHUB_ACTIONS,
    });
  } catch (error) {
    logger.warn("Failed to persist event or publish dashboard notification", {
      error: getErrorMessage(error),
      repository: repository.full_name,
      checkName: check_run.name,
    });
  }
};

// ==================== Main Handler ====================

/**
 * Process CI failure by adding to pending aggregation.
 * Analysis is deferred until all checks for the commit are collected.
 *
 * @param webhook - The check run webhook payload
 * @returns true if check was successfully added to aggregation
 */
export const processCIFailure = async (webhook: CheckRunWebhook): Promise<boolean> => {
  const { check_run, repository } = webhook;

  // Skip status/summary checks that have no actual failure logs
  if (isStatusCheck(check_run.name)) {
    logger.info("Skipping status check (no actual failure logs)", {
      repository: repository.full_name,
      checkName: check_run.name,
    });
    return true;
  }

  logger.info("Adding CI failure to pending aggregation", {
    repository: repository.full_name,
    checkName: check_run.name,
    headSha: check_run.head_sha.substring(0, 7),
  });

  try {
    const aggregationKey = buildAggregationKey(webhook);
    const pendingCheck = buildPendingCheck(webhook);
    const context = buildPendingCheckContext(webhook);

    await addPendingCheckToRedis(aggregationKey, pendingCheck, context);

    logger.info("CI failure added to pending aggregation", {
      repository: repository.full_name,
      checkName: check_run.name,
      checkRunId: check_run.id,
    });

    // Persist event to DB and publish to dashboard SSE (fire-and-forget)
    void persistEventAndNotify(webhook);

    return true;
  } catch (error) {
    logger.error("Failed to add failure to pending aggregation", {
      error: getErrorMessage(error),
      repository: repository.full_name,
      checkName: check_run.name,
    });
    return false;
  }
};
