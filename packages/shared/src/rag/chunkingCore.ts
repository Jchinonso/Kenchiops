/**
 * Chunking Core Algorithms
 *
 * Core chunking algorithms, split point detection, and text processing.
 *
 * @module rag/chunkingCore
 */

import { CHUNKING_CONFIG } from "../constants/index.js";

// ==================== Types ====================

/**
 * Metadata attached to each chunk for retrieval context.
 */
export interface ChunkMetadata {
  /** Zero-based index of this chunk within the source */
  readonly chunkIndex: number;
  /** Total number of chunks from the source */
  readonly totalChunks: number;
  /** Starting character offset in original text */
  readonly startOffset: number;
  /** Ending character offset in original text */
  readonly endOffset: number;
  /** Estimated token count for this chunk */
  readonly estimatedTokens: number;
}

/**
 * A single text chunk with metadata.
 */
export interface TextChunk {
  /** The chunk content */
  readonly content: string;
  /** Chunk metadata for retrieval context */
  readonly metadata: ChunkMetadata;
}

/**
 * Configuration for the chunking operation.
 */
export interface ChunkingOptions {
  /** Target token count per chunk */
  readonly targetTokens?: number;
  /** Minimum token count per chunk */
  readonly minTokens?: number;
  /** Maximum token count per chunk */
  readonly maxTokens?: number;
  /** Overlap ratio between adjacent chunks (0.0 to 0.5) */
  readonly overlapRatio?: number;
}

/**
 * Internal state for recursive chunking.
 */
export interface ChunkingState {
  readonly text: string;
  readonly currentPos: number;
  readonly chunks: readonly TextChunk[];
  readonly targetChars: number;
  readonly overlapChars: number;
  readonly searchRadius: number;
  readonly minChars: number;
}

/**
 * Split pattern definition for finding boundaries.
 */
interface SplitPattern {
  readonly pattern: RegExp;
  readonly priority: number;
}

/**
 * Split point candidate with position and priority.
 */
interface SplitCandidate {
  readonly position: number;
  readonly priority: number;
}

// ==================== Constants ====================

/**
 * Priority-ordered patterns for finding split boundaries.
 */
const SPLIT_PATTERNS: readonly SplitPattern[] = [
  { pattern: /\n\n/g, priority: 1 }, // Paragraph break
  { pattern: /\n/g, priority: 2 }, // Line break
  { pattern: /\. /g, priority: 3 }, // Sentence end
  { pattern: /; /g, priority: 4 }, // Semicolon
  { pattern: /, /g, priority: 5 }, // Comma
  { pattern: / /g, priority: 6 }, // Space
] as const;

// ==================== Token Estimation ====================

/**
 * Estimates token count for text using character-based approximation.
 */
export const estimateTokenCount = (text: string): number =>
  Math.ceil(text.length / CHUNKING_CONFIG.CHARS_PER_TOKEN);

/**
 * Calculates the overlap size in characters.
 */
export const calculateOverlapChars = (targetTokens: number, overlapRatio: number): number =>
  Math.floor(targetTokens * CHUNKING_CONFIG.CHARS_PER_TOKEN * overlapRatio);

// ==================== Split Point Detection ====================

/**
 * Finds all matches for a pattern in text within a range.
 */
const findPatternMatches = (
  searchText: string,
  searchStart: number,
  pattern: SplitPattern
): readonly SplitCandidate[] => {
  const regex = new RegExp(pattern.pattern.source, "g");
  const matches: SplitCandidate[] = [];
  const match: RegExpExecArray | null = regex.exec(searchText);

  // Use recursive approach to collect all matches
  const collectMatches = (
    currentMatch: RegExpExecArray | null,
    accumulated: readonly SplitCandidate[]
  ): readonly SplitCandidate[] => {
    if (!currentMatch) {
      return accumulated;
    }

    const candidate: SplitCandidate = {
      position: searchStart + currentMatch.index + currentMatch[0].length,
      priority: pattern.priority,
    };

    return collectMatches(regex.exec(searchText), [...accumulated, candidate]);
  };

  return collectMatches(match, matches);
};

/**
 * Finds all split candidates from all patterns.
 */
const findAllSplitCandidates = (
  text: string,
  targetPos: number,
  searchRadius: number
): readonly SplitCandidate[] => {
  const searchStart = Math.max(0, targetPos - searchRadius);
  const searchEnd = Math.min(text.length, targetPos + searchRadius);
  const searchText = text.slice(searchStart, searchEnd);

  return SPLIT_PATTERNS.flatMap((pattern) => findPatternMatches(searchText, searchStart, pattern));
};

/**
 * Selects the best split point from candidates.
 */
const selectBestSplitPoint = (
  candidates: readonly SplitCandidate[],
  targetPos: number,
  textLength: number
): number => {
  const validCandidates = candidates.filter(
    (candidate) => candidate.position > 0 && candidate.position < textLength
  );

  const sortedCandidates = [...validCandidates].sort((first, second) => {
    const priorityDiff = first.priority - second.priority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return Math.abs(first.position - targetPos) - Math.abs(second.position - targetPos);
  });

  return sortedCandidates[0]?.position ?? targetPos;
};

/**
 * Finds the best split point near a target position.
 */
export const findBestSplitPoint = (
  text: string,
  targetPos: number,
  searchRadius: number
): number => {
  const candidates = findAllSplitCandidates(text, targetPos, searchRadius);
  return selectBestSplitPoint(candidates, targetPos, text.length);
};

// ==================== Chunk Creation ====================

/**
 * Creates chunk metadata for a given chunk.
 */
export const createChunkMetadata = (
  content: string,
  chunkIndex: number,
  totalChunks: number,
  startOffset: number,
  endOffset: number
): ChunkMetadata => ({
  chunkIndex,
  totalChunks,
  startOffset,
  endOffset,
  estimatedTokens: estimateTokenCount(content),
});

/**
 * Creates a single text chunk from content and position.
 */
export const createTextChunk = (
  content: string,
  chunkIndex: number,
  startOffset: number,
  endOffset: number
): TextChunk => ({
  content,
  metadata: createChunkMetadata(content, chunkIndex, -1, startOffset, endOffset),
});

// ==================== Recursive Chunking ====================

/**
 * Processes a single chunk and returns the next state (recursive helper).
 */
export const processNextChunk = (state: ChunkingState): ChunkingState => {
  const { text, currentPos, chunks, targetChars, overlapChars, searchRadius, minChars } = state;

  // Base case: reached end of text
  if (currentPos >= text.length) {
    return state;
  }

  const remainingText = text.length - currentPos;
  const isLastChunk = remainingText <= targetChars + overlapChars;

  // Calculate end position
  const rawEndPos = isLastChunk ? text.length : currentPos + targetChars;
  const endPos = isLastChunk ? rawEndPos : findBestSplitPoint(text, rawEndPos, searchRadius);

  // Extract and validate chunk content
  const chunkContent = text.slice(currentPos, endPos).trim();
  const shouldAddChunk = chunkContent.length >= minChars || isLastChunk;

  // Create new chunks array
  const newChunks = shouldAddChunk
    ? [...chunks, createTextChunk(chunkContent, chunks.length, currentPos, endPos)]
    : chunks;

  // Calculate next position
  const nextPos = isLastChunk ? text.length : Math.max(endPos - overlapChars, currentPos + 1);

  // Recursive call with updated state
  return processNextChunk({
    ...state,
    currentPos: nextPos,
    chunks: newChunks,
  });
};
