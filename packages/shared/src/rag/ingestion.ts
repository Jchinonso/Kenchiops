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
import { getEmbeddingClient } from "../llm/providers/openai/embedding.js";
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
} from "./types.js";

export type {
  IngestDiffInput,
  IngestDiffResult,
  IngestKnowledgeDocInput,
  IngestKnowledgeDocResult,
} from "./types.js";

const logger = createLogger("rag-ingestion");

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
    const chunkInputs = mapDiffChunksToInputs(chunkResult.chunks, {
      filePath: chunkResult.filePath,
      repository: input.repository,
      prNumber: input.prNumber,
      commitSha: input.commitSha,
      hunkHeader: input.hunkHeader,
      tenantId: input.tenantId,
    });

    // Store chunks in database
    const createdChunks = await createDiffChunksBatch(chunkInputs);
    const chunksCreated = createdChunks.length;

    logger.info("Created diff chunks", {
      prNumber: input.prNumber,
      repository: input.repository,
      filePath: input.filePath,
      chunksCreated,
    });

    // Generate embeddings (tier selection handled by helper)
    const embeddingClient = getEmbeddingClient();
    const embedResult = await embedPendingDiffChunks(
      embeddingClient,
      INGESTION_DEFAULTS.BATCH_SIZE,
      input.tenantId
    );

    const chunksEmbedded = embedResult.embedded;
    const { errors } = embedResult;

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
      errors,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Diff ingestion failed", {
      prNumber: input.prNumber,
      repository: input.repository,
      filePath: input.filePath,
      error: errorMessage,
    });

    // Record failure metrics
    recordIngestionOperation("diff", 0, 0, 1);

    return {
      success: false,
      chunksCreated: 0,
      chunksEmbedded: 0,
      errors: [errorMessage],
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
  logger.info("Starting knowledge doc ingestion", {
    docType: input.docType,
    title: input.title,
    contentLength: input.content.length,
  });

  // Validate metadata if schema exists for this doc type
  const validationWarnings: readonly string[] =
    input.metadata && hasSchemaForDocType(input.docType)
      ? (() => {
          const validationResult = validateMetadata(input.docType, input.metadata);
          if (!validationResult.success && validationResult.errors) {
            const warnings = validationResult.errors.map(
              (validationError) => `${validationError.path}: ${validationError.message}`
            );
            logger.warn("Metadata validation warnings - proceeding with ingestion", {
              docType: input.docType,
              title: input.title,
              warnings,
            });
            return warnings;
          }
          return [];
        })()
      : [];

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
        validationWarnings,
      };
    }

    // Map chunks to database input format
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

    // Store chunks in database
    const createdDocs = await createKnowledgeDocsBatch(chunkInputs);
    const chunksCreated = createdDocs.length;

    // Set parentId to first chunk for reference
    const parentId = createdDocs.length > 0 ? createdDocs[0].id : null;

    logger.info("Created knowledge doc chunks", {
      docType: input.docType,
      title: input.title,
      chunksCreated,
      parentId,
    });

    // Generate embeddings (tier selection handled by helper)
    const embeddingClient = getEmbeddingClient();
    const embedResult = await embedPendingKnowledgeDocs(
      embeddingClient,
      INGESTION_DEFAULTS.BATCH_SIZE,
      input.tenantId
    );

    const chunksEmbedded = embedResult.embedded;
    const { errors } = embedResult;

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

    // Detect and create relationships if enabled and we have a parentId
    // Auto-detect for high-value doc types unless explicitly disabled
    let relationshipsDetected: number | undefined;
    let relationshipsCreated: number | undefined;

    const shouldDetectRelationships =
      input.detectRelationships ?? AUTO_DETECT_RELATIONSHIP_DOC_TYPES.includes(input.docType);

    if (shouldDetectRelationships && parentId) {
      try {
        const relationshipResult = await detectAndCreateRelationships({
          docId: parentId,
          docType: input.docType,
          title: input.title,
          content: input.content,
          repository: input.repository,
          filePath: input.filePath,
          tenantId: input.tenantId,
        });

        relationshipsDetected = relationshipResult.detected;
        relationshipsCreated = relationshipResult.created;

        logger.info("Relationship detection complete", {
          parentId,
          detected: relationshipsDetected,
          created: relationshipsCreated,
        });
      } catch (relationshipError) {
        logger.warn("Relationship detection failed (non-fatal)", {
          parentId,
          error: getErrorMessage(relationshipError),
        });
      }
    }

    return {
      success: errors.length === 0,
      chunksCreated,
      chunksEmbedded,
      parentId,
      errors,
      validationWarnings,
      relationshipsDetected,
      relationshipsCreated,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Knowledge doc ingestion failed", {
      docType: input.docType,
      title: input.title,
      error: errorMessage,
    });

    // Record failure metrics
    recordIngestionOperation("knowledge", 0, 0, 1);

    return {
      success: false,
      chunksCreated: 0,
      chunksEmbedded: 0,
      parentId: null,
      errors: [errorMessage],
      validationWarnings,
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
