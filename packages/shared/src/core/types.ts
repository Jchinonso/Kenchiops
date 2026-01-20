/**
 * Complete type definitions for the Kenchi DevOps Assistant.
 * Based on DATA_MODELS.md specifications.
 */

// ==================== Event Types ====================

export type EventType =
  | "CICD_FAILURE"
  | "DEPLOYMENT_FAILURE"
  | "MONITORING_ALERT"
  | "PERFORMANCE_DEGRADATION"
  | "ERROR_SPIKE"
  | "SECURITY_ALERT"
  | "MANUAL_TRIGGER"
  | "SERVICE_DOWN"
  | "TEST_FAILURE";

export type EventSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface EventPayload {
  // CI/CD fields
  repository?: string;
  workflow?: string;
  runId?: string;
  branch?: string;
  commit?: string;

  // Error fields
  errorMessage?: string;
  errorLog?: string;

  // Monitoring fields
  alertId?: string;
  metricName?: string;
  metricValue?: number;
  threshold?: number;

  // Common fields
  url?: string;

  // Allow additional fields - use unknown for type safety
  [key: string]: unknown;
}

export interface EventMetadata {
  environment?: "production" | "staging" | "development" | "test";
  service?: string;
  team?: string;
  tags?: readonly string[];
  [key: string]: unknown;
}

export interface Event {
  // Core identification
  id: string; // Format: evt_<alphanumeric>
  type: EventType;
  source: string;
  timestamp: string; // ISO 8601
  severity?: EventSeverity;
  title?: string;

  // Event-specific data
  payload: EventPayload;

  // Additional context
  metadata?: EventMetadata;

  // Audit timestamps
  createdAt?: string;
  updatedAt?: string;
}

// ==================== Evidence Types ====================

/**
 * Detected test framework information for LLM assertion parsing hints.
 */
export interface TestFrameworkHint {
  /** Framework name (e.g., "pytest", "jest", "cargo-test"). */
  readonly name: string;
  /** Programming language (e.g., "Python", "JavaScript/TypeScript"). */
  readonly language: string;
  /** How expected/actual values are labeled in this framework. */
  readonly assertionHint: string;
}

/** Log level severity values. */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * Log entry from CI/CD or application logs.
 */
export interface LogEntry {
  /** Optional stable ID for cross-run traceability. */
  readonly id?: string;
  /** Source of the log (e.g., service name, job name). */
  readonly source?: string;
  /** ISO timestamp of the log entry. */
  readonly timestamp?: string;
  /** Log level severity. */
  readonly level?: LogLevel;
  /** Log message content. */
  readonly message: string;
  /** Stack trace if available. */
  readonly stackTrace?: string;
  /** Additional metadata. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Time series metric data point.
 */
export interface TimeSeriesDataPoint {
  readonly timestamp: string;
  readonly value: number;
}

/**
 * Time series metric with multiple data points.
 */
export interface TimeSeriesMetric {
  readonly metricName: string;
  readonly values: readonly TimeSeriesDataPoint[];
  readonly unit?: string;
}

/**
 * Summary statistics for metrics.
 */
export interface MetricsSummary {
  readonly errorRate?: number;
  readonly requestRate?: number;
  readonly cpuUsage?: number;
  readonly memoryUsage?: number;
  readonly latencyP50?: number;
  readonly latencyP95?: number;
  readonly latencyP99?: number;
  readonly [key: string]: unknown;
}

/**
 * Time range for metrics collection.
 */
export interface MetricsTimeRange {
  readonly start: string;
  readonly end: string;
}

/**
 * Collected metrics with time series and summary data.
 */
export interface Metrics {
  readonly timeRange?: MetricsTimeRange;
  readonly timeSeries?: readonly TimeSeriesMetric[];
  readonly summary?: MetricsSummary;
}

/**
 * Git commit information.
 */
export interface GitCommit {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly timestamp: string;
  readonly filesChanged?: readonly string[];
  readonly additions?: number;
  readonly deletions?: number;
  readonly url?: string;
}

/** Service health status values. */
export type ServiceHealthStatus = "healthy" | "degraded" | "down" | "unknown";

/** Dependency status values. */
export type DependencyStatus = "up" | "down" | "degraded";

/**
 * Deployment status information.
 */
export interface DeploymentStatus {
  readonly currentVersion?: string;
  readonly previousVersion?: string;
  readonly deployedAt?: string;
  readonly deployedBy?: string;
}

/**
 * Dependency health information.
 */
export interface DependencyHealth {
  readonly name: string;
  readonly status: DependencyStatus;
  readonly responseTime?: number;
}

/**
 * Current system state for context.
 */
export interface SystemState {
  readonly deploymentStatus?: DeploymentStatus;
  readonly serviceHealth?: Record<string, ServiceHealthStatus>;
  readonly dependencies?: readonly DependencyHealth[];
}

/** Knowledge document type values. */
export type KnowledgeDocumentType =
  | "runbook"
  | "past_incident"
  | "documentation"
  | "best_practice"
  | "playbook";

/**
 * Knowledge document metadata.
 */
export interface KnowledgeDocumentMetadata {
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly tags?: readonly string[];
}

/**
 * Knowledge document from RAG retrieval.
 */
export interface KnowledgeDocument {
  readonly id: string;
  readonly type: KnowledgeDocumentType;
  readonly title: string;
  readonly excerpt?: string;
  readonly similarity: number;
  readonly url?: string;
  readonly metadata?: KnowledgeDocumentMetadata;
}

/** Event correlation timing values. */
export type EventCorrelation = "before" | "after" | "concurrent";

/**
 * Related event for correlation analysis.
 */
export interface RelatedEvent {
  readonly eventId: string;
  readonly type: string;
  readonly timestamp: string;
  readonly correlation: EventCorrelation;
}

/**
 * Evidence collected for event analysis.
 */
export interface Evidence {
  readonly eventId: string;
  readonly logs?: readonly LogEntry[];
  readonly metrics?: Metrics;
  readonly gitHistory?: readonly GitCommit[];
  readonly systemState?: SystemState;
  readonly relatedDocs?: readonly KnowledgeDocument[];
  readonly relatedEvents?: readonly RelatedEvent[];
  /** Detected test framework for assertion parsing hints. */
  readonly testFramework?: TestFrameworkHint;
  readonly collectedAt: string;
  readonly collectionDuration?: number;
}

// ==================== LLM Analysis Result Types ====================

export interface ImpactAssessment {
  scope?: "isolated" | "service" | "system" | "organization";
  affectedUsers?: "none" | "few" | "some" | "many" | "all";
  businessImpact?: "none" | "low" | "medium" | "high" | "critical";
  description?: string;
}

export interface LLMRecommendedAction {
  actionType: string;
  description: string;
  reasoning?: string;
  priority?: "immediate" | "high" | "medium" | "low";
}

export interface EvidenceReference {
  type: "log" | "metric" | "commit" | "document" | "related_incident";
  reference: string;
  relevance?: string;
}

/**
 * Suggested code fix generated by AI analysis.
 * Provides actionable fix suggestions with before/after code snippets.
 */
export interface LLMSuggestedFix {
  /** Brief description of what the fix does */
  readonly description: string;
  /** The incorrect/problematic code (optional, for context) */
  readonly before?: string;
  /** The corrected code to replace it with */
  readonly after: string;
  /** Confidence in this fix suggestion (0-1) */
  readonly confidence: number;
  /** Programming language for syntax highlighting */
  readonly language?: string;
}

/**
 * Code annotation generated by AI analysis.
 * Points to specific file locations where errors or issues were detected.
 */
export interface LLMCodeAnnotation {
  path: string;
  line: number;
  level: "failure" | "warning" | "notice";
  message: string;
  title?: string;
  /** AI-suggested fix for this issue */
  suggestedFix?: LLMSuggestedFix;
}

/**
 * Dependency change detected by AI from PR diff.
 * Matches any package manager format (npm, pip, cargo, go, etc.)
 */
export interface LLMDetectedDependencyChange {
  readonly name: string;
  readonly type: "added" | "removed" | "updated";
  readonly oldVersion?: string;
  readonly newVersion?: string;
  readonly ecosystem?: string; // npm, pip, cargo, go, maven, etc.
}

/**
 * Build config change detected by AI from PR diff.
 * Works with any build system (webpack, tsconfig, pyproject, Makefile, etc.)
 */
export interface LLMDetectedBuildConfigChange {
  readonly file: string;
  readonly changeType: "added" | "modified" | "deleted";
  readonly summary: string; // Brief description of what changed
}

/**
 * Structured test failure extracted by LLM analysis.
 * Contains expected/actual values for assertion failures.
 */
export interface LLMTestFailure {
  /** Full test name including module/class path */
  readonly testName: string;
  /** File path where test is defined */
  readonly file?: string;
  /** Line number where failure occurred */
  readonly line?: number;
  /** Expected value from assertion (null if not an assertion failure) */
  readonly expected?: string | null;
  /** Actual/received value from assertion (null if not an assertion failure) */
  readonly actual?: string | null;
  /** Brief error description or assertion message */
  readonly error: string;
}

/**
 * Structured lint/compile error extracted by LLM analysis.
 * Contains specific variable/function names and locations.
 */
export interface LLMLintError {
  /** Error code from compiler/linter (e.g., "unused_variable", "E0425", "no-unused-vars") */
  readonly code: string;
  /** The specific error message */
  readonly message: string;
  /** File path where error occurred */
  readonly file: string;
  /** Line number */
  readonly line: number;
  /** Column number if available */
  readonly column?: number;
  /** The specific variable, function, type, or import name causing the error */
  readonly symbol?: string;
  /** Suggested fix from the compiler/linter if available */
  readonly suggestion?: string;
}

/** Failure category classification */
export type FailureCategory =
  | "dependency"
  | "build"
  | "test"
  | "runtime"
  | "config"
  | "infra"
  | "unknown";

/** Pipeline phase where failure occurred */
export type PipelinePhase = "dependency" | "build" | "test" | "deploy" | "runtime" | "unknown";

export interface LLMAnalysisResult {
  eventId: string;
  summary: string;
  identifiedCause?: string;
  impactAssessment?: ImpactAssessment;
  confidence?: "very_low" | "low" | "medium" | "high" | "very_high";
  confidenceScore?: number;
  reasoning?: string;
  codeAnnotations?: readonly LLMCodeAnnotation[];
  recommendedActions?: readonly LLMRecommendedAction[];
  uncertainties?: readonly string[];
  evidenceUsed?: readonly EvidenceReference[];
  relatedIncidents?: readonly string[];
  nextSteps?: readonly string[];
  analyzedAt: string;
  llmModel?: string;
  processingTime?: number;

  // Failure classification (Phase 4 - Language Agnostic)
  /** Type of failure: dependency, compile, test, runtime, config, infra, unknown */
  category?: FailureCategory;
  /** Pipeline phase where failure occurred: dependency, build, test, deploy, runtime, unknown */
  phase?: PipelinePhase;

  // AI-extracted structured data (Phase 3 - Language Agnostic)
  /** Dependency changes detected from PR diff (any package manager format) */
  detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  /** Build config changes detected from PR diff (any build system) */
  detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
  /** Structured test failures extracted by LLM with expected/actual values */
  testFailures?: readonly LLMTestFailure[];
  /** Structured lint/compile errors extracted by LLM with specific symbols */
  lintErrors?: readonly LLMLintError[];
  /** Command to run failing tests locally (LLM-generated based on detected framework) */
  testCommand?: string;
}

// ==================== Action Proposal Types ====================

export type ActionType =
  | "rollback_deployment"
  | "restart_service"
  | "scale_service"
  | "add_environment_variable"
  | "update_configuration"
  | "rerun_pipeline"
  | "notify_team"
  | "run_diagnostic"
  | "update_documentation"
  | "create_ticket"
  | "execute_runbook"
  | "manual_investigation";

export type ActionPriority = "immediate" | "high" | "medium" | "low";

export type SafetyLevel = "safe" | "low_risk" | "medium_risk" | "high_risk" | "dangerous";

export type ActionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "executing"
  | "completed"
  | "failed"
  | "rolled_back";

export interface ExecutionDetails {
  api?: string;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  parameters?: Record<string, unknown>;
  command?: string;
  script?: string;
}

export interface ExecutionResult {
  success: boolean;
  message?: string;
  output?: string;
  error?: string;
}

export interface ActionProposal {
  // Identification
  id: string; // Format: act_<alphanumeric>
  eventId: string;

  // Action specification
  actionType: ActionType;
  description: string;
  reasoning?: string;

  // Confidence & safety
  confidence: number; // 0.0 to 1.0
  priority?: ActionPriority;
  safetyLevel: SafetyLevel;
  requiresApproval: boolean;
  autoExecutable?: boolean;

  // Execution details
  executionDetails?: ExecutionDetails;
  expectedOutcome?: string;
  rollbackPlan?: string;
  estimatedDuration?: number;
  dependencies?: readonly string[];

  // Lifecycle tracking
  status?: ActionStatus;
  approvedBy?: string;
  approvedAt?: string;
  executedAt?: string;
  completedAt?: string;
  executionResult?: ExecutionResult;
  createdAt?: string;
}

// ==================== Confidence Scoring Types ====================

export interface ConfidenceScoreBreakdown {
  baseScore: number;
  uncertaintyAdjustment: number;
  evidenceAlignment: number;
  completeness: number;
  knowledgeBaseValidation: number;
  consistency: number;
}

export interface ConfidenceScoreResult {
  finalScore: number;
  breakdown: ConfidenceScoreBreakdown;
  reasoning: string[];
  gatingDecision: "auto_approve" | "require_approval" | "block";
}

// ==================== Validation Types ====================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ==================== Legacy Webhook Types ====================
// These types are kept for backward compatibility with existing services.
// New code should prefer the Event/Evidence/LLMAnalysisResult types.

/**
 * Generic webhook event from external sources.
 * @deprecated Use Event type instead for new code.
 */
export interface WebhookEvent {
  readonly source: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp?: string;
}

/**
 * CI failure event from GitHub Actions or similar CI systems.
 * @deprecated Use Event with type="CICD_FAILURE" instead.
 */
export interface CIFailureEvent {
  readonly repository: string;
  readonly branch: string;
  readonly commit: string;
  readonly failureLog: string;
  readonly jobName?: string;
  readonly timestamp: string;
}

/**
 * Slack message event for interactive messages.
 * @deprecated Use Event with source="slack" instead.
 */
export interface SlackMessageEvent {
  readonly channel: string;
  readonly user: string;
  readonly text: string;
  readonly timestamp: string;
  readonly threadTs?: string;
}

/**
 * GitHub repository info in PR event.
 */
export interface GitHubPREventRepository {
  readonly full_name: string;
  readonly owner: { readonly login: string };
  readonly name: string;
}

/**
 * GitHub pull request info in PR event.
 */
export interface GitHubPREventPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body?: string;
  readonly head: { readonly sha: string; readonly ref: string };
  readonly base: { readonly ref: string };
}

/**
 * GitHub pull request event.
 * @deprecated Use Event with source="github" instead.
 */
export interface GitHubPREvent {
  readonly action: string;
  readonly repository: GitHubPREventRepository;
  readonly pull_request: GitHubPREventPullRequest;
}

// ==================== Multi-Tenant Types ====================

/**
 * Tenant status in the multi-tenant lifecycle.
 * - pending_slack: GitHub installed, awaiting Slack connection
 * - pending_github: Slack installed, awaiting GitHub connection
 * - active: Both installed, ready to use
 * - suspended: Temporarily disabled
 * - deleted: Soft deleted
 */
export type TenantStatus = "pending_slack" | "pending_github" | "active" | "suspended" | "deleted";

/**
 * Embedding tier names for RAG cost control.
 */
export type TenantEmbeddingTier = "LIGHT" | "STANDARD" | "PREMIUM";

/**
 * Tenant entity - represents a customer organization using Kenchi.
 * Links a GitHub organization to a Slack workspace.
 */
export interface Tenant {
  readonly id: string;
  readonly githubOrg: string;
  readonly githubInstallationId: number | null;
  readonly githubAppInstalledAt: Date | null;
  readonly slackWorkspaceId: string | null;
  readonly slackTeamName: string | null;
  readonly slackBotToken: string | null;
  readonly slackBotUserId: string | null;
  readonly slackAppInstalledAt: Date | null;
  readonly status: TenantStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  // RAG budget configuration
  readonly ragMonthlyBudgetUsd: number;
  readonly ragPreferredTier: TenantEmbeddingTier;
  readonly ragAllowPremium: boolean;
  readonly ragDegradeOnBudgetWarning: boolean;
}

/**
 * Data required to create a tenant from GitHub App installation.
 */
export interface CreateTenantFromGitHub {
  readonly githubOrg: string;
  readonly githubInstallationId: number;
}

/**
 * Data required to link a Slack workspace to an existing tenant.
 */
export interface LinkSlackWorkspace {
  readonly tenantId: string;
  readonly slackWorkspaceId: string;
  readonly slackTeamName: string;
  readonly slackBotToken: string;
  readonly slackBotUserId?: string;
}

/**
 * Tenant audit log action types.
 */
export type TenantAuditAction =
  | "github_installed"
  | "github_uninstalled"
  | "slack_installed"
  | "slack_uninstalled"
  | "activated"
  | "suspended"
  | "deleted"
  | "ci_failure_processed"
  | "slack_message_sent"
  | "github_comment_posted";

/**
 * Tenant audit log entry.
 */
export interface TenantAuditEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly action: TenantAuditAction;
  readonly actor: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

// ==================== Repository Channel Mapping Types ====================

/**
 * Maps a GitHub repository to a Slack channel for CI notifications.
 */
export interface RepositoryChannelMapping {
  readonly id: string;
  readonly tenantId: string;
  readonly repository: string; // Full repo name: "owner/repo"
  readonly slackChannelId: string;
  readonly slackChannelName: string | null;
  readonly createdBy: string | null; // Slack user ID
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Data required to create a new repository-channel mapping.
 */
export interface CreateRepositoryChannelMapping {
  readonly tenantId: string;
  readonly repository: string;
  readonly slackChannelId: string;
  readonly slackChannelName?: string;
  readonly createdBy?: string;
}

/**
 * GitHub repository info from API.
 */
export interface GitHubRepository {
  readonly id: number;
  readonly fullName: string; // "owner/repo"
  readonly name: string;
  readonly owner: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

// ==================== Configuration Types ====================

/** Valid Node.js environment values. */
export type NodeEnvironment = "development" | "production" | "test";

/**
 * Application configuration interface.
 * Centralized configuration with type-safe environment variable parsing.
 */
export interface Config {
  // OpenAI Configuration
  readonly OPENAI_API_KEY: string;
  readonly OPENAI_MODEL?: string;
  readonly OPENAI_MAX_TOKENS?: number;
  readonly OPENAI_TEMPERATURE?: number;
  readonly OPENAI_TIMEOUT_MS?: number;

  // Slack Configuration (single-tenant mode - tokens in env vars)
  readonly SLACK_BOT_TOKEN: string;
  readonly SLACK_SIGNING_SECRET: string;
  readonly SLACK_APP_LEVEL_TOKEN: string;

  // Slack OAuth Configuration (multi-tenant mode - tokens in database)
  readonly SLACK_CLIENT_ID?: string;
  readonly SLACK_CLIENT_SECRET?: string;
  readonly SLACK_REDIRECT_URI?: string;

  // GitHub Configuration
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY: string;
  readonly GITHUB_INSTALLATION_ID: string;
  readonly GITHUB_WEBHOOK_SECRET: string;
  readonly GITHUB_APP_SLUG?: string;

  // Database Configuration
  readonly DATABASE_URL: string;
  readonly VECTOR_DB_URL: string;

  // General Configuration
  readonly NODE_ENV: NodeEnvironment;
  readonly PORT: number;

  // Multi-tenant Configuration
  readonly MULTI_TENANT_MODE?: boolean;

  // Feature Flags
  /** Enable simplified CI analysis pipeline (Phase 1 of pipeline simplification) */
  readonly SIMPLIFIED_PIPELINE_ENABLED?: boolean;

  // Service URLs (for inter-service communication)
  readonly API_URL: string;
  readonly SLACK_BOT_URL: string;
  readonly GITHUB_APP_URL: string;

  // Redis Configuration
  readonly REDIS_URL: string;

  // LLM Concurrency Configuration
  /** Maximum parallel LLM requests during batch analysis */
  readonly LLM_MAX_CONCURRENT_ANALYSIS?: number;
  /** Maximum time to wait in queue before timeout (ms) */
  readonly LLM_QUEUE_TIMEOUT_MS?: number;
}

// ==================== Error Types ====================

/**
 * Error context for enriched error reporting.
 * Provides structured metadata for logging and debugging.
 */
export interface ErrorContext {
  /** What operation was being performed. */
  readonly operation?: string;
  /** Correlation ID for distributed tracing. */
  readonly correlationId?: string;
  /** Whether the error is retryable. */
  readonly retryable?: boolean;
  /** When to retry (milliseconds). */
  readonly retryAfterMs?: number;
  /** User-friendly suggestion for resolution. */
  readonly suggestion?: string;
  /** Additional metadata for logging. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Retry information extracted from errors.
 */
export interface RetryInfo {
  /** Whether the error is retryable. */
  readonly retryable: boolean;
  /** When to retry (milliseconds). */
  readonly retryAfterMs?: number;
}

// ==================== Concurrency Types ====================
/** Configuration for creating a concurrency limiter. */
export interface ConcurrencyLimiterConfig {
  readonly maxConcurrent: number;
  readonly queueTimeoutMs?: number;
}
/** Semaphore-based concurrency limiter. */
export interface ConcurrencyLimiter {
  acquire(): Promise<void>;
  release(): void;
  availableSlots(): number;
  queueLength(): number;
  maxConcurrent(): number;
}
/** @internal */
export interface PendingWaiter {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: NodeJS.Timeout;
  resolved: boolean;
}

// ==================== Health Check Types ====================

/** Health status values. */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/** Individual component health check result. */
export interface ComponentHealth {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly latencyMs?: number;
  readonly details?: Record<string, unknown>;
}

/** Memory health information. */
export interface MemoryHealth {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly heapUsedPercent: number;
  readonly rss: number;
  readonly external: number;
}

/** Overall service health response. */
export interface ServiceHealth {
  readonly status: HealthStatus;
  readonly service: string;
  readonly version: string;
  readonly timestamp: string;
  readonly uptime: number;
  readonly environment: string;
  readonly components: readonly ComponentHealth[];
  readonly memory: MemoryHealth;
}

/** Configuration for health check. */
export interface HealthCheckConfig {
  readonly serviceName: string;
  readonly version: string;
  readonly environment: string;
  readonly includeDatabase?: boolean;
  readonly includeRedis?: boolean;
  readonly includeCircuitBreakers?: boolean;
}
