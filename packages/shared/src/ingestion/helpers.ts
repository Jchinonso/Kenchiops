/**
 * Ingestion Buffer Helpers
 *
 * Pure utility functions for the ingestion buffer: key generation,
 * dedup hashing, token estimation, and serialization.
 *
 * @module ingestion/helpers
 */

import { createHash } from "crypto";
import {
  INGESTION_REDIS_KEYS,
  INGESTION_BUFFER_DEFAULTS,
  PLATFORM_FLUSH_TRIGGERS,
  FLUSH_TRIGGER_DEFAULTS,
  THROTTLE_TIERS,
  THROTTLE_BUDGET_THRESHOLDS,
  LOG_DRAIN_LIMITS,
} from "../constants/ingestion.js";
import type { DeployPlatform, LogLine } from "../ports/deployLogSourcePort.js";
import type { BufferMetadata } from "./types.js";

// ==================== Key Generation ====================

/** Builds the Redis key for a buffer's sorted set. */
export const buildBufferKey = (tenantId: string, entityId: string): string =>
  `${INGESTION_REDIS_KEYS.BUFFER}:${tenantId}:${entityId}`;

/** Builds the Redis key for buffer metadata hash. */
export const buildMetadataKey = (tenantId: string, entityId: string): string =>
  `${INGESTION_REDIS_KEYS.BUFFER_META}:${tenantId}:${entityId}`;

/** Builds the Redis key for the carry-forward summary. */
export const buildSummaryKey = (tenantId: string, entityId: string): string =>
  `${INGESTION_REDIS_KEYS.SUMMARY}:${tenantId}:${entityId}`;

/** Builds the Redis key for the distributed flush lock. */
export const buildFlushLockKey = (tenantId: string, entityId: string): string =>
  `${INGESTION_REDIS_KEYS.FLUSH_LOCK}:${tenantId}:${entityId}`;

// ==================== Dedup Hashing ====================

/**
 * Generates a short hash for a log line (for dedup within the buffer).
 * Uses SHA-256 truncated to 12 hex chars — sufficient for collision
 * avoidance within a single entity's buffer window.
 */
export const hashLogLine = (message: string): string =>
  createHash("sha256").update(message).digest("hex").slice(0, 12);

/**
 * Builds the sorted set member value for a log line.
 * Format: {hash}:{message} — hash prefix enables dedup via NX.
 */
export const buildMember = (line: LogLine): string => {
  const hash = hashLogLine(line.message);
  // Truncate message to prevent oversized Redis members
  const truncatedMessage =
    line.message.length > LOG_DRAIN_LIMITS.MAX_LINE_LENGTH
      ? line.message.slice(0, LOG_DRAIN_LIMITS.MAX_LINE_LENGTH)
      : line.message;
  return `${hash}:${truncatedMessage}`;
};

/**
 * Extracts the original message from a sorted set member value.
 * Strips the 12-char hash prefix and colon separator.
 */
const HASH_PREFIX_LENGTH = 13; // 12 chars + 1 colon
export const extractMessage = (member: string): string => member.slice(HASH_PREFIX_LENGTH);

// ==================== Token Estimation ====================

/**
 * Estimates the token count for a string using the character-based heuristic.
 * Matches the same CHARS_PER_TOKEN ratio used by the chunking pipeline.
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / INGESTION_BUFFER_DEFAULTS.CHARS_PER_TOKEN);

/**
 * Estimates total tokens for an array of log line messages.
 */
export const estimateLinesTokens = (messages: readonly string[]): number =>
  messages.reduce((total, msg) => total + estimateTokens(msg), 0);

// ==================== Flush Trigger Evaluation ====================

/**
 * Gets the flush trigger configuration for a specific platform.
 * Falls back to defaults if the platform has no override.
 */
export const getFlushConfig = (
  platform: DeployPlatform
): { readonly timeWindowSeconds: number; readonly volumeThresholdTokens: number } => {
  const override = PLATFORM_FLUSH_TRIGGERS[platform];
  return (
    override ?? {
      timeWindowSeconds: FLUSH_TRIGGER_DEFAULTS.TIME_WINDOW_SECONDS,
      volumeThresholdTokens: FLUSH_TRIGGER_DEFAULTS.VOLUME_THRESHOLD_TOKENS,
    }
  );
};

/**
 * Gets budget-aware flush config that throttles when budget is low.
 * When budgetRatio is omitted, returns normal platform config.
 *
 * @param platform - Deploy platform
 * @param budgetRatio - Remaining budget as 0-1 ratio (1 = full, 0 = exhausted)
 */
export const getAdaptiveFlushConfig = (
  platform: DeployPlatform,
  budgetRatio?: number
): { readonly timeWindowSeconds: number; readonly volumeThresholdTokens: number } => {
  const base = getFlushConfig(platform);

  if (budgetRatio === undefined || budgetRatio >= THROTTLE_BUDGET_THRESHOLDS.MODERATE) {
    return base;
  }

  const tier =
    budgetRatio < THROTTLE_BUDGET_THRESHOLDS.SEVERE
      ? THROTTLE_TIERS.SEVERE
      : THROTTLE_TIERS.MODERATE;

  return {
    timeWindowSeconds: Math.round(base.timeWindowSeconds * tier.windowMultiplier),
    volumeThresholdTokens: Math.round(base.volumeThresholdTokens * tier.volumeMultiplier),
  };
};

// ==================== Metadata Serialization ====================

/**
 * Serializes buffer metadata to a flat record for Redis HSET.
 */
export const serializeMetadata = (meta: BufferMetadata): Readonly<Record<string, string>> => ({
  entityId: meta.entityId,
  tenantId: meta.tenantId,
  platform: meta.platform,
  status: meta.status,
  createdAt: meta.createdAt,
  lastFlushAt: meta.lastFlushAt ?? "",
  windowCount: String(meta.windowCount),
  totalLinesIngested: String(meta.totalLinesIngested),
});

/**
 * Deserializes a Redis HGETALL result to BufferMetadata.
 * Returns null if the hash is empty (key doesn't exist).
 */
export const deserializeMetadata = (
  raw: Readonly<Record<string, string>>
): BufferMetadata | null => {
  if (!raw.entityId) {
    return null;
  }

  return {
    entityId: raw.entityId,
    tenantId: raw.tenantId,
    platform: raw.platform as DeployPlatform,
    status: raw.status as BufferMetadata["status"],
    createdAt: raw.createdAt,
    lastFlushAt: raw.lastFlushAt || null,
    windowCount: parseInt(raw.windowCount, 10) || 0,
    totalLinesIngested: parseInt(raw.totalLinesIngested, 10) || 0,
  };
};
