/**
 * Vector Module
 *
 * Shared types and utilities for vector embedding operations.
 *
 * @module database/vector
 */

// Types - re-export from existing root-level files
export type { VectorSearchResult, VectorSearchFilters } from "../vectorTypes.js";

// Utilities - re-export from existing root-level files
export { parseEmbeddingVector, parseJsonbField, formatEmbeddingVector } from "../vectorUtils.js";
