/**
 * Evidence Pattern Constants and Classification Helpers
 *
 * Pattern definitions and helper functions for analyzing CI/CD failure evidence.
 *
 * @module openaiClient/evidencePatterns
 */

import type { FailureCategory, PipelinePhase } from "../core/types.js";

// ==================== Pattern Constants ====================

/**
 * Generic error lines that provide little diagnostic value.
 */
export const GENERIC_ERROR_LINE_PATTERNS: readonly RegExp[] = [
  /^test failed\b/i,
  /^assertionerror\b$/i,
  /^error\b$/i,
];

/**
 * Patterns that indicate an error or failure condition.
 */
export const ERROR_INDICATOR_PATTERNS: readonly RegExp[] = [
  /\berror\b/i,
  /\bexception\b/i,
  /\bfailed\b/i,
  /\bpanic\b/i,
  /\btraceback\b/i,
  /\bfatal\b/i,
  /\bsegmentation fault\b/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\bexit code\s*\d+\b/i,
  /\bstatus code\s*[45]\d{2}\b/i,
];

/**
 * Infrastructure-related failure patterns.
 */
export const INFRA_PATTERNS: readonly RegExp[] = [
  /no space left on device/i,
  /\bout of memory\b|\boom\b/i,
  /\bkilled process\b/i,
  /runner (lost|disconnected|offline)/i,
  /job canceled/i,
  /network (timeout|timed out|unreachable|error)/i,
  /connection (reset|refused|timed out)/i,
  /dns (failure|lookup|not found)/i,
  /rate limit|too many requests/i,
  /\b502\b|\b503\b|\b504\b/i,
];

/**
 * Category hints for failure classification based on patterns.
 */
export const CATEGORY_HINTS: ReadonlyArray<{
  readonly category: FailureCategory;
  readonly phase: PipelinePhase;
  readonly patterns: readonly RegExp[];
}> = [
  {
    category: "dependency",
    phase: "dependency",
    patterns: [
      /dependency|dependencies|package|lockfile/i,
      /\b(npm|yarn|pnpm|pip|poetry|cargo|gradle|maven|bundler)\b/i,
      /\bgo mod\b/i,
    ],
  },
  {
    category: "config",
    phase: "build",
    patterns: [
      /config|configuration|dotenv|env var|environment variable/i,
      /yaml|yml|toml|json|ini/i,
      /missing (env|configuration|config)/i,
      /invalid (config|configuration|schema)/i,
    ],
  },
  {
    category: "compile",
    phase: "build",
    patterns: [/compile|compilation|transpile/i, /syntax error|type error|tsc/i, /build failed/i],
  },
  {
    category: "test",
    phase: "test",
    patterns: [
      /test failed|tests failed|failed tests/i,
      /assert|expect|spec|jest|mocha|pytest|rspec|xunit/i,
    ],
  },
  {
    category: "runtime",
    phase: "runtime",
    patterns: [/exception|traceback|panic|segmentation fault/i, /null pointer|undefined/i],
  },
];

/**
 * Pattern for matching file paths in evidence text.
 */
export const FILE_PATH_IDENTIFIER = /[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,10}/g;

/**
 * Pattern for extracting dependency names.
 */
export const DEPENDENCY_NAME_PATTERN = /@?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?/g;

/**
 * Pattern for version strings.
 */
export const VERSION_PATTERN = /^\d+(\.\d+)+([.-][A-Za-z0-9.]+)?$/;

/**
 * Common words to exclude from dependency name extraction.
 */
export const DEPENDENCY_EXCLUSIONS = new Set([
  "added",
  "removed",
  "updated",
  "version",
  "from",
  "to",
  "dependency",
  "dependencies",
  "package",
  "packages",
]);

// ==================== Failure Classification ====================

/**
 * Failure classification result.
 */
export interface FailureClassification {
  readonly category: FailureCategory;
  readonly phase: PipelinePhase;
}

/**
 * Classifies a failure line based on pattern matching.
 *
 * @param line - The line to classify
 * @returns Classification result or null if no match
 */
export const classifyFailureLine = (line: string): FailureClassification | null => {
  if (INFRA_PATTERNS.some((pattern) => pattern.test(line))) {
    return { category: "infra", phase: "build" };
  }
  const matchingHint = CATEGORY_HINTS.find((hint) =>
    hint.patterns.some((pattern) => pattern.test(line))
  );
  if (!matchingHint) {
    return null;
  }
  return { category: matchingHint.category, phase: matchingHint.phase };
};

// ==================== Error Line Helpers ====================

/**
 * Checks if a line is a generic error message with little diagnostic value.
 *
 * @param line - The line to check
 * @returns True if the line is a generic error
 */
export const isGenericErrorLine = (line: string): boolean =>
  GENERIC_ERROR_LINE_PATTERNS.some((pattern) => pattern.test(line));

/**
 * Gets the first meaningful error line from a list of lines.
 * Filters out generic error messages and prioritizes lines with error indicators.
 *
 * @param lines - Array of lines to search
 * @returns First meaningful line or undefined
 */
export const getFirstMeaningfulLine = (lines: readonly string[]): string | undefined => {
  const trimmedLines = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  const nonGenericLines = trimmedLines.filter((line) => !isGenericErrorLine(line));
  const errorLine =
    nonGenericLines.find((line) =>
      ERROR_INDICATOR_PATTERNS.some((pattern) => pattern.test(line))
    ) ?? nonGenericLines[0];
  return errorLine ?? trimmedLines[0];
};

/**
 * Finds the first line that matches infrastructure failure patterns.
 *
 * @param text - The text to search
 * @returns First matching line or undefined
 */
export const findFirstInfraLine = (text: string): string | undefined => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.find((line) => INFRA_PATTERNS.some((pattern) => pattern.test(line)));
};

// ==================== Evidence ID Helpers ====================

/**
 * Formats an evidence ID with a prefix.
 *
 * @param prefix - The prefix (e.g., "test", "anno", "check")
 * @param id - The ID value
 * @returns Formatted evidence ID or undefined
 */
export const formatEvidenceId = (prefix: string, id?: string): string | undefined =>
  id ? `${prefix}#${id}` : undefined;

/**
 * Appends an evidence tag to text.
 *
 * @param text - The text to tag
 * @param evidenceId - The evidence ID to append
 * @returns Tagged text
 */
export const appendEvidenceTag = (text: string, evidenceId?: string): string =>
  evidenceId ? `${text} [${evidenceId}]` : text;

// ==================== Text Parsing Helpers ====================

/**
 * Escapes special regex characters in a string.
 */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Checks if a line is a block header line.
 *
 * @param line - The line to check
 * @param prefix - The expected prefix (e.g., "test", "anno")
 * @returns True if the line is a header
 */
export const isBlockHeaderLine = (line: string, prefix: string): boolean => {
  const trimmed = line.trim();
  return (
    trimmed.startsWith(`[${prefix}#`) ||
    trimmed.startsWith(`- [${prefix}#`) ||
    trimmed.startsWith(`* [${prefix}#`)
  );
};
