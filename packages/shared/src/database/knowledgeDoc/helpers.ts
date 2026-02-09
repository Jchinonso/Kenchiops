/**
 * Knowledge Document Repository Helpers
 *
 * Validation functions and query builders for knowledge document operations.
 * Separated from knowledgeDocRepository for module size compliance.
 *
 * @module database/knowledgeDoc/helpers
 */

import {
  VECTOR_SIMILARITY_THRESHOLDS,
  KNOWLEDGE_DOC_QUERIES,
  KNOWLEDGE_DOC_DEFAULTS,
  parseEmbeddingVector,
  parseJsonbField,
  validateNonEmptyString,
  validateMinimumNumber,
  validateId,
  validateIds,
  validateEmbedding,
  sharedValidateLimit,
  sharedBuildSearchConditions,
  sharedBuildSimilaritySearchQuery,
  type VectorSearchFilters,
  type KnowledgeDocType,
  type FilterHandler,
  type QueryBuilderConfig,
} from "../common.js";
import type { KnowledgeDocRecord, KnowledgeDocRow } from "./types.js";

// Re-export shared validators for backwards compatibility
export {
  validateNonEmptyString,
  validateMinimumNumber,
  validateId,
  validateIds,
  validateEmbedding,
};

// ==================== Input Validation ====================

/**
 * Validates query limit parameter.
 *
 * @throws ValidationError if limit is invalid
 */
export const validateLimit = (limit: number): void => {
  sharedValidateLimit(limit, KNOWLEDGE_DOC_DEFAULTS.MIN_QUERY_LIMIT);
};

// ==================== Query Builders ====================

/** Filter handlers for knowledge doc search. */
const FILTER_HANDLERS: readonly FilterHandler[] = [
  { key: "tenantId", column: "tenant_id" },
  { key: "docType", column: "doc_type" },
];

/** Query builder config for knowledge doc similarity search. */
const QUERY_BUILDER_CONFIG: QueryBuilderConfig = {
  baseQuery: KNOWLEDGE_DOC_QUERIES.SEARCH_SIMILAR,
  defaultSimilarityThreshold: VECTOR_SIMILARITY_THRESHOLDS.KNOWLEDGE_DOCS,
  filterHandlers: FILTER_HANDLERS,
};

/**
 * Builds WHERE clause conditions for knowledge doc similarity search.
 */
export const buildSearchConditions = (
  filters: VectorSearchFilters,
  paramIndex: number
): { conditions: readonly string[]; params: readonly unknown[] } =>
  sharedBuildSearchConditions(filters, FILTER_HANDLERS, paramIndex);

/**
 * Builds complete similarity search query with filters for knowledge docs.
 */
export const buildSimilaritySearchQuery = (
  filters: VectorSearchFilters
): { query: string; params: readonly unknown[] } =>
  sharedBuildSimilaritySearchQuery(filters, QUERY_BUILDER_CONFIG);

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
