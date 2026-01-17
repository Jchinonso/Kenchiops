/**
 * Chunk Extractor Module (Stage 2)
 *
 * Handles extraction of structured artifacts from log chunks using LLM.
 * Provides prompt building, response parsing, and batch orchestration.
 *
 * ADDED FOR CHUNKING PIPELINE: Stage 2 - parallel extraction of artifacts
 * from individual chunks using a cheap LLM.
 *
 * @module formatting/chunkExtractor
 */

import { createHash } from "crypto";
import { EXTRACTION_DEFAULTS, type CIPlatformType, type ArtifactType } from "../constants/index.js";

import type {
  ChunkResult,
  ExtractionOptions,
  ExtractionResult,
  BatchExtractionResult,
} from "./chunkingTypes.js";

// Import for internal use
import { parseExtractionResponse } from "./chunkExtractionParser.js";

// Re-export parsing utilities for backwards compatibility
export {
  isValidArtifactType,
  isValidSeverity,
  isValidConfidence,
  hasRequiredFields,
  extractOptionalFields,
  validateArtifact,
  parseExtractionResponse,
} from "./chunkExtractionParser.js";

// ==================== Hash Generation ====================

/**
 * Configuration for assertion hash generation.
 */
const HASH_CONFIG = {
  /** Hash algorithm to use */
  ALGORITHM: "sha256",
  /** Number of hex characters to use from hash (16 = 64 bits) */
  HASH_LENGTH: 16,
} as const;

/**
 * Generates assertion hash for deduplication discrimination.
 * Uses type + filePath + errorMessage content for uniqueness.
 *
 * @param type - Artifact type
 * @param errorMessage - Error message content
 * @param filePath - Optional file path
 * @returns 16-character hex hash
 */
export const generateAssertionHash = (
  type: ArtifactType,
  errorMessage: string,
  filePath?: string
): string => {
  const hashInput = `${type}:${filePath ?? ""}:${errorMessage}`;
  return createHash(HASH_CONFIG.ALGORITHM)
    .update(hashInput)
    .digest("hex")
    .slice(0, HASH_CONFIG.HASH_LENGTH);
};

// ==================== Prompt Building ====================

/**
 * Builds the system prompt for chunk extraction.
 * This prompt instructs the LLM to extract artifacts without reasoning.
 */
export const buildChunkExtractorSystemPrompt = (): string =>
  `You are a CI log artifact extractor. Your ONLY job is to extract structured error information from log chunks.

RULES:
1. Extract ONLY what is explicitly present in the text
2. NO reasoning, NO speculation, NO guessing
3. Return a JSON array of artifacts (NOT wrapped in an object)
4. Return empty array [] if nothing found
5. Line numbers are relative to the chunk (1-indexed)
6. Never invent file paths or test names not present in the text

OUTPUT FORMAT: Raw JSON array only. No markdown, no backticks, no explanation.`;

/**
 * Builds the user prompt for extracting artifacts from a chunk.
 *
 * @param chunk - The chunk to extract from
 * @param frameworkHint - Optional detected framework
 * @param ciPlatformHint - Optional detected CI platform
 * @returns The user prompt string
 */
export const buildChunkExtractorPrompt = (
  chunk: ChunkResult,
  frameworkHint?: string,
  ciPlatformHint?: CIPlatformType
): string => {
  // Build hints array using filter pattern
  const hints = [
    frameworkHint ? `Detected framework: ${frameworkHint}` : null,
    ciPlatformHint && ciPlatformHint !== "unknown" ? `CI platform: ${ciPlatformHint}` : null,
  ].filter((hint): hint is string => hint !== null);

  const hintsSection = hints.length > 0 ? `\nHints:\n${hints.join("\n")}\n` : "";

  return `Extract all error artifacts from this log chunk.
${hintsSection}
Chunk ID: ${chunk.chunkId}
Line offset in original log: ${chunk.lineOffset}

ARTIFACT TYPES TO EXTRACT:
- infra_killer: OOM, SIGKILL, timeout, disk full, network unreachable
- ci_boundary: ##[error], exit code lines, "Process completed with exit code"
- stack_trace: Exceptions with stack frames
- test_failure: Assertion failures with test names
- compiler_error: file:line:column errors from compilers
- lint_error: Linter output (eslint, pylint, rubocop, etc.)
- generic_error: Unclassified lines containing "error"/"Error"/"ERROR"

REQUIRED FIELDS FOR EACH ARTIFACT:
{
  "evidence_id": "chunk#${chunk.chunkId}:L<start>-L<end>",
  "type": "<artifact_type>",
  "severity": "fatal|error|warning",
  "error_message": "<the error text>",
  "snippet": "<verbatim 1-3 lines>",
  "snippet_line_start": <line number in chunk, 1-indexed>,
  "confidence": "high|medium|low"
}

OPTIONAL FIELDS (include ONLY if explicitly present):
- file_path: Only if a file path appears in the text
- line_number: Only if a line number appears
- column: Only if a column number appears
- test_name: For test failures only
- test_suite: For test failures only
- expected: For assertion failures
- actual: For assertion failures
- error_code: If an error code is present
- framework: Only if explicitly detected

CONFIDENCE LEVELS:
- high: Explicit error marker (##[error], Error:, FAIL, etc.)
- medium: Pattern match (file:line:col format, stack frame)
- low: Heuristic (contains "error" word)

LOG CHUNK:
\`\`\`
${chunk.content}
\`\`\`

Return JSON array only:`;
};

// ==================== Batch Orchestration ====================

/**
 * Normalizes extraction options with defaults.
 *
 * @param options - User-provided options
 * @returns Normalized options
 */
export const normalizeExtractionOptions = (
  options: ExtractionOptions = {}
): Required<Omit<ExtractionOptions, "frameworkHint" | "ciPlatformHint">> & {
  frameworkHint?: string;
  ciPlatformHint?: CIPlatformType;
} => ({
  concurrency: options.concurrency ?? EXTRACTION_DEFAULTS.CONCURRENCY,
  timeoutMs: options.timeoutMs ?? EXTRACTION_DEFAULTS.TIMEOUT_MS,
  retryDelayMs: options.retryDelayMs ?? EXTRACTION_DEFAULTS.RETRY_DELAY_MS,
  maxArtifactsPerChunk: options.maxArtifactsPerChunk ?? EXTRACTION_DEFAULTS.MAX_ARTIFACTS_PER_CHUNK,
  chunkFailureThreshold:
    options.chunkFailureThreshold ?? EXTRACTION_DEFAULTS.CHUNK_FAILURE_THRESHOLD,
  model: options.model ?? "haiku",
  frameworkHint: options.frameworkHint,
  ciPlatformHint: options.ciPlatformHint,
});

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
 * Creates an extraction result for a failed extraction.
 *
 * @param chunkId - Chunk ID
 * @param error - Error message
 * @param timeMs - Time taken
 * @param model - Model used
 * @returns Failed extraction result
 */
const createFailedResult = (
  chunkId: number,
  error: string,
  timeMs: number,
  model: string
): ExtractionResult => ({
  chunkId,
  artifacts: [],
  extractionTimeMs: timeMs,
  modelUsed: model,
  success: false,
  error,
});

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
  options: ReturnType<typeof normalizeExtractionOptions>
): Promise<ExtractionResult> => {
  const systemPrompt = buildChunkExtractorSystemPrompt();
  const userPrompt = buildChunkExtractorPrompt(
    chunk,
    options.frameworkHint,
    options.ciPlatformHint
  );

  const startTime = Date.now();

  // First attempt
  try {
    const response = await extractor(systemPrompt, userPrompt, {
      timeoutMs: options.timeoutMs,
      model: options.model,
    });

    const artifacts = parseExtractionResponse(
      response,
      chunk.chunkId,
      options.maxArtifactsPerChunk
    );

    return {
      chunkId: chunk.chunkId,
      artifacts,
      extractionTimeMs: Date.now() - startTime,
      modelUsed: options.model,
      success: true,
    };
  } catch (firstError) {
    // Retry after delay
    await new Promise<void>((resolve) => {
      setTimeout(resolve, options.retryDelayMs);
    });

    try {
      const retryStart = Date.now();
      const response = await extractor(systemPrompt, userPrompt, {
        timeoutMs: options.timeoutMs,
        model: options.model,
      });

      const artifacts = parseExtractionResponse(
        response,
        chunk.chunkId,
        options.maxArtifactsPerChunk
      );

      return {
        chunkId: chunk.chunkId,
        artifacts,
        extractionTimeMs: Date.now() - retryStart,
        modelUsed: options.model,
        success: true,
      };
    } catch (retryError) {
      return createFailedResult(
        chunk.chunkId,
        retryError instanceof Error ? retryError.message : "Unknown error",
        Date.now() - startTime,
        options.model
      );
    }
  }
};

/**
 * Internal state for batch processing accumulator.
 */
interface BatchProcessingState {
  readonly results: readonly ExtractionResult[];
  readonly aborted: boolean;
  readonly abortReason: string | undefined;
}

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
 * Processes a single batch and returns updated state.
 */
const processBatch = async (
  batch: readonly ChunkResult[],
  extractor: ExtractorFunction,
  normalizedOptions: ReturnType<typeof normalizeExtractionOptions>,
  currentState: BatchProcessingState
): Promise<BatchProcessingState> => {
  // Process batch in parallel
  const batchPromises = batch.map((chunk) => extractFromChunk(chunk, extractor, normalizedOptions));

  const batchResults = await Promise.allSettled(batchPromises);

  // Convert settled results to extraction results using map
  const newResults = batchResults.map((settledResult, index) =>
    settledToExtractionResult(settledResult, batch[index], normalizedOptions.model)
  );

  // Combine with previous results
  const allResults = [...currentState.results, ...newResults];

  // Check failure threshold
  const failedCount = allResults.filter((result) => !result.success).length;
  const failureRate = failedCount / allResults.length;

  const shouldAbort = failureRate > normalizedOptions.chunkFailureThreshold;

  return {
    results: allResults,
    aborted: shouldAbort,
    abortReason: shouldAbort
      ? `Chunk failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(normalizedOptions.chunkFailureThreshold * 100).toFixed(1)}%`
      : undefined,
  };
};

/**
 * Recursively processes batches with immutable state.
 */
const processAllBatches = async (
  chunks: readonly ChunkResult[],
  extractor: ExtractorFunction,
  normalizedOptions: ReturnType<typeof normalizeExtractionOptions>,
  batchStart: number,
  currentState: BatchProcessingState
): Promise<BatchProcessingState> => {
  // Base case: all chunks processed or aborted
  if (batchStart >= chunks.length || currentState.aborted) {
    return currentState;
  }

  const batchEnd = Math.min(batchStart + normalizedOptions.concurrency, chunks.length);
  const batch = chunks.slice(batchStart, batchEnd);

  const newState = await processBatch(batch, extractor, normalizedOptions, currentState);

  // Recursive call for next batch
  return processAllBatches(chunks, extractor, normalizedOptions, batchEnd, newState);
};

/**
 * Extracts artifacts from all chunks in parallel batches.
 * Uses Promise.allSettled to handle partial failures.
 * Uses recursive approach with immutable state accumulation.
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

  // Calculate totals
  const successfulChunks = finalState.results.filter((result) => result.success).length;
  const failedChunks = finalState.results.length - successfulChunks;
  const totalArtifacts = finalState.results.reduce(
    (sum, result) => sum + result.artifacts.length,
    0
  );

  return {
    results: finalState.results,
    totalChunks: chunks.length,
    successfulChunks,
    failedChunks,
    totalArtifacts,
    aborted: finalState.aborted,
    abortReason: finalState.abortReason,
  };
};

// ==================== Prompt Constants Export ====================

/**
 * The complete chunk extractor prompt template.
 * Exported for documentation and testing purposes.
 */
export const CHUNK_EXTRACTOR_PROMPT_TEMPLATE = `You are a CI log artifact extractor. Your ONLY job is to extract structured error information from log chunks.

RULES:
1. Extract ONLY what is explicitly present in the text
2. NO reasoning, NO speculation, NO guessing
3. Return a JSON array of artifacts (NOT wrapped in an object)
4. Return empty array [] if nothing found
5. Line numbers are relative to the chunk (1-indexed)
6. Never invent file paths or test names not present in the text

ARTIFACT TYPES TO EXTRACT:
- infra_killer: OOM, SIGKILL, timeout, disk full, network unreachable
- ci_boundary: ##[error], exit code lines, "Process completed with exit code"
- stack_trace: Exceptions with stack frames
- test_failure: Assertion failures with test names
- compiler_error: file:line:column errors from compilers
- lint_error: Linter output (eslint, pylint, rubocop, etc.)
- generic_error: Unclassified lines containing "error"/"Error"/"ERROR"

REQUIRED FIELDS FOR EACH ARTIFACT:
{
  "evidence_id": "chunk#{{chunk_id}}:L<start>-L<end>",
  "type": "<artifact_type>",
  "severity": "fatal|error|warning",
  "error_message": "<the error text>",
  "snippet": "<verbatim 1-3 lines>",
  "snippet_line_start": <line number in chunk, 1-indexed>,
  "confidence": "high|medium|low"
}

OPTIONAL FIELDS (include ONLY if explicitly present):
- file_path: Only if a file path appears in the text
- line_number: Only if a line number appears
- column: Only if a column number appears
- test_name: For test failures only
- test_suite: For test failures only
- expected: For assertion failures
- actual: For assertion failures
- error_code: If an error code is present
- framework: Only if explicitly detected

CONFIDENCE LEVELS:
- high: Explicit error marker (##[error], Error:, FAIL, etc.)
- medium: Pattern match (file:line:col format, stack frame)
- low: Heuristic (contains "error" word)

INPUT VARIABLES:
- {{chunk_id}}: Integer chunk identifier
- {{line_offset}}: Absolute line number where chunk starts
- {{chunk_text}}: The sanitized chunk content
- {{framework_hint}}: Optional detected framework
- {{ci_platform_hint}}: Optional detected CI platform

OUTPUT: JSON array only. No markdown, no backticks, no explanation.`;
