/**
 * RAG Ingestion Helper Functions
 *
 * Internal utilities for embedding generation and chunk mapping
 * used by the ingestion module.
 *
 * @module rag/ingestionHelpers
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { redactSecrets } from "../security/index.js";
import {
  getEmbeddingClient,
  type EmbeddingClient,
} from "../llm/providers/llmProvider/embedding.js";
import { INGESTION_DEFAULTS, type EmbeddingTierName } from "../constants/index.js";
import {
  updateDiffChunkEmbedding,
  getDiffChunksWithoutEmbeddings,
  updateKnowledgeDocEmbedding,
  getKnowledgeDocsWithoutEmbeddings,
  type CreateDiffChunkInput,
  type CreateKnowledgeDocInput,
} from "../database/index.js";
import { selectEmbeddingTier, recordEmbeddingCost } from "./costControls.js";
import type { DiffChunkContext, KnowledgeChunkContext } from "./types.js";

const logger = createLogger("rag-ingestion");

export { INGESTION_DEFAULTS };

// ==================== Content Processing ====================

/**
 * Redacts secrets from text content.
 */
export const redactContent = (content: string): string => redactSecrets(content);

// ==================== Chunk Mapping ====================

export const mapDiffChunksToInputs = (
  chunks: ReadonlyArray<{
    content: string;
    metadata: { chunkIndex: number; startOffset: number; endOffset: number };
  }>,
  context: DiffChunkContext
): readonly CreateDiffChunkInput[] =>
  chunks.map((chunk) => ({
    repository: context.repository,
    prNumber: context.prNumber,
    commitSha: context.commitSha,
    filePath: context.filePath,
    hunkHeader: context.hunkHeader,
    content: redactContent(chunk.content),
    chunkIndex: chunk.metadata.chunkIndex,
    startLine: chunk.metadata.startOffset,
    endLine: chunk.metadata.endOffset,
    tenantId: context.tenantId,
  }));

export const mapKnowledgeChunksToInputs = (
  chunks: ReadonlyArray<{ content: string; metadata: { chunkIndex: number } }>,
  context: KnowledgeChunkContext
): readonly CreateKnowledgeDocInput[] =>
  chunks.map((chunk) => ({
    repository: context.repository,
    parentId: context.parentId ?? undefined,
    docType: context.docType,
    title: context.title,
    content: redactContent(chunk.content),
    sourceUrl: context.sourceUrl,
    filePath: context.filePath,
    chunkIndex: chunk.metadata.chunkIndex,
    tenantId: context.tenantId,
    metadata: {
      ...context.metadata,
      originalTitle: context.title,
    },
  }));

// ==================== Embedding Functions ====================

/**
 * Selects embedding tier based on tenant budget.
 * Falls back to STANDARD tier when no tenantId provided.
 */
const selectTierForIngestion = async (
  tenantId: string | undefined,
  estimatedTokens: number
): Promise<EmbeddingTierName> => {
  if (!tenantId) {
    return "STANDARD";
  }

  try {
    const tierSelection = await selectEmbeddingTier(tenantId, estimatedTokens);
    logger.debug("Selected tier for ingestion", {
      tenantId,
      tier: tierSelection.selectedTier,
      reason: tierSelection.reason,
    });
    return tierSelection.selectedTier;
  } catch (error) {
    logger.warn("Failed to select tier, using STANDARD", {
      tenantId,
      error: getErrorMessage(error),
    });
    return "STANDARD";
  }
};

/**
 * Generates embeddings for diff chunks without them.
 * Uses budget-aware tier selection when tenantId is provided.
 */
export const embedPendingDiffChunks = async (
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

  // Estimate tokens for tier selection (rough: ~4 chars per token)
  const estimatedTokens = Math.ceil(contents.reduce((sum, content) => sum + content.length, 0) / 4);

  // Select tier based on budget
  const selectedTier = await selectTierForIngestion(tenantId, estimatedTokens);
  const tieredClient = getEmbeddingClient(selectedTier);

  try {
    const batchResult = await tieredClient.generateBatchEmbeddings(contents);

    // Use actual model and tier from result (cast tier since OpenAI returns EmbeddingTierName)
    const { model } = batchResult;
    const tier = batchResult.tier as EmbeddingTierName;

    // Process each embedding result using forEach with async
    await Promise.all(
      chunks.map(async (chunk, index) => {
        const embedding = batchResult.embeddings[index];
        try {
          await updateDiffChunkEmbedding(chunk.id, embedding, model, tier);
          embedded += 1;
        } catch (updateError) {
          errors.push(
            `Failed to update embedding for diff chunk ${chunk.id}: ${getErrorMessage(updateError)}`
          );
        }
      })
    );

    // Record embedding cost for the tenant (fire-and-forget)
    if (tenantId) {
      void (async () => {
        try {
          await recordEmbeddingCost(tenantId, tier, batchResult.totalTokens);
        } catch (costError) {
          logger.warn("Failed to record ingestion cost", { error: getErrorMessage(costError) });
        }
      })();
    }
  } catch (batchError) {
    errors.push(`Batch embedding failed for diff chunks: ${getErrorMessage(batchError)}`);
  }

  return { embedded, errors };
};

/**
 * Generates embeddings for knowledge docs without them.
 * Uses budget-aware tier selection when tenantId is provided.
 */
export const embedPendingKnowledgeDocs = async (
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

  // Estimate tokens for tier selection (rough: ~4 chars per token)
  const estimatedTokens = Math.ceil(contents.reduce((sum, content) => sum + content.length, 0) / 4);

  // Select tier based on budget
  const selectedTier = await selectTierForIngestion(tenantId, estimatedTokens);
  const tieredClient = getEmbeddingClient(selectedTier);

  try {
    const batchResult = await tieredClient.generateBatchEmbeddings(contents);

    // Use actual model and tier from result (cast tier since OpenAI returns EmbeddingTierName)
    const { model } = batchResult;
    const tier = batchResult.tier as EmbeddingTierName;

    // Process each embedding in parallel
    await Promise.all(
      docs.map(async (doc, index) => {
        const embedding = batchResult.embeddings[index];
        try {
          await updateKnowledgeDocEmbedding(doc.id, embedding, model, tier);
          embedded += 1;
        } catch (updateError) {
          errors.push(
            `Failed to update embedding for knowledge doc ${doc.id}: ${getErrorMessage(updateError)}`
          );
        }
      })
    );

    // Record embedding cost for the tenant (fire-and-forget)
    if (tenantId) {
      void (async () => {
        try {
          await recordEmbeddingCost(tenantId, tier, batchResult.totalTokens);
        } catch (costError) {
          logger.warn("Failed to record ingestion cost", { error: getErrorMessage(costError) });
        }
      })();
    }
  } catch (batchError) {
    errors.push(`Batch embedding failed for knowledge docs: ${getErrorMessage(batchError)}`);
  }

  return { embedded, errors };
};
