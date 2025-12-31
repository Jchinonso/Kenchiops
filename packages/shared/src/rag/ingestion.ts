/**
 * RAG Ingestion Module
 *
 * Provides workers for ingesting diff chunks and knowledge documents
 * into the vector store for RAG retrieval.
 *
 * @module rag/ingestion
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { redactSecrets } from "../security/index.js";
import { EmbeddingClient } from "../openaiClient/embedding.js";
import { chunkDiff } from "./chunking.js";
import { chunkByDocType } from "./docTypeChunking.js";
import { recordIngestionOperation } from "./metrics.js";
import { validateMetadata, hasSchemaForDocType } from "./schemas/index.js";
import {
  createDiffChunksBatch,
  updateDiffChunkEmbedding,
  getDiffChunksWithoutEmbeddings,
  createKnowledgeDocsBatch,
  updateKnowledgeDocEmbedding,
  getKnowledgeDocsWithoutEmbeddings,
  type CreateDiffChunkInput,
  type CreateKnowledgeDocInput,
} from "../database/index.js";
import { EMBEDDING_CONFIG, type KnowledgeDocType } from "../constants/index.js";

const logger = createLogger("rag-ingestion");

// ==================== Types ====================

/**
 * Input for ingesting a PR diff.
 */
export interface IngestDiffInput {
  readonly repository: string;
  readonly prNumber: number;
  readonly commitSha: string;
  readonly diffContent: string;
  readonly filePath: string;
  readonly hunkHeader?: string;
  readonly tenantId?: string;
}

/**
 * Result of diff ingestion.
 */
export interface IngestDiffResult {
  readonly success: boolean;
  readonly chunksCreated: number;
  readonly chunksEmbedded: number;
  readonly errors: readonly string[];
}

/**
 * Input for ingesting a knowledge document.
 */
export interface IngestKnowledgeDocInput {
  readonly docType: KnowledgeDocType;
  readonly title: string;
  readonly content: string;
  readonly repository?: string;
  readonly sourceUrl?: string;
  readonly filePath?: string;
  readonly tenantId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of knowledge doc ingestion.
 */
export interface IngestKnowledgeDocResult {
  readonly success: boolean;
  readonly chunksCreated: number;
  readonly chunksEmbedded: number;
  readonly parentId: string | null;
  readonly errors: readonly string[];
  readonly validationWarnings: readonly string[];
}

/**
 * Options for batch embedding operations.
 */
interface BatchEmbedOptions {
  readonly batchSize: number;
  readonly tenantId?: string;
}

// ==================== Constants ====================

const INGESTION_DEFAULTS = {
  BATCH_SIZE: 50,
} as const;

// ==================== Helper Functions ====================

/**
 * Redacts secrets from text content.
 */
const redactContent = (content: string): string => redactSecrets(content);

/**
 * Maps chunked diff result to database input format.
 */
const mapDiffChunksToInputs = (
  chunks: ReadonlyArray<{
    content: string;
    metadata: { chunkIndex: number; startOffset: number; endOffset: number };
  }>,
  filePath: string,
  repository: string,
  prNumber: number,
  commitSha: string,
  hunkHeader?: string,
  tenantId?: string
): readonly CreateDiffChunkInput[] =>
  chunks.map((chunk) => ({
    repository,
    prNumber,
    commitSha,
    filePath,
    hunkHeader,
    content: redactContent(chunk.content),
    chunkIndex: chunk.metadata.chunkIndex,
    startLine: chunk.metadata.startOffset,
    endLine: chunk.metadata.endOffset,
    tenantId,
  }));

/**
 * Maps chunked knowledge doc result to database input format.
 */
const mapKnowledgeChunksToInputs = (
  chunks: ReadonlyArray<{ content: string; metadata: { chunkIndex: number } }>,
  docType: KnowledgeDocType,
  title: string,
  parentId: string | null,
  repository?: string,
  sourceUrl?: string,
  filePath?: string,
  tenantId?: string,
  metadata?: Record<string, unknown>
): readonly CreateKnowledgeDocInput[] =>
  chunks.map((chunk) => ({
    repository,
    parentId: parentId ?? undefined,
    docType,
    title,
    content: redactContent(chunk.content),
    sourceUrl,
    filePath,
    chunkIndex: chunk.metadata.chunkIndex,
    tenantId,
    metadata: {
      ...metadata,
      originalTitle: title,
    },
  }));

// ==================== Embedding Functions ====================

/**
 * Generates embeddings for diff chunks without them.
 */
const embedPendingDiffChunks = async (
  embeddingClient: EmbeddingClient,
  batchSize: number,
  tenantId?: string
): Promise<{ embedded: number; errors: string[] }> => {
  const errors: string[] = [];
  let embedded = 0;

  const chunks = await getDiffChunksWithoutEmbeddings(batchSize, tenantId);

  if (chunks.length === 0) {
    return { embedded: 0, errors: [] };
  }

  const contents = chunks.map((chunk) => chunk.content);

  try {
    const batchResult = await embeddingClient.generateBatchEmbeddings(contents);

    // Process each embedding result using recursion
    const processEmbedding = async (index: number): Promise<void> => {
      if (index >= chunks.length) {
        return;
      }

      const chunk = chunks[index];
      const embedding = batchResult.embeddings[index];

      try {
        await updateDiffChunkEmbedding(chunk.id, embedding, EMBEDDING_CONFIG.MODEL, "1");
        embedded += 1;
      } catch (updateError) {
        errors.push(
          `Failed to update embedding for diff chunk ${chunk.id}: ${getErrorMessage(updateError)}`
        );
      }

      return processEmbedding(index + 1);
    };

    await processEmbedding(0);
  } catch (batchError) {
    errors.push(`Batch embedding failed for diff chunks: ${getErrorMessage(batchError)}`);
  }

  return { embedded, errors };
};

/**
 * Generates embeddings for knowledge docs without them.
 */
const embedPendingKnowledgeDocs = async (
  embeddingClient: EmbeddingClient,
  batchSize: number,
  tenantId?: string
): Promise<{ embedded: number; errors: string[] }> => {
  const errors: string[] = [];
  let embedded = 0;

  const docs = await getKnowledgeDocsWithoutEmbeddings(batchSize, tenantId);

  if (docs.length === 0) {
    return { embedded: 0, errors: [] };
  }

  const contents = docs.map((doc) => doc.content);

  try {
    const batchResult = await embeddingClient.generateBatchEmbeddings(contents);

    // Process each embedding result using recursion
    const processEmbedding = async (index: number): Promise<void> => {
      if (index >= docs.length) {
        return;
      }

      const doc = docs[index];
      const embedding = batchResult.embeddings[index];

      try {
        await updateKnowledgeDocEmbedding(doc.id, embedding, EMBEDDING_CONFIG.MODEL, "1");
        embedded += 1;
      } catch (updateError) {
        errors.push(
          `Failed to update embedding for knowledge doc ${doc.id}: ${getErrorMessage(updateError)}`
        );
      }

      return processEmbedding(index + 1);
    };

    await processEmbedding(0);
  } catch (batchError) {
    errors.push(`Batch embedding failed for knowledge docs: ${getErrorMessage(batchError)}`);
  }

  return { embedded, errors };
};

// ==================== Public API ====================

/**
 * Ingests a PR diff into the vector store.
 *
 * Process:
 * 1. Chunk the diff content
 * 2. Redact secrets from each chunk
 * 3. Store chunks in database
 * 4. Generate embeddings for stored chunks
 *
 * @param input - Diff ingestion input
 * @returns Ingestion result with statistics
 */
export const ingestDiffChunks = async (input: IngestDiffInput): Promise<IngestDiffResult> => {
  const errors: string[] = [];
  let chunksCreated = 0;
  let chunksEmbedded = 0;

  logger.info("Starting diff ingestion", {
    prNumber: input.prNumber,
    repository: input.repository,
    filePath: input.filePath,
    contentLength: input.diffContent.length,
  });

  try {
    // Chunk the diff
    const chunkResult = chunkDiff(input.diffContent, input.filePath);

    if (chunkResult.chunks.length === 0) {
      logger.info("No chunks generated from diff", {
        prNumber: input.prNumber,
        repository: input.repository,
        filePath: input.filePath,
      });
      return { success: true, chunksCreated: 0, chunksEmbedded: 0, errors: [] };
    }

    // Map chunks to database input format
    const chunkInputs = mapDiffChunksToInputs(
      chunkResult.chunks,
      chunkResult.filePath,
      input.repository,
      input.prNumber,
      input.commitSha,
      input.hunkHeader,
      input.tenantId
    );

    // Store chunks in database
    const createdChunks = await createDiffChunksBatch(chunkInputs);
    chunksCreated = createdChunks.length;

    logger.info("Created diff chunks", {
      prNumber: input.prNumber,
      repository: input.repository,
      filePath: input.filePath,
      chunksCreated,
    });

    // Generate embeddings
    const embeddingClient = new EmbeddingClient();
    const embedResult = await embedPendingDiffChunks(
      embeddingClient,
      INGESTION_DEFAULTS.BATCH_SIZE,
      input.tenantId
    );

    chunksEmbedded = embedResult.embedded;
    errors.push(...embedResult.errors);

    logger.info("Completed diff ingestion", {
      prNumber: input.prNumber,
      repository: input.repository,
      filePath: input.filePath,
      chunksCreated,
      chunksEmbedded,
      errorCount: errors.length,
    });

    // Record metrics for observability
    recordIngestionOperation("diff", chunksCreated, chunksEmbedded, errors.length);

    return {
      success: errors.length === 0,
      chunksCreated,
      chunksEmbedded,
      errors: Object.freeze(errors),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Diff ingestion failed", {
      prNumber: input.prNumber,
      repository: input.repository,
      filePath: input.filePath,
      error: errorMessage,
    });
    errors.push(errorMessage);

    // Record failure metrics
    recordIngestionOperation("diff", chunksCreated, chunksEmbedded, errors.length);

    return {
      success: false,
      chunksCreated,
      chunksEmbedded,
      errors: Object.freeze(errors),
    };
  }
};

/**
 * Ingests a knowledge document into the vector store.
 *
 * Process:
 * 1. Validate metadata against doc-type schema
 * 2. Chunk the document using doc-type-specific strategy
 * 3. Redact secrets from each chunk
 * 4. Store chunks in database with parent reference
 * 5. Generate embeddings for stored chunks
 *
 * @param input - Knowledge doc ingestion input
 * @returns Ingestion result with statistics and validation warnings
 */
export const ingestKnowledgeDoc = async (
  input: IngestKnowledgeDocInput
): Promise<IngestKnowledgeDocResult> => {
  const errors: string[] = [];
  const validationWarnings: string[] = [];
  let chunksCreated = 0;
  let chunksEmbedded = 0;
  let parentId: string | null = null;

  logger.info("Starting knowledge doc ingestion", {
    docType: input.docType,
    title: input.title,
    contentLength: input.content.length,
  });

  // Validate metadata if schema exists for this doc type
  if (input.metadata && hasSchemaForDocType(input.docType)) {
    const validationResult = validateMetadata(input.docType, input.metadata);

    if (!validationResult.success && validationResult.errors) {
      validationResult.errors.forEach((validationError) => {
        validationWarnings.push(`${validationError.path}: ${validationError.message}`);
      });

      logger.warn("Metadata validation warnings - proceeding with ingestion", {
        docType: input.docType,
        title: input.title,
        warnings: validationWarnings,
      });
    }
  }

  try {
    // Chunk the document using doc-type-specific strategy
    const chunkResult = chunkByDocType(input.content, input.docType, input.title);

    if (chunkResult.chunks.length === 0) {
      logger.info("No chunks generated from knowledge doc", {
        docType: input.docType,
        title: input.title,
      });
      return {
        success: true,
        chunksCreated: 0,
        chunksEmbedded: 0,
        parentId: null,
        errors: [],
        validationWarnings: Object.freeze(validationWarnings),
      };
    }

    // Map chunks to database input format
    const chunkInputs = mapKnowledgeChunksToInputs(
      chunkResult.chunks,
      input.docType,
      input.title,
      null,
      input.repository,
      input.sourceUrl,
      input.filePath,
      input.tenantId,
      input.metadata
    );

    // Store chunks in database
    const createdDocs = await createKnowledgeDocsBatch(chunkInputs);
    chunksCreated = createdDocs.length;

    // Set parentId to first chunk for reference
    parentId = createdDocs.length > 0 ? createdDocs[0].id : null;

    logger.info("Created knowledge doc chunks", {
      docType: input.docType,
      title: input.title,
      chunksCreated,
      parentId,
    });

    // Generate embeddings
    const embeddingClient = new EmbeddingClient();
    const embedResult = await embedPendingKnowledgeDocs(
      embeddingClient,
      INGESTION_DEFAULTS.BATCH_SIZE,
      input.tenantId
    );

    chunksEmbedded = embedResult.embedded;
    errors.push(...embedResult.errors);

    logger.info("Completed knowledge doc ingestion", {
      docType: input.docType,
      title: input.title,
      chunksCreated,
      chunksEmbedded,
      parentId,
      errorCount: errors.length,
    });

    // Record metrics for observability
    recordIngestionOperation("knowledge", chunksCreated, chunksEmbedded, errors.length);

    return {
      success: errors.length === 0,
      chunksCreated,
      chunksEmbedded,
      parentId,
      errors: Object.freeze(errors),
      validationWarnings: Object.freeze(validationWarnings),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Knowledge doc ingestion failed", {
      docType: input.docType,
      title: input.title,
      error: errorMessage,
    });
    errors.push(errorMessage);

    // Record failure metrics
    recordIngestionOperation("knowledge", chunksCreated, chunksEmbedded, errors.length);

    return {
      success: false,
      chunksCreated,
      chunksEmbedded,
      parentId,
      errors: Object.freeze(errors),
      validationWarnings: Object.freeze(validationWarnings),
    };
  }
};

/**
 * Processes pending embeddings for chunks that were stored without embeddings.
 * Can be run as a background job to catch up on embedding generation.
 *
 * @param options - Batch processing options
 * @returns Number of chunks embedded
 */
export const processPendingEmbeddings = async (
  options: Partial<BatchEmbedOptions> = {}
): Promise<{ diffChunksEmbedded: number; knowledgeDocsEmbedded: number; errors: string[] }> => {
  const batchSize = options.batchSize ?? INGESTION_DEFAULTS.BATCH_SIZE;
  const embeddingClient = new EmbeddingClient();
  const allErrors: string[] = [];

  // Process diff chunks
  const diffResult = await embedPendingDiffChunks(embeddingClient, batchSize, options.tenantId);
  allErrors.push(...diffResult.errors);

  // Process knowledge docs
  const knowledgeResult = await embedPendingKnowledgeDocs(
    embeddingClient,
    batchSize,
    options.tenantId
  );
  allErrors.push(...knowledgeResult.errors);

  logger.info("Processed pending embeddings", {
    diffChunksEmbedded: diffResult.embedded,
    knowledgeDocsEmbedded: knowledgeResult.embedded,
    errorCount: allErrors.length,
  });

  return {
    diffChunksEmbedded: diffResult.embedded,
    knowledgeDocsEmbedded: knowledgeResult.embedded,
    errors: allErrors,
  };
};
