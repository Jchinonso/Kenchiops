/**
 * Knowledge Document Repository
 *
 * Database operations for knowledge documents with vector embeddings.
 * Used for semantic search over runbooks, postmortems, and documentation in RAG pipeline.
 *
 * @module database/knowledgeDocRepository
 */

import { query, transaction } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import {
  EMBEDDING_CONFIG,
  VECTOR_SIMILARITY_THRESHOLDS,
  type KnowledgeDocType,
} from "../constants/index.js";
import {
  type KnowledgeDocRecord,
  type CreateKnowledgeDocInput,
  type KnowledgeDocRow,
  type KnowledgeDocSimilarityRow,
  type VectorSearchResult,
  type VectorSearchFilters,
  mapRowToKnowledgeDoc,
  formatEmbeddingVector,
} from "./vectorTypes.js";

const logger = createLogger("knowledge-doc-repository");

// ==================== SQL Queries ====================

const KNOWLEDGE_DOC_QUERIES = {
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

// ==================== Query Builders ====================

/**
 * Builds WHERE clause conditions for knowledge doc similarity search.
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
  }> = [
    { key: "tenantId", column: "tenant_id" },
    { key: "docType", column: "doc_type" },
  ];

  filterHandlers.forEach((handler) => {
    const value = filters[handler.key];
    if (value !== undefined) {
      conditions.push(`${handler.column} = $${currentIndex}`);
      params.push(value);
      currentIndex += 1;
    }
  });

  return { conditions, params };
};

/**
 * Builds complete similarity search query with filters for knowledge docs.
 */
const buildSimilaritySearchQuery = (
  filters: VectorSearchFilters
): { query: string; params: unknown[] } => {
  const minSimilarity = filters.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.KNOWLEDGE_DOCS;
  const limit = Math.min(
    filters.limit ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
    VECTOR_SIMILARITY_THRESHOLDS.MAX_TOP_K
  );

  const { conditions, params } = buildSearchConditions(filters, 2);

  const whereClause =
    conditions.length > 0
      ? `${KNOWLEDGE_DOC_QUERIES.SEARCH_SIMILAR} AND ${conditions.join(" AND ")}`
      : KNOWLEDGE_DOC_QUERIES.SEARCH_SIMILAR;

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
 * Creates a new knowledge document in the database.
 *
 * @param input - Knowledge document data to insert
 * @returns The created knowledge document
 */
export const createKnowledgeDoc = async (
  input: CreateKnowledgeDocInput
): Promise<KnowledgeDocRecord> => {
  const id = generateEventId();
  const embeddingVector = input.embedding ? formatEmbeddingVector(input.embedding) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const result = await query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.INSERT, [
    id,
    input.repository ?? null,
    input.parentId ?? null,
    input.docType,
    input.title,
    input.content,
    input.sourceUrl ?? null,
    input.filePath ?? null,
    input.chunkIndex ?? 0,
    embeddingVector,
    input.embeddingModel ?? EMBEDDING_CONFIG.MODEL,
    input.embeddingVersion ?? "1",
    input.tenantId ?? null,
    metadataJson,
  ]);

  logger.debug("Created knowledge document", { id, docType: input.docType, title: input.title });
  return mapRowToKnowledgeDoc(result.rows[0]);
};

/**
 * Creates multiple knowledge documents in a single transaction.
 *
 * @param inputs - Array of knowledge document data to insert
 * @returns Array of created knowledge documents
 */
export const createKnowledgeDocsBatch = async (
  inputs: readonly CreateKnowledgeDocInput[]
): Promise<readonly KnowledgeDocRecord[]> => {
  if (inputs.length === 0) {
    return [];
  }

  return transaction(async (client) => {
    const results: KnowledgeDocRecord[] = [];

    // Process in sequence within transaction using recursion
    const processInput = async (index: number): Promise<void> => {
      if (index >= inputs.length) {
        return;
      }

      const input = inputs[index];
      const id = generateEventId();
      const embeddingVector = input.embedding ? formatEmbeddingVector(input.embedding) : null;
      const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

      const result = await client.query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.INSERT, [
        id,
        input.repository ?? null,
        input.parentId ?? null,
        input.docType,
        input.title,
        input.content,
        input.sourceUrl ?? null,
        input.filePath ?? null,
        input.chunkIndex ?? 0,
        embeddingVector,
        input.embeddingModel ?? EMBEDDING_CONFIG.MODEL,
        input.embeddingVersion ?? "1",
        input.tenantId ?? null,
        metadataJson,
      ]);

      results.push(mapRowToKnowledgeDoc(result.rows[0]));
      return processInput(index + 1);
    };

    await processInput(0);

    logger.info("Created knowledge documents batch", { count: results.length });
    return Object.freeze(results);
  });
};

/**
 * Searches for similar knowledge documents using vector similarity.
 *
 * @param embedding - Query embedding vector
 * @param filters - Optional filters for the search
 * @returns Array of knowledge documents with similarity scores
 */
export const searchSimilarKnowledgeDocs = async (
  embedding: readonly number[],
  filters: VectorSearchFilters = {}
): Promise<ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>> => {
  const embeddingVector = formatEmbeddingVector(embedding);
  const { query: searchQuery, params } = buildSimilaritySearchQuery(filters);

  const result = await query<KnowledgeDocSimilarityRow>(searchQuery, [embeddingVector, ...params]);

  const searchResults = result.rows.map((row) => ({
    item: mapRowToKnowledgeDoc(row),
    similarity: row.similarity,
  }));

  logger.debug("Searched similar knowledge documents", {
    resultCount: searchResults.length,
    filters,
  });

  return Object.freeze(searchResults);
};

/**
 * Gets knowledge documents that don't have embeddings yet.
 *
 * @param limit - Maximum number of documents to return
 * @param tenantId - Optional tenant ID filter
 * @returns Array of knowledge documents without embeddings
 */
export const getKnowledgeDocsWithoutEmbeddings = async (
  limit: number,
  tenantId?: string
): Promise<readonly KnowledgeDocRecord[]> => {
  const queryText = tenantId
    ? KNOWLEDGE_DOC_QUERIES.GET_WITHOUT_EMBEDDINGS_BY_TENANT
    : KNOWLEDGE_DOC_QUERIES.GET_WITHOUT_EMBEDDINGS;

  const params = tenantId ? [tenantId, limit] : [limit];
  const result = await query<KnowledgeDocRow>(queryText, params);

  return Object.freeze(result.rows.map(mapRowToKnowledgeDoc));
};

/**
 * Updates the embedding for an existing knowledge document.
 *
 * @param id - Knowledge document ID
 * @param embedding - New embedding vector
 * @param model - Embedding model used
 * @param version - Embedding version
 * @returns Updated knowledge document
 */
export const updateKnowledgeDocEmbedding = async (
  id: string,
  embedding: readonly number[],
  model: string = EMBEDDING_CONFIG.MODEL,
  version: string = "1"
): Promise<KnowledgeDocRecord | null> => {
  const embeddingVector = formatEmbeddingVector(embedding);

  const result = await query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.UPDATE_EMBEDDING, [
    id,
    embeddingVector,
    model,
    version,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  logger.debug("Updated knowledge document embedding", { id, model, version });
  return mapRowToKnowledgeDoc(result.rows[0]);
};

/**
 * Deletes all child chunks of a parent document.
 *
 * @param parentId - Parent document ID
 * @returns Number of deleted documents
 */
export const deleteKnowledgeDocsByParent = async (parentId: string): Promise<number> => {
  const result = await query(KNOWLEDGE_DOC_QUERIES.DELETE_BY_PARENT, [parentId]);

  logger.info("Deleted knowledge document chunks", {
    parentId,
    deletedCount: result.rowCount,
  });

  return result.rowCount;
};

/**
 * Deletes all knowledge documents for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Number of deleted documents
 */
export const deleteKnowledgeDocsByTenant = async (tenantId: string): Promise<number> => {
  const result = await query(KNOWLEDGE_DOC_QUERIES.DELETE_BY_TENANT, [tenantId]);

  logger.info("Deleted knowledge documents for tenant", {
    tenantId,
    deletedCount: result.rowCount,
  });

  return result.rowCount;
};

/**
 * Gets documents that need re-embedding due to model/version changes.
 *
 * @param currentModel - Current embedding model to compare against
 * @param currentVersion - Current embedding version to compare against
 * @param limit - Maximum number of documents to return
 * @param tenantId - Optional tenant ID filter
 * @returns Array of documents needing re-embedding
 */
export const getDocsNeedingReembedding = async (
  currentModel: string,
  currentVersion: string,
  limit: number,
  tenantId?: string
): Promise<readonly KnowledgeDocRecord[]> => {
  const queryText = tenantId
    ? KNOWLEDGE_DOC_QUERIES.GET_NEEDING_REEMBEDDING_BY_TENANT
    : KNOWLEDGE_DOC_QUERIES.GET_NEEDING_REEMBEDDING;

  const params = tenantId
    ? [currentModel, currentVersion, tenantId, limit]
    : [currentModel, currentVersion, limit];

  const result = await query<KnowledgeDocRow>(queryText, params);

  return Object.freeze(result.rows.map(mapRowToKnowledgeDoc));
};

/**
 * Gets knowledge documents by document type.
 *
 * @param docType - Document type to filter by
 * @param limit - Maximum number of documents to return
 * @returns Array of knowledge documents
 */
export const getKnowledgeDocsByType = async (
  docType: KnowledgeDocType,
  limit: number = VECTOR_SIMILARITY_THRESHOLDS.MAX_TOP_K
): Promise<readonly KnowledgeDocRecord[]> => {
  const result = await query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.GET_BY_DOC_TYPE, [
    docType,
    limit,
  ]);

  return Object.freeze(result.rows.map(mapRowToKnowledgeDoc));
};

/**
 * Gets count of knowledge documents by document type.
 *
 * @returns Record of document type to count
 */
export const getKnowledgeDocCountsByType = async (): Promise<Record<KnowledgeDocType, number>> => {
  const result = await query<{ doc_type: string; count: string }>(
    KNOWLEDGE_DOC_QUERIES.COUNT_BY_DOC_TYPE,
    []
  );

  const counts: Record<string, number> = {};
  result.rows.forEach((row) => {
    counts[row.doc_type] = parseInt(row.count, 10);
  });

  return counts as Record<KnowledgeDocType, number>;
};
