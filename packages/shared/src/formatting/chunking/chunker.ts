/**
 * Log Chunker
 *
 * Implements smart chunking for CI logs that respects logical boundaries
 * and protected zones like stack traces and test output blocks.
 *
 * Stage 1 of the chunking pipeline - splits sanitized logs into chunks
 * that fit within LLM context limits.
 *
 * @module formatting/chunking/chunker
 */

import { TOKEN_ESTIMATION, BOUNDARY_TYPES, type BoundaryType } from "../../constants/index.js";

import type {
  ChunkingOptions,
  ProtectedZone,
  ChunkResult,
  ChunkingResult,
  ChunkGenerationContext,
} from "./types.js";

import {
  estimateTokens,
  detectCIPlatform,
  findNaturalBoundaries,
  normalizeChunkingOptions,
} from "./helpers.js";

import { detectProtectedZones } from "./protectedZones.js";

// ==================== Zone Handling ====================

/**
 * Checks if a line range overlaps with any protected zone.
 */
const findOverlappingZone = (
  startLine: number,
  endLine: number,
  zones: readonly ProtectedZone[]
): ProtectedZone | undefined =>
  zones.find(
    (zone) =>
      (zone.startLine >= startLine && zone.startLine <= endLine) ||
      (zone.endLine >= startLine && zone.endLine <= endLine) ||
      (zone.startLine <= startLine && zone.endLine >= endLine)
  );

/**
 * Gets protected zones that fall within a line range.
 */
const getZonesInRange = (
  startLine: number,
  endLine: number,
  allZones: readonly ProtectedZone[]
): readonly ProtectedZone[] =>
  allZones.filter(
    (zone) =>
      (zone.startLine >= startLine && zone.startLine <= endLine) ||
      (zone.startLine >= startLine && zone.endLine <= endLine)
  );

/**
 * Handles oversized protected zones by middle-truncating them.
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

// ==================== Split Point Detection ====================

/**
 * Finds the best split point near a target line.
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

  const nearbyBoundaries = boundaries.filter(
    (boundary) => boundary >= minLine && boundary <= maxLine
  );

  const sortedBoundaries = nearbyBoundaries.sort(
    (boundaryA, boundaryB) => Math.abs(boundaryA - targetLine) - Math.abs(boundaryB - targetLine)
  );

  const safeBoundary = sortedBoundaries.find((boundary) => {
    const overlapping = findOverlappingZone(boundary, boundary, zones);
    return !overlapping;
  });

  if (safeBoundary) {
    return { line: safeBoundary, boundaryType: BOUNDARY_TYPES.NATURAL };
  }

  const offsets = Array.from({ length: searchRadius + 1 }, (_, index) => index);
  const candidateOffsets = offsets.flatMap((offset) => (offset === 0 ? [0] : [offset, -offset]));

  const safeForcedLine = candidateOffsets
    .flatMap((offset) => {
      const candidate = targetLine + offset;
      return candidate >= minLine && candidate <= maxLine ? [candidate] : [];
    })
    .find((candidate) => !findOverlappingZone(candidate, candidate, zones));

  if (safeForcedLine !== undefined) {
    return { line: safeForcedLine, boundaryType: BOUNDARY_TYPES.FORCED };
  }

  return { line: targetLine, boundaryType: BOUNDARY_TYPES.FORCED };
};

// ==================== Chunk Creation ====================

/**
 * Creates a chunk for an oversized protected zone.
 */
const createOversizedZoneChunk = (
  context: ChunkGenerationContext,
  overlappingZone: ProtectedZone,
  chunkId: number
): { chunk: ChunkResult; nextStartLine: number } => {
  const zoneLines = context.lines.slice(overlappingZone.startLine - 1, overlappingZone.endLine);
  const truncatedZoneLines = truncateOversizedZone(zoneLines, context.maxLinesPerChunk - 10);

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

// ==================== Chunk Generation ====================

/**
 * Recursively generates chunks.
 */
const generateChunks = (
  context: ChunkGenerationContext,
  currentStartLine: number,
  accumulatedChunks: readonly ChunkResult[]
): readonly ChunkResult[] => {
  if (currentStartLine > context.totalLines || accumulatedChunks.length >= context.maxChunks) {
    return accumulatedChunks;
  }

  const chunkId = accumulatedChunks.length;

  const targetEndLine = Math.min(
    currentStartLine + context.targetLinesPerChunk - 1,
    context.totalLines
  );

  const { line: splitLine, boundaryType } = findBestSplitPoint(
    targetEndLine,
    context.lines,
    context.boundaries,
    context.allZones,
    Math.floor(context.targetLinesPerChunk / 4)
  );

  const endLine = Math.min(splitLine, currentStartLine + context.maxLinesPerChunk - 1);

  const overlappingZone = findOverlappingZone(currentStartLine, endLine, context.allZones);

  const isOversizedZone =
    overlappingZone &&
    overlappingZone.endLine - overlappingZone.startLine + 1 > context.maxLinesPerChunk;

  const { chunk, nextStartLine } = isOversizedZone
    ? createOversizedZoneChunk(context, overlappingZone, chunkId)
    : createNormalChunk(context, currentStartLine, endLine, boundaryType, chunkId);

  const safeNextStart = nextStartLine <= currentStartLine ? endLine + 1 : nextStartLine;

  return generateChunks(context, safeNextStart, [...accumulatedChunks, chunk]);
};

// ==================== Main Chunking Function ====================

/**
 * Main chunking function that splits sanitized logs into chunks.
 *
 * @param content - Sanitized log content
 * @param options - Chunking options
 * @returns Chunking result with chunks and metadata
 */
export const chunkLog = (content: string, options: ChunkingOptions = {}): ChunkingResult => {
  const normalizedOptions = normalizeChunkingOptions(options);
  const { targetTokens, maxTokens, overlapLines, maxChunks, smallLogThreshold } = normalizedOptions;

  const lines = content.split("\n");
  const totalTokens = estimateTokens(content);
  const totalLines = lines.length;

  const detectedPlatform = detectCIPlatform(content);

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

  const allZones = detectProtectedZones(lines);
  const boundaries = findNaturalBoundaries(lines, detectedPlatform);

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
