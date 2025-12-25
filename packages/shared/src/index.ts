/**
 * Kenchi Shared Package
 *
 * This package provides all shared functionality used across services.
 * Import everything from this package using: import { ... } from "@kenchi/shared";
 */

// Core infrastructure
export { config, type Config } from "./core/index.js";
export { createLogger, logger, LogLevel, type Logger } from "./core/index.js";
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
} from "./core/index.js";
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

// HTTP utilities
export { errorHandler, asyncHandler, requestLogger } from "./http/index.js";
export { validate, validators, type ValidationSchema } from "./http/index.js";
export { createRateLimiter, defaultRateLimiter } from "./http/index.js";

// Formatting utilities
export {
  getConfidenceLabel,
  getConfidenceLabelParenthesized,
  getConfidenceColor,
  getConfidenceEmoji,
  truncateText,
  formatRelativeTime,
  pluralize,
  getRepoName,
  getFirstSentence,
  buildTruncatedList,
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
  collectCIErrors,
  formatDependencyChange,
  formatDependencyChanges,
  type CIAnnotation,
  type CITestFailure,
  type CollectErrorsOptions,
  type DependencyChange,
  type DependencyChangeType,
} from "./formatting/index.js";

// Integrations
export { fetchInstallationRepositories } from "./integrations/index.js";
export { VectorStore, InMemoryVectorStore } from "./integrations/index.js";
export {
  buildSystemPrompt,
  buildAnalysisPrompt,
  formatEvent,
  formatEvidence,
  formatLogs,
  formatMetrics,
  formatGitHistory,
  formatKnowledgeDocs,
  estimateTokens,
  truncateEvidence,
} from "./integrations/index.js";

// OpenAI client
export { OpenAIClient } from "./openaiClient/index.js";

// Safety and confidence scoring
export {
  calculateConfidenceScore,
  determineActionGating,
  confidenceScore,
  shouldActOnResult,
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
} from "./security/index.js";

// Constants (re-export all)
export * from "./constants/index.js";
