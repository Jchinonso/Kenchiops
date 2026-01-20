/**
 * Database module - data access layer for all services.
 */

// Database client
export {
  initDatabase,
  getPool,
  query,
  transaction,
  closeDatabase,
  isDatabaseHealthy,
  type QueryResult,
} from "./client.js";

// Tenant module
export {
  // Row mappers
  rowToTenant,
  extractTenant,
  getStatusAfterGitHubInstall,
  getStatusAfterSlackInstall,
  // Types
  type TenantRow,
  type TenantStatistics,
  type TenantRAGBudgetConfig,
  type UpdateRAGBudgetInput,
  // Lookup operations
  findByGitHubInstallation,
  findByGitHubOrg,
  findBySlackWorkspace,
  findById,
  getActiveTenants,
  getTenantStatistics,
  getSlackCredentials,
  // Lifecycle operations
  createFromGitHubInstall,
  linkSlackWorkspace,
  createFromSlackInstall,
  activate,
  suspend,
  deleteTenant,
  handleGitHubUninstall,
  updateSlackToken,
  // Audit operations
  logAuditEvent,
  getAuditLog,
  // RAG budget configuration
  getRAGBudgetConfig,
  updateRAGBudgetConfig,
} from "./tenant/index.js";

// Repository channel module
export {
  findChannelForRepository,
  findMappingsForChannel,
  findAllMappingsForTenant,
  getMappedRepositories,
  createMapping,
  deleteMapping,
  deleteMappingsForChannel,
  isMapped,
} from "./repositoryChannel/index.js";

// Vector types (shared)
export type { VectorSearchResult, VectorSearchFilters } from "./vectorTypes.js";

// Diff chunk module
export {
  type DiffChunk,
  type CreateDiffChunkInput,
  type DiffChunkRow,
  type DiffChunkSimilarityRow,
  mapRowToDiffChunk,
  createDiffChunk,
  createDiffChunksBatch,
  searchSimilarDiffChunks,
  getDiffChunksWithoutEmbeddings,
  updateDiffChunkEmbedding,
  deleteDiffChunksByPR,
  deleteDiffChunksByTenant,
  getDiffChunkCount,
} from "./diffChunk/index.js";

// Knowledge document module
export {
  type KnowledgeDocRecord,
  type CreateKnowledgeDocInput,
  type KnowledgeDocRow,
  type KnowledgeDocSimilarityRow,
  mapRowToKnowledgeDoc,
  createKnowledgeDoc,
  createKnowledgeDocsBatch,
  searchSimilarKnowledgeDocs,
  getKnowledgeDocsWithoutEmbeddings,
  updateKnowledgeDocEmbedding,
  deleteKnowledgeDocsByParent,
  deleteKnowledgeDocsByTenant,
  getDocsNeedingReembedding,
  getKnowledgeDocsByType,
  getKnowledgeDocCountsByType,
  getKnowledgeDocById,
  incrementKnowledgeDocHitCount,
  batchIncrementKnowledgeDocHitCounts,
  recordKnowledgeDocNegativeFeedback,
} from "./knowledgeDoc/index.js";

// Feedback module
export {
  createRAGFeedback,
  createAnalysisFeedback,
  getFeedbackByAnalysis,
  getRAGFeedbackMetrics,
  getRAGFeedbackByDoc,
  createOrUpdateAnalysisFeedback,
  createQAFeedback,
  createOrUpdateQAFeedback,
  getQAFeedbackByQueryAndUser,
  type FeedbackType,
  type CreateRAGFeedbackInput,
  type CreateAnalysisFeedbackInput,
  type CreateQAFeedbackInput,
  type FeedbackRecord,
  type RAGFeedbackMetrics,
} from "./feedback/index.js";

// Analysis module
export {
  createAnalysis,
  getAnalysisById,
  getAnalysisByEventId,
  getAnalysesByModelVersion,
  countAnalysesByModelVersion,
  type CreateAnalysisInput,
  type AnalysisRecord,
} from "./analysis/index.js";

// Action proposal module
export {
  updateActionProposalStatus,
  getActionProposalById,
  getActionProposalsByAnalysis,
  getActionApprovalStats,
  type ActionProposalStatus,
  type UpdateActionStatusInput,
  type ActionProposalRecord,
  type ActionApprovalStats,
} from "./actionProposal/index.js";

// Model version module
export {
  createModelVersion,
  getModelVersionById,
  getAllModelVersionsFromDB,
  getBaselineModelFromDB,
  deleteModelVersion,
  saveFeatureFlags,
  getFeatureFlagsFromDB,
  setRollbackActive,
  updateTenantOverrides,
  type CreateModelVersionInput,
  type SaveFeatureFlagsInput,
} from "./modelVersion/index.js";

// Relationship module (Multi-Hop RAG)
export {
  createRelationship,
  createRelationshipsBatch,
  getRelationshipById,
  getOutgoingRelationships,
  getIncomingRelationships,
  getBidirectionalRelationships,
  getRelationshipsByType,
  deleteRelationship,
  deleteRelationshipsByDoc,
  getRelationshipCount,
  getRelationshipTypeDistribution,
  type IncidentRelationship,
  type CreateRelationshipInput,
} from "./relationship/index.js";

// External source module (Cross-Repo Knowledge)
export {
  createExternalSource,
  getExternalSourceById,
  getExternalSourcesByTenant,
  getEnabledExternalSources,
  getExternalSourcesByType,
  getSourcesDueForSync,
  updateExternalSource,
  updateSyncStatus,
  deleteExternalSource,
  deleteExternalSourcesByTenant,
  getExternalSourceCount,
  type ExternalSource,
  type CreateExternalSourceInput,
  type UpdateExternalSourceInput,
} from "./externalSource/index.js";

// Test case module (Automated QA)
export {
  createTestCase,
  getTestCaseById,
  getActiveTestCases,
  getActiveTestCasesByTenant,
  getTestCasesByCategory,
  updateTestCaseResult,
  setTestCaseActive,
  deleteTestCase,
  getTestCaseCount,
  getRecentlyFailedTestCases,
  type RAGTestCase,
  type CreateTestCaseInput,
  type TestResultInput,
  validateExpectedDocIds,
  validateTestCase,
  type ValidateExpectedDocIdsResult,
} from "./testCase/index.js";

// Metrics history module (Drift Detection)
export {
  recordMetric,
  getRecentMetrics,
  getMetricBaseline,
  getAllBaselines,
  detectDrift,
  getMetricTrend,
  cleanupOldMetrics,
  getMetricCounts,
  type RAGMetricHistory,
  type RecordMetricInput,
  type MetricBaseline,
  type DriftDetectionResult,
} from "./metricsHistory/index.js";

// Cost tracking module (Cost Controls)
export {
  recordCost,
  getMonthlyCostSummary,
  getBudgetStatus,
  getDailyCostTrend,
  getTopCostConsumers,
  cleanupOldCostRecords,
  type CostRecord,
  type RecordCostInput,
  type CostSummary,
  type BudgetStatus,
} from "./costTracking/index.js";
