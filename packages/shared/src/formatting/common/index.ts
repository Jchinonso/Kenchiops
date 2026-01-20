/**
 * Common Module
 *
 * Shared utilities for formatting including UI helpers, array
 * utilities, path handling, and dependency formatting.
 *
 * @module formatting/common
 */

// Types
export type {
  ThresholdEntry,
  TimeUnit,
  ReviewActionOptions,
  ReviewActionText,
  DependencyChangeType,
  DependencyChange,
} from "./types.js";

// UI Helpers
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

// Array Helpers
export {
  deduplicateByKey,
  containsAny,
  startsWithAny,
  shouldExcludePath,
  groupBy,
  takeMatching,
} from "./arrayHelpers.js";

// Path Helpers
export {
  normalizeTestFilePath,
  normalizeEvidencePath,
  extractValidFileLocation,
  extractServiceFromPath,
  formatServiceNameKebab,
  formatServiceNameTitle,
  groupByServicePath,
  formatGroupedItems,
  getPathBasename,
  buildCanonicalPathMap,
  resolveCanonicalPath,
  canonicalizeEvidencePaths,
  stripAbsolutePaths,
} from "./pathHelpers.js";

// Dependency Formatters
export { formatDependencyChange, formatDependencyChanges } from "./dependencyFormatters.js";

// Action Review Helpers
export { buildReviewActionText } from "./actionReviewHelpers.js";
