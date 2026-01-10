/**
 * Formatting module - UI helpers and display utilities.
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

// CI formatters
export {
  collectCIErrors,
  formatDependencyChange,
  formatDependencyChanges,
  normalizeTestFailure,
  normalizeTestFilePath,
  sanitizeTestFailureMessage,
  canonicalizeEvidencePaths,
  extractServiceFromPath,
  // Service name formatting
  formatServiceNameKebab,
  formatServiceNameTitle,
  // Path stripping
  stripAbsolutePaths,
  groupByServicePath,
  formatGroupedItems,
  // Test file detection (language-agnostic)
  isTestFile,
  // Cause extraction (language-agnostic)
  extractMeaningfulCause,
  // Phase 8: Failure classification
  classifyTestFailure,
  partitionByFailureType,
  // Phase 2: Suite counting
  countUniqueSuites,
  countUniqueFiles,
  // Phase 5: Evidence ID helpers
  generateTestEvidenceId,
  generateAnnoEvidenceId,
  generateCheckEvidenceId,
  generateLogEvidenceId,
  generateDiffEvidenceId,
  formatWithEvidenceId,
  formatEvidenceLocation,
  // Phase 1: Failure clustering
  clusterFailuresByService,
  selectBestClusterCause,
  scoreClusterSignal,
  isLowSignalCause,
  isEvidenceBackedCluster,
  summarizeRootCauses,
  type CIAnnotation,
  type CITestFailure,
  type CollectErrorsOptions,
  type DependencyChange,
  type DependencyChangeType,
  type FailureClassificationType,
  type PartitionedFailures,
  type FailureCluster,
  type RootCauseSummary,
  type RootCauseSummaryEntry,
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

// Flaky test detection
export {
  detectFlakyTests,
  isTestPotentiallyFlaky,
  formatFlakyTestWarning,
  type FlakyTestInfo,
  type FlakyTestResult,
  type TestFailureInput,
} from "./flakyTestDetection.js";

// Message variants
export {
  selectMessageVariant,
  truncateToLineLimit,
  formatOverflowMessage,
  getMaxRootCauses,
  getMaxFilesPerService,
  getMaxLines,
  type VariantSelectionInput,
  type VariantSelectionResult,
  type TruncatedLines,
} from "./messageVariants.js";

// PR context correlation
export {
  extractLinkedIssues,
  correlatePRChangesWithFailures,
  buildPRContextSection,
  correlatePRContext,
  type CorrelatedFailure,
  type PRCorrelationResult,
} from "./prContextCorrelation.js";
