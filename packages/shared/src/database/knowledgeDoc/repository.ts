/**
 * Knowledge Document Repository
 *
 * Database operations for knowledge documents with vector embeddings.
 * Used for semantic search over runbooks, postmortems, and documentation in RAG pipeline.
 *
 * @module database/knowledgeDoc/repository
 */

import {
  query,
  transaction,
  createLogger,
  generateEventId,
  getErrorMessage,
  EMBEDDING_CONFIG,
  VECTOR_SIMILARITY_THRESHOLDS,
  KNOWLEDGE_DOC_QUERIES,
  KNOWLEDGE_DOC_DEFAULTS,
  PARSE_INT_RADIX,
  formatEmbeddingVector,
  type KnowledgeDocType,
  type VectorSearchFilters,
  type VectorSearchResult,
} from "../common.js";
import type {
  KnowledgeDocRecord,
  CreateKnowledgeDocInput,
  KnowledgeDocRow,
  KnowledgeDocSimilarityRow,
  KnowledgeDocListOptions,
  KnowledgeDocListResult,
} from "./types.js";
import {
  mapRowToKnowledgeDoc,
  validateNonEmptyString,
  validateLimit,
  validateEmbedding,
  buildSimilaritySearchQuery,
} from "./helpers.js";

const logger = createLogger("knowledge-doc-repository");

// ==================== Public API ====================

/**
 * Creates a new knowledge document in the database.
 *
 * @param input - Knowledge document data to insert
 * @returns The created knowledge document
 * @throws Error if database operation fails
 */
export const createKnowledgeDoc = async (
  input: CreateKnowledgeDocInput
): Promise<KnowledgeDocRecord> => {
  const id = generateEventId();
  const embeddingVector = input.embedding ? formatEmbeddingVector(input.embedding) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  try {
    const result = await query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.INSERT, [
      id,
      input.repository ?? null,
      input.parentId ?? null,
      input.docType,
      input.title,
      input.content,
      input.sourceUrl ?? null,
      input.filePath ?? null,
      input.chunkIndex ?? KNOWLEDGE_DOC_DEFAULTS.DEFAULT_CHUNK_INDEX,
      embeddingVector,
      input.embeddingModel ?? EMBEDDING_CONFIG.MODEL,
      input.embeddingVersion ?? KNOWLEDGE_DOC_DEFAULTS.DEFAULT_EMBEDDING_VERSION,
      input.tenantId ?? null,
      metadataJson,
    ]);

    logger.debug("Created knowledge document", { id, docType: input.docType, title: input.title });
    return mapRowToKnowledgeDoc(result.rows[0]);
  } catch (error) {
    logger.error("Failed to create knowledge document", {
      docType: input.docType,
      title: input.title,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates multiple knowledge documents in a single transaction.
 *
 * @param inputs - Array of knowledge document data to insert
 * @returns Array of created knowledge documents
 * @throws Error if database operation fails
 */
export const createKnowledgeDocsBatch = async (
  inputs: readonly CreateKnowledgeDocInput[]
): Promise<readonly KnowledgeDocRecord[]> => {
  if (inputs.length === 0) {
    return [];
  }

  try {
    return await transaction(async (client) => {
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
          input.chunkIndex ?? KNOWLEDGE_DOC_DEFAULTS.DEFAULT_CHUNK_INDEX,
          embeddingVector,
          input.embeddingModel ?? EMBEDDING_CONFIG.MODEL,
          input.embeddingVersion ?? KNOWLEDGE_DOC_DEFAULTS.DEFAULT_EMBEDDING_VERSION,
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
  } catch (error) {
    logger.error("Failed to create knowledge documents batch", {
      inputCount: inputs.length,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Searches for similar knowledge documents using vector similarity.
 *
 * @param embedding - Query embedding vector
 * @param filters - Optional filters for the search
 * @returns Array of knowledge documents with similarity scores
 * @throws ValidationError if embedding is invalid
 * @throws Error if database operation fails
 */
export const searchSimilarKnowledgeDocs = async (
  embedding: readonly number[],
  filters: VectorSearchFilters = {}
): Promise<ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>> => {
  validateEmbedding(embedding);

  const embeddingVector = formatEmbeddingVector(embedding);
  const { query: searchQuery, params } = buildSimilaritySearchQuery(filters);

  try {
    const result = await query<KnowledgeDocSimilarityRow>(searchQuery, [
      embeddingVector,
      ...params,
    ]);

    const searchResults = result.rows.map((row) => ({
      item: mapRowToKnowledgeDoc(row),
      similarity: row.similarity,
    }));

    logger.debug("Searched similar knowledge documents", {
      resultCount: searchResults.length,
      filters,
    });

    return Object.freeze(searchResults);
  } catch (error) {
    logger.error("Failed to search similar knowledge documents", {
      filters,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets knowledge documents that don't have embeddings yet.
 *
 * @param limit - Maximum number of documents to return
 * @param tenantId - Optional tenant ID filter
 * @returns Array of knowledge documents without embeddings
 * @throws ValidationError if limit is invalid
 * @throws Error if database operation fails
 */
export const getKnowledgeDocsWithoutEmbeddings = async (
  limit: number,
  tenantId?: string
): Promise<readonly KnowledgeDocRecord[]> => {
  validateLimit(limit);

  const queryText = tenantId
    ? KNOWLEDGE_DOC_QUERIES.GET_WITHOUT_EMBEDDINGS_BY_TENANT
    : KNOWLEDGE_DOC_QUERIES.GET_WITHOUT_EMBEDDINGS;

  const params = tenantId ? [tenantId, limit] : [limit];

  try {
    const result = await query<KnowledgeDocRow>(queryText, params);
    return Object.freeze(result.rows.map(mapRowToKnowledgeDoc));
  } catch (error) {
    logger.error("Failed to get knowledge docs without embeddings", {
      limit,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the embedding for an existing knowledge document.
 *
 * @param id - Knowledge document ID
 * @param embedding - New embedding vector
 * @param model - Embedding model used
 * @param version - Embedding version
 * @returns Updated knowledge document or null if not found
 * @throws ValidationError if ID is empty or embedding is invalid
 * @throws Error if database operation fails
 */
export const updateKnowledgeDocEmbedding = async (
  id: string,
  embedding: readonly number[],
  model: string = EMBEDDING_CONFIG.MODEL,
  version: string = KNOWLEDGE_DOC_DEFAULTS.DEFAULT_EMBEDDING_VERSION,
  tenantId: string = "system"
): Promise<KnowledgeDocRecord | null> => {
  validateNonEmptyString(id, "id");
  validateEmbedding(embedding);

  const embeddingVector = formatEmbeddingVector(embedding);

  try {
    const result = await query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.UPDATE_EMBEDDING, [
      id,
      embeddingVector,
      model,
      version,
      tenantId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    logger.debug("Updated knowledge document embedding", { id, model, version });
    return mapRowToKnowledgeDoc(result.rows[0]);
  } catch (error) {
    logger.error("Failed to update knowledge document embedding", {
      id,
      model,
      version,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes all child chunks of a parent document.
 *
 * @param parentId - Parent document ID
 * @returns Number of deleted documents
 * @throws ValidationError if parentId is empty
 * @throws Error if database operation fails
 */
export const deleteKnowledgeDocsByParent = async (
  parentId: string,
  tenantId: string
): Promise<number> => {
  validateNonEmptyString(parentId, "parentId");
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query(KNOWLEDGE_DOC_QUERIES.DELETE_BY_PARENT, [parentId, tenantId]);

    logger.info("Deleted knowledge document chunks", {
      parentId,
      deletedCount: result.rowCount,
    });

    return result.rowCount;
  } catch (error) {
    logger.error("Failed to delete knowledge documents by parent", {
      parentId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes all knowledge documents for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Number of deleted documents
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const deleteKnowledgeDocsByTenant = async (tenantId: string): Promise<number> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query(KNOWLEDGE_DOC_QUERIES.DELETE_BY_TENANT, [tenantId]);

    logger.info("Deleted knowledge documents for tenant", {
      tenantId,
      deletedCount: result.rowCount,
    });

    return result.rowCount;
  } catch (error) {
    logger.error("Failed to delete knowledge documents for tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets documents that need re-embedding due to model/version changes.
 *
 * @param currentModel - Current embedding model to compare against
 * @param currentVersion - Current embedding version to compare against
 * @param limit - Maximum number of documents to return
 * @param tenantId - Optional tenant ID filter
 * @returns Array of documents needing re-embedding
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const getDocsNeedingReembedding = async (
  currentModel: string,
  currentVersion: string,
  limit: number,
  tenantId?: string
): Promise<readonly KnowledgeDocRecord[]> => {
  validateNonEmptyString(currentModel, "currentModel");
  validateNonEmptyString(currentVersion, "currentVersion");
  validateLimit(limit);

  const queryText = tenantId
    ? KNOWLEDGE_DOC_QUERIES.GET_NEEDING_REEMBEDDING_BY_TENANT
    : KNOWLEDGE_DOC_QUERIES.GET_NEEDING_REEMBEDDING;

  const params = tenantId
    ? [currentModel, currentVersion, tenantId, limit]
    : [currentModel, currentVersion, limit];

  try {
    const result = await query<KnowledgeDocRow>(queryText, params);
    return Object.freeze(result.rows.map(mapRowToKnowledgeDoc));
  } catch (error) {
    logger.error("Failed to get docs needing reembedding", {
      currentModel,
      currentVersion,
      limit,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets knowledge documents by document type.
 *
 * @param docType - Document type to filter by
 * @param limit - Maximum number of documents to return
 * @returns Array of knowledge documents
 * @throws ValidationError if limit is invalid
 * @throws Error if database operation fails
 */
export const getKnowledgeDocsByType = async (
  docType: KnowledgeDocType,
  limit: number = VECTOR_SIMILARITY_THRESHOLDS.MAX_TOP_K
): Promise<readonly KnowledgeDocRecord[]> => {
  validateLimit(limit);

  try {
    const result = await query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.GET_BY_DOC_TYPE, [
      docType,
      limit,
    ]);
    return Object.freeze(result.rows.map(mapRowToKnowledgeDoc));
  } catch (error) {
    logger.error("Failed to get knowledge docs by type", {
      docType,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets count of knowledge documents by document type.
 *
 * @returns Record of document type to count
 * @throws Error if database operation fails
 */
export const getKnowledgeDocCountsByType = async (): Promise<Record<KnowledgeDocType, number>> => {
  try {
    const result = await query<{ doc_type: string; count: string }>(
      KNOWLEDGE_DOC_QUERIES.COUNT_BY_DOC_TYPE,
      []
    );

    const counts = result.rows.reduce<Record<string, number>>(
      (accumulator, row) => ({
        ...accumulator,
        [row.doc_type]: parseInt(row.count, PARSE_INT_RADIX),
      }),
      {}
    );

    return counts as Record<KnowledgeDocType, number>;
  } catch (error) {
    logger.error("Failed to get knowledge doc counts by type", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets count of knowledge documents by document type, scoped to a specific tenant.
 *
 * @param tenantId - Tenant ID to scope the query
 * @returns Record of document type to count for that tenant
 * @throws Error if database operation fails
 */
export const getKnowledgeDocCountsByTypeForTenant = async (
  tenantId: string
): Promise<Record<KnowledgeDocType, number>> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<{ doc_type: string; count: string }>(
      KNOWLEDGE_DOC_QUERIES.COUNT_BY_DOC_TYPE_FOR_TENANT,
      [tenantId]
    );

    const counts = result.rows.reduce<Record<string, number>>(
      (accumulator, row) => ({
        ...accumulator,
        [row.doc_type]: parseInt(row.count, PARSE_INT_RADIX),
      }),
      {}
    );

    return counts as Record<KnowledgeDocType, number>;
  } catch (error) {
    logger.error("Failed to get knowledge doc counts by type for tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes a single knowledge document by ID, scoped by tenant.
 *
 * @param id - Knowledge document ID
 * @param tenantId - Tenant ID for isolation
 * @returns True if a document was deleted, false if not found
 * @throws ValidationError if id or tenantId is empty
 * @throws Error if database operation fails
 */
export const deleteKnowledgeDocById = async (id: string, tenantId: string): Promise<boolean> => {
  validateNonEmptyString(id, "id");
  validateNonEmptyString(tenantId, "tenantId");

  const result = await query(KNOWLEDGE_DOC_QUERIES.DELETE_BY_ID, [id, tenantId]);
  const deleted = result.rowCount > 0;

  if (deleted) {
    logger.info("Deleted knowledge document", { id, tenantId });
  }

  return deleted;
};

/**
 * Gets knowledge documents for a tenant with optional doc type filter and pagination.
 *
 * @param tenantId - Tenant ID to scope the query
 * @param options - Pagination and filter options
 * @returns Paginated list of knowledge documents and total count
 * @throws Error if database operation fails
 */
export const getKnowledgeDocsByTenant = async (
  tenantId: string,
  options: KnowledgeDocListOptions
): Promise<KnowledgeDocListResult> => {
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const { docType, limit, offset } = options;

    const [docsResult, countResult] = await Promise.all([
      docType
        ? query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.GET_BY_TENANT_AND_DOC_TYPE, [
            tenantId,
            docType,
            limit,
            offset,
          ])
        : query<KnowledgeDocRow>(KNOWLEDGE_DOC_QUERIES.GET_BY_TENANT, [tenantId, limit, offset]),
      docType
        ? query<{ count: string }>(KNOWLEDGE_DOC_QUERIES.COUNT_BY_TENANT_AND_DOC_TYPE, [
            tenantId,
            docType,
          ])
        : query<{ count: string }>(KNOWLEDGE_DOC_QUERIES.COUNT_BY_TENANT, [tenantId]),
    ]);

    const items = Object.freeze(docsResult.rows.map(mapRowToKnowledgeDoc));
    const total = parseInt(countResult.rows[0]?.count ?? "0", PARSE_INT_RADIX);

    logger.debug("Fetched knowledge docs for tenant", {
      tenantId,
      docType,
      resultCount: items.length,
      total,
    });

    return { items, total };
  } catch (error) {
    logger.error("Failed to get knowledge docs by tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
