/**
 * Analysis Module
 *
 * Stage 4 of the CI log analysis pipeline - final analysis and
 * field resolution from multiple sources.
 *
 * @module formatting/analysis
 */

// Types
export type {
  AnalysisLike,
  ResolvedAnnotation,
  ResolvedAction,
  ResolvedDependencyChange,
  BuildMetadata,
  FileAnnotation,
  RecommendedAction,
  SecondaryFinding,
  TestFailureDetail,
  LintErrorDetail,
  RootCause,
  AnalysisMetadata,
  FailureCategory,
  ConfidenceLevel,
  AnalysisResponse,
} from "./types.js";

// Resolvers
export {
  resolveIdentifiedCause,
  resolveAnnotations,
  resolveRecommendedActions,
  resolveDependencyChanges,
  resolveBuildConfigChanges,
} from "./resolvers.js";
