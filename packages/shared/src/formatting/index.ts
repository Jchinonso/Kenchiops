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
  stripCIGroupMarkers,
  stripCITimestampsForPlatform,
  stripCIGroupMarkersForPlatform,
  truncateWithErrorContext,
  preprocessLogs,
  preprocessLogsWithMetadata,
  detectTestFramework,
  detectTestFrameworkSimple,
  // MODIFIED FOR CHUNKING PIPELINE: New Stage 0 preprocessing exports
  collapseRepeatedLines,
  removeProgressIndicators,
  sanitizeForChunking,
  // V1.1: Line mapping support for original line number recovery
  sanitizeForChunkingWithMapping,
  getOriginalLineNumber,
  getSanitizedLineNumber,
  composeLineMappings,
  type CIPlatform,
  type PreprocessResult,
  type TestFrameworkInfo,
  type CollapseOptions,
  type CollapseResult,
  type ProgressRemovalOptions,
  type ProgressRemovalResult,
  type SanitizationResult,
  type SanitizationResultWithMapping,
  type LineMapping,
} from "./logPreprocessor.js";

// Anchor selection for log truncation
export { findBestAnchor, findBestErrorPosition, type AnchorResult } from "./anchorSelection.js";

// Chunking pipeline - Stage 1
export {
  estimateTokens,
  estimateTokensForLines,
  detectCIPlatform,
  detectProtectedZones,
  findNaturalBoundaries,
  chunkLog,
  normalizeChunkingOptions,
} from "./logChunking.js";

// Chunking pipeline - Stage 2
export {
  buildChunkExtractorSystemPrompt,
  buildChunkExtractorPrompt,
  parseExtractionResponse,
  normalizeExtractionOptions,
  extractFromChunk,
  extractFromAllChunks,
  CHUNK_EXTRACTOR_PROMPT_TEMPLATE,
  // V1.1: Assertion hash for deduplication discrimination
  generateAssertionHash,
  type ExtractorFunction,
} from "./chunkExtractor.js";

// Chunking pipeline - Stage 3
export {
  computeArtifactSignature,
  computeArtifactSignatureSync,
  computeAbsoluteEvidenceId,
  computePriorityScore,
  createRankedArtifact,
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
  aggregateArtifacts,
  checkAggregationViability,
  createEmptyAggregatedEvidence,
  // V1.1: Primary failure determination and degraded mode
  determinePrimaryFailure,
  createDegradedResult,
  sampleLogForDegradedMode,
  buildDegradedModePrompt,
  analyzeDegradedMode,
  type DegradedModeAnalyzer,
} from "./artifactAggregator.js";

// Chunking pipeline types
export type {
  ChunkingOptions,
  ProtectedZone,
  ChunkResult,
  ChunkingResult,
  ExtractionOptions,
  ExtractedArtifact,
  ExtractionResult,
  BatchExtractionResult,
  ArtifactSignature,
  RankedArtifact,
  AggregatedEvidence,
  BuildMetadata,
  FileAnnotation,
  RecommendedAction,
  SecondaryFinding,
  TestFailureDetail,
  LintErrorDetail,
  RootCause,
  AnalysisMetadata,
  AnalysisResponse,
  PipelineConfig,
  PipelineResult,
  PipelineError,
  // V1.1: New types for line mapping and primary failure
  PrimaryFailure,
} from "./chunkingTypes.js";

// Simplified pipeline: Output formatting
export {
  formatGitHubComment,
  formatSlackMessage,
  type OutputContext,
  type GitHubCommentOutput,
  type SlackMessageOutput,
} from "./outputFormatter.js";
