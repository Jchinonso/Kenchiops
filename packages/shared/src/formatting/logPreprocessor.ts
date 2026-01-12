/**
 * Simplified Log Preprocessor
 *
 * Minimal transformations for CI logs before LLM analysis:
 * - Strip ANSI color codes
 * - Strip CI timestamps
 * - Truncate with error context
 *
 * Complex test failure extraction is handled by the LLM.
 */

import { redactSecretsWithStats, type RedactionResult } from "../security/redaction.js";
import {
  ERROR_INDICATORS,
  LOG_PARSING_LIMITS,
  TEXT_SANITIZATION_PATTERNS,
} from "../constants/index.js";

// ==================== Constants ====================

/** Truncation marker */
const TRUNCATION_MARKER = "... [truncated] ...";

/** Divisor for centering truncation around error position */
const TRUNCATION_CENTER_DIVISOR = 2;

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
}

// ==================== Core Functions ====================

/**
 * Strip ANSI color codes from log content.
 * ANSI codes start with ESC (0x1B) followed by [ and end with m.
 *
 * @param text - The text containing ANSI codes
 * @returns Text with ANSI codes removed
 */
export const stripAnsiCodes = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.ANSI_SIMPLE, "");

/**
 * Strip CI timestamps from log content.
 * GitHub Actions logs have ISO timestamps at line starts.
 *
 * @param text - The text containing CI timestamps
 * @returns Text with timestamps removed from line starts
 */
export const stripCITimestamps = (text: string): string =>
  text.replace(TEXT_SANITIZATION_PATTERNS.CI_TIMESTAMP, "");

/**
 * Find the best starting position for truncation based on error indicators.
 * Returns the position of the first error indicator found.
 *
 * @param content - The content to search
 * @returns Starting index for truncation (DEFAULT_ERROR_POSITION if no indicator found)
 */
const findErrorPosition = (content: string): number => {
  const positions = ERROR_INDICATORS.map((indicator) => content.indexOf(indicator)).filter(
    (position) => position !== -1
  );

  return positions.length > 0 ? Math.min(...positions) : LOG_PARSING_LIMITS.DEFAULT_ERROR_POSITION;
};

/**
 * Truncate content to max size, centered on first error.
 * Preserves context around errors rather than truncating from the end.
 *
 * @param content - The content to truncate
 * @param maxSize - Maximum size in characters
 * @returns Truncated content with markers if truncation occurred
 */
export const truncateWithErrorContext = (
  content: string,
  maxSize: number = LOG_PARSING_LIMITS.MAX_LOG_SIZE
): string => {
  if (content.length <= maxSize) {
    return content;
  }

  const errorPos = findErrorPosition(content);
  const halfSize = Math.floor(maxSize / TRUNCATION_CENTER_DIVISOR);
  const start = Math.max(LOG_PARSING_LIMITS.DEFAULT_ERROR_POSITION, errorPos - halfSize);
  const end = Math.min(content.length, start + maxSize);

  const truncated = content.slice(start, end);
  const prefix = start > LOG_PARSING_LIMITS.DEFAULT_ERROR_POSITION ? `${TRUNCATION_MARKER}\n` : "";
  const suffix = end < content.length ? `\n${TRUNCATION_MARKER}` : "";

  return prefix + truncated + suffix;
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
  // Step 1: Strip ANSI color codes
  const noAnsi = stripAnsiCodes(rawLogs);

  // Step 2: Strip CI timestamps
  const noTimestamps = stripCITimestamps(noAnsi);

  // Step 3: Truncate with error context
  const truncated = truncateWithErrorContext(noTimestamps, maxSize);

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

  // Step 1-3: Basic preprocessing
  const cleaned = preprocessLogs(rawLogs, maxSize);

  // Step 4: Redact secrets
  const redactionResult: RedactionResult = redactSecretsWithStats(cleaned);

  const processedSize = redactionResult.text.length;
  const wasTruncated = cleaned.includes(TRUNCATION_MARKER);

  return {
    logs: redactionResult.text,
    originalSize,
    processedSize,
    wasTruncated,
    secretsRedacted: redactionResult.redactedCount,
    secretTypes: redactionResult.redactedTypes,
  };
};
