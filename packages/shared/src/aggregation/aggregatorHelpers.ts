/**
 * Aggregator Helper Functions
 *
 * Serialization, metadata building, and utility functions for Redis aggregation.
 *
 * @module aggregation/aggregatorHelpers
 */

import type { getRedisClient } from "../queue/redisClient.js";
import {
  REDIS_KEY_PREFIXES,
  AGGREGATION_DEFAULTS,
  DISPLAY_DEFAULTS,
  TIME_CONSTANTS,
} from "../constants/index.js";
import {
  AGGREGATION_KEYS,
  type AggregatedFailures,
  type AggregationKey,
  type AnalyzedFailure,
  type SerializedFailure,
  type RepositoryInfo,
  type PRContext,
  type WorkflowContext,
} from "./types.js";

// ==================== Types ====================

/** Redis client type from getRedisClient. */
export type RedisClient = ReturnType<typeof getRedisClient>;

// ==================== Redis Helpers ====================

/** Checks if Redis client is ready for operations. */
export const isRedisReady = (redis: RedisClient): boolean => redis.status === "ready";

/** Context for failure aggregation operations. */
export interface FailureContext {
  readonly repositoryInfo: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  readonly prContext: PRContext | null;
  readonly workflowContext: WorkflowContext | null;
}

/** Metadata stored in Redis for an aggregation (JSON-serialized fields). */
export interface AggregationMetadata {
  readonly repositoryFullName: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly pullRequestNumbers: string;
  readonly prContext: string | null;
  readonly workflowContext: string | null;
  readonly firstFailureAt: string;
  readonly lastFailureAt: string;
}

// ==================== Constants ====================

/** Regex pattern for parsing aggregation metadata keys */
export const AGGREGATION_KEY_PATTERN = new RegExp(
  `^${REDIS_KEY_PREFIXES.AGGREGATION.replace(":", "\\:")}:(.+):([a-f0-9]+):meta$`
);

// ==================== Display Helpers ====================

/** Truncates SHA to display length. */
export const formatShaForDisplay = (sha: string): string =>
  sha.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH);

// ==================== TTL Calculation ====================

/** Converts milliseconds to seconds and adds buffer for aggregation TTL. */
export const calculateAggregationTTL = (maxWaitMs: number): number =>
  Math.ceil(maxWaitMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND) +
  AGGREGATION_DEFAULTS.TTL_BUFFER_SECONDS;

/** Converts debounce milliseconds to seconds. */
export const calculateDebounceTTL = (debounceMs: number): number =>
  Math.ceil(debounceMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND);

// ==================== Serialization ====================

/** JSON-stringify with null passthrough for optional values. */
const stringifyOptional = <T>(value: T | null): string | null =>
  value ? JSON.stringify(value) : null;

/** JSON-parse with null passthrough for optional values. */
const parseOptional = <T>(value: string | null): T | null =>
  value ? (JSON.parse(value) as T) : null;

/** Serializes a failure for Redis storage (converts Date to ISO string). */
export const serializeFailure = (failure: AnalyzedFailure): string =>
  JSON.stringify({ ...failure, timestamp: failure.timestamp.toISOString() });

/** Deserializes a failure from Redis storage (converts ISO string to Date). */
export const deserializeFailure = (data: string): AnalyzedFailure => {
  const parsed = JSON.parse(data) as SerializedFailure;
  return { ...parsed, timestamp: new Date(parsed.timestamp) };
};

// ==================== Metadata Building ====================

/** Builds metadata object for Redis storage from aggregation context. */
export const buildMetadata = (
  key: AggregationKey,
  context: FailureContext,
  firstFailureAt: Date,
  lastFailureAt: Date
): AggregationMetadata => ({
  repositoryFullName: context.repositoryInfo.fullName,
  repositoryOwner: context.repositoryInfo.owner,
  repositoryName: context.repositoryInfo.name,
  commitSha: key.commitSha,
  installationId: context.installationId,
  pullRequestNumbers: JSON.stringify(context.pullRequestNumbers),
  prContext: stringifyOptional(context.prContext),
  workflowContext: stringifyOptional(context.workflowContext),
  firstFailureAt: firstFailureAt.toISOString(),
  lastFailureAt: lastFailureAt.toISOString(),
});

/** Reconstructs AggregatedFailures from Redis metadata and failure list. */
export const reconstructAggregation = (
  metadata: AggregationMetadata,
  failures: readonly AnalyzedFailure[]
): AggregatedFailures => ({
  commitSha: metadata.commitSha,
  repository: {
    fullName: metadata.repositoryFullName,
    owner: metadata.repositoryOwner,
    name: metadata.repositoryName,
  },
  installationId: metadata.installationId,
  pullRequestNumbers: JSON.parse(metadata.pullRequestNumbers) as number[],
  failures: [...failures],
  prContext: parseOptional<PRContext>(metadata.prContext),
  workflowContext: parseOptional<WorkflowContext>(metadata.workflowContext),
  firstFailureAt: new Date(metadata.firstFailureAt),
  lastFailureAt: new Date(metadata.lastFailureAt),
});

// ==================== Key Parsing ====================

/** Parses aggregation key from Redis metadata key, returns null if invalid. */
export const parseAggregationKey = (metaKey: string): AggregationKey | null => {
  const match = metaKey.match(AGGREGATION_KEY_PATTERN);
  if (!match) {
    return null;
  }

  const [, repoFullName, commitSha] = match;
  return { repositoryFullName: repoFullName, commitSha };
};

/** Redis key set for an aggregation. */
export interface AggregationKeySet {
  readonly failuresKey: string;
  readonly metadataKey: string;
  readonly debounceKey: string;
}

/** Builds all Redis keys for an aggregation. */
export const buildAggregationKeys = (key: AggregationKey): AggregationKeySet => ({
  failuresKey: AGGREGATION_KEYS.failures(key),
  metadataKey: AGGREGATION_KEYS.metadata(key),
  debounceKey: AGGREGATION_KEYS.debounce(key),
});
