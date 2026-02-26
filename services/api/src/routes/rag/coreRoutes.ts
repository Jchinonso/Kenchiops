/**
 * RAG Core Routes - Ingest, Search, Stats, Sync
 *
 * @module routes/rag/coreRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  API_ROUTES,
  KNOWLEDGE_DOC_TYPES,
  ValidationError,
  getEffectiveTenantId,
  type KnowledgeDocType,
  ingestKnowledgeDoc,
  searchAll,
  syncDueSources,
  getKnowledgeDocCountsByType,
  getTenantRAGStats,
  type IngestKnowledgeDocInput,
  type SyncAllResult,
  type RAGTenantStats,
} from "@kenchi/shared";
import type {
  IngestRequestBody,
  SearchRequestBody,
  SyncRequestBody,
  DiffChunkResponse,
  KnowledgeDocResponse,
  TenantStatsResponse,
  IngestResponse,
  SearchResponse,
  StatsResponse,
  SyncResponse,
  DiffChunkSearchResult,
  KnowledgeDocSearchResult,
} from "./types.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Validation ====================

/** Pre-computed Set for O(1) doc type validation */
const VALID_DOC_TYPES: ReadonlySet<string> = new Set(Object.values(KNOWLEDGE_DOC_TYPES));

/** Type guard for valid document types */
const isValidDocType = (value: unknown): value is KnowledgeDocType =>
  typeof value === "string" && VALID_DOC_TYPES.has(value);

/** Validation rule: required and valid doc type */
const validateDocType = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return isValidDocType(fieldValue) || "Invalid document type";
};

/** Validation rule: required string */
const validateRequiredString = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return validators.string(fieldValue);
};

// ==================== Response Mappers ====================

/** Maps a diff chunk search result to response format */
const mapDiffChunkToResponse = (searchResult: DiffChunkSearchResult): DiffChunkResponse => ({
  id: searchResult.item.id,
  repository: searchResult.item.repository,
  filePath: searchResult.item.filePath,
  content: searchResult.item.content,
  similarity: searchResult.similarity,
});

/** Maps a knowledge doc search result to response format */
const mapKnowledgeDocToResponse = (
  searchResult: KnowledgeDocSearchResult
): KnowledgeDocResponse => ({
  id: searchResult.item.id,
  docType: searchResult.item.docType,
  title: searchResult.item.title,
  content: searchResult.item.content,
  similarity: searchResult.similarity,
});

/** Maps tenant RAG stats to response format */
const mapTenantStatsToResponse = (stats: RAGTenantStats): TenantStatsResponse => ({
  tenantId: stats.tenantId,
  diffChunkCount: stats.diffChunkCount,
  knowledgeDocCounts: stats.knowledgeDocCounts,
  pendingEmbeddings: stats.pendingEmbeddings,
  outdatedEmbeddings: stats.outdatedEmbeddings,
});

// ==================== Input Builders ====================

/** Builds IngestKnowledgeDocInput from request body, using authenticated tenantId */
const buildIngestInput = (body: IngestRequestBody, tenantId: string): IngestKnowledgeDocInput => ({
  docType: body.docType,
  title: body.title,
  content: body.content,
  tenantId,
  repository: body.repository,
  sourceUrl: body.sourceUrl,
  filePath: body.filePath,
  metadata: body.metadata,
});

// ==================== Response Builders ====================

/** Builds ingest response data */
const buildIngestResponse = (result: {
  readonly parentId: string | null;
  readonly chunksCreated: number;
  readonly chunksEmbedded: number;
  readonly success: boolean;
}): IngestResponse => ({
  documentId: result.parentId,
  chunksCreated: result.chunksCreated,
  chunksEmbedded: result.chunksEmbedded,
  success: result.success,
});

/** Builds search response data */
const buildSearchResponse = (results: {
  readonly diffChunks: readonly DiffChunkSearchResult[];
  readonly knowledgeDocs: readonly KnowledgeDocSearchResult[];
  readonly queryTokens: number;
  readonly cacheHit: boolean;
}): SearchResponse => ({
  diffChunks: results.diffChunks.map(mapDiffChunkToResponse),
  knowledgeDocs: results.knowledgeDocs.map(mapKnowledgeDocToResponse),
  queryTokens: results.queryTokens,
  cacheHit: results.cacheHit,
});

/** Builds stats response data */
const buildStatsResponse = (
  docCounts: Record<string, number>,
  tenantStats: RAGTenantStats | null
): StatsResponse => ({
  totalDocuments: Object.values(docCounts).reduce(
    (accumulator, documentCount) => accumulator + documentCount,
    0
  ),
  documentsByType: docCounts,
  tenantStats: tenantStats ? mapTenantStatsToResponse(tenantStats) : null,
});

/** Builds sync response data */
const buildSyncResponse = (result: SyncAllResult): SyncResponse => ({
  sourcesProcessed: result.sourcesProcessed,
  totalDocsIngested: result.totalDocsIngested,
  totalErrors: result.totalErrors,
  results: result.results,
});

// ==================== Route Handlers ====================

/**
 * Handles document ingestion requests.
 */
const handleIngest = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as IngestRequestBody;
  const startTime = Date.now();

  const input = buildIngestInput(body, req.context.tenantId);
  const result = await ingestKnowledgeDoc(input);

  logger.info("Document ingested", {
    docType: body.docType,
    title: body.title,
    contentLength: body.content.length,
    chunksCreated: result.chunksCreated,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: buildIngestResponse(result),
  });
};

/**
 * Handles RAG search requests.
 * Enforces tenant isolation: regular users are scoped to their own tenant,
 * admin/owner can specify a different tenant via body.
 */
const handleSearch = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as SearchRequestBody;
  const startTime = Date.now();

  const tenantId = getEffectiveTenantId(req);

  if (!tenantId && !req.user?.role) {
    throw new ValidationError("tenantId is required for unauthenticated searches");
  }

  const results = await searchAll({
    queryText: body.query,
    tenantId,
    repository: body.repository,
    topK: body.topK,
    minSimilarity: body.minSimilarity,
  });

  logger.info("RAG search completed", {
    queryLength: body.query.length,
    diffChunksFound: results.diffChunks.length,
    knowledgeDocsFound: results.knowledgeDocs.length,
    cacheHit: results.cacheHit,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildSearchResponse(results),
  });
};

/**
 * Handles RAG statistics requests.
 */
const handleStats = async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = req.context;

  const [docCounts, tenantStats] = await Promise.all([
    getKnowledgeDocCountsByType(),
    getTenantRAGStats(tenantId),
  ]);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildStatsResponse(docCounts, tenantStats),
  });
};

/**
 * Handles external source sync requests.
 */
const handleSync = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as SyncRequestBody;
  const startTime = Date.now();

  const result = await syncDueSources(
    { maxDocsPerSource: body.maxDocsPerSource, minCredibility: body.minCredibility },
    body.limit
  );

  logger.info("External source sync completed", {
    sourcesProcessed: result.sourcesProcessed,
    totalDocsIngested: result.totalDocsIngested,
    totalErrors: result.totalErrors,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildSyncResponse(result),
  });
};

// ==================== Route Definitions ====================

/** POST /api/rag/ingest - Ingest a knowledge document */
router.post(
  API_ROUTES.RAG_INGEST,
  validate({
    body: {
      docType: validateDocType,
      title: validateRequiredString,
      content: validateRequiredString,
    },
  }),
  asyncHandler(handleIngest)
);

/** POST /api/rag/search - Search for documents */
router.post(
  API_ROUTES.RAG_SEARCH,
  validate({
    body: {
      query: validateRequiredString,
    },
  }),
  asyncHandler(handleSearch)
);

/** GET /api/rag/stats - Get RAG statistics */
router.get(API_ROUTES.RAG_STATS, asyncHandler(handleStats));

/** POST /api/rag/sync - Sync external sources */
router.post(API_ROUTES.RAG_SYNC, asyncHandler(handleSync));

export { router as ragCoreRoutes };
