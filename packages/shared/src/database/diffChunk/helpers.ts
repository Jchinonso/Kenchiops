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
  validateNonEmptyString,
  validateMinimumNumber,
  sharedBuildSearchConditions,
  sharedBuildSimilaritySearchQuery,
  type VectorSearchFilters,
  type FilterHandler,
  type QueryBuilderConfig,
} from "../common.js";
import type {
  CreateDiffChunkInput,
  DiffChunk,
  DiffChunkInputValidationRule,
  DiffChunkRow,
  SearchConditionsResult,
  SimilaritySearchQueryResult,
} from "./types.js";

// Re-export shared validators for backwards compatibility
export { validateNonEmptyString };

/** @deprecated Use validateMinimumNumber instead */
export const validatePositiveNumber = validateMinimumNumber;

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
const FILTER_HANDLERS: readonly FilterHandler[] = [
  { key: "tenantId", column: "tenant_id" },
  { key: "repository", column: "repository" },
  { key: "prNumber", column: "pr_number" },
  { key: "filePath", column: "file_path" },
];

/** Query builder config for diff chunk similarity search. */
const QUERY_BUILDER_CONFIG: QueryBuilderConfig = {
  baseQuery: DIFF_CHUNK_QUERIES.SEARCH_SIMILAR,
  defaultSimilarityThreshold: VECTOR_SIMILARITY_THRESHOLDS.DIFF_CHUNKS,
  filterHandlers: FILTER_HANDLERS,
};

/**
 * Builds WHERE clause conditions for similarity search.
 */
export const buildSearchConditions = (
  filters: VectorSearchFilters,
  startParamIndex: number
): SearchConditionsResult => sharedBuildSearchConditions(filters, FILTER_HANDLERS, startParamIndex);

/**
 * Builds complete similarity search query with filters.
 */
export const buildSimilaritySearchQuery = (
  filters: VectorSearchFilters
): SimilaritySearchQueryResult => sharedBuildSimilaritySearchQuery(filters, QUERY_BUILDER_CONFIG);

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
