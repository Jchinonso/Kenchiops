/**
 * Diff Chunk Types
 *
 * Type definitions for code diff chunks with vector embeddings.
 * Used by the diff chunk repository for RAG operations.
 *
 * @module database/diffChunk/types
 */

import type { VectorSearchFilters } from "../common.js";

// ==================== Domain Types ====================

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

// ==================== Database Row Types ====================

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

/**
 * Row type for similarity search results (diff chunks).
 */
export interface DiffChunkSimilarityRow extends DiffChunkRow {
  readonly similarity: number;
}

// ==================== Validation Types ====================

/**
 * Validation rule for CreateDiffChunkInput fields.
 */
export interface DiffChunkInputValidationRule {
  readonly field: keyof CreateDiffChunkInput;
  readonly isInvalid: (input: CreateDiffChunkInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateDiffChunkInput) => unknown;
}

/**
 * Filter handler configuration for search conditions.
 */
export interface DiffChunkFilterHandler {
  readonly key: keyof VectorSearchFilters;
  readonly column: string;
}

/**
 * Result of building search conditions.
 */
export interface SearchConditionsResult {
  readonly conditions: readonly string[];
  readonly params: readonly unknown[];
}
