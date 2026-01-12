/**
 * Formatting module - UI helpers and display utilities.
 *
 * Simplified exports after pipeline refactor.
 */

// UI helpers
export {
  getConfidenceLabel,
  getConfidenceLabelParenthesized,
  formatConfidenceWithLabel,
  getConfidenceColor,
  getConfidenceEmoji,
  truncateText,
  sanitizeIdPart,
  formatRelativeTime,
  pluralize,
  getRepoName,
  getFirstSentence,
  buildTruncatedList,
} from "./uiHelpers.js";

// Array utilities
export {
  deduplicateByKey,
  containsAny,
  startsWithAny,
  shouldExcludePath,
  groupBy,
  takeMatching,
} from "./arrayUtils.js";

// CI formatters - path utilities and dependency formatting
export {
  formatDependencyChange,
  formatDependencyChanges,
  normalizeTestFilePath,
  extractValidFileLocation,
  canonicalizeEvidencePaths,
  extractServiceFromPath,
  formatServiceNameKebab,
  formatServiceNameTitle,
  stripAbsolutePaths,
  groupByServicePath,
  formatGroupedItems,
  type DependencyChange,
  type DependencyChangeType,
} from "./ciFormatters.js";

// Analysis resolvers
export {
  resolveIdentifiedCause,
  resolveAnnotations,
  resolveRecommendedActions,
  resolveDependencyChanges,
  resolveBuildConfigChanges,
  type AnalysisLike,
  type ResolvedAnnotation,
  type ResolvedAction,
  type ResolvedDependencyChange,
} from "./analysisResolvers.js";

// Action review formatting
export {
  buildReviewActionText,
  type ReviewActionOptions,
  type ReviewActionText,
} from "./actionReview.js";

// Simplified pipeline: Log preprocessing
export {
  stripAnsiCodes,
  stripCITimestamps,
  truncateWithErrorContext,
  preprocessLogs,
  preprocessLogsWithMetadata,
  type PreprocessResult,
} from "./logPreprocessor.js";

// Simplified pipeline: Output formatting
export {
  formatGitHubComment,
  formatSlackMessage,
  type OutputContext,
  type GitHubCommentOutput,
  type SlackMessageOutput,
} from "./outputFormatter.js";
