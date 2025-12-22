/**
 * Log parsing utilities.
 *
 * Extracts file references and test failures from CI workflow logs.
 */

import {
  createLogger,
  GITHUB_CONTEXT_LIMITS,
  FILE_REFERENCE_PATTERNS,
  EXCLUDED_PATH_PATTERNS,
  ERROR_INDICATORS,
  LOG_PARSING_LIMITS,
  shouldExcludePath,
  deduplicateByKey,
} from "@kenchi/shared";
import type { FileReference, TestFailure } from "./types.js";

const logger = createLogger("github-app");

// ==================== Test Failure Patterns ====================

/**
 * Jest/Vitest test failure patterns.
 */
const JEST_PATTERNS: readonly RegExp[] = [
  // ✕ test name (123 ms) followed by error
  /[✕✗]\s+(.+?)\s*(?:\(\d+\s*m?s\))?[\r\n]+\s*((?:Expected|Received|Error|at ).+?)(?=[\r\n]+\s*[✓✕✗]|$)/gms,
  // FAIL src/test.ts followed by test suite
  /FAIL\s+(\S+\.(?:test|spec)\.\w+)[\s\S]*?●\s+(.+?)[\r\n]+([\s\S]+?)(?=\s*●|\s*PASS|\s*FAIL|$)/gm,
];

/**
 * Mocha test failure pattern.
 */
const MOCHA_PATTERN = /^\s*\d+\)\s+(.+?)[\r\n]+([\s\S]+?)(?=^\s*\d+\)|$)/gm;

/**
 * Pattern to extract file path from error stack trace.
 */
const STACK_FILE_PATTERN = /at\s+.*?\(([^)]+\.(?:ts|js|tsx|jsx)):\d+:\d+\)/;

// ==================== File Reference Extraction ====================

/**
 * Extract file paths and line numbers from error logs.
 *
 * Matches patterns like:
 * - src/utils.ts:42
 * - /path/to/file.js:123:45
 * - at Object.<anonymous> (src/index.ts:10:5)
 * - Error: src/components/App.tsx(15,20)
 *
 * @param logs - The log content to parse
 * @returns Array of unique file references up to MAX_FILES limit
 */
export const extractFileReferences = (logs: string): FileReference[] => {
  const allReferences: FileReference[] = [];

  for (const pattern of FILE_REFERENCE_PATTERNS) {
    // Create new regex instance to reset lastIndex
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(logs)) !== null) {
      const path = match[1];
      const line = parseInt(match[2], 10);

      if (!shouldExcludePath(path, EXCLUDED_PATH_PATTERNS)) {
        allReferences.push({ path, line });
      }
    }
  }

  // Deduplicate by path and limit results
  return deduplicateByKey(allReferences, (ref) => ref.path, GITHUB_CONTEXT_LIMITS.MAX_FILES);
};

// ==================== Content Truncation ====================

/**
 * Find the best starting position for truncation based on error indicators.
 *
 * @param content - The content to search
 * @returns Starting index for truncation (0 if no indicator found)
 */
const findErrorPosition = (content: string): number => {
  for (const indicator of ERROR_INDICATORS) {
    const index = content.indexOf(indicator);
    if (index !== -1) {
      return index;
    }
  }
  return 0;
};

/**
 * Truncate content to a maximum size, preserving context around errors.
 *
 * @param content - The content to truncate
 * @param maxSize - Maximum size in characters
 * @returns Truncated content with indicators if truncated
 */
export const truncateWithContext = (content: string, maxSize: number): string => {
  if (content.length <= maxSize) {
    return content;
  }

  // Center truncation around the first error indicator
  const errorPos = findErrorPosition(content);
  const bestStart = Math.max(0, errorPos - maxSize / 2);

  const truncated = content.slice(bestStart, bestStart + maxSize);
  const prefix = bestStart > 0 ? "... [truncated] ...\n" : "";
  const suffix = bestStart + maxSize < content.length ? "\n... [truncated] ..." : "";

  return prefix + truncated + suffix;
};

// ==================== Test Failure Extraction ====================

/**
 * Result of matching a test failure pattern.
 */
interface PatternMatch {
  readonly testName: string;
  readonly error: string;
  readonly file?: string;
}

/**
 * Extract matches from logs using a regex pattern.
 *
 * @param logs - Log content to search
 * @param pattern - Regex pattern to match
 * @param maxMatches - Maximum number of matches to return
 * @param extractMatch - Function to extract data from each match
 * @returns Array of extracted matches
 */
const extractPatternMatches = (
  logs: string,
  pattern: RegExp,
  maxMatches: number,
  extractMatch: (match: RegExpExecArray) => PatternMatch
): PatternMatch[] => {
  const matches: PatternMatch[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let match;

  while ((match = regex.exec(logs)) !== null && matches.length < maxMatches) {
    matches.push(extractMatch(match));
  }

  return matches;
};

/**
 * Extract Jest/Vitest test failure from regex match.
 */
const extractJestMatch = (match: RegExpExecArray): PatternMatch => {
  const testName = (match[1]?.trim() || "Unknown test").slice(0, 200);
  const error = (match[2]?.trim() || match[3]?.trim() || "Test failed").slice(0, 500);
  const fileMatch = error.match(STACK_FILE_PATTERN);

  return {
    testName,
    error,
    file: fileMatch?.[1],
  };
};

/**
 * Extract Mocha test failure from regex match.
 */
const extractMochaMatch = (match: RegExpExecArray): PatternMatch => ({
  testName: match[1].trim().slice(0, 200),
  error: match[2].trim().slice(0, 500),
});

/**
 * Extract test failures from workflow logs.
 *
 * Supports Jest, Vitest, and Mocha test frameworks.
 *
 * @param logs - The workflow log content
 * @returns Array of test failure information
 */
export const extractTestFailures = (logs: string): TestFailure[] => {
  const maxFailures = LOG_PARSING_LIMITS.MAX_TEST_FAILURES;

  // Try Jest/Vitest patterns first
  for (const pattern of JEST_PATTERNS) {
    const matches = extractPatternMatches(logs, pattern, maxFailures, extractJestMatch);
    if (matches.length > 0) {
      logger.info("Extracted test failures from logs", {
        count: matches.length,
        framework: "jest",
      });
      return matches;
    }
  }

  // Fall back to Mocha pattern
  const mochaMatches = extractPatternMatches(logs, MOCHA_PATTERN, maxFailures, extractMochaMatch);
  if (mochaMatches.length > 0) {
    logger.info("Extracted test failures from logs", {
      count: mochaMatches.length,
      framework: "mocha",
    });
    return mochaMatches;
  }

  logger.info("No test failures found in logs");
  return [];
};
