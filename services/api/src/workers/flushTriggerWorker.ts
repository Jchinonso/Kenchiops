/**
 * Flush Trigger Worker
 *
 * Periodically scans active ingestion buffers and triggers windowed analysis
 * when flush conditions are met (time elapsed or volume exceeded).
 * Uses Redis SCAN to find active buffer metadata keys, then evaluates
 * flush triggers per buffer.
 *
 * @module workers/flushTriggerWorker
 */

import crypto from "node:crypto";
import {
  createLogger,
  getRedisClient,
  getErrorMessage,
  withTimeout,
  INGESTION_REDIS_KEYS,
  REDIS_TIMEOUTS,
  REDIS_SCAN,
  REDIS_READY_STATUS,
  STREAM_LIFECYCLE,
  type RequestContext,
  type DeployPlatform,
  type IngestionBufferPort,
} from "@kenchi/shared";
import type { DeployAnalysisService } from "../services/deployAnalysisService.js";
import type { FlushTriggerWorkerControl } from "./flushTriggerWorkerTypes.js";

export type { FlushTriggerWorkerControl };

const logger = createLogger("flush-trigger-worker");

/** How often to scan for buffers needing flush (in ms). */
const POLL_INTERVAL_MS = 30_000; // 30 seconds

/** Redis SCAN pattern for all active buffer metadata keys. */
const BUFFER_META_PATTERN = `${INGESTION_REDIS_KEYS.BUFFER_META}:*`;

const OPERATION_TIMEOUT = REDIS_TIMEOUTS.QUEUE_OPERATION_MS;

// ==================== Helpers ====================

/** Creates a worker-scoped RequestContext for background processing. */
const createWorkerContext = (): RequestContext => ({
  requestId: crypto.randomUUID(),
  tenantId: "system",
  actor: "flush-trigger-worker",
});

/**
 * Parses tenantId and entityId from a buffer metadata key.
 * Key format: kenchi:log-buffer-meta:{tenantId}:{entityId}
 */
const parseMetaKey = (
  key: string
): { readonly tenantId: string; readonly entityId: string } | null => {
  const prefix = `${INGESTION_REDIS_KEYS.BUFFER_META}:`;
  if (!key.startsWith(prefix)) {
    return null;
  }

  const remainder = key.slice(prefix.length);
  const separatorIndex = remainder.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  return {
    tenantId: remainder.slice(0, separatorIndex),
    entityId: remainder.slice(separatorIndex + 1),
  };
};

// ==================== Core Scan Logic ====================

/**
 * Scans all active buffer metadata keys and evaluates flush triggers.
 * For each buffer that needs flushing, calls forceFlush on the deploy analysis service.
 */
const scanAndFlush = async (
  buffer: IngestionBufferPort,
  deployAnalysisService: DeployAnalysisService,
  context: RequestContext
): Promise<void> => {
  const logContext = { ...context };

  try {
    const client = getRedisClient();
    if (client.status !== REDIS_READY_STATUS) {
      return;
    }

    // SCAN for all buffer metadata keys
    let cursor: string = REDIS_SCAN.INITIAL_CURSOR; // let: updated by SCAN cursor iteration
    let totalScanned = 0; // let: accumulated count across SCAN iterations
    let totalFlushed = 0; // let: accumulated count across SCAN iterations

    do {
      const [nextCursor, keys] = await withTimeout(
        client.scan(cursor, "MATCH", BUFFER_META_PATTERN, "COUNT", REDIS_SCAN.BATCH_SIZE),
        OPERATION_TIMEOUT
      );
      cursor = nextCursor;

      // for...of: serial processing — each flush triggers LLM analysis, bounded by design
      for (const key of keys) {
        totalScanned += 1;
        const parsed = parseMetaKey(key);
        if (!parsed) {
          continue;
        }

        const { tenantId, entityId } = parsed;

        // Get metadata to determine platform
        const metadata = await buffer.getMetadata(entityId, tenantId);
        if (!metadata || metadata.status !== "active") {
          continue;
        }

        // Check idle timeout — auto-close abandoned streams
        const lastActivity = metadata.lastFlushAt ?? metadata.createdAt;
        const idleMs = Date.now() - new Date(lastActivity).getTime();
        if (idleMs > STREAM_LIFECYCLE.IDLE_TIMEOUT_SECONDS * 1000) {
          logger.info("Closing idle ingestion buffer", {
            entityId,
            bufferTenantId: tenantId,
            idleMs,
            ...logContext,
          });
          await buffer.close(entityId, tenantId, context);
          continue;
        }

        // Check window count limit — prevent runaway streams
        if (metadata.windowCount >= STREAM_LIFECYCLE.MAX_WINDOWS_PER_STREAM) {
          logger.warn("Buffer exceeded max windows — closing", {
            entityId,
            bufferTenantId: tenantId,
            windowCount: metadata.windowCount,
            ...logContext,
          });
          await buffer.close(entityId, tenantId, context);
          continue;
        }

        // Evaluate flush triggers
        const triggerResult = await buffer.checkFlushTriggers(
          entityId,
          tenantId,
          metadata.platform
        );

        if (!triggerResult.shouldFlush) {
          continue;
        }

        logger.info("Flush trigger met — forcing flush", {
          entityId,
          bufferTenantId: tenantId,
          platform: metadata.platform,
          reason: triggerResult.reason,
          estimatedBufferTokens: triggerResult.estimatedBufferTokens,
          ...logContext,
        });

        await deployAnalysisService.forceFlush(
          {
            entityId,
            tenantId,
            platform: metadata.platform as DeployPlatform,
            metadata: {
              repository: "",
              branch: "",
              commit: "",
              startedAt: new Date(metadata.createdAt),
              completedAt: null,
              status: "deploying",
              projectId: "",
              projectName: "",
            },
          },
          context
        );

        totalFlushed += 1;
      }
    } while (cursor !== REDIS_SCAN.INITIAL_CURSOR);

    if (totalScanned > 0) {
      logger.info("Flush trigger scan completed", {
        operation: "scanAndFlush",
        totalScanned,
        totalFlushed,
        ...logContext,
      });
    }
  } catch (error: unknown) {
    logger.warn("Flush trigger scan failed", {
      operation: "scanAndFlush",
      error: getErrorMessage(error),
      ...logContext,
    });
  }
};

// ==================== Worker Lifecycle ====================

/**
 * Starts the flush trigger worker.
 * Polls Redis periodically for active buffers and triggers flushes.
 *
 * @returns Control handle with stop() method for graceful shutdown.
 */
export const startFlushTriggerWorker = (
  buffer: IngestionBufferPort,
  deployAnalysisService: DeployAnalysisService
): FlushTriggerWorkerControl => {
  logger.info("Starting flush trigger worker", {
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  const intervalId = setInterval(() => {
    const workerContext = createWorkerContext();
    void scanAndFlush(buffer, deployAnalysisService, workerContext);
  }, POLL_INTERVAL_MS);

  return {
    stop: (): void => {
      clearInterval(intervalId);
      logger.info("Flush trigger worker stopped");
    },
  };
};
