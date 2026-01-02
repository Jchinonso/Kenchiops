/**
 * Type definitions for CI failure aggregation.
 *
 * These types support consolidating multiple check run failures
 * into a single cohesive analysis before posting to GitHub/Slack.
 *
 * @module aggregation/types
 */

import { REDIS_KEY_PREFIXES, AGGREGATION_DEFAULTS } from "../constants/index.js";
import type {
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
  LLMSuggestedFix,
} from "../core/types.js";

// Re-export AI-extracted types from core (canonical definitions)
export type { LLMDetectedDependencyChange as DetectedDependencyChange } from "../core/types.js";
export type { LLMDetectedBuildConfigChange as DetectedBuildConfigChange } from "../core/types.js";
export type { LLMSuggestedFix as SuggestedFix } from "../core/types.js";

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
 * Individual test failure info for display
 */
export interface TestFailureInfo {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
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
  readonly timestamp: Date;
  // AI-extracted structured data (Phase 4 - Language Agnostic)
  readonly detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  readonly detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
  // RAG-retrieved related knowledge (Phase 2 - RAG Integration)
  readonly relatedKnowledge?: readonly RelatedKnowledgeDoc[];
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
  readonly timestamp: string; // ISO string instead of Date
  // AI-extracted structured data (Phase 4 - Language Agnostic)
  readonly detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  readonly detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
  // RAG-retrieved related knowledge (Phase 2 - RAG Integration)
  readonly relatedKnowledge?: readonly RelatedKnowledgeDoc[];
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
}

/**
 * Workflow timing context
 */
export interface WorkflowContext {
  readonly name: string;
  readonly duration: string;
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
}

/**
 * Key for aggregation (unique per commit in a repository)
 */
export interface AggregationKey {
  readonly repositoryFullName: string;
  readonly commitSha: string;
}

/**
 * Serializes aggregation key to string for Redis storage
 */
export const serializeAggregationKey = (key: AggregationKey): string =>
  `${key.repositoryFullName}:${key.commitSha}`;

/**
 * Deserializes aggregation key from string
 */
export const deserializeAggregationKey = (serialized: string): AggregationKey => {
  const lastColonIndex = serialized.lastIndexOf(":");
  return {
    repositoryFullName: serialized.substring(0, lastColonIndex),
    commitSha: serialized.substring(lastColonIndex + 1),
  };
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
  /** Hash storing failure data: kenchi:agg:{repo}:{sha}:failures */
  failures: (key: AggregationKey) =>
    `${REDIS_KEY_PREFIXES.AGGREGATION}:${key.repositoryFullName}:${key.commitSha}:failures`,
  /** Hash storing metadata: kenchi:agg:{repo}:{sha}:meta */
  metadata: (key: AggregationKey) =>
    `${REDIS_KEY_PREFIXES.AGGREGATION}:${key.repositoryFullName}:${key.commitSha}:meta`,
  /** Debounce lock key: kenchi:agg:{repo}:{sha}:debounce */
  debounce: (key: AggregationKey) =>
    `${REDIS_KEY_PREFIXES.AGGREGATION}:${key.repositoryFullName}:${key.commitSha}:debounce`,
  /** Pattern to find all aggregation keys */
  pattern: `${REDIS_KEY_PREFIXES.AGGREGATION}:*:meta`,
} as const;
