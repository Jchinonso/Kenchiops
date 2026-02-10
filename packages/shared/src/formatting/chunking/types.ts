/**
 * Chunking Types
 *
 * Type definitions for the log chunking pipeline (Stage 1).
 *
 * @module formatting/chunking/types
 */

import type { CIPlatformType, BoundaryType, ProtectedZoneType } from "../../constants/index.js";

// ==================== Chunking Options ====================

/**
 * Options for log chunking.
 */
export interface ChunkingOptions {
  /** Target tokens per chunk (default: 3000) */
  readonly targetTokens?: number;
  /** Maximum tokens per chunk (default: 4000) */
  readonly maxTokens?: number;
  /** Lines of overlap between chunks (default: 10) */
  readonly overlapLines?: number;
  /** Maximum chunks to create (default: 20) */
  readonly maxChunks?: number;
  /** Token threshold below which chunking is skipped (default: 4000) */
  readonly smallLogThreshold?: number;
}

// ==================== Protected Zones ====================

/**
 * A protected zone that should not be split during chunking.
 */
export interface ProtectedZone {
  /** Type of protected zone */
  readonly type: ProtectedZoneType;
  /** Starting line number (1-indexed) */
  readonly startLine: number;
  /** Ending line number (1-indexed) */
  readonly endLine: number;
  /** Optional description (first line of zone) */
  readonly description?: string;
}

// ==================== Chunk Results ====================

/**
 * A single chunk extracted from the log.
 */
export interface ChunkResult {
  /** Chunk identifier (0-indexed) */
  readonly chunkId: number;
  /** Chunk content */
  readonly content: string;
  /** Line offset in original log (1-indexed) */
  readonly lineOffset: number;
  /** Number of lines in chunk */
  readonly lineCount: number;
  /** Estimated token count */
  readonly estimatedTokens: number;
  /** Protected zones within this chunk */
  readonly protectedZones: readonly ProtectedZone[];
  /** How the chunk boundary was determined */
  readonly boundaryType: BoundaryType;
}

/**
 * Result of chunking operation.
 */
export interface ChunkingResult {
  /** Array of chunks */
  readonly chunks: readonly ChunkResult[];
  /** Total lines in original log */
  readonly totalLines: number;
  /** Total estimated tokens */
  readonly totalTokens: number;
  /** Whether chunking was skipped (log was small enough) */
  readonly skippedChunking: boolean;
  /** Detected CI platform */
  readonly detectedPlatform: CIPlatformType;
}

// ==================== Line Mapping ====================

/**
 * Mapping from sanitized line number to original line number.
 * Used for tracing back to raw log positions.
 */
export interface LineMapping {
  /** Line number in sanitized output (1-indexed) */
  readonly sanitizedLine: number;
  /** Line number in original raw log (1-indexed) */
  readonly originalLine: number;
  /** Whether the line was modified during sanitization */
  readonly wasModified: boolean;
}

// ==================== Internal Types ====================

/**
 * Zone detector configuration for pattern-based detection.
 */
export interface ZoneDetector {
  readonly type: ProtectedZoneType;
  readonly patterns: readonly RegExp[];
}

/**
 * Internal context for chunk generation.
 */
export interface ChunkGenerationContext {
  readonly lines: readonly string[];
  readonly totalLines: number;
  readonly allZones: readonly ProtectedZone[];
  readonly boundaries: readonly number[];
  readonly targetLinesPerChunk: number;
  readonly maxLinesPerChunk: number;
  readonly overlapLines: number;
  readonly maxChunks: number;
}

/**
 * Internal state for zone detection accumulator.
 */
export interface ZoneAccumulatorState {
  readonly zones: readonly ProtectedZone[];
  readonly currentZone: {
    readonly type: ProtectedZoneType;
    readonly startLine: number;
    readonly description?: string;
  } | null;
}
