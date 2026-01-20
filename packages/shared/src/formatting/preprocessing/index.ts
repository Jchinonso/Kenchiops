/**
 * Preprocessing Module
 *
 * Stage 0 of the CI log analysis pipeline - log sanitization,
 * anchor selection, and test framework detection.
 *
 * @module formatting/preprocessing
 */

// Types
export type {
  CIPlatform,
  TieredMatch,
  AnchorResult,
  TestFrameworkInfo,
  FrameworkPatternEntry,
  PreprocessResult,
  CollapseOptions,
  CollapseResult,
  ProgressRemovalOptions,
  ProgressRemovalResult,
  SanitizationResult,
  SanitizationResultWithMapping,
  CollapseAccumulatorState,
  LineMappingAccumulator,
  LineTransformResult,
} from "./types.js";

// Anchor Selection
export { ANCHOR_TIERS, findBestAnchor, findBestErrorPosition } from "./anchorSelection.js";

// Test Framework Detection
export { detectTestFramework, detectTestFrameworkSimple } from "./testFrameworkDetection.js";

// Preprocessor
export {
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
} from "./preprocessor.js";

// Line Mapping Helpers
export {
  sanitizeForChunkingWithMapping,
  getOriginalLineNumber,
  getSanitizedLineNumber,
  composeLineMappings,
} from "./lineMappingHelpers.js";
