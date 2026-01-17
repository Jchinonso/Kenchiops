/**
 * Stage 2: Extraction Types
 *
 * TypeScript interfaces for the extraction stage of the CI log analysis pipeline.
 * Handles LLM-based artifact extraction from log chunks.
 *
 * @module formatting/chunkingStage2Types
 */

import type {
  ArtifactType,
  ArtifactSeverity,
  ArtifactConfidence,
  CIPlatformType,
} from "../constants/chunkingPipeline.js";

// ==================== Extraction Options ====================

/**
 * Options for the extraction stage.
 */
export interface ExtractionOptions {
  /** Maximum parallel extraction requests (default: 5) */
  readonly concurrency?: number;
  /** Timeout per extraction request in milliseconds (default: 10000) */
  readonly timeoutMs?: number;
  /** Retry delay after timeout in milliseconds (default: 5000) */
  readonly retryDelayMs?: number;
  /** Maximum artifacts to extract per chunk (default: 20) */
  readonly maxArtifactsPerChunk?: number;
  /** Abort threshold - fail if this fraction of chunks fail (default: 0.5) */
  readonly chunkFailureThreshold?: number;
  /** Model to use for extraction */
  readonly model?: string;
  /** Optional framework hint for better extraction */
  readonly frameworkHint?: string;
  /** Optional CI platform hint */
  readonly ciPlatformHint?: CIPlatformType;
}

// ==================== Extracted Artifacts ====================

/**
 * An artifact extracted from a log chunk.
 */
export interface ExtractedArtifact {
  /**
   * Evidence ID format: "chunk#<id>:L<start>-L<end>"
   * Line numbers are relative to the chunk.
   */
  readonly evidenceId: string;
  /** Type of artifact */
  readonly type: ArtifactType;
  /** Severity level */
  readonly severity: ArtifactSeverity;
  /** File path if explicitly present in the log */
  readonly filePath?: string;
  /** Line number if explicitly present */
  readonly lineNumber?: number;
  /** Column number if explicitly present */
  readonly column?: number;
  /** Test name for test failures */
  readonly testName?: string;
  /** Test suite for test failures */
  readonly testSuite?: string;
  /** Expected value for assertion failures */
  readonly expected?: string | null;
  /** Actual value for assertion failures */
  readonly actual?: string | null;
  /** Error code if present */
  readonly errorCode?: string;
  /** Error message text */
  readonly errorMessage: string;
  /** Verbatim 1-3 lines from the chunk */
  readonly snippet: string;
  /** Line number within chunk where snippet starts (1-indexed) */
  readonly snippetLineStart: number;
  /** Detected framework (only if explicitly detected) */
  readonly framework?: string;
  /** Confidence level */
  readonly confidence: ArtifactConfidence;
  /** Hash of assertion content for deduplication discrimination */
  readonly assertion_hash?: string;
}

// ==================== Extraction Results ====================

/**
 * Result of extracting artifacts from a single chunk.
 */
export interface ExtractionResult {
  /** Chunk ID that was processed */
  readonly chunkId: number;
  /** Extracted artifacts */
  readonly artifacts: readonly ExtractedArtifact[];
  /** Time taken for extraction in milliseconds */
  readonly extractionTimeMs: number;
  /** Model used for extraction */
  readonly modelUsed: string;
  /** Whether extraction succeeded */
  readonly success: boolean;
  /** Error message if extraction failed */
  readonly error?: string;
}

/**
 * Result of extracting artifacts from all chunks.
 */
export interface BatchExtractionResult {
  /** Results for each chunk */
  readonly results: readonly ExtractionResult[];
  /** Total chunks processed */
  readonly totalChunks: number;
  /** Number of successful extractions */
  readonly successfulChunks: number;
  /** Number of failed extractions */
  readonly failedChunks: number;
  /** Total artifacts extracted */
  readonly totalArtifacts: number;
  /** Whether the batch was aborted due to too many failures */
  readonly aborted: boolean;
  /** Abort reason if aborted */
  readonly abortReason?: string;
}

// ==================== Primary Failure ====================

/**
 * Causality-aware primary failure determination.
 * Identifies the root cause among multiple failures.
 */
export interface PrimaryFailure {
  /** Artifact type of the primary failure */
  readonly type: ArtifactType;
  /** Index of primary failure in artifacts array */
  readonly artifactIndex: number;
  /** Confidence level in causality determination */
  readonly confidence: "high" | "medium" | "low";
  /** Reasoning for selection */
  readonly reason: string;
  /** Evidence ID supporting this determination */
  readonly evidenceId: string;
  /** Whether final analyzer can override this determination */
  readonly overrideAllowed: boolean;
  /** Whether determined via heuristics or LLM */
  readonly method: "heuristic" | "llm";
}
