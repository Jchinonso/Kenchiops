/**
 * Core module - fundamental infrastructure used by all services.
 */

// Configuration
export { config } from "./config.js";

// Logger
export { createLogger, logger, LogLevel, type Logger } from "./logger.js";

// Utilities
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
} from "./utils.js";

// Concurrency control
export {
  createConcurrencyLimiter,
  mapWithConcurrency,
  withConcurrencyLimit,
  isQueueTimeoutError,
  type ConcurrencyLimiterConfig,
  type ConcurrencyLimiter,
} from "./concurrency.js";

// Error handling
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
} from "./errors.js";

// Types
export type {
  // Request Context
  RequestContext,
  // Event Types
  Event,
  EventType,
  EventSeverity,
  EventPayload,
  EventMetadata,
  EventCorrelation,
  // Evidence Types
  Evidence,
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
  // Configuration Types
  Config,
  NodeEnvironment,
  LLMProvider,
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
  // Signed URL Types
  SignedUrlParams,
  // Logger Internal Types
  StructuredLogEntry,
  // Error Types
  ErrorContext,
  RetryInfo,
  // Health Check Types
  HealthStatus,
  ComponentHealth,
  MemoryHealth,
  ServiceHealth,
  HealthCheckConfig,
} from "./types.js";
