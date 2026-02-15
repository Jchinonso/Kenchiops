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
} from "./client/index.js";

// Tenant module
// Note: TenantRow and row mappers are internal to tenant module.
// Domain types (Tenant, TenantStatus, etc.) are in core/types.ts.
export {
  // Status helpers (used by services for business logic)
  getStatusAfterGitHubInstall,
  getStatusAfterSlackInstall,
  // Domain types
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
export type { VectorSearchResult, VectorSearchFilters } from "./vector/index.js";

// Diff chunk module
// Note: DiffChunkRow, DiffChunkSimilarityRow, mapRowToDiffChunk are internal.
export {
  type DiffChunk,
  type CreateDiffChunkInput,
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
// Note: KnowledgeDocRow, KnowledgeDocSimilarityRow, mapRowToKnowledgeDoc are internal.
export {
  type KnowledgeDocRecord,
  type CreateKnowledgeDocInput,
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
  getAnalysesByTenant,
  countAnalysesByTenant,
  getAnalysesByEventIds,
  type CreateAnalysisInput,
  type AnalysisRecord,
} from "./analysis/index.js";

// Event module
export {
  createEvent,
  getEventsByTenant,
  countEventsByTenant,
  type EventRecord,
  type EventListOptions,
  type CreateEventInput,
} from "./event/index.js";

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

// User module (Authentication)
export {
  // Types
  type UserRow,
  type OAuthIdentityRow,
  type RefreshTokenRow,
  type OAuthStateRow,
  type User,
  type OAuthIdentity,
  type RefreshToken,
  type OAuthState,
  type OAuthProvider,
  type UserRole,
  type UserStatus,
  type CreateUserInput,
  type UpsertOAuthIdentityInput,
  type OAuthStateInput,
  type CreateRefreshTokenInput,
  type RotateRefreshTokenInput,
  type RotateRefreshTokenResult,
  type OAuthProviderProfile,
  type OAuthTokenResponse,
  type JWTPayload,
  type TokenPair,
  type AuthenticatedUser,
  type UserValidationRule,
  type OAuthIdentityValidationRule,
  // Helpers
  rowToUser,
  extractUser,
  rowToOAuthIdentity,
  extractOAuthIdentity,
  rowToRefreshToken,
  extractRefreshToken,
  rowToOAuthState,
  extractOAuthState,
  validateCreateUserInput,
  validateUpsertOAuthIdentityInput,
  // Lookup operations
  findUserById,
  findUserByEmail,
  findOAuthIdentity,
  findOAuthIdentitiesByUser,
  // Lifecycle operations
  createUser,
  updateLastLogin,
  updateUserTenant,
  upsertOAuthIdentity,
  // OAuth state operations
  createOAuthState,
  consumeOAuthState,
  cleanupExpiredStates,
  // Refresh token operations
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeTokenFamily,
  replaceRefreshToken,
  rotateRefreshTokenAtomically,
  cleanupExpiredRefreshTokens,
} from "./user/index.js";

// Risk rules module (Context-Aware Risk Scoring)
// Note: CustomRiskRuleRow, RiskAssessmentRow, and row mappers are internal.
export {
  // Domain types
  type RiskEnvironment,
  type CustomRiskRule,
  type RiskAssessmentRecord,
  type CreateCustomRiskRuleInput,
  type UpdateCustomRiskRuleInput,
  type CreateRiskAssessmentInput,
  type RiskRulesQueryOptions,
  type RiskAssessmentsQueryOptions,
  type RiskRuleValidationRule,
  type RiskAssessmentValidationRule,
  type RiskRulesStore,
  // Constants
  VALID_ENVIRONMENTS,
  VALID_BLAST_RADIUS,
  VALID_REVERSIBILITY,
  VALID_DATA_IMPACT,
  VALID_RISK_LEVELS,
  RISK_RULE_DEFAULTS,
  // Validation
  validateCreateRiskRuleInput,
  validateUpdateRiskRuleInput,
  validateRiskAssessmentInput,
  validateRiskRulesQueryOptions,
  validateAssessmentsQueryOptions,
  // Helpers
  sanitizeForLogging,
  createRuleLogContext,
  matchesActionType,
  matchesEnvironment,
  filterRulesByContext,
  generateRuleId,
  generateAssessmentId,
  // Repository
  createCustomRiskRule,
  getCustomRiskRules,
  getCustomRiskRuleById,
  updateCustomRiskRule,
  deleteCustomRiskRule,
  recordRiskAssessment,
  queryRiskAssessments,
} from "./riskRules/index.js";
