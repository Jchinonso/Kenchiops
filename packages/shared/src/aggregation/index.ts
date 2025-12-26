/**
 * Aggregation module exports.
 *
 * Provides Redis-based failure aggregation functionality for consolidating
 * multiple CI check run failures into a single analysis.
 *
 * @module aggregation
 */

// Types
export type {
  CodeAnnotation,
  RecommendedAction,
  AnalyzedFailure,
  SerializedFailure,
  PRContext,
  WorkflowContext,
  RepositoryInfo,
  AggregatedFailures,
  AggregationKey,
  AggregationConfig,
  ConsolidatedPostResult,
} from "./types.js";

export {
  serializeAggregationKey,
  deserializeAggregationKey,
  DEFAULT_AGGREGATION_CONFIG,
  AGGREGATION_KEYS,
} from "./types.js";

// Redis Aggregator
export {
  addFailureToRedis,
  getAggregationFromRedis,
  deleteAggregationFromRedis,
  isDebounceExpired,
  isMaxWaitExceeded,
  findReadyAggregations,
  enqueueAggregation,
  startAggregatorWorker,
  startAnalysisQueueProcessor,
  deserializeQueuePayload,
  type AggregationReadyCallback,
  type ConsolidatedAnalysisPayload,
} from "./redisAggregator.js";
