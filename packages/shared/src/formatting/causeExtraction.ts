/**
 * Cause Extraction Utilities
 *
 * Functions for extracting, scoring, and filtering meaningful error causes
 * from CI failure logs and test output.
 */

import {
  FILE_PATH_VALIDATION,
  TEXT_SANITIZATION_PATTERNS,
  GITHUB_COMMENT_DISPLAY,
  CAUSE_EXTRACTION_LIMITS,
  USELESS_CAUSE_PATTERNS,
  CAUSE_SIGNAL_WEIGHTS,
  CAUSE_WEAKNESS_WEIGHTS,
} from "../constants/index.js";
import { extractAssertionSnippet, isGenericErrorLine } from "../openaiClient/evidencePatterns.js";
import { stripAbsolutePaths } from "./pathUtils.js";

// ==================== Cause Checking ====================

/**
 * Checks if a cause string is useless for display.
 *
 * @param cause - The cause string to check
 * @returns True if the cause should be filtered out
 */
export const isCauseUseless = (cause: string): boolean => {
  const trimmed = cause.trim();
  const normalized = trimmed
    .replace(/^[\s*•-]+/, "")
    .replace(/^[✕✗×●]+\s*/i, "")
    .trim();
  if (normalized.length < CAUSE_EXTRACTION_LIMITS.MIN_CAUSE_LENGTH) {
    return true;
  }
  return USELESS_CAUSE_PATTERNS.some((pattern) => pattern.test(normalized));
};

// ==================== Cause Scoring ====================

/**
 * Scores a cause string based on signal strength.
 */
export const scoreCause = (cause: string): number => {
  const trimmed = cause.trim();
  if (!trimmed) {
    return 0;
  }

  let score = 0;
  CAUSE_SIGNAL_WEIGHTS.forEach((rule) => {
    if (rule.pattern.test(trimmed)) {
      score += rule.weight;
    }
  });
  CAUSE_WEAKNESS_WEIGHTS.forEach((rule) => {
    if (rule.pattern.test(trimmed)) {
      score += rule.weight;
    }
  });

  // Bonus for longer, more detailed causes
  if (trimmed.length >= CAUSE_EXTRACTION_LIMITS.MEDIUM_CAUSE_LENGTH) {
    score += 1;
  }
  if (trimmed.length >= CAUSE_EXTRACTION_LIMITS.LONG_CAUSE_LENGTH) {
    score += 1;
  }

  return score;
};

/**
 * Returns true when a cause looks like a low-signal assertion-only message.
 * Used to hide noisy "expected/received" strings in summaries.
 */
export const isLowSignalCause = (cause: string): boolean => {
  const trimmed = cause.trim();
  if (!trimmed) {
    return true;
  }

  if (isCauseUseless(trimmed)) {
    return true;
  }

  const hasSignal = CAUSE_SIGNAL_WEIGHTS.some((rule) => rule.pattern.test(trimmed));
  const hasWeakness = CAUSE_WEAKNESS_WEIGHTS.some((rule) => rule.pattern.test(trimmed));

  return hasWeakness && !hasSignal;
};

// ==================== Cause Extraction ====================

/**
 * Extracts a meaningful error cause from raw error text.
 * Uses language-agnostic patterns to find actual assertion failures,
 * expected/received values, and error messages.
 *
 * @param rawError - The raw error text (may contain test names, stack traces, etc.)
 * @returns Extracted meaningful cause or null if no useful content found
 */
export const extractMeaningfulCause = (rawError: string): string | null => {
  if (!rawError || rawError.trim().length === 0) {
    return null;
  }

  // Truncate very long errors for efficiency
  const trimmed = rawError.slice(0, CAUSE_EXTRACTION_LIMITS.MAX_RAW_LENGTH).trim();

  // First try the assertion snippet extractor (handles expected/received patterns)
  const assertionSnippet = extractAssertionSnippet(trimmed);
  if (assertionSnippet && !isCauseUseless(assertionSnippet)) {
    return assertionSnippet;
  }

  // Fall back to finding first meaningful line
  const lines = trimmed.split(/\n/).map((line) => line.trim());
  const meaningfulLine = lines.find(
    (line) =>
      line.length > CAUSE_EXTRACTION_LIMITS.MIN_MEANINGFUL_LINE_LENGTH &&
      !isGenericErrorLine(line) &&
      !isCauseUseless(line)
  );

  if (meaningfulLine) {
    // Truncate to reasonable display length
    return meaningfulLine.length > CAUSE_EXTRACTION_LIMITS.MAX_DISPLAY_LENGTH
      ? `${meaningfulLine.slice(0, CAUSE_EXTRACTION_LIMITS.TRUNCATION_LENGTH)}...`
      : meaningfulLine;
  }

  return null;
};

// ==================== Message Sanitization ====================

/**
 * Sanitizes a test failure message for display.
 * Removes evidence prefixes, file-level markers, boilerplate lines,
 * absolute paths, and truncates to display limit.
 */
export const sanitizeTestFailureMessage = (message: string): string => {
  if (!message) {
    return "";
  }

  const stripCodeFrameFragment = (line: string): string => {
    const match = line.match(/\b\d+\s*\|/);
    if (!match || match.index === undefined) {
      return line;
    }
    const prefix = line.slice(0, match.index).trim();
    if (prefix.length < 3 || /^\d+$/.test(prefix)) {
      return "";
    }
    return prefix;
  };

  // Step 1: Strip ANSI codes, evidence prefixes, boilerplate, and absolute paths
  const stripped = stripAbsolutePaths(
    message
      .replace(TEXT_SANITIZATION_PATTERNS.ANSI_ESCAPE_CODES, "")
      .replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "")
      .replace(/^Test failed:\s*/i, "")
      .trim()
  );

  // Step 2: Process lines, removing code frames and empty content
  const lines = stripped
    .split("\n")
    .map((line) => stripCodeFrameFragment(line.trim()))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Step 3: Filter to meaningful content only
  const meaningfulLines = lines.filter(
    (line) => !isGenericErrorLine(line) && !isCauseUseless(line)
  );

  if (meaningfulLines.length === 0) {
    return "";
  }

  // Step 4: Join, normalize whitespace, and truncate to display limit
  const combined = meaningfulLines.join(" ").replace(/\s+/g, " ").trim();
  const maxLength = GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH;

  if (combined.length <= maxLength) {
    return combined;
  }

  // Truncate at word boundary for readability
  const truncated = combined.slice(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  const truncationPoint = lastSpace > maxLength * 0.7 ? lastSpace : maxLength - 3;

  return `${combined.slice(0, truncationPoint)}...`;
};
