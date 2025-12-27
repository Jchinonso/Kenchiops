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
  isAppError,
  getErrorMessage,
  formatErrorForLog,
  wrapError,
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
  ImpactAssessment,
  LLMRecommendedAction,
  EvidenceReference,
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
