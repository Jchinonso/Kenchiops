/**
 * Extraction Types
 *
 * Type definitions for the chunk extraction pipeline (Stage 2).
 *
 * @module formatting/extraction/types
 */

import type {
  CIPlatformType,
  ArtifactType,
  ArtifactSeverity,
  ArtifactConfidence,
} from "../../constants/index.js";
import type { ChunkResult } from "../chunking/types.js";

// ==================== Extraction Options ====================

/**
 * Options for chunk extraction.
 */
export interface ExtractionOptions {
  /** Number of chunks to process in parallel (default: 3) */
  readonly concurrency?: number;
  /** Timeout for each extraction call in milliseconds (default: 30000) */
  readonly timeoutMs?: number;
  /** Delay before retry on failure in milliseconds (default: 1000) */
  readonly retryDelayMs?: number;
  /** Maximum artifacts to extract per chunk (default: 10) */
  readonly maxArtifactsPerChunk?: number;
  /** Threshold for aborting batch (failure rate) (default: 0.5) */
  readonly chunkFailureThreshold?: number;
  /** Model to use for extraction (default: "haiku") */
  readonly model?: string;
  /** Optional detected test framework hint */
  readonly frameworkHint?: string;
  /** Optional detected CI platform hint */
  readonly ciPlatformHint?: CIPlatformType;
}

// ==================== Extracted Artifact ====================

/**
 * An artifact extracted from a log chunk.
 */
export interface ExtractedArtifact {
  /** Evidence ID in format "chunk#N:L<start>-L<end>" */
  readonly evidenceId: string;
  /** Type of artifact */
  readonly type: ArtifactType;
  /** Severity level */
  readonly severity: ArtifactSeverity;
  /** Error message */
  readonly errorMessage: string;
  /** Verbatim snippet from log (1-3 lines) */
  readonly snippet: string;
  /** Line number where snippet starts (1-indexed, relative to chunk) */
  readonly snippetLineStart: number;
  /** Confidence level of extraction */
  readonly confidence: ArtifactConfidence;
  /** Hash for deduplication discrimination */
  readonly assertion_hash: string;
  /** Optional file path */
  readonly filePath?: string;
  /** Optional line number in source file */
  readonly lineNumber?: number;
  /** Optional column number */
  readonly column?: number;
  /** Optional test name */
  readonly testName?: string;
  /** Optional test suite */
  readonly testSuite?: string;
  /** Optional expected value */
  readonly expected?: string | null;
  /** Optional actual value */
  readonly actual?: string | null;
  /** Optional error code */
  readonly errorCode?: string;
  /** Optional detected framework */
  readonly framework?: string;
}

// ==================== Extraction Results ====================

/**
 * Result of extracting artifacts from a single chunk.
 */
export interface ExtractionResult {
  /** Chunk ID */
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
 * Result of batch extraction from all chunks.
 */
export interface BatchExtractionResult {
  /** Results for each chunk */
  readonly results: readonly ExtractionResult[];
  /** Total number of chunks */
  readonly totalChunks: number;
  /** Number of chunks successfully processed */
  readonly successfulChunks: number;
  /** Number of chunks that failed */
  readonly failedChunks: number;
  /** Total artifacts extracted */
  readonly totalArtifacts: number;
  /** Whether batch was aborted early */
  readonly aborted: boolean;
  /** Reason for abort if aborted */
  readonly abortReason?: string;
}

// ==================== Primary Failure ====================

/**
 * Primary failure determination.
 */
export interface PrimaryFailure {
  /** Type of the primary failure artifact */
  readonly type: ArtifactType;
  /** Index of primary artifact in ranked list (-1 if none) */
  readonly artifactIndex: number;
  /** Confidence in primary failure determination */
  readonly confidence: ArtifactConfidence;
  /** Explanation for why this is primary */
  readonly reason: string;
  /** Evidence ID of primary artifact */
  readonly evidenceId: string;
  /** Whether override is allowed */
  readonly overrideAllowed: boolean;
  /** Method used for determination */
  readonly method: "heuristic" | "llm";
}

// ==================== Internal Types ====================

/**
 * Type for the extraction function that callers must provide.
 * This abstracts the actual LLM call.
 */
export type ExtractorFunction = (
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs: number; model: string }
) => Promise<string>;

/**
 * Context for a single extraction attempt.
 */
export interface ExtractionContext {
  readonly chunk: ChunkResult;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly options: NormalizedExtractionOptions;
}

/**
 * Normalized extraction options with all defaults resolved.
 */
export interface NormalizedExtractionOptions {
  readonly concurrency: number;
  readonly timeoutMs: number;
  readonly retryDelayMs: number;
  readonly maxArtifactsPerChunk: number;
  readonly chunkFailureThreshold: number;
  readonly model: string;
  readonly frameworkHint?: string;
  readonly ciPlatformHint?: CIPlatformType;
}

/**
 * Optional field extractor configuration.
 */
export interface OptionalFieldExtractor {
  readonly sourceKey: string;
  readonly targetKey: keyof ExtractedArtifact;
  readonly extract: (value: unknown) => unknown;
  readonly isValid: (value: unknown) => boolean;
}

/**
 * Internal state for batch processing accumulator.
 */
export interface BatchProcessingState {
  readonly results: readonly ExtractionResult[];
  readonly aborted: boolean;
  readonly abortReason: string | undefined;
}

/**
 * Result of an operation attempt - either success with value or failure with error.
 */
export type AttemptResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: Error };

// ==================== Test Summary ====================

/**
 * Deterministic test summary parsed from CI runner output via regex.
 * Not LLM-derived — guaranteed consistent across runs for the same log.
 */
export interface ParsedTestSummary {
  /** Number of tests reported as failed by the test runner */
  readonly failed: number;
  /** Number of tests reported as passed (0 if not parseable) */
  readonly passed: number;
  /** Total test count (0 if not parseable) */
  readonly total: number;
  /** Detected test framework (jest, pytest, rust, go, generic) */
  readonly framework: string;
  /** Number of failed test suites (if available, e.g., Jest "Test Suites: 12 failed") */
  readonly failedSuites?: number;
}
