/**
 * Message Variant Selection
 *
 * Selects appropriate message format (compact/standard/expanded) based on
 * failure complexity to balance information density with readability.
 */

import { MESSAGE_VARIANT_CONFIG, type MessageVariant } from "../constants/githubApp.js";
import { clusterFailuresByService } from "./ciFormatters.js";

// ==================== Types ====================

/**
 * Minimal failure info needed for variant selection.
 */
export interface VariantSelectionInput {
  readonly checkName: string;
  readonly service?: string;
}

/**
 * Result of variant selection with config and display options.
 */
export interface VariantSelectionResult {
  readonly variant: MessageVariant;
  readonly config: (typeof MESSAGE_VARIANT_CONFIG)[MessageVariant];
  readonly showFullReportLink: boolean;
  readonly failureCount: number;
  readonly serviceCount: number;
}

/**
 * Line truncation result with overflow info.
 */
export interface TruncatedLines {
  readonly lines: readonly string[];
  readonly overflowCount: number;
  readonly wasTruncated: boolean;
}

// ==================== Variant Selection ====================

/**
 * Selects the appropriate message variant based on failure complexity.
 *
 * Uses failure count and service spread to determine format:
 * - COMPACT: Few failures in single service - minimal, focused output
 * - STANDARD: Moderate failures across few services - balanced detail
 * - EXPANDED: Many failures or wide service spread - comprehensive with link
 *
 * @param failures - Array of failures to analyze
 * @returns Variant selection result with config and display options
 */
export const selectMessageVariant = (
  failures: readonly VariantSelectionInput[]
): VariantSelectionResult => {
  const failureCount = failures.length;
  const serviceClusters = clusterFailuresByService(
    failures.map((failure) => ({
      checkName: failure.checkName,
      service: failure.service,
      rootCauses: [],
      annotations: [],
      testFailures: [],
      logSnippets: [],
      confidence: 0,
    }))
  );
  const serviceCount = serviceClusters.size;

  // Check thresholds in order: COMPACT → STANDARD → EXPANDED
  const { COMPACT, STANDARD, EXPANDED } = MESSAGE_VARIANT_CONFIG;

  if (failureCount <= COMPACT.MAX_FAILURES && serviceCount <= COMPACT.MAX_SERVICES) {
    return {
      variant: "COMPACT",
      config: COMPACT,
      showFullReportLink: COMPACT.INCLUDE_FULL_REPORT_LINK,
      failureCount,
      serviceCount,
    };
  }

  if (failureCount <= STANDARD.MAX_FAILURES && serviceCount <= STANDARD.MAX_SERVICES) {
    return {
      variant: "STANDARD",
      config: STANDARD,
      showFullReportLink: STANDARD.INCLUDE_FULL_REPORT_LINK,
      failureCount,
      serviceCount,
    };
  }

  return {
    variant: "EXPANDED",
    config: EXPANDED,
    showFullReportLink: EXPANDED.INCLUDE_FULL_REPORT_LINK,
    failureCount,
    serviceCount,
  };
};

// ==================== Line Truncation ====================

/**
 * Truncates an array of lines to fit within the specified limit.
 * Preserves complete lines (no mid-line truncation).
 *
 * @param lines - Array of lines to potentially truncate
 * @param maxLines - Maximum number of lines to keep
 * @returns Truncated result with overflow count
 */
export const truncateToLineLimit = (lines: readonly string[], maxLines: number): TruncatedLines => {
  if (lines.length <= maxLines) {
    return {
      lines,
      overflowCount: 0,
      wasTruncated: false,
    };
  }

  const truncatedLines = lines.slice(0, maxLines);
  const overflowCount = lines.length - maxLines;

  return {
    lines: truncatedLines,
    overflowCount,
    wasTruncated: true,
  };
};

/**
 * Formats overflow message for truncated content.
 *
 * @param overflowCount - Number of items not displayed
 * @param itemLabel - Label for the items (e.g., "failures", "files")
 * @returns Formatted overflow message or empty string if no overflow
 */
export const formatOverflowMessage = (overflowCount: number, itemLabel: string): string => {
  if (overflowCount <= 0) {
    return "";
  }
  return `_...and ${overflowCount} more ${itemLabel}_`;
};

// ==================== Variant-Aware Helpers ====================

/**
 * Gets the maximum root causes to display for a variant.
 *
 * @param variant - The message variant
 * @returns Maximum root causes to display
 */
export const getMaxRootCauses = (variant: MessageVariant): number =>
  MESSAGE_VARIANT_CONFIG[variant].MAX_ROOT_CAUSES;

/**
 * Gets the maximum files per service to display for a variant.
 *
 * @param variant - The message variant
 * @returns Maximum files per service to display
 */
export const getMaxFilesPerService = (variant: MessageVariant): number =>
  MESSAGE_VARIANT_CONFIG[variant].MAX_FILES_PER_SERVICE;

/**
 * Gets the maximum total lines to display for a variant.
 *
 * @param variant - The message variant
 * @returns Maximum total lines to display
 */
export const getMaxLines = (variant: MessageVariant): number =>
  MESSAGE_VARIANT_CONFIG[variant].MAX_LINES;
