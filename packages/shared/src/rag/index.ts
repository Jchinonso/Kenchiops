/**
 * RAG (Retrieval-Augmented Generation) Module
 *
 * Provides utilities for semantic search over code diffs, documentation,
 * and incident history to enhance LLM analysis with relevant context.
 *
 * @module rag
 */

export {
  // Chunking functions
  chunkText,
  chunkDiff,
  chunkKnowledgeDoc,
  splitMarkdownSections,
  estimateTokenCount,
  // Types
  type ChunkMetadata,
  type TextChunk,
  type ChunkingOptions,
  type DiffChunkResult,
  type KnowledgeChunkResult,
  type MarkdownSection,
} from "./chunking.js";

export {
  // Ingestion functions
  ingestDiffChunks,
  ingestKnowledgeDoc,
  processPendingEmbeddings,
  // Types
  type IngestDiffInput,
  type IngestDiffResult,
  type IngestKnowledgeDocInput,
  type IngestKnowledgeDocResult,
} from "./ingestion.js";

export {
  // Metrics functions
  recordEmbeddingOperation,
  recordIngestionOperation,
  getEmbeddingMetrics,
  getIngestionMetrics,
  getRAGMetricsSnapshot,
  logRAGMetrics,
  checkRAGAlerts,
  resetMetrics,
  // Types
  type EmbeddingMetrics,
  type IngestionMetrics,
  type RAGMetricsSnapshot,
} from "./metrics.js";

export {
  // Search functions
  searchDiffChunks,
  searchKnowledgeDocs,
  searchAll,
  searchFromEventContext,
  clearEmbeddingCache,
  // Types
  type SearchQuery,
  type DiffSearchQuery,
  type KnowledgeSearchQuery,
  type RAGSearchResult,
  type EventQueryContext,
} from "./search.js";

export {
  // Governance functions
  getTenantRAGStats,
  purgeTenantRAGData,
  purgePRDiffChunks,
  purgeKnowledgeDocChunks,
  triggerReembedding,
  checkRAGHealth,
  // Types
  type RAGTenantStats,
  type PurgeResult,
  type ReembeddingResult,
  type ReembeddingConfig,
  type RAGHealthStatus,
} from "./governance.js";

export {
  // Evaluation functions
  calculateRecallAtK,
  calculateMRR,
  calculateHelpfulRate,
  recordRAGFeedback,
  runRAGTestCase,
  getRAGEvaluationMetrics,
  // Types
  type RAGRelevance,
  type RAGFeedbackInput,
  type RAGEvaluationMetrics,
  type RetrievalResult,
  type RAGTestCase,
  type RAGTestResult,
  type FeedbackResult,
} from "./evaluation.js";

export {
  // Multi-hop RAG functions
  traverseGraph,
  expandWithRelatedDocs,
  getGraphStats,
  findPath,
  // Types
  type GraphNode,
  type MultiHopResult,
  type MultiHopOptions,
} from "./multiHop.js";

export {
  // External knowledge functions
  registerConnector,
  getConnector,
  syncExternalSource,
  syncDueSources,
  getTenantSyncStatus,
  // Types
  type ExternalDocument,
  type FetchResult,
  type ExternalSourceConnector,
  type SyncSourceResult,
  type SyncAllResult,
  type SyncOptions,
} from "./externalKnowledge.js";

export {
  // Streaming updates functions
  handlePRMergeEvent,
  handleDocUpdateEvent,
  checkStaleness,
  markApproachingExpiry,
  cleanupExpired,
  refreshDiffChunk,
  refreshKnowledgeDoc,
  getStaleDocuments,
  // Types
  type PRMergeEvent,
  type DocUpdateEvent,
  type StalenessResult,
  type CleanupResult,
  type TTLConfig,
} from "./streamingUpdates.js";

export {
  // Drift detection functions
  runTestSuite,
  generateDriftReport,
  checkMetricBounds,
  runDriftDetectionWithAlerts,
  // Types
  type TestSuiteResult,
  type TestCaseResult,
  type DriftReport,
  type DriftMetricReport,
  type DriftAlert,
  type DriftDetectionWithAlertsResult,
} from "./driftDetection.js";

export {
  // Cost control functions
  getCachedEmbedding,
  cacheEmbedding,
  clearExpiredCache,
  clearCache,
  getCacheStats,
  setTenantTierConfig,
  getTenantTierConfig,
  selectEmbeddingTier,
  recordEmbeddingCost,
  recordQueryCost,
  shouldSkipExpensiveSearch,
  estimateEmbeddingCost,
  estimateMonthlyCost,
  recommendTier,
  // Budget-aware embedding functions
  generateBudgetAwareEmbedding,
  generateBatchBudgetAwareEmbeddings,
  BudgetExceededError,
  // Types
  type TierSelectionResult,
  type CacheStats,
  type TenantTierConfig,
  type BudgetAwareEmbeddingOptions,
  type BatchBudgetAwareEmbeddingOptions,
  type BudgetAwareEmbeddingResult,
  type BatchBudgetAwareEmbeddingResult,
} from "./costControls.js";

export {
  // GitHub Issues connector
  githubIssuesConnector,
  initGitHubIssuesConnector,
} from "./githubIssuesConnector.js";

export {
  // Alert dispatcher functions
  dispatchDriftAlert,
  dispatchDriftAlerts,
  dispatchDriftReportAlerts,
  dispatchHealthStatusAlert,
  // Types
  type AlertDispatchResult,
  type BatchAlertDispatchResult,
  type AlertDispatchOptions,
} from "./alertDispatcher.js";

export {
  // PR fix comment detection
  analyzeComment,
  findFixComments,
  extractFixKnowledge,
  isDuplicateKnowledge,
  // Types
  type PRComment,
  type PRFixFailureContext,
  type FixCommentAnalysis,
  type ExtractedFixKnowledge,
} from "./prFixCommentDetector.js";

export {
  // PR fix comment ingestion
  ingestPRFixComments,
  createFailureContext,
  // Types
  type IngestPRFixCommentsInput,
  type FixCommentIngestionResult,
  type IngestPRFixCommentsResult,
} from "./prFixCommentIngestion.js";

export {
  // Reranking functions
  rerankResults,
  applyHardRules,
  fullRerank,
  // Types
  type RerankableResult,
  type QueryContext,
  type RerankedResult,
  type RerankOptions,
} from "./reranker.js";

export {
  // Metadata schema validation
  analysisLessonMetadataSchema,
  prFixCommentMetadataSchema,
  slackResolutionMetadataSchema,
  teamDocsMetadataSchema,
  externalDocsMetadataSchema,
  runbookMetadataSchema,
  postmortemMetadataSchema,
  METADATA_SCHEMA_REGISTRY,
  getSchemaForDocType,
  validateMetadata,
  validateMetadataOrThrow,
  hasSchemaForDocType,
  getRegisteredDocTypes,
  // Types
  type AnalysisLessonMetadata,
  type PrFixCommentMetadata,
  type SlackResolutionMetadata,
  type TeamDocsMetadata,
  type ExternalDocsMetadata,
  type RunbookMetadata,
  type PostmortemMetadata,
  type DocumentMetadata,
  type MetadataValidationResult,
} from "./schemas/index.js";

export {
  // Chunking strategies
  DOC_TYPES,
  DEFAULT_STRATEGY,
  ANALYSIS_LESSON_STRATEGY,
  PR_FIX_COMMENT_STRATEGY,
  SLACK_RESOLUTION_STRATEGY,
  RUNBOOK_STRATEGY,
  POSTMORTEM_STRATEGY,
  TROUBLESHOOTING_STRATEGY,
  SOP_STRATEGY,
  EXTERNAL_STRATEGY,
  STRATEGY_REGISTRY,
  getChunkingStrategy,
  getRegisteredDocTypesWithStrategies,
  hasCustomStrategy,
  // Types
  type ChunkingStrategy,
} from "./chunkingStrategies.js";

export {
  // Doc-type-specific chunking
  chunkByDocType,
  // Types
  type DocTypeChunkResult,
} from "./docTypeChunking.js";

export {
  // Slack resolution detection
  detectResolution,
  hasResolutionSignals,
  extractUniquePatterns,
  // Types
  type SlackMessage,
  type SlackReaction,
  type SlackThread,
  type DetectedResolution,
  type ResolutionDetectionResult,
} from "./slackResolutionDetector.js";

export {
  // Slack resolution ingestion
  ingestSlackResolution,
  batchIngestSlackResolutions,
  // Types
  type IngestSlackResolutionInput,
  type SlackResolutionFailureContext,
  type IngestSlackResolutionResult,
  type BatchIngestSlackResolutionsResult,
} from "./slackResolutionIngestion.js";

export {
  // Analysis lesson ingestion
  ingestAnalysisLesson,
  extractAnalysisContext,
  // Types
  type AnalysisLessonContext,
  type IngestAnalysisLessonResult,
} from "./analysisLessonIngestion.js";

export {
  // Linked commit ingestion (failure context + commit messages + diff)
  trackPRFailure,
  getPRFailures,
  clearPRFailures,
  ingestLinkedCommitKnowledge,
  createFailureSummary,
  // Types
  type FailureSummary,
  type PRFailureContext,
  type LinkedCommitInput,
  type LinkedCommitResult,
} from "./linkedCommitIngestion.js";

export {
  // Relationship detection for multi-hop RAG
  findRelatedDocuments,
  createDetectedRelationships,
  detectAndCreateRelationships,
  // Types
  type DocumentContext,
  type DetectedRelationship,
  type RelationshipDetectionResult,
} from "./relationshipDetection.js";

export {
  // Test case seeding for drift detection
  seedTestCases,
  getSeedTestCaseTemplates,
  getSeedTemplatesByCategory,
  getSeedCategories,
  // Types
  type SeedTestCasesResult,
} from "./testCaseSeeding.js";
