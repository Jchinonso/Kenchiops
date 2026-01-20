/**
 * Extraction Module
 *
 * Stage 2 of the CI log analysis pipeline - extracts structured
 * artifacts from log chunks using LLM.
 *
 * @module formatting/extraction
 */

// Types
export type {
  ExtractionOptions,
  ExtractedArtifact,
  ExtractionResult,
  ExtractionContext,
  ExtractorFunction,
  NormalizedExtractionOptions,
  BatchExtractionResult,
  PrimaryFailure,
  OptionalFieldExtractor,
  BatchProcessingState,
} from "./types.js";

// Helpers
export {
  generateAssertionHash,
  normalizeExtractionOptions,
  createFailedResult,
  buildChunkExtractorSystemPrompt,
  buildChunkExtractorPrompt,
  CHUNK_EXTRACTOR_PROMPT_TEMPLATE,
} from "./helpers.js";

// Parser
export {
  isValidArtifactType,
  isValidSeverity,
  isValidConfidence,
  hasRequiredFields,
  extractOptionalFields,
  validateArtifact,
  parseExtractionResponse,
} from "./parser.js";

// Extractor
export { extractFromChunk, extractFromAllChunks } from "./extractor.js";
