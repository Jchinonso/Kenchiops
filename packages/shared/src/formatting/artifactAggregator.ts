/**
 * Artifact Aggregator Module (Stage 3)
 *
 * Deterministically merges and ranks artifacts from all chunks.
 * NO LLM calls - pure algorithmic processing.
 *
 * ADDED FOR CHUNKING PIPELINE: Stage 3 - deduplication, ranking,
 * and aggregation of extracted artifacts.
 *
 * @module formatting/artifactAggregator
 */

import {
  CHUNKING_AGGREGATION_DEFAULTS,
  DEGRADED_MODE_CONFIG,
  DEGRADED_MODE_PROMPT,
  ARTIFACT_TYPES,
  type CIPlatformType,
} from "../constants/index.js";

import type {
  ChunkResult,
  BatchExtractionResult,
  AggregatedEvidence,
  PrimaryFailure,
} from "./chunkingTypes.js";

import { createLogger } from "../index.js";

// Internal imports for this module
import {
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
} from "./artifactRanking.js";

import { determinePrimaryFailure } from "./primaryFailureDetermination.js";

// Re-export from split modules for backwards compatibility
export {
  computeArtifactSignature,
  computeArtifactSignatureSync,
  computeAbsoluteEvidenceId,
} from "./artifactSignature.js";

export {
  computePriorityScore,
  createRankedArtifact,
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
} from "./artifactRanking.js";

export { determinePrimaryFailure } from "./primaryFailureDetermination.js";

const logger = createLogger("artifactAggregator");

// ==================== Degraded Mode ====================

/**
 * Degraded mode primary failure result.
 * Used when extraction fails and no analysis is possible.
 */
const createDegradedPrimaryFailure = (errorMessage: string): PrimaryFailure => ({
  type: ARTIFACT_TYPES.GENERIC_ERROR,
  artifactIndex: -1,
  confidence: "low",
  reason: `Degraded mode - ${errorMessage}`,
  evidenceId: "",
  overrideAllowed: true,
  method: "heuristic",
});

/**
 * Creates degraded mode result when extraction/aggregation fails.
 * Preserves raw log context for manual analysis.
 *
 * @param rawLogContent - Raw log content for preview
 * @param errorMessage - Error message describing the failure
 * @param chunksProcessed - Number of chunks that were processed
 * @param chunksFailed - Number of chunks that failed
 * @param detectedPlatform - Detected CI platform
 * @returns AggregatedEvidence in degraded mode
 */
export const createDegradedResult = (
  rawLogContent: string,
  errorMessage: string,
  chunksProcessed: number = 0,
  chunksFailed: number = 0,
  detectedPlatform?: CIPlatformType
): AggregatedEvidence => {
  logger.warn("Creating degraded mode result", {
    errorMessage,
    chunksProcessed,
    chunksFailed,
  });

  return {
    artifacts: [],
    totalExtracted: 0,
    duplicatesRemoved: 0,
    chunksProcessed,
    chunksFailed,
    primaryFailureType: undefined,
    detectedFramework: undefined,
    detectedCIPlatform: detectedPlatform,
    primaryFailure: createDegradedPrimaryFailure(errorMessage),
    degraded_mode: true,
    rawLogPreview: rawLogContent.slice(0, DEGRADED_MODE_CONFIG.RAW_LOG_PREVIEW_LENGTH),
  };
};

/**
 * Samples log content for degraded mode analysis.
 * Takes first N lines and last N lines to capture both setup and failure context.
 *
 * @param logContent - Full sanitized log content
 * @returns Sampled log content with marker between sections
 */
export const sampleLogForDegradedMode = (logContent: string): string => {
  const lines = logContent.split("\n");
  const topLines = DEGRADED_MODE_CONFIG.SAMPLE_TOP_LINES;
  const bottomLines = DEGRADED_MODE_CONFIG.SAMPLE_BOTTOM_LINES;

  if (lines.length <= topLines + bottomLines) {
    return logContent;
  }

  const topSection = lines.slice(0, topLines);
  const bottomSection = lines.slice(-bottomLines);
  const omittedCount = lines.length - topLines - bottomLines;

  return [...topSection, `\n... [${omittedCount} lines omitted] ...\n`, ...bottomSection].join(
    "\n"
  );
};

/**
 * Builds the prompt for degraded mode analysis.
 * Combines the degraded mode system prompt with sampled log content.
 *
 * @param sanitizedLog - The sanitized log content
 * @returns Complete prompt for degraded mode analysis
 */
export const buildDegradedModePrompt = (sanitizedLog: string): string => {
  const sampledLog = sampleLogForDegradedMode(sanitizedLog);
  return `${DEGRADED_MODE_PROMPT}${sampledLog}`;
};

/**
 * Type for the degraded mode analyzer function.
 * Abstracts the actual LLM call for degraded mode analysis.
 */
export type DegradedModeAnalyzer = (
  prompt: string,
  options: { timeoutMs: number; model: string }
) => Promise<string>;

/**
 * Analyzes a log in degraded mode when normal extraction fails.
 * Uses sampled content (first N + last N lines) for basic error detection.
 *
 * @param sanitizedLog - The sanitized log content
 * @param analyzer - Function to call the LLM
 * @param options - Analysis options
 * @returns Raw LLM response string (caller should parse)
 */
export const analyzeDegradedMode = async (
  sanitizedLog: string,
  analyzer: DegradedModeAnalyzer,
  options: { timeoutMs: number; model: string }
): Promise<string> => {
  logger.info("Running degraded mode analysis", {
    logLength: sanitizedLog.length,
    model: options.model,
  });

  const prompt = buildDegradedModePrompt(sanitizedLog);
  const response = await analyzer(prompt, options);

  logger.info("Degraded mode analysis complete", {
    responseLength: response.length,
  });

  return response;
};

// ==================== Main Aggregation ====================

/**
 * Aggregates artifacts from batch extraction results.
 * This is the main entry point for Stage 3.
 *
 * @param batchResult - Results from batch extraction
 * @param chunks - Original chunks (for line offsets)
 * @param maxArtifacts - Maximum artifacts to return (default from config)
 * @param detectedPlatform - Detected CI platform
 * @returns Aggregated evidence
 */
export const aggregateArtifacts = (
  batchResult: BatchExtractionResult,
  chunks: readonly ChunkResult[],
  maxArtifacts: number = CHUNKING_AGGREGATION_DEFAULTS.MAX_FINAL_ARTIFACTS,
  detectedPlatform?: CIPlatformType
): AggregatedEvidence => {
  // Build chunk line offset map
  const chunkLineOffsets = new Map<number, number>();
  chunks.forEach((chunk) => {
    chunkLineOffsets.set(chunk.chunkId, chunk.lineOffset);
  });

  // Deduplicate artifacts
  const { artifacts, totalExtracted, duplicatesRemoved } = deduplicateArtifacts(
    batchResult.results,
    chunkLineOffsets
  );

  // Sort by priority
  const sortedArtifacts = sortArtifactsByPriority(artifacts);

  // Select top N
  const selectedArtifacts = sortedArtifacts.slice(0, maxArtifacts);

  // Determine primary failure using causality-aware algorithm
  const primaryFailure = determinePrimaryFailure(selectedArtifacts);

  // Get primary failure type from determination
  const primaryFailureType =
    primaryFailure.artifactIndex >= 0
      ? selectedArtifacts[primaryFailure.artifactIndex].type
      : undefined;

  // Detect common framework
  const allArtifacts = batchResult.results.flatMap((result) =>
    result.success ? result.artifacts : []
  );
  const detectedFramework = detectCommonFramework(allArtifacts);

  return {
    artifacts: selectedArtifacts,
    totalExtracted,
    duplicatesRemoved,
    chunksProcessed: batchResult.successfulChunks,
    chunksFailed: batchResult.failedChunks,
    primaryFailureType,
    detectedFramework,
    detectedCIPlatform: detectedPlatform,
    primaryFailure,
    degraded_mode: false,
  };
};

// ==================== Utility Functions ====================

/**
 * Viability check definition.
 */
interface ViabilityCheck {
  readonly condition: (result: BatchExtractionResult, threshold: number) => boolean;
  readonly getMessage: (result: BatchExtractionResult, threshold: number) => string;
}

/**
 * Ordered viability checks. First failing check returns its message.
 */
const VIABILITY_CHECKS: readonly ViabilityCheck[] = [
  {
    condition: (result) => result.aborted,
    getMessage: (result) => result.abortReason ?? "Batch was aborted",
  },
  {
    condition: (result) => result.totalChunks === 0,
    getMessage: () => "No chunks to process",
  },
  {
    condition: (result, threshold) => result.failedChunks / result.totalChunks > threshold,
    getMessage: (result, threshold) => {
      const failureRate = result.failedChunks / result.totalChunks;
      return `Chunk failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}%`;
    },
  },
];

/**
 * Checks if aggregation should proceed based on extraction results.
 * Uses handler pattern with find to check viability conditions.
 *
 * @param batchResult - Batch extraction result
 * @param threshold - Failure threshold (default: half)
 * @returns Error message if should abort, undefined otherwise
 */
export const checkAggregationViability = (
  batchResult: BatchExtractionResult,
  threshold: number = 0.5
): string | undefined => {
  const failedCheck = VIABILITY_CHECKS.find((check) => check.condition(batchResult, threshold));

  return failedCheck?.getMessage(batchResult, threshold);
};

/**
 * Creates an empty aggregated evidence result for edge cases.
 *
 * @param chunksProcessed - Number of chunks processed
 * @param chunksFailed - Number of chunks that failed
 * @param detectedPlatform - Detected CI platform
 * @returns Empty aggregated evidence
 */
export const createEmptyAggregatedEvidence = (
  chunksProcessed: number = 0,
  chunksFailed: number = 0,
  detectedPlatform?: CIPlatformType
): AggregatedEvidence => ({
  artifacts: [],
  totalExtracted: 0,
  duplicatesRemoved: 0,
  chunksProcessed,
  chunksFailed,
  primaryFailureType: undefined,
  detectedFramework: undefined,
  detectedCIPlatform: detectedPlatform,
  primaryFailure: {
    type: ARTIFACT_TYPES.GENERIC_ERROR,
    artifactIndex: -1,
    confidence: "low",
    reason: "No artifacts extracted",
    evidenceId: "",
    overrideAllowed: true,
    method: "heuristic",
  },
  degraded_mode: false,
});
