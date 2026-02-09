/**
 * Vector Module
 *
 * Shared types and utilities for vector embedding operations.
 *
 * @module database/vector
 */

// Types
export type { VectorSearchResult, VectorSearchFilters } from "./types.js";

// Helpers
export { parseEmbeddingVector, parseJsonbField, formatEmbeddingVector } from "./helpers.js";

// Query builder
export {
  buildSearchConditions,
  buildSimilaritySearchQuery,
  type FilterHandler,
  type QueryBuilderConfig,
  type SearchConditionsResult,
  type SimilaritySearchQueryResult,
} from "./queryBuilder.js";
