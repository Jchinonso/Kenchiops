/**
 * Internal Types for Redis Aggregator
 *
 * Type definitions used internally by the aggregation operations.
 * These types depend on implementation details and are not exported from the main index.
 *
 * @module aggregation/aggregatorTypes
 */

import type { ProcessResult as QueueProcessResult } from "../queue/messageQueue.js";
import type { AggregationKey, AggregationConfig } from "./types.js";
import type {
  FailureContext,
  AggregationKeySet,
  AggregationMetadata,
  RedisClient,
} from "./aggregatorHelpers.js";

// Re-export types for backwards compatibility
export type {
  PendingCheckContext,
  SerializedPendingCheckData,
  AggregationLogContext,
} from "./types.js";

// ==================== Write Operation Types ====================

/**
 * Parameters for adding an item to aggregation.
 */
export interface AddToAggregationParams {
  readonly key: AggregationKey;
  readonly checkRunId: number;
  readonly checkName: string;
  readonly serializedData: string;
  readonly failureContext: FailureContext;
  readonly config: AggregationConfig;
  readonly itemType: "failure" | "pending_check";
}

/**
 * Options for executing aggregation pipeline.
 */
export interface PipelineOptions {
  readonly redis: RedisClient;
  readonly keys: AggregationKeySet;
  readonly checkRunIdStr: string;
  readonly serializedData: string;
  readonly metadata: AggregationMetadata;
  readonly ttlSeconds: number;
  readonly debounceSeconds: number;
}

// ==================== Queue Processor Internal Types ====================

/**
 * Queue message structure for processing.
 */
export interface QueueMessage {
  readonly id: string;
  readonly payload: unknown;
}

/**
 * Mutable state for controlling worker lifecycle.
 */
export interface ProcessorWorkerState {
  running: boolean;
  activeJobs: number;
  totalProcessed: number;
  totalErrors: number;
  lastProcessedAt: Date | null;
  lastErrorAt: Date | null;
}

/**
 * Async function that polls and recurses until stopped.
 */
export type WorkerLoop = () => Promise<void>;

/**
 * Message processor function type.
 */
export type MessageProcessor = (message: QueueMessage) => Promise<QueueProcessResult>;
