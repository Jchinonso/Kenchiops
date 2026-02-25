/**
 * Complete type definitions for the Kenchi DevOps Assistant.
 * Based on DATA_MODELS.md specifications.
 */

// ==================== Request Context ====================

/**
 * Request context for tracing and tenant isolation.
 * Must be propagated through all layers (handler → service → adapter).
 */
export interface RequestContext {
  /** UUID generated per request */
  readonly requestId: string;
  /** From auth/header (or "system" for jobs) */
  readonly tenantId: string;
  /** User/service identity */
  readonly actor?: string;
  /** OpenTelemetry trace ID if available */
  readonly traceId?: string;
}

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
  readonly repository?: string;
  readonly workflow?: string;
  readonly runId?: string;
  readonly branch?: string;
  readonly commit?: string;

  // Error fields
  readonly errorMessage?: string;
  readonly errorLog?: string;

  // Monitoring fields
  readonly alertId?: string;
  readonly metricName?: string;
  readonly metricValue?: number;
  readonly threshold?: number;

  // Common fields
  readonly url?: string;

  // Allow additional fields - use unknown for type safety
  readonly [key: string]: unknown;
}

export interface EventMetadata {
  readonly environment?: "production" | "staging" | "development" | "test";
  readonly service?: string;
  readonly team?: string;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

export interface Event {
  // Core identification
  readonly id: string; // Format: evt_<alphanumeric>
  readonly type: EventType;
  readonly source: string;
  readonly timestamp: string; // ISO 8601
  readonly severity?: EventSeverity;
  readonly title?: string;

  // Event-specific data
  readonly payload: EventPayload;

  // Additional context
  readonly metadata?: EventMetadata;

  // Audit timestamps
  readonly createdAt?: string;
  readonly updatedAt?: string;
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
  /** PR diff context for correlating failures with code changes. */
  readonly prDiffContext?: PRDiffEvidence;
  readonly collectedAt: string;
  readonly collectionDuration?: number;
}

/**
 * PR diff evidence for LLM analysis context.
 * Provides changed files and diff content to correlate with CI failures.
 */
export interface PRDiffEvidence {
  /** Pull request number */
  readonly prNumber: number;
  /** Files changed in the PR */
  readonly changedFiles: readonly string[];
  /** Unified diff content (truncated to MAX_DIFF_SIZE) */
  readonly diff: string;
  /** PR title for context */
  readonly title?: string;
  /** PR author */
  readonly author?: string;
  /** Base branch the PR targets */
  readonly baseBranch?: string;
}

// ==================== LLM Analysis Result Types ====================

export interface ImpactAssessment {
  readonly scope?: "isolated" | "service" | "system" | "organization";
  readonly affectedUsers?: "none" | "few" | "some" | "many" | "all";
  readonly businessImpact?: "none" | "low" | "medium" | "high" | "critical";
  readonly description?: string;
}

export interface LLMRecommendedAction {
  readonly actionType: string;
  readonly description: string;
  readonly reasoning?: string;
  readonly priority?: "immediate" | "high" | "medium" | "low";
}

export interface EvidenceReference {
  readonly type: "log" | "metric" | "commit" | "document" | "related_incident";
  readonly reference: string;
  readonly relevance?: string;
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
  readonly path: string;
  readonly line: number;
  readonly level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title?: string;
  /** AI-suggested fix for this issue */
  readonly suggestedFix?: LLMSuggestedFix;
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

/**
 * Change correlation between a modified function and failing tests.
 * Extracted by LLM from PR diff hunks and test failure data.
 */
export interface LLMChangeCorrelation {
  /** Function or method name extracted from diff hunk */
  readonly changedFunction: string;
  /** File path where the function was changed */
  readonly changedFile: string;
  /** Line number of the change in the diff */
  readonly changedLine?: number;
  /** Test names that exercise this function (empty if none fail) */
  readonly failingTests: readonly string[];
  /** Correlation confidence between the change and test failures */
  readonly correlation: "high" | "medium" | "low" | "none";
  /** Brief explanation of why this function likely caused the failures */
  readonly explanation: string;
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
  readonly eventId: string;
  readonly summary: string;
  readonly identifiedCause?: string;
  readonly impactAssessment?: ImpactAssessment;
  readonly confidence?: "very_low" | "low" | "medium" | "high" | "very_high";
  readonly confidenceScore?: number;
  readonly reasoning?: string;
  readonly codeAnnotations?: readonly LLMCodeAnnotation[];
  readonly recommendedActions?: readonly LLMRecommendedAction[];
  readonly uncertainties?: readonly string[];
  readonly evidenceUsed?: readonly EvidenceReference[];
  readonly relatedIncidents?: readonly string[];
  readonly nextSteps?: readonly string[];
  readonly analyzedAt: string;
  readonly llmModel?: string;
  readonly processingTime?: number;

  // Failure classification (Phase 4 - Language Agnostic)
  /** Type of failure: dependency, compile, test, runtime, config, infra, unknown */
  readonly category?: FailureCategory;
  /** Pipeline phase where failure occurred: dependency, build, test, deploy, runtime, unknown */
  readonly phase?: PipelinePhase;

  // AI-extracted structured data (Phase 3 - Language Agnostic)
  /** Dependency changes detected from PR diff (any package manager format) */
  readonly detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  /** Build config changes detected from PR diff (any build system) */
  readonly detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
  /** Structured test failures extracted by LLM with expected/actual values */
  readonly testFailures?: readonly LLMTestFailure[];
  /** Structured lint/compile errors extracted by LLM with specific symbols */
  readonly lintErrors?: readonly LLMLintError[];
  /** Command to run failing tests locally (LLM-generated based on detected framework) */
  readonly testCommand?: string;
  /** Correlations between changed functions and failing tests (from PR diff analysis) */
  readonly changeCorrelations?: readonly LLMChangeCorrelation[];
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
  readonly api?: string;
  readonly endpoint?: string;
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly parameters?: Record<string, unknown>;
  readonly command?: string;
  readonly script?: string;
}

export interface ExecutionResult {
  readonly success: boolean;
  readonly message?: string;
  readonly output?: string;
  readonly error?: string;
}

export interface ActionProposal {
  // Identification
  readonly id: string; // Format: act_<alphanumeric>
  readonly eventId: string;

  // Action specification
  readonly actionType: ActionType;
  readonly description: string;
  readonly reasoning?: string;

  // Confidence & safety
  readonly confidence: number; // 0.0 to 1.0
  readonly priority?: ActionPriority;
  readonly safetyLevel: SafetyLevel;
  readonly requiresApproval: boolean;
  readonly autoExecutable?: boolean;

  // Execution details
  readonly executionDetails?: ExecutionDetails;
  readonly expectedOutcome?: string;
  readonly rollbackPlan?: string;
  readonly estimatedDuration?: number;
  readonly dependencies?: readonly string[];

  // Lifecycle tracking
  readonly status?: ActionStatus;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly executedAt?: string;
  readonly completedAt?: string;
  readonly executionResult?: ExecutionResult;
  readonly createdAt?: string;
}

// ==================== Confidence Scoring Types ====================

/**
 * LLM confidence level - typed union to prevent silent fallback to default.
 * Used for base score mapping in confidence scoring.
 */
export type LLMConfidenceLevel = "very_low" | "low" | "medium" | "high" | "very_high";

/**
 * Factor values at each stage of processing.
 * Enables end-to-end traceability for debugging.
 */
export interface FactorValues {
  readonly uncertainty: number;
  readonly evidenceAlignment: number;
  readonly completeness: number;
  readonly knowledgeBaseValidation: number;
  readonly consistency: number;
}

/**
 * Score totals at each stage of computation.
 */
export interface ScoreTotals {
  /** Sum of weighted factor contributions */
  readonly weightedAdjustment: number;
  /** Base + weighted adjustment (before empty analysis cap) */
  readonly rawScore: number;
  /** After empty analysis cap (before final clamp) */
  readonly cappedScore: number;
  /** Final score after [0,1] clamp */
  readonly finalScore: number;
}

/**
 * Comprehensive breakdown for debugging and audit.
 * Shows values at each processing stage.
 */
export interface ConfidenceScoreBreakdown {
  /** LLM confidence level mapped to base score */
  readonly baseScore: number;
  /** Raw factor outputs from each module */
  readonly raw: FactorValues;
  /** After clamping to factor bounds */
  readonly bounded: FactorValues;
  /** After applying weights (what actually changed the score) */
  readonly weighted: FactorValues;
  /** Score totals at each stage */
  readonly totals: ScoreTotals;
}

export interface ConfidenceScoreResult {
  readonly finalScore: number;
  readonly breakdown: ConfidenceScoreBreakdown;
  readonly reasoning: readonly string[];
  readonly gatingDecision: "auto_approve" | "require_approval" | "block";
  /** Scoring algorithm version for audit traceability */
  readonly scoringVersion: string;
}

// ==================== Validation Types ====================

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
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
 * - active: Ready to use (provider connections are independent)
 * - suspended: Temporarily disabled
 * - deleted: Soft deleted
 *
 * Legacy values "pending_slack" and "pending_github" are kept in the type
 * for backward compatibility during migration but should not be used in new code.
 */
export type TenantStatus = "pending_slack" | "pending_github" | "active" | "suspended" | "deleted";

/**
 * Embedding tier names for RAG cost control.
 */
export type TenantEmbeddingTier = "LIGHT" | "STANDARD" | "PREMIUM";

/**
 * Tenant entity - represents a customer organization using Kenchi.
 * Provider-neutral: all provider-specific state lives in provider_connections.
 */
export interface Tenant {
  readonly id: string;
  readonly orgName: string;
  readonly provider: string;
  readonly status: TenantStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  // RAG budget configuration
  readonly ragMonthlyBudgetUsd: number;
  readonly ragPreferredTier: TenantEmbeddingTier;
  readonly ragAllowPremium: boolean;
  readonly ragDegradeOnBudgetWarning: boolean;
  /** Encryption key version: 1 = legacy global key, 2+ = per-tenant HKDF. */
  readonly encryptionKeyVersion: number;
}

/**
 * Data required to create a tenant from GitHub App installation.
 */
export interface CreateTenantFromGitHub {
  readonly orgName: string;
  readonly githubInstallationId: number;
}

/**
 * Data required to create a tenant from GitLab OAuth login.
 */
export interface CreateTenantFromGitLab {
  readonly gitlabGroupPath: string;
}

/**
 * Data required to create a tenant from Bitbucket OAuth login.
 */
export interface CreateTenantFromBitbucket {
  readonly bitbucketWorkspace: string;
}

/**
 * Data required to create a tenant from Azure DevOps OAuth login.
 */
export interface CreateTenantFromAzureDevOps {
  readonly azureDevOpsOrg: string;
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
  | "github_linked"
  | "gitlab_linked"
  | "bitbucket_linked"
  | "azure_devops_linked"
  | "slack_installed"
  | "slack_uninstalled"
  | "activated"
  | "suspended"
  | "deleted"
  | "ci_failure_processed"
  | "slack_message_sent"
  | "github_comment_posted"
  | "plan_changed"
  | "member_role_changed"
  | "member_removed"
  | "member_added"
  | "org_switched"
  | "membership_reconciled"
  | "member.sessions_revoked"
  | "tenant.sessions_revoked"
  | "checkout_started"
  | "payment_failed";

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

/** LLM provider type */
export type LLMProvider = "openai" | "openrouter";

/**
 * Application configuration interface.
 * Centralized configuration with type-safe environment variable parsing.
 */
export interface Config {
  // LLM Provider Configuration (provider-agnostic)
  /** LLM provider to use: "openai" or "openrouter" */
  readonly LLM_PROVIDER: LLMProvider;
  /** Custom base URL for OpenAI-compatible APIs (e.g., OpenRouter) */
  readonly LLM_BASE_URL?: string;
  /** API key for the LLM provider (overrides OPENAI_API_KEY) */
  readonly LLM_API_KEY?: string;
  /** Model identifier (overrides OPENAI_MODEL) */
  readonly LLM_MODEL?: string;
  /** Model for chunk extraction (defaults to Claude 3.5 Haiku on OpenRouter) */
  readonly EXTRACTION_MODEL?: string;

  // OpenAI Configuration (legacy, used as fallbacks)
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

  // Vercel CI Provider Configuration
  readonly VERCEL_WEBHOOK_SECRET?: string;
  readonly VERCEL_API_TOKEN?: string;

  // Netlify CI Provider Configuration
  readonly NETLIFY_WEBHOOK_SECRET?: string;
  readonly NETLIFY_API_TOKEN?: string;

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
  readonly INCIDENT_TRIAGE_URL: string;

  // Redis Configuration
  readonly REDIS_URL: string;

  // LLM Concurrency Configuration
  /** Maximum parallel LLM requests during batch analysis */
  readonly LLM_MAX_CONCURRENT_ANALYSIS?: number;
  /** Maximum time to wait in queue before timeout (ms) */
  readonly LLM_QUEUE_TIMEOUT_MS?: number;

  // Auth / JWT
  /** Secret for signing JWT access tokens */
  readonly JWT_SECRET?: string;
  /** 32-byte hex key for AES-256-GCM encryption of OAuth tokens at rest */
  readonly ENCRYPTION_KEY?: string;

  // GitHub OAuth App (separate from GitHub App)
  readonly GITHUB_OAUTH_CLIENT_ID?: string;
  readonly GITHUB_OAUTH_CLIENT_SECRET?: string;

  // GitLab OAuth
  readonly GITLAB_OAUTH_CLIENT_ID?: string;
  readonly GITLAB_OAUTH_CLIENT_SECRET?: string;

  // Bitbucket OAuth
  readonly BITBUCKET_OAUTH_CLIENT_ID?: string;
  readonly BITBUCKET_OAUTH_CLIENT_SECRET?: string;

  // Azure DevOps OAuth
  readonly AZURE_DEVOPS_OAUTH_CLIENT_ID?: string;
  readonly AZURE_DEVOPS_OAUTH_CLIENT_SECRET?: string;

  // Vercel Integration OAuth
  readonly VERCEL_OAUTH_CLIENT_ID?: string;
  readonly VERCEL_OAUTH_CLIENT_SECRET?: string;

  // Netlify Integration OAuth
  readonly NETLIFY_OAUTH_CLIENT_ID?: string;
  readonly NETLIFY_OAUTH_CLIENT_SECRET?: string;

  // Frontend URL (for OAuth redirects)
  readonly FRONTEND_URL: string;
  readonly OAUTH_CALLBACK_BASE_URL: string;

  // Internal service-to-service authentication
  /** Shared secret for HMAC-SHA256 signing of inter-service requests (fallback) */
  readonly INTERNAL_SERVICE_SECRET?: string;
  /** Per-service HMAC secrets — used when configured, falls back to INTERNAL_SERVICE_SECRET */
  readonly SERVICE_HMAC_SECRET_API?: string;
  readonly SERVICE_HMAC_SECRET_GITHUB_APP?: string;
  readonly SERVICE_HMAC_SECRET_SLACK_BOT?: string;
  readonly SERVICE_HMAC_SECRET_INCIDENT_TRIAGE?: string;
  /** Identifies the calling service for HMAC key resolution (e.g., "api", "github-app") */
  readonly SERVICE_NAME?: string;

  // Aggregation timing overrides
  readonly AGGREGATION_DEBOUNCE_MS?: number;
  readonly AGGREGATION_MAX_WAIT_MS?: number;

  // Stripe Billing
  /** Stripe secret key (sk_xxx) */
  readonly STRIPE_SECRET_KEY?: string;
  /** Stripe webhook signing secret (whsec_xxx) */
  readonly STRIPE_WEBHOOK_SECRET?: string;
  /** Stripe publishable key for frontend (pk_xxx) */
  readonly STRIPE_PUBLISHABLE_KEY?: string;
}

// ==================== Signed URL Types ====================

/**
 * Parameters for signed URL generation.
 */
export interface SignedUrlParams {
  readonly analysisId: string;
  readonly feedbackType: "correct" | "incorrect";
  readonly expiresAt: number;
}

// ==================== Logger Internal Types ====================

/**
 * Internal structured log entry format.
 * Used by the logger implementation for JSON-serialized output.
 * Not to be confused with the evidence LogEntry type used in analysis.
 */
export interface StructuredLogEntry {
  readonly level: number;
  readonly message: string;
  readonly timestamp: string;
  readonly service?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Logger interface for structured logging.
 */
export interface Logger {
  readonly debug: (message: string, metadata?: Record<string, unknown>) => void;
  readonly info: (message: string, metadata?: Record<string, unknown>) => void;
  readonly warn: (message: string, metadata?: Record<string, unknown>) => void;
  readonly error: (message: string, metadata?: Record<string, unknown>) => void;
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
  /** External service name override (e.g., "OpenRouter" vs "OpenAI"). */
  readonly service?: string;
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
