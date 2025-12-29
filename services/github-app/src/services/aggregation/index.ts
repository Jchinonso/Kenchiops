/**
 * Aggregation module exports.
 *
 * Types are re-exported from @kenchi/shared for convenience.
 * The consolidatedPoster handles posting to GitHub/Slack.
 */

// Re-export types from shared for backward compatibility
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
  ConsolidatedPostResult,
} from "@kenchi/shared";

export {
  serializeAggregationKey,
  deserializeAggregationKey,
  DEFAULT_AGGREGATION_CONFIG,
} from "@kenchi/shared";

// Consolidated poster (posts to GitHub/Slack)
export { postConsolidatedAnalysis } from "./consolidatedPoster.js";
