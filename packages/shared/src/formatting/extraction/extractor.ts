/**
 * Chunk Extractor
 *
 * Handles extraction of structured artifacts from log chunks using LLM.
 * Provides batch orchestration with retry logic and failure thresholds.
 *
 * Stage 2 of the chunking pipeline - parallel extraction of artifacts
 * from individual chunks using a cheap LLM.
 *
 * @module formatting/extraction/extractor
 */

import type { ChunkResult } from "../chunking/types.js";
import type {
  ExtractionOptions,
  ExtractionResult,
  ExtractionContext,
  ExtractorFunction,
  NormalizedExtractionOptions,
  BatchExtractionResult,
  BatchProcessingState,
  AttemptResult,
} from "./types.js";

import {
  normalizeExtractionOptions,
  createFailedResult,
  buildChunkExtractorSystemPrompt,
  buildChunkExtractorPrompt,
} from "./helpers.js";

import { parseExtractionResponse } from "./parser.js";
import { delay } from "../../core/utils.js";

// ==================== Retry Logic ====================

/**
 * Wraps an async operation result as an AttemptResult.
 */
const tryOperation = async <T>(operation: () => Promise<T>): Promise<AttemptResult<T>> => {
  try {
    const value = await operation();
    return { success: true, value };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
};

/**
 * Executes an operation with a single retry after delay.
 * Returns the successful result or the final error.
 */
const withSingleRetry = async <T>(
  operation: () => Promise<T>,
  retryDelayMs: number
): Promise<AttemptResult<T>> => {
  const firstAttempt = await tryOperation(operation);
  if (firstAttempt.success) {
    return firstAttempt;
  }

  await delay(retryDelayMs);
  return tryOperation(operation);
};

// ==================== Extraction Context ====================

/**
 * Creates the extraction context for a chunk.
 */
const createExtractionContext = (
  chunk: ChunkResult,
  options: NormalizedExtractionOptions
): ExtractionContext => ({
  chunk,
  systemPrompt: buildChunkExtractorSystemPrompt(),
  userPrompt: buildChunkExtractorPrompt(chunk, options.frameworkHint, options.ciPlatformHint),
  options,
});

// ==================== Single Chunk Extraction ====================

/**
 * Performs a single extraction attempt.
 * Returns successful result or throws on failure.
 */
const attemptExtraction = async (
  context: ExtractionContext,
  extractor: ExtractorFunction
): Promise<ExtractionResult> => {
  const startTime = Date.now();
  const response = await extractor(context.systemPrompt, context.userPrompt, {
    timeoutMs: context.options.timeoutMs,
    model: context.options.model,
  });

  const artifacts = parseExtractionResponse(
    response,
    context.chunk.chunkId,
    context.options.maxArtifactsPerChunk
  );

  return {
    chunkId: context.chunk.chunkId,
    artifacts,
    extractionTimeMs: Date.now() - startTime,
    modelUsed: context.options.model,
    success: true,
  };
};

/**
 * Extracts artifacts from a single chunk with retry logic.
 *
 * @param chunk - Chunk to extract from
 * @param extractor - Function to call LLM
 * @param options - Extraction options
 * @returns Extraction result
 */
export const extractFromChunk = async (
  chunk: ChunkResult,
  extractor: ExtractorFunction,
  options: NormalizedExtractionOptions
): Promise<ExtractionResult> => {
  const context = createExtractionContext(chunk, options);
  const overallStartTime = Date.now();

  const result = await withSingleRetry(
    () => attemptExtraction(context, extractor),
    options.retryDelayMs
  );

  return result.success
    ? result.value
    : createFailedResult(
        chunk.chunkId,
        result.error.message,
        Date.now() - overallStartTime,
        options.model
      );
};

// ==================== Batch Processing ====================

/**
 * Converts a settled promise result to an extraction result.
 */
const settledToExtractionResult = (
  settledResult: PromiseSettledResult<ExtractionResult>,
  chunk: ChunkResult,
  model: string
): ExtractionResult =>
  settledResult.status === "fulfilled"
    ? settledResult.value
    : createFailedResult(chunk.chunkId, settledResult.reason?.message ?? "Unknown error", 0, model);

/**
 * Computes failure rate and determines if batch should abort.
 */
const computeAbortDecision = (
  results: readonly ExtractionResult[],
  threshold: number
): { readonly shouldAbort: boolean; readonly failureRate: number } => {
  const failedCount = results.filter((result) => !result.success).length;
  const failureRate = failedCount / results.length;
  return { shouldAbort: failureRate > threshold, failureRate };
};

/**
 * Formats the abort reason message.
 */
const formatAbortReason = (failureRate: number, threshold: number): string =>
  `Chunk failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}%`;

/**
 * Processes a single batch and returns updated state.
 */
const processBatch = async (
  batch: readonly ChunkResult[],
  extractor: ExtractorFunction,
  normalizedOptions: NormalizedExtractionOptions,
  currentState: BatchProcessingState
): Promise<BatchProcessingState> => {
  const batchPromises = batch.map((chunk) => extractFromChunk(chunk, extractor, normalizedOptions));

  const batchResults = await Promise.allSettled(batchPromises);

  const newResults = batchResults.map((settledResult, index) =>
    settledToExtractionResult(settledResult, batch[index], normalizedOptions.model)
  );

  const allResults = [...currentState.results, ...newResults];
  const { shouldAbort, failureRate } = computeAbortDecision(
    allResults,
    normalizedOptions.chunkFailureThreshold
  );

  return {
    results: allResults,
    aborted: shouldAbort,
    abortReason: shouldAbort
      ? formatAbortReason(failureRate, normalizedOptions.chunkFailureThreshold)
      : undefined,
  };
};

/**
 * Recursively processes batches with immutable state.
 */
const processAllBatches = async (
  chunks: readonly ChunkResult[],
  extractor: ExtractorFunction,
  normalizedOptions: NormalizedExtractionOptions,
  batchStart: number,
  currentState: BatchProcessingState
): Promise<BatchProcessingState> => {
  if (batchStart >= chunks.length || currentState.aborted) {
    return currentState;
  }

  const batchEnd = Math.min(batchStart + normalizedOptions.concurrency, chunks.length);
  const batch = chunks.slice(batchStart, batchEnd);

  const newState = await processBatch(batch, extractor, normalizedOptions, currentState);

  return processAllBatches(chunks, extractor, normalizedOptions, batchEnd, newState);
};

/**
 * Computes batch extraction statistics from results.
 */
const computeBatchStatistics = (
  results: readonly ExtractionResult[]
): {
  readonly successfulChunks: number;
  readonly failedChunks: number;
  readonly totalArtifacts: number;
} => {
  const successfulChunks = results.filter((result) => result.success).length;
  return {
    successfulChunks,
    failedChunks: results.length - successfulChunks,
    totalArtifacts: results.reduce((sum, result) => sum + result.artifacts.length, 0),
  };
};

/**
 * Extracts artifacts from all chunks in parallel batches.
 * Uses Promise.allSettled to handle partial failures.
 *
 * @param chunks - Chunks to extract from
 * @param extractor - Function to call LLM
 * @param options - Extraction options
 * @returns Batch extraction result
 */
export const extractFromAllChunks = async (
  chunks: readonly ChunkResult[],
  extractor: ExtractorFunction,
  options: ExtractionOptions = {}
): Promise<BatchExtractionResult> => {
  const normalizedOptions = normalizeExtractionOptions(options);

  const initialState: BatchProcessingState = {
    results: [],
    aborted: false,
    abortReason: undefined,
  };

  const finalState = await processAllBatches(chunks, extractor, normalizedOptions, 0, initialState);

  const statistics = computeBatchStatistics(finalState.results);

  return {
    results: finalState.results,
    totalChunks: chunks.length,
    ...statistics,
    aborted: finalState.aborted,
    abortReason: finalState.abortReason,
  };
};
