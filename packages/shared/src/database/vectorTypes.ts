/**
 * Vector Types
 *
 * Shared types and utilities for vector embedding operations.
 * Used by both diff chunk and knowledge document repositories.
 *
 * @module database/vectorTypes
 */

import type { KnowledgeDocType } from "../constants/index.js";

// Re-export domain-specific types for backward compatibility
export type {
  DiffChunk,
  CreateDiffChunkInput,
  DiffChunkRow,
  DiffChunkSimilarityRow,
} from "./diffChunk/types.js";
export { mapRowToDiffChunk } from "./diffChunk/helpers.js";

export type {
  KnowledgeDocRecord,
  CreateKnowledgeDocInput,
  KnowledgeDocRow,
  KnowledgeDocSimilarityRow,
} from "./knowledgeDoc/types.js";
export { mapRowToKnowledgeDoc } from "./knowledgeDoc/helpers.js";

// ==================== Search Types ====================

/**
 * Result from a vector similarity search.
 */
export interface VectorSearchResult<T> {
  readonly item: T;
  readonly similarity: number;
}

/**
 * Filters for vector search operations.
 */
export interface VectorSearchFilters {
  readonly tenantId?: string;
  readonly repository?: string;
  readonly prNumber?: number;
  readonly filePath?: string;
  readonly docType?: KnowledgeDocType;
  readonly minSimilarity?: number;
  readonly limit?: number;
}

// Re-export utility functions for backward compatibility
export { parseEmbeddingVector, parseJsonbField, formatEmbeddingVector } from "./vectorUtils.js";
