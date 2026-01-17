/**
 * Stage 3: Aggregation Types
 *
 * TypeScript interfaces for the aggregation stage of the CI log analysis pipeline.
 * Handles deduplication, ranking, and merging of extracted artifacts.
 *
 * @module formatting/chunkingStage3Types
 */

import type { ArtifactType, CIPlatformType } from "../constants/chunkingPipeline.js";
import type { ExtractedArtifact, PrimaryFailure } from "./chunkingStage2Types.js";
import type { LineMapping } from "./chunkingStage1Types.js";

// ==================== Artifact Signature ====================

/**
 * Signature components used for deduplication.
 */
export interface ArtifactSignature {
  /** Truncated SHA hash of signature components (length from SIGNATURE_HASH_LENGTH) */
  readonly hash: string;
  /** Components that were hashed (for debugging) */
  readonly components: {
    readonly type: ArtifactType;
    readonly filePath?: string;
    readonly lineNumber?: number;
    readonly errorCode?: string;
    readonly testName?: string;
    /** Hash of assertion content for deduplication discrimination (high-confidence only) */
    readonly assertionHash?: string;
  };
}

// ==================== Ranked Artifact ====================

/**
 * An artifact after ranking and deduplication.
 */
export interface RankedArtifact extends ExtractedArtifact {
  /** Computed priority score */
  readonly priorityScore: number;
  /** Chunk ID where first occurrence was found */
  readonly firstOccurrenceChunk: number;
  /** Number of times this artifact appeared (after dedup) */
  readonly occurrenceCount: number;
  /** Signature used for deduplication */
  readonly signature: ArtifactSignature;
  /**
   * Absolute evidence ID with line offset applied.
   * Format: "chunk#<id>:L<absoluteStart>-L<absoluteEnd>"
   */
  readonly absoluteEvidenceId: string;
  /** Original line number where artifact starts (in raw log before preprocessing) */
  readonly originalLineStart?: number;
  /** Original line number where artifact ends (in raw log before preprocessing) */
  readonly originalLineEnd?: number;
}

// ==================== Aggregated Evidence ====================

/**
 * Result of aggregating artifacts from all chunks.
 */
export interface AggregatedEvidence {
  /** Ranked artifacts (top N after dedup) */
  readonly artifacts: readonly RankedArtifact[];
  /** Total artifacts extracted before deduplication */
  readonly totalExtracted: number;
  /** Number of duplicates removed */
  readonly duplicatesRemoved: number;
  /** Number of chunks processed */
  readonly chunksProcessed: number;
  /** Number of chunks that failed extraction */
  readonly chunksFailed: number;
  /** Primary failure type (highest priority type found) */
  readonly primaryFailureType?: ArtifactType;
  /** Detected framework if consistently detected across chunks */
  readonly detectedFramework?: string;
  /** Detected CI platform */
  readonly detectedCIPlatform?: CIPlatformType;
  /** Primary failure determination with causality analysis */
  readonly primaryFailure?: PrimaryFailure;
  /** True if extraction failed and using fallback mode */
  readonly degraded_mode?: boolean;
  /** Raw log preview when in degraded mode */
  readonly rawLogPreview?: string;
  /** Line mappings for annotation correction (sanitized to original line numbers) */
  readonly lineMappings?: readonly LineMapping[];
}
