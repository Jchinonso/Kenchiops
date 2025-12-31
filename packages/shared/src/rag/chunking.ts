/**
 * Text Chunking Utilities for RAG
 *
 * Provides semantic-aware chunking for code diffs and knowledge documents.
 * Optimized for retrieval quality with configurable overlap and token limits.
 *
 * @module rag/chunking
 */

import { CHUNKING_CONFIG } from "../constants/index.js";

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
 * Result of a diff chunking operation.
 */
export interface DiffChunkResult {
  /** The chunked content */
  readonly chunks: readonly TextChunk[];
  /** Original file path */
  readonly filePath: string;
  /** Hunk header if available */
  readonly hunkHeader: string | null;
}

/**
 * Result of a knowledge document chunking operation.
 */
export interface KnowledgeChunkResult {
  /** The chunked content */
  readonly chunks: readonly TextChunk[];
  /** Document title */
  readonly title: string;
  /** Document type */
  readonly docType: string;
}

/**
 * Internal state for recursive chunking.
 */
interface ChunkingState {
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

/**
 * Markdown section with header and content.
 */
export interface MarkdownSection {
  readonly header: string;
  readonly content: string;
  readonly level: number;
}

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

/**
 * Estimates token count for text using character-based approximation.
 */
export const estimateTokenCount = (text: string): number =>
  Math.ceil(text.length / CHUNKING_CONFIG.CHARS_PER_TOKEN);

/**
 * Calculates the overlap size in characters.
 */
const calculateOverlapChars = (targetTokens: number, overlapRatio: number): number =>
  Math.floor(targetTokens * CHUNKING_CONFIG.CHARS_PER_TOKEN * overlapRatio);

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
const findBestSplitPoint = (text: string, targetPos: number, searchRadius: number): number => {
  const candidates = findAllSplitCandidates(text, targetPos, searchRadius);
  return selectBestSplitPoint(candidates, targetPos, text.length);
};

/**
 * Creates chunk metadata for a given chunk.
 */
const createChunkMetadata = (
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
const createTextChunk = (
  content: string,
  chunkIndex: number,
  startOffset: number,
  endOffset: number
): TextChunk => ({
  content,
  metadata: createChunkMetadata(content, chunkIndex, -1, startOffset, endOffset),
});

/**
 * Processes a single chunk and returns the next state (recursive helper).
 */
const processNextChunk = (state: ChunkingState): ChunkingState => {
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

/**
 * Chunks text into overlapping segments of target token size.
 *
 * @param text - The text to chunk
 * @param options - Chunking configuration options
 * @returns Array of text chunks with metadata
 */
export const chunkText = (text: string, options: ChunkingOptions = {}): readonly TextChunk[] => {
  const targetTokens = options.targetTokens ?? CHUNKING_CONFIG.TARGET_TOKENS;
  const minTokens = options.minTokens ?? CHUNKING_CONFIG.MIN_TOKENS;
  const maxTokens = options.maxTokens ?? CHUNKING_CONFIG.MAX_TOKENS;
  const overlapRatio = options.overlapRatio ?? CHUNKING_CONFIG.OVERLAP_RATIO;

  const trimmedText = text.trim();
  const estimatedTokens = estimateTokenCount(trimmedText);

  // Small text: return as single chunk
  if (estimatedTokens <= maxTokens) {
    const metadata = createChunkMetadata(trimmedText, 0, 1, 0, trimmedText.length);
    return [{ content: trimmedText, metadata }];
  }

  const targetChars = targetTokens * CHUNKING_CONFIG.CHARS_PER_TOKEN;
  const searchRadius = Math.floor(targetChars * CHUNKING_CONFIG.SPLIT_SEARCH_RADIUS_RATIO);

  const initialState: ChunkingState = {
    text: trimmedText,
    currentPos: 0,
    chunks: [],
    targetChars,
    overlapChars: calculateOverlapChars(targetTokens, overlapRatio),
    searchRadius,
    minChars: minTokens * CHUNKING_CONFIG.CHARS_PER_TOKEN,
  };

  const finalState = processNextChunk(initialState);
  const totalChunks = finalState.chunks.length;

  // Update totalChunks in all metadata
  return finalState.chunks.map((chunk) => ({
    ...chunk,
    metadata: { ...chunk.metadata, totalChunks },
  }));
};

/**
 * Chunks a code diff into semantically meaningful segments.
 *
 * @param diff - The diff content to chunk
 * @param filePath - Path of the file being diffed
 * @param hunkHeader - Optional hunk header
 * @param options - Chunking configuration options
 * @returns Diff chunk result with file context
 */
export const chunkDiff = (
  diff: string,
  filePath: string,
  hunkHeader: string | null = null,
  options: ChunkingOptions = {}
): DiffChunkResult => {
  const contextPrefix = hunkHeader
    ? `File: ${filePath}\nHunk: ${hunkHeader}\n\n`
    : `File: ${filePath}\n\n`;

  const chunks = chunkText(diff, options);

  const contextualizedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    content: index === 0 ? contextPrefix + chunk.content : chunk.content,
  }));

  return {
    chunks: contextualizedChunks,
    filePath,
    hunkHeader,
  };
};

/**
 * Chunks a knowledge document into semantically meaningful segments.
 *
 * @param content - The document content to chunk
 * @param title - Document title
 * @param docType - Type of document
 * @param options - Chunking configuration options
 * @returns Knowledge chunk result with document context
 */
export const chunkKnowledgeDoc = (
  content: string,
  title: string,
  docType: string,
  options: ChunkingOptions = {}
): KnowledgeChunkResult => {
  const contextPrefix = `Title: ${title}\nType: ${docType}\n\n`;
  const chunks = chunkText(content, options);

  const contextualizedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    content: index === 0 ? contextPrefix + chunk.content : chunk.content,
  }));

  return {
    chunks: contextualizedChunks,
    title,
    docType,
  };
};

/**
 * Recursive helper for parsing markdown sections.
 */
const parseMarkdownSectionsRecursive = (
  lines: readonly string[],
  currentIndex: number,
  currentSection: MarkdownSection | null,
  accumulated: readonly MarkdownSection[]
): readonly MarkdownSection[] => {
  // Base case: processed all lines
  if (currentIndex >= lines.length) {
    return currentSection ? [...accumulated, currentSection] : accumulated;
  }

  const line = lines[currentIndex];
  const headerMatch = /^(#{1,6})\s+(.+)$/.exec(line);

  if (headerMatch) {
    // Found a header - save current section and start new one
    const newSection: MarkdownSection = {
      header: headerMatch[2],
      content: "",
      level: headerMatch[1].length,
    };

    const updatedAccumulated = currentSection ? [...accumulated, currentSection] : accumulated;
    return parseMarkdownSectionsRecursive(lines, currentIndex + 1, newSection, updatedAccumulated);
  }

  // Not a header - append to current section content
  if (currentSection) {
    const updatedSection: MarkdownSection = {
      ...currentSection,
      content: currentSection.content ? `${currentSection.content}\n${line}` : line,
    };
    return parseMarkdownSectionsRecursive(lines, currentIndex + 1, updatedSection, accumulated);
  }

  // No current section and not a header - create implicit section
  const implicitSection: MarkdownSection = {
    header: "",
    content: line,
    level: 0,
  };
  return parseMarkdownSectionsRecursive(lines, currentIndex + 1, implicitSection, accumulated);
};

/**
 * Splits markdown content by headers, preserving structure.
 *
 * @param markdown - Markdown content to split
 * @returns Array of sections with their header and content
 */
export const splitMarkdownSections = (markdown: string): readonly MarkdownSection[] => {
  const lines = markdown.split("\n");
  const sections = parseMarkdownSectionsRecursive(lines, 0, null, []);

  // Trim content and filter empty sections
  return sections
    .map((section) => ({
      ...section,
      content: section.content.trim(),
    }))
    .filter((section) => section.content.length > 0 || section.header.length > 0);
};
