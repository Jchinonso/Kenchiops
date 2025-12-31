/**
 * RAG Document Ingestion Routes
 *
 * API endpoints for ingesting, searching, and managing RAG knowledge documents.
 * Used by external systems (CI/CD, documentation platforms) to sync content.
 *
 * @module routes/ragRoutes
 */

import { Router } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  KNOWLEDGE_DOC_TYPES,
  type KnowledgeDocType,
  ingestKnowledgeDoc,
  searchAll,
  syncDueSources,
  getKnowledgeDocCountsByType,
  getTenantRAGStats,
  purgeTenantRAGData,
  purgePRDiffChunks,
  purgeKnowledgeDocChunks,
  type IngestKnowledgeDocInput,
  type SyncAllResult,
} from "@kenchi/shared";

const router = Router();
const routeLogger = createLogger(SERVICE_NAMES.API);

// ==================== Types ====================

/**
 * Document ingestion request body
 */
interface IngestRequestBody {
  readonly docType: KnowledgeDocType;
  readonly title: string;
  readonly content: string;
  readonly tenantId?: string;
  readonly repository?: string;
  readonly sourceUrl?: string;
  readonly filePath?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Search request body
 */
interface SearchRequestBody {
  readonly query: string;
  readonly tenantId?: string;
  readonly repository?: string;
  readonly topK?: number;
  readonly minSimilarity?: number;
}

/**
 * Sync request body
 */
interface SyncRequestBody {
  readonly maxDocsPerSource?: number;
  readonly minCredibility?: number;
  readonly limit?: number;
}

// ==================== Validation Helpers ====================

/**
 * Validates document type is a known type
 */
const isValidDocType = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }
  return Object.values(KNOWLEDGE_DOC_TYPES).includes(value as KnowledgeDocType);
};

// ==================== Routes ====================

/**
 * POST /api/rag/ingest
 *
 * Ingests a single knowledge document into the RAG system.
 * The document is chunked, embedded, and stored for semantic search.
 */
router.post(
  API_ROUTES.RAG_INGEST,
  validate({
    body: {
      docType: (value) => validators.required(value) && isValidDocType(value),
      title: (value) => validators.required(value) && validators.string(value),
      content: (value) => validators.required(value) && validators.string(value),
    },
  }),
  asyncHandler(async (req, res) => {
    const body = req.body as IngestRequestBody;

    routeLogger.info("Ingesting document", {
      docType: body.docType,
      title: body.title,
      contentLength: body.content.length,
      tenantId: body.tenantId,
    });

    const input: IngestKnowledgeDocInput = {
      docType: body.docType,
      title: body.title,
      content: body.content,
      tenantId: body.tenantId,
      repository: body.repository,
      sourceUrl: body.sourceUrl,
      filePath: body.filePath,
      metadata: body.metadata,
    };

    const result = await ingestKnowledgeDoc(input);

    routeLogger.info("Document ingested successfully", {
      parentId: result.parentId,
      chunksCreated: result.chunksCreated,
      chunksEmbedded: result.chunksEmbedded,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        documentId: result.parentId,
        chunksCreated: result.chunksCreated,
        chunksEmbedded: result.chunksEmbedded,
        success: result.success,
      },
    });
  })
);

/**
 * POST /api/rag/search
 *
 * Searches for relevant documents using semantic similarity.
 * Returns both diff chunks and knowledge documents.
 */
router.post(
  API_ROUTES.RAG_SEARCH,
  validate({
    body: {
      query: (value) => validators.required(value) && validators.string(value),
    },
  }),
  asyncHandler(async (req, res) => {
    const body = req.body as SearchRequestBody;

    routeLogger.info("RAG search request", {
      queryLength: body.query.length,
      tenantId: body.tenantId,
      repository: body.repository,
    });

    const results = await searchAll({
      queryText: body.query,
      tenantId: body.tenantId,
      repository: body.repository,
      topK: body.topK,
      minSimilarity: body.minSimilarity,
    });

    routeLogger.info("RAG search complete", {
      diffChunkCount: results.diffChunks.length,
      knowledgeDocCount: results.knowledgeDocs.length,
      cacheHit: results.cacheHit,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        diffChunks: results.diffChunks.map((chunk) => ({
          id: chunk.item.id,
          repository: chunk.item.repository,
          filePath: chunk.item.filePath,
          content: chunk.item.content,
          similarity: chunk.similarity,
        })),
        knowledgeDocs: results.knowledgeDocs.map((doc) => ({
          id: doc.item.id,
          docType: doc.item.docType,
          title: doc.item.title,
          content: doc.item.content,
          similarity: doc.similarity,
        })),
        queryTokens: results.queryTokens,
        cacheHit: results.cacheHit,
      },
    });
  })
);

/**
 * GET /api/rag/stats
 *
 * Returns RAG system statistics including document counts by type.
 */
router.get(
  API_ROUTES.RAG_STATS,
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;

    routeLogger.info("Fetching RAG stats", { tenantId });

    const [docCounts, tenantStats] = await Promise.all([
      getKnowledgeDocCountsByType(),
      tenantId ? getTenantRAGStats(tenantId) : Promise.resolve(null),
    ]);

    const totalDocs = Object.values(docCounts).reduce((sum, count) => sum + count, 0);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        totalDocuments: totalDocs,
        documentsByType: docCounts,
        tenantStats: tenantStats
          ? {
              tenantId: tenantStats.tenantId,
              diffChunkCount: tenantStats.diffChunkCount,
              knowledgeDocCounts: tenantStats.knowledgeDocCounts,
              pendingEmbeddings: tenantStats.pendingEmbeddings,
              outdatedEmbeddings: tenantStats.outdatedEmbeddings,
            }
          : null,
      },
    });
  })
);

/**
 * POST /api/rag/sync
 *
 * Triggers synchronization of external knowledge sources.
 * Used for scheduled syncs or manual refresh.
 */
router.post(
  API_ROUTES.RAG_SYNC,
  asyncHandler(async (req, res) => {
    const body = req.body as SyncRequestBody;

    routeLogger.info("Starting external source sync", {
      maxDocsPerSource: body.maxDocsPerSource,
      minCredibility: body.minCredibility,
      limit: body.limit,
    });

    const syncOptions = {
      maxDocsPerSource: body.maxDocsPerSource,
      minCredibility: body.minCredibility,
    };

    const result: SyncAllResult = await syncDueSources(syncOptions, body.limit);

    routeLogger.info("External source sync complete", {
      sourcesProcessed: result.sourcesProcessed,
      totalDocsIngested: result.totalDocsIngested,
      totalErrors: result.totalErrors,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        sourcesProcessed: result.sourcesProcessed,
        totalDocsIngested: result.totalDocsIngested,
        totalErrors: result.totalErrors,
        results: result.results,
      },
    });
  })
);

// ==================== Privacy & Purge Routes ====================

/**
 * DELETE /api/rag/tenant/:tenantId
 *
 * Purges all RAG data for a specific tenant.
 * This includes diff chunks and knowledge documents.
 * Used for GDPR compliance and tenant offboarding.
 */
router.delete(
  API_ROUTES.RAG_PURGE_TENANT,
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;

    if (!tenantId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "tenantId is required",
      });
      return;
    }

    routeLogger.info("Purging tenant RAG data", { tenantId });

    const result = await purgeTenantRAGData(tenantId);

    routeLogger.info("Tenant RAG data purged", {
      tenantId,
      deletedCount: result.deletedCount,
      success: result.success,
    });

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        tenantId,
        deletedCount: result.deletedCount,
        errors: result.errors,
      },
    });
  })
);

/**
 * DELETE /api/rag/pr/:repository/:prNumber
 *
 * Purges diff chunks for a specific PR.
 * Used when a PR is closed or merged.
 */
router.delete(
  API_ROUTES.RAG_PURGE_PR,
  asyncHandler(async (req, res) => {
    const { repository, prNumber } = req.params;

    if (!repository || !prNumber) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "repository and prNumber are required",
      });
      return;
    }

    const prNumberInt = parseInt(prNumber, 10);
    if (isNaN(prNumberInt)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "prNumber must be a valid number",
      });
      return;
    }

    routeLogger.info("Purging PR diff chunks", {
      repository,
      prNumber: prNumberInt,
    });

    const result = await purgePRDiffChunks(repository, prNumberInt);

    routeLogger.info("PR diff chunks purged", {
      repository,
      prNumber: prNumberInt,
      deletedCount: result.deletedCount,
    });

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        repository,
        prNumber: prNumberInt,
        deletedCount: result.deletedCount,
        errors: result.errors,
      },
    });
  })
);

/**
 * DELETE /api/rag/doc/:parentId
 *
 * Purges a knowledge document and all its chunks.
 * Used when content is removed or needs to be re-ingested.
 */
router.delete(
  API_ROUTES.RAG_PURGE_DOC,
  asyncHandler(async (req, res) => {
    const { parentId } = req.params;

    if (!parentId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "parentId is required",
      });
      return;
    }

    routeLogger.info("Purging knowledge document", { parentId });

    const result = await purgeKnowledgeDocChunks(parentId);

    routeLogger.info("Knowledge document purged", {
      parentId,
      deletedCount: result.deletedCount,
    });

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      data: {
        parentId,
        deletedCount: result.deletedCount,
        errors: result.errors,
      },
    });
  })
);

export { router as ragRoutes };
