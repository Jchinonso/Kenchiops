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
