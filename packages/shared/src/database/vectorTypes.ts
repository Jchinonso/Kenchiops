/**
 * Vector Repository Types
 *
 * Type definitions for RAG vector storage operations.
 * Used by diff chunks and knowledge documents repositories.
 *
 * @module database/vectorTypes
 */

import type { KnowledgeDocType } from "../constants/index.js";

// ==================== Diff Chunk Types ====================

/**
 * Represents a chunk of code diff stored with its vector embedding.
 * Matches database schema from base table plus RAG metadata columns.
 */
export interface DiffChunk {
  readonly id: string;
  readonly repository: string;
  readonly prNumber: number;
  readonly commitSha: string;
  readonly filePath: string;
  readonly hunkHeader: string | null;
  readonly content: string;
  readonly chunkIndex: number;
  readonly startLine: number | null;
  readonly endLine: number | null;
  readonly embedding: readonly number[] | null;
  readonly embeddingModel: string;
  readonly embeddingVersion: string;
  readonly tenantId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date | null;
}

/**
 * Input for creating a new diff chunk.
 */
export interface CreateDiffChunkInput {
  readonly repository: string;
  readonly prNumber: number;
  readonly commitSha: string;
  readonly filePath: string;
  readonly hunkHeader?: string;
  readonly content: string;
  readonly chunkIndex?: number;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly embedding?: readonly number[];
  readonly embeddingModel?: string;
  readonly embeddingVersion?: string;
  readonly tenantId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Database row type for diff chunks.
 * Matches PostgreSQL column names (snake_case).
 */
export interface DiffChunkRow {
  readonly id: string;
  readonly repository: string;
  readonly pr_number: number;
  readonly commit_sha: string;
  readonly file_path: string;
  readonly hunk_header: string | null;
  readonly content: string;
  readonly chunk_index: number;
  readonly start_line: number | null;
  readonly end_line: number | null;
  readonly embedding: string | null;
  readonly embedding_model: string;
  readonly embedding_version: string;
  readonly tenant_id: string | null;
  readonly metadata: string | null;
  readonly created_at: Date;
  readonly updated_at: Date | null;
}

// ==================== Knowledge Document Types ====================

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

/**
 * Row type for similarity search results (diff chunks).
 */
export interface DiffChunkSimilarityRow extends DiffChunkRow {
  readonly similarity: number;
}

/**
 * Row type for similarity search results (knowledge docs).
 */
export interface KnowledgeDocSimilarityRow extends KnowledgeDocRow {
  readonly similarity: number;
}

// ==================== Mapping Functions ====================

/**
 * Parses a PostgreSQL vector string to number array.
 * Format: "[0.1,0.2,0.3,...]"
 */
export const parseEmbeddingVector = (vectorString: string | null): readonly number[] | null => {
  if (!vectorString) {
    return null;
  }

  const cleanString = vectorString.replace(/^\[|\]$/g, "");
  return Object.freeze(cleanString.split(",").map(Number));
};

/**
 * Parses a JSONB field from PostgreSQL.
 * PostgreSQL JSONB columns return objects directly when using the pg driver.
 * This handles both cases: string (needs parsing) or already-parsed object.
 */
export const parseJsonbField = (
  value: string | Record<string, unknown> | null
): Record<string, unknown> | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Formats a number array as PostgreSQL vector string.
 */
export const formatEmbeddingVector = (embedding: readonly number[]): string =>
  `[${embedding.join(",")}]`;

/**
 * Maps a database row to DiffChunk domain object.
 */
export const mapRowToDiffChunk = (row: DiffChunkRow): DiffChunk => ({
  id: row.id,
  repository: row.repository,
  prNumber: row.pr_number,
  commitSha: row.commit_sha,
  filePath: row.file_path,
  hunkHeader: row.hunk_header,
  content: row.content,
  chunkIndex: row.chunk_index,
  startLine: row.start_line,
  endLine: row.end_line,
  embedding: parseEmbeddingVector(row.embedding),
  embeddingModel: row.embedding_model,
  embeddingVersion: row.embedding_version,
  tenantId: row.tenant_id,
  metadata: parseJsonbField(row.metadata),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

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
