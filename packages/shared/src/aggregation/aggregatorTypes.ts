/**
 * Internal Types for Redis Aggregator
 *
 * Type definitions used internally by the aggregation module.
 * These are not exported from the main aggregation index.
 *
 * @module aggregation/aggregatorTypes
 */

import type { RepositoryInfo, AggregationKey, AggregationConfig } from "./types.js";
import type {
  FailureContext,
  AggregationKeySet,
  AggregationMetadata,
  RedisClient,
} from "./aggregatorHelpers.js";

// ==================== Public Context Types ====================

/** Context for pending check aggregation. */
export interface PendingCheckContext {
  readonly repositoryInfo: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
}

// ==================== Serialization Types ====================

/** Serialized pending check structure for Redis storage. */
export interface SerializedPendingCheckData {
  readonly checkRunId: number;
  readonly checkName: string;
  readonly conclusion: string;
  readonly timestamp: string;
}

// ==================== Internal Operation Types ====================

/** Parameters for adding an item to aggregation. */
export interface AddToAggregationParams {
  readonly key: AggregationKey;
  readonly checkRunId: number;
  readonly checkName: string;
  readonly serializedData: string;
  readonly failureContext: FailureContext;
  readonly config: AggregationConfig;
  readonly itemType: "failure" | "pending_check";
}

/** Log context for aggregation operations. */
export interface AggregationLogContext extends Record<string, unknown> {
  readonly repository: string;
  readonly commitSha: string;
}

/** Options for executing aggregation pipeline. */
export interface PipelineOptions {
  readonly redis: RedisClient;
  readonly keys: AggregationKeySet;
  readonly checkRunIdStr: string;
  readonly serializedData: string;
  readonly metadata: AggregationMetadata;
  readonly ttlSeconds: number;
  readonly debounceSeconds: number;
}

// ==================== Constants ====================

/** Radix for parseInt operations. */
export const RADIX_DECIMAL = 10;

/** Default installation ID when not provided. */
export const DEFAULT_INSTALLATION_ID = "0";
