/**
 * Log Preprocessor
 *
 * Minimal transformations for CI logs before LLM analysis:
 * - Strip ANSI color codes
 * - Strip CI timestamps
 * - Truncate with error context using tiered anchor selection
 *
 * Complex test failure extraction is handled by the LLM.
 *
 * @module formatting/preprocessing/preprocessor
 */

import { redactSecretsWithStats, type RedactionResult } from "../../security/redaction.js";
import {
  LOG_PARSING_LIMITS,
  TEXT_SANITIZATION_PATTERNS,
  TRUNCATION_WINDOW_CONFIG,
  LINE_COLLAPSE_CONFIG,
  PROGRESS_INDICATOR_PATTERNS,
  TRUNCATION_MARKER,
  ANCHOR_TIERS,
} from "../../constants/index.js";

import { findBestAnchor } from "./anchorSelection.js";
import { detectTestFramework, detectTestFrameworkSimple } from "./testFrameworkDetection.js";
import type {
  CIPlatform,
  AnchorResult,
  PreprocessResult,
  CollapseOptions,
  CollapseResult,
  ProgressRemovalOptions,
  ProgressRemovalResult,
  SanitizationResult,
  CollapseAccumulatorState,
} from "./types.js";

// Re-export for backward compatibility
export { detectTestFramework, detectTestFrameworkSimple };

// ==================== Constants ====================

/**
 * Tier-to-fraction mapping built from TRUNCATION_WINDOW_CONFIG.
 * Maps anchor tier number to the fraction of window to allocate before anchor.
 */
const TRUNCATION_BEFORE_FRACTION: Record<number, number> = {
  [ANCHOR_TIERS.SUMMARY]: TRUNCATION_WINDOW_CONFIG.SUMMARY_BEFORE_FRACTION,
  [ANCHOR_TIERS.CI_BOUNDARY]: TRUNCATION_WINDOW_CONFIG.CI_BOUNDARY_BEFORE_FRACTION,
  [ANCHOR_TIERS.INFRA_KILLER]: TRUNCATION_WINDOW_CONFIG.INFRA_KILLER_BEFORE_FRACTION,
  [ANCHOR_TIERS.STACK_TRACE]: TRUNCATION_WINDOW_CONFIG.STACK_TRACE_BEFORE_FRACTION,
  [ANCHOR_TIERS.GENERIC_ERROR]: TRUNCATION_WINDOW_CONFIG.GENERIC_ERROR_BEFORE_FRACTION,
  [ANCHOR_TIERS.FALLBACK]: TRUNCATION_WINDOW_CONFIG.FALLBACK_BEFORE_FRACTION,
};

// ==================== Core Functions ====================

/**
 * Strip ANSI color codes from log content.
 *
 * @param text - The text containing ANSI codes
 * @returns Text with ANSI codes removed
 */
export const stripAnsiCodes = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.ANSI_ESCAPE_CODES, "");

/**
 * Strip CI timestamps from log content.
 *
 * @param text - The text containing CI timestamps
 * @returns Text with timestamps removed from line starts
 */
export const stripCITimestamps = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_ALL, "");

/**
 * Strip CI group markers from log content.
 *
 * @param text - The text containing CI group markers
 * @returns Text with group markers removed
 */
export const stripCIGroupMarkers = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_GROUP_ALL, "");

/**
 * Strip CI timestamps for a specific platform.
 *
 * @param text - The text containing CI timestamps
 * @param platform - The CI platform identifier
 * @returns Text with platform-specific timestamps removed
 */
export const stripCITimestampsForPlatform = (text: string, platform: CIPlatform): string => {
  const platformPatterns: Record<CIPlatform, RegExp> = {
    github: TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_GITHUB,
    gitlab: TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_GITLAB,
    circleci: TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_CIRCLECI,
    jenkins: TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_JENKINS,
    azure: TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_AZURE,
  };
  return text.replace(platformPatterns[platform], "");
};

/**
 * Strip CI group markers for a specific platform.
 *
 * @param text - The text containing CI group markers
 * @param platform - The CI platform identifier
 * @returns Text with platform-specific group markers removed
 */
export const stripCIGroupMarkersForPlatform = (text: string, platform: CIPlatform): string => {
  const platformPatterns: Record<CIPlatform, RegExp> = {
    github: TEXT_SANITIZATION_PATTERNS.CI_GROUP_GITHUB,
    gitlab: TEXT_SANITIZATION_PATTERNS.CI_GROUP_GITLAB,
    circleci: TEXT_SANITIZATION_PATTERNS.CI_GROUP_CIRCLECI,
    jenkins: TEXT_SANITIZATION_PATTERNS.CI_GROUP_JENKINS,
    azure: TEXT_SANITIZATION_PATTERNS.CI_GROUP_AZURE,
  };
  return text.replace(platformPatterns[platform], "");
};

// ==================== Truncation Functions ====================

/**
 * Validate and clamp anchor position to ensure safe truncation.
 */
const validateAnchorPosition = (position: number, contentLength: number): number => {
  if (!Number.isFinite(position) || position < 0) {
    return Math.max(0, contentLength - 1);
  }
  return Math.min(position, contentLength - 1);
};

/**
 * Get the "before" fraction for truncation window based on anchor tier.
 */
const getBeforeFraction = (tier: number): number =>
  TRUNCATION_BEFORE_FRACTION[tier] ?? TRUNCATION_WINDOW_CONFIG.DEFAULT_BEFORE_FRACTION;

/**
 * Truncate content to max size, centered on CI failure indicators.
 *
 * @param content - The content to truncate
 * @param maxSize - Maximum size in characters
 * @returns Object with truncated content and anchor info
 */
export const truncateWithErrorContext = (
  content: string,
  maxSize: number = LOG_PARSING_LIMITS.MAX_LOG_SIZE
): { content: string; anchorInfo: AnchorResult } => {
  const anchorInfo = findBestAnchor(content);

  if (content.length <= maxSize) {
    return { content, anchorInfo };
  }

  const safePosition = validateAnchorPosition(anchorInfo.position, content.length);
  const beforeFraction = getBeforeFraction(anchorInfo.tier);
  const contextBefore = Math.floor(maxSize * beforeFraction);

  const start = Math.max(0, safePosition - contextBefore);
  const end = Math.min(content.length, start + maxSize);

  const safeStart = Math.floor(start);
  const safeEnd = Math.floor(end);

  const truncated = content.slice(safeStart, safeEnd);
  const prefix = safeStart > 0 ? `${TRUNCATION_MARKER}\n` : "";
  const suffix = safeEnd < content.length ? `\n${TRUNCATION_MARKER}` : "";

  return {
    content: prefix + truncated + suffix,
    anchorInfo,
  };
};

// ==================== Main Preprocessing Pipeline ====================

/**
 * Main preprocessing pipeline.
 *
 * @param rawLogs - The raw CI log content
 * @param maxSize - Maximum size after preprocessing
 * @returns Preprocessed log content
 */
export const preprocessLogs = (
  rawLogs: string,
  maxSize: number = LOG_PARSING_LIMITS.MAX_LOG_SIZE
): string => {
  const noAnsi = stripAnsiCodes(rawLogs);
  const noTimestamps = stripCITimestamps(noAnsi);
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);
  const { content: truncated } = truncateWithErrorContext(noGroupMarkers, maxSize);
  return truncated;
};

/**
 * Preprocess logs with full metadata and secret redaction.
 *
 * @param rawLogs - The raw CI log content
 * @param maxSize - Maximum size after preprocessing
 * @returns PreprocessResult with logs and metadata
 */
export const preprocessLogsWithMetadata = (
  rawLogs: string,
  maxSize: number = LOG_PARSING_LIMITS.MAX_LOG_SIZE
): PreprocessResult => {
  const originalSize = rawLogs.length;

  const noAnsi = stripAnsiCodes(rawLogs);
  const noTimestamps = stripCITimestamps(noAnsi);
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);
  const { content: truncated, anchorInfo } = truncateWithErrorContext(noGroupMarkers, maxSize);

  const redactionResult: RedactionResult = redactSecretsWithStats(truncated);
  const testFrameworkFull = detectTestFramework(rawLogs);
  const testFramework = testFrameworkFull ? detectTestFrameworkSimple(rawLogs) : undefined;

  const processedSize = redactionResult.text.length;
  const wasTruncated = truncated.includes(TRUNCATION_MARKER);

  return {
    logs: redactionResult.text,
    originalSize,
    processedSize,
    wasTruncated,
    secretsRedacted: redactionResult.redactedCount,
    secretTypes: redactionResult.redactedTypes,
    testFramework,
    anchorInfo,
  };
};

// ==================== Line Collapse Functions ====================

/**
 * Collapse identical consecutive lines to reduce log size.
 *
 * @param text - The text to process
 * @param options - Optional configuration
 * @returns CollapseResult with collapsed text and statistics
 */
export const collapseRepeatedLines = (
  text: string,
  options: CollapseOptions = {}
): CollapseResult => {
  const maxRepeats = options.maxRepeats ?? LINE_COLLAPSE_CONFIG.MAX_REPEATS;
  const lines = text.split("\n");

  if (lines.length === 0) {
    return { text, linesRemoved: 0, markersInserted: 0 };
  }

  const initial: CollapseAccumulatorState = {
    result: [],
    currentLine: null,
    repeatCount: 0,
    linesRemoved: 0,
    markersInserted: 0,
  };

  const finalState = lines.reduce<CollapseAccumulatorState>((accumulator, line) => {
    if (line === accumulator.currentLine) {
      const newRepeatCount = accumulator.repeatCount + 1;
      if (newRepeatCount <= maxRepeats) {
        return {
          ...accumulator,
          result: [...accumulator.result, line],
          repeatCount: newRepeatCount,
        };
      }
      return {
        ...accumulator,
        repeatCount: newRepeatCount,
        linesRemoved: accumulator.linesRemoved + 1,
      };
    }

    const pendingMarker =
      accumulator.repeatCount > maxRepeats
        ? [
            LINE_COLLAPSE_CONFIG.COLLAPSE_MARKER.replace(
              "%d",
              String(accumulator.repeatCount - maxRepeats)
            ),
          ]
        : [];

    const markersToAdd = pendingMarker.length > 0 ? 1 : 0;

    return {
      result: [...accumulator.result, ...pendingMarker, line],
      currentLine: line,
      repeatCount: 1,
      linesRemoved: accumulator.linesRemoved,
      markersInserted: accumulator.markersInserted + markersToAdd,
    };
  }, initial);

  const finalMarker =
    finalState.repeatCount > maxRepeats
      ? [
          LINE_COLLAPSE_CONFIG.COLLAPSE_MARKER.replace(
            "%d",
            String(finalState.repeatCount - maxRepeats)
          ),
        ]
      : [];

  const finalMarkersInserted = finalState.markersInserted + (finalMarker.length > 0 ? 1 : 0);

  return {
    text: [...finalState.result, ...finalMarker].join("\n"),
    linesRemoved: finalState.linesRemoved,
    markersInserted: finalMarkersInserted,
  };
};

// ==================== Progress Removal Functions ====================

/**
 * Remove progress indicators from log content.
 *
 * @param text - The text to process
 * @param options - Optional configuration
 * @returns ProgressRemovalResult with cleaned text and statistics
 */
export const removeProgressIndicators = (
  text: string,
  options: ProgressRemovalOptions = {}
): ProgressRemovalResult => {
  const patterns = [...PROGRESS_INDICATOR_PATTERNS, ...(options.additionalPatterns ?? [])];
  const lines = text.split("\n");

  const filteredLines = lines.filter((line) => {
    if (line.trim() === "") {
      return true;
    }
    return !patterns.some((pattern) => pattern.test(line));
  });

  return {
    text: filteredLines.join("\n"),
    linesRemoved: lines.length - filteredLines.length,
  };
};

// ==================== Sanitization Pipeline ====================

/**
 * Full sanitization pipeline for chunking.
 *
 * @param rawLogs - The raw CI log content
 * @returns SanitizationResult with sanitized text and statistics
 */
export const sanitizeForChunking = (rawLogs: string): SanitizationResult => {
  const originalSize = rawLogs.length;

  const noAnsi = stripAnsiCodes(rawLogs);
  const noTimestamps = stripCITimestamps(noAnsi);
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);
  const progressResult = removeProgressIndicators(noGroupMarkers);
  const collapseResult = collapseRepeatedLines(progressResult.text);
  const redactionResult = redactSecretsWithStats(collapseResult.text);

  const finalSize = redactionResult.text.length;
  const reductionPercent =
    originalSize > 0 ? Math.round(((originalSize - finalSize) / originalSize) * 100) : 0;

  return {
    text: redactionResult.text,
    originalSize,
    finalSize,
    reductionPercent,
    secretsRedacted: redactionResult.redactedCount,
    linesCollapsed: collapseResult.linesRemoved,
    progressLinesRemoved: progressResult.linesRemoved,
  };
};
