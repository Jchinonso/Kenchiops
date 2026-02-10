/**
 * Chunking Module
 *
 * Stage 1 of the CI log analysis pipeline - splits sanitized logs
 * into chunks that fit within LLM context limits while respecting
 * logical boundaries and protected zones.
 *
 * @module formatting/chunking
 */

// Types
export type {
  ChunkingOptions,
  ProtectedZone,
  ChunkResult,
  ChunkingResult,
  LineMapping,
  ChunkGenerationContext,
  ZoneAccumulatorState,
} from "./types.js";

// Helpers
export {
  estimateTokens,
  estimateTokensForLines,
  detectCIPlatform,
  findNaturalBoundaries,
  normalizeChunkingOptions,
  calculateTargetLinesPerChunk,
  calculateMaxLinesPerChunk,
} from "./helpers.js";

// Protected Zone Detection
export {
  detectProtectedZoneStart,
  continuesProtectedZone,
  detectProtectedZones,
} from "./protectedZones.js";

// Main Chunker
export { chunkLog } from "./chunker.js";
