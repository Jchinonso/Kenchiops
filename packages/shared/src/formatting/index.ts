/**
 * Formatting Module
 *
 * Organized submodules for CI log analysis pipeline:
 * - preprocessing: Log sanitization, anchor selection, test framework detection
 * - chunking: Log chunking and protected zone detection
 * - extraction: Artifact extraction from chunks
 * - aggregation: Artifact ranking, deduplication, and aggregation
 * - analysis: Analysis types and field resolvers
 * - output: GitHub and Slack formatters
 *
 * @module formatting
 */

// ==================== Common Module ====================

export {
  // UI Helpers
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
  // Array Helpers
  deduplicateByKey,
  containsAny,
  startsWithAny,
  shouldExcludePath,
  groupBy,
  takeMatching,
  // Path Helpers
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
  // Dependency Formatters
  formatDependencyChange,
  formatDependencyChanges,
  // Action Review
  buildReviewActionText,
  // Types
  type ThresholdEntry,
  type TimeUnit,
  type ReviewActionOptions,
  type ReviewActionText,
  type DependencyChangeType,
  type DependencyChange,
} from "./common/index.js";

// ==================== Preprocessing Module ====================

export {
  // Anchor selection
  ANCHOR_TIERS,
  findBestAnchor,
  findBestErrorPosition,
  // Test framework detection
  detectTestFramework,
  detectTestFrameworkSimple,
  // Preprocessor
  stripAnsiCodes,
  stripCITimestamps,
  stripCIGroupMarkers,
  stripCITimestampsForPlatform,
  stripCIGroupMarkersForPlatform,
  truncateWithErrorContext,
  preprocessLogs,
  preprocessLogsWithMetadata,
  collapseRepeatedLines,
  removeProgressIndicators,
  sanitizeForChunking,
  // Line mapping helpers
  sanitizeForChunkingWithMapping,
  getOriginalLineNumber,
  getSanitizedLineNumber,
  composeLineMappings,
  // Types
  type CIPlatform,
  type TieredMatch,
  type AnchorResult,
  type TestFrameworkInfo,
  type PreprocessResult,
  type CollapseOptions,
  type CollapseResult,
  type ProgressRemovalOptions,
  type ProgressRemovalResult,
  type SanitizationResult,
  type SanitizationResultWithMapping,
} from "./preprocessing/index.js";

// ==================== Chunking Module ====================

export {
  // Helpers
  estimateTokens,
  estimateTokensForLines,
  detectCIPlatform,
  findNaturalBoundaries,
  normalizeChunkingOptions,
  // Protected zones
  detectProtectedZones,
  // Chunker
  chunkLog,
  // Types
  type ChunkingOptions,
  type ProtectedZone,
  type ChunkResult,
  type ChunkingResult,
  type LineMapping,
} from "./chunking/index.js";

// ==================== Extraction Module ====================

export {
  // Helpers
  generateAssertionHash,
  normalizeExtractionOptions,
  buildChunkExtractorSystemPrompt,
  buildChunkExtractorPrompt,
  CHUNK_EXTRACTOR_PROMPT_TEMPLATE,
  // Parser
  parseExtractionResponse,
  // Extractor
  extractFromChunk,
  extractFromAllChunks,
  // Types
  type ExtractorFunction,
  type ExtractionOptions,
  type ExtractedArtifact,
  type ExtractionResult,
  type BatchExtractionResult,
  type PrimaryFailure,
} from "./extraction/index.js";

// ==================== Aggregation Module ====================

export {
  // Signature
  computeArtifactSignature,
  computeArtifactSignatureSync,
  computeAbsoluteEvidenceId,
  // Ranking
  computePriorityScore,
  createRankedArtifact,
  deduplicateArtifacts,
  sortArtifactsByPriority,
  detectCommonFramework,
  // Primary failure
  determinePrimaryFailure,
  // Aggregator
  createDegradedResult,
  sampleLogForDegradedMode,
  buildDegradedModePrompt,
  analyzeDegradedMode,
  aggregateArtifacts,
  checkAggregationViability,
  createEmptyAggregatedEvidence,
  // Types
  type DegradedModeAnalyzer,
  type ArtifactSignature,
  type RankedArtifact,
  type AggregatedEvidence,
} from "./aggregation/index.js";

// ==================== Analysis Module ====================

export {
  // Resolvers
  resolveIdentifiedCause,
  resolveAnnotations,
  resolveRecommendedActions,
  resolveDependencyChanges,
  resolveBuildConfigChanges,
  // Types
  type AnalysisLike,
  type ResolvedAnnotation,
  type ResolvedAction,
  type ResolvedDependencyChange,
  type AnalysisResponse,
  type BuildMetadata,
  type FileAnnotation,
  type RecommendedAction,
  type SecondaryFinding,
  type TestFailureDetail,
  type LintErrorDetail,
  type RootCause,
  type AnalysisMetadata,
  type FailureCategory,
  type ConfidenceLevel,
} from "./analysis/index.js";

// ==================== Output Module ====================

export {
  // Formatters
  formatGitHubComment,
  formatSlackMessage,
  // Types
  type OutputContext,
  type GitHubCommentOutput,
  type SlackTextElement,
  type SlackBlockElement,
  type SlackBlock,
  type SlackMessageOutput,
} from "./output/index.js";

// ==================== Test Summary Parser ====================

export { parseTestSummary } from "./testSummaryParser.js";
export type { ParsedTestSummary } from "./extraction/types.js";

// ==================== Pipeline Module ====================

export type {
  PipelineConfig,
  PipelineResult,
  PipelineErrorCode,
  PipelineError,
} from "./pipeline/index.js";
