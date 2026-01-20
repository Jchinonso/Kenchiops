/**
 * Knowledge Document Repository Helpers
 *
 * Validation functions and query builders for knowledge document operations.
 * Separated from knowledgeDocRepository for module size compliance.
 *
 * @module database/knowledgeDoc/helpers
 */

import {
  ValidationError,
  VECTOR_SIMILARITY_THRESHOLDS,
  KNOWLEDGE_DOC_QUERIES,
  KNOWLEDGE_DOC_DEFAULTS,
  parseEmbeddingVector,
  parseJsonbField,
  type VectorSearchFilters,
  type KnowledgeDocType,
} from "../common.js";
import type { KnowledgeDocFilterHandler, KnowledgeDocRecord, KnowledgeDocRow } from "./types.js";

// ==================== Input Validation ====================

/**
 * Validates that a string is non-empty.
 *
 * @throws ValidationError if value is empty or whitespace-only
 */
export const validateNonEmptyString = (value: string, fieldName: string): void => {
  if (value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, {
      operation: "validateNonEmptyString",
      metadata: { field: fieldName },
    });
  }
};

/**
 * Validates that a number meets minimum requirement.
 *
 * @throws ValidationError if value is below minimum
 */
export const validateMinimumNumber = (value: number, fieldName: string, minimum: number): void => {
  if (!Number.isFinite(value) || value < minimum) {
    throw new ValidationError(`${fieldName} must be at least ${minimum}`, {
      operation: "validateMinimumNumber",
      metadata: { field: fieldName, value, minimum },
    });
  }
};

/**
 * Validates query limit parameter.
 *
 * @throws ValidationError if limit is invalid
 */
export const validateLimit = (limit: number): void => {
  validateMinimumNumber(limit, "limit", KNOWLEDGE_DOC_DEFAULTS.MIN_QUERY_LIMIT);
};

/**
 * Validates embedding array.
 *
 * @throws ValidationError if embedding is empty or contains invalid values
 */
export const validateEmbedding = (embedding: readonly number[]): void => {
  if (embedding.length === 0) {
    throw new ValidationError("Embedding cannot be empty", {
      operation: "validateEmbedding",
      metadata: { length: 0 },
    });
  }

  const hasInvalidValues = embedding.some((value) => !Number.isFinite(value));
  if (hasInvalidValues) {
    throw new ValidationError("Embedding contains invalid values", {
      operation: "validateEmbedding",
      metadata: { length: embedding.length },
    });
  }
};

/**
 * Validates that an ID is non-empty.
 *
 * @throws ValidationError if ID is empty or whitespace-only
 */
export const validateId = (id: string, fieldName: string): void => {
  if (id.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, {
      operation: "validateId",
      metadata: { field: fieldName },
    });
  }
};

/**
 * Validates that an array of IDs contains no empty entries.
 *
 * @throws ValidationError if array contains invalid IDs
 */
export const validateIds = (ids: readonly string[], fieldName: string): void => {
  if (ids.length === 0) {
    return; // Empty array is valid, will short-circuit in batch operations
  }

  const invalidIds = ids.filter((id) => id.trim().length === 0);
  if (invalidIds.length > 0) {
    throw new ValidationError(`${fieldName} contains empty IDs`, {
      operation: "validateIds",
      metadata: { field: fieldName, invalidCount: invalidIds.length },
    });
  }
};

// ==================== Query Builders ====================

/** Filter handlers for knowledge doc search. */
const FILTER_HANDLERS: readonly KnowledgeDocFilterHandler[] = [
  { key: "tenantId", column: "tenant_id" },
  { key: "docType", column: "doc_type" },
];

/**
 * Builds WHERE clause conditions for knowledge doc similarity search.
 *
 * @param filters - Search filters
 * @param paramIndex - Starting parameter index
 * @returns Object with conditions array and params array
 */
export const buildSearchConditions = (
  filters: VectorSearchFilters,
  paramIndex: number
): { conditions: readonly string[]; params: readonly unknown[] } => {
  let currentIndex = paramIndex;

  const result = FILTER_HANDLERS.reduce<{ conditions: string[]; params: unknown[] }>(
    (accumulator, handler) => {
      const value = filters[handler.key];
      if (value !== undefined) {
        return {
          conditions: [...accumulator.conditions, `${handler.column} = $${currentIndex++}`],
          params: [...accumulator.params, value],
        };
      }
      return accumulator;
    },
    { conditions: [], params: [] }
  );

  return {
    conditions: Object.freeze(result.conditions),
    params: Object.freeze(result.params),
  };
};

/**
 * Builds complete similarity search query with filters for knowledge docs.
 *
 * @param filters - Search filters
 * @returns Object with query string and params array
 */
export const buildSimilaritySearchQuery = (
  filters: VectorSearchFilters
): { query: string; params: readonly unknown[] } => {
  const minSimilarity = filters.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.KNOWLEDGE_DOCS;
  const limit = Math.min(
    filters.limit ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
    VECTOR_SIMILARITY_THRESHOLDS.MAX_TOP_K
  );

  const { conditions, params } = buildSearchConditions(filters, 2);

  const whereClause =
    conditions.length > 0
      ? `${KNOWLEDGE_DOC_QUERIES.SEARCH_SIMILAR} AND ${conditions.join(" AND ")}`
      : KNOWLEDGE_DOC_QUERIES.SEARCH_SIMILAR;

  const fullQuery = `
    ${whereClause}
    AND 1 - (embedding <=> $1::vector) >= ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;

  return { query: fullQuery, params };
};

// ==================== Row Mappers ====================

/**
 * Maps a database row to KnowledgeDocRecord domain object.
 */
export const mapRowToKnowledgeDoc = (row: KnowledgeDocRow): KnowledgeDocRecord => ({
  id: row.id,
  repository: row.repository,
  parentId: row.parent_id,
  docType: row.doc_type as KnowledgeDocType,
  title: row.title,
  content: row.content,
  sourceUrl: row.source_url,
  filePath: row.file_path,
  chunkIndex: row.chunk_index,
  embedding: parseEmbeddingVector(row.embedding),
  embeddingModel: row.embedding_model,
  embeddingVersion: row.embedding_version,
  tenantId: row.tenant_id,
  metadata: parseJsonbField(row.metadata) ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
