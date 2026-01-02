/**
 * Core module - fundamental infrastructure used by all services.
 */

// Configuration
export { config, type Config } from "./config.js";

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
  type SignedUrlParams,
} from "./utils.js";

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
  isAppError,
  isRetryableAppError,
  isExternalServiceError,
  getErrorMessage,
  getUserFriendlyMessage,
  getRetryInfo,
  formatErrorForLog,
  wrapError,
  enrichError,
  type ErrorContext,
} from "./errors.js";

// Types
export type {
  // Event Types
  Event,
  EventType,
  EventSeverity,
  EventPayload,
  EventMetadata,
  // Evidence Types
  Evidence,
  LogEntry,
  TimeSeriesMetric,
  MetricsSummary,
  Metrics,
  GitCommit,
  SystemState,
  KnowledgeDocument,
  RelatedEvent,
  // LLM Analysis Types
  LLMAnalysisResult,
  LLMCodeAnnotation,
  LLMSuggestedFix,
  ImpactAssessment,
  LLMRecommendedAction,
  EvidenceReference,
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
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
  // Validation Types
  ValidationResult,
  // Multi-Tenant Types
  Tenant,
  TenantStatus,
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
} from "./types.js";
