/**
 * Diff Chunk Helpers
 *
 * Validation and query builder utilities for diff chunk repository.
 *
 * @module database/diffChunk/helpers
 */

import {
  ValidationError,
  VECTOR_SIMILARITY_THRESHOLDS,
  DIFF_CHUNK_DEFAULTS,
  DIFF_CHUNK_QUERIES,
  EMBEDDING_CONFIG,
  formatEmbeddingVector,
  parseEmbeddingVector,
  parseJsonbField,
  type VectorSearchFilters,
} from "../common.js";
import type {
  CreateDiffChunkInput,
  DiffChunk,
  DiffChunkFilterHandler,
  DiffChunkInputValidationRule,
  DiffChunkRow,
  SearchConditionsResult,
  SimilaritySearchQueryResult,
} from "./types.js";

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
 * Validates that a number is positive.
 *
 * @throws ValidationError if value is not positive
 */
export const validatePositiveNumber = (value: number, fieldName: string, minimum: number): void => {
  if (!Number.isFinite(value) || value < minimum) {
    throw new ValidationError(`${fieldName} must be at least ${minimum}`, {
      operation: "validatePositiveNumber",
      metadata: { field: fieldName, value, minimum },
    });
  }
};

/** Validation rules for CreateDiffChunkInput. */
const CREATE_INPUT_VALIDATION_RULES: readonly DiffChunkInputValidationRule[] = [
  {
    field: "repository",
    isInvalid: (input) => input.repository.trim().length === 0,
    message: "Repository cannot be empty",
  },
  {
    field: "prNumber",
    isInvalid: (input) =>
      !Number.isFinite(input.prNumber) || input.prNumber < DIFF_CHUNK_DEFAULTS.MIN_PR_NUMBER,
    message: "PR number must be a positive integer",
    getValue: (input) => input.prNumber,
  },
  {
    field: "commitSha",
    isInvalid: (input) => input.commitSha.trim().length === 0,
    message: "Commit SHA cannot be empty",
  },
  {
    field: "filePath",
    isInvalid: (input) => input.filePath.trim().length === 0,
    message: "File path cannot be empty",
  },
  {
    field: "content",
    isInvalid: (input) => input.content.length === 0,
    message: "Content cannot be empty",
  },
];

/**
 * Validates CreateDiffChunkInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateCreateInput = (input: CreateDiffChunkInput): void => {
  const failedRule = CREATE_INPUT_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(input);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateCreateInput",
    metadata,
  });
};

// ==================== Query Builders ====================

/** Filter handlers for building WHERE clauses. */
const FILTER_HANDLERS: readonly DiffChunkFilterHandler[] = [
  { key: "tenantId", column: "tenant_id" },
  { key: "repository", column: "repository" },
  { key: "prNumber", column: "pr_number" },
  { key: "filePath", column: "file_path" },
];

/**
 * Builds WHERE clause conditions for similarity search.
 */
export const buildSearchConditions = (
  filters: VectorSearchFilters,
  startParamIndex: number
): SearchConditionsResult => {
  const result = FILTER_HANDLERS.reduce<{
    conditions: readonly string[];
    params: readonly unknown[];
    paramIndex: number;
  }>(
    (accumulator, handler) => {
      const value = filters[handler.key];

      if (value === undefined) {
        return accumulator;
      }

      return {
        conditions: [...accumulator.conditions, `${handler.column} = $${accumulator.paramIndex}`],
        params: [...accumulator.params, value],
        paramIndex: accumulator.paramIndex + 1,
      };
    },
    { conditions: [], params: [], paramIndex: startParamIndex }
  );

  return { conditions: result.conditions, params: result.params };
};

/**
 * Builds complete similarity search query with filters.
 */
export const buildSimilaritySearchQuery = (
  filters: VectorSearchFilters
): SimilaritySearchQueryResult => {
  const minSimilarity = filters.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.DIFF_CHUNKS;
  const limit = Math.min(
    filters.limit ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
    VECTOR_SIMILARITY_THRESHOLDS.MAX_TOP_K
  );

  const { conditions, params } = buildSearchConditions(filters, 2);

  const whereClause =
    conditions.length > 0
      ? `${DIFF_CHUNK_QUERIES.SEARCH_SIMILAR} AND ${conditions.join(" AND ")}`
      : DIFF_CHUNK_QUERIES.SEARCH_SIMILAR;

  const fullQuery = `
    ${whereClause}
    AND 1 - (embedding <=> $1::vector) >= ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;

  return { query: fullQuery, params };
};

// ==================== Serialization Helpers ====================

/**
 * Serializes optional metadata to JSON string.
 */
const serializeMetadata = (metadata: Record<string, unknown> | undefined): string | null =>
  metadata === undefined ? null : JSON.stringify(metadata);

/**
 * Prepares diff chunk insert parameters.
 */
export const prepareInsertParams = (
  id: string,
  input: CreateDiffChunkInput
): ReadonlyArray<string | number | null> => [
  id,
  input.repository,
  input.prNumber,
  input.commitSha,
  input.filePath,
  input.hunkHeader ?? null,
  input.content,
  input.chunkIndex ?? DIFF_CHUNK_DEFAULTS.DEFAULT_CHUNK_INDEX,
  input.startLine ?? null,
  input.endLine ?? null,
  input.embedding ? formatEmbeddingVector(input.embedding) : null,
  input.embeddingModel ?? EMBEDDING_CONFIG.MODEL,
  input.embeddingVersion ?? DIFF_CHUNK_DEFAULTS.DEFAULT_EMBEDDING_VERSION,
  input.tenantId ?? null,
  serializeMetadata(input.metadata),
];

// ==================== Row Mappers ====================

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
