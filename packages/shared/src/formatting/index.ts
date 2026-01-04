/**
 * Formatting module - UI helpers and display utilities.
 */

// UI helpers
export {
  getConfidenceLabel,
  getConfidenceLabelParenthesized,
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

// CI formatters
export {
  collectCIErrors,
  formatDependencyChange,
  formatDependencyChanges,
  normalizeTestFailure,
  type CIAnnotation,
  type CITestFailure,
  type CollectErrorsOptions,
  type DependencyChange,
  type DependencyChangeType,
} from "./ciFormatters.js";
