/**
 * Pipeline Configuration Types
 *
 * TypeScript interfaces for pipeline-level configuration and execution results.
 * These types orchestrate the multi-stage CI log analysis pipeline.
 *
 * @module formatting/chunkingPipelineTypes
 */

import type { ChunkingOptions } from "./chunkingStage1Types.js";
import type { ExtractionOptions } from "./chunkingStage2Types.js";
import type { AggregatedEvidence } from "./chunkingStage3Types.js";
import type { BuildMetadata, AnalysisResponse } from "./chunkingStage4Types.js";

// ==================== Pipeline Configuration ====================

/**
 * Complete pipeline configuration.
 */
export interface PipelineConfig {
  /** Chunking options */
  readonly chunking: ChunkingOptions;
  /** Extraction options */
  readonly extraction: ExtractionOptions;
  /** Maximum artifacts to pass to final analysis */
  readonly maxFinalArtifacts: number;
  /** Model to use for final analysis */
  readonly finalAnalysisModel: string;
}

// ==================== Pipeline Result ====================

/**
 * Pipeline execution result.
 */
export interface PipelineResult {
  /** Final analysis response */
  readonly analysis: AnalysisResponse;
  /** Aggregated evidence used for analysis */
  readonly evidence: AggregatedEvidence;
  /** Build metadata */
  readonly buildMetadata: BuildMetadata;
  /** Total processing time in milliseconds */
  readonly totalTimeMs: number;
  /** Whether chunking was used */
  readonly usedChunking: boolean;
}

// ==================== Pipeline Errors ====================

/**
 * Pipeline error codes.
 */
export type PipelineErrorCode =
  | "EXTRACTION_FAILED"
  | "CHUNK_THRESHOLD_EXCEEDED"
  | "ANALYSIS_FAILED"
  | "INVALID_INPUT"
  | "TIMEOUT";

/**
 * Pipeline error with structured information.
 */
export interface PipelineError {
  /** Error code */
  readonly code: PipelineErrorCode;
  /** Error message */
  readonly message: string;
  /** Additional details */
  readonly details?: {
    readonly failedChunks?: number;
    readonly totalChunks?: number;
    readonly threshold?: number;
  };
}
