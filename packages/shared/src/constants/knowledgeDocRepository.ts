/**
 * Knowledge Document Repository Constants
 *
 * SQL queries and configuration for knowledge document operations.
 *
 * @module constants/knowledgeDocRepository
 */

// ==================== Default Values ====================

/**
 * Default configuration for knowledge document operations.
 */
export const KNOWLEDGE_DOC_DEFAULTS = {
  /** Default chunk index for new documents. */
  DEFAULT_CHUNK_INDEX: 0,
  /** Default embedding version. */
  DEFAULT_EMBEDDING_VERSION: "1",
  /** Minimum valid query limit. */
  MIN_QUERY_LIMIT: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for knowledge document operations.
 */
export const KNOWLEDGE_DOC_QUERIES = {
  INSERT: `
    INSERT INTO knowledge_documents (
      id, repository, parent_id, doc_type, title, content, source_url, file_path,
      chunk_index, embedding, embedding_model, embedding_version, tenant_id, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13, $14)
    RETURNING *
  `,

  SEARCH_SIMILAR: `
    SELECT *, 1 - (embedding <=> $1::vector) AS similarity
    FROM knowledge_documents
    WHERE embedding IS NOT NULL
      AND (is_stale IS NULL OR is_stale = FALSE)
  `,

  GET_WITHOUT_EMBEDDINGS: `
    SELECT * FROM knowledge_documents
    WHERE embedding IS NULL
    ORDER BY created_at ASC
    LIMIT $1
  `,

  GET_WITHOUT_EMBEDDINGS_BY_TENANT: `
    SELECT * FROM knowledge_documents
    WHERE embedding IS NULL AND tenant_id = $1
    ORDER BY created_at ASC
    LIMIT $2
  `,

  UPDATE_EMBEDDING: `
    UPDATE knowledge_documents
    SET embedding = $2::vector, embedding_model = $3, embedding_version = $4, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  DELETE_BY_PARENT: `
    DELETE FROM knowledge_documents
    WHERE parent_id = $1
  `,

  DELETE_BY_TENANT: `
    DELETE FROM knowledge_documents
    WHERE tenant_id = $1
  `,

  GET_NEEDING_REEMBEDDING: `
    SELECT * FROM knowledge_documents
    WHERE embedding_model != $1 OR embedding_version != $2
    ORDER BY created_at ASC
    LIMIT $3
  `,

  GET_NEEDING_REEMBEDDING_BY_TENANT: `
    SELECT * FROM knowledge_documents
    WHERE (embedding_model != $1 OR embedding_version != $2) AND tenant_id = $3
    ORDER BY created_at ASC
    LIMIT $4
  `,

  GET_BY_DOC_TYPE: `
    SELECT * FROM knowledge_documents
    WHERE doc_type = $1
    ORDER BY created_at DESC
    LIMIT $2
  `,

  COUNT_BY_DOC_TYPE: `
    SELECT doc_type, COUNT(*) as count
    FROM knowledge_documents
    GROUP BY doc_type
  `,
} as const;
