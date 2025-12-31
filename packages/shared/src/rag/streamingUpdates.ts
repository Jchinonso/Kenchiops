/**
 * Streaming Updates Module
 *
 * Provides webhook-triggered ingestion and TTL-based staleness management.
 * Enables real-time updates of RAG data from CI/CD events.
 *
 * @module rag/streamingUpdates
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { query } from "../database/client.js";
import { TTL_POLICIES, KNOWLEDGE_DOC_TYPES, type KnowledgeDocType } from "../constants/index.js";
import { ingestDiffChunks, ingestKnowledgeDoc } from "./ingestion.js";

const logger = createLogger("rag-streaming-updates");

// ==================== Types ====================

/**
 * PR merge event for diff ingestion.
 */
export interface PRMergeEvent {
  readonly repository: string;
  readonly prNumber: number;
  readonly commitSha: string;
  readonly diffContent: string;
  readonly tenantId: string;
  readonly filePaths: readonly string[];
}

/**
 * Document update event for knowledge doc ingestion.
 */
export interface DocUpdateEvent {
  readonly repository: string;
  readonly filePath: string;
  readonly content: string;
  readonly title: string;
  readonly tenantId: string;
  readonly docType?: KnowledgeDocType;
}

/**
 * Staleness check result.
 */
export interface StalenessResult {
  readonly staleDiffChunks: number;
  readonly staleKnowledgeDocs: number;
  readonly expiredDiffChunks: number;
  readonly expiredKnowledgeDocs: number;
}

/**
 * Cleanup result.
 */
export interface CleanupResult {
  readonly diffChunksDeleted: number;
  readonly knowledgeDocsDeleted: number;
  readonly diffChunksMarkedStale: number;
  readonly knowledgeDocsMarkedStale: number;
}

/**
 * TTL configuration for a document type.
 */
export interface TTLConfig {
  readonly docType: KnowledgeDocType;
  readonly ttlDays: number;
  readonly refreshBeforeExpiryHours: number;
}

// ==================== SQL Queries ====================

const STREAMING_QUERIES = {
  MARK_DIFF_CHUNKS_STALE: `
    UPDATE diff_chunks
    SET is_stale = TRUE, updated_at = NOW()
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW() + ($1 || ' hours')::INTERVAL
      AND is_stale = FALSE
  `,

  MARK_KNOWLEDGE_DOCS_STALE: `
    UPDATE knowledge_documents
    SET is_stale = TRUE, updated_at = NOW()
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW() + ($1 || ' hours')::INTERVAL
      AND is_stale = FALSE
  `,

  DELETE_EXPIRED_DIFF_CHUNKS: `
    DELETE FROM diff_chunks
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
  `,

  DELETE_EXPIRED_KNOWLEDGE_DOCS: `
    DELETE FROM knowledge_documents
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
  `,

  COUNT_STALE_DIFF_CHUNKS: `
    SELECT COUNT(*) as count FROM diff_chunks WHERE is_stale = TRUE
  `,

  COUNT_STALE_KNOWLEDGE_DOCS: `
    SELECT COUNT(*) as count FROM knowledge_documents WHERE is_stale = TRUE
  `,

  COUNT_EXPIRED_DIFF_CHUNKS: `
    SELECT COUNT(*) as count FROM diff_chunks
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
  `,

  COUNT_EXPIRED_KNOWLEDGE_DOCS: `
    SELECT COUNT(*) as count FROM knowledge_documents
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
  `,

  SET_DIFF_CHUNK_EXPIRY: `
    UPDATE diff_chunks
    SET expires_at = NOW() + ($2 || ' days')::INTERVAL, updated_at = NOW()
    WHERE id = $1
  `,

  SET_KNOWLEDGE_DOC_EXPIRY: `
    UPDATE knowledge_documents
    SET expires_at = NOW() + ($2 || ' days')::INTERVAL, updated_at = NOW()
    WHERE id = $1
  `,

  REFRESH_DIFF_CHUNK: `
    UPDATE diff_chunks
    SET is_stale = FALSE,
        last_refreshed_at = NOW(),
        expires_at = NOW() + ($2 || ' days')::INTERVAL,
        updated_at = NOW()
    WHERE id = $1
  `,

  REFRESH_KNOWLEDGE_DOC: `
    UPDATE knowledge_documents
    SET is_stale = FALSE,
        last_refreshed_at = NOW(),
        expires_at = NOW() + ($2 || ' days')::INTERVAL,
        updated_at = NOW()
    WHERE id = $1
  `,

  GET_STALE_DIFF_CHUNKS: `
    SELECT id, repository, pr_number, file_path
    FROM diff_chunks
    WHERE is_stale = TRUE
    ORDER BY expires_at ASC
    LIMIT $1
  `,

  GET_STALE_KNOWLEDGE_DOCS: `
    SELECT id, repository, title, doc_type
    FROM knowledge_documents
    WHERE is_stale = TRUE
    ORDER BY expires_at ASC
    LIMIT $1
  `,
} as const;

// ==================== TTL Configuration ====================

/**
 * Gets TTL days for a document type.
 * Reserved for future use in staleness calculations.
 */
const _getTTLDays = (docType?: KnowledgeDocType): number => {
  const ttlMap: Record<string, number> = {
    [KNOWLEDGE_DOC_TYPES.POSTMORTEM]: TTL_POLICIES.INCIDENT_DOCS_DAYS,
    [KNOWLEDGE_DOC_TYPES.KNOWN_ISSUES]: TTL_POLICIES.INCIDENT_DOCS_DAYS,
    [KNOWLEDGE_DOC_TYPES.EXTERNAL]: TTL_POLICIES.EXTERNAL_DOCS_DAYS,
  };

  return docType
    ? (ttlMap[docType] ?? TTL_POLICIES.KNOWLEDGE_DOCS_DEFAULT_DAYS)
    : TTL_POLICIES.KNOWLEDGE_DOCS_DEFAULT_DAYS;
};

// ==================== Webhook Handlers ====================

/**
 * Handles PR merge event for diff chunk ingestion.
 * Called when a PR is merged to ingest the diff into RAG.
 */
export const handlePRMergeEvent = async (
  event: PRMergeEvent
): Promise<{ chunksCreated: number; success: boolean }> => {
  logger.info("Handling PR merge event for RAG ingestion", {
    repository: event.repository,
    prNumber: event.prNumber,
    commitSha: event.commitSha,
    fileCount: event.filePaths.length,
  });

  try {
    // Process each file path in the PR
    const processFile = async (index: number, totalChunks: number): Promise<number> => {
      if (index >= event.filePaths.length) {
        return totalChunks;
      }

      const filePath = event.filePaths[index];
      const result = await ingestDiffChunks({
        repository: event.repository,
        prNumber: event.prNumber,
        commitSha: event.commitSha,
        diffContent: event.diffContent,
        filePath,
        tenantId: event.tenantId,
      });

      return processFile(index + 1, totalChunks + result.chunksCreated);
    };

    const totalChunksCreated = await processFile(0, 0);

    logger.info("PR merge event processed", {
      repository: event.repository,
      prNumber: event.prNumber,
      chunksCreated: totalChunksCreated,
    });

    return { chunksCreated: totalChunksCreated, success: true };
  } catch (error) {
    logger.error("Failed to handle PR merge event", {
      repository: event.repository,
      prNumber: event.prNumber,
      error: getErrorMessage(error),
    });
    return { chunksCreated: 0, success: false };
  }
};

/**
 * Handles document update event for knowledge doc ingestion.
 * Called when a doc file is updated in the repository.
 */
export const handleDocUpdateEvent = async (
  event: DocUpdateEvent
): Promise<{ chunksCreated: number; success: boolean }> => {
  logger.info("Handling doc update event for RAG ingestion", {
    repository: event.repository,
    filePath: event.filePath,
    title: event.title,
  });

  try {
    const docType = event.docType ?? inferDocType(event.filePath);

    const result = await ingestKnowledgeDoc({
      content: event.content,
      title: event.title,
      docType,
      tenantId: event.tenantId,
      repository: event.repository,
      filePath: event.filePath,
    });

    logger.info("Doc update event processed", {
      repository: event.repository,
      filePath: event.filePath,
      chunksCreated: result.chunksCreated,
    });

    return { chunksCreated: result.chunksCreated, success: true };
  } catch (error) {
    logger.error("Failed to handle doc update event", {
      repository: event.repository,
      filePath: event.filePath,
      error: getErrorMessage(error),
    });
    return { chunksCreated: 0, success: false };
  }
};

/**
 * Infers document type from file path.
 */
const inferDocType = (filePath: string): KnowledgeDocType => {
  const lowerPath = filePath.toLowerCase();

  const pathPatterns: ReadonlyArray<{ pattern: string; docType: KnowledgeDocType }> = [
    { pattern: "runbook", docType: KNOWLEDGE_DOC_TYPES.RUNBOOK },
    { pattern: "postmortem", docType: KNOWLEDGE_DOC_TYPES.POSTMORTEM },
    { pattern: "incident", docType: KNOWLEDGE_DOC_TYPES.POSTMORTEM },
    { pattern: "readme", docType: KNOWLEDGE_DOC_TYPES.README },
    { pattern: "changelog", docType: KNOWLEDGE_DOC_TYPES.CHANGELOG },
    { pattern: "deploy", docType: KNOWLEDGE_DOC_TYPES.DEPLOYMENT },
    { pattern: "ci", docType: KNOWLEDGE_DOC_TYPES.CI_CD },
    { pattern: "workflow", docType: KNOWLEDGE_DOC_TYPES.CI_CD },
    { pattern: "test", docType: KNOWLEDGE_DOC_TYPES.TESTING },
    { pattern: "api", docType: KNOWLEDGE_DOC_TYPES.API_DOCS },
    { pattern: "architecture", docType: KNOWLEDGE_DOC_TYPES.ARCHITECTURE },
    { pattern: "config", docType: KNOWLEDGE_DOC_TYPES.CONFIG_GUIDE },
    { pattern: "database", docType: KNOWLEDGE_DOC_TYPES.DATABASE },
    { pattern: "schema", docType: KNOWLEDGE_DOC_TYPES.DATABASE },
  ];

  const match = pathPatterns.find(({ pattern }) => lowerPath.includes(pattern));
  return match?.docType ?? KNOWLEDGE_DOC_TYPES.DOCUMENTATION;
};

// ==================== Staleness Management ====================

/**
 * Checks staleness status of RAG data.
 */
export const checkStaleness = async (): Promise<StalenessResult> => {
  const [staleChunks, staleDocs, expiredChunks, expiredDocs] = await Promise.all([
    query<{ count: string }>(STREAMING_QUERIES.COUNT_STALE_DIFF_CHUNKS, []),
    query<{ count: string }>(STREAMING_QUERIES.COUNT_STALE_KNOWLEDGE_DOCS, []),
    query<{ count: string }>(STREAMING_QUERIES.COUNT_EXPIRED_DIFF_CHUNKS, []),
    query<{ count: string }>(STREAMING_QUERIES.COUNT_EXPIRED_KNOWLEDGE_DOCS, []),
  ]);

  return {
    staleDiffChunks: parseInt(staleChunks.rows[0]?.count ?? "0", 10),
    staleKnowledgeDocs: parseInt(staleDocs.rows[0]?.count ?? "0", 10),
    expiredDiffChunks: parseInt(expiredChunks.rows[0]?.count ?? "0", 10),
    expiredKnowledgeDocs: parseInt(expiredDocs.rows[0]?.count ?? "0", 10),
  };
};

/**
 * Marks documents as stale that are approaching expiry.
 */
export const markApproachingExpiry = async (): Promise<{
  diffChunks: number;
  knowledgeDocs: number;
}> => {
  const refreshHours = TTL_POLICIES.REFRESH_BEFORE_EXPIRY_HOURS;

  const [diffResult, docResult] = await Promise.all([
    query(STREAMING_QUERIES.MARK_DIFF_CHUNKS_STALE, [refreshHours]),
    query(STREAMING_QUERIES.MARK_KNOWLEDGE_DOCS_STALE, [refreshHours]),
  ]);

  logger.info("Marked documents as stale", {
    diffChunks: diffResult.rowCount,
    knowledgeDocs: docResult.rowCount,
  });

  return {
    diffChunks: diffResult.rowCount,
    knowledgeDocs: docResult.rowCount,
  };
};

/**
 * Cleans up expired documents.
 */
export const cleanupExpired = async (): Promise<CleanupResult> => {
  // First mark approaching expiry
  const markedStale = await markApproachingExpiry();

  // Then delete expired
  const [diffDeleted, docsDeleted] = await Promise.all([
    query(STREAMING_QUERIES.DELETE_EXPIRED_DIFF_CHUNKS, []),
    query(STREAMING_QUERIES.DELETE_EXPIRED_KNOWLEDGE_DOCS, []),
  ]);

  logger.info("Cleaned up expired documents", {
    diffChunksDeleted: diffDeleted.rowCount,
    knowledgeDocsDeleted: docsDeleted.rowCount,
  });

  return {
    diffChunksDeleted: diffDeleted.rowCount,
    knowledgeDocsDeleted: docsDeleted.rowCount,
    diffChunksMarkedStale: markedStale.diffChunks,
    knowledgeDocsMarkedStale: markedStale.knowledgeDocs,
  };
};

/**
 * Refreshes a diff chunk, extending its TTL.
 */
export const refreshDiffChunk = async (
  chunkId: string,
  ttlDays: number = TTL_POLICIES.DIFF_CHUNKS_DEFAULT_DAYS
): Promise<boolean> => {
  const result = await query(STREAMING_QUERIES.REFRESH_DIFF_CHUNK, [chunkId, ttlDays]);
  return result.rowCount > 0;
};

/**
 * Refreshes a knowledge doc, extending its TTL.
 */
export const refreshKnowledgeDoc = async (docId: string, ttlDays?: number): Promise<boolean> => {
  const effectiveTTL = ttlDays ?? TTL_POLICIES.KNOWLEDGE_DOCS_DEFAULT_DAYS;
  const result = await query(STREAMING_QUERIES.REFRESH_KNOWLEDGE_DOC, [docId, effectiveTTL]);
  return result.rowCount > 0;
};

/**
 * Gets stale documents that need re-ingestion.
 */
export const getStaleDocuments = async (
  limit: number = 100
): Promise<{
  diffChunks: ReadonlyArray<{ id: string; repository: string; prNumber: number; filePath: string }>;
  knowledgeDocs: ReadonlyArray<{ id: string; repository: string; title: string; docType: string }>;
}> => {
  const [diffResult, docResult] = await Promise.all([
    query<{ id: string; repository: string; pr_number: number; file_path: string }>(
      STREAMING_QUERIES.GET_STALE_DIFF_CHUNKS,
      [limit]
    ),
    query<{ id: string; repository: string; title: string; doc_type: string }>(
      STREAMING_QUERIES.GET_STALE_KNOWLEDGE_DOCS,
      [limit]
    ),
  ]);

  return {
    diffChunks: Object.freeze(
      diffResult.rows.map((row) => ({
        id: row.id,
        repository: row.repository,
        prNumber: row.pr_number,
        filePath: row.file_path,
      }))
    ),
    knowledgeDocs: Object.freeze(
      docResult.rows.map((row) => ({
        id: row.id,
        repository: row.repository,
        title: row.title,
        docType: row.doc_type,
      }))
    ),
  };
};
