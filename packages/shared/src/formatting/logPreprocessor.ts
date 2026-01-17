/**
 * Simplified Log Preprocessor
 *
 * Minimal transformations for CI logs before LLM analysis:
 * - Strip ANSI color codes
 * - Strip CI timestamps
 * - Truncate with error context using tiered anchor selection
 *
 * Complex test failure extraction is handled by the LLM.
 */

import { redactSecretsWithStats, type RedactionResult } from "../security/redaction.js";
import {
  LOG_PARSING_LIMITS,
  TEXT_SANITIZATION_PATTERNS,
  TRUNCATION_WINDOW_CONFIG,
  LINE_COLLAPSE_CONFIG,
  PROGRESS_INDICATOR_PATTERNS,
  LINE_NUMBER_CONFIG,
  PERCENTAGE_CONFIG,
} from "../constants/index.js";
import { findBestAnchor, ANCHOR_TIERS, type AnchorResult } from "./anchorSelection.js";
import {
  detectTestFramework,
  detectTestFrameworkSimple,
  type TestFrameworkInfo,
} from "./testFrameworkDetection.js";
import type { LineMapping } from "./chunkingTypes.js";

// Re-export for backward compatibility
export { detectTestFramework, detectTestFrameworkSimple, type TestFrameworkInfo };

// ==================== Constants ====================

/** Truncation marker */
const TRUNCATION_MARKER = "... [truncated] ...";

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

// ==================== Types ====================

/**
 * Result of preprocessing logs with metadata.
 */
export interface PreprocessResult {
  /** The preprocessed log content */
  readonly logs: string;
  /** Original log size in characters */
  readonly originalSize: number;
  /** Processed log size in characters */
  readonly processedSize: number;
  /** Whether the logs were truncated */
  readonly wasTruncated: boolean;
  /** Number of secrets redacted */
  readonly secretsRedacted: number;
  /** Types of secrets that were redacted */
  readonly secretTypes: readonly string[];
  /** Detected test framework (if any) */
  readonly testFramework?: Omit<TestFrameworkInfo, "confidence">;
  /** Anchor selection metadata (for diagnostics) */
  readonly anchorInfo?: AnchorResult;
}

// ==================== Core Functions ====================

/**
 * Strip ANSI color codes from log content.
 * Uses comprehensive pattern to handle all ANSI escape sequences.
 *
 * @param text - The text containing ANSI codes
 * @returns Text with ANSI codes removed
 */
export const stripAnsiCodes = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.ANSI_ESCAPE_CODES, "");

/**
 * Strip CI timestamps from log content.
 * Supports multiple CI platforms: GitHub Actions, GitLab CI, CircleCI, Jenkins, Azure DevOps.
 * Only strips CI-injected timestamps, not application output.
 *
 * @param text - The text containing CI timestamps
 * @returns Text with timestamps removed from line starts
 */
export const stripCITimestamps = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP_ALL, "");

/**
 * Strip CI group markers from log content.
 * Supports multiple CI platforms: GitHub Actions, GitLab CI, CircleCI, Jenkins, Azure DevOps.
 * These are presentation markers that don't contain error information.
 *
 * @param text - The text containing CI group markers
 * @returns Text with group markers removed
 */
export const stripCIGroupMarkers = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_GROUP_ALL, "");

/**
 * CI platform types for platform-specific stripping.
 */
export type CIPlatform = "github" | "gitlab" | "circleci" | "jenkins" | "azure";

/**
 * Strip CI timestamps for a specific platform.
 * Use this when you know the exact CI platform to avoid false positives.
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
 * Use this when you know the exact CI platform to avoid false positives.
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

/**
 * Validate and clamp anchor position to ensure safe truncation.
 *
 * @param position - Raw anchor position from findBestAnchor
 * @param contentLength - Length of the content being truncated
 * @returns Safe, clamped position
 */
const validateAnchorPosition = (position: number, contentLength: number): number => {
  // Handle invalid positions: NaN, Infinity, negative
  if (!Number.isFinite(position) || position < 0) {
    // Fallback: anchor near end of log to capture final failure context
    return Math.max(0, contentLength - 1);
  }

  // Clamp to valid range
  return Math.min(position, contentLength - 1);
};

/**
 * Get the "before" fraction for truncation window based on anchor tier.
 *
 * @param tier - Anchor tier from findBestAnchor result
 * @returns Fraction of maxSize to allocate before the anchor
 */
const getBeforeFraction = (tier: number): number =>
  TRUNCATION_BEFORE_FRACTION[tier] ?? TRUNCATION_WINDOW_CONFIG.DEFAULT_BEFORE_FRACTION;

/**
 * Truncate content to max size, centered on CI failure indicators.
 * Uses tiered anchor selection to prioritize meaningful error context.
 * Applies tier-aware window weights to capture appropriate context.
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

  // Validate anchor position to prevent invalid slicing
  const safePosition = validateAnchorPosition(anchorInfo.position, content.length);

  // Calculate tier-aware window: more context before for CI boundary markers,
  // more context after for stack traces where the trace continues
  const beforeFraction = getBeforeFraction(anchorInfo.tier);
  const contextBefore = Math.floor(maxSize * beforeFraction);

  // Calculate window bounds
  const start = Math.max(0, safePosition - contextBefore);
  const end = Math.min(content.length, start + maxSize);

  // Ensure we have valid integers
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

/**
 * Main preprocessing pipeline.
 * Applies all transformations in order: strip ANSI, strip timestamps, truncate.
 *
 * Note: Secret redaction should be applied separately using redactSecretsWithStats
 * to get redaction statistics.
 *
 * @param rawLogs - The raw CI log content
 * @param maxSize - Maximum size after preprocessing
 * @returns Preprocessed log content
 */
export const preprocessLogs = (
  rawLogs: string,
  maxSize: number = LOG_PARSING_LIMITS.MAX_LOG_SIZE
): string => {
  // Step 1: Strip ANSI color codes (comprehensive pattern)
  const noAnsi = stripAnsiCodes(rawLogs);

  // Step 2: Strip CI timestamps (only CI-injected)
  const noTimestamps = stripCITimestamps(noAnsi);

  // Step 3: Strip CI group markers
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);

  // Step 4: Truncate with error context
  const { content: truncated } = truncateWithErrorContext(noGroupMarkers, maxSize);

  return truncated;
};

/**
 * Preprocess logs with full metadata and secret redaction.
 * This is the main entry point for the simplified pipeline.
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

  // Step 1: Strip ANSI color codes
  const noAnsi = stripAnsiCodes(rawLogs);

  // Step 2: Strip CI timestamps
  const noTimestamps = stripCITimestamps(noAnsi);

  // Step 3: Strip CI group markers
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);

  // Step 4: Truncate with error context (get anchor info)
  const { content: truncated, anchorInfo } = truncateWithErrorContext(noGroupMarkers, maxSize);

  // Step 5: Redact secrets
  const redactionResult: RedactionResult = redactSecretsWithStats(truncated);

  // Step 6: Detect test framework (from original logs for full context)
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

// ==================== Chunking Pipeline Enhancements ====================

/**
 * Options for line collapse function.
 * MODIFIED FOR CHUNKING PIPELINE: Added to support Stage 0 preprocessing.
 */
export interface CollapseOptions {
  /** Maximum identical consecutive lines to keep (default: 3) */
  readonly maxRepeats?: number;
}

/**
 * Result of line collapse operation with statistics.
 * MODIFIED FOR CHUNKING PIPELINE: Added to support Stage 0 preprocessing.
 */
export interface CollapseResult {
  /** The collapsed text */
  readonly text: string;
  /** Number of lines removed */
  readonly linesRemoved: number;
  /** Number of collapse markers inserted */
  readonly markersInserted: number;
}

/**
 * Collapse identical consecutive lines to reduce log size.
 * Keeps the first N occurrences and adds a marker indicating how many were removed.
 *
 * ADDED FOR CHUNKING PIPELINE: Stage 0 preprocessing to reduce log size
 * while preserving semantic structure.
 *
 * @param text - The text to process
 * @param options - Optional configuration
 * @returns CollapseResult with collapsed text and statistics
 *
 * @example
 * ```typescript
 * const result = collapseRepeatedLines("a\na\na\na\na\nb");
 * // result.text: "a\na\na\n[repeated 2 more times]\nb"
 * // result.linesRemoved: 2
 * ```
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

  interface AccumulatorState {
    readonly result: readonly string[];
    readonly currentLine: string | null;
    readonly repeatCount: number;
    readonly linesRemoved: number;
    readonly markersInserted: number;
  }

  const initial: AccumulatorState = {
    result: [],
    currentLine: null,
    repeatCount: 0,
    linesRemoved: 0,
    markersInserted: 0,
  };

  const finalState = lines.reduce<AccumulatorState>((accumulator, line) => {
    // If this line matches the current repeated line
    if (line === accumulator.currentLine) {
      const newRepeatCount = accumulator.repeatCount + 1;

      // If we're still under the max, keep the line
      if (newRepeatCount <= maxRepeats) {
        return {
          ...accumulator,
          result: [...accumulator.result, line],
          repeatCount: newRepeatCount,
        };
      }

      // Otherwise, increment linesRemoved (we'll add marker at the end)
      return {
        ...accumulator,
        repeatCount: newRepeatCount,
        linesRemoved: accumulator.linesRemoved + 1,
      };
    }

    // Different line - flush any pending repeats
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

  // Handle any trailing repeats
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

/**
 * Options for progress indicator removal.
 * MODIFIED FOR CHUNKING PIPELINE: Added to support Stage 0 preprocessing.
 */
export interface ProgressRemovalOptions {
  /** Additional patterns to match (will be combined with defaults) */
  readonly additionalPatterns?: readonly RegExp[];
}

/**
 * Result of progress indicator removal with statistics.
 * MODIFIED FOR CHUNKING PIPELINE: Added to support Stage 0 preprocessing.
 */
export interface ProgressRemovalResult {
  /** The cleaned text */
  readonly text: string;
  /** Number of lines removed */
  readonly linesRemoved: number;
}

/**
 * Remove progress indicators from log content.
 * Strips progress bars, spinners, download percentages, and similar noise
 * that adds no diagnostic value.
 *
 * ADDED FOR CHUNKING PIPELINE: Stage 0 preprocessing to reduce log size
 * while preserving semantic structure.
 *
 * @param text - The text to process
 * @param options - Optional configuration
 * @returns ProgressRemovalResult with cleaned text and statistics
 *
 * @example
 * ```typescript
 * const result = removeProgressIndicators("Downloading... 50%\nDone!");
 * // result.text: "Done!"
 * // result.linesRemoved: 1
 * ```
 */
export const removeProgressIndicators = (
  text: string,
  options: ProgressRemovalOptions = {}
): ProgressRemovalResult => {
  const patterns = [...PROGRESS_INDICATOR_PATTERNS, ...(options.additionalPatterns ?? [])];

  const lines = text.split("\n");

  const filteredLines = lines.filter((line) => {
    // Keep empty lines (they may be meaningful separators)
    if (line.trim() === "") {
      return true;
    }

    // Remove lines matching any progress pattern
    return !patterns.some((pattern) => pattern.test(line));
  });

  return {
    text: filteredLines.join("\n"),
    linesRemoved: lines.length - filteredLines.length,
  };
};

/**
 * Result of full sanitization pipeline with statistics.
 * MODIFIED FOR CHUNKING PIPELINE: Added to support Stage 0 preprocessing.
 */
export interface SanitizationResult {
  /** The sanitized text */
  readonly text: string;
  /** Original size in characters */
  readonly originalSize: number;
  /** Final size in characters */
  readonly finalSize: number;
  /** Size reduction percentage */
  readonly reductionPercent: number;
  /** Number of secrets redacted */
  readonly secretsRedacted: number;
  /** Number of repeated lines collapsed */
  readonly linesCollapsed: number;
  /** Number of progress lines removed */
  readonly progressLinesRemoved: number;
}

/**
 * Full sanitization pipeline for chunking.
 * Applies all Stage 0 transformations in optimal order.
 *
 * ADDED FOR CHUNKING PIPELINE: Combines all preprocessing steps for
 * maximum size reduction before chunking.
 *
 * Order of operations:
 * 1. Strip ANSI codes (visual noise)
 * 2. Strip CI timestamps (redundant metadata)
 * 3. Strip CI group markers (presentation markers)
 * 4. Remove progress indicators (noise)
 * 5. Collapse repeated lines (redundancy)
 * 6. Redact secrets (MANDATORY before any LLM call)
 *
 * @param rawLogs - The raw CI log content
 * @returns SanitizationResult with sanitized text and statistics
 */
export const sanitizeForChunking = (rawLogs: string): SanitizationResult => {
  const originalSize = rawLogs.length;

  // Step 1: Strip ANSI color codes
  const noAnsi = stripAnsiCodes(rawLogs);

  // Step 2: Strip CI timestamps
  const noTimestamps = stripCITimestamps(noAnsi);

  // Step 3: Strip CI group markers
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);

  // Step 4: Remove progress indicators
  const progressResult = removeProgressIndicators(noGroupMarkers);

  // Step 5: Collapse repeated lines
  const collapseResult = collapseRepeatedLines(progressResult.text);

  // Step 6: Redact secrets (MANDATORY)
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

// ==================== Line Mapping Support ====================

/**
 * Result of sanitization with line mapping for original line recovery.
 * ADDED FOR CHUNKING PIPELINE: Enables tracing sanitized lines back to raw log.
 */
export interface SanitizationResultWithMapping extends SanitizationResult {
  /** Mappings from sanitized line numbers to original line numbers */
  readonly lineMappings: readonly LineMapping[];
}

/**
 * Internal state for line mapping accumulator.
 */
interface LineMappingAccumulator {
  readonly sanitizedLines: readonly string[];
  readonly lineMappings: readonly LineMapping[];
  readonly sanitizedLineNumber: number;
}

/**
 * Check if a line should be removed during preprocessing.
 *
 * @param line - The line to check
 * @param progressPatterns - Patterns for progress indicators
 * @returns True if the line should be removed
 */
const shouldRemoveLine = (line: string, progressPatterns: readonly RegExp[]): boolean => {
  // Keep empty lines as meaningful separators
  if (line.trim() === "") {
    return false;
  }

  // Remove lines matching progress patterns
  return progressPatterns.some((pattern) => pattern.test(line));
};

/**
 * Apply text transformations that don't change line count.
 *
 * @param line - The line to transform
 * @returns Transformed line and whether it was modified
 */
const transformLine = (
  line: string
): { readonly transformed: string; readonly wasModified: boolean } => {
  // Strip ANSI codes
  const noAnsi = stripAnsiCodes(line);
  // Strip CI timestamps (from line start)
  const noTimestamps = stripCITimestamps(noAnsi);
  // Strip CI group markers
  const noGroupMarkers = stripCIGroupMarkers(noTimestamps);

  const wasModified = noGroupMarkers !== line;
  return { transformed: noGroupMarkers, wasModified };
};

/**
 * Full sanitization pipeline with line mapping tracking.
 * Enables recovery of original line numbers for extracted artifacts.
 *
 * ADDED FOR CHUNKING PIPELINE: Tracks which original lines map to which
 * sanitized lines, enabling accurate line number references in PR annotations.
 *
 * @param rawLogs - The raw CI log content
 * @returns SanitizationResultWithMapping with line mappings
 */
export const sanitizeForChunkingWithMapping = (rawLogs: string): SanitizationResultWithMapping => {
  const originalSize = rawLogs.length;
  const originalLines = rawLogs.split("\n");
  const progressPatterns = [...PROGRESS_INDICATOR_PATTERNS];

  // Process each line, tracking mappings
  const initial: LineMappingAccumulator = {
    sanitizedLines: [],
    lineMappings: [],
    sanitizedLineNumber: 0,
  };

  const mappedResult = originalLines.reduce<LineMappingAccumulator>(
    (accumulator, originalLine, originalIndex) => {
      const originalLineNumber = originalIndex + LINE_NUMBER_CONFIG.ARRAY_TO_LINE_OFFSET;

      // Check if line should be removed (progress indicators)
      if (shouldRemoveLine(originalLine, progressPatterns)) {
        // Line removed - no mapping created
        return accumulator;
      }

      // Transform the line (strip ANSI, timestamps, etc.)
      const { transformed, wasModified } = transformLine(originalLine);

      // Add to result
      const newSanitizedLineNumber =
        accumulator.sanitizedLineNumber + LINE_NUMBER_CONFIG.ARRAY_TO_LINE_OFFSET;
      const newMapping: LineMapping = {
        sanitizedLine: newSanitizedLineNumber,
        originalLine: originalLineNumber,
        wasModified,
      };

      return {
        sanitizedLines: [...accumulator.sanitizedLines, transformed],
        lineMappings: [...accumulator.lineMappings, newMapping],
        sanitizedLineNumber: newSanitizedLineNumber,
      };
    },
    initial
  );

  // Join lines and apply remaining transformations
  const joinedText = mappedResult.sanitizedLines.join("\n");

  // Apply line collapse (affects line count, but mappings already established)
  // Note: For accurate mapping post-collapse, we track collapsed ranges separately
  const collapseResult = collapseRepeatedLines(joinedText);

  // Redact secrets (doesn't change line count)
  const redactionResult = redactSecretsWithStats(collapseResult.text);

  const finalSize = redactionResult.text.length;
  const reductionPercent =
    originalSize > 0
      ? Math.round(
          ((originalSize - finalSize) / originalSize) * PERCENTAGE_CONFIG.DECIMAL_TO_PERCENT
        )
      : 0;

  const progressLinesRemoved = originalLines.length - mappedResult.sanitizedLines.length;

  return {
    text: redactionResult.text,
    originalSize,
    finalSize,
    reductionPercent,
    secretsRedacted: redactionResult.redactedCount,
    linesCollapsed: collapseResult.linesRemoved,
    progressLinesRemoved,
    lineMappings: mappedResult.lineMappings,
  };
};

/**
 * Converts a sanitized line number back to original line number.
 * Uses the line mappings from sanitizeForChunkingWithMapping.
 *
 * @param lineMappings - The line mappings from sanitization
 * @param sanitizedLine - The sanitized line number (1-indexed)
 * @returns Original line number, or null if not found
 */
export const getOriginalLineNumber = (
  lineMappings: readonly LineMapping[],
  sanitizedLine: number
): number | null => {
  const mapping = lineMappings.find((lineMapping) => lineMapping.sanitizedLine === sanitizedLine);
  return mapping?.originalLine ?? null;
};

/**
 * Converts an original line number to sanitized line number.
 * Uses the line mappings from sanitizeForChunkingWithMapping.
 *
 * @param lineMappings - The line mappings from sanitization
 * @param originalLine - The original line number (1-indexed)
 * @returns Sanitized line number, or null if line was removed
 */
export const getSanitizedLineNumber = (
  lineMappings: readonly LineMapping[],
  originalLine: number
): number | null => {
  const mapping = lineMappings.find((lineMapping) => lineMapping.originalLine === originalLine);
  return mapping?.sanitizedLine ?? null;
};

/**
 * Composes multiple line mappings into a single combined mapping.
 * Used when multiple sanitization passes are applied sequentially.
 *
 * For example, if pass1 maps line 10 to 8, and pass2 maps line 8 to 6,
 * the composed mapping maps line 10 to 6.
 *
 * @param mappings - Array of line mappings to compose (in order of application)
 * @returns Combined LineMapping array mapping from original to final sanitized
 */
export const composeLineMappings = (
  mappings: ReadonlyArray<readonly LineMapping[]>
): readonly LineMapping[] => {
  if (mappings.length === 0) {
    return [];
  }

  if (mappings.length === 1) {
    return mappings[0];
  }

  // Start with first mapping
  let currentMappings = [...mappings[0]];

  // Compose each subsequent mapping
  mappings.slice(1).forEach((nextMappingSet) => {
    // Build lookup for next mapping (sanitized line to original line of next pass)
    const nextMappingLookup = new Map<number, LineMapping>();
    nextMappingSet.forEach((mapping) => {
      nextMappingLookup.set(mapping.originalLine, mapping);
    });

    // Compose: for each current mapping, find where its sanitized line maps to
    currentMappings = currentMappings.flatMap((currentMapping) => {
      const nextMapping = nextMappingLookup.get(currentMapping.sanitizedLine);
      if (!nextMapping) {
        // Line was removed in subsequent pass
        return [];
      }
      return [
        {
          originalLine: currentMapping.originalLine,
          sanitizedLine: nextMapping.sanitizedLine,
          wasModified: currentMapping.wasModified || nextMapping.wasModified,
        },
      ];
    });
  });

  return currentMappings;
};

/**
 * Re-export LineMapping type for convenience.
 */
export type { LineMapping };
