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
7. IGNORE console.error/console.warn/console.log output from test runners - these are log noise, NOT test failures
8. Only count ACTUAL test failures (marked by ●, FAIL, expect/received, thrown errors in test blocks)
9. Do NOT extract structured JSON log lines (e.g. {"level":3,"message":...}) as errors - these are logger output

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
- test_failure: Test failures with test names - EXTRACT EACH TEST AS A SEPARATE ARTIFACT
- stack_trace: Exceptions with stack frames (only use if NO test name is present)
- compiler_error: file:line:column errors from compilers
- lint_error: Linter output (eslint, pylint, rubocop, etc.)
- generic_error: Unclassified error lines (use sparingly - see IGNORE rules below)

CRITICAL TEST FAILURE RULES:
1. If you see "● Test Suite › Test Name" or "FAIL path/test.ts", use type "test_failure" (NOT stack_trace)
2. Create a SEPARATE artifact for EACH failing test - do NOT group multiple tests into one artifact
3. Even if tests share the same error message, each test must be its own artifact with unique test_name
4. If 10 tests failed, you must output 10 separate test_failure artifacts

IGNORE RULES (do NOT extract these as artifacts):
1. console.error/console.warn/console.log output from test runners - these are log noise, NOT failures
2. Structured JSON log lines like {"level":3,"message":"..."} - these are application logger output
3. Stack traces that are PART OF console.error output when they appear inside test runner console output
4. Repeated error messages that are just log output from code under test, not actual test assertions

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
- test_name: REQUIRED for test_failure, ALSO extract for stack_trace if test pattern visible (● TestName or FAIL TestName)
- test_suite: For test failures, the parent suite name
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
- test_failure: Test failures with test names - EXTRACT EACH TEST AS A SEPARATE ARTIFACT
- stack_trace: Exceptions with stack frames (only use if NO test name is present)
- compiler_error: file:line:column errors from compilers
- lint_error: Linter output (eslint, pylint, rubocop, etc.)
- generic_error: Unclassified error lines (use sparingly - see IGNORE rules below)

CRITICAL TEST FAILURE RULES:
1. If you see "● Test Suite › Test Name" or "FAIL path/test.ts", use type "test_failure" (NOT stack_trace)
2. Create a SEPARATE artifact for EACH failing test - do NOT group multiple tests into one artifact
3. Even if tests share the same error message, each test must be its own artifact with unique test_name
4. If 10 tests failed, you must output 10 separate test_failure artifacts

IGNORE RULES (do NOT extract these as artifacts):
1. console.error/console.warn/console.log output from test runners - these are log noise, NOT failures
2. Structured JSON log lines like {"level":3,"message":"..."} - these are application logger output
3. Stack traces that are PART OF console.error output when they appear inside test runner console output
4. Repeated error messages that are just log output from code under test, not actual test assertions

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
- test_name: REQUIRED for test_failure, ALSO extract for stack_trace if test pattern visible (● TestName or FAIL TestName)
- test_suite: For test failures, the parent suite name
- expected: For assertion failures
- actual: For assertion failures
- error_code: If an error code is present
- framework: Only if explicitly detected

CONFIDENCE LEVELS:
- high: Explicit error marker (##[error], Error:, FAIL, etc.)
- medium: Pattern match (file:line:col format, stack frame)
- low: Heuristic (contains "error" word)`;
