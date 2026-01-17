/**
 * Chunking Pipeline Types
 *
 * TypeScript interfaces for the multi-stage CI log analysis pipeline.
 * These types define the contracts between pipeline stages.
 *
 * This is a barrel file that re-exports from stage-specific type modules.
 * Import types from this file for convenience, or from individual stage
 * files for more targeted imports.
 *
 * @module formatting/chunkingTypes
 */

// ==================== Re-export Stage 1: Chunking Types ====================

export type {
  ChunkingOptions,
  ProtectedZone,
  LineMapping,
  ChunkResult,
  ChunkingResult,
} from "./chunkingStage1Types.js";

// ==================== Re-export Stage 2: Extraction Types ====================

export type {
  ExtractionOptions,
  ExtractedArtifact,
  ExtractionResult,
  BatchExtractionResult,
  PrimaryFailure,
} from "./chunkingStage2Types.js";

// ==================== Re-export Stage 3: Aggregation Types ====================

export type {
  ArtifactSignature,
  RankedArtifact,
  AggregatedEvidence,
} from "./chunkingStage3Types.js";

// ==================== Re-export Stage 4: Final Analysis Types ====================

export type {
  BuildMetadata,
  FileAnnotation,
  RecommendedAction,
  SecondaryFinding,
  TestFailureDetail,
  LintErrorDetail,
  RootCause,
  AnalysisMetadata,
  AnalysisResponse,
} from "./chunkingStage4Types.js";

// ==================== Re-export Pipeline Types ====================

export type {
  PipelineConfig,
  PipelineResult,
  PipelineErrorCode,
  PipelineError,
} from "./chunkingPipelineTypes.js";
