/**
 * Evidence parsing and processing constants.
 * Used for transforming CI failure logs into structured evidence.
 *
 * @module constants/evidence
 */

// ==================== Evidence Section Parsing ====================

/**
 * Section headings that indicate error-level log entries.
 */
export const ERROR_SECTION_HEADINGS = new Set<string>([
  "Failed Tests",
  "CI Annotations (Errors & Warnings)",
  "CI Check Output",
  "Workflow Logs",
]);

/**
 * Mapping of evidence section headings to log source identifiers.
 */
export const SECTION_SOURCE_OVERRIDES: Readonly<Record<string, string>> = {
  "Failed Tests": "ci-tests",
  "CI Annotations (Errors & Warnings)": "ci-annotations",
  "CI Check Output": "ci-check",
  "Workflow Logs": "ci-logs",
  "Dependency Changes": "ci-deps",
  "Build Config Changes": "ci-config",
  "PR Diff": "ci-diff",
  "Relevant Source Files": "ci-source",
  "Commit Info": "ci-commit",
  "Recent PR Discussion": "ci-comments",
  "Pull Request": "ci-pr",
  Overview: "ci-overview",
} as const;

// ==================== Evidence Log Entry Constants ====================

/**
 * Evidence log entry timing constants.
 */
export const EVIDENCE_LOG_TIMING = {
  /** Milliseconds offset between each log entry timestamp */
  TIMESTAMP_OFFSET_MS: 1000,
} as const;

/**
 * Text truncation limits for evidence processing.
 */
export const EVIDENCE_TEXT_LIMITS = {
  /** Maximum characters for error summary extraction */
  ERROR_SUMMARY_MAX_LENGTH: 500,
  /** Maximum characters for document excerpt */
  EXCERPT_MAX_LENGTH: 200,
} as const;
