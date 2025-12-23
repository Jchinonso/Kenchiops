/**
 * Aggregation module exports.
 *
 * Provides failure aggregation functionality for consolidating
 * multiple CI check run failures into a single analysis.
 */

export type {
  CodeAnnotation,
  RecommendedAction,
  AnalyzedFailure,
  PRContext,
  WorkflowContext,
  RepositoryInfo,
  AggregatedFailures,
  AggregationKey,
  AggregationConfig,
  PendingAggregation,
  ConsolidatedPostResult,
} from "./types.js";

export {
  serializeAggregationKey,
  deserializeAggregationKey,
  DEFAULT_AGGREGATION_CONFIG,
} from "./types.js";

export {
  FailureAggregator,
  initializeAggregator,
  getAggregator,
  destroyAggregator,
  type AggregationReadyCallback,
} from "./failureAggregator.js";

export { postConsolidatedAnalysis } from "./consolidatedPoster.js";
