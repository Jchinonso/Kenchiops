/**
 * Stage 1: Chunking Types
 *
 * TypeScript interfaces for the chunking stage of the CI log analysis pipeline.
 * Handles splitting logs into processable chunks while respecting logical boundaries.
 *
 * @module formatting/chunkingStage1Types
 */

import type {
  BoundaryType,
  ProtectedZoneType,
  CIPlatformType,
} from "../constants/chunkingPipeline.js";

// ==================== Chunking Options ====================

/**
 * Options for the chunking stage.
 */
export interface ChunkingOptions {
  /** Target chunk size in tokens (default: 3000) */
  readonly targetTokens?: number;
  /** Hard maximum chunk size in tokens (default: 4000) */
  readonly maxTokens?: number;
  /** Number of overlap lines between chunks (default: 40) */
  readonly overlapLines?: number;
  /** Maximum chunks to produce (default: 100) */
  readonly maxChunks?: number;
  /** Skip chunking for logs below this token count (default: 3500) */
  readonly smallLogThreshold?: number;
}

// ==================== Protected Zones ====================

/**
 * Represents a protected zone that should not be split during chunking.
 */
export interface ProtectedZone {
  /** Type of protected zone */
  readonly type: ProtectedZoneType;
  /** Start line number (1-indexed) */
  readonly startLine: number;
  /** End line number (1-indexed, inclusive) */
  readonly endLine: number;
  /** Brief description of what was detected */
  readonly description?: string;
}

// ==================== Line Mapping ====================

/**
 * Maps sanitized line numbers to original line numbers.
 * Essential for tracing extracted failures back to raw log.
 */
export interface LineMapping {
  /** Sanitized line number (after preprocessing) */
  readonly sanitizedLine: number;
  /** Original line number in raw log */
  readonly originalLine: number;
  /** True if line was modified during sanitization */
  readonly wasModified: boolean;
}

// ==================== Chunk Results ====================

/**
 * Result of chunking a log file.
 */
export interface ChunkResult {
  /** Sequential chunk identifier (0-indexed) */
  readonly chunkId: number;
  /** The chunk text content */
  readonly content: string;
  /** Absolute line number where chunk starts in original log (1-indexed) */
  readonly lineOffset: number;
  /** Number of lines in this chunk */
  readonly lineCount: number;
  /** Estimated token count for this chunk */
  readonly estimatedTokens: number;
  /** Protected zones found within this chunk */
  readonly protectedZones: readonly ProtectedZone[];
  /** Type of boundary at chunk start */
  readonly boundaryType: BoundaryType;
}

/**
 * Result of the full chunking operation.
 */
export interface ChunkingResult {
  /** Array of chunks */
  readonly chunks: readonly ChunkResult[];
  /** Total lines in original log */
  readonly totalLines: number;
  /** Total estimated tokens in original log */
  readonly totalTokens: number;
  /** Whether chunking was skipped (small log) */
  readonly skippedChunking: boolean;
  /** Detected CI platform */
  readonly detectedPlatform?: CIPlatformType;
}
