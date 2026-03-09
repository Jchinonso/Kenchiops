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
  rateLimitByCategory,
  requirePermission,
  type KnowledgeDocType,
  ingestKnowledgeDoc,
  searchAll,
  syncDueSources,
  getKnowledgeDocCountsByTypeForTenant,
  getKnowledgeDocsByTenant,
  getTenantRAGStats,
  type IngestKnowledgeDocInput,
  type SyncAllResult,
  type RAGTenantStats,
  type KnowledgeDocRecord,
} from "@kenchi/shared";
import type {
  IngestRequestBody,
  SearchRequestBody,
  SyncRequestBody,
  DiffChunkResponse,
  KnowledgeDocResponse,
  KnowledgeDocListItemResponse,
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

/** SECURITY (VULN-707): Maximum content length for ingestion to prevent DoS and cost abuse */
const INGEST_MAX_CONTENT_LENGTH = 100_000;

/** Validation rule: required string with max length for content */
const validateContent = (fieldValue: unknown): boolean | string => {
  const stringResult = validateRequiredString(fieldValue);
  if (stringResult !== true) {
    return stringResult;
  }
  return typeof fieldValue === "string" && fieldValue.length <= INGEST_MAX_CONTENT_LENGTH
    ? true
    : `Content must not exceed ${INGEST_MAX_CONTENT_LENGTH} characters`;
};

/** SECURITY (VULN-H01): Validation for optional ingest fields */
const OPTIONAL_URL_MAX_LENGTH = 2048;
const OPTIONAL_STRING_MAX_LENGTH = 500;
const INGEST_MAX_TITLE_LENGTH = 500;

const validateOptionalUrl = (fieldValue: unknown): boolean | string => {
  if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
    return true;
  }
  if (typeof fieldValue !== "string") {
    return "Must be a string";
  }
  if (fieldValue.length > OPTIONAL_URL_MAX_LENGTH) {
    return `URL must not exceed ${OPTIONAL_URL_MAX_LENGTH} characters`;
  }
  try {
    const { protocol } = new URL(fieldValue);
    return protocol === "https:" || protocol === "http:"
      ? true
      : "URL must use https or http protocol";
  } catch {
    return "Invalid URL format";
  }
};

const validateOptionalString = (fieldValue: unknown): boolean | string => {
  if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
    return true;
  }
  if (typeof fieldValue !== "string") {
    return "Must be a string";
  }
  return fieldValue.length <= OPTIONAL_STRING_MAX_LENGTH
    ? true
    : `Must not exceed ${OPTIONAL_STRING_MAX_LENGTH} characters`;
};

const validateOptionalRepository = (fieldValue: unknown): boolean | string => {
  const stringResult = validateOptionalString(fieldValue);
  if (stringResult !== true) {
    return stringResult;
  }
  if (typeof fieldValue === "string" && fieldValue.length > 0) {
    if (fieldValue.includes("..") || fieldValue.includes("%")) {
      return "Repository must not contain path traversal sequences";
    }
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(fieldValue)) {
      return "Repository must be in owner/repo format";
    }
  }
  return true;
};

const validateOptionalFilePath = (fieldValue: unknown): boolean | string => {
  const stringResult = validateOptionalString(fieldValue);
  if (stringResult !== true) {
    return stringResult;
  }
  if (typeof fieldValue === "string" && fieldValue.length > 0) {
    if (fieldValue.includes("..")) {
      return "File path must not contain path traversal sequences";
    }
  }
  return true;
};

const validateTitle = (fieldValue: unknown): boolean | string => {
  const stringResult = validateRequiredString(fieldValue);
  if (stringResult !== true) {
    return stringResult;
  }
  return typeof fieldValue === "string" && fieldValue.length <= INGEST_MAX_TITLE_LENGTH
    ? true
    : `Title must not exceed ${INGEST_MAX_TITLE_LENGTH} characters`;
};

/** SECURITY (VULN-M02): Metadata validation to prevent prototype pollution and DoS */
const FORBIDDEN_METADATA_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const METADATA_MAX_SIZE = 10_000;
const METADATA_MAX_KEYS = 50;

const validateMetadata = (fieldValue: unknown): boolean | string => {
  if (fieldValue === undefined || fieldValue === null) {
    return true;
  }
  if (typeof fieldValue !== "object" || Array.isArray(fieldValue)) {
    return "Metadata must be a plain object";
  }
  const keys = Object.keys(fieldValue as Record<string, unknown>);
  if (keys.length > METADATA_MAX_KEYS) {
    return `Metadata must not exceed ${METADATA_MAX_KEYS} keys`;
  }
  if (keys.some((key) => FORBIDDEN_METADATA_KEYS.has(key))) {
    return "Metadata contains forbidden keys";
  }
  try {
    const serialized = JSON.stringify(fieldValue);
    if (serialized.length > METADATA_MAX_SIZE) {
      return `Metadata must not exceed ${METADATA_MAX_SIZE} characters when serialized`;
    }
  } catch {
    return "Metadata must be JSON-serializable";
  }
  return true;
};

/** SECURITY (VULN-H03): Validators for sync route parameters */
const validateOptionalPositiveInt =
  (max: number) =>
  (fieldValue: unknown): boolean | string => {
    if (fieldValue === undefined || fieldValue === null) {
      return true;
    }
    if (typeof fieldValue !== "number" || !Number.isInteger(fieldValue)) {
      return "Must be an integer";
    }
    return fieldValue >= 1 && fieldValue <= max ? true : `Must be between 1 and ${max}`;
  };

const validateOptionalCredibility = (fieldValue: unknown): boolean | string => {
  if (fieldValue === undefined || fieldValue === null) {
    return true;
  }
  if (typeof fieldValue !== "number") {
    return "Must be a number";
  }
  return fieldValue >= 0 && fieldValue <= 1 ? true : "Must be between 0 and 1";
};

// ==================== Pagination Config ====================

const DOCUMENTS_PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0,
  /** SECURITY (VULN-702): Cap offset to prevent sequential scan DoS */
  MAX_OFFSET: 10_000,
  CONTENT_PREVIEW_LENGTH: 200,
} as const;

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

/** Maps a knowledge doc record to a list item response DTO */
const mapDocToListItem = (doc: KnowledgeDocRecord): KnowledgeDocListItemResponse => ({
  id: doc.id,
  docType: doc.docType,
  title: doc.title,
  content:
    doc.content.length > DOCUMENTS_PAGINATION.CONTENT_PREVIEW_LENGTH
      ? `${doc.content.slice(0, DOCUMENTS_PAGINATION.CONTENT_PREVIEW_LENGTH)}...`
      : doc.content,
  repository: doc.repository,
  sourceUrl: doc.sourceUrl,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
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
 * SECURITY (VULN-701): Uses tenant-scoped doc counts, not global counts,
 * to prevent cross-tenant information disclosure.
 */
const handleStats = async (req: Request, res: Response): Promise<void> => {
  const { tenantId } = req.context;

  const [docCounts, tenantStats] = await Promise.all([
    getKnowledgeDocCountsByTypeForTenant(tenantId),
    getTenantRAGStats(tenantId),
  ]);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildStatsResponse(docCounts, tenantStats),
  });
};

/**
 * Handles knowledge document listing requests.
 * Scoped to the authenticated tenant.
 */
const handleListDocuments = async (req: Request, res: Response): Promise<void> => {
  const tenantId = getEffectiveTenantId(req);
  if (!tenantId) {
    throw new ValidationError("tenantId is required");
  }

  const docType = typeof req.query.docType === "string" ? req.query.docType : undefined;
  if (docType !== undefined && !isValidDocType(docType)) {
    throw new ValidationError("Invalid document type filter");
  }

  const rawLimit =
    typeof req.query.limit === "string"
      ? parseInt(req.query.limit, 10)
      : DOCUMENTS_PAGINATION.DEFAULT_LIMIT;
  const rawOffset =
    typeof req.query.offset === "string"
      ? parseInt(req.query.offset, 10)
      : DOCUMENTS_PAGINATION.DEFAULT_OFFSET;

  const limit = Math.min(
    Math.max(1, Number.isNaN(rawLimit) ? DOCUMENTS_PAGINATION.DEFAULT_LIMIT : rawLimit),
    DOCUMENTS_PAGINATION.MAX_LIMIT
  );
  const offset = Math.min(
    Math.max(0, Number.isNaN(rawOffset) ? DOCUMENTS_PAGINATION.DEFAULT_OFFSET : rawOffset),
    DOCUMENTS_PAGINATION.MAX_OFFSET
  );

  const result = await getKnowledgeDocsByTenant(tenantId, {
    docType: docType as KnowledgeDocType | undefined,
    limit,
    offset,
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      items: result.items.map(mapDocToListItem),
      total: result.total,
    },
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
// SECURITY (VULN-509): Rate limit all RAG endpoints to prevent DoS and cost abuse
router.post(
  API_ROUTES.RAG_INGEST,
  rateLimitByCategory("expensive"),
  validate({
    body: {
      docType: validateDocType,
      title: validateTitle,
      content: validateContent,
      sourceUrl: validateOptionalUrl,
      repository: validateOptionalRepository,
      filePath: validateOptionalFilePath,
      metadata: validateMetadata,
    },
  }),
  asyncHandler(handleIngest)
);

/** POST /api/rag/search - Search for documents */
router.post(
  API_ROUTES.RAG_SEARCH,
  rateLimitByCategory("standard"),
  validate({
    body: {
      query: validateRequiredString,
    },
  }),
  asyncHandler(handleSearch)
);

/** GET /api/rag/stats - Get RAG statistics */
router.get(API_ROUTES.RAG_STATS, rateLimitByCategory("readonly"), asyncHandler(handleStats));

/** GET /api/rag/documents - List knowledge documents for the authenticated tenant */
router.get(
  API_ROUTES.RAG_DOCUMENTS,
  rateLimitByCategory("readonly"),
  asyncHandler(handleListDocuments)
);

/** POST /api/rag/sync - Sync external sources */
router.post(
  API_ROUTES.RAG_SYNC,
  requirePermission("settings"),
  rateLimitByCategory("expensive"),
  validate({
    body: {
      limit: validateOptionalPositiveInt(50),
      maxDocsPerSource: validateOptionalPositiveInt(100),
      minCredibility: validateOptionalCredibility,
    },
  }),
  asyncHandler(handleSync)
);

export { router as ragCoreRoutes };
