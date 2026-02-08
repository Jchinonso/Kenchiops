/**
 * Aggregation Types
 *
 * Type definitions for the artifact aggregation pipeline (Stage 3).
 *
 * @module formatting/aggregation/types
 */

import type { ArtifactType, CIPlatformType } from "../../constants/index.js";
import type { ExtractedArtifact, PrimaryFailure } from "../extraction/types.js";

// ==================== Artifact Signature ====================

/**
 * Signature components for artifact deduplication.
 */
export interface ArtifactSignatureComponents {
  readonly type: ArtifactType;
  readonly filePath?: string;
  readonly lineNumber?: number;
  readonly errorCode?: string;
  readonly testName?: string;
  readonly assertionHash?: string;
  /** Hash of snippet content to differentiate artifacts with same error but different context */
  readonly snippetHash?: string;
  /** Evidence ID for test_failure artifacts to prevent collapsing unique test failures */
  readonly evidenceId?: string;
}

/**
 * Artifact signature for deduplication.
 */
export interface ArtifactSignature {
  readonly hash: string;
  readonly components: ArtifactSignatureComponents;
}

// ==================== Ranked Artifact ====================

/**
 * An artifact with ranking and aggregation metadata.
 */
export interface RankedArtifact extends ExtractedArtifact {
  /** Computed priority score based on type */
  readonly priorityScore: number;
  /** First chunk where this artifact was found */
  readonly firstOccurrenceChunk: number;
  /** Number of times this artifact appeared across chunks */
  readonly occurrenceCount: number;
  /** Computed signature for deduplication */
  readonly signature: ArtifactSignature;
  /** Absolute evidence ID (adjusted for chunk offset) */
  readonly absoluteEvidenceId: string;
  /** Original line number where artifact starts (in raw log before preprocessing) */
  readonly originalLineStart?: number;
  /** Original line number where artifact ends (in raw log before preprocessing) */
  readonly originalLineEnd?: number;
}

// ==================== Aggregated Evidence ====================

/**
 * Aggregated evidence from all chunks.
 */
export interface AggregatedEvidence {
  /** Ranked and deduplicated artifacts */
  readonly artifacts: readonly RankedArtifact[];
  /** Total artifacts extracted (before deduplication) */
  readonly totalExtracted: number;
  /** Number of duplicates removed */
  readonly duplicatesRemoved: number;
  /** Number of chunks successfully processed */
  readonly chunksProcessed: number;
  /** Number of chunks that failed */
  readonly chunksFailed: number;
  /** Type of primary failure */
  readonly primaryFailureType: ArtifactType | undefined;
  /** Detected framework across artifacts */
  readonly detectedFramework: string | undefined;
  /** Detected CI platform */
  readonly detectedCIPlatform: CIPlatformType | undefined;
  /** Primary failure determination */
  readonly primaryFailure: PrimaryFailure;
  /** Whether in degraded mode */
  readonly degraded_mode: boolean;
  /** Raw log preview for degraded mode */
  readonly rawLogPreview?: string;
}

// ==================== Internal Types ====================

/**
 * Artifact with chunk context for deduplication processing.
 */
export interface ArtifactWithContext {
  readonly artifact: ExtractedArtifact;
  readonly chunkId: number;
  readonly chunkLineOffset: number;
}

/**
 * Internal type for tracking artifacts during deduplication.
 */
export interface ArtifactTracker {
  readonly artifact: ExtractedArtifact;
  readonly chunkId: number;
  readonly chunkLineOffset: number;
  readonly count: number;
}

/**
 * Result of artifact deduplication.
 */
export interface DeduplicationResult {
  readonly artifacts: readonly RankedArtifact[];
  readonly totalExtracted: number;
  readonly duplicatesRemoved: number;
}

/**
 * Framework count entry for tracking occurrences.
 */
export interface FrameworkCount {
  readonly framework: string;
  readonly count: number;
}

/**
 * Artifact score entry for primary failure determination.
 */
export interface ArtifactScore {
  readonly index: number;
  readonly score: number;
  readonly reasons: readonly string[];
}

/**
 * Scoring component for building artifact scores functionally.
 */
export interface ScoringComponent {
  readonly score: number;
  readonly reason: string | null;
}

/**
 * Viability check definition.
 */
export interface ViabilityCheck {
  readonly condition: (
    result: { aborted: boolean; totalChunks: number; failedChunks: number },
    threshold: number
  ) => boolean;
  readonly getMessage: (
    result: { aborted: boolean; totalChunks: number; failedChunks: number; abortReason?: string },
    threshold: number
  ) => string;
}

// ==================== Degraded Mode Types ====================

/**
 * Type for the degraded mode analyzer function.
 */
export type DegradedModeAnalyzer = (
  prompt: string,
  options: { timeoutMs: number; model: string }
) => Promise<string>;

// ==================== Signature Types ====================

/**
 * Parsed evidence ID components.
 */
export interface ParsedEvidenceId {
  readonly chunkId: string;
  readonly startLine: number;
  readonly endLine: number;
}
