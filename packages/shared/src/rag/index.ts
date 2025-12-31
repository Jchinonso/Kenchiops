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
