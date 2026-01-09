/**
 * RAG Core Routes - Ingest, Search, Stats, Sync
 *
 * @module routes/rag/coreRoutes
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
  type IngestKnowledgeDocInput,
  type SyncAllResult,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Types ====================

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

interface SearchRequestBody {
  readonly query: string;
  readonly tenantId?: string;
  readonly repository?: string;
  readonly topK?: number;
  readonly minSimilarity?: number;
}

interface SyncRequestBody {
  readonly maxDocsPerSource?: number;
  readonly minCredibility?: number;
  readonly limit?: number;
}

// ==================== Validation ====================

const isValidDocType = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }
  return Object.values(KNOWLEDGE_DOC_TYPES).includes(value as KnowledgeDocType);
};

// ==================== Routes ====================

/**
 * POST /api/rag/ingest - Ingest a knowledge document
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

    logger.info("Ingesting document", {
      docType: body.docType,
      title: body.title,
      contentLength: body.content.length,
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
 * POST /api/rag/search - Search for documents
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

    logger.info("RAG search request", { queryLength: body.query.length });

    const results = await searchAll({
      queryText: body.query,
      tenantId: body.tenantId,
      repository: body.repository,
      topK: body.topK,
      minSimilarity: body.minSimilarity,
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
 * GET /api/rag/stats - Get RAG statistics
 */
router.get(
  API_ROUTES.RAG_STATS,
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;

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
 * POST /api/rag/sync - Sync external sources
 */
router.post(
  API_ROUTES.RAG_SYNC,
  asyncHandler(async (req, res) => {
    const body = req.body as SyncRequestBody;

    logger.info("Starting external source sync", { limit: body.limit });

    const result: SyncAllResult = await syncDueSources(
      { maxDocsPerSource: body.maxDocsPerSource, minCredibility: body.minCredibility },
      body.limit
    );

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

export { router as ragCoreRoutes };
