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

import OpenAI from "openai";
import {
  config,
  createLogger,
  LOG_LEVELS,
  EVIDENCE_SOURCES,
  EVIDENCE_LOG_TIMING,
  SERVICE_NAMES,
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
  // Chunking pipeline types
  type AggregatedEvidence,
  type ExtractorFunction,
} from "@kenchi/shared";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Configuration ====================

/**
 * Configuration for chunking pipeline.
 * Logs above this token threshold will use the multi-stage pipeline.
 */
export const CHUNKING_PIPELINE_CONFIG = {
  /** Token threshold for using chunking pipeline (zero means always use chunking) */
  TOKEN_THRESHOLD: 0,
  /** Model to use for chunk extraction (cheaper, faster model) */
  EXTRACTION_MODEL: "gpt-4o-mini",
  /** Timeout for extraction requests in milliseconds */
  EXTRACTION_TIMEOUT_MS: 30000,
  /** Maximum concurrent extraction requests */
  EXTRACTION_CONCURRENCY: 5,
} as const;

// ==================== OpenAI Extraction Client ====================

/**
 * Singleton OpenAI client for extraction operations.
 * Separate from the main analysis client for lightweight extraction calls.
 */
let extractionClientInstance: OpenAI | null = null;

/**
 * Gets or creates the OpenAI extraction client singleton.
 */
const getExtractionClient = (): OpenAI => {
  if (!extractionClientInstance) {
    extractionClientInstance = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return extractionClientInstance;
};

/**
 * Creates an extractor function that uses OpenAI for artifact extraction.
 * The extractor is called for each chunk during Stage 2.
 * Uses a lightweight OpenAI client instance for extraction operations.
 */
const createOpenAIExtractor = (): ExtractorFunction => {
  const extractionClient = getExtractionClient();

  return async (
    systemPrompt: string,
    userPrompt: string,
    options: { timeoutMs: number; model: string }
  ): Promise<string> => {
    const response = await extractionClient.chat.completions.create({
      model: options.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      // Note: Not using response_format: json_object because the prompt asks for
      // a raw JSON array, and json_object requires a root object. The parser
      // handles both array and object responses with markdown fence stripping.
    });

    return response.choices[0]?.message?.content ?? "[]";
  };
};

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
 * @returns Aggregated evidence from the pipeline
 */
export const executeChunkingPipeline = async (
  failureLog: string,
  repository: string
): Promise<AggregatedEvidence> => {
  const startTime = Date.now();

  // Stage 1: Smart Chunking
  logger.info("Chunking pipeline Stage 1: Chunking log", { repository });
  const chunkingResult = chunkLog(failureLog);

  logger.info("Chunking complete", {
    repository,
    totalChunks: chunkingResult.chunks.length,
    totalTokens: chunkingResult.totalTokens,
    skippedChunking: chunkingResult.skippedChunking,
    detectedPlatform: chunkingResult.detectedPlatform,
  });

  // Stage 2: Per-chunk extraction
  logger.info("Chunking pipeline Stage 2: Extracting artifacts from chunks", {
    repository,
    chunkCount: chunkingResult.chunks.length,
  });

  const extractor = createOpenAIExtractor();
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
  });

  // Check viability before aggregation
  const viabilityError = checkAggregationViability(batchResult);
  if (viabilityError) {
    logger.warn("Aggregation viability check failed, using degraded mode", {
      repository,
      reason: viabilityError,
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
  logger.info("Chunking pipeline Stage 3: Aggregating artifacts", { repository });
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
  });

  return aggregatedEvidence;
};

// ==================== Evidence Conversion ====================

/**
 * Converts aggregated evidence to Evidence format for final analysis.
 * Maps ranked artifacts to log entries that can be analyzed by the LLM.
 */
export const convertAggregatedToEvidence = (
  aggregated: AggregatedEvidence,
  eventId: string,
  collectedAt: string
): Evidence => {
  // Convert artifacts to log entries
  const logs: LogEntry[] = aggregated.artifacts.map((artifact, index) => ({
    id: `artifact_${index}`,
    level: artifact.severity === "fatal" ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO,
    message: `[${artifact.type}] ${artifact.errorMessage}\n\nSnippet:\n${artifact.snippet}`,
    timestamp: new Date(
      new Date(collectedAt).getTime() + index * EVIDENCE_LOG_TIMING.TIMESTAMP_OFFSET_MS
    ).toISOString(),
    source: EVIDENCE_SOURCES.CI,
  }));

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
