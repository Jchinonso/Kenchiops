/**
 * Aggregation Readiness Check
 *
 * Checks GitHub for in-progress check runs before allowing an aggregation
 * to be dequeued. This replaces long static debounce with an active check,
 * ensuring fast turnaround for simple repos while correctly waiting for
 * staggered check completions.
 *
 * @module services/aggregationReadiness
 */

import {
  createLogger,
  getErrorMessage,
  getRedisClient,
  withTimeout,
  REDIS_TIMEOUTS,
  AGGREGATION_KEYS,
  CI_PROVIDERS,
  type AggregationKey,
} from "@kenchi/shared";
import { getOctokit } from "./githubService.js";

const logger = createLogger("aggregation-readiness");

/**
 * Reads the installationId from Redis aggregation metadata.
 * Lightweight read of a single hash field instead of full aggregation data.
 */
const getInstallationIdFromRedis = async (key: AggregationKey): Promise<number | null> => {
  try {
    const redis = getRedisClient();
    const metadataKey = AGGREGATION_KEYS.metadata(key);
    const installationIdStr = await withTimeout(
      redis.hget(metadataKey, "installationId"),
      REDIS_TIMEOUTS.AGGREGATION_OPERATION_MS
    );

    return installationIdStr ? Number(installationIdStr) : null;
  } catch (error) {
    logger.warn("Failed to read installationId from Redis", {
      repository: key.repositoryFullName,
      commitSha: key.commitSha,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Pre-enqueue readiness check for the aggregation worker.
 *
 * Queries GitHub's check runs API to see if all checks for this commit
 * have completed. Returns false if any checks are still in_progress,
 * causing the aggregation to be deferred until the next poll.
 *
 * Fail-open: returns true on any error (network, auth, missing data)
 * so that aggregations are never permanently stuck.
 *
 * Note: background worker context — no HTTP RequestContext available.
 *
 * @param key - Aggregation key with repository and commit SHA
 * @returns true if all checks completed (or on error), false to defer
 */
export const checkAllRunsCompleted = async (key: AggregationKey): Promise<boolean> => {
  // Non-GitHub providers don't use GitHub check runs API -- always ready
  if (key.provider && key.provider !== CI_PROVIDERS.GITHUB_ACTIONS) {
    return true;
  }

  // Worker context: called from aggregator polling loop, no HTTP request context available
  const [owner, repo] = key.repositoryFullName.split("/");

  if (!owner || !repo) {
    return true;
  }

  const installationId = await getInstallationIdFromRedis(key);

  if (installationId === null) {
    // No installation ID — can't check GitHub, proceed with enqueue
    return true;
  }

  try {
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: key.commitSha,
      per_page: 100,
    });

    const inProgressCount = data.check_runs.filter((run) => run.status !== "completed").length;

    if (inProgressCount > 0) {
      logger.info("Deferring aggregation — checks still in progress", {
        repository: key.repositoryFullName,
        commitSha: key.commitSha.substring(0, 7),
        inProgressCount,
        totalCheckRuns: data.total_count,
      });
      return false;
    }

    logger.info("All checks completed, ready to enqueue", {
      repository: key.repositoryFullName,
      commitSha: key.commitSha.substring(0, 7),
      totalCheckRuns: data.total_count,
    });

    return true;
  } catch (error) {
    // Fail-open: proceed with enqueue on error
    logger.warn("GitHub check runs query failed, proceeding with enqueue", {
      repository: key.repositoryFullName,
      commitSha: key.commitSha.substring(0, 7),
      error: getErrorMessage(error),
    });
    return true;
  }
};
