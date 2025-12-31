/**
 * Diff Chunk Repository
 *
 * Database operations for code diff chunks with vector embeddings.
 * Used for semantic search over PR diffs in RAG pipeline.
 *
 * @module database/diffChunkRepository
 */

import { query, transaction } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import { EMBEDDING_CONFIG, VECTOR_SIMILARITY_THRESHOLDS } from "../constants/index.js";
import {
  type DiffChunk,
  type CreateDiffChunkInput,
  type DiffChunkRow,
  type DiffChunkSimilarityRow,
  type VectorSearchResult,
  type VectorSearchFilters,
  mapRowToDiffChunk,
  formatEmbeddingVector,
} from "./vectorTypes.js";

const logger = createLogger("diff-chunk-repository");

// ==================== SQL Queries ====================

const DIFF_CHUNK_QUERIES = {
  INSERT: `
    INSERT INTO diff_chunks (
      id, repository, pr_number, commit_sha, file_path, hunk_header, content,
      chunk_index, start_line, end_line, embedding, embedding_model, embedding_version,
      tenant_id, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12, $13, $14, $15)
    RETURNING *
  `,

  SEARCH_SIMILAR: `
    SELECT *, 1 - (embedding <=> $1::vector) AS similarity
    FROM diff_chunks
    WHERE embedding IS NOT NULL
  `,

  GET_WITHOUT_EMBEDDINGS: `
    SELECT * FROM diff_chunks
    WHERE embedding IS NULL
    ORDER BY created_at ASC
    LIMIT $1
  `,

  GET_WITHOUT_EMBEDDINGS_BY_TENANT: `
    SELECT * FROM diff_chunks
    WHERE embedding IS NULL AND tenant_id = $1
    ORDER BY created_at ASC
    LIMIT $2
  `,

  UPDATE_EMBEDDING: `
    UPDATE diff_chunks
    SET embedding = $2::vector, embedding_model = $3, embedding_version = $4, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  DELETE_BY_PR: `
    DELETE FROM diff_chunks
    WHERE pr_number = $1 AND repository = $2
  `,

  DELETE_BY_TENANT: `
    DELETE FROM diff_chunks
    WHERE tenant_id = $1
  `,

  COUNT_BY_REPOSITORY: `
    SELECT COUNT(*) as count
    FROM diff_chunks
    WHERE repository = $1
  `,
} as const;

// ==================== Query Builders ====================

/**
 * Builds WHERE clause conditions for similarity search.
 */
const buildSearchConditions = (
  filters: VectorSearchFilters,
  paramIndex: number
): { conditions: string[]; params: unknown[] } => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let currentIndex = paramIndex;

  const filterHandlers: Array<{
    key: keyof VectorSearchFilters;
    column: string;
    operator: string;
  }> = [
    { key: "tenantId", column: "tenant_id", operator: "=" },
    { key: "repository", column: "repository", operator: "=" },
    { key: "prNumber", column: "pr_number", operator: "=" },
    { key: "filePath", column: "file_path", operator: "=" },
  ];

  filterHandlers.forEach((handler) => {
    const value = filters[handler.key];
    if (value !== undefined) {
      conditions.push(`${handler.column} ${handler.operator} $${currentIndex}`);
      params.push(value);
      currentIndex += 1;
    }
  });

  return { conditions, params };
};

/**
 * Builds complete similarity search query with filters.
 */
const buildSimilaritySearchQuery = (
  filters: VectorSearchFilters
): { query: string; params: unknown[] } => {
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

// ==================== Public API ====================

/**
 * Creates a new diff chunk in the database.
 *
 * @param input - Diff chunk data to insert
 * @returns The created diff chunk
 */
export const createDiffChunk = async (input: CreateDiffChunkInput): Promise<DiffChunk> => {
  const id = generateEventId();
  const embeddingVector = input.embedding ? formatEmbeddingVector(input.embedding) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const result = await query<DiffChunkRow>(DIFF_CHUNK_QUERIES.INSERT, [
    id,
    input.repository,
    input.prNumber,
    input.commitSha,
    input.filePath,
    input.hunkHeader ?? null,
    input.content,
    input.chunkIndex ?? 0,
    input.startLine ?? null,
    input.endLine ?? null,
    embeddingVector,
    input.embeddingModel ?? EMBEDDING_CONFIG.MODEL,
    input.embeddingVersion ?? "1",
    input.tenantId ?? null,
    metadataJson,
  ]);

  logger.debug("Created diff chunk", {
    id,
    repository: input.repository,
    prNumber: input.prNumber,
  });
  return mapRowToDiffChunk(result.rows[0]);
};

/**
 * Creates multiple diff chunks in a single transaction.
 *
 * @param inputs - Array of diff chunk data to insert
 * @returns Array of created diff chunks
 */
export const createDiffChunksBatch = async (
  inputs: readonly CreateDiffChunkInput[]
): Promise<readonly DiffChunk[]> => {
  if (inputs.length === 0) {
    return [];
  }

  return transaction(async (client) => {
    const results: DiffChunk[] = [];

    // Process in sequence within transaction to maintain order
    const processInput = async (index: number): Promise<void> => {
      if (index >= inputs.length) {
        return;
      }

      const input = inputs[index];
      const id = generateEventId();
      const embeddingVector = input.embedding ? formatEmbeddingVector(input.embedding) : null;
      const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

      const result = await client.query<DiffChunkRow>(DIFF_CHUNK_QUERIES.INSERT, [
        id,
        input.repository,
        input.prNumber,
        input.commitSha,
        input.filePath,
        input.hunkHeader ?? null,
        input.content,
        input.chunkIndex ?? 0,
        input.startLine ?? null,
        input.endLine ?? null,
        embeddingVector,
        input.embeddingModel ?? EMBEDDING_CONFIG.MODEL,
        input.embeddingVersion ?? "1",
        input.tenantId ?? null,
        metadataJson,
      ]);

      results.push(mapRowToDiffChunk(result.rows[0]));
      return processInput(index + 1);
    };

    await processInput(0);

    logger.info("Created diff chunks batch", { count: results.length });
    return Object.freeze(results);
  });
};

/**
 * Searches for similar diff chunks using vector similarity.
 *
 * @param embedding - Query embedding vector
 * @param filters - Optional filters for the search
 * @returns Array of diff chunks with similarity scores
 */
export const searchSimilarDiffChunks = async (
  embedding: readonly number[],
  filters: VectorSearchFilters = {}
): Promise<ReadonlyArray<VectorSearchResult<DiffChunk>>> => {
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
};

/**
 * Gets diff chunks that don't have embeddings yet.
 *
 * @param limit - Maximum number of chunks to return
 * @param tenantId - Optional tenant ID filter
 * @returns Array of diff chunks without embeddings
 */
export const getDiffChunksWithoutEmbeddings = async (
  limit: number,
  tenantId?: string
): Promise<readonly DiffChunk[]> => {
  const queryText = tenantId
    ? DIFF_CHUNK_QUERIES.GET_WITHOUT_EMBEDDINGS_BY_TENANT
    : DIFF_CHUNK_QUERIES.GET_WITHOUT_EMBEDDINGS;

  const params = tenantId ? [tenantId, limit] : [limit];
  const result = await query<DiffChunkRow>(queryText, params);

  return Object.freeze(result.rows.map(mapRowToDiffChunk));
};

/**
 * Updates the embedding for an existing diff chunk.
 *
 * @param id - Diff chunk ID
 * @param embedding - New embedding vector
 * @param model - Embedding model used
 * @param version - Embedding version
 * @returns Updated diff chunk
 */
export const updateDiffChunkEmbedding = async (
  id: string,
  embedding: readonly number[],
  model: string = EMBEDDING_CONFIG.MODEL,
  version: string = "1"
): Promise<DiffChunk | null> => {
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
};

/**
 * Deletes all diff chunks for a specific PR.
 *
 * @param prNumber - PR number
 * @param repository - Repository full name
 * @returns Number of deleted chunks
 */
export const deleteDiffChunksByPR = async (
  prNumber: number,
  repository: string
): Promise<number> => {
  const result = await query(DIFF_CHUNK_QUERIES.DELETE_BY_PR, [prNumber, repository]);

  logger.info("Deleted diff chunks for PR", {
    prNumber,
    repository,
    deletedCount: result.rowCount,
  });

  return result.rowCount;
};

/**
 * Deletes all diff chunks for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Number of deleted chunks
 */
export const deleteDiffChunksByTenant = async (tenantId: string): Promise<number> => {
  const result = await query(DIFF_CHUNK_QUERIES.DELETE_BY_TENANT, [tenantId]);

  logger.info("Deleted diff chunks for tenant", {
    tenantId,
    deletedCount: result.rowCount,
  });

  return result.rowCount;
};

/**
 * Gets count of diff chunks for a repository.
 *
 * @param repository - Repository full name
 * @returns Number of chunks
 */
export const getDiffChunkCount = async (repository: string): Promise<number> => {
  const result = await query<{ count: string }>(DIFF_CHUNK_QUERIES.COUNT_BY_REPOSITORY, [
    repository,
  ]);

  return parseInt(result.rows[0]?.count ?? "0", 10);
};
