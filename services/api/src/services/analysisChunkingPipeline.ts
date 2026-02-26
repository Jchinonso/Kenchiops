/**
 * Analysis Chunking Pipeline
 *
 * Implements the multi-stage chunking pipeline for large CI logs.
 * Stage 1: Smart chunking with protected zone detection
 * Stage 2: Per-chunk artifact extraction using LLM
 * Stage 3: Aggregation, deduplication, and primary failure determination
 *
 * @module services/analysisChunkingPipeline
 */

import {
  createLogger,
  LOG_LEVELS,
  EVIDENCE_SOURCES,
  EVIDENCE_LOG_TIMING,
  SERVICE_NAMES,
  ARTIFACT_TYPES,
  config,
  // Chunking pipeline imports - Stage 1
  chunkLog,
  // Chunking pipeline imports - Stage 2
  extractFromAllChunks,
  // Chunking pipeline imports - Stage 3
  aggregateArtifacts,
  checkAggregationViability,
  createDegradedResult,
  type Evidence,
  type LogEntry,
  type RequestContext,
  type AggregatedEvidence,
} from "@kenchi/shared";
import { createLLMExtractor } from "../adapters/llmExtraction.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Configuration ====================

/**
 * Gets the extraction model for chunk processing.
 * Uses EXTRACTION_MODEL env var if set, otherwise falls back to Gemini 2.5 Flash
 * or the configured LLM_MODEL.
 */
const getExtractionModel = (): string =>
  config.EXTRACTION_MODEL || config.LLM_MODEL || "gemini-2.5-flash";

/**
 * Configuration for chunking pipeline.
 * Logs above this token threshold will use the multi-stage pipeline.
 */
export const CHUNKING_PIPELINE_CONFIG = {
  /** Token threshold for using chunking pipeline (zero means always use chunking) */
  TOKEN_THRESHOLD: 0,
  /** Model to use for chunk extraction (uses configured LLM model) */
  get EXTRACTION_MODEL() {
    return getExtractionModel();
  },
  /** Timeout for extraction requests in milliseconds (per chunk, ~3000 tokens each) */
  EXTRACTION_TIMEOUT_MS: 60000,
  /** Maximum concurrent extraction requests */
  EXTRACTION_CONCURRENCY: 15,
} as const;

// ==================== Pipeline Execution ====================

/**
 * Executes the full chunking pipeline (Stages 1-3).
 *
 * Stage 1: Smart chunking with protected zone detection
 * Stage 2: Per-chunk artifact extraction using LLM
 * Stage 3: Aggregation, deduplication, and primary failure determination
 *
 * @param failureLog - The preprocessed failure log content
 * @param repository - Repository name for logging
 * @param context - Request context for tracing
 * @returns Aggregated evidence from the pipeline
 */
export const executeChunkingPipeline = async (
  failureLog: string,
  repository: string,
  context: RequestContext
): Promise<AggregatedEvidence> => {
  const logContext = { ...context };
  const startTime = Date.now();

  // Stage 1: Smart Chunking
  logger.info("Chunking pipeline Stage 1: Chunking log", { repository, ...logContext });
  const chunkingResult = chunkLog(failureLog);

  logger.info("Chunking complete", {
    repository,
    totalChunks: chunkingResult.chunks.length,
    totalTokens: chunkingResult.totalTokens,
    skippedChunking: chunkingResult.skippedChunking,
    detectedPlatform: chunkingResult.detectedPlatform,
    ...logContext,
  });

  // Stage 2: Per-chunk extraction
  logger.info("Chunking pipeline Stage 2: Extracting artifacts from chunks", {
    repository,
    chunkCount: chunkingResult.chunks.length,
    ...logContext,
  });

  const extractor = createLLMExtractor();
  const batchResult = await extractFromAllChunks(chunkingResult.chunks, extractor, {
    concurrency: CHUNKING_PIPELINE_CONFIG.EXTRACTION_CONCURRENCY,
    timeoutMs: CHUNKING_PIPELINE_CONFIG.EXTRACTION_TIMEOUT_MS,
    model: CHUNKING_PIPELINE_CONFIG.EXTRACTION_MODEL,
  });

  logger.info("Extraction complete", {
    repository,
    successfulChunks: batchResult.successfulChunks,
    failedChunks: batchResult.failedChunks,
    totalArtifacts: batchResult.totalArtifacts,
    aborted: batchResult.aborted,
    ...logContext,
  });

  // Check viability before aggregation
  const viabilityError = checkAggregationViability(batchResult);
  if (viabilityError) {
    logger.warn("Aggregation viability check failed, using degraded mode", {
      repository,
      reason: viabilityError,
      ...logContext,
    });
    return createDegradedResult(
      failureLog,
      viabilityError,
      batchResult.successfulChunks,
      batchResult.failedChunks,
      chunkingResult.detectedPlatform
    );
  }

  // Stage 3: Aggregation and ranking
  logger.info("Chunking pipeline Stage 3: Aggregating artifacts", { repository, ...logContext });
  const aggregatedEvidence = aggregateArtifacts(
    batchResult,
    chunkingResult.chunks,
    undefined, // Use default maxArtifacts
    chunkingResult.detectedPlatform
  );

  const pipelineDurationMs = Date.now() - startTime;
  logger.info("Chunking pipeline complete", {
    repository,
    pipelineDurationMs,
    artifactCount: aggregatedEvidence.artifacts.length,
    totalExtracted: aggregatedEvidence.totalExtracted,
    duplicatesRemoved: aggregatedEvidence.duplicatesRemoved,
    primaryFailureType: aggregatedEvidence.primaryFailureType,
    detectedFramework: aggregatedEvidence.detectedFramework,
    degradedMode: aggregatedEvidence.degraded_mode,
    ...logContext,
  });

  return aggregatedEvidence;
};

// ==================== Evidence Conversion ====================

/**
 * Formats a test_failure artifact with structured metadata for easier LLM extraction.
 */
const formatTestFailureMessage = (artifact: {
  readonly type: string;
  readonly errorMessage: string;
  readonly snippet: string;
  readonly testName?: string;
  readonly filePath?: string;
  readonly lineNumber?: number;
  readonly expected?: string | null;
  readonly actual?: string | null;
}): string => {
  const parts: string[] = [];

  parts.push(`[${artifact.type}]`);

  if (artifact.testName) {
    parts.push(`Test: ${artifact.testName}`);
  }

  if (artifact.filePath) {
    const location = artifact.lineNumber
      ? `${artifact.filePath}:${artifact.lineNumber}`
      : artifact.filePath;
    parts.push(`File: ${location}`);
  }

  if (artifact.expected !== undefined && artifact.expected !== null) {
    parts.push(`Expected: ${artifact.expected}`);
  }

  if (artifact.actual !== undefined && artifact.actual !== null) {
    parts.push(`Actual: ${artifact.actual}`);
  }

  parts.push(`Error: ${artifact.errorMessage}`);
  parts.push(`\nSnippet:\n${artifact.snippet}`);

  return parts.join("\n");
};

/**
 * Converts aggregated evidence to Evidence format for final analysis.
 * Maps ranked artifacts to log entries that can be analyzed by the LLM.
 * Adds a summary of artifact counts to help the LLM output all items.
 */
export const convertAggregatedToEvidence = (
  aggregated: AggregatedEvidence,
  eventId: string,
  collectedAt: string
): Evidence => {
  // Count artifacts by type
  const artifactCounts = aggregated.artifacts.reduce(
    (counts, artifact) => {
      counts[artifact.type] = (counts[artifact.type] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>
  );

  const testFailureCount = artifactCounts[ARTIFACT_TYPES.TEST_FAILURE] ?? 0;

  // Convert artifacts to log entries
  const logs: LogEntry[] = aggregated.artifacts.map((artifact, index) => {
    // Use structured format for test_failure artifacts
    const message =
      artifact.type === ARTIFACT_TYPES.TEST_FAILURE
        ? formatTestFailureMessage(artifact)
        : `[${artifact.type}] ${artifact.errorMessage}\n\nSnippet:\n${artifact.snippet}`;

    return {
      id: `artifact_${index}`,
      level: artifact.severity === "fatal" ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO,
      message,
      timestamp: new Date(
        new Date(collectedAt).getTime() + index * EVIDENCE_LOG_TIMING.TIMESTAMP_OFFSET_MS
      ).toISOString(),
      source: EVIDENCE_SOURCES.CI,
    };
  });

  // Add artifact summary at the start to help LLM understand the full scope
  const countSummary = Object.entries(artifactCounts)
    .map(([type, count]) => `${type}: ${count}`)
    .join(", ");

  logs.unshift({
    id: "artifact_summary",
    level: LOG_LEVELS.INFO,
    message: `ARTIFACT SUMMARY: Total ${aggregated.artifacts.length} artifacts extracted. Breakdown: ${countSummary}.\n\nIMPORTANT: You MUST include ALL ${testFailureCount} test failures in your test_failures array. Each test_failure artifact below MUST have a corresponding entry.`,
    timestamp: collectedAt,
    source: EVIDENCE_SOURCES.CI,
  });

  // Add primary failure context if available
  if (aggregated.primaryFailure && aggregated.primaryFailure.artifactIndex >= 0) {
    const primaryArtifact = aggregated.artifacts[aggregated.primaryFailure.artifactIndex];
    if (primaryArtifact) {
      logs.unshift({
        id: "primary_failure",
        level: LOG_LEVELS.ERROR,
        message: `PRIMARY FAILURE (${aggregated.primaryFailure.confidence} confidence): ${primaryArtifact.errorMessage}\n\nReason: ${aggregated.primaryFailure.reason}`,
        timestamp: collectedAt,
        source: EVIDENCE_SOURCES.CI,
      });
    }
  }

  return {
    eventId,
    logs,
    collectedAt,
  };
};
