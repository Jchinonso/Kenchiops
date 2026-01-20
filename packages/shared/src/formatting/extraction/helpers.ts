/**
 * Extraction Helpers
 *
 * Utility functions for chunk extraction including hash generation,
 * options normalization, and result creation.
 *
 * @module formatting/extraction/helpers
 */

import { createHash } from "crypto";
import {
  ASSERTION_HASH_CONFIG,
  EXTRACTION_DEFAULTS,
  type ArtifactType,
  type CIPlatformType,
} from "../../constants/index.js";

import type { ChunkResult } from "../chunking/types.js";
import type { ExtractionOptions, ExtractionResult, NormalizedExtractionOptions } from "./types.js";

// ==================== Hash Generation ====================

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
  return createHash(ASSERTION_HASH_CONFIG.ALGORITHM)
    .update(hashInput)
    .digest("hex")
    .slice(0, ASSERTION_HASH_CONFIG.HASH_LENGTH);
};

// ==================== Options Normalization ====================

/**
 * Normalizes extraction options with defaults.
 *
 * @param options - User-provided options
 * @returns Normalized options
 */
export const normalizeExtractionOptions = (
  options: ExtractionOptions = {}
): NormalizedExtractionOptions => ({
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

// ==================== Result Creation ====================

/**
 * Creates an extraction result for a failed extraction.
 *
 * @param chunkId - Chunk ID
 * @param error - Error message
 * @param timeMs - Time taken
 * @param model - Model used
 * @returns Failed extraction result
 */
export const createFailedResult = (
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

// ==================== Prompt Building ====================

/**
 * Builds the system prompt for chunk extraction.
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

// ==================== Prompt Constants ====================

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
- low: Heuristic (contains "error" word)`;
