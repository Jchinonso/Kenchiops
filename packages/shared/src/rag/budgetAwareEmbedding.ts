/**
 * Budget-Aware Embedding Generation
 *
 * Provides embedding generation with automatic tier selection based on
 * tenant budget configuration. Integrates with cost controls for
 * budget tracking and enforcement.
 *
 * @module rag/budgetAwareEmbedding
 */

import { createLogger } from "../core/logger.js";
import { AppError } from "../core/errors.js";
import { ERROR_CODES, HTTP_STATUS } from "../constants/index.js";
import type { BudgetStatus } from "../database/index.js";
import { selectEmbeddingTier, recordEmbeddingCost } from "./costControls.js";
import type {
  BudgetAwareEmbeddingOptions,
  BatchBudgetAwareEmbeddingOptions,
  BudgetAwareEmbeddingResult,
  BatchBudgetAwareEmbeddingResult,
} from "./types.js";

export type {
  BudgetAwareEmbeddingOptions,
  BatchBudgetAwareEmbeddingOptions,
  BudgetAwareEmbeddingResult,
  BatchBudgetAwareEmbeddingResult,
} from "./types.js";

const logger = createLogger("rag-budget-embedding");

// ==================== Error Classes ====================

/**
 * Budget exceeded error for blocking mode.
 * Extends AppError for typed error handling and structured logging.
 */
export class BudgetExceededError extends AppError {
  public readonly tenantId: string;
  public readonly budgetStatus: BudgetStatus;

  constructor(tenantId: string, budgetStatus: BudgetStatus) {
    super(
      `Budget exceeded for tenant ${tenantId}: ${budgetStatus.percentUsed.toFixed(1)}% used (${budgetStatus.currentSpendUsd.toFixed(4)} / ${budgetStatus.monthlyBudgetUsd.toFixed(4)} USD)`,
      ERROR_CODES.VALIDATION_ERROR,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      true,
      {
        retryable: false,
        metadata: {
          tenantId,
          percentUsed: budgetStatus.percentUsed,
          currentSpendUsd: budgetStatus.currentSpendUsd,
          monthlyBudgetUsd: budgetStatus.monthlyBudgetUsd,
        },
      }
    );
    this.tenantId = tenantId;
    this.budgetStatus = budgetStatus;
  }
}

// ==================== Embedding Generation ====================

/**
 * Generates an embedding with automatic tier selection based on budget.
 *
 * This is the primary entry point for budget-aware embedding generation.
 * It automatically selects the appropriate tier based on tenant budget
 * and configuration, and records the cost after generation.
 *
 * @param options - Budget-aware embedding options
 * @returns Promise resolving to embedding result with tier info
 * @throws {BudgetExceededError} If budget exceeded and blockOnBudgetExceeded is true
 */
export const generateBudgetAwareEmbedding = async (
  options: BudgetAwareEmbeddingOptions
): Promise<BudgetAwareEmbeddingResult> => {
  const { tenantId, text, blockOnBudgetExceeded = false } = options;

  // Estimate token count (rough: ~4 chars per token)
  const estimatedTokens = Math.ceil(text.length / 4);

  // Select tier based on budget
  const tierSelection = await selectEmbeddingTier(tenantId, estimatedTokens);

  // Check if we should block on budget exceeded
  if (blockOnBudgetExceeded && tierSelection.budgetStatus.status === "exceeded") {
    throw new BudgetExceededError(tenantId, tierSelection.budgetStatus);
  }

  // Import dynamically to avoid circular dependency
  const { getEmbeddingClient } = await import("../llm/providers/openai/embedding.js");

  // Get client for selected tier and generate embedding
  const client = getEmbeddingClient(tierSelection.selectedTier);
  const result = await client.generateEmbedding(text);

  // Record cost
  await recordEmbeddingCost(tenantId, tierSelection.selectedTier, result.tokenCount);

  logger.info("Budget-aware embedding generated", {
    tenantId,
    tier: tierSelection.selectedTier,
    reason: tierSelection.reason,
    budgetStatus: tierSelection.budgetStatus.status,
    tokenCount: result.tokenCount,
  });

  return {
    embedding: result.embedding,
    tokenCount: result.tokenCount,
    model: result.model,
    tier: tierSelection.selectedTier,
    dimension: result.dimension,
    tierSelectionReason: tierSelection.reason,
    budgetStatus: tierSelection.budgetStatus,
  };
};

/**
 * Generates batch embeddings with automatic tier selection based on budget.
 *
 * @param options - Batch budget-aware embedding options
 * @returns Promise resolving to batch embedding result with tier info
 * @throws {BudgetExceededError} If budget exceeded and blockOnBudgetExceeded is true
 */
export const generateBatchBudgetAwareEmbeddings = async (
  options: BatchBudgetAwareEmbeddingOptions
): Promise<BatchBudgetAwareEmbeddingResult> => {
  const { tenantId, texts, blockOnBudgetExceeded = false } = options;

  // Estimate total token count
  const estimatedTokens = Math.ceil(texts.reduce((total, text) => total + text.length, 0) / 4);

  // Select tier based on budget
  const tierSelection = await selectEmbeddingTier(tenantId, estimatedTokens);

  // Check if we should block on budget exceeded
  if (blockOnBudgetExceeded && tierSelection.budgetStatus.status === "exceeded") {
    throw new BudgetExceededError(tenantId, tierSelection.budgetStatus);
  }

  // Import dynamically to avoid circular dependency
  const { getEmbeddingClient } = await import("../llm/providers/openai/embedding.js");

  // Get client for selected tier and generate embeddings
  const client = getEmbeddingClient(tierSelection.selectedTier);
  const result = await client.generateBatchEmbeddings(texts);

  // Record cost
  await recordEmbeddingCost(tenantId, tierSelection.selectedTier, result.totalTokens);

  logger.info("Budget-aware batch embeddings generated", {
    tenantId,
    tier: tierSelection.selectedTier,
    reason: tierSelection.reason,
    budgetStatus: tierSelection.budgetStatus.status,
    textCount: texts.length,
    totalTokens: result.totalTokens,
  });

  return {
    embeddings: result.embeddings,
    totalTokens: result.totalTokens,
    model: result.model,
    tier: tierSelection.selectedTier,
    dimension: result.dimension,
    tierSelectionReason: tierSelection.reason,
    budgetStatus: tierSelection.budgetStatus,
  };
};
