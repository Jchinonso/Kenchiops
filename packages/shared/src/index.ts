/* eslint-disable max-lines */
/**
 * Kenchi Shared Package
 *
 * This package provides all shared functionality used across services.
 * Import everything from this package using: import { ... } from "@kenchi/shared";
 */

// Core infrastructure
export { config } from "./core/index.js";
export { createLogger, logger, LogLevel, type Logger } from "./core/index.js";
export {
  withTimeout,
  isRetryableError,
  delay,
  safeJsonParse,
  parseDbCount,
  generateEventId,
  generateUrlSignature,
  verifyUrlSignature,
  generateFeedbackUrl,
  parseFeedbackUrl,
} from "./core/index.js";
export {
  createConcurrencyLimiter,
  mapWithConcurrency,
  withConcurrencyLimit,
  isQueueTimeoutError,
  type ConcurrencyLimiterConfig,
  type ConcurrencyLimiter,
} from "./core/index.js";
export {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ExternalServiceError,
  LLMError,
  RateLimitError,
  CircuitBreakerOpenError,
  QueueTimeoutError,
  isAppError,
  isRetryableAppError,
  isExternalServiceError,
  getErrorMessage,
  getUserFriendlyMessage,
  getRetryInfo,
  formatErrorForLog,
  wrapError,
  enrichError,
  invariant,
  assertUnreachable,
} from "./core/index.js";
export type {
  // Request Context
  RequestContext,
  // Configuration Types
  Config,
  NodeEnvironment,
  LLMProvider,
  // Event Types
  Event,
  EventType,
  EventSeverity,
  EventPayload,
  EventMetadata,
  EventCorrelation,
  // Evidence Types
  Evidence,
  PRDiffEvidence,
  LogEntry,
  TimeSeriesDataPoint,
  TimeSeriesMetric,
  MetricsTimeRange,
  MetricsSummary,
  Metrics,
  GitCommit,
  SystemState,
  ServiceHealthStatus,
  DependencyStatus,
  DeploymentStatus,
  DependencyHealth,
  KnowledgeDocumentType,
  KnowledgeDocumentMetadata,
  KnowledgeDocument,
  RelatedEvent,
  TestFrameworkHint,
  // LLM Analysis Types
  LLMAnalysisResult,
  LLMCodeAnnotation,
  LLMSuggestedFix,
  ImpactAssessment,
  LLMRecommendedAction,
  EvidenceReference,
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
  LLMTestFailure,
  LLMLintError,
  LLMChangeCorrelation,
  // Failure Classification Types
  FailureCategory,
  PipelinePhase,
  // Action Proposal Types
  ActionProposal,
  ActionType,
  ActionPriority,
  SafetyLevel,
  ActionStatus,
  ExecutionDetails,
  ExecutionResult,
  // Confidence Scoring Types
  ConfidenceScoreBreakdown,
  ConfidenceScoreResult,
  LLMConfidenceLevel,
  FactorValues,
  ScoreTotals,
  // Validation Types
  ValidationResult,
  // Error Types
  ErrorContext,
  RetryInfo,
  // Signed URL Types
  SignedUrlParams,
  // Logger Internal Types
  StructuredLogEntry,
  // Multi-Tenant Types
  Tenant,
  TenantStatus,
  TenantEmbeddingTier,
  CreateTenantFromGitHub,
  LinkSlackWorkspace,
  TenantAuditAction,
  TenantAuditEntry,
  // Repository Channel Mapping Types
  RepositoryChannelMapping,
  CreateRepositoryChannelMapping,
  GitHubRepository,
  // Legacy Types (backward compatibility)
  WebhookEvent,
  CIFailureEvent,
  SlackMessageEvent,
  GitHubPREvent,
  GitHubPREventRepository,
  GitHubPREventPullRequest,
} from "./core/index.js";

// Database access
export {
  initDatabase,
  getPool,
  query,
  transaction,
  closeDatabase,
  isDatabaseHealthy,
  type QueryResult,
} from "./database/index.js";
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
} from "./database/index.js";
export {
  findChannelForRepository,
  findMappingsForChannel,
  findAllMappingsForTenant,
  getMappedRepositories,
  createMapping,
  deleteMapping,
  deleteMappingsForChannel,
  isMapped,
} from "./database/index.js";
export {
  // Vector types
  type DiffChunk,
  type CreateDiffChunkInput,
  type KnowledgeDocRecord,
  type CreateKnowledgeDocInput,
  type VectorSearchResult,
  type VectorSearchFilters,
  // Diff chunk repository
  createDiffChunk,
  createDiffChunksBatch,
  searchSimilarDiffChunks,
  getDiffChunksWithoutEmbeddings,
  updateDiffChunkEmbedding,
  deleteDiffChunksByPR,
  deleteDiffChunksByTenant,
  getDiffChunkCount,
  // Knowledge document repository
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
} from "./database/index.js";
export {
  // Feedback repository
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
  // Action proposal repository
  updateActionProposalStatus,
  getActionProposalById,
  getActionProposalsByAnalysis,
  getActionApprovalStats,
  type ActionProposalStatus,
  type UpdateActionStatusInput,
  type ActionProposalRecord,
  type ActionApprovalStats,
} from "./database/index.js";
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
} from "./database/index.js";
export {
  createAnalysis,
  getAnalysisById,
  getAnalysisByEventId,
  getAnalysesByModelVersion,
  countAnalysesByModelVersion,
  getAnalysesByTenant,
  countAnalysesByTenant,
  getAnalysesByTenantFiltered,
  countAnalysesByTenantFiltered,
  getAnalysesByEventIds,
  getConfidenceDistribution,
  getConfidenceTrend,
  findAnalysesByCommitSha,
  getAnalysisCountsByRepo,
  type CreateAnalysisInput,
  type AnalysisRecord,
  type AnalysisCountByRepo,
  type ConfidenceTrendPoint,
} from "./database/index.js";
export {
  // Event module
  createEvent,
  getEventsByTenant,
  countEventsByTenant,
  getEventsByTenantFiltered,
  countEventsByTenantFiltered,
  findEventIdByRepoAndCommit,
  type EventRecord,
  type EventListOptions,
  type CreateEventInput,
} from "./database/index.js";
export {
  // Webhook activity module
  createWebhookActivity,
  findWebhookActivityByDeliveryId,
  getWebhookActivitiesByTenant,
  countWebhookActivitiesByTenant,
  type WebhookActivityRecord,
  type WebhookActivityListOptions,
  type CreateWebhookActivityInput,
} from "./database/index.js";
export {
  // Incident alert module
  createIncidentAlert,
  getAlertById,
  findAlertByDeliveryId,
  updateAlertStatus,
  listIncidents,
  countIncidents,
  getAlertWithTriageResult,
  getStatsBySource,
  getActiveCountsBySource,
  getBalancedRecentIncidents,
  findIncidentsByCommitSha,
  type IncidentAlertRecord,
  type CreateIncidentAlertInput,
  type ListIncidentFilters,
  type PaginatedIncidentAlerts,
  type AlertWithTriageResult,
  type SourceStats,
  type ActiveCountBySource,
  // Incident dedup module
  findByFingerprint,
  upsertDedupEntry,
  cleanupExpiredEntries as cleanupExpiredDedupEntries,
  type IncidentDedupRecord,
  // Incident triage result module
  createTriageResult,
  getTriageResultById,
  getTriageResultByAlertId,
  updateTriageEnrichment,
  updateTriageAiSummary,
  updateTriageDispatchResults,
  searchSimilarTriageResults,
  getTriageStats,
  getSeverityDistributionBySource,
  type IncidentTriageResultRecord,
  type CreateTriageResultInput,
  type UpdateTriageEnrichmentInput,
  type UpdateTriageAiSummaryInput,
  type UpdateTriageDispatchInput,
  type TriageSimilarityResult,
  type SeverityDistributionEntry,
  type SeverityBySourceEntry,
  type TriageStats,
} from "./database/index.js";

// Investigation module
export {
  createInvestigation,
  getInvestigationById,
  listInvestigations,
  updateInvestigationStatus,
  updateInvestigationIntent,
  updateInvestigationEvidence,
  updateInvestigationCorrelation,
  updateInvestigationDiagnosis,
  updateInvestigationError,
  type InvestigationRecord,
  type CreateInvestigationInput,
  type UpdateInvestigationIntentInput,
  type ListInvestigationFilters,
  type PaginatedInvestigations,
} from "./database/index.js";

// User module (Authentication)
export {
  // Types
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
  // Lookup operations
  findUserById,
  findUserByEmail,
  findOAuthIdentity,
  findOAuthIdentitiesByUser,
  // Lifecycle operations
  createUser,
  updateLastLogin,
  updateUserTenant,
  deleteUser,
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
} from "./database/index.js";

// Provider connection module
export {
  type CIProviderType,
  type ProviderConnection,
  type CreateProviderConnectionInput,
  type UpdateProviderConnectionInput,
  findByTenant,
  findByTenantAndProvider,
  findConnectionById,
  findByExternalOrgId,
  findActiveByProvider,
  createProviderConnection,
  updateProviderConnection,
  deactivateConnection,
} from "./database/index.js";

// Subscription module (Plan tiers and tenant subscriptions)
export {
  // Types
  type PlanId,
  type SubscriptionStatus,
  type PlanLimitKey,
  type PlanFeatureKey,
  type PlanLimits,
  type PlanFeatures,
  type Plan,
  type TenantSubscription,
  type ChangePlanInput,
  type PlanUsage,
  type PlanLimitCheckResult,
  type SubscriptionWithPlan,
  type UsageLimitDetail,
  type SubscriptionUsageResponse,
  // Helpers
  validatePlanId,
  validateChangePlanInput,
  isWithinLimit,
  getPlanLimit,
  hasPlanFeature,
  getUsageForLimitKey,
  // Repository
  getAllPlans,
  getPlanById,
  getSubscriptionByTenant,
  getSubscriptionWithPlan,
  ensureSubscription,
  changePlan,
  getTenantUsage,
  checkPlanLimit,
  enforcePlanLimit,
} from "./database/index.js";

// Risk rules repository operations
export {
  createCustomRiskRule,
  getCustomRiskRules,
  getCustomRiskRuleById,
  updateCustomRiskRule,
  deleteCustomRiskRule,
  queryRiskAssessments,
  // Note: recordRiskAssessment is exported from safety/audit for general audit
  // The store pattern (via assessActionRiskWithContext) handles risk assessment recording
} from "./database/index.js";

// HTTP utilities
export {
  errorHandler,
  asyncHandler,
  requestLogger,
  requestContextMiddleware,
  authMiddleware,
  requireRole,
} from "./http/index.js";
export { getEffectiveTenantId, requireTenantMatch } from "./http/index.js";
export { validate, validators, type ValidationSchema } from "./http/index.js";
export {
  createRateLimiter,
  defaultRateLimiter,
  createRedisRateLimiter,
  defaultRedisRateLimiter,
  createRateLimitMiddleware,
  createProductionRateLimitMiddleware,
  type RateLimitOptions,
  type RateLimitInfo,
  type RateLimitMiddlewareConfig,
} from "./http/index.js";

// Rate limiting - full module exports
export {
  // Security utilities
  secureKeyGenerator,
  createKeyGenerator,
  getClientIP,
  validateIP,
  isValidIPv4,
  isValidIPv6,
  getIPVersion,
  isPrivateIP,
  createRequestFingerprint,
  extractIdentity,
  sanitizeIdentity,
  type ClientIPOptions,
  type SecureKeyOptions,
} from "./rateLimit/index.js";
export {
  // Burst detection
  BurstDetector,
  createBurstDetector,
  defaultBurstDetector,
} from "./rateLimit/index.js";
export {
  // Bot detection
  BotDetector,
  createBotDetector,
  defaultBotDetector,
  isBot,
  isSuspiciousBot,
  shouldBlockBot,
} from "./rateLimit/index.js";
export {
  // Geographic restrictions
  GeoRestriction,
  createGeoAllowlist,
  createGeoBlocklist,
  getCountryCode,
} from "./rateLimit/index.js";
export {
  // API key validation
  ApiKeyValidator,
  createApiKeyValidator,
  defaultApiKeyValidator,
  extractApiKey,
  apiKeyRateLimitKey,
} from "./rateLimit/index.js";
export {
  // Per-endpoint limits
  EndpointLimiter,
  createEndpointLimiter,
  createEndpointLimiterWithDefaults,
  COMMON_ENDPOINT_LIMITS,
} from "./rateLimit/index.js";
export {
  // Request signature verification
  SignatureVerifier,
  createSignatureVerifier,
  createSimpleSignatureVerifier,
} from "./rateLimit/index.js";
export {
  // Rate limit constants
  BURST_DETECTION_DEFAULTS,
  BOT_PATTERNS,
  BOT_DETECTION_DEFAULTS,
  GEO_RESTRICTION_DEFAULTS,
  API_KEY_DEFAULTS,
  ENDPOINT_LIMIT_DEFAULTS,
  SIGNATURE_DEFAULTS,
  CLOUDFLARE_IPV4_CIDRS,
} from "./rateLimit/index.js";
export type {
  // Rate limit types
  FallbackBehavior,
  TrustedProxyConfig,
  TenantRateLimitConfig,
  BurstDetectionConfig,
  BurstDetectionResult,
  BotDetectionConfig,
  BotDetectionResult,
  BotCategory,
  GeoRestrictionConfig,
  GeoRestrictionResult,
  GeoCategory,
  GeoReasonCode,
  ApiKeyConfig,
  ApiKeyLimit,
  ApiKeyValidationResult,
  EndpointLimitConfig,
  EndpointLimitsConfig,
  EndpointLimitResult,
  EndpointMatchMode,
  SignatureConfig,
  SignatureVerificationResult,
  SignedField,
  SecurityContext,
} from "./rateLimit/index.js";
export {
  resilientFetch,
  resilientGet,
  resilientPost,
  resilientPut,
  resilientPatch,
  resilientDelete,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  type ResilientRequestOptions,
  type ResilientResponse,
} from "./http/index.js";
export {
  signInternalRequest,
  verifyInternalSignature,
  INTERNAL_AUTH_HEADERS,
  createInternalAuthMiddleware,
  createSecurityHeaders,
} from "./http/index.js";
export {
  withCircuitBreaker,
  getCircuitStatus,
  resetCircuit,
  resetAllCircuits,
  getAllCircuitStatus,
  SERVICE_KEYS,
  type CircuitBreakerConfig,
  type CircuitBreakerStatus,
} from "./http/index.js";

// Formatting utilities
export {
  getConfidenceLabel,
  getConfidenceLabelParenthesized,
  getConfidenceColor,
  getConfidenceEmoji,
  truncateText,
  sanitizeIdPart,
  formatRelativeTime,
  pluralize,
  getRepoName,
  getFirstSentence,
  buildTruncatedList,
  formatConfidenceWithLabel,
} from "./formatting/index.js";
export {
  deduplicateByKey,
  containsAny,
  startsWithAny,
  shouldExcludePath,
  groupBy,
  takeMatching,
} from "./formatting/index.js";
export {
  formatDependencyChange,
  formatDependencyChanges,
  normalizeTestFilePath,
  extractValidFileLocation,
  canonicalizeEvidencePaths,
  extractServiceFromPath,
  formatServiceNameKebab,
  formatServiceNameTitle,
  stripAbsolutePaths,
  groupByServicePath,
  formatGroupedItems,
  type DependencyChange,
  type DependencyChangeType,
} from "./formatting/index.js";
export {
  resolveIdentifiedCause,
  resolveAnnotations,
  resolveRecommendedActions,
  resolveDependencyChanges,
  resolveBuildConfigChanges,
  type AnalysisLike,
  type ResolvedAnnotation,
  type ResolvedAction,
  type ResolvedDependencyChange,
} from "./formatting/index.js";
// Action review formatting
export {
  buildReviewActionText,
  type ReviewActionOptions,
  type ReviewActionText,
} from "./formatting/index.js";
// Simplified pipeline: Log preprocessing
export {
  stripAnsiCodes,
  stripCITimestamps,
  truncateWithErrorContext,
  preprocessLogs,
  preprocessLogsWithMetadata,
  detectTestFramework,
  // V1.1: Chunking pipeline preprocessing with line mapping
  sanitizeForChunking,
  sanitizeForChunkingWithMapping,
  getOriginalLineNumber,
  collapseRepeatedLines,
  removeProgressIndicators,
  type PreprocessResult,
  type TestFrameworkInfo,
  type SanitizationResult,
  type SanitizationResultWithMapping,
  type LineMapping,
} from "./formatting/index.js";
// Chunking pipeline - Stage 1: Smart chunking
export {
  estimateTokens as estimateChunkTokens,
  estimateTokensForLines,
  detectCIPlatform,
  detectProtectedZones,
  findNaturalBoundaries,
  chunkLog,
  normalizeChunkingOptions,
} from "./formatting/index.js";
// Chunking pipeline - Stage 2: Per-chunk extraction
export {
  buildChunkExtractorSystemPrompt,
  buildChunkExtractorPrompt,
  parseExtractionResponse,
  normalizeExtractionOptions,
  extractFromChunk,
  extractFromAllChunks,
  generateAssertionHash,
  CHUNK_EXTRACTOR_PROMPT_TEMPLATE,
  type ExtractorFunction,
} from "./formatting/index.js";
// Chunking pipeline - Stage 3: Aggregation and ranking
export {
  computeArtifactSignature,
  computeArtifactSignatureSync,
  computeAbsoluteEvidenceId,
  computePriorityScore,
  createRankedArtifact,
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
  aggregateArtifacts,
  checkAggregationViability,
  createEmptyAggregatedEvidence,
  determinePrimaryFailure,
  createDegradedResult,
  // V1.1: Degraded mode analysis
  sampleLogForDegradedMode,
  buildDegradedModePrompt,
  analyzeDegradedMode,
  // V1.1: Line mapping composition
  getSanitizedLineNumber,
  composeLineMappings,
} from "./formatting/index.js";
// Chunking pipeline types (prefixed to avoid conflicts with RAG/finetuning types)
export type {
  ChunkingOptions as LogChunkingOptions,
  ProtectedZone,
  ChunkResult,
  ChunkingResult,
  ExtractionOptions as ArtifactExtractionOptions,
  ExtractedArtifact,
  ExtractionResult as ArtifactExtractionResult,
  BatchExtractionResult,
  ArtifactSignature,
  RankedArtifact,
  AggregatedEvidence,
  BuildMetadata,
  FileAnnotation,
  RecommendedAction as ChunkingRecommendedAction,
  SecondaryFinding,
  TestFailureDetail,
  LintErrorDetail,
  RootCause,
  AnalysisMetadata,
  AnalysisResponse as ChunkingAnalysisResponse,
  PipelineConfig,
  PipelineResult,
  PipelineError,
  PrimaryFailure,
  DegradedModeAnalyzer,
} from "./formatting/index.js";
// Test summary parser (deterministic regex-based, no LLM)
export { parseTestSummary } from "./formatting/index.js";
export type { ParsedTestSummary } from "./formatting/index.js";
// Lint output parser (deterministic regex-based, no LLM)
export { parseLintOutput } from "./formatting/index.js";
// Simplified pipeline: Output formatting
export {
  formatGitHubComment,
  formatSlackMessage,
  type OutputContext,
  type GitHubCommentOutput,
  type SlackMessageOutput,
} from "./formatting/index.js";

// Integrations
export { fetchInstallationRepositories } from "./integrations/index.js";
export {
  buildSystemPrompt,
  buildAnalysisPrompt,
  formatEvent,
  formatEvidence,
  formatLogs,
  formatMetrics,
  formatGitHistory,
  formatRelatedEvents,
  formatKnowledgeDocs,
  formatPRDiffContext,
  estimateTokens,
  truncateEvidence,
} from "./integrations/index.js";
export {
  buildAnalysisFromArtifacts,
  getFinalAnalyzerPromptTemplate,
  validateAnalysisEvidenceIds,
  validateConfidenceRequirements,
  validateEnumFields,
  validateArrayCompleteness,
  extractValidEvidenceIds,
  type ArtifactAnalysisPrompt,
} from "./integrations/index.js";
export {
  buildTenantPromptAdditions,
  createTenantPromptConfig,
  validateTenantPromptConfig,
  type TenantPromptConfig,
  type TechStackConfig,
  type CISystem,
  type AnalysisDepth,
  type PromptPreferences,
  type FocusArea,
  type VerbosityLevel,
} from "./integrations/index.js";

// LLM module (provider-agnostic)
export type {
  LLMAnalysisProvider,
  LLMProviderConfig,
  AnalysisProviderConfig,
  EmbeddingProviderConfig,
  LLMProviderName,
} from "./llm/index.js";

// LLM JSON extraction
export { extractJsonFromResponse, parseJsonObject } from "./llm/index.js";

// LLM client factory (shared provider detection + SDK client creation)
export {
  isOpenRouterProvider,
  getEffectiveBaseUrl,
  createLLMSDKClient,
  getLLMSDKClient,
  resetLLMSDKClient,
} from "./llm/index.js";

// LLM client (via llm module)
export { LLMClient } from "./llm/index.js";
export {
  EmbeddingClient,
  getEmbeddingClient,
  clearClientCache,
  createEmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingProvider,
} from "./llm/index.js";

// Safety and confidence scoring
export {
  // Core scoring
  calculateConfidenceScore,
  getBaseScore,
  checkConsistency,
  determineActionGating,
  determineGatingDecision,
  confidenceScore,
  shouldActOnResult,
  // Helpers
  clampConfidenceScore,
  formatAdjustment,
  formatScore,
  normalizeText,
  containsKeyword,
  // Risk scoring (basic)
  assessActionRisk,
  isHighRiskAction,
  isIrreversibleAction,
  getRiskScoreConstants,
  // Risk scoring (contextual)
  assessActionRiskWithContext,
  isActionBlocked,
  isCurrentlyOffHours,
  setRiskIncidentMode,
  resolveContext,
  // Risk rules store
  getRiskRulesStore,
  setRiskRulesStore,
  resetRiskRulesStore,
  createInMemoryRiskRulesStore,
  InMemoryRiskRulesStore,
  // Combined safety check
  performCombinedSafetyCheck,
  isActionSafetyBlocked,
  getSafetyBlockReason,
  // Validation
  detectUncertainty,
  calculateEvidenceAlignment,
  assessCompleteness,
  validateAgainstKnowledgeBase,
  sanitizeLLMOutput,
  validateCommand,
  hasCodeInjection,
  sanitizeFilePath,
  // Hallucination detection
  checkForHallucinations,
  isLikelyHallucinated,
  getHallucinationRiskLevel,
  // Prompt injection detection
  detectPromptInjection,
  hasInjectionAttempt,
  shouldBlockInput,
  sanitizeInjectionAttempts,
  getInjectionSeverity,
  // Restrictions
  checkRestrictions,
  isActionRestricted,
  activateRestriction,
  deactivateRestriction,
  getManualRestrictions,
  clearAllManualRestrictions,
  addRestrictionRule,
  removeRestrictionRule,
  getRestrictionRules,
  activateIncidentMode,
  activateDeploymentFreeze,
  isInIncidentMode,
  // Audit
  recordAuditEntry,
  recordActionProposal,
  recordInjectionDetection,
  recordHallucinationDetection,
  recordRestrictionApplied,
  recordRiskAssessment,
  queryAuditEntries,
  countAuditEntries,
  getRecentAuditEntries,
  getAuditEntriesForRequest,
  getBlockedActions,
  setAuditStore,
  getAuditStore,
  resetAuditStore,
  createInMemoryAuditStore,
  // Types
  type GatingDecision,
  type ActionGatingResult,
  type AlignmentCheck,
  type CompletenessCheck,
  type ThresholdEntry,
  type LLMAnalysisLike,
  type EvidenceLike,
  type ConfidenceRange,
  type BlastRadius,
  type Reversibility,
  type DataImpact,
  type ActionRiskScore,
  type RiskAssessmentRule,
  type RiskScoreConstants,
  type OutputSanitizationResult,
  type CommandValidationResult,
  type HallucinationCheckResult,
  type HallucinationIndicator,
  type HallucinationIndicatorType,
  type InjectionDetectionResult,
  type InjectionMatch,
  type InjectionPatternType,
  type InjectionRecommendation,
  type RestrictionCheckResult,
  type ActiveRestriction,
  type RestrictionType,
  type RestrictionRule,
  type ScheduleConfig,
  type RestrictionContext,
  type SafetyAuditEntry,
  type SafetyRequestContext,
  type SafetyEventType,
  type AuditSeverity,
  type AuditDecision,
  type CreateAuditEntryInput,
  type AuditQueryOptions,
  type AuditStore,
  // Contextual risk types
  type RiskAssessmentContext,
  type ResolvedRiskContext,
  type ContextualActionRiskAssessment,
  type ApprovalRequirements,
  type CombinedSafetyCheckResult,
  // Risk rules store types
  type RiskRulesStore,
  type CustomRiskRule,
  type RiskAssessmentRecord,
  type CreateCustomRiskRuleInput,
  type UpdateCustomRiskRuleInput,
  type CreateRiskAssessmentInput,
  type RiskRulesQueryOptions,
  type RiskAssessmentsQueryOptions,
  type RiskEnvironment,
} from "./safety/index.js";

// Security utilities
export {
  redactSecrets,
  redactSecretsWithStats,
  redactObject,
  isForbiddenField,
  containsSecrets,
  detectSecretTypes,
  createCustomRedactor,
  type RedactionResult,
  // JWT utilities
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  // Encryption utilities (AES-256-GCM for data at rest)
  encryptValue,
  decryptValue,
  // Cookie utilities (httpOnly auth cookies)
  setAuthCookies,
  clearAuthCookies,
  extractAccessToken,
  extractRefreshToken,
  type AuthCookieTokens,
  // OAuth state store (Redis with in-memory fallback)
  createOAuthStateStore,
  type OAuthStoredState,
  type OAuthStateStore,
} from "./security/index.js";

// Action execution
export {
  executeAction,
  validateActionExecution,
  isActionExecutable,
  getExecutableActionTypes,
  enqueueAction,
  startActionQueueWorker,
  getActionQueueStats,
  getActionQueueStatsResult,
  storeActionPayload,
  retrieveActionPayload,
  deleteActionPayload,
  parseOpaqueActionValue,
  getActionStoreStats,
  clearActionStore,
  type ActionExecutionContext,
  type ActionExecutionResult,
  type ActionJobPayload,
  type ActionResultEvent,
  type StoredActionPayload,
  type OpaqueActionValue,
  type ActionVerificationContext,
  type ActionStoreStats,
  type QueueStatsResult,
} from "./actions/index.js";

// Constants (re-export all)
export * from "./constants/index.js";

// Redis queue and pub/sub
export {
  getRedisClient,
  getSubscriberClient,
  isRedisHealthy,
  waitForRedisConnection,
  closeRedis,
  publish,
  subscribe,
  createQueue,
  ciAnalysisQueue,
  slackNotificationQueue,
  githubActionQueue,
  CHANNELS,
  type RedisOptions,
  type QueueMessage,
  type ProcessResult,
  type MessageHandler,
  type SubscriptionHandler,
  type QueueConfig,
  type QueueManager,
  // Slack notification queue
  enqueueConsolidatedNotification,
  enqueueActionResultNotification,
  enqueueSystemAlert,
  startSlackNotificationWorker,
  getSlackNotificationQueueStats,
  type SlackNotificationType,
  type BaseNotificationPayload,
  type ConsolidatedCIFailurePayload,
  type ActionResultPayload,
  type SystemAlertPayload,
  type SlackNotificationPayload,
  type NotificationHandler,
  type WorkerOptions,
} from "./queue/index.js";

// Redis caching
export {
  // Core cache operations
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheExists,
  cacheTTL,
  cacheGetOrSet,
  cacheGetMany,
  getCacheStats,
  resetCacheStats,
  CACHE_TTL,
  CACHE_NAMESPACE,
  // GitHub cache
  getCachedPullRequest,
  cachePullRequest,
  getOrFetchPullRequest,
  getCachedPullRequestDiff,
  cachePullRequestDiff,
  getOrFetchPullRequestDiff,
  getOrFetchPullRequestCommits,
  getOrFetchPullRequestFiles,
  getOrFetchPullRequestComments,
  getOrFetchCommitPullRequests,
  getOrFetchCheckAnnotations,
  // Tenant cache
  toCachedTenant,
  toCachedMapping,
  getCachedTenantById,
  cacheTenantById,
  getOrFetchTenantById,
  getCachedTenantByInstallation,
  cacheTenantByInstallation,
  getOrFetchTenantByInstallation,
  getCachedTenantBySlackWorkspace,
  cacheTenantBySlackWorkspace,
  getOrFetchTenantBySlackWorkspace,
  getCachedChannelForRepo,
  cacheChannelForRepo,
  getOrFetchChannelForRepo,
  getCachedAllMappingsForTenant,
  cacheAllMappingsForTenant,
  getOrFetchAllMappingsForTenant,
  invalidateTenantCache,
  invalidateMappingCache,
  invalidateRepositoryMapping,
  // Analysis cache
  generateLogHash,
  getCachedCheckAnalysis,
  cacheCheckAnalysis,
  getOrFetchCheckAnalysis,
  getCachedAnalysisByLogHash,
  cacheAnalysisByLogHash,
  getOrFetchAnalysisByLogHash,
  buildCachedAnalysis,
  invalidateRepositoryAnalysisCache,
  hasAnalysisInCache,
  hasLogHashInCache,
  // Cache key utilities
  githubCacheKeys,
  tenantCacheKeys,
  mappingCacheKeys,
  analysisCacheKeys,
  // Types
  type CacheEntry,
  type CacheResult,
  type CacheSetOptions,
  type CacheStats,
  type CachedPullRequest,
  type CachedTenant,
  type CachedMapping,
  type CachedTenantStats,
  type CachedAnalysis,
  type CachedAnnotation,
  type CachedAction,
  type CachedComment,
  type CachedPRReference,
  type CachedCheckAnnotation,
} from "./cache/index.js";

// Redis-based aggregation
export {
  // Types
  type CodeAnnotation,
  type RecommendedAction,
  type TestFailureInfo,
  type RelatedKnowledgeDoc,
  type SuggestedFix,
  type NormalizedBuildEvent,
  type PendingCheckRun,
  type SerializedPendingCheckRun,
  type PendingAggregation,
  type AnalyzedFailure,
  type SerializedFailure,
  type PRContext,
  type WorkflowContext,
  type RepositoryInfo,
  type AggregatedFailures,
  type AggregationKey,
  type AggregationConfig,
  type ConsolidatedPostResult,
  type AggregationReadyCallback,
  type ConsolidatedAnalysisPayload,
  type FailureContext,
  type PendingCheckContext,
  // Utilities
  serializeAggregationKey,
  deserializeAggregationKey,
  DEFAULT_AGGREGATION_CONFIG,
  AGGREGATION_KEYS,
  // Redis operations
  addFailureToRedis,
  addPendingCheckToRedis,
  getAggregationFromRedis,
  getPendingAggregationFromRedis,
  deleteAggregationFromRedis,
  isDebounceExpired,
  isMaxWaitExceeded,
  findReadyAggregations,
  enqueueAggregation,
  enqueuePendingAggregation,
  // Workers
  startAggregatorWorker,
  startAnalysisQueueProcessor,
  deserializeQueuePayload,
  // Payload types
  type PendingAggregationPayload,
  type PendingAnalysisCallback,
  // Worker control types
  type WorkerControl,
  type ProcessorControl,
} from "./aggregation/index.js";

// CI provider port interfaces
export type {
  CIWebhookPort,
  CILogFetcherPort,
  FetchedBuildLogs,
  CIOutputPort,
} from "./ports/index.js";

// Health check utilities
export {
  // Types (HealthStatus comes from constants for consistency)
  type ComponentHealth,
  type ServiceHealth,
  type MemoryHealth,
  type HealthCheckConfig,
  // Health check functions
  getMemoryHealth,
  checkMemoryStatus,
  checkDatabaseHealth,
  checkRedisHealth,
  checkCircuitBreakerHealth,
  checkAllCircuitBreakers,
  performHealthCheck,
  livenessCheck,
  readinessCheck,
} from "./health/index.js";

// Graceful shutdown utilities
export {
  setupGracefulShutdown,
  registerCleanupHandler,
  isShuttingDown,
  getShutdownStatus,
  type CleanupFunction,
  type GracefulShutdownConfig,
} from "./shutdown/index.js";

// RAG (Retrieval-Augmented Generation) utilities
export {
  chunkText,
  chunkDiff,
  chunkKnowledgeDoc,
  splitMarkdownSections,
  estimateTokenCount,
  type ChunkMetadata,
  type TextChunk,
  type ChunkingOptions,
  type DiffChunkResult,
  type KnowledgeChunkResult,
  type MarkdownSection,
  // Ingestion functions
  ingestDiffChunks,
  ingestKnowledgeDoc,
  processPendingEmbeddings,
  type IngestDiffInput,
  type IngestDiffResult,
  type IngestKnowledgeDocInput,
  type IngestKnowledgeDocResult,
  // Metrics functions
  recordEmbeddingOperation,
  recordIngestionOperation,
  getEmbeddingMetrics,
  getIngestionMetrics,
  getRAGMetricsSnapshot,
  logRAGMetrics,
  checkRAGAlerts,
  resetMetrics,
  type EmbeddingMetrics,
  type IngestionMetrics,
  type RAGMetricsSnapshot,
  // Search functions
  searchDiffChunks,
  searchKnowledgeDocs,
  searchAll,
  searchFromEventContext,
  clearEmbeddingCache,
  type SearchQuery,
  type DiffSearchQuery,
  type KnowledgeSearchQuery,
  type RAGSearchResult,
  type EventQueryContext,
  // Governance functions
  getTenantRAGStats,
  purgeTenantRAGData,
  purgePRDiffChunks,
  purgeKnowledgeDocChunks,
  triggerReembedding,
  checkRAGHealth,
  type RAGTenantStats,
  type PurgeResult,
  type ReembeddingResult,
  type ReembeddingConfig,
  type RAGHealthStatus,
  // Evaluation functions
  calculateRecallAtK,
  calculateMRR,
  calculateHelpfulRate,
  recordRAGFeedback,
  runRAGTestCase,
  getRAGEvaluationMetrics,
  type RAGRelevance,
  type RAGFeedbackInput,
  type RAGEvaluationMetrics,
  type RetrievalResult,
  type RAGTestCase,
  type RAGTestResult,
  type FeedbackResult,
  // External knowledge functions
  syncDueSources,
  initGitHubIssuesConnector,
  registerConnector,
  type SyncAllResult,
  // Streaming updates functions
  handlePRMergeEvent,
  handleDocUpdateEvent,
  checkStaleness,
  markApproachingExpiry,
  cleanupExpired,
  refreshDiffChunk,
  refreshKnowledgeDoc,
  getStaleDocuments,
  type PRMergeEvent,
  type DocUpdateEvent,
  type StalenessResult,
  type CleanupResult,
  type TTLConfig,
  // Drift detection functions
  runTestSuite,
  generateDriftReport,
  checkMetricBounds,
  runDriftDetectionWithAlerts,
  type TestSuiteResult,
  type TestCaseResult,
  type DriftReport,
  type DriftMetricReport,
  type DriftAlert,
  type DriftDetectionWithAlertsResult,
  // Cost control functions
  getCachedEmbedding,
  cacheEmbedding,
  clearExpiredCache,
  clearCache,
  getCacheStats as getEmbeddingCacheStats,
  getCacheStats as getRAGCacheStats,
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
  type TierSelectionResult,
  type CacheStats as EmbeddingCacheStats,
  type TenantTierConfig,
  type BudgetAwareEmbeddingOptions,
  type BatchBudgetAwareEmbeddingOptions,
  type BudgetAwareEmbeddingResult,
  type BatchBudgetAwareEmbeddingResult,
  // Multi-hop RAG functions
  traverseGraph,
  expandWithRelatedDocs,
  getGraphStats,
  findPath,
  type GraphNode,
  type MultiHopResult,
  type MultiHopOptions,
  // PR fix comment detection and ingestion
  analyzeComment,
  findFixComments,
  extractFixKnowledge,
  isDuplicateKnowledge,
  ingestPRFixComments,
  createFailureContext,
  type PRComment,
  type PRFixFailureContext,
  type FixCommentAnalysis,
  type ExtractedFixKnowledge,
  type IngestPRFixCommentsInput,
  type FixCommentIngestionResult,
  type IngestPRFixCommentsResult,
  // Slack resolution detection and ingestion
  detectResolution,
  hasResolutionSignals,
  ingestSlackResolution,
  batchIngestSlackResolutions,
  type SlackMessage,
  type SlackReaction,
  type SlackThread,
  type DetectedResolution,
  type ResolutionDetectionResult,
  type IngestSlackResolutionInput,
  type SlackResolutionFailureContext,
  type IngestSlackResolutionResult,
  type BatchIngestSlackResolutionsResult,
  // Analysis lesson ingestion
  ingestAnalysisLesson,
  extractAnalysisContext,
  type AnalysisLessonContext,
  type IngestAnalysisLessonResult,
  // Reranking
  rerankResults,
  applyHardRules,
  fullRerank,
  type RerankableResult,
  type QueryContext,
  type RerankedResult,
  type RerankOptions,
  // Linked commit ingestion (failure context + commit messages + diff)
  trackPRFailure,
  getPRFailures,
  clearPRFailures,
  ingestLinkedCommitKnowledge,
  createFailureSummary,
  type FailureSummary,
  type PRFailureContext,
  type LinkedCommitInput,
  type LinkedCommitResult,
  // Relationship detection for multi-hop RAG
  findRelatedDocuments,
  createDetectedRelationships,
  detectAndCreateRelationships,
  type DocumentContext,
  type DetectedRelationship,
  type RelationshipDetectionResult,
  // Test case seeding for drift detection
  seedTestCases,
  getSeedTestCaseTemplates,
  getSeedTemplatesByCategory,
  getSeedCategories,
  type SeedTestCasesResult,
} from "./rag/index.js";

// Fine-tuning
export {
  buildTrainingExample,
  toOpenAIFormat,
  toJSONL,
  filterExamples,
  calculateDatasetStats,
  logDatasetStats,
  type TrainingExample,
  type FeedbackQualityLabel,
  type TrainingExampleMetadata,
  type OpenAITrainingRow,
  type TrainingExampleInput,
  type DatasetStats,
  type DatasetBuildOptions,
} from "./finetuning/index.js";
export {
  registerModelVersion,
  getModelVersion,
  getAllModelVersions,
  getBaselineModel,
  updateFeatureFlags,
  getFeatureFlags,
  setTenantModelOverride,
  removeTenantModelOverride,
  triggerRollback,
  clearRollback,
  isRollbackActive,
  selectModel,
  logModelSelection,
  type ModelVersion,
  type ModelMetadata,
  type EvaluationMetrics,
  type ModelFeatureFlags,
  type ABTestConfig,
  type ModelSelectionResult,
  type ModelSelectionReason,
} from "./finetuning/index.js";
export {
  extractTrainingDataset,
  validateExtractedDataset,
  type ExtractionOptions,
  type ExtractionResult,
} from "./finetuning/index.js";
export {
  uploadTrainingFile,
  deleteTrainingFile,
  createFineTuningJob,
  getFineTuningJob,
  cancelFineTuningJob,
  listFineTuningJobs,
  waitForFineTuningJob,
  submitFineTuningWorkflow,
  type FineTuningJobOptions,
  type FineTuningJobResult,
  type FileUploadOptions,
  type FileUploadResult,
  type FineTuningWorkflowResult,
  type ProgressCallback,
} from "./finetuning/index.js";
