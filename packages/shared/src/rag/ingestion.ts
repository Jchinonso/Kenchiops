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
import { getEmbeddingClient } from "../llm/providers/llmProvider/embedding.js";
import { chunkDiff } from "./chunking.js";
import { chunkByDocType } from "./docTypeChunking.js";
import { recordIngestionOperation } from "./metrics.js";
import { validateMetadata, hasSchemaForDocType } from "./schemas/index.js";
import { createDiffChunksBatch, createKnowledgeDocsBatch } from "../database/index.js";
import { AUTO_DETECT_RELATIONSHIP_DOC_TYPES } from "../constants/index.js";
import {
  INGESTION_DEFAULTS,
  mapDiffChunksToInputs,
  mapKnowledgeChunksToInputs,
  embedPendingDiffChunks,
  embedPendingKnowledgeDocs,
} from "./ingestionHelpers.js";
import { detectAndCreateRelationships } from "./relationshipDetection.js";
import type {
  IngestDiffInput,
  IngestDiffResult,
  IngestKnowledgeDocInput,
  IngestKnowledgeDocResult,
  BatchEmbedOptions,
  ChunkStoreResult,
  EmbedResult,
  RelationshipStepResult,
} from "./types.js";

export type {
  IngestDiffInput,
  IngestDiffResult,
  IngestKnowledgeDocInput,
  IngestKnowledgeDocResult,
} from "./types.js";

const logger = createLogger("rag-ingestion");

// ==================== Diff Ingestion Helpers ====================

/**
 * Chunks a diff and stores the resulting chunks in the database.
 * Returns null if no chunks were generated (empty diff).
 */
const chunkAndStoreDiff = async (input: IngestDiffInput): Promise<ChunkStoreResult | null> => {
  const chunkResult = chunkDiff(input.diffContent, input.filePath);

  if (chunkResult.chunks.length === 0) {
    logger.info("No chunks generated from diff", {
      prNumber: input.prNumber,
      repository: input.repository,
      filePath: input.filePath,
    });
    return null;
  }

  const chunkInputs = mapDiffChunksToInputs(chunkResult.chunks, {
    filePath: chunkResult.filePath,
    repository: input.repository,
    prNumber: input.prNumber,
    commitSha: input.commitSha,
    hunkHeader: input.hunkHeader,
    tenantId: input.tenantId,
  });

  const createdChunks = await createDiffChunksBatch(chunkInputs);

  logger.info("Created diff chunks", {
    prNumber: input.prNumber,
    repository: input.repository,
    filePath: input.filePath,
    chunksCreated: createdChunks.length,
  });

  return { chunksCreated: createdChunks.length, parentId: null };
};

/**
 * Generates embeddings for pending diff chunks and records metrics.
 */
const embedAndRecordDiff = async (
  tenantId: string | undefined,
  chunksCreated: number
): Promise<EmbedResult> => {
  const embeddingClient = getEmbeddingClient();
  const embedResult = await embedPendingDiffChunks(
    embeddingClient,
    INGESTION_DEFAULTS.BATCH_SIZE,
    tenantId
  );

  recordIngestionOperation("diff", chunksCreated, embedResult.embedded, embedResult.errors.length);

  return { chunksEmbedded: embedResult.embedded, errors: embedResult.errors };
};

/**
 * Builds a failure result for diff ingestion and records failure metrics.
 */
const buildDiffFailureResult = (input: IngestDiffInput, error: unknown): IngestDiffResult => {
  const errorMessage = getErrorMessage(error);
  logger.error("Diff ingestion failed", {
    prNumber: input.prNumber,
    repository: input.repository,
    filePath: input.filePath,
    error: errorMessage,
  });

  recordIngestionOperation("diff", 0, 0, 1);

  return { success: false, chunksCreated: 0, chunksEmbedded: 0, errors: [errorMessage] };
};

// ==================== Knowledge Doc Ingestion Helpers ====================

/**
 * Validates metadata against the schema for the given doc type.
 * Returns validation warnings (empty array if no schema or validation passes).
 */
const validateDocMetadata = (
  docType: string,
  title: string,
  metadata: Record<string, unknown> | undefined
): readonly string[] => {
  if (!metadata || !hasSchemaForDocType(docType)) {
    return [];
  }

  const validationResult = validateMetadata(docType, metadata);
  if (!validationResult.success && validationResult.errors) {
    const warnings = validationResult.errors.map(
      (validationError) => `${validationError.path}: ${validationError.message}`
    );
    logger.warn("Metadata validation warnings - proceeding with ingestion", {
      docType,
      title,
      warnings,
    });
    return warnings;
  }

  return [];
};

/**
 * Chunks a knowledge document and stores the resulting chunks in the database.
 * Returns null if no chunks were generated (empty doc).
 */
const chunkAndStoreKnowledgeDoc = async (
  input: IngestKnowledgeDocInput
): Promise<ChunkStoreResult | null> => {
  const chunkResult = chunkByDocType(input.content, input.docType, input.title);

  if (chunkResult.chunks.length === 0) {
    logger.info("No chunks generated from knowledge doc", {
      docType: input.docType,
      title: input.title,
    });
    return null;
  }

  const chunkInputs = mapKnowledgeChunksToInputs(chunkResult.chunks, {
    docType: input.docType,
    title: input.title,
    parentId: null,
    repository: input.repository,
    sourceUrl: input.sourceUrl,
    filePath: input.filePath,
    tenantId: input.tenantId,
    metadata: input.metadata,
  });

  const createdDocs = await createKnowledgeDocsBatch(chunkInputs);
  const parentId = createdDocs.length > 0 ? createdDocs[0].id : null;

  logger.info("Created knowledge doc chunks", {
    docType: input.docType,
    title: input.title,
    chunksCreated: createdDocs.length,
    parentId,
  });

  return { chunksCreated: createdDocs.length, parentId };
};

/**
 * Generates embeddings for pending knowledge docs and records metrics.
 */
const embedAndRecordKnowledge = async (
  tenantId: string | undefined,
  chunksCreated: number
): Promise<EmbedResult> => {
  const embeddingClient = getEmbeddingClient();
  const embedResult = await embedPendingKnowledgeDocs(
    embeddingClient,
    INGESTION_DEFAULTS.BATCH_SIZE,
    tenantId
  );

  recordIngestionOperation(
    "knowledge",
    chunksCreated,
    embedResult.embedded,
    embedResult.errors.length
  );

  return { chunksEmbedded: embedResult.embedded, errors: embedResult.errors };
};

/**
 * Detects and creates relationships for a newly ingested document.
 * Non-fatal: logs warnings on failure and returns empty result.
 */
const detectDocRelationships = async (
  input: IngestKnowledgeDocInput,
  parentId: string
): Promise<RelationshipStepResult> => {
  const shouldDetect =
    input.detectRelationships ?? AUTO_DETECT_RELATIONSHIP_DOC_TYPES.includes(input.docType);

  if (!shouldDetect) {
    return {};
  }

  try {
    const result = await detectAndCreateRelationships({
      docId: parentId,
      docType: input.docType,
      title: input.title,
      content: input.content,
      repository: input.repository,
      filePath: input.filePath,
      tenantId: input.tenantId,
    });

    logger.info("Relationship detection complete", {
      parentId,
      detected: result.detected,
      created: result.created,
    });

    return { relationshipsDetected: result.detected, relationshipsCreated: result.created };
  } catch (relationshipError) {
    logger.warn("Relationship detection failed (non-fatal)", {
      parentId,
      error: getErrorMessage(relationshipError),
    });
    return {};
  }
};

/**
 * Builds a failure result for knowledge doc ingestion and records failure metrics.
 */
const buildKnowledgeFailureResult = (
  input: IngestKnowledgeDocInput,
  error: unknown,
  validationWarnings: readonly string[]
): IngestKnowledgeDocResult => {
  const errorMessage = getErrorMessage(error);
  logger.error("Knowledge doc ingestion failed", {
    docType: input.docType,
    title: input.title,
    error: errorMessage,
  });

  recordIngestionOperation("knowledge", 0, 0, 1);

  return {
    success: false,
    chunksCreated: 0,
    chunksEmbedded: 0,
    parentId: null,
    errors: [errorMessage],
    validationWarnings,
  };
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
  logger.info("Starting diff ingestion", {
    prNumber: input.prNumber,
    repository: input.repository,
    filePath: input.filePath,
    contentLength: input.diffContent.length,
  });

  try {
    const storeResult = await chunkAndStoreDiff(input);
    if (!storeResult) {
      return { success: true, chunksCreated: 0, chunksEmbedded: 0, errors: [] };
    }

    const { chunksCreated } = storeResult;
    const { chunksEmbedded, errors } = await embedAndRecordDiff(input.tenantId, chunksCreated);

    logger.info("Completed diff ingestion", {
      prNumber: input.prNumber,
      repository: input.repository,
      filePath: input.filePath,
      chunksCreated,
      chunksEmbedded,
      errorCount: errors.length,
    });

    return { success: errors.length === 0, chunksCreated, chunksEmbedded, errors };
  } catch (error) {
    return buildDiffFailureResult(input, error);
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
 * 6. Detect and create relationships (if enabled)
 *
 * @param input - Knowledge doc ingestion input
 * @returns Ingestion result with statistics and validation warnings
 */
export const ingestKnowledgeDoc = async (
  input: IngestKnowledgeDocInput
): Promise<IngestKnowledgeDocResult> => {
  logger.info("Starting knowledge doc ingestion", {
    docType: input.docType,
    title: input.title,
    contentLength: input.content.length,
  });

  const validationWarnings = validateDocMetadata(input.docType, input.title, input.metadata);

  try {
    const storeResult = await chunkAndStoreKnowledgeDoc(input);
    if (!storeResult) {
      return {
        success: true,
        chunksCreated: 0,
        chunksEmbedded: 0,
        parentId: null,
        errors: [],
        validationWarnings,
      };
    }

    const { chunksCreated, parentId } = storeResult;
    const { chunksEmbedded, errors } = await embedAndRecordKnowledge(input.tenantId, chunksCreated);

    logger.info("Completed knowledge doc ingestion", {
      docType: input.docType,
      title: input.title,
      chunksCreated,
      chunksEmbedded,
      parentId,
      errorCount: errors.length,
    });

    const relationships = parentId ? await detectDocRelationships(input, parentId) : {};

    return {
      success: errors.length === 0,
      chunksCreated,
      chunksEmbedded,
      parentId,
      errors,
      validationWarnings,
      ...relationships,
    };
  } catch (error) {
    return buildKnowledgeFailureResult(input, error, validationWarnings);
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
): Promise<{
  readonly diffChunksEmbedded: number;
  readonly knowledgeDocsEmbedded: number;
  readonly errors: readonly string[];
}> => {
  const batchSize = options.batchSize ?? INGESTION_DEFAULTS.BATCH_SIZE;
  const embeddingClient = getEmbeddingClient(); // Tier selection handled by helpers

  // Process diff chunks
  const diffResult = await embedPendingDiffChunks(embeddingClient, batchSize, options.tenantId);

  // Process knowledge docs
  const knowledgeResult = await embedPendingKnowledgeDocs(
    embeddingClient,
    batchSize,
    options.tenantId
  );

  // Combine errors immutably
  const allErrors = [...diffResult.errors, ...knowledgeResult.errors];

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
