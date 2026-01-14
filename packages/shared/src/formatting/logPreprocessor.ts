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
} from "../constants/index.js";
import { findBestAnchor, ANCHOR_TIERS, type AnchorResult } from "./anchorSelection.js";
import {
  detectTestFramework,
  detectTestFrameworkSimple,
  type TestFrameworkInfo,
} from "./testFrameworkDetection.js";

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
 * GitHub Actions logs have ISO timestamps at line starts.
 * Only strips CI-injected timestamps, not application output.
 *
 * @param text - The text containing CI timestamps
 * @returns Text with timestamps removed from line starts
 */
export const stripCITimestamps = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP, "");

/**
 * Strip CI group markers from log content.
 * These are presentation markers that don't contain error information.
 *
 * @param text - The text containing CI group markers
 * @returns Text with group markers removed
 */
export const stripCIGroupMarkers = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_GROUP_MARKERS, "");

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
