/**
 * Aggregation Enqueuer
 *
 * Handles enqueueing ready aggregations for processing via the message queue.
 * Supports both pre-analyzed aggregations (legacy) and pending aggregations
 * that need combined analysis (new flow).
 *
 * @module aggregation/aggregationEnqueuer
 */

import { ciAnalysisQueue } from "../queue/queueInstances.js";
import { createLogger, getErrorMessage } from "../core/index.js";
import { findTenantByGitHubInstallation } from "../database/providerConnection/repository.js";
import type {
  AggregationKey,
  PendingCheckRun,
  SerializedPendingCheckRun,
  PendingAggregationPayload,
} from "./types.js";
import { getAggregationFromRedis, getPendingAggregationFromRedis } from "./aggregatorRead.js";
import { deleteAggregationFromRedis } from "./redisAggregator.js";
import { formatShaForDisplay } from "./aggregatorHelpers.js";

const logger = createLogger("aggregation-enqueuer");

// ==================== Helpers ====================

/** Builds log context for aggregation key. */
const buildLogContext = (key: AggregationKey): { repository: string; commitSha: string } => ({
  repository: key.repositoryFullName,
  commitSha: formatShaForDisplay(key.commitSha),
});

/**
 * Resolves an installationId to a tenantId for fair scheduling.
 * Returns null if the tenant cannot be resolved (job will fall back to FIFO).
 */
const resolveTenantId = async (installationId: number): Promise<string | null> => {
  try {
    const tenant = await findTenantByGitHubInstallation(installationId);
    return tenant?.id ?? null;
  } catch (error) {
    logger.warn("Failed to resolve tenant for fair scheduling, falling back to FIFO", {
      installationId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Enqueues a job using fair scheduling if a tenantId can be resolved,
 * otherwise falls back to base FIFO queue.
 */
const enqueueWithFairScheduling = async (
  type: string,
  payload: unknown,
  installationId: number,
  logContext: { readonly repository: string; readonly commitSha: string }
): Promise<string> => {
  const tenantId = await resolveTenantId(installationId);

  if (tenantId) {
    logger.debug("Using fair scheduling for enqueue", {
      ...logContext,
      tenantId,
      installationId,
    });
    return ciAnalysisQueue.enqueueFair(type, payload, tenantId);
  }

  logger.debug("No tenant resolved, using FIFO enqueue", {
    ...logContext,
    installationId,
  });
  return ciAnalysisQueue.enqueue(type, payload);
};

// ==================== Serialization ====================

/** Serializes a pending check for queue payload. */
const serializePendingCheckForPayload = (
  pendingCheck: PendingCheckRun
): SerializedPendingCheckRun => ({
  checkRunId: pendingCheck.checkRunId,
  checkName: pendingCheck.checkName,
  conclusion: pendingCheck.conclusion,
  timestamp: pendingCheck.timestamp.toISOString(),
});

// ==================== Enqueue Operations ====================

/** Enqueue a ready aggregation for processing. */
export const enqueueAggregation = async (key: AggregationKey): Promise<string | null> => {
  const logContext = buildLogContext(key);

  try {
    const aggregation = await getAggregationFromRedis(key);

    if (!aggregation || aggregation.failures.length === 0) {
      logger.warn("No aggregation data to enqueue", logContext);
      await deleteAggregationFromRedis(key);
      return null;
    }

    const payload = {
      aggregation: {
        ...aggregation,
        failures: aggregation.failures.map((failure) => ({
          ...failure,
          timestamp: failure.timestamp.toISOString(),
        })),
        firstFailureAt: aggregation.firstFailureAt.toISOString(),
        lastFailureAt: aggregation.lastFailureAt.toISOString(),
        provider: aggregation.provider ?? key.provider,
      },
    };

    const messageId = await enqueueWithFairScheduling(
      "consolidated_analysis",
      payload,
      aggregation.installationId,
      logContext
    );

    await deleteAggregationFromRedis(key);

    logger.info("Aggregation enqueued for processing", {
      ...logContext,
      messageId,
      failureCount: aggregation.failures.length,
    });

    return messageId;
  } catch (error) {
    logger.error("Failed to enqueue aggregation", {
      ...logContext,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/** Enqueue a pending aggregation for combined analysis. */
export const enqueuePendingAggregation = async (key: AggregationKey): Promise<string | null> => {
  const logContext = buildLogContext(key);

  try {
    const pendingAgg = await getPendingAggregationFromRedis(key);

    if (!pendingAgg || pendingAgg.pendingChecks.length === 0) {
      logger.warn("No pending aggregation data to enqueue", logContext);
      await deleteAggregationFromRedis(key);
      return null;
    }

    const payload: PendingAggregationPayload = {
      pendingAggregation: {
        commitSha: pendingAgg.commitSha,
        repository: pendingAgg.repository,
        installationId: pendingAgg.installationId,
        pullRequestNumbers: [...pendingAgg.pullRequestNumbers],
        pendingChecks: pendingAgg.pendingChecks.map(serializePendingCheckForPayload),
        firstFailureAt: pendingAgg.firstFailureAt.toISOString(),
        lastFailureAt: pendingAgg.lastFailureAt.toISOString(),
        provider: pendingAgg.provider ?? key.provider,
      },
    };

    const messageId = await enqueueWithFairScheduling(
      "pending_analysis",
      payload,
      pendingAgg.installationId,
      logContext
    );

    await deleteAggregationFromRedis(key);

    logger.info("Pending aggregation enqueued for combined analysis", {
      ...logContext,
      messageId,
      pendingCheckCount: pendingAgg.pendingChecks.length,
      checkNames: pendingAgg.pendingChecks.map((pendingCheck) => pendingCheck.checkName),
    });

    return messageId;
  } catch (error) {
    logger.error("Failed to enqueue pending aggregation", {
      ...logContext,
      error: getErrorMessage(error),
    });
    return null;
  }
};
