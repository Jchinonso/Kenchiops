/**
 * Aggregation module exports.
 *
 * Provides Redis-based failure aggregation functionality for consolidating
 * multiple CI check run failures into a single analysis.
 *
 * @module aggregation
 */

// ==================== Types (all from types.ts) ====================

export type {
  // Domain types
  CodeAnnotation,
  RecommendedAction,
  TestFailureInfo,
  RelatedKnowledgeDoc,
  DetectedDependencyChange,
  DetectedBuildConfigChange,
  SuggestedFix,
  LintErrorInfo,
  PendingCheckRun,
  SerializedPendingCheckRun,
  PendingAggregation,
  PendingAggregationPayload,
  AnalyzedFailure,
  SerializedFailure,
  PRContext,
  WorkflowContext,
  RepositoryInfo,
  AggregatedFailures,
  AggregationKey,
  AggregationConfig,
  ConsolidatedPostResult,
  FailureContext,
  AggregationMetadata,
  AggregationKeySet,
  PendingCheckContext,
  RedisClient,
  AggregationReadResult,
  // Queue processor types
  AggregationReadyCallback,
  PendingAnalysisCallback,
  ProcessorErrorCallback,
  ProcessorStats,
  ProcessorControl,
  ConsolidatedAnalysisPayload,
  AnalysisQueueProcessorOptions,
  // Worker types
  WorkerErrorCallback,
  WorkerStats,
  WorkerControl,
  AggregatorWorkerOptions,
} from "./types.js";

// ==================== Constants & Serialization (from types.ts) ====================

export {
  serializeAggregationKey,
  deserializeAggregationKey,
  DEFAULT_AGGREGATION_CONFIG,
  AGGREGATION_KEYS,
} from "./types.js";

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
} from "./aggregatorHelpers.js";

// ==================== Write Operations ====================

export { addFailureToRedis, addPendingCheckToRedis } from "./aggregatorWrite.js";

// ==================== Read Operations ====================

export {
  getAggregationFromRedis,
  getPendingAggregationFromRedis,
  getAggregationResult,
  getPendingAggregationResult,
} from "./aggregatorRead.js";

// ==================== Delete Operations ====================

export { deleteAggregationFromRedis } from "./redisAggregator.js";

// ==================== Scanner ====================

export {
  isDebounceExpired,
  isMaxWaitExceeded,
  findReadyAggregations,
} from "./aggregationScanner.js";

// ==================== Enqueuer ====================

export { enqueueAggregation, enqueuePendingAggregation } from "./aggregationEnqueuer.js";

// ==================== Worker ====================

export { startAggregatorWorker } from "./aggregatorWorker.js";

// ==================== Queue Processor ====================

export { startAnalysisQueueProcessor, deserializeQueuePayload } from "./analysisQueueProcessor.js";
