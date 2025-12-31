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

// Tenant service
export {
  findByGitHubInstallation,
  findByGitHubOrg,
  findBySlackWorkspace,
  findById,
  getActiveTenants,
  createFromGitHubInstall,
  linkSlackWorkspace,
  createFromSlackInstall,
  activate,
  suspend,
  deleteTenant,
  handleGitHubUninstall,
  logAuditEvent,
  getAuditLog,
  updateSlackToken,
  getSlackCredentials,
  getTenantStatistics,
  type TenantStatistics,
} from "./tenantService.js";

// Repository channel service
export {
  findChannelForRepository,
  findMappingsForChannel,
  findAllMappingsForTenant,
  getMappedRepositories,
  createMapping,
  deleteMapping,
  deleteMappingsForChannel,
  isMapped,
} from "./repositoryChannelService.js";

// Vector types
export {
  type DiffChunk,
  type CreateDiffChunkInput,
  type KnowledgeDocRecord,
  type CreateKnowledgeDocInput,
  type VectorSearchResult,
  type VectorSearchFilters,
} from "./vectorTypes.js";

// Diff chunk repository
export {
  createDiffChunk,
  createDiffChunksBatch,
  searchSimilarDiffChunks,
  getDiffChunksWithoutEmbeddings,
  updateDiffChunkEmbedding,
  deleteDiffChunksByPR,
  deleteDiffChunksByTenant,
  getDiffChunkCount,
} from "./diffChunkRepository.js";

// Knowledge document repository
export {
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
} from "./knowledgeDocRepository.js";

// Knowledge document hit tracking
export {
  getKnowledgeDocById,
  incrementKnowledgeDocHitCount,
  batchIncrementKnowledgeDocHitCounts,
  recordKnowledgeDocNegativeFeedback,
} from "./knowledgeDocHitTracking.js";

// Feedback repository
export {
  createRAGFeedback,
  createAnalysisFeedback,
  getFeedbackByAnalysis,
  getRAGFeedbackMetrics,
  getRAGFeedbackByDoc,
  type FeedbackType,
  type CreateRAGFeedbackInput,
  type CreateAnalysisFeedbackInput,
  type FeedbackRecord,
  type RAGFeedbackMetrics,
} from "./feedbackRepository.js";

// Action proposal repository
export {
  updateActionProposalStatus,
  getActionProposalById,
  getActionProposalsByAnalysis,
  getActionApprovalStats,
  type ActionProposalStatus,
  type UpdateActionStatusInput,
  type ActionProposalRecord,
  type ActionApprovalStats,
} from "./actionProposalRepository.js";

// Model version repository
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
} from "./modelVersionRepository.js";

// Relationship repository (Multi-Hop RAG)
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
} from "./relationshipRepository.js";

// External source repository (Cross-Repo Knowledge)
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
} from "./externalSourceRepository.js";

// Test case repository (Automated QA)
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
} from "./testCaseRepository.js";

// Metrics history repository (Drift Detection)
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
} from "./metricsHistoryRepository.js";

// Cost tracking repository (Cost Controls)
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
} from "./costTrackingRepository.js";
