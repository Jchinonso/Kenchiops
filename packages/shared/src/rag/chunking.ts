/**
 * Text Chunking Utilities for RAG
 *
 * Provides semantic-aware chunking for code diffs and knowledge documents.
 * Optimized for retrieval quality with configurable overlap and token limits.
 *
 * @module rag/chunking
 */

import { CHUNKING_CONFIG } from "../constants/index.js";

// Import what's used internally
import {
  estimateTokenCount,
  createChunkMetadata,
  calculateOverlapChars,
  processNextChunk,
  type ChunkingState,
  type ChunkingOptions,
  type TextChunk,
} from "./chunkingCore.js";
import type { DiffChunkResult, KnowledgeChunkResult, MarkdownSection } from "./types.js";

// Re-export core types and utilities for external consumers
export {
  estimateTokenCount,
  calculateOverlapChars,
  createChunkMetadata,
  createTextChunk,
  findBestSplitPoint,
  processNextChunk,
} from "./chunkingCore.js";

export type {
  ChunkMetadata,
  TextChunk,
  ChunkingOptions,
  ChunkingState,
  DiffChunkResult,
  KnowledgeChunkResult,
  MarkdownSection,
} from "./types.js";

// ==================== Public API ====================

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

// ==================== Markdown Parsing ====================

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
