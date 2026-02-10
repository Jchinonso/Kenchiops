/**
 * RAG Routes Type Definitions
 *
 * Request/response types for RAG API endpoints.
 *
 * @module routes/rag/types
 */

import type { KnowledgeDocType } from "@kenchi/shared";

// ==================== Request Types ====================

/** Request body for document ingestion */
export interface IngestRequestBody {
  readonly docType: KnowledgeDocType;
  readonly title: string;
  readonly content: string;
  readonly tenantId?: string;
  readonly repository?: string;
  readonly sourceUrl?: string;
  readonly filePath?: string;
  readonly metadata?: Record<string, unknown>;
}

/** Request body for RAG search */
export interface SearchRequestBody {
  readonly query: string;
  readonly tenantId?: string;
  readonly repository?: string;
  readonly topK?: number;
  readonly minSimilarity?: number;
}

/** Request body for external source sync */
export interface SyncRequestBody {
  readonly maxDocsPerSource?: number;
  readonly minCredibility?: number;
  readonly limit?: number;
}

// ==================== Response Types ====================

/** Response shape for diff chunk search results */
export interface DiffChunkResponse {
  readonly id: string;
  readonly repository: string;
  readonly filePath: string;
  readonly content: string;
  readonly similarity: number;
}

/** Response shape for knowledge doc search results */
export interface KnowledgeDocResponse {
  readonly id: string;
  readonly docType: string;
  readonly title: string;
  readonly content: string;
  readonly similarity: number;
}

/** Response shape for tenant RAG statistics */
export interface TenantStatsResponse {
  readonly tenantId: string;
  readonly diffChunkCount: number;
  readonly knowledgeDocCounts: Record<string, number>;
  readonly pendingEmbeddings: number;
  readonly outdatedEmbeddings: number;
}

/** Response shape for document ingestion result */
export interface IngestResponse {
  readonly documentId: string | null;
  readonly chunksCreated: number;
  readonly chunksEmbedded: number;
  readonly success: boolean;
}

/** Response shape for RAG search result */
export interface SearchResponse {
  readonly diffChunks: readonly DiffChunkResponse[];
  readonly knowledgeDocs: readonly KnowledgeDocResponse[];
  readonly queryTokens: number;
  readonly cacheHit: boolean;
}

/** Response shape for RAG statistics */
export interface StatsResponse {
  readonly totalDocuments: number;
  readonly documentsByType: Record<string, number>;
  readonly tenantStats: TenantStatsResponse | null;
}

/** Response shape for external source sync result */
export interface SyncResponse {
  readonly sourcesProcessed: number;
  readonly totalDocsIngested: number;
  readonly totalErrors: number;
  readonly results: readonly unknown[];
}

// ==================== Search Result Types ====================

/** Shape of diff chunk search result from searchAll */
export interface DiffChunkSearchResult {
  readonly item: {
    readonly id: string;
    readonly repository: string;
    readonly filePath: string;
    readonly content: string;
  };
  readonly similarity: number;
}

/** Shape of knowledge doc search result from searchAll */
export interface KnowledgeDocSearchResult {
  readonly item: {
    readonly id: string;
    readonly docType: string;
    readonly title: string;
    readonly content: string;
  };
  readonly similarity: number;
}

// ==================== Health Routes Types ====================

/** Response shape for cleanup operation */
export interface CleanupResponse {
  readonly diffChunksDeleted: number;
  readonly knowledgeDocsDeleted: number;
  readonly diffChunksMarkedStale: number;
  readonly knowledgeDocsMarkedStale: number;
}

// ==================== Drift Routes Types ====================

/** Request body for test suite execution */
export interface TestSuiteRequestBody {
  readonly tenantId?: string;
}

/** Request body for drift detection with alerts */
export interface DriftDetectionRequestBody {
  readonly tenantId?: string;
  readonly skipAlertDispatch?: boolean;
}

/** Request body for metric bounds check */
export interface CheckMetricRequestBody {
  readonly metricType: string;
  readonly currentValue: number;
  readonly tenantId?: string;
}

/** Request body for re-embedding trigger */
export interface ReembedRequestBody {
  readonly tenantId?: string;
  readonly batchSize?: number;
}

/** Request body for test case seeding */
export interface SeedTestCasesRequestBody {
  readonly tenantId?: string;
}

/** Request body for relationship detection */
export interface DetectRelationshipsRequestBody {
  readonly docId: string;
  readonly docType: string;
  readonly title: string;
  readonly content: string;
  readonly repository?: string;
  readonly filePath?: string;
  readonly tenantId?: string;
}

/** Response shape for drift detection with alerts */
export interface DriftDetectionResponse {
  readonly report: unknown;
  readonly alertsDispatched: number;
  readonly dispatchErrors: number;
}

/** Response shape for metric bounds check */
export interface CheckMetricResponse {
  readonly metricType: string;
  readonly currentValue: number;
  readonly withinBounds: boolean;
  readonly deviation: number;
  readonly threshold: number;
}

/** Response shape for stale documents query */
export interface StaleDocumentsResponse {
  readonly diffChunkCount: number;
  readonly knowledgeDocCount: number;
  readonly diffChunks: readonly unknown[];
  readonly knowledgeDocs: readonly unknown[];
}

/** Response shape for re-embedding operation */
export interface ReembedResponse {
  readonly processedCount: number;
  readonly errors: readonly string[];
}

/** Response shape for test case seeding */
export interface SeedTestCasesResponse {
  readonly created: number;
  readonly skipped: number;
  readonly categories: readonly string[];
  readonly errors: readonly string[];
}

/** Response shape for relationship detection */
export interface DetectRelationshipsResponse {
  readonly detected: number;
  readonly created: number;
  readonly errors: readonly string[];
}

// ==================== Cost Routes Types ====================

/** Request body for tenant tier config update */
export interface UpdateTierConfigRequestBody {
  readonly preferredTier?: string;
  readonly monthlyBudgetUsd?: number;
  readonly allowPremium?: boolean;
  readonly degradeOnBudgetWarning?: boolean;
}

/** Request body for cache clear operation */
export interface CacheClearRequestBody {
  readonly expiredOnly?: boolean;
}

/** Request body for cost estimation */
export interface CostEstimateRequestBody {
  readonly tokenCount: number;
  readonly tier?: string;
  readonly dailyTokens?: number;
  readonly monthlyBudget?: number;
}

/** Response shape for cache clear operation */
export interface CacheClearResponse {
  readonly cleared?: number;
  readonly type: "expired" | "full";
}

/** Response shape for cost estimation */
export interface CostEstimateResponse {
  readonly tokenCount: number;
  readonly tier: string;
  readonly estimatedCostUsd: number;
  readonly monthlyProjection?: number;
  readonly recommendation?: unknown;
}

/** Response shape for cost stats query */
export interface CostStatsResponse {
  readonly tenantId: string;
  readonly tierConfig: unknown;
  readonly cacheStats: unknown;
}

// ==================== Purge Routes Types ====================

/** Response shape for purge operations */
export interface PurgeResponse {
  readonly deletedCount: number;
  readonly errors: readonly string[];
}

/** Response shape for tenant purge */
export interface TenantPurgeResponse extends PurgeResponse {
  readonly tenantId: string;
}

/** Response shape for PR purge */
export interface PRPurgeResponse extends PurgeResponse {
  readonly repository: string;
  readonly prNumber: number;
}

/** Response shape for document purge */
export interface DocPurgeResponse extends PurgeResponse {
  readonly parentId: string;
}
