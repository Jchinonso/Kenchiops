/**
 * Type definitions for CI failure aggregation.
 *
 * These types support consolidating multiple check run failures
 * into a single cohesive analysis before posting to GitHub/Slack.
 */

/**
 * AI-generated code annotation from analysis
 */
export interface CodeAnnotation {
  readonly path: string;
  readonly line: number;
  readonly level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title?: string;
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
  readonly timestamp: Date;
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
 * Serializes aggregation key to string for Map storage
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
 * Pending aggregation entry with timer
 */
export interface PendingAggregation {
  readonly key: AggregationKey;
  data: AggregatedFailures;
  timerId: NodeJS.Timeout | null;
}

/**
 * Configuration for failure aggregation
 */
export interface AggregationConfig {
  /** Time to wait after first failure before consolidating (ms) */
  readonly debounceMs: number;
  /** Maximum time to wait for aggregation (ms) */
  readonly maxWaitMs: number;
  /** Maximum failures to aggregate per commit */
  readonly maxFailuresPerCommit: number;
  /** Time after which stale entries are cleaned up (ms) */
  readonly staleEntryMs: number;
}

/**
 * Default aggregation configuration
 */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  debounceMs: 30_000, // 30 seconds after each failure
  maxWaitMs: 120_000, // 2 minutes max wait
  maxFailuresPerCommit: 20,
  staleEntryMs: 300_000, // 5 minutes
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
