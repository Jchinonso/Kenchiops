/**
 * Chunking Strategy Definitions
 *
 * Defines doc-type-specific chunking configurations for optimal retrieval.
 *
 * @module rag/chunkingStrategies
 */

// ==================== Doc Type Constants ====================

/**
 * Document type constants for chunking strategies.
 */
import type { ChunkingStrategy } from "./types.js";

export const DOC_TYPES = {
  ANALYSIS_LESSON: "analysis_lesson",
  PR_FIX_COMMENT: "pr_fix_comment",
  SLACK_RESOLUTION: "slack_resolution",
  RUNBOOK: "runbook",
  SOP: "sop",
  TROUBLESHOOTING: "troubleshooting",
  POSTMORTEM: "postmortem",
  DOCUMENTATION: "documentation",
  EXTERNAL: "external",
} as const;
export type { ChunkingStrategy } from "./types.js";

// ==================== Strategy Definitions ====================

/**
 * Default chunking strategy for general documents.
 */
export const DEFAULT_STRATEGY: ChunkingStrategy = {
  targetTokens: 400,
  minTokens: 100,
  maxTokens: 500,
  overlapRatio: 0.1,
  preserveSections: false,
  atomicUnit: false,
  atomicMaxTokens: 600,
  contextTemplate: "Document Type: {docType}\n\n",
};

/**
 * Strategy for analysis lessons - keeps error + fix together.
 */
export const ANALYSIS_LESSON_STRATEGY: ChunkingStrategy = {
  targetTokens: 350,
  minTokens: 80,
  maxTokens: 450,
  overlapRatio: 0.15,
  preserveSections: false,
  atomicUnit: true,
  atomicMaxTokens: 500,
  contextTemplate: "Error Analysis Lesson\n\n",
};

/**
 * Strategy for PR fix comments - preserve full context.
 */
export const PR_FIX_COMMENT_STRATEGY: ChunkingStrategy = {
  targetTokens: 300,
  minTokens: 50,
  maxTokens: 400,
  overlapRatio: 0.1,
  preserveSections: false,
  atomicUnit: true,
  atomicMaxTokens: 600,
  contextTemplate: "PR Fix Comment\n\n",
};

/**
 * Strategy for Slack resolutions - chunk by message with thread context.
 */
export const SLACK_RESOLUTION_STRATEGY: ChunkingStrategy = {
  targetTokens: 350,
  minTokens: 80,
  maxTokens: 450,
  overlapRatio: 0.2,
  preserveSections: false,
  atomicUnit: true,
  atomicMaxTokens: 700,
  contextTemplate: "Slack Resolution Thread\n\n",
};

/**
 * Strategy for runbooks - section-aware chunking.
 */
export const RUNBOOK_STRATEGY: ChunkingStrategy = {
  targetTokens: 400,
  minTokens: 100,
  maxTokens: 600,
  overlapRatio: 0.1,
  preserveSections: true,
  atomicUnit: false,
  atomicMaxTokens: 800,
  contextTemplate: "Runbook: {title}\n\n",
};

/**
 * Strategy for postmortems - section-aware chunking.
 */
export const POSTMORTEM_STRATEGY: ChunkingStrategy = {
  targetTokens: 450,
  minTokens: 100,
  maxTokens: 600,
  overlapRatio: 0.15,
  preserveSections: true,
  atomicUnit: false,
  atomicMaxTokens: 800,
  contextTemplate: "Postmortem: {title}\n\n",
};

/**
 * Strategy for troubleshooting guides - section-aware.
 */
export const TROUBLESHOOTING_STRATEGY: ChunkingStrategy = {
  targetTokens: 400,
  minTokens: 100,
  maxTokens: 550,
  overlapRatio: 0.1,
  preserveSections: true,
  atomicUnit: false,
  atomicMaxTokens: 700,
  contextTemplate: "Troubleshooting Guide: {title}\n\n",
};

/**
 * Strategy for SOPs - section-aware chunking.
 */
export const SOP_STRATEGY: ChunkingStrategy = {
  targetTokens: 400,
  minTokens: 100,
  maxTokens: 550,
  overlapRatio: 0.1,
  preserveSections: true,
  atomicUnit: false,
  atomicMaxTokens: 700,
  contextTemplate: "Standard Operating Procedure: {title}\n\n",
};

/**
 * Strategy for external docs - general purpose.
 */
export const EXTERNAL_STRATEGY: ChunkingStrategy = {
  targetTokens: 400,
  minTokens: 100,
  maxTokens: 500,
  overlapRatio: 0.1,
  preserveSections: true,
  atomicUnit: false,
  atomicMaxTokens: 600,
  contextTemplate: "External Documentation\n\n",
};

// ==================== Strategy Registry ====================

const strategyEntries: ReadonlyArray<[string, ChunkingStrategy]> = [
  [DOC_TYPES.ANALYSIS_LESSON, ANALYSIS_LESSON_STRATEGY],
  [DOC_TYPES.PR_FIX_COMMENT, PR_FIX_COMMENT_STRATEGY],
  [DOC_TYPES.SLACK_RESOLUTION, SLACK_RESOLUTION_STRATEGY],
  [DOC_TYPES.RUNBOOK, RUNBOOK_STRATEGY],
  [DOC_TYPES.SOP, SOP_STRATEGY],
  [DOC_TYPES.TROUBLESHOOTING, TROUBLESHOOTING_STRATEGY],
  [DOC_TYPES.POSTMORTEM, POSTMORTEM_STRATEGY],
  [DOC_TYPES.DOCUMENTATION, DEFAULT_STRATEGY],
  [DOC_TYPES.EXTERNAL, EXTERNAL_STRATEGY],
];

/**
 * Maps doc types to their chunking strategies.
 */
export const STRATEGY_REGISTRY: ReadonlyMap<string, ChunkingStrategy> = new Map(strategyEntries);

// ==================== Registry Functions ====================

/**
 * Gets the chunking strategy for a document type.
 *
 * @param docType - The document type
 * @returns The chunking strategy for this doc type
 */
export const getChunkingStrategy = (docType: string): ChunkingStrategy =>
  STRATEGY_REGISTRY.get(docType) ?? DEFAULT_STRATEGY;

/**
 * Gets all registered doc types with strategies.
 *
 * @returns Array of doc types with their strategies
 */
export const getRegisteredDocTypesWithStrategies = (): ReadonlyArray<{
  readonly docType: string;
  readonly strategy: ChunkingStrategy;
}> =>
  Array.from(STRATEGY_REGISTRY.entries()).map(([docType, strategy]) => ({
    docType,
    strategy,
  }));

/**
 * Checks if a doc type has a custom chunking strategy.
 *
 * @param docType - The document type to check
 * @returns True if the doc type has a custom strategy
 */
export const hasCustomStrategy = (docType: string): boolean => STRATEGY_REGISTRY.has(docType);
