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
  TestFailureInfo,
  RelatedKnowledgeDoc,
  DetectedDependencyChange,
  DetectedBuildConfigChange,
  SuggestedFix,
  PendingCheckRun,
  SerializedPendingCheckRun,
  PendingAggregation,
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

// Aggregator Helpers
export {
  formatShaForDisplay,
  calculateAggregationTTL,
  calculateDebounceTTL,
  serializeFailure,
  deserializeFailure,
  buildMetadata,
  reconstructAggregation,
  parseAggregationKey,
  buildAggregationKeys,
  type FailureContext,
  type AggregationMetadata,
} from "./aggregatorHelpers.js";

// Redis Aggregator
export {
  addFailureToRedis,
  addPendingCheckToRedis,
  getAggregationFromRedis,
  getPendingAggregationFromRedis,
  deleteAggregationFromRedis,
  isDebounceExpired,
  isMaxWaitExceeded,
  findReadyAggregations,
  enqueueAggregation,
  enqueuePendingAggregation,
  startAggregatorWorker,
  startAnalysisQueueProcessor,
  deserializeQueuePayload,
  type PendingCheckContext,
  type AggregationReadyCallback,
  type PendingAnalysisCallback,
  type ConsolidatedAnalysisPayload,
  type PendingAggregationPayload,
} from "./redisAggregator.js";
