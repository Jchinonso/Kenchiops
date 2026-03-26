/**
 * Ingestion Buffer Operations
 *
 * Core Redis operations for the ingestion buffer: append, flush, and close.
 * Each function is standalone, taking the Redis client implicitly via getRedisClient().
 *
 * Fail-open: Redis failures are logged and swallowed. The buffer never blocks ingestion.
 *
 * @module ingestion/bufferOperations
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import {
  INGESTION_BUFFER_DEFAULTS,
  FLUSH_LOCK_DEFAULTS,
  REDIS_TIMEOUTS,
  REDIS_READY_STATUS,
} from "../constants/index.js";
import type { RequestContext } from "../core/types.js";
import type { DeployPlatform, LogLine } from "../ports/deployLogSourcePort.js";
import type { AppendResult, FlushResult, BufferMetadata, IncidentSummary } from "./types.js";
import {
  buildBufferKey,
  buildMetadataKey,
  buildSummaryKey,
  buildFlushLockKey,
  buildMember,
  extractMessage,
  estimateLinesTokens,
  serializeMetadata,
  deserializeMetadata,
} from "./helpers.js";

const logger = createLogger("ingestion-buffer");

const OPERATION_TIMEOUT = REDIS_TIMEOUTS.QUEUE_OPERATION_MS;

/** Checks if the Redis client is connected and ready. */
export const isClientReady = (): boolean => {
  try {
    const client = getRedisClient();
    return client.status === REDIS_READY_STATUS;
  } catch {
    return false;
  }
};

// ==================== Append ====================

/**
 * Appends log lines to the buffer sorted set.
 * Uses ZADD NX for dedup (members with the same hash prefix are skipped).
 * Evicts oldest lines if the buffer exceeds the token ceiling.
 */
export const append = async (
  entityId: string,
  tenantId: string,
  platform: DeployPlatform,
  lines: readonly LogLine[],
  context: RequestContext
): Promise<AppendResult> => {
  const emptyResult: AppendResult = {
    linesAccepted: 0,
    linesDeduplicated: 0,
    estimatedBufferTokens: 0,
    linesEvicted: 0,
  };

  if (lines.length === 0 || !isClientReady()) {
    return emptyResult;
  }

  const startTime = Date.now();
  const bufferKey = buildBufferKey(tenantId, entityId);
  const metaKey = buildMetadataKey(tenantId, entityId);

  try {
    const client = getRedisClient();

    // Build ZADD args: [score, member, score, member, ...]
    const zaddArgs: Array<string | number> = []; // Mutable: built once for batch ZADD
    for (const line of lines) {
      zaddArgs.push(line.timestamp.getTime(), buildMember(line));
    }

    // ZADD NX — only add if member doesn't exist (dedup by hash prefix)
    const added = await withTimeout(client.zadd(bufferKey, "NX", ...zaddArgs), OPERATION_TIMEOUT);
    const linesAccepted = typeof added === "number" ? added : parseInt(String(added), 10) || 0;
    const linesDeduplicated = lines.length - linesAccepted;

    // Parallel: refresh TTL + fetch existing metadata + check buffer size
    const [, existingMeta, bufferSize] = await Promise.all([
      withTimeout(
        client.expire(bufferKey, INGESTION_BUFFER_DEFAULTS.BUFFER_TTL_SECONDS),
        OPERATION_TIMEOUT
      ),
      withTimeout(client.hgetall(metaKey), OPERATION_TIMEOUT),
      withTimeout(client.zcard(bufferKey), OPERATION_TIMEOUT),
    ]);

    const currentMeta = deserializeMetadata(existingMeta);

    const updatedMeta: BufferMetadata = {
      entityId,
      tenantId,
      platform,
      status: "active",
      createdAt: currentMeta?.createdAt ?? new Date().toISOString(),
      lastFlushAt: currentMeta?.lastFlushAt ?? null,
      windowCount: currentMeta?.windowCount ?? 0,
      totalLinesIngested: (currentMeta?.totalLinesIngested ?? 0) + linesAccepted,
    };

    // Parallel: update metadata + refresh metadata TTL
    await Promise.all([
      withTimeout(client.hset(metaKey, serializeMetadata(updatedMeta)), OPERATION_TIMEOUT),
      withTimeout(
        client.expire(metaKey, INGESTION_BUFFER_DEFAULTS.BUFFER_TTL_SECONDS),
        OPERATION_TIMEOUT
      ),
    ]);

    // Eviction check
    const estimatedBufferTokens = bufferSize * INGESTION_BUFFER_DEFAULTS.TOKENS_PER_LINE_ESTIMATE;
    let linesEvicted = 0; // let: incremented if eviction occurs

    if (estimatedBufferTokens > INGESTION_BUFFER_DEFAULTS.MAX_BUFFER_TOKENS) {
      const evictCount = Math.ceil(bufferSize * INGESTION_BUFFER_DEFAULTS.EVICTION_RATIO);
      await withTimeout(client.zremrangebyrank(bufferKey, 0, evictCount - 1), OPERATION_TIMEOUT);
      linesEvicted = evictCount;

      logger.info("Evicted oldest lines from ingestion buffer", {
        provider: "redis",
        operation: "bufferEviction",
        entityId,
        linesEvicted,
        bufferSize,
        estimatedBufferTokens,
        ...context,
      });
    }

    const durationMs = Date.now() - startTime;
    logger.info("Appended lines to ingestion buffer", {
      provider: "redis",
      operation: "bufferAppend",
      durationMs,
      entityId,
      platform,
      linesAccepted,
      linesDeduplicated,
      linesEvicted,
      ...context,
    });

    return { linesAccepted, linesDeduplicated, estimatedBufferTokens, linesEvicted };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logger.warn("Ingestion buffer append failed (fail-open)", {
      provider: "redis",
      operation: "bufferAppend",
      durationMs,
      entityId,
      error: getErrorMessage(error),
      ...context,
    });
    return emptyResult;
  }
};

// ==================== Flush ====================

/** Releases the distributed flush lock, swallowing errors. */
const releaseLock = async (lockKey: string): Promise<void> => {
  try {
    const client = getRedisClient();
    await withTimeout(client.del(lockKey), OPERATION_TIMEOUT);
  } catch {
    // Swallow — TTL will auto-release the lock
  }
};

/**
 * Flushes buffered lines since the last flush.
 * Acquires a distributed lock to prevent double-flush across instances.
 * Returns flushed lines, estimated tokens, and the previous summary.
 */
export const flush = async (
  entityId: string,
  tenantId: string,
  context: RequestContext
): Promise<FlushResult> => {
  const emptyResult: FlushResult = {
    lines: [],
    lineCount: 0,
    estimatedTokens: 0,
    windowNumber: 0,
    previousSummary: null,
  };

  if (!isClientReady()) {
    return emptyResult;
  }

  const startTime = Date.now();
  const bufferKey = buildBufferKey(tenantId, entityId);
  const metaKey = buildMetadataKey(tenantId, entityId);
  const summaryKey = buildSummaryKey(tenantId, entityId);
  const lockKey = buildFlushLockKey(tenantId, entityId);

  try {
    const client = getRedisClient();

    // Acquire distributed lock (SET NX EX)
    const lockAcquired = await withTimeout(
      client.set(lockKey, "1", "EX", FLUSH_LOCK_DEFAULTS.LOCK_TTL_SECONDS, "NX"),
      OPERATION_TIMEOUT
    );

    if (lockAcquired !== "OK") {
      logger.info("Flush lock already held — skipping", { entityId, ...context });
      return emptyResult;
    }

    try {
      const rawMeta = await withTimeout(client.hgetall(metaKey), OPERATION_TIMEOUT);
      const meta = deserializeMetadata(rawMeta);

      const lastFlushScore = meta?.lastFlushAt ? new Date(meta.lastFlushAt).getTime() : 0;

      // Fetch lines since last flush
      const members = await withTimeout(
        client.zrangebyscore(bufferKey, lastFlushScore > 0 ? `(${lastFlushScore}` : "-inf", "+inf"),
        OPERATION_TIMEOUT
      );

      if (members.length === 0) {
        return emptyResult;
      }

      const messages = members.map(extractMessage);
      const estimatedTokens = estimateLinesTokens(messages);
      const windowNumber = (meta?.windowCount ?? 0) + 1;

      // Fetch previous summary
      const rawSummary = await withTimeout(client.get(summaryKey), OPERATION_TIMEOUT);
      const previousSummary: IncidentSummary | null = rawSummary
        ? (JSON.parse(rawSummary) as IncidentSummary)
        : null;

      // Update metadata
      await withTimeout(
        client.hset(metaKey, {
          lastFlushAt: new Date().toISOString(),
          windowCount: String(windowNumber),
        }),
        OPERATION_TIMEOUT
      );

      // Remove old lines that were already flushed previously
      if (lastFlushScore > 0) {
        await withTimeout(
          client.zremrangebyscore(bufferKey, "-inf", String(lastFlushScore)),
          OPERATION_TIMEOUT
        );
      }

      const durationMs = Date.now() - startTime;
      logger.info("Flushed ingestion buffer", {
        provider: "redis",
        operation: "bufferFlush",
        durationMs,
        entityId,
        lineCount: messages.length,
        estimatedTokens,
        windowNumber,
        hasPreviousSummary: previousSummary !== null,
        ...context,
      });

      return {
        lines: messages,
        lineCount: messages.length,
        estimatedTokens,
        windowNumber,
        previousSummary,
      };
    } finally {
      await releaseLock(lockKey);
    }
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logger.warn("Ingestion buffer flush failed", {
      provider: "redis",
      operation: "bufferFlush",
      durationMs,
      entityId,
      error: getErrorMessage(error),
      ...context,
    });
    return emptyResult;
  }
};

// ==================== Close ====================

/**
 * Closes the buffer and removes all associated Redis keys.
 */
export const close = async (
  entityId: string,
  tenantId: string,
  context: RequestContext
): Promise<void> => {
  if (!isClientReady()) {
    return;
  }

  const startTime = Date.now();

  try {
    const client = getRedisClient();
    const keys = [
      buildBufferKey(tenantId, entityId),
      buildMetadataKey(tenantId, entityId),
      buildSummaryKey(tenantId, entityId),
      buildFlushLockKey(tenantId, entityId),
    ];

    await withTimeout(client.del(...keys), OPERATION_TIMEOUT);

    const durationMs = Date.now() - startTime;
    logger.info("Closed ingestion buffer", {
      provider: "redis",
      operation: "bufferClose",
      durationMs,
      entityId,
      ...context,
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    logger.warn("Failed to close ingestion buffer", {
      provider: "redis",
      operation: "bufferClose",
      durationMs,
      entityId,
      error: getErrorMessage(error),
      ...context,
    });
  }
};
