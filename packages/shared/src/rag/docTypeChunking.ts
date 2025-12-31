/**
 * Doc-Type-Specific Chunking Functions
 *
 * Provides specialized chunking implementations for different document types.
 *
 * @module rag/docTypeChunking
 */

import { createLogger } from "../core/logger.js";
import {
  chunkText,
  splitMarkdownSections,
  type ChunkingOptions,
  type TextChunk,
  type MarkdownSection,
} from "./chunking.js";
import { getChunkingStrategy, type ChunkingStrategy } from "./chunkingStrategies.js";

const logger = createLogger("doc-type-chunking");

// ==================== Result Types ====================

/**
 * Result of doc-type-specific chunking.
 */
export interface DocTypeChunkResult {
  readonly chunks: readonly TextChunk[];
  readonly docType: string;
  readonly strategy: string;
  readonly metadata: {
    readonly originalLength: number;
    readonly chunkCount: number;
    readonly preservedSections: boolean;
  };
}

// ==================== Helper Functions ====================

/**
 * Estimates token count using character approximation.
 */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * Builds context prefix from template.
 */
const buildContextPrefix = (template: string, docType: string, title?: string): string =>
  template.replace("{docType}", docType).replace("{title}", title ?? "Untitled");

/**
 * Chunks a section while respecting token limits.
 */
const chunkSection = (section: MarkdownSection, options: ChunkingOptions): readonly TextChunk[] => {
  const sectionContent = section.header
    ? `## ${section.header}\n\n${section.content}`
    : section.content;

  return chunkText(sectionContent, options);
};

/**
 * Merges small sections to avoid overly fragmented chunks.
 */
const mergeSections = (
  sections: readonly MarkdownSection[],
  maxTokens: number
): readonly MarkdownSection[] => {
  const result: MarkdownSection[] = [];
  let currentMerged: MarkdownSection | null = null;
  let currentTokens = 0;

  sections.forEach((section) => {
    const sectionTokens = estimateTokens(section.content);

    if (!currentMerged) {
      currentMerged = section;
      currentTokens = sectionTokens;
      return;
    }

    const combinedTokens = currentTokens + sectionTokens;

    if (combinedTokens <= maxTokens && section.level >= (currentMerged.level || 1)) {
      currentMerged = {
        header: currentMerged.header,
        content: `${currentMerged.content}\n\n## ${section.header}\n${section.content}`,
        level: currentMerged.level,
      };
      currentTokens = combinedTokens;
    } else {
      result.push(currentMerged);
      currentMerged = section;
      currentTokens = sectionTokens;
    }
  });

  if (currentMerged) {
    result.push(currentMerged);
  }

  return result;
};

// ==================== Chunking Implementations ====================

/**
 * Chunks content as an atomic unit if small enough.
 */
const chunkAtomic = (
  content: string,
  strategy: ChunkingStrategy,
  contextPrefix: string
): readonly TextChunk[] => {
  const tokens = estimateTokens(content);

  if (tokens <= strategy.atomicMaxTokens) {
    const fullContent = contextPrefix + content;
    return [
      {
        content: fullContent,
        metadata: {
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: content.length,
          estimatedTokens: estimateTokens(fullContent),
        },
      },
    ];
  }

  const options: ChunkingOptions = {
    targetTokens: strategy.targetTokens,
    minTokens: strategy.minTokens,
    maxTokens: strategy.maxTokens,
    overlapRatio: strategy.overlapRatio,
  };

  const chunks = chunkText(content, options);

  return chunks.map((chunk, index) => ({
    ...chunk,
    content: index === 0 ? contextPrefix + chunk.content : chunk.content,
  }));
};

/**
 * Chunks content preserving section structure.
 */
const chunkWithSections = (
  content: string,
  strategy: ChunkingStrategy,
  contextPrefix: string
): readonly TextChunk[] => {
  const sections = splitMarkdownSections(content);

  if (sections.length === 0) {
    return chunkAtomic(content, strategy, contextPrefix);
  }

  const mergedSections = mergeSections(sections, strategy.maxTokens);

  const options: ChunkingOptions = {
    targetTokens: strategy.targetTokens,
    minTokens: strategy.minTokens,
    maxTokens: strategy.maxTokens,
    overlapRatio: strategy.overlapRatio,
  };

  const allChunks: TextChunk[] = [];
  let globalIndex = 0;

  mergedSections.forEach((section, sectionIndex) => {
    const sectionChunks = chunkSection(section, options);

    sectionChunks.forEach((chunk, chunkIndex) => {
      const isFirst = sectionIndex === 0 && chunkIndex === 0;
      allChunks.push({
        ...chunk,
        content: isFirst ? contextPrefix + chunk.content : chunk.content,
        metadata: {
          ...chunk.metadata,
          chunkIndex: globalIndex,
        },
      });
      globalIndex++;
    });
  });

  const totalChunks = allChunks.length;
  return allChunks.map((chunk) => ({
    ...chunk,
    metadata: { ...chunk.metadata, totalChunks },
  }));
};

/**
 * Chunks content using standard strategy.
 */
const chunkStandard = (
  content: string,
  strategy: ChunkingStrategy,
  contextPrefix: string
): readonly TextChunk[] => {
  const options: ChunkingOptions = {
    targetTokens: strategy.targetTokens,
    minTokens: strategy.minTokens,
    maxTokens: strategy.maxTokens,
    overlapRatio: strategy.overlapRatio,
  };

  const rawChunks = chunkText(content, options);

  return rawChunks.map((chunk, index) => ({
    ...chunk,
    content: index === 0 ? contextPrefix + chunk.content : chunk.content,
  }));
};

// ==================== Main Function ====================

/**
 * Chunks document content using doc-type-specific strategy.
 *
 * @param content - The document content to chunk
 * @param docType - The document type
 * @param title - Optional document title
 * @returns Chunked content with strategy metadata
 */
export const chunkByDocType = (
  content: string,
  docType: string,
  title?: string
): DocTypeChunkResult => {
  const strategy = getChunkingStrategy(docType);
  const contextPrefix = buildContextPrefix(strategy.contextTemplate, docType, title);

  const strategyType = strategy.preserveSections
    ? "section-aware"
    : strategy.atomicUnit
      ? "atomic"
      : "standard";

  logger.debug("Chunking document", {
    docType,
    contentLength: content.length,
    strategy: strategyType,
  });

  let chunks: readonly TextChunk[];

  if (strategy.atomicUnit) {
    chunks = chunkAtomic(content, strategy, contextPrefix);
  } else if (strategy.preserveSections) {
    chunks = chunkWithSections(content, strategy, contextPrefix);
  } else {
    chunks = chunkStandard(content, strategy, contextPrefix);
  }

  logger.debug("Chunking complete", {
    docType,
    chunkCount: chunks.length,
    strategy: strategyType,
  });

  return {
    chunks,
    docType,
    strategy: strategyType,
    metadata: {
      originalLength: content.length,
      chunkCount: chunks.length,
      preservedSections: strategy.preserveSections,
    },
  };
};
