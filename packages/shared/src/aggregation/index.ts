/**
 * Aggregation module exports.
 *
 * Provides Redis-based failure aggregation functionality for consolidating
 * multiple CI check run failures into a single analysis.
 *
 * @module aggregation
 */

// ==================== Types ====================

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

// ==================== Internal Types ====================

export type { PendingCheckContext } from "./aggregatorTypes.js";

// ==================== Aggregator Helpers ====================

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
  isRedisReady,
  type RedisClient,
  type FailureContext,
  type AggregationMetadata,
  type AggregationKeySet,
} from "./aggregatorHelpers.js";

// ==================== Write Operations ====================

export { addFailureToRedis, addPendingCheckToRedis } from "./aggregatorWrite.js";

// ==================== Read Operations ====================

export { getAggregationFromRedis, getPendingAggregationFromRedis } from "./aggregatorRead.js";

// ==================== Delete Operations ====================

export { deleteAggregationFromRedis } from "./redisAggregator.js";

// ==================== Scanner ====================

export {
  isDebounceExpired,
  isMaxWaitExceeded,
  findReadyAggregations,
} from "./aggregationScanner.js";

// ==================== Enqueuer ====================

export {
  enqueueAggregation,
  enqueuePendingAggregation,
  type PendingAggregationPayload,
} from "./aggregationEnqueuer.js";

// ==================== Worker ====================

export { startAggregatorWorker } from "./aggregatorWorker.js";

// ==================== Queue Processor ====================

export {
  startAnalysisQueueProcessor,
  deserializeQueuePayload,
  type ConsolidatedAnalysisPayload,
  type AggregationReadyCallback,
  type PendingAnalysisCallback,
} from "./analysisQueueProcessor.js";
