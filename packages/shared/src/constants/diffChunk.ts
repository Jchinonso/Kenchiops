/**
 * Diff Chunk Constants
 *
 * SQL queries and configuration for diff chunk repository operations.
 *
 * @module constants/diffChunk
 */

// ==================== Default Values ====================

/**
 * Default configuration for diff chunk operations.
 */
export const DIFF_CHUNK_DEFAULTS = {
  /** Default chunk index for new chunks. */
  DEFAULT_CHUNK_INDEX: 0,
  /** Default embedding version. */
  DEFAULT_EMBEDDING_VERSION: "1",
  /** Minimum valid limit for queries. */
  MIN_QUERY_LIMIT: 1,
  /** Minimum valid PR number. */
  MIN_PR_NUMBER: 1,
  /** Default count when no rows found. */
  DEFAULT_COUNT: "0",
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for diff chunk operations.
 */
export const DIFF_CHUNK_QUERIES = {
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
      AND (is_stale IS NULL OR is_stale = FALSE)
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
