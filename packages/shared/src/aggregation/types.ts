/**
 * Type definitions for CI failure aggregation.
 *
 * These types support consolidating multiple check run failures
 * into a single cohesive analysis before posting to GitHub/Slack.
 *
 * @module aggregation/types
 */

import { REDIS_KEY_PREFIXES, AGGREGATION_DEFAULTS, type CIProvider } from "../constants/index.js";
import type { getRedisClient } from "../queue/redisClient.js";
import type { ProcessResult } from "../queue/types.js";
import type {
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
  LLMSuggestedFix,
  LLMLintError,
  LLMChangeCorrelation,
} from "../core/types.js";
import type { ParsedTestSummary } from "../formatting/extraction/types.js";

// Re-export AI-extracted types from core (canonical definitions)
export type { LLMDetectedDependencyChange as DetectedDependencyChange } from "../core/types.js";
export type { LLMDetectedBuildConfigChange as DetectedBuildConfigChange } from "../core/types.js";
export type { LLMSuggestedFix as SuggestedFix } from "../core/types.js";
export type { LLMLintError as LintErrorInfo } from "../core/types.js";

/**
 * AI-generated code annotation from analysis
 */
export interface CodeAnnotation {
  readonly path: string;
  readonly line: number;
  readonly level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title?: string;
  /** AI-suggested fix for this issue */
  readonly suggestedFix?: LLMSuggestedFix;
  /**
   * V1.1: Original line number in raw log before preprocessing.
   * Enables accurate line references when logs are sanitized/chunked.
   */
  readonly original_line_number?: number | null;
}

/**
 * Recommended action from AI analysis
 */
export interface RecommendedAction {
  readonly description: string;
  readonly priority: string | number;
  readonly actionType?: string;
  readonly reasoning?: string;
}

/**
 * Individual test failure info for display.
 * Includes expected/actual values for assertion failures.
 */
export interface TestFailureInfo {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
  readonly error?: string;
  /** Expected value from assertion (from LLM extraction) */
  readonly expected?: string | null;
  /** Actual/received value from assertion (from LLM extraction) */
  readonly actual?: string | null;
}

/**
 * Related knowledge document from RAG retrieval
 */
export interface RelatedKnowledgeDoc {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly excerpt?: string;
  readonly url?: string;
  readonly similarity: number;
}

/**
 * Pending check run waiting for aggregation (before analysis)
 */
export interface PendingCheckRun {
  readonly checkRunId: number;
  readonly checkName: string;
  readonly conclusion: string;
  readonly timestamp: Date;
}

/**
 * Serializable version of PendingCheckRun for Redis storage
 */
export interface SerializedPendingCheckRun {
  readonly checkRunId: number;
  readonly checkName: string;
  readonly conclusion: string;
  readonly timestamp: string; // ISO string instead of Date
}

/**
 * Payload for pending aggregation jobs (checks without analysis).
 */
export interface PendingAggregationPayload {
  readonly pendingAggregation: {
    readonly commitSha: string;
    readonly repository: RepositoryInfo;
    readonly installationId: number;
    readonly pullRequestNumbers: readonly number[];
    readonly pendingChecks: readonly SerializedPendingCheckRun[];
    readonly firstFailureAt: string;
    readonly lastFailureAt: string;
    /** CI provider identifier. Uses string (not CIProvider) for forward compat with unknown providers in queue. */
    readonly provider?: string;
  };
}

/**
 * Aggregated pending checks for a single commit (before analysis)
 */
export interface PendingAggregation {
  readonly commitSha: string;
  readonly repository: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  readonly pendingChecks: readonly PendingCheckRun[];
  readonly firstFailureAt: Date;
  readonly lastFailureAt: Date;
  /** CI provider identifier. Optional for backward compat (defaults to github_actions). */
  readonly provider?: CIProvider;
}

/**
 * Result of analyzing a single check run failure
 */
export interface AnalyzedFailure {
  readonly checkRunId: number;
  readonly checkName: string;
  readonly conclusion: string;
  readonly confidence: number;
  readonly identifiedCause: string;
  readonly analysis: string;
  readonly annotations: readonly CodeAnnotation[];
  readonly recommendedActions: readonly RecommendedAction[];
  readonly testFailures: readonly TestFailureInfo[];
  readonly lintErrors?: readonly LLMLintError[];
  /** Command to run failing tests locally (LLM-generated based on detected framework) */
  readonly testCommand?: string;
  readonly timestamp: Date;
  // AI-extracted structured data (Phase 4 - Language Agnostic)
  readonly detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  readonly detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
  // RAG-retrieved related knowledge (Phase 2 - RAG Integration)
  readonly relatedKnowledge?: readonly RelatedKnowledgeDoc[];
  /** Deterministic test summary parsed from CI runner output via regex (not LLM-derived) */
  readonly parsedTestSummary?: ParsedTestSummary | null;
  /** Correlations between changed functions and failing tests (from LLM PR diff analysis) */
  readonly changeCorrelations?: readonly LLMChangeCorrelation[];
}

/**
 * Serializable version of AnalyzedFailure for Redis storage
 */
export interface SerializedFailure {
  readonly checkRunId: number;
  readonly checkName: string;
  readonly conclusion: string;
  readonly confidence: number;
  readonly identifiedCause: string;
  readonly analysis: string;
  readonly annotations: readonly CodeAnnotation[];
  readonly recommendedActions: readonly RecommendedAction[];
  readonly testFailures: readonly TestFailureInfo[];
  readonly lintErrors?: readonly LLMLintError[];
  /** Command to run failing tests locally (LLM-generated based on detected framework) */
  readonly testCommand?: string;
  readonly timestamp: string; // ISO string instead of Date
  // AI-extracted structured data (Phase 4 - Language Agnostic)
  readonly detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  readonly detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
  // RAG-retrieved related knowledge (Phase 2 - RAG Integration)
  readonly relatedKnowledge?: readonly RelatedKnowledgeDoc[];
  /** Deterministic test summary parsed from CI runner output via regex (not LLM-derived) */
  readonly parsedTestSummary?: ParsedTestSummary | null;
  /** Correlations between changed functions and failing tests (from LLM PR diff analysis) */
  readonly changeCorrelations?: readonly LLMChangeCorrelation[];
}

/**
 * PR context information
 */
export interface PRContext {
  readonly number: number;
  readonly title: string;
  readonly author: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly labels: readonly string[];
  /** Changed files in the PR for failure correlation (Phase 6) */
  readonly changedFiles?: readonly string[];
  /** Commit message for linked issue extraction (Phase 6) */
  readonly commitMessage?: string;
  /** Base branch SHA for diff comparison (Phase 6) */
  readonly baseBranchSha?: string;
}

/**
 * Workflow timing context
 */
export interface WorkflowContext {
  readonly name: string;
  readonly duration?: string;
}

/**
 * Repository information for aggregation
 */
export interface RepositoryInfo {
  readonly fullName: string;
  readonly owner: string;
  readonly name: string;
}

/**
 * Provider-agnostic build failure event.
 *
 * All CI providers normalize their webhook payloads to this shape
 * before entering the aggregation pipeline. This is the single
 * type that webhook adapters produce.
 */
export interface NormalizedBuildEvent {
  readonly provider: CIProvider;
  readonly buildId: string;
  readonly buildName: string;
  readonly conclusion: string;
  readonly commitSha: string;
  readonly branch?: string;
  readonly repository: RepositoryInfo;
  readonly pullRequestNumbers: readonly number[];
  readonly installationId: number;
  readonly timestamp: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Aggregated failures for a single commit
 */
export interface AggregatedFailures {
  readonly commitSha: string;
  readonly repository: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  readonly failures: readonly AnalyzedFailure[];
  readonly prContext: PRContext | null;
  readonly workflowContext: WorkflowContext | null;
  readonly firstFailureAt: Date;
  readonly lastFailureAt: Date;
  /** CI provider identifier. Optional for backward compat. */
  readonly provider?: CIProvider;
}

/**
 * Key for aggregation (unique per commit in a repository)
 */
export interface AggregationKey {
  readonly repositoryFullName: string;
  readonly commitSha: string;
  /** CI provider identifier. Optional for backward compat (defaults to github_actions). */
  readonly provider?: CIProvider;
}

/**
 * Serializes aggregation key to string for Redis storage.
 *
 * Format: {provider}:{repositoryFullName}:{commitSha}
 * Provider defaults to "github_actions" for backward compatibility.
 */
export const serializeAggregationKey = (key: AggregationKey): string =>
  `${key.provider ?? "github_actions"}:${key.repositoryFullName}:${key.commitSha}`;

/**
 * Deserializes aggregation key from string.
 *
 * Expected format: {provider}:{owner}/{repo}:{commitSha}
 * The provider is the first segment (no "/" character).
 * The repo name always contains "/" (owner/repo format).
 */
export const deserializeAggregationKey = (serialized: string): AggregationKey => {
  const firstColonIndex = serialized.indexOf(":");
  const lastColonIndex = serialized.lastIndexOf(":");
  const provider = serialized.substring(0, firstColonIndex) as CIProvider;
  const repositoryFullName = serialized.substring(firstColonIndex + 1, lastColonIndex);
  const commitSha = serialized.substring(lastColonIndex + 1);

  return { repositoryFullName, commitSha, provider };
};

/**
 * Configuration for failure aggregation
 */
export interface AggregationConfig {
  /** Time to wait after last failure before consolidating (ms) */
  readonly debounceMs: number;
  /** Maximum time to wait for aggregation (ms) */
  readonly maxWaitMs: number;
  /** Maximum failures to aggregate per commit */
  readonly maxFailuresPerCommit: number;
}

/**
 * Default aggregation configuration
 */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  debounceMs: AGGREGATION_DEFAULTS.DEBOUNCE_MS,
  maxWaitMs: AGGREGATION_DEFAULTS.MAX_WAIT_MS,
  maxFailuresPerCommit: AGGREGATION_DEFAULTS.MAX_FAILURES_PER_COMMIT,
} as const;

/**
 * Result of posting consolidated analysis
 */
export interface ConsolidatedPostResult {
  readonly success: boolean;
  readonly prCommentsPosted: number;
  readonly slackMessageSent: boolean;
  readonly checkAnnotationsCreated: boolean;
  readonly errors: readonly string[];
}

/**
 * Redis key prefixes for aggregation
 */
export const AGGREGATION_KEYS = {
  /** Hash storing failure data: kenchi:agg:{provider}:{repo}:{sha}:failures */
  failures: (key: AggregationKey) =>
    `${REDIS_KEY_PREFIXES.AGGREGATION}:${key.provider ?? "github_actions"}:${key.repositoryFullName}:${key.commitSha}:failures`,
  /** Hash storing metadata: kenchi:agg:{provider}:{repo}:{sha}:meta */
  metadata: (key: AggregationKey) =>
    `${REDIS_KEY_PREFIXES.AGGREGATION}:${key.provider ?? "github_actions"}:${key.repositoryFullName}:${key.commitSha}:meta`,
  /** Debounce lock key: kenchi:agg:{provider}:{repo}:{sha}:debounce */
  debounce: (key: AggregationKey) =>
    `${REDIS_KEY_PREFIXES.AGGREGATION}:${key.provider ?? "github_actions"}:${key.repositoryFullName}:${key.commitSha}:debounce`,
  /** Pattern to find all aggregation keys */
  pattern: `${REDIS_KEY_PREFIXES.AGGREGATION}:*:meta`,
} as const;

/**
 * Context for failure aggregation operations.
 */
export interface FailureContext {
  readonly repositoryInfo: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  readonly prContext: PRContext | null;
  readonly workflowContext: WorkflowContext | null;
  /** CI provider identifier. Optional for backward compat. */
  readonly provider?: CIProvider;
}

/**
 * Metadata stored in Redis for an aggregation (JSON-serialized fields).
 */
export interface AggregationMetadata {
  readonly repositoryFullName: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly pullRequestNumbers: string;
  readonly prContext: string | null;
  readonly workflowContext: string | null;
  readonly firstFailureAt: string;
  readonly lastFailureAt: string;
  /** CI provider identifier. Optional for backward compat. */
  readonly provider?: string;
}

/**
 * Redis key set for an aggregation.
 */
export interface AggregationKeySet {
  readonly failuresKey: string;
  readonly metadataKey: string;
  readonly debounceKey: string;
}

/**
 * Readiness check result for an aggregation key.
 */
export interface ReadinessResult {
  readonly key: AggregationKey;
  readonly isReady: boolean;
}

/**
 * Context for pending check aggregation.
 */
export interface PendingCheckContext {
  readonly repositoryInfo: RepositoryInfo;
  readonly installationId: number;
  readonly pullRequestNumbers: readonly number[];
  /** CI provider identifier. Optional for backward compat. */
  readonly provider?: CIProvider;
}

/**
 * Serialized pending check structure for Redis storage.
 */
export interface SerializedPendingCheckData {
  readonly checkRunId: number;
  readonly checkName: string;
  readonly conclusion: string;
  readonly timestamp: string;
}

/**
 * Log context for aggregation operations.
 */
export interface AggregationLogContext extends Record<string, unknown> {
  readonly repository: string;
  readonly commitSha: string;
}

// ==================== Queue Processor Types ====================

/**
 * Callback for pre-analyzed aggregation (legacy flow).
 */
export type AggregationReadyCallback = (
  aggregation: AggregatedFailures
) => Promise<ConsolidatedPostResult>;

/**
 * Callback for pending aggregation needing combined analysis (new flow).
 */
export type PendingAnalysisCallback = (
  payload: PendingAggregationPayload
) => Promise<ConsolidatedPostResult>;

/**
 * Callback invoked when the processor encounters an error.
 * Use for external health monitoring and alerting.
 */
export type ProcessorErrorCallback = (error: string, context?: Record<string, unknown>) => void;

/**
 * Stats for monitoring processor health.
 */
export interface ProcessorStats {
  readonly totalProcessed: number;
  readonly totalErrors: number;
  readonly lastProcessedAt: Date | null;
  readonly lastErrorAt: Date | null;
  readonly isRunning: boolean;
}

/**
 * Control interface for managing the processor.
 */
export interface ProcessorControl {
  /** Stops the processor gracefully. */
  readonly stop: () => void;
  /** Returns current processor statistics. */
  readonly getStats: () => ProcessorStats;
}

/**
 * Payload structure for consolidated analysis jobs.
 */
export interface ConsolidatedAnalysisPayload {
  readonly aggregation: {
    readonly commitSha: string;
    readonly repository: RepositoryInfo;
    readonly installationId: number;
    readonly pullRequestNumbers: readonly number[];
    readonly failures: readonly SerializedFailure[];
    readonly prContext: PRContext | null;
    readonly workflowContext: WorkflowContext | null;
    readonly firstFailureAt: string;
    readonly lastFailureAt: string;
  };
}

/**
 * Configuration options for the analysis queue processor.
 */
export interface AnalysisQueueProcessorOptions {
  readonly pollIntervalMs?: number;
  readonly maxConcurrent?: number;
  readonly onPendingReady?: PendingAnalysisCallback;
  /** Optional callback for processor errors (for health monitoring). */
  readonly onError?: ProcessorErrorCallback;
}

// ==================== Aggregator Worker Types ====================

/**
 * Callback invoked when the worker encounters an error.
 * Use for external health monitoring and alerting.
 */
export type WorkerErrorCallback = (error: string, context?: Record<string, unknown>) => void;

/**
 * Stats for monitoring worker health.
 */
export interface WorkerStats {
  readonly totalProcessed: number;
  readonly totalErrors: number;
  readonly lastPollAt: Date | null;
  readonly lastErrorAt: Date | null;
  readonly isRunning: boolean;
}

/**
 * Control interface for managing the worker.
 */
export interface WorkerControl {
  /** Stops the worker gracefully. */
  readonly stop: () => void;
  /** Returns current worker statistics. */
  readonly getStats: () => WorkerStats;
}

/**
 * Options for configuring the aggregator worker.
 */
export interface AggregatorWorkerOptions {
  readonly config?: AggregationConfig;
  readonly pollIntervalMs?: number;
  /** Optional callback for worker errors (for health monitoring). */
  readonly onError?: WorkerErrorCallback;
  /**
   * Optional pre-enqueue readiness check. Called for each aggregation
   * before it is dequeued from Redis. Return false to defer the aggregation
   * (it stays in Redis and will be checked again on the next poll).
   *
   * Use case: check GitHub for in-progress check runs before processing.
   */
  readonly beforeEnqueue?: (key: AggregationKey) => Promise<boolean>;
}

// ==================== Internal Aggregator Types ====================

/**
 * Redis client type from getRedisClient.
 */
export type RedisClient = ReturnType<typeof getRedisClient>;

/**
 * Parameters for adding an item to aggregation.
 */
export interface AddToAggregationParams {
  readonly key: AggregationKey;
  readonly checkRunId: number;
  readonly checkName: string;
  readonly serializedData: string;
  readonly failureContext: FailureContext;
  readonly config: AggregationConfig;
  readonly itemType: "failure" | "pending_check";
}

/**
 * Options for executing aggregation pipeline.
 */
export interface PipelineOptions {
  readonly redis: RedisClient;
  readonly keys: AggregationKeySet;
  readonly checkRunIdStr: string;
  readonly serializedData: string;
  readonly metadata: AggregationMetadata;
  readonly ttlSeconds: number;
  readonly debounceSeconds: number;
}

// ==================== Queue Processor Internal Types ====================

/**
 * Queue message structure for processing.
 */
export interface QueueMessage {
  readonly id: string;
  readonly payload: unknown;
  readonly timestamp: string;
  readonly retryCount?: number;
}

/**
 * Mutable state for controlling worker lifecycle.
 */
export interface ProcessorWorkerState {
  running: boolean;
  activeJobs: number;
  totalProcessed: number;
  totalErrors: number;
  lastProcessedAt: Date | null;
  lastErrorAt: Date | null;
}

/**
 * Async function that polls and recurses until stopped.
 */
export type WorkerLoop = () => Promise<void>;

/**
 * Message processor function type.
 */
export type MessageProcessor = (message: QueueMessage) => Promise<ProcessResult>;

// ==================== Aggregator Worker Internal Types ====================

/**
 * Mutable state for controlling aggregator worker lifecycle.
 */
export interface AggregatorWorkerState {
  running: boolean;
  totalProcessed: number;
  totalErrors: number;
  lastPollAt: Date | null;
  lastErrorAt: Date | null;
}

/**
 * Alias for WorkerLoop used in aggregator polling.
 */
export type PollingLoop = WorkerLoop;

/**
 * Result of enqueueing a single aggregation.
 */
export type AggregationEnqueueResult =
  | { readonly status: "success"; readonly key: AggregationKey }
  | { readonly status: "error"; readonly key: AggregationKey; readonly error: string };

/**
 * Result type for aggregation read operations.
 * Distinguishes between success, not found, and error states.
 */
export type AggregationReadResult<T> =
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "not_found" }
  | { readonly status: "error"; readonly error: string };
