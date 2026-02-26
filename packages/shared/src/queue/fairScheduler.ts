/**
 * Fair Queue Scheduler
 *
 * Provides weighted round-robin queue processing to prevent tenant starvation.
 * Uses per-tenant sub-queues in Redis with an active-tenant set for fair selection.
 *
 * Key design:
 * - `enqueueFair()`: LPUSH to tenant-specific sub-queue, SADD to active-tenants set
 * - `processFair()`: SRANDMEMBER to pick a random active tenant, RPOPLPUSH from
 *   that tenant's sub-queue. Removes tenant from active set when sub-queue empties.
 * - Falls back to base queue for backwards compatibility (non-fair enqueued jobs)
 *
 * @module queue/fairScheduler
 */

import { getRedisClient } from "./redisClient.js";
import { createQueue } from "./messageQueue.js";
import { createLogger } from "../core/logger.js";
import { generateEventId, getErrorMessage } from "../core/index.js";
import {
  QUEUE_CONFIG,
  FAIR_QUEUE_DEFAULTS,
  REDIS_LIST_OPS,
  REDIS_STATUS,
} from "../constants/index.js";
import type { QueueMessage, MessageHandler, QueueStats } from "./types.js";
import type { FairQueueConfig, FairQueueManager, FairQueueKeys } from "./fairSchedulerTypes.js";

export type { FairQueueConfig, FairQueueManager } from "./fairSchedulerTypes.js";

const logger = createLogger("fair-scheduler");

// ==================== Internal Helpers ====================

/**
 * Build Redis key names for a fair queue.
 */
const buildFairQueueKeys = (name: string, deadLetterQueue: string): FairQueueKeys => ({
  baseName: name,
  processingQueue: `${name}${QUEUE_CONFIG.PROCESSING_SUFFIX}`,
  deadLetterQueue,
  activeTenantSet: `${name}:active-tenants`,
  tenantSubQueue: (tenantId: string): string => `${name}:tenant:${tenantId}`,
  tenantProcessingQueue: (tenantId: string): string =>
    `${name}:tenant:${tenantId}${QUEUE_CONFIG.PROCESSING_SUFFIX}`,
});

/**
 * Serialize a queue message for Redis storage.
 */
const serializeMessage = <T>(message: QueueMessage<T>): string => JSON.stringify(message);

/**
 * Deserialize a Redis-stored queue message.
 */
const deserializeMessage = <T>(data: string): QueueMessage<T> =>
  JSON.parse(data) as QueueMessage<T>;

/**
 * Handle job failure: retry or move to dead-letter queue.
 */
const handleFairJobFailure = async <T>(
  tenantId: string,
  keys: FairQueueKeys,
  message: QueueMessage<T>,
  data: string,
  errorInfo: string,
  maxRetries: number
): Promise<void> => {
  const client = getRedisClient();
  const tenantProcessing = keys.tenantProcessingQueue(tenantId);

  if ((message.retryCount ?? 0) < maxRetries) {
    const updatedMessage: QueueMessage<T> = {
      ...message,
      retryCount: (message.retryCount ?? 0) + 1,
    };
    const tenantQueue = keys.tenantSubQueue(tenantId);
    await client.lrem(tenantProcessing, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);
    await client.lpush(tenantQueue, serializeMessage(updatedMessage));
    // Re-add tenant to active set since we re-enqueued
    await client.sadd(keys.activeTenantSet, tenantId);
    logger.warn("Fair job retrying", {
      queue: keys.baseName,
      tenantId,
      messageId: message.id,
      retryCount: updatedMessage.retryCount,
      error: errorInfo,
    });
  } else {
    await client.lrem(tenantProcessing, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);
    await client.lpush(keys.deadLetterQueue, data);
    logger.error("Fair job moved to dead letter queue", {
      queue: keys.baseName,
      tenantId,
      messageId: message.id,
      retryCount: message.retryCount,
      error: errorInfo,
    });
  }
};

// ==================== Public API ====================

/**
 * Creates a fair queue manager with per-tenant sub-queues.
 *
 * The returned manager extends the base QueueManager:
 * - `enqueue` / `process` operate on the shared FIFO queue (backwards compat)
 * - `enqueueFair` / `processFair` use per-tenant sub-queues with random selection
 */
export const createFairQueue = (fairConfig: FairQueueConfig): FairQueueManager => {
  const {
    name,
    maxRetries = QUEUE_CONFIG.DEFAULT_MAX_RETRIES,
    deadLetterQueue = `${name}${QUEUE_CONFIG.DEAD_LETTER_SUFFIX}`,
    maxTenantsPerRound = FAIR_QUEUE_DEFAULTS.MAX_TENANTS_PER_ROUND,
  } = fairConfig;

  // Delegate base queue operations to the standard createQueue
  const baseQueue = createQueue({ name, maxRetries, deadLetterQueue });
  const keys = buildFairQueueKeys(name, deadLetterQueue);

  /**
   * Enqueue a job into a tenant-specific sub-queue.
   */
  const enqueueFair = async <T>(
    type: string,
    payload: T,
    tenantId: string,
    metadata?: Record<string, unknown>
  ): Promise<string> => {
    const client = getRedisClient();
    const message: QueueMessage<T> = {
      id: generateEventId(QUEUE_CONFIG.MESSAGE_ID_PREFIX),
      type,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: QUEUE_CONFIG.INITIAL_RETRY_COUNT,
      metadata: { ...metadata, tenantId },
    };

    const tenantQueue = keys.tenantSubQueue(tenantId);
    // Atomic: push message and register tenant as active
    await Promise.all([
      client.lpush(tenantQueue, serializeMessage(message)),
      client.sadd(keys.activeTenantSet, tenantId),
    ]);

    logger.debug("Fair job enqueued", {
      queue: name,
      tenantId,
      messageId: message.id,
      type,
    });

    return message.id;
  };

  /**
   * Process a job using fair round-robin scheduling.
   *
   * 1. Try to pick a random active tenant and dequeue from their sub-queue.
   * 2. If no active tenants or the selected tenant's queue is empty,
   *    fall back to the base FIFO queue for backwards compatibility.
   */
  const processFair = async <T>(handler: MessageHandler<T>): Promise<void> => {
    const client = getRedisClient();

    if (client.status !== REDIS_STATUS.READY) {
      return;
    }

    // Attempt fair scheduling from tenant sub-queues
    const processed = await processTenantJob<T>(client, handler, maxTenantsPerRound);
    if (processed) {
      return;
    }

    // Fall back to base queue for non-fair-enqueued jobs
    await baseQueue.process(handler);
  };

  /**
   * Try to process a job from a randomly-selected active tenant.
   * Returns true if a job was found and processed.
   */
  const processTenantJob = async <T>(
    client: ReturnType<typeof getRedisClient>,
    handler: MessageHandler<T>,
    attemptsRemaining: number
  ): Promise<boolean> => {
    if (attemptsRemaining <= 0) {
      return false;
    }

    // Pick a random active tenant
    const tenantId = await client.srandmember(keys.activeTenantSet);
    if (!tenantId) {
      return false;
    }

    const tenantQueue = keys.tenantSubQueue(tenantId);
    const tenantProcessing = keys.tenantProcessingQueue(tenantId);

    // Atomically move a message from the tenant queue to their processing queue
    const data = await client.rpoplpush(tenantQueue, tenantProcessing);

    if (!data) {
      // Tenant's queue is empty, remove from active set
      await client.srem(keys.activeTenantSet, tenantId);
      // Try another tenant
      return processTenantJob(client, handler, attemptsRemaining - 1);
    }

    const message = deserializeMessage<T>(data);
    const startTime = Date.now();

    try {
      const result = await handler(message);

      if (result.success) {
        await client.lrem(tenantProcessing, REDIS_LIST_OPS.REMOVE_FIRST_MATCH, data);

        // Check if tenant's queue is now empty, clean up if so
        const remaining = await client.llen(tenantQueue);
        if (remaining === 0) {
          await client.srem(keys.activeTenantSet, tenantId);
        }

        logger.info("Fair job completed", {
          queue: name,
          tenantId,
          messageId: message.id,
          durationMs: Date.now() - startTime,
        });
      } else {
        const shouldRetry = result.shouldRetry !== false;
        await handleFairJobFailure(
          tenantId,
          keys,
          message,
          data,
          result.error ?? "Job failed",
          shouldRetry ? maxRetries : 0
        );
      }
    } catch (error) {
      await handleFairJobFailure(tenantId, keys, message, data, getErrorMessage(error), maxRetries);
    }

    return true;
  };

  /**
   * Get aggregate stats across all tenant sub-queues plus the base queue.
   */
  const getStats = async (): Promise<QueueStats> => {
    const client = getRedisClient();
    const baseStats = await baseQueue.getStats();

    // Get all active tenants and sum their queue depths
    const activeTenants = await client.smembers(keys.activeTenantSet);
    const tenantPendingCounts = await Promise.all(
      activeTenants.map((tenantId) => client.llen(keys.tenantSubQueue(tenantId)))
    );
    const tenantProcessingCounts = await Promise.all(
      activeTenants.map((tenantId) => client.llen(keys.tenantProcessingQueue(tenantId)))
    );

    const tenantPending = tenantPendingCounts.reduce((sum, count) => sum + count, 0);
    const tenantProcessing = tenantProcessingCounts.reduce((sum, count) => sum + count, 0);

    return {
      pending: baseStats.pending + tenantPending,
      processing: baseStats.processing + tenantProcessing,
      dead: baseStats.dead,
    };
  };

  /**
   * Get queue statistics for a specific tenant.
   */
  const getTenantStats = async (tenantId: string): Promise<QueueStats> => {
    const client = getRedisClient();
    const [pending, processing, dead] = await Promise.all([
      client.llen(keys.tenantSubQueue(tenantId)),
      client.llen(keys.tenantProcessingQueue(tenantId)),
      client.llen(keys.deadLetterQueue),
    ]);
    return { pending, processing, dead };
  };

  /**
   * Clear all fair queue data including all tenant sub-queues.
   */
  const clear = async (): Promise<void> => {
    const client = getRedisClient();

    // Get all active tenants to clean up their sub-queues
    const activeTenants = await client.smembers(keys.activeTenantSet);
    const tenantKeys = activeTenants.flatMap((tenantId) => [
      keys.tenantSubQueue(tenantId),
      keys.tenantProcessingQueue(tenantId),
    ]);

    const allKeys = [keys.activeTenantSet, ...tenantKeys];

    // Clear base queue + all fair queue keys
    await Promise.all([baseQueue.clear(), ...(allKeys.length > 0 ? [client.del(...allKeys)] : [])]);

    logger.warn("Fair queue cleared", { queue: name });
  };

  return {
    // Base queue methods (backwards compatible)
    name,
    enqueue: baseQueue.enqueue,
    process: baseQueue.process,
    // Fair scheduling methods
    enqueueFair,
    processFair,
    getStats,
    getTenantStats,
    clear,
  };
};
