/**
 * Aggregation Module
 *
 * Stage 3 of the CI log analysis pipeline - deduplication, ranking,
 * and aggregation of extracted artifacts.
 *
 * @module formatting/aggregation
 */

// Types
export type {
  ArtifactSignatureComponents,
  ArtifactSignature,
  RankedArtifact,
  AggregatedEvidence,
  ArtifactTracker,
  DeduplicationResult,
  FrameworkCount,
  ArtifactScore,
  ScoringComponent,
  ViabilityCheck,
  DegradedModeAnalyzer,
  ParsedEvidenceId,
} from "./types.js";

// Signature
export {
  computeArtifactSignature,
  computeArtifactSignatureSync,
  computeAbsoluteEvidenceId,
} from "./signature.js";

// Ranking
export {
  computePriorityScore,
  createRankedArtifact,
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
} from "./ranking.js";

// Primary Failure
export { determinePrimaryFailure } from "./primaryFailure.js";

// Aggregator
export {
  createDegradedResult,
  sampleLogForDegradedMode,
  buildDegradedModePrompt,
  analyzeDegradedMode,
  aggregateArtifacts,
  checkAggregationViability,
  createEmptyAggregatedEvidence,
} from "./aggregator.js";
