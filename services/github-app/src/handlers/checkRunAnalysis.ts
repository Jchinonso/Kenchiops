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
  type PendingCheckRun,
  type PendingCheckContext,
  type AggregationKey,
} from "@kenchi/shared";
import { GITHUB_CHECK_CONCLUSIONS, type CheckRunWebhook } from "../types/githubTypes.js";

const logger = createLogger("github-app");

// ==================== Constants ====================

/**
 * Conclusions that should be skipped (not actual failures)
 */
export const SKIP_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.CANCELLED,
  GITHUB_CHECK_CONCLUSIONS.SKIPPED,
  GITHUB_CHECK_CONCLUSIONS.STALE,
]);

/**
 * Check names that are status/summary checks and should be skipped.
 * These checks aggregate other check results and have no actual failure logs.
 */
const STATUS_CHECK_PATTERNS: readonly RegExp[] = [
  /^ci[\s-_]?success$/i,
  /^ci[\s-_]?status$/i,
  /^all[\s-_]?checks/i,
  /^status[\s-_]?check/i,
  /^branch[\s-_]?protection/i,
  /^required[\s-_]?checks/i,
];

/**
 * Check if a check name is a status/summary check that should be skipped.
 */
const isStatusCheck = (checkName: string): boolean =>
  STATUS_CHECK_PATTERNS.some((pattern) => pattern.test(checkName));

// ==================== Helpers ====================

/**
 * Build aggregation key from webhook.
 */
const buildAggregationKey = (webhook: CheckRunWebhook): AggregationKey => ({
  repositoryFullName: webhook.repository.full_name,
  commitSha: webhook.check_run.head_sha,
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
  };
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
