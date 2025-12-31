/**
 * RAG Governance Module
 *
 * Provides administrative utilities for managing RAG data:
 * - Re-ingestion triggers
 * - Stale embedding purge
 * - Tenant isolation enforcement
 * - Embedding version management
 *
 * @module rag/governance
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  getDiffChunksWithoutEmbeddings,
  getKnowledgeDocsWithoutEmbeddings,
  getDocsNeedingReembedding,
  deleteDiffChunksByTenant,
  deleteDiffChunksByPR,
  deleteKnowledgeDocsByTenant,
  deleteKnowledgeDocsByParent,
  getKnowledgeDocCountsByType,
} from "../database/index.js";
import { EMBEDDING_CONFIG, type KnowledgeDocType } from "../constants/index.js";
import { processPendingEmbeddings } from "./ingestion.js";

const logger = createLogger("rag-governance");

// ==================== Types ====================

/**
 * Statistics for RAG data by tenant.
 */
export interface RAGTenantStats {
  readonly tenantId: string;
  readonly diffChunkCount: number;
  readonly knowledgeDocCounts: Record<KnowledgeDocType, number>;
  readonly pendingEmbeddings: number;
  readonly outdatedEmbeddings: number;
}

/**
 * Result of a purge operation.
 */
export interface PurgeResult {
  readonly success: boolean;
  readonly deletedCount: number;
  readonly errors: readonly string[];
}

/**
 * Result of a re-embedding operation.
 */
export interface ReembeddingResult {
  readonly success: boolean;
  readonly processedCount: number;
  readonly errors: readonly string[];
}

/**
 * Configuration for re-embedding jobs.
 */
export interface ReembeddingConfig {
  readonly batchSize?: number;
  readonly tenantId?: string;
  readonly targetModel?: string;
  readonly targetVersion?: string;
}

/**
 * Health status of the RAG system.
 */
export interface RAGHealthStatus {
  readonly healthy: boolean;
  readonly pendingDiffChunks: number;
  readonly pendingKnowledgeDocs: number;
  readonly outdatedEmbeddings: number;
  readonly issues: readonly string[];
}

// ==================== Constants ====================

const GOVERNANCE_CONSTANTS = {
  /** Default batch size for governance operations */
  DEFAULT_BATCH_SIZE: 100,
  /** Maximum allowed pending embeddings before warning */
  MAX_PENDING_THRESHOLD: 1000,
  /** Maximum allowed outdated embeddings before warning */
  MAX_OUTDATED_THRESHOLD: 500,
} as const;

// ==================== Tenant Operations ====================

/**
 * Gets RAG statistics for a specific tenant.
 *
 * @param tenantId - Tenant ID to get stats for
 * @returns Tenant-specific RAG statistics
 */
export const getTenantRAGStats = async (tenantId: string): Promise<RAGTenantStats> => {
  logger.info("Getting RAG stats for tenant", { tenantId });

  try {
    // Get pending embeddings count
    const pendingDiffChunks = await getDiffChunksWithoutEmbeddings(
      GOVERNANCE_CONSTANTS.DEFAULT_BATCH_SIZE,
      tenantId
    );
    const pendingKnowledgeDocs = await getKnowledgeDocsWithoutEmbeddings(
      GOVERNANCE_CONSTANTS.DEFAULT_BATCH_SIZE,
      tenantId
    );

    // Get outdated embeddings count
    const outdatedDocs = await getDocsNeedingReembedding(
      EMBEDDING_CONFIG.MODEL,
      "1",
      GOVERNANCE_CONSTANTS.DEFAULT_BATCH_SIZE,
      tenantId
    );

    // Get knowledge doc counts by type
    const knowledgeDocCounts = await getKnowledgeDocCountsByType();

    return {
      tenantId,
      diffChunkCount: pendingDiffChunks.length,
      knowledgeDocCounts,
      pendingEmbeddings: pendingDiffChunks.length + pendingKnowledgeDocs.length,
      outdatedEmbeddings: outdatedDocs.length,
    };
  } catch (error) {
    logger.error("Failed to get tenant RAG stats", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Purges all RAG data for a tenant.
 * Use with caution - this permanently deletes all embeddings.
 *
 * @param tenantId - Tenant ID to purge data for
 * @returns Purge result with deleted counts
 */
export const purgeTenantRAGData = async (tenantId: string): Promise<PurgeResult> => {
  const errors: string[] = [];
  let deletedCount = 0;

  logger.warn("Purging all RAG data for tenant", { tenantId });

  try {
    // Delete diff chunks
    const diffDeleted = await deleteDiffChunksByTenant(tenantId);
    deletedCount += diffDeleted;

    // Delete knowledge docs
    const knowledgeDeleted = await deleteKnowledgeDocsByTenant(tenantId);
    deletedCount += knowledgeDeleted;

    logger.info("Tenant RAG data purged", {
      tenantId,
      diffChunksDeleted: diffDeleted,
      knowledgeDocsDeleted: knowledgeDeleted,
      totalDeleted: deletedCount,
    });

    return {
      success: errors.length === 0,
      deletedCount,
      errors: Object.freeze(errors),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to purge tenant RAG data", {
      tenantId,
      error: errorMessage,
    });
    errors.push(errorMessage);

    return {
      success: false,
      deletedCount,
      errors: Object.freeze(errors),
    };
  }
};

// ==================== Repository Operations ====================

/**
 * Purges diff chunks for a specific PR.
 * Useful when a PR is closed or needs re-processing.
 *
 * @param repository - Repository full name
 * @param prNumber - PR number to purge
 * @returns Purge result
 */
export const purgePRDiffChunks = async (
  repository: string,
  prNumber: number
): Promise<PurgeResult> => {
  const errors: string[] = [];

  logger.info("Purging diff chunks for PR", { repository, prNumber });

  try {
    const deletedCount = await deleteDiffChunksByPR(prNumber, repository);

    logger.info("PR diff chunks purged", {
      repository,
      prNumber,
      deletedCount,
    });

    return {
      success: true,
      deletedCount,
      errors: Object.freeze(errors),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to purge PR diff chunks", {
      repository,
      prNumber,
      error: errorMessage,
    });
    errors.push(errorMessage);

    return {
      success: false,
      deletedCount: 0,
      errors: Object.freeze(errors),
    };
  }
};

/**
 * Purges knowledge document chunks by parent ID.
 * Useful when a document needs re-ingestion.
 *
 * @param parentId - Parent document ID
 * @returns Purge result
 */
export const purgeKnowledgeDocChunks = async (parentId: string): Promise<PurgeResult> => {
  const errors: string[] = [];

  logger.info("Purging knowledge doc chunks", { parentId });

  try {
    const deletedCount = await deleteKnowledgeDocsByParent(parentId);

    logger.info("Knowledge doc chunks purged", {
      parentId,
      deletedCount,
    });

    return {
      success: true,
      deletedCount,
      errors: Object.freeze(errors),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to purge knowledge doc chunks", {
      parentId,
      error: errorMessage,
    });
    errors.push(errorMessage);

    return {
      success: false,
      deletedCount: 0,
      errors: Object.freeze(errors),
    };
  }
};

// ==================== Re-embedding Operations ====================

/**
 * Triggers re-embedding for documents with outdated embeddings.
 * Useful when upgrading embedding models.
 *
 * @param config - Re-embedding configuration
 * @returns Re-embedding result
 */
export const triggerReembedding = async (
  config: ReembeddingConfig = {}
): Promise<ReembeddingResult> => {
  const batchSize = config.batchSize ?? GOVERNANCE_CONSTANTS.DEFAULT_BATCH_SIZE;

  logger.info("Triggering re-embedding", {
    batchSize,
    tenantId: config.tenantId,
    targetModel: config.targetModel ?? EMBEDDING_CONFIG.MODEL,
    targetVersion: config.targetVersion ?? "1",
  });

  try {
    const result = await processPendingEmbeddings({
      batchSize,
      tenantId: config.tenantId,
    });

    const processedCount = result.diffChunksEmbedded + result.knowledgeDocsEmbedded;

    logger.info("Re-embedding complete", {
      diffChunksProcessed: result.diffChunksEmbedded,
      knowledgeDocsProcessed: result.knowledgeDocsEmbedded,
      totalProcessed: processedCount,
      errorCount: result.errors.length,
    });

    return {
      success: result.errors.length === 0,
      processedCount,
      errors: Object.freeze(result.errors),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Re-embedding failed", { error: errorMessage });

    return {
      success: false,
      processedCount: 0,
      errors: Object.freeze([errorMessage]),
    };
  }
};

// ==================== Health Check ====================

/**
 * Checks the health of the RAG system.
 * Returns issues if there are too many pending or outdated embeddings.
 *
 * @returns RAG health status
 */
export const checkRAGHealth = async (): Promise<RAGHealthStatus> => {
  const issues: string[] = [];

  logger.debug("Checking RAG health");

  try {
    // Get pending embeddings
    const pendingDiffChunks = await getDiffChunksWithoutEmbeddings(
      GOVERNANCE_CONSTANTS.MAX_PENDING_THRESHOLD + 1
    );
    const pendingKnowledgeDocs = await getKnowledgeDocsWithoutEmbeddings(
      GOVERNANCE_CONSTANTS.MAX_PENDING_THRESHOLD + 1
    );

    // Get outdated embeddings
    const outdatedDocs = await getDocsNeedingReembedding(
      EMBEDDING_CONFIG.MODEL,
      "1",
      GOVERNANCE_CONSTANTS.MAX_OUTDATED_THRESHOLD + 1
    );

    // Check thresholds
    const totalPending = pendingDiffChunks.length + pendingKnowledgeDocs.length;
    if (totalPending > GOVERNANCE_CONSTANTS.MAX_PENDING_THRESHOLD) {
      issues.push(`High pending embedding count: ${totalPending}`);
    }

    if (outdatedDocs.length > GOVERNANCE_CONSTANTS.MAX_OUTDATED_THRESHOLD) {
      issues.push(`High outdated embedding count: ${outdatedDocs.length}`);
    }

    const healthy = issues.length === 0;

    logger.info("RAG health check complete", {
      healthy,
      pendingDiffChunks: pendingDiffChunks.length,
      pendingKnowledgeDocs: pendingKnowledgeDocs.length,
      outdatedEmbeddings: outdatedDocs.length,
      issueCount: issues.length,
    });

    return {
      healthy,
      pendingDiffChunks: pendingDiffChunks.length,
      pendingKnowledgeDocs: pendingKnowledgeDocs.length,
      outdatedEmbeddings: outdatedDocs.length,
      issues: Object.freeze(issues),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("RAG health check failed", { error: errorMessage });

    return {
      healthy: false,
      pendingDiffChunks: 0,
      pendingKnowledgeDocs: 0,
      outdatedEmbeddings: 0,
      issues: Object.freeze([`Health check failed: ${errorMessage}`]),
    };
  }
};
