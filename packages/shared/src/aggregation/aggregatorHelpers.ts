/**
 * Aggregator Helper Functions
 *
 * Serialization, metadata building, and utility functions for Redis aggregation.
 *
 * @module aggregation/aggregatorHelpers
 */

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

/**
 * Context for failure aggregation operations
 */
export interface FailureContext {
  readonly repositoryInfo: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  readonly prContext: PRContext | null;
  readonly workflowContext: WorkflowContext | null;
}

/**
 * Metadata stored in Redis for an aggregation
 */
export interface AggregationMetadata {
  readonly repositoryFullName: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly pullRequestNumbers: string; // JSON array
  readonly prContext: string | null; // JSON or null
  readonly workflowContext: string | null; // JSON or null
  readonly firstFailureAt: string; // ISO timestamp
  readonly lastFailureAt: string; // ISO timestamp
}

// ==================== Constants ====================

/** Regex pattern for parsing aggregation metadata keys */
export const AGGREGATION_KEY_PATTERN = new RegExp(
  `^${REDIS_KEY_PREFIXES.AGGREGATION.replace(":", "\\:")}:(.+):([a-f0-9]+):meta$`
);

// ==================== Display Helpers ====================

/**
 * Format SHA for display logging
 */
export const formatShaForDisplay = (sha: string): string =>
  sha.substring(0, DISPLAY_DEFAULTS.SHA_DISPLAY_LENGTH);

// ==================== TTL Calculation ====================

/**
 * Calculate TTL for aggregation keys (max wait + buffer)
 */
export const calculateAggregationTTL = (maxWaitMs: number): number =>
  Math.ceil(maxWaitMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND) +
  AGGREGATION_DEFAULTS.TTL_BUFFER_SECONDS;

/**
 * Calculate debounce TTL in seconds
 */
export const calculateDebounceTTL = (debounceMs: number): number =>
  Math.ceil(debounceMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND);

// ==================== Serialization ====================

/**
 * Serialize a failure for Redis storage
 */
export const serializeFailure = (failure: AnalyzedFailure): string =>
  JSON.stringify({
    ...failure,
    timestamp: failure.timestamp.toISOString(),
  });

/**
 * Deserialize a failure from Redis storage
 */
export const deserializeFailure = (data: string): AnalyzedFailure => {
  const parsed = JSON.parse(data) as SerializedFailure;
  return {
    ...parsed,
    timestamp: new Date(parsed.timestamp),
  };
};

// ==================== Metadata Building ====================

/**
 * Build metadata object for Redis storage
 */
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
  prContext: context.prContext ? JSON.stringify(context.prContext) : null,
  workflowContext: context.workflowContext ? JSON.stringify(context.workflowContext) : null,
  firstFailureAt: firstFailureAt.toISOString(),
  lastFailureAt: lastFailureAt.toISOString(),
});

/**
 * Reconstruct AggregatedFailures from Redis data
 */
export const reconstructAggregation = (
  metadata: AggregationMetadata,
  failures: AnalyzedFailure[]
): AggregatedFailures => ({
  commitSha: metadata.commitSha,
  repository: {
    fullName: metadata.repositoryFullName,
    owner: metadata.repositoryOwner,
    name: metadata.repositoryName,
  },
  installationId: metadata.installationId,
  pullRequestNumbers: JSON.parse(metadata.pullRequestNumbers) as number[],
  failures,
  prContext: metadata.prContext ? (JSON.parse(metadata.prContext) as PRContext) : null,
  workflowContext: metadata.workflowContext
    ? (JSON.parse(metadata.workflowContext) as WorkflowContext)
    : null,
  firstFailureAt: new Date(metadata.firstFailureAt),
  lastFailureAt: new Date(metadata.lastFailureAt),
});

// ==================== Key Parsing ====================

/**
 * Parse aggregation key from Redis metadata key.
 * Returns the key if valid, null otherwise.
 */
export const parseAggregationKey = (metaKey: string): AggregationKey | null => {
  const match = metaKey.match(AGGREGATION_KEY_PATTERN);
  if (!match) {
    return null;
  }
  const [, repoFullName, commitSha] = match;
  return { repositoryFullName: repoFullName, commitSha };
};

/**
 * Build Redis keys for an aggregation.
 */
export const buildAggregationKeys = (
  key: AggregationKey
): {
  failuresKey: string;
  metadataKey: string;
  debounceKey: string;
} => ({
  failuresKey: AGGREGATION_KEYS.failures(key),
  metadataKey: AGGREGATION_KEYS.metadata(key),
  debounceKey: AGGREGATION_KEYS.debounce(key),
});
