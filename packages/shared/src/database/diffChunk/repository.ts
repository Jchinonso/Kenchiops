/**
 * Diff Chunk Repository
 *
 * Database operations for code diff chunks with vector embeddings.
 * Used for semantic search over PR diffs in RAG pipeline.
 *
 * @module database/diffChunk/repository
 */

import {
  query,
  transaction,
  createLogger,
  generateEventId,
  ValidationError,
  getErrorMessage,
  EMBEDDING_CONFIG,
  DIFF_CHUNK_DEFAULTS,
  DIFF_CHUNK_QUERIES,
  PARSE_INT_RADIX,
  formatEmbeddingVector,
  type VectorSearchFilters,
  type VectorSearchResult,
} from "../common.js";
import type {
  DiffChunk,
  CreateDiffChunkInput,
  DiffChunkRow,
  DiffChunkSimilarityRow,
} from "./types.js";
import {
  mapRowToDiffChunk,
  validateNonEmptyString,
  validatePositiveNumber,
  validateCreateInput,
  buildSimilaritySearchQuery,
  prepareInsertParams,
} from "./helpers.js";

const logger = createLogger("diff-chunk-repository");

// ==================== Public API ====================

/**
 * Creates a new diff chunk in the database.
 *
 * @param input - Diff chunk data to insert
 * @returns The created diff chunk
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createDiffChunk = async (input: CreateDiffChunkInput): Promise<DiffChunk> => {
  validateCreateInput(input);

  const id = generateEventId();

  try {
    const result = await query<DiffChunkRow>(
      DIFF_CHUNK_QUERIES.INSERT,
      prepareInsertParams(id, input)
    );

    logger.debug("Created diff chunk", {
      id,
      repository: input.repository,
      prNumber: input.prNumber,
    });

    return mapRowToDiffChunk(result.rows[0]);
  } catch (error) {
    logger.error("Failed to create diff chunk", {
      repository: input.repository,
      prNumber: input.prNumber,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates multiple diff chunks in a single transaction.
 *
 * @param inputs - Array of diff chunk data to insert
 * @returns Array of created diff chunks
 * @throws ValidationError if any input is invalid
 * @throws Error if database operation fails
 */
export const createDiffChunksBatch = async (
  inputs: readonly CreateDiffChunkInput[]
): Promise<readonly DiffChunk[]> => {
  if (inputs.length === 0) {
    return [];
  }

  // Validate all inputs upfront
  inputs.forEach(validateCreateInput);

  try {
    return await transaction(async (client) => {
      // Process all inputs sequentially within transaction using reduce
      const results = await inputs.reduce<Promise<readonly DiffChunk[]>>(
        async (accumulatorPromise, input) => {
          const accumulator = await accumulatorPromise;
          const id = generateEventId();

          const result = await client.query<DiffChunkRow>(DIFF_CHUNK_QUERIES.INSERT, [
            ...prepareInsertParams(id, input),
          ]);

          return [...accumulator, mapRowToDiffChunk(result.rows[0])];
        },
        Promise.resolve([])
      );

      logger.info("Created diff chunks batch", { count: results.length });
      return Object.freeze(results);
    });
  } catch (error) {
    logger.error("Failed to create diff chunks batch", {
      count: inputs.length,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Searches for similar diff chunks using vector similarity.
 *
 * @param embedding - Query embedding vector
 * @param filters - Optional filters for the search
 * @returns Array of diff chunks with similarity scores
 * @throws ValidationError if embedding is empty
 * @throws Error if database operation fails
 */
export const searchSimilarDiffChunks = async (
  embedding: readonly number[],
  filters: VectorSearchFilters = {}
): Promise<ReadonlyArray<VectorSearchResult<DiffChunk>>> => {
  if (embedding.length === 0) {
    throw new ValidationError("Embedding vector cannot be empty", {
      operation: "searchSimilarDiffChunks",
    });
  }

  try {
    const embeddingVector = formatEmbeddingVector(embedding);
    const { query: searchQuery, params } = buildSimilaritySearchQuery(filters);

    const result = await query<DiffChunkSimilarityRow>(searchQuery, [embeddingVector, ...params]);

    const searchResults = result.rows.map((row) => ({
      item: mapRowToDiffChunk(row),
      similarity: row.similarity,
    }));

    logger.debug("Searched similar diff chunks", {
      resultCount: searchResults.length,
      filters,
    });

    return Object.freeze(searchResults);
  } catch (error) {
    logger.error("Failed to search similar diff chunks", {
      filters,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets diff chunks that don't have embeddings yet.
 *
 * @param limit - Maximum number of chunks to return
 * @param tenantId - Optional tenant ID filter
 * @returns Array of diff chunks without embeddings
 * @throws ValidationError if limit is invalid
 * @throws Error if database operation fails
 */
export const getDiffChunksWithoutEmbeddings = async (
  limit: number,
  tenantId?: string
): Promise<readonly DiffChunk[]> => {
  validatePositiveNumber(limit, "limit", DIFF_CHUNK_DEFAULTS.MIN_QUERY_LIMIT);

  if (tenantId !== undefined) {
    validateNonEmptyString(tenantId, "tenantId");
  }

  try {
    const queryText =
      tenantId === undefined
        ? DIFF_CHUNK_QUERIES.GET_WITHOUT_EMBEDDINGS
        : DIFF_CHUNK_QUERIES.GET_WITHOUT_EMBEDDINGS_BY_TENANT;

    const params = tenantId === undefined ? [limit] : [tenantId, limit];
    const result = await query<DiffChunkRow>(queryText, params);

    return Object.freeze(result.rows.map(mapRowToDiffChunk));
  } catch (error) {
    logger.error("Failed to get diff chunks without embeddings", {
      limit,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the embedding for an existing diff chunk.
 *
 * @param id - Diff chunk ID
 * @param embedding - New embedding vector
 * @param model - Embedding model used
 * @param version - Embedding version
 * @returns Updated diff chunk or null if not found
 * @throws ValidationError if id is empty or embedding is empty
 * @throws Error if database operation fails
 */
export const updateDiffChunkEmbedding = async (
  id: string,
  embedding: readonly number[],
  model: string = EMBEDDING_CONFIG.MODEL,
  version: string = DIFF_CHUNK_DEFAULTS.DEFAULT_EMBEDDING_VERSION
): Promise<DiffChunk | null> => {
  validateNonEmptyString(id, "id");

  if (embedding.length === 0) {
    throw new ValidationError("Embedding vector cannot be empty", {
      operation: "updateDiffChunkEmbedding",
      metadata: { id },
    });
  }

  try {
    const embeddingVector = formatEmbeddingVector(embedding);

    const result = await query<DiffChunkRow>(DIFF_CHUNK_QUERIES.UPDATE_EMBEDDING, [
      id,
      embeddingVector,
      model,
      version,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.debug("Updated diff chunk embedding", { id, model, version });
    return mapRowToDiffChunk(result.rows[0]);
  } catch (error) {
    logger.error("Failed to update diff chunk embedding", {
      id,
      model,
      version,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes all diff chunks for a specific PR.
 *
 * @param prNumber - PR number
 * @param repository - Repository full name
 * @returns Number of deleted chunks
 * @throws ValidationError if prNumber is invalid or repository is empty
 * @throws Error if database operation fails
 */
export const deleteDiffChunksByPR = async (
  prNumber: number,
  repository: string
): Promise<number> => {
  validatePositiveNumber(prNumber, "prNumber", DIFF_CHUNK_DEFAULTS.MIN_PR_NUMBER);
  validateNonEmptyString(repository, "repository");

  try {
    const result = await query(DIFF_CHUNK_QUERIES.DELETE_BY_PR, [prNumber, repository]);

    logger.info("Deleted diff chunks for PR", {
      prNumber,
      repository,
      deletedCount: result.rowCount,
    });

    return result.rowCount;
  } catch (error) {
    logger.error("Failed to delete diff chunks for PR", {
      prNumber,
      repository,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes all diff chunks for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Number of deleted chunks
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const deleteDiffChunksByTenant = async (tenantId: string): Promise<number> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query(DIFF_CHUNK_QUERIES.DELETE_BY_TENANT, [tenantId]);

    logger.info("Deleted diff chunks for tenant", {
      tenantId,
      deletedCount: result.rowCount,
    });

    return result.rowCount;
  } catch (error) {
    logger.error("Failed to delete diff chunks for tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets count of diff chunks for a repository.
 *
 * @param repository - Repository full name
 * @returns Number of chunks
 * @throws ValidationError if repository is empty
 * @throws Error if database operation fails
 */
export const getDiffChunkCount = async (repository: string): Promise<number> => {
  validateNonEmptyString(repository, "repository");

  try {
    const result = await query<{ count: string }>(DIFF_CHUNK_QUERIES.COUNT_BY_REPOSITORY, [
      repository,
    ]);

    return parseInt(result.rows[0]?.count ?? DIFF_CHUNK_DEFAULTS.DEFAULT_COUNT, PARSE_INT_RADIX);
  } catch (error) {
    logger.error("Failed to get diff chunk count", {
      repository,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
