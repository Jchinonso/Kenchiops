/**
 * Ingestion Buffer Queries
 *
 * Read-only operations and flush trigger evaluation for the ingestion buffer.
 * Metadata, summary retrieval, and trigger checks.
 *
 * Fail-open: Redis failures return null/empty defaults.
 *
 * @module ingestion/bufferQueries
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { INGESTION_BUFFER_DEFAULTS, REDIS_TIMEOUTS } from "../constants/index.js";
import type { DeployPlatform } from "../ports/deployLogSourcePort.js";
import type { FlushTriggerResult, BufferMetadata, IncidentSummary } from "./types.js";
import {
  buildMetadataKey,
  buildSummaryKey,
  buildBufferKey,
  deserializeMetadata,
  getAdaptiveFlushConfig,
} from "./helpers.js";
import { isClientReady } from "./bufferOperations.js";

const logger = createLogger("ingestion-buffer");

const OPERATION_TIMEOUT = REDIS_TIMEOUTS.QUEUE_OPERATION_MS;

// ==================== Metadata ====================

/** Get buffer metadata (null if no active buffer). */
export const getMetadata = async (
  entityId: string,
  tenantId: string
): Promise<BufferMetadata | null> => {
  if (!isClientReady()) {
    return null;
  }

  try {
    const client = getRedisClient();
    const raw = await withTimeout(
      client.hgetall(buildMetadataKey(tenantId, entityId)),
      OPERATION_TIMEOUT
    );
    return deserializeMetadata(raw);
  } catch (error: unknown) {
    logger.warn("Failed to get buffer metadata", {
      provider: "redis",
      operation: "getMetadata",
      entityId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

// ==================== Summary ====================

/** Get the current carry-forward summary (null if no summary yet). */
export const getSummary = async (
  entityId: string,
  tenantId: string
): Promise<IncidentSummary | null> => {
  if (!isClientReady()) {
    return null;
  }

  try {
    const client = getRedisClient();
    const raw = await withTimeout(
      client.get(buildSummaryKey(tenantId, entityId)),
      OPERATION_TIMEOUT
    );
    return raw ? (JSON.parse(raw) as IncidentSummary) : null;
  } catch (error: unknown) {
    logger.warn("Failed to get buffer summary", {
      provider: "redis",
      operation: "getSummary",
      entityId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/** Store an updated carry-forward summary after window analysis. */
export const updateSummary = async (
  entityId: string,
  tenantId: string,
  summary: IncidentSummary
): Promise<void> => {
  if (!isClientReady()) {
    return;
  }

  try {
    const client = getRedisClient();
    const key = buildSummaryKey(tenantId, entityId);
    await withTimeout(
      client.setex(key, INGESTION_BUFFER_DEFAULTS.BUFFER_TTL_SECONDS, JSON.stringify(summary)),
      OPERATION_TIMEOUT
    );
  } catch (error: unknown) {
    logger.warn("Failed to update buffer summary", {
      provider: "redis",
      operation: "updateSummary",
      entityId,
      error: getErrorMessage(error),
    });
  }
};

// ==================== Flush Trigger Evaluation ====================

/**
 * Evaluates whether flush triggers have been met for a buffer.
 * Checks time elapsed since last flush and estimated buffer volume.
 */
export const checkFlushTriggers = async (
  entityId: string,
  tenantId: string,
  platform: DeployPlatform,
  budgetRatio?: number
): Promise<FlushTriggerResult> => {
  const noFlush: FlushTriggerResult = {
    shouldFlush: false,
    reason: "none",
    estimatedBufferTokens: 0,
    timeSinceLastFlushMs: 0,
  };

  if (!isClientReady()) {
    return noFlush;
  }

  try {
    const client = getRedisClient();
    const metaKey = buildMetadataKey(tenantId, entityId);
    const bufferKey = buildBufferKey(tenantId, entityId);

    const [rawMeta, bufferSize] = await Promise.all([
      withTimeout(client.hgetall(metaKey), OPERATION_TIMEOUT),
      withTimeout(client.zcard(bufferKey), OPERATION_TIMEOUT),
    ]);

    const meta = deserializeMetadata(rawMeta);
    if (!meta || meta.status !== "active") {
      return noFlush;
    }

    const now = Date.now();
    const lastFlushTime = meta.lastFlushAt
      ? new Date(meta.lastFlushAt).getTime()
      : new Date(meta.createdAt).getTime();
    const timeSinceLastFlushMs = now - lastFlushTime;
    const estimatedBufferTokens = bufferSize * INGESTION_BUFFER_DEFAULTS.TOKENS_PER_LINE_ESTIMATE;

    const flushConfig = getAdaptiveFlushConfig(platform, budgetRatio);

    // Check time trigger
    if (timeSinceLastFlushMs >= flushConfig.timeWindowSeconds * 1000) {
      return {
        shouldFlush: true,
        reason: "time_elapsed",
        estimatedBufferTokens,
        timeSinceLastFlushMs,
      };
    }

    // Check volume trigger
    if (estimatedBufferTokens >= flushConfig.volumeThresholdTokens) {
      return {
        shouldFlush: true,
        reason: "volume_exceeded",
        estimatedBufferTokens,
        timeSinceLastFlushMs,
      };
    }

    return { shouldFlush: false, reason: "none", estimatedBufferTokens, timeSinceLastFlushMs };
  } catch (error: unknown) {
    logger.warn("Flush trigger check failed", {
      provider: "redis",
      operation: "checkFlushTriggers",
      entityId,
      error: getErrorMessage(error),
    });
    return noFlush;
  }
};
