/**
 * Knowledge Document Types
 *
 * Type definitions for knowledge documents with vector embeddings.
 * Used by the knowledge document repository for RAG operations.
 *
 * @module database/knowledgeDoc/types
 */

import type { KnowledgeDocType, VectorSearchFilters } from "../common.js";

// ==================== Domain Types ====================

/**
 * Represents a knowledge document chunk stored with its vector embedding.
 * Named `KnowledgeDocRecord` to distinguish from core `KnowledgeDocument` type
 * which is used for LLM evidence representation.
 * Matches database schema from base table plus RAG metadata columns.
 */
export interface KnowledgeDocRecord {
  readonly id: string;
  readonly repository: string | null;
  readonly parentId: string | null;
  readonly docType: KnowledgeDocType;
  readonly title: string;
  readonly content: string;
  readonly sourceUrl: string | null;
  readonly filePath: string | null;
  readonly chunkIndex: number;
  readonly embedding: readonly number[] | null;
  readonly embeddingModel: string;
  readonly embeddingVersion: string;
  readonly tenantId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input for creating a new knowledge document.
 */
export interface CreateKnowledgeDocInput {
  readonly repository?: string;
  readonly parentId?: string;
  readonly docType: KnowledgeDocType;
  readonly title: string;
  readonly content: string;
  readonly sourceUrl?: string;
  readonly filePath?: string;
  readonly chunkIndex?: number;
  readonly embedding?: readonly number[];
  readonly embeddingModel?: string;
  readonly embeddingVersion?: string;
  readonly tenantId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Options for listing knowledge documents by tenant.
 */
export interface KnowledgeDocListOptions {
  readonly docType?: KnowledgeDocType;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Paginated result for knowledge document listing.
 */
export interface KnowledgeDocListResult {
  readonly items: readonly KnowledgeDocRecord[];
  readonly total: number;
}

// ==================== Database Row Types ====================

/**
 * Database row type for knowledge documents.
 * Matches PostgreSQL column names (snake_case).
 */
export interface KnowledgeDocRow {
  readonly id: string;
  readonly repository: string | null;
  readonly parent_id: string | null;
  readonly doc_type: string;
  readonly title: string;
  readonly content: string;
  readonly source_url: string | null;
  readonly file_path: string | null;
  readonly chunk_index: number;
  readonly embedding: string | null;
  readonly embedding_model: string;
  readonly embedding_version: string;
  readonly tenant_id: string | null;
  readonly metadata: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Row type for similarity search results (knowledge docs).
 */
export interface KnowledgeDocSimilarityRow extends KnowledgeDocRow {
  readonly similarity: number;
}

// ==================== Query Builder Types ====================

/**
 * Filter handler for building search conditions.
 */
export interface KnowledgeDocFilterHandler {
  readonly key: keyof VectorSearchFilters;
  readonly column: string;
}
