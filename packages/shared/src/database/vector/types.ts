/**
 * Vector Types
 *
 * Shared types for vector embedding operations.
 * Used by both diff chunk and knowledge document repositories.
 *
 * @module database/vector/types
 */

import type { KnowledgeDocType } from "../../constants/index.js";

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
