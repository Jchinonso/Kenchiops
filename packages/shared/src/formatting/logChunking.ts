/**
 * Log Chunking Module (Stage 1)
 *
 * Implements smart chunking for CI logs that respects logical boundaries
 * and protected zones like stack traces and test output blocks.
 *
 * ADDED FOR CHUNKING PIPELINE: Stage 1 - splits sanitized logs into
 * chunks that fit within LLM context limits.
 *
 * @module formatting/logChunking
 */

import {
  TOKEN_ESTIMATION,
  CHUNKING_DEFAULTS,
  NATURAL_BOUNDARY_PATTERNS,
  CI_PLATFORM_DETECTION_PATTERNS,
  CI_PLATFORMS,
  BOUNDARY_TYPES,
  type CIPlatformType,
  type BoundaryType,
} from "../constants/index.js";

import type {
  ChunkingOptions,
  ProtectedZone,
  ChunkResult,
  ChunkingResult,
} from "./chunkingTypes.js";

// Import for internal use
import { detectProtectedZones } from "./logProtectedZones.js";

// Re-export protected zone detection for backwards compatibility
export {
  detectProtectedZoneStart,
  continuesProtectedZone,
  detectProtectedZones,
} from "./logProtectedZones.js";

// ==================== Token Estimation ====================

/**
 * Estimates token count for a string using character-based heuristic.
 * This is a fallback when tiktoken is not available.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / TOKEN_ESTIMATION.CHARS_PER_TOKEN);

/**
 * Estimates tokens for an array of lines.
 *
 * @param lines - Lines to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokensForLines = (lines: readonly string[]): number =>
  estimateTokens(lines.join("\n"));

// ==================== CI Platform Detection ====================

/**
 * Detects the CI platform from log content.
 *
 * @param content - Log content to analyze
 * @returns Detected CI platform or "unknown"
 */
export const detectCIPlatform = (content: string): CIPlatformType => {
  const platformEntries = Object.entries(CI_PLATFORM_DETECTION_PATTERNS);

  const detected = platformEntries.find(([, pattern]) => pattern.test(content));

  return detected ? (detected[0] as CIPlatformType) : CI_PLATFORMS.UNKNOWN;
};

// ==================== Natural Boundary Detection ====================

/**
 * Finds natural boundary points in the log content.
 * Uses flatMap for immutable filtering and mapping.
 *
 * @param lines - Log lines to analyze
 * @param platform - Detected CI platform
 * @returns Array of line numbers (1-indexed) that are natural boundaries
 */
export const findNaturalBoundaries = (
  lines: readonly string[],
  platform: CIPlatformType
): readonly number[] => {
  // Get platform-specific patterns
  const platformPatterns =
    platform === CI_PLATFORMS.GITHUB_ACTIONS
      ? NATURAL_BOUNDARY_PATTERNS.GITHUB_ACTIONS
      : platform === CI_PLATFORMS.GITLAB_CI
        ? NATURAL_BOUNDARY_PATTERNS.GITLAB_CI
        : NATURAL_BOUNDARY_PATTERNS.GENERIC;

  const allPatterns = [...platformPatterns, ...NATURAL_BOUNDARY_PATTERNS.GENERIC];

  return lines.flatMap((line, index) => {
    const lineNumber = index + 1; // 1-indexed

    // Check if this line matches a natural boundary pattern
    const isBoundary = allPatterns.some((pattern) => pattern.test(line));

    // Also consider blank lines followed by non-blank as boundaries
    const isBlankFollowedByContent =
      line.trim() === "" && index < lines.length - 1 && lines[index + 1].trim() !== "";

    return isBoundary || isBlankFollowedByContent ? [lineNumber] : [];
  });
};

// ==================== Chunking Logic ====================

/**
 * Checks if a line range overlaps with any protected zone.
 *
 * @param startLine - Start line (1-indexed)
 * @param endLine - End line (1-indexed)
 * @param zones - Protected zones
 * @returns The overlapping zone if found
 */
const findOverlappingZone = (
  startLine: number,
  endLine: number,
  zones: readonly ProtectedZone[]
): ProtectedZone | undefined =>
  zones.find(
    (zone) =>
      // Zone starts within range
      (zone.startLine >= startLine && zone.startLine <= endLine) ||
      // Zone ends within range
      (zone.endLine >= startLine && zone.endLine <= endLine) ||
      // Zone completely contains range
      (zone.startLine <= startLine && zone.endLine >= endLine)
  );

/**
 * Finds the best split point near a target line.
 *
 * @param targetLine - Target line number (1-indexed)
 * @param lines - All log lines
 * @param boundaries - Natural boundary lines
 * @param zones - Protected zones
 * @param searchRadius - How far to search from target
 * @returns Best split point and boundary type
 */
const findBestSplitPoint = (
  targetLine: number,
  lines: readonly string[],
  boundaries: readonly number[],
  zones: readonly ProtectedZone[],
  searchRadius: number = 50
): { line: number; boundaryType: BoundaryType } => {
  const minLine = Math.max(1, targetLine - searchRadius);
  const maxLine = Math.min(lines.length, targetLine + searchRadius);

  // First, try to find a natural boundary near the target
  const nearbyBoundaries = boundaries.filter(
    (boundary) => boundary >= minLine && boundary <= maxLine
  );

  // Sort by distance from target
  const sortedBoundaries = nearbyBoundaries.sort(
    (boundaryA, boundaryB) => Math.abs(boundaryA - targetLine) - Math.abs(boundaryB - targetLine)
  );

  // Find first boundary that doesn't split a protected zone
  const safeBoundary = sortedBoundaries.find((boundary) => {
    const overlapping = findOverlappingZone(boundary, boundary, zones);
    return !overlapping;
  });

  if (safeBoundary) {
    return { line: safeBoundary, boundaryType: BOUNDARY_TYPES.NATURAL };
  }

  // No natural boundary found - find any safe point
  // Generate offset candidates: [0, 1, -1, 2, -2, ...] up to searchRadius
  const offsets = Array.from({ length: searchRadius + 1 }, (_, index) => index);
  const candidateOffsets = offsets.flatMap((offset) => (offset === 0 ? [0] : [offset, -offset]));

  // Find first safe candidate
  const safeForcedLine = candidateOffsets
    .flatMap((offset) => {
      const candidate = targetLine + offset;
      return candidate >= minLine && candidate <= maxLine ? [candidate] : [];
    })
    .find((candidate) => !findOverlappingZone(candidate, candidate, zones));

  if (safeForcedLine !== undefined) {
    return { line: safeForcedLine, boundaryType: BOUNDARY_TYPES.FORCED };
  }

  // Fallback: use target line (may split a zone)
  return { line: targetLine, boundaryType: BOUNDARY_TYPES.FORCED };
};

/**
 * Gets protected zones that fall within a line range.
 *
 * @param startLine - Start line (1-indexed)
 * @param endLine - End line (1-indexed)
 * @param allZones - All protected zones
 * @returns Zones within the range
 */
const getZonesInRange = (
  startLine: number,
  endLine: number,
  allZones: readonly ProtectedZone[]
): readonly ProtectedZone[] =>
  allZones.filter(
    (zone) =>
      // Zone starts within range
      (zone.startLine >= startLine && zone.startLine <= endLine) ||
      // Zone is completely within range
      (zone.startLine >= startLine && zone.endLine <= endLine)
  );

/**
 * Handles oversized protected zones by middle-truncating them.
 *
 * @param lines - Lines of the protected zone
 * @param maxLines - Maximum lines to keep
 * @returns Truncated lines with first 50 and last 50 preserved
 */
const truncateOversizedZone = (lines: readonly string[], maxLines: number): readonly string[] => {
  if (lines.length <= maxLines) {
    return lines;
  }

  const keepLines = Math.floor(maxLines / 2);
  const firstPart = lines.slice(0, keepLines);
  const lastPart = lines.slice(-keepLines);
  const removed = lines.length - keepLines * 2;

  return [
    ...firstPart,
    `... [${removed} lines truncated from middle of stack trace] ...`,
    ...lastPart,
  ];
};

/**
 * Internal context for chunk generation.
 */
interface ChunkGenerationContext {
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
 * Creates a chunk for an oversized protected zone.
 */
const createOversizedZoneChunk = (
  context: ChunkGenerationContext,
  overlappingZone: ProtectedZone,
  chunkId: number
): { chunk: ChunkResult; nextStartLine: number } => {
  const zoneLines = context.lines.slice(overlappingZone.startLine - 1, overlappingZone.endLine);
  const truncatedZoneLines = truncateOversizedZone(
    zoneLines,
    context.maxLinesPerChunk - 10 // Leave room for context
  );

  const chunkContent = truncatedZoneLines.join("\n");

  return {
    chunk: {
      chunkId,
      content: chunkContent,
      lineOffset: overlappingZone.startLine,
      lineCount: truncatedZoneLines.length,
      estimatedTokens: estimateTokens(chunkContent),
      protectedZones: [
        {
          ...overlappingZone,
          endLine: overlappingZone.startLine + truncatedZoneLines.length - 1,
        },
      ],
      boundaryType: BOUNDARY_TYPES.FORCED,
    },
    nextStartLine: overlappingZone.endLine + 1,
  };
};

/**
 * Creates a normal chunk.
 */
const createNormalChunk = (
  context: ChunkGenerationContext,
  currentStartLine: number,
  endLine: number,
  boundaryType: BoundaryType,
  chunkId: number
): { chunk: ChunkResult; nextStartLine: number } => {
  const chunkLines = context.lines.slice(currentStartLine - 1, endLine);
  const chunkContent = chunkLines.join("\n");
  const chunkZones = getZonesInRange(currentStartLine, endLine, context.allZones);

  const nextStart = endLine + 1 - context.overlapLines;
  const nextStartLine = Math.max(nextStart, endLine + 1);

  return {
    chunk: {
      chunkId,
      content: chunkContent,
      lineOffset: currentStartLine,
      lineCount: chunkLines.length,
      estimatedTokens: estimateTokens(chunkContent),
      protectedZones: chunkZones,
      boundaryType,
    },
    nextStartLine,
  };
};

/**
 * Recursively generates chunks.
 */
const generateChunks = (
  context: ChunkGenerationContext,
  currentStartLine: number,
  accumulatedChunks: readonly ChunkResult[]
): readonly ChunkResult[] => {
  // Base case: done chunking
  if (currentStartLine > context.totalLines || accumulatedChunks.length >= context.maxChunks) {
    return accumulatedChunks;
  }

  const chunkId = accumulatedChunks.length;

  // Calculate target end line for this chunk
  const targetEndLine = Math.min(
    currentStartLine + context.targetLinesPerChunk - 1,
    context.totalLines
  );

  // Find best split point
  const { line: splitLine, boundaryType } = findBestSplitPoint(
    targetEndLine,
    context.lines,
    context.boundaries,
    context.allZones,
    Math.floor(context.targetLinesPerChunk / 4)
  );

  // Get chunk lines (ensuring we don't exceed max)
  const endLine = Math.min(splitLine, currentStartLine + context.maxLinesPerChunk - 1);

  // Check if we're splitting a large protected zone
  const overlappingZone = findOverlappingZone(currentStartLine, endLine, context.allZones);

  const isOversizedZone =
    overlappingZone &&
    overlappingZone.endLine - overlappingZone.startLine + 1 > context.maxLinesPerChunk;

  const { chunk, nextStartLine } = isOversizedZone
    ? createOversizedZoneChunk(context, overlappingZone, chunkId)
    : createNormalChunk(context, currentStartLine, endLine, boundaryType, chunkId);

  // Prevent infinite loop - ensure we make progress
  const safeNextStart = nextStartLine <= currentStartLine ? endLine + 1 : nextStartLine;

  // Recursive call with new chunk added
  return generateChunks(context, safeNextStart, [...accumulatedChunks, chunk]);
};

/**
 * Main chunking function that splits sanitized logs into chunks.
 * Uses recursive approach with immutable accumulation.
 *
 * @param content - Sanitized log content
 * @param options - Chunking options
 * @returns Chunking result with chunks and metadata
 */
export const chunkLog = (content: string, options: ChunkingOptions = {}): ChunkingResult => {
  const targetTokens = options.targetTokens ?? CHUNKING_DEFAULTS.TARGET_TOKENS;
  const maxTokens = options.maxTokens ?? CHUNKING_DEFAULTS.MAX_TOKENS;
  const overlapLines = options.overlapLines ?? CHUNKING_DEFAULTS.OVERLAP_LINES;
  const maxChunks = options.maxChunks ?? CHUNKING_DEFAULTS.MAX_CHUNKS;
  const smallLogThreshold = options.smallLogThreshold ?? CHUNKING_DEFAULTS.SMALL_LOG_THRESHOLD;

  const lines = content.split("\n");
  const totalTokens = estimateTokens(content);
  const totalLines = lines.length;

  // Detect CI platform
  const detectedPlatform = detectCIPlatform(content);

  // Check if log is small enough to skip chunking
  if (totalTokens <= smallLogThreshold) {
    return {
      chunks: [
        {
          chunkId: 0,
          content,
          lineOffset: 1,
          lineCount: totalLines,
          estimatedTokens: totalTokens,
          protectedZones: detectProtectedZones(lines),
          boundaryType: BOUNDARY_TYPES.NATURAL,
        },
      ],
      totalLines,
      totalTokens,
      skippedChunking: true,
      detectedPlatform,
    };
  }

  // Detect protected zones and natural boundaries
  const allZones = detectProtectedZones(lines);
  const boundaries = findNaturalBoundaries(lines, detectedPlatform);

  // Calculate approximate lines per chunk based on target tokens
  const avgCharsPerLine = content.length / totalLines;
  const avgTokensPerLine = avgCharsPerLine / TOKEN_ESTIMATION.CHARS_PER_TOKEN;
  const targetLinesPerChunk = Math.floor(targetTokens / avgTokensPerLine);
  const maxLinesPerChunk = Math.floor(maxTokens / avgTokensPerLine);

  const context: ChunkGenerationContext = {
    lines,
    totalLines,
    allZones,
    boundaries,
    targetLinesPerChunk,
    maxLinesPerChunk,
    overlapLines,
    maxChunks,
  };

  const chunks = generateChunks(context, 1, []);

  return {
    chunks,
    totalLines,
    totalTokens,
    skippedChunking: false,
    detectedPlatform,
  };
};

// ==================== Utility Exports ====================

/**
 * Validates chunking options and returns normalized values.
 *
 * @param options - User-provided options
 * @returns Normalized options with defaults applied
 */
export const normalizeChunkingOptions = (
  options: ChunkingOptions = {}
): Required<ChunkingOptions> => ({
  targetTokens: options.targetTokens ?? CHUNKING_DEFAULTS.TARGET_TOKENS,
  maxTokens: options.maxTokens ?? CHUNKING_DEFAULTS.MAX_TOKENS,
  overlapLines: options.overlapLines ?? CHUNKING_DEFAULTS.OVERLAP_LINES,
  maxChunks: options.maxChunks ?? CHUNKING_DEFAULTS.MAX_CHUNKS,
  smallLogThreshold: options.smallLogThreshold ?? CHUNKING_DEFAULTS.SMALL_LOG_THRESHOLD,
});
