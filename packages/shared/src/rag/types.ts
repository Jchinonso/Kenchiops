/**
 * RAG Module Types
 *
 * Type definitions for RAG search queries and results.
 *
 * @module rag/types
 */

import type {
  DiffChunk,
  VectorSearchResult,
  MetricBaseline,
  BudgetStatus,
} from "../database/index.js";
import type { KnowledgeDocRecord } from "../database/knowledgeDoc/types.js";
import type {
  EmbeddingTierName,
  KnowledgeDocType,
  RAGMetricType,
  RelationshipType,
  ExternalSourceType,
  TechStackTag,
} from "../constants/index.js";
import type { ExternalSource } from "../database/externalSource/types.js";
import type { AnalyzedFailure } from "../aggregation/types.js";

// ==================== Search Query Types ====================

/**
 * Search query input with optional filters.
 */
export interface SearchQuery {
  readonly queryText: string;
  readonly tenantId?: string;
  readonly repository?: string;
  readonly topK?: number;
  readonly minSimilarity?: number;
  /** Enable reranking for knowledge docs (default: true) */
  readonly enableReranking?: boolean;
  /** Workflow name for metadata boost */
  readonly workflow?: string;
  /** Error signature for metadata boost */
  readonly errorSignature?: string;
}

/**
 * Search query for diff chunks with PR-specific filters.
 */
export interface DiffSearchQuery extends SearchQuery {
  readonly prNumber?: number;
  readonly filePath?: string;
}

/**
 * Search query for knowledge docs with doc-type filters.
 */
export interface KnowledgeSearchQuery extends SearchQuery {
  readonly docType?: string;
  /** Enable reranking with deterministic scoring formula */
  readonly enableReranking?: boolean;
  /** Workflow name for metadata boost */
  readonly workflow?: string;
  /** Error signature for metadata boost */
  readonly errorSignature?: string;
}

/**
 * Combined search result with source type.
 */
export interface RAGSearchResult {
  readonly diffChunks: ReadonlyArray<VectorSearchResult<DiffChunk>>;
  readonly knowledgeDocs: ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>;
  readonly queryTokens: number;
  readonly cacheHit: boolean;
}

// ==================== Evaluation Types ====================

/**
 * RAG relevance feedback from user.
 */
export type RAGRelevance = "helpful" | "not_helpful" | "partially_helpful";

/**
 * Input for recording RAG feedback.
 */
export interface RAGFeedbackInput {
  readonly analysisId: string;
  readonly knowledgeDocId: string;
  readonly relevance: RAGRelevance;
  readonly retrievalSimilarity: number;
  readonly retrievalRank: number;
  readonly userId: string;
  readonly slackChannel?: string;
  readonly slackMessageTs?: string;
}

/**
 * Aggregated RAG metrics for a time period.
 */
export interface RAGEvaluationMetrics {
  readonly totalFeedback: number;
  readonly helpfulCount: number;
  readonly notHelpfulCount: number;
  readonly partiallyHelpfulCount: number;
  readonly helpfulRate: number;
  readonly recallAtK: Record<number, number>;
  readonly mrr: number;
  readonly averageSimilarity: number;
  readonly timestamp: string;
}

/**
 * Retrieval result for metrics calculation.
 */
export interface RetrievalResult {
  readonly docId: string;
  readonly similarity: number;
  readonly rank: number;
  readonly isRelevant: boolean;
}

/**
 * Ground truth for regression testing.
 */
export interface RAGTestCase {
  readonly testId: string;
  readonly queryText: string;
  readonly expectedDocIds: readonly string[];
  readonly repository?: string;
  readonly eventType?: string;
}

/**
 * Result of running a RAG test case.
 */
export interface RAGTestResult {
  readonly testId: string;
  readonly passed: boolean;
  readonly recallAt1: number;
  readonly recallAt3: number;
  readonly recallAt5: number;
  readonly retrievedDocIds: readonly string[];
}

/**
 * Result of recording feedback.
 */
export interface FeedbackResult {
  readonly success: boolean;
  readonly error?: string;
}

// ==================== Reranker Types ====================

/**
 * Search result item for reranking.
 */
export interface RerankableResult {
  readonly id: string;
  readonly similarity: number;
  readonly docType: string;
  readonly content: string;
  readonly createdAt?: string;
  readonly metadata?: {
    readonly repository?: string;
    readonly workflow?: string;
    readonly errorSignature?: string;
    readonly language?: string;
    readonly hitCount?: number;
    readonly helpfulRate?: number;
    readonly negativeFeedbackCount?: number;
  };
}

/**
 * Query context for metadata matching.
 */
export interface QueryContext {
  readonly repository?: string;
  readonly workflow?: string;
  readonly errorSignature?: string;
  readonly language?: string;
}

/**
 * Reranked result with scoring breakdown.
 */
export interface RerankedResult {
  readonly result: RerankableResult;
  readonly finalScore: number;
  readonly scoreBreakdown: {
    readonly vectorScore: number;
    readonly reliabilityScore: number;
    readonly recencyScore: number;
    readonly feedbackScore: number;
    readonly metadataBoost: number;
  };
}

/**
 * Reranking options.
 */
export interface RerankOptions {
  /** Query context for metadata matching */
  readonly queryContext?: QueryContext;
  /** Maximum results to return */
  readonly topK?: number;
  /** Minimum final score threshold */
  readonly minScore?: number;
}

// ==================== Streaming Updates Types ====================

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

// ==================== Governance Types ====================

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

// ==================== Alert Dispatcher Types ====================

/**
 * Result of dispatching an alert
 */
export interface AlertDispatchResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly error?: string;
}

/**
 * Result of dispatching multiple alerts
 */
export interface BatchAlertDispatchResult {
  readonly total: number;
  readonly successful: number;
  readonly failed: number;
  readonly results: readonly AlertDispatchResult[];
}

/**
 * Options for alert dispatch
 */
export interface AlertDispatchOptions {
  readonly tenantId?: string;
  readonly repository?: string;
}

// ==================== Test Case Seeding Types ====================

/**
 * Result of seeding operation.
 */
export interface SeedTestCasesResult {
  readonly success: boolean;
  readonly created: number;
  readonly skipped: number;
  readonly errors: readonly string[];
}

// ==================== Drift Detection Types ====================

/**
 * Test suite execution result.
 */
export interface TestSuiteResult {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly avgRecall: number;
  readonly avgMRR: number;
  readonly duration: number;
  readonly testResults: readonly TestCaseResult[];
}

/**
 * Single test case result.
 */
export interface TestCaseResult {
  readonly testCaseId: string;
  readonly name: string;
  readonly passed: boolean;
  readonly recall: number;
  readonly mrr: number;
  readonly retrievedDocIds: readonly string[];
  readonly skipped?: boolean;
  readonly skipReason?: string;
  readonly missingDocIds?: readonly string[];
  readonly error?: string;
}

/**
 * Drift report for monitoring.
 */
export interface DriftReport {
  readonly timestamp: string;
  readonly overallHealth: HealthStatus;
  readonly metrics: readonly DriftMetricReport[];
  readonly alerts: readonly DriftAlert[];
  readonly baselines: readonly MetricBaseline[];
}

/**
 * Health status values.
 */
export type HealthStatus = "healthy" | "degraded" | "critical";

/**
 * Alert severity values.
 */
export type AlertSeverity = "warning" | "critical";

/**
 * Metric status values.
 */
export type MetricStatus = "ok" | "warning" | "alert";

/**
 * Metric trend values.
 */
export type MetricTrend = "improving" | "stable" | "degrading";

/**
 * Individual metric drift report.
 */
export interface DriftMetricReport {
  readonly metricType: RAGMetricType;
  readonly currentValue: number;
  readonly baselineValue: number;
  readonly deviationPercent: number;
  readonly status: MetricStatus;
  readonly trend: MetricTrend;
}

/**
 * Drift alert for notifications.
 */
export interface DriftAlert {
  readonly severity: AlertSeverity;
  readonly metricType: RAGMetricType;
  readonly message: string;
  readonly deviationPercent: number;
}

/**
 * Result of running drift detection with alert dispatch.
 */
export interface DriftDetectionWithAlertsResult {
  readonly report: DriftReport;
  readonly alertsDispatched: number;
  readonly dispatchErrors: number;
}

/**
 * Metric bounds check result.
 */
export interface MetricBoundsResult {
  readonly withinBounds: boolean;
  readonly deviation: number;
  readonly threshold: number;
}

/**
 * Metric alert threshold configuration.
 */
export interface MetricAlertThreshold {
  readonly metricType: RAGMetricType;
  readonly warningThreshold: number;
  readonly criticalThreshold: number;
  readonly higherIsBetter: boolean;
}

// ==================== Multi-Hop Types ====================

/**
 * Graph node representing a document with path information.
 */
export interface GraphNode {
  readonly docId: string;
  readonly hopDepth: number;
  readonly pathStrength: number;
  readonly relationshipType: RelationshipType;
}

/**
 * Multi-hop search result combining document with graph metadata.
 */
export interface MultiHopResult {
  readonly doc: KnowledgeDocRecord;
  readonly hopDepth: number;
  readonly pathStrength: number;
  readonly relationshipChain: readonly RelationshipType[];
}

/**
 * Options for multi-hop traversal.
 */
export interface MultiHopOptions {
  readonly maxDepth?: number;
  readonly minStrength?: number;
  readonly maxResults?: number;
}

/**
 * State for BFS traversal.
 */
export interface TraversalState {
  readonly visited: Set<string>;
  readonly nodes: readonly GraphNode[];
}

/**
 * Queue item for BFS processing.
 */
export interface QueueItem {
  readonly docId: string;
  readonly depth: number;
  readonly pathStrength: number;
  readonly relationshipChain: readonly RelationshipType[];
}

/**
 * Path reconstruction result.
 */
export interface PathResult {
  readonly path: readonly string[];
  readonly relationships: readonly RelationshipType[];
  readonly totalStrength: number;
}

/**
 * Entry in the BFS path map, tracking how we reached each node.
 */
export interface PathMapEntry {
  readonly prev: string;
  readonly type: RelationshipType;
  readonly strength: number;
}

/**
 * Item in BFS level queue for path finding.
 */
export interface PathLevelItem {
  readonly docId: string;
  readonly depth: number;
}

// ==================== Chunking Core Types ====================

/**
 * Metadata attached to each chunk for retrieval context.
 */
export interface ChunkMetadata {
  /** Zero-based index of this chunk within the source */
  readonly chunkIndex: number;
  /** Total number of chunks from the source */
  readonly totalChunks: number;
  /** Starting character offset in original text */
  readonly startOffset: number;
  /** Ending character offset in original text */
  readonly endOffset: number;
  /** Estimated token count for this chunk */
  readonly estimatedTokens: number;
}

/**
 * A single text chunk with metadata.
 */
export interface TextChunk {
  /** The chunk content */
  readonly content: string;
  /** Chunk metadata for retrieval context */
  readonly metadata: ChunkMetadata;
}

/**
 * Configuration for the chunking operation.
 */
export interface ChunkingOptions {
  /** Target token count per chunk */
  readonly targetTokens?: number;
  /** Minimum token count per chunk */
  readonly minTokens?: number;
  /** Maximum token count per chunk */
  readonly maxTokens?: number;
  /** Overlap ratio between adjacent chunks (0.0 to 0.5) */
  readonly overlapRatio?: number;
}

/**
 * Internal state for recursive chunking.
 */
export interface ChunkingState {
  readonly text: string;
  readonly currentPos: number;
  readonly chunks: readonly TextChunk[];
  readonly targetChars: number;
  readonly overlapChars: number;
  readonly searchRadius: number;
  readonly minChars: number;
}

// ==================== Chunking Result Types ====================

/**
 * Result of a diff chunking operation.
 */
export interface DiffChunkResult {
  /** The chunked content */
  readonly chunks: readonly TextChunk[];
  /** Original file path */
  readonly filePath: string;
  /** Hunk header if available */
  readonly hunkHeader: string | null;
}

/**
 * Result of a knowledge document chunking operation.
 */
export interface KnowledgeChunkResult {
  /** The chunked content */
  readonly chunks: readonly TextChunk[];
  /** Document title */
  readonly title: string;
  /** Document type */
  readonly docType: string;
}

/**
 * Markdown section with header and content.
 */
export interface MarkdownSection {
  readonly header: string;
  readonly content: string;
  readonly level: number;
}

// ==================== Chunking Strategy Types ====================

/**
 * Chunking strategy configuration.
 */
export interface ChunkingStrategy {
  /** Target tokens per chunk */
  readonly targetTokens: number;
  /** Minimum tokens per chunk */
  readonly minTokens: number;
  /** Maximum tokens per chunk */
  readonly maxTokens: number;
  /** Overlap ratio between chunks */
  readonly overlapRatio: number;
  /** Whether to preserve sections (for structured docs) */
  readonly preserveSections: boolean;
  /** Whether to keep as atomic unit (small docs) */
  readonly atomicUnit: boolean;
  /** Maximum tokens before forcing chunking (for atomic units) */
  readonly atomicMaxTokens: number;
  /** Context prefix template */
  readonly contextTemplate: string;
}

// ==================== Doc-Type Chunking Types ====================

/**
 * Result of doc-type-specific chunking.
 */
export interface DocTypeChunkResult {
  readonly chunks: readonly TextChunk[];
  readonly docType: string;
  readonly strategy: string;
  readonly metadata: {
    readonly originalLength: number;
    readonly chunkCount: number;
    readonly preservedSections: boolean;
  };
}

// ==================== Ingestion Types ====================

/**
 * Input for ingesting a PR diff.
 */
export interface IngestDiffInput {
  readonly repository: string;
  readonly prNumber: number;
  readonly commitSha: string;
  readonly diffContent: string;
  readonly filePath: string;
  readonly hunkHeader?: string;
  readonly tenantId?: string;
}

/**
 * Result of diff ingestion.
 */
export interface IngestDiffResult {
  readonly success: boolean;
  readonly chunksCreated: number;
  readonly chunksEmbedded: number;
  readonly errors: readonly string[];
}

/**
 * Input for ingesting a knowledge document.
 */
export interface IngestKnowledgeDocInput {
  readonly docType: KnowledgeDocType;
  readonly title: string;
  readonly content: string;
  readonly repository?: string;
  readonly sourceUrl?: string;
  readonly filePath?: string;
  readonly tenantId?: string;
  readonly metadata?: Record<string, unknown>;
  /** If true, automatically detect and create relationships after ingestion */
  readonly detectRelationships?: boolean;
}

/**
 * Result of knowledge doc ingestion.
 */
export interface IngestKnowledgeDocResult {
  readonly success: boolean;
  readonly chunksCreated: number;
  readonly chunksEmbedded: number;
  readonly parentId: string | null;
  readonly errors: readonly string[];
  readonly validationWarnings: readonly string[];
  /** Number of relationships detected (if detectRelationships was enabled) */
  readonly relationshipsDetected?: number;
  /** Number of relationships created (if detectRelationships was enabled) */
  readonly relationshipsCreated?: number;
}

// ==================== Metrics Types ====================

/**
 * Embedding operation metrics.
 */
export interface EmbeddingMetrics {
  readonly totalOperations: number;
  readonly totalTokens: number;
  readonly totalErrors: number;
  readonly averageLatencyMs: number;
  readonly operationsPerMinute: number;
  readonly estimatedCostUsd: number;
}

/**
 * Ingestion operation metrics.
 */
export interface IngestionMetrics {
  readonly diffChunksCreated: number;
  readonly diffChunksEmbedded: number;
  readonly diffIngestionErrors: number;
  readonly knowledgeDocsCreated: number;
  readonly knowledgeDocsEmbedded: number;
  readonly knowledgeIngestionErrors: number;
}

/**
 * Combined RAG metrics snapshot.
 */
export interface RAGMetricsSnapshot {
  readonly embedding: EmbeddingMetrics;
  readonly ingestion: IngestionMetrics;
  readonly timestamp: string;
  readonly windowMinutes: number;
}

// ==================== Cost Control Types ====================

/**
 * Embedding tier selection result.
 */
export interface TierSelectionResult {
  readonly selectedTier: EmbeddingTierName;
  readonly model: string;
  readonly dimension: number;
  readonly reason: string;
  readonly budgetStatus: BudgetStatus;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}

/**
 * Tiered embedding configuration for a tenant.
 */
export interface TenantTierConfig {
  readonly tenantId: string;
  readonly preferredTier: EmbeddingTierName;
  readonly monthlyBudgetUsd: number;
  readonly degradeOnBudgetWarning: boolean;
  readonly allowPremium: boolean;
}

// ==================== Budget-Aware Embedding Types ====================

/**
 * Options for budget-aware embedding generation.
 */
export interface BudgetAwareEmbeddingOptions {
  readonly tenantId: string;
  readonly text: string;
  /** If true, throws when budget exceeded. Otherwise, uses LIGHT tier. */
  readonly blockOnBudgetExceeded?: boolean;
}

/**
 * Options for batch budget-aware embedding generation.
 */
export interface BatchBudgetAwareEmbeddingOptions {
  readonly tenantId: string;
  readonly texts: readonly string[];
  /** If true, throws when budget exceeded. Otherwise, uses LIGHT tier. */
  readonly blockOnBudgetExceeded?: boolean;
}

/**
 * Budget-aware embedding result with tier selection info.
 */
export interface BudgetAwareEmbeddingResult {
  readonly embedding: readonly number[];
  readonly tokenCount: number;
  readonly model: string;
  readonly tier: EmbeddingTierName;
  readonly dimension: number;
  readonly tierSelectionReason: string;
  readonly budgetStatus: BudgetStatus;
}

/**
 * Budget-aware batch embedding result.
 */
export interface BatchBudgetAwareEmbeddingResult {
  readonly embeddings: ReadonlyArray<readonly number[]>;
  readonly totalTokens: number;
  readonly model: string;
  readonly tier: EmbeddingTierName;
  readonly dimension: number;
  readonly tierSelectionReason: string;
  readonly budgetStatus: BudgetStatus;
}

// ==================== Search Helper Types ====================

/**
 * Query construction input from event context.
 */
export interface EventQueryContext {
  readonly eventType: string;
  readonly repository: string;
  readonly errorMessage?: string;
  readonly failureSummary?: string;
  readonly affectedFiles?: readonly string[];
  readonly testNames?: readonly string[];
}

/**
 * Result of query embedding operation with tier info.
 */
export interface QueryEmbeddingResult {
  readonly embedding: readonly number[];
  readonly cacheHit: boolean;
  readonly tier: EmbeddingTierName;
  readonly dimension: number;
}

// ==================== External Knowledge Types ====================

/**
 * External document fetched from a source.
 */
export interface ExternalDocument {
  readonly title: string;
  readonly content: string;
  readonly sourceUrl: string;
  readonly techStackTags?: readonly TechStackTag[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of fetching documents from an external source.
 */
export interface FetchResult {
  readonly documents: readonly ExternalDocument[];
  readonly errorCount: number;
  readonly nextCursor?: string;
}

/**
 * External source connector interface.
 */
export interface ExternalSourceConnector {
  readonly sourceType: ExternalSourceType;
  readonly fetch: (source: ExternalSource, cursor?: string) => Promise<FetchResult>;
}

/**
 * Sync result for a single source.
 */
export interface SyncSourceResult {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly docsIngested: number;
  readonly docsSkipped: number;
  readonly errorCount: number;
  readonly durationMs: number;
}

/**
 * Sync result for all sources.
 */
export interface SyncAllResult {
  readonly sourcesProcessed: number;
  readonly totalDocsIngested: number;
  readonly totalErrors: number;
  readonly results: readonly SyncSourceResult[];
}

/**
 * Options for syncing external sources.
 */
export interface SyncOptions {
  readonly maxDocsPerSource?: number;
  readonly filterTechStack?: readonly TechStackTag[];
  readonly minCredibility?: number;
}

// ==================== PR Fix Comment Detector Types ====================

/**
 * Represents a PR comment for analysis.
 */
export interface PRComment {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

/**
 * Context about the failure that was fixed.
 */
export interface PRFixFailureContext {
  readonly checkRunId: number;
  readonly checkName: string;
  readonly errorSummary: string;
  readonly failedAt: string;
  readonly repository: string;
  readonly prNumber: number;
  readonly commitSha: string;
  readonly filesChanged?: readonly string[];
}

/**
 * Result of analyzing a PR comment for fix content.
 */
export interface FixCommentAnalysis {
  readonly isFixComment: boolean;
  readonly confidence: number;
  readonly comment: PRComment;
  readonly matchedPatterns: readonly string[];
  readonly hasCodeBlock: boolean;
  readonly hasFileReference: boolean;
  readonly wordCount: number;
}

/**
 * Extracted fix knowledge ready for ingestion.
 */
export interface ExtractedFixKnowledge {
  readonly title: string;
  readonly content: string;
  readonly confidence: number;
  readonly sourceComment: PRComment;
  readonly failureContext: PRFixFailureContext;
  readonly metadata: {
    readonly prUrl: string;
    readonly commentId: string;
    readonly filesChanged: readonly string[];
    readonly matchedPatterns: readonly string[];
    readonly extractedAt: string;
  };
}

// ==================== PR Fix Comment Ingestion Types ====================

/**
 * Input for PR fix comment ingestion.
 */
export interface IngestPRFixCommentsInput {
  /** PR comments to analyze */
  readonly comments: readonly PRComment[];
  /** Context about the original failure */
  readonly failureContext: PRFixFailureContext;
  /** Tenant ID for multi-tenant isolation */
  readonly tenantId?: string;
  /** Skip deduplication check */
  readonly skipDedup?: boolean;
}

/**
 * Result of ingesting a single fix comment.
 */
export interface FixCommentIngestionResult {
  readonly success: boolean;
  readonly commentId: string;
  readonly documentId?: string;
  readonly confidence: number;
  readonly skippedReason?: string;
  readonly error?: string;
}

/**
 * Result of ingesting all fix comments from a PR.
 */
export interface IngestPRFixCommentsResult {
  readonly totalComments: number;
  readonly fixCommentsFound: number;
  readonly ingested: number;
  readonly skipped: number;
  readonly failed: number;
  readonly results: readonly FixCommentIngestionResult[];
}

/**
 * Result of duplicate check operation.
 */
export interface DuplicateCheckResult {
  readonly isDuplicate: boolean;
  readonly checkSucceeded: boolean;
}

// ==================== Slack Resolution Pattern Types ====================

/**
 * A reaction on a Slack message.
 */
export interface SlackReaction {
  readonly name: string;
  readonly count: number;
  readonly users?: readonly string[];
}

/**
 * A single message in a Slack thread.
 */
export interface SlackMessage {
  readonly ts: string;
  readonly userId: string;
  readonly username?: string;
  readonly text: string;
  readonly reactions?: readonly SlackReaction[];
  readonly isBot?: boolean;
  readonly threadTs?: string;
}

// ==================== Slack Resolution Detector Types ====================

/**
 * A Slack thread with its messages.
 */
export interface SlackThread {
  readonly channelId: string;
  readonly channelName?: string;
  readonly threadTs: string;
  readonly messages: readonly SlackMessage[];
  readonly originalIssue?: string;
  readonly repository?: string;
}

/**
 * Detected resolution from a Slack thread.
 */
export interface DetectedResolution {
  readonly threadTs: string;
  readonly channelId: string;
  readonly confidence: number;
  readonly resolutionContent: string;
  readonly resolutionMessageTs: string;
  readonly matchedPatterns: readonly string[];
  readonly hasPositiveReactions: boolean;
  readonly hasCodeBlock: boolean;
  readonly resolverUserId: string;
  readonly resolverUsername?: string;
}

/**
 * Result of resolution detection.
 */
export interface ResolutionDetectionResult {
  readonly hasResolution: boolean;
  readonly resolution: DetectedResolution | null;
  readonly allCandidates: readonly ResolutionCandidate[];
  readonly analysisMetadata: ResolutionAnalysisMetadata;
}

/**
 * A candidate message that may contain a resolution.
 */
export interface ResolutionCandidate {
  readonly message: SlackMessage;
  readonly score: number;
  readonly matchedPatterns: readonly string[];
  readonly hasPositiveReactions: boolean;
  readonly hasCodeBlock: boolean;
}

/**
 * Metadata about the resolution analysis.
 */
export interface ResolutionAnalysisMetadata {
  readonly messagesAnalyzed: number;
  readonly candidatesFound: number;
  readonly topScore: number;
  readonly patternMatchCounts: Readonly<Record<string, number>>;
}

// ==================== Slack Resolution Ingestion Types ====================

/**
 * Input for ingesting a Slack resolution.
 */
export interface IngestSlackResolutionInput {
  /** The Slack thread to analyze */
  readonly thread: SlackThread;
  /** Tenant ID for multi-tenancy */
  readonly tenantId?: string;
  /** Repository context if the thread relates to code */
  readonly repository?: string;
  /** CI failure context if this was triggered by a failure */
  readonly failureContext?: SlackResolutionFailureContext;
}

/**
 * Context about a CI failure that triggered this Slack thread.
 */
export interface SlackResolutionFailureContext {
  /** The check run name that failed */
  readonly checkName?: string;
  /** Error message from the failure */
  readonly errorMessage?: string;
  /** Files affected by the failure */
  readonly affectedFiles?: readonly string[];
  /** PR number if applicable */
  readonly prNumber?: number;
}

/**
 * Result of Slack resolution ingestion.
 */
export interface IngestSlackResolutionResult {
  /** Whether resolution was detected and ingested */
  readonly success: boolean;
  /** Whether a resolution was found in the thread */
  readonly resolutionDetected: boolean;
  /** The detected resolution if found */
  readonly resolution: DetectedResolution | null;
  /** Ingestion result if resolution was ingested */
  readonly ingestionResult: IngestKnowledgeDocResult | null;
  /** Detection analysis details */
  readonly detectionResult: ResolutionDetectionResult;
  /** Error message if failed */
  readonly error?: string;
}

/**
 * Result of batch ingestion.
 */
export interface BatchIngestSlackResolutionsResult {
  readonly threadsProcessed: number;
  readonly successCount: number;
  readonly resolutionsDetected: number;
  readonly errorCount: number;
  readonly results: readonly IngestSlackResolutionResult[];
}

/**
 * Accumulator for batch processing.
 */
export interface BatchAccumulator {
  readonly results: readonly IngestSlackResolutionResult[];
  readonly successCount: number;
  readonly resolutionsDetected: number;
  readonly errorCount: number;
}

// ==================== Analysis Lesson Ingestion Types ====================

/**
 * Context for creating an analysis lesson from a confirmed analysis.
 */
export interface AnalysisLessonContext {
  /** Repository full name (owner/repo) */
  readonly repository: string;
  /** Commit SHA that triggered the failure */
  readonly commitSha: string;
  /** The analyzed failures with LLM analysis */
  readonly failures: readonly AnalyzedFailure[];
  /** Tenant ID for multi-tenancy */
  readonly tenantId?: string;
  /** User who provided positive feedback */
  readonly confirmedBy?: string;
  /** PR number if applicable */
  readonly prNumber?: number;
  /** Installation ID */
  readonly installationId?: number;
}

/**
 * Result of analysis lesson ingestion.
 */
export interface IngestAnalysisLessonResult {
  readonly success: boolean;
  readonly ingestionResult: IngestKnowledgeDocResult | null;
  readonly lessonsCreated: number;
  readonly error?: string;
}

/**
 * Failure category based on analysis patterns.
 */
export type FailureCategory =
  | "test_failure"
  | "build_error"
  | "type_error"
  | "lint_error"
  | "dependency_error"
  | "runtime_error"
  | "timeout"
  | "infrastructure"
  | "unknown";

// ==================== Linked Commit Ingestion Types ====================

/**
 * Summary of a CI failure for linking with commits.
 */
export interface FailureSummary {
  readonly checkName: string;
  readonly conclusion: string;
  readonly identifiedCause: string;
  readonly analysis: string;
  readonly errorPatterns: readonly string[];
  readonly testFailures: readonly string[];
  readonly timestamp: string;
  readonly confidence: number;
}

/**
 * PR failure context stored in Redis.
 */
export interface PRFailureContext {
  readonly repository: string;
  readonly prNumber: number;
  readonly failures: readonly FailureSummary[];
  readonly firstFailureAt: string;
  readonly lastFailureAt: string;
}

/**
 * Input for creating linked commit knowledge.
 */
export interface LinkedCommitInput {
  readonly repository: string;
  readonly prNumber: number;
  readonly prTitle: string;
  readonly commitSha: string;
  readonly commitMessages: readonly string[];
  readonly diffSummary: string;
  readonly changedFiles: readonly string[];
  readonly tenantId: string;
  readonly author?: string;
}

/**
 * Result of linked commit ingestion.
 */
export interface LinkedCommitResult {
  readonly success: boolean;
  readonly chunksCreated: number;
  readonly linkedFailures: number;
  readonly skipped: boolean;
  readonly reason?: string;
}

/**
 * Input for creating a failure summary from an analyzed failure.
 */
export interface FailureSummaryInput {
  readonly checkName: string;
  readonly conclusion: string;
  readonly identifiedCause: string;
  readonly analysis: string;
  readonly confidence: number;
  readonly errorPatterns?: readonly string[];
  readonly testFailures?: readonly string[];
}

// ==================== Relationship Detection Types ====================

/**
 * Document context for relationship detection.
 */
export interface DocumentContext {
  readonly docId: string;
  readonly docType: string;
  readonly title: string;
  readonly content: string;
  readonly repository?: string;
  readonly filePath?: string;
  readonly tenantId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Detected relationship before persistence.
 */
export interface DetectedRelationship {
  readonly fromDocId: string;
  readonly toDocId: string;
  readonly relationshipType: RelationshipType;
  readonly strength: number;
  readonly reason: string;
}

/**
 * Result of relationship detection.
 */
export interface RelationshipDetectionResult {
  readonly detected: number;
  readonly created: number;
  readonly errors: readonly string[];
}

/**
 * Knowledge doc search result for relationship detection.
 */
export interface KnowledgeDocSearchResult {
  readonly id: string;
  readonly content: string;
  readonly similarity: number;
  readonly repository?: string;
  readonly docType: string;
}

/**
 * Intermediate scored relationship during detection.
 */
export interface ScoredRelationship {
  readonly result: KnowledgeDocSearchResult;
  readonly strength: number;
  readonly combinedPatternOverlap: number;
}

// ==================== Chunking Core Internal Types ====================

/**
 * Split pattern definition for finding boundaries.
 */
export interface SplitPattern {
  readonly pattern: RegExp;
  readonly priority: number;
}

/**
 * Split point candidate with position and priority.
 */
export interface SplitCandidate {
  readonly position: number;
  readonly priority: number;
}

// ==================== Cost Controls Cache Internal Types ====================

/**
 * Query cache entry.
 */
export interface CacheEntry {
  readonly embedding: readonly number[];
  readonly timestamp: number;
  readonly tier: EmbeddingTierName;
}

// ==================== Ingestion Internal Types ====================

/**
 * Options for batch embedding operations.
 */
export interface BatchEmbedOptions {
  readonly batchSize: number;
  readonly tenantId?: string;
}

/**
 * Intermediate result of chunking and storing (diff or knowledge doc).
 */
export interface ChunkStoreResult {
  readonly chunksCreated: number;
  readonly parentId: string | null;
}

/**
 * Intermediate result of embedding generation.
 */
export interface EmbedResult {
  readonly chunksEmbedded: number;
  readonly errors: readonly string[];
}

/**
 * Intermediate result of relationship detection (optional step).
 */
export interface RelationshipStepResult {
  readonly relationshipsDetected?: number;
  readonly relationshipsCreated?: number;
}

// ==================== Ingestion Helper Internal Types ====================

/**
 * Maps chunked diff result to database input format.
 */
export interface DiffChunkContext {
  readonly filePath: string;
  readonly repository: string;
  readonly prNumber: number;
  readonly commitSha: string;
  readonly hunkHeader?: string;
  readonly tenantId?: string;
}

/**
 * Maps chunked knowledge doc result to database input format.
 */
export interface KnowledgeChunkContext {
  readonly docType: KnowledgeDocType;
  readonly title: string;
  readonly parentId: string | null;
  readonly repository?: string;
  readonly sourceUrl?: string;
  readonly filePath?: string;
  readonly tenantId?: string;
  readonly metadata?: Record<string, unknown>;
}

// ==================== Metrics Internal Types ====================

/**
 * Metrics entry for a single operation.
 */
export interface MetricEntry {
  readonly timestamp: number;
  readonly tokens: number;
  readonly latencyMs: number;
  readonly success: boolean;
}

/**
 * Ingestion entry for tracking.
 */
export interface IngestionEntry {
  readonly timestamp: number;
  readonly type: "diff" | "knowledge";
  readonly chunksCreated: number;
  readonly chunksEmbedded: number;
  readonly errorCount: number;
}

// ==================== Evaluation Internal Types ====================

/**
 * Search function type for test execution.
 */
export type SearchFunction = (
  query: string,
  repository?: string
) => Promise<readonly RetrievalResult[]>;

// ==================== Test Case Seeding Internal Types ====================

/**
 * Predefined test case template.
 */
export interface TestCaseTemplate {
  readonly name: string;
  readonly description: string;
  readonly queryText: string;
  readonly category: string;
  readonly priority: number;
  readonly expectedMinRecall: number;
}

// ==================== GitHub Issues Connector Internal Types ====================

/**
 * GitHub issue from API response.
 */
export interface GitHubIssue {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly html_url: string;
  readonly labels: ReadonlyArray<{ name: string }>;
  readonly state: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
  readonly pull_request?: unknown;
}

/**
 * Auth config for GitHub connector.
 */
export interface GitHubAuthConfig {
  readonly token?: string;
  readonly owner: string;
  readonly repo: string;
  readonly labels?: readonly string[];
  readonly state?: "open" | "closed" | "all";
}
