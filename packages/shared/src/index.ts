export { config, type Config } from "./config.js";
export { OpenAIClient } from "./openaiClient/index.js";
export { VectorStore, InMemoryVectorStore } from "./vectorStore.js";
export {
  calculateConfidenceScore,
  determineActionGating,
  confidenceScore,
  shouldActOnResult,
} from "./safety/index.js";
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
} from "./prompts.js";
export { createLogger, logger, LogLevel } from "./logger.js";
export {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ExternalServiceError,
  LLMError,
  isAppError,
} from "./errors.js";
export { errorHandler, asyncHandler, requestLogger } from "./middleware.js";
export { validate, validators, type ValidationSchema } from "./validation.js";
export { createRateLimiter, defaultRateLimiter } from "./rateLimit.js";
export * from "./constants.js";
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
  // Legacy Types (backward compatibility)
  WebhookEvent,
  CIFailureEvent,
  SlackMessageEvent,
  GitHubPREvent,
} from "./types.js";

