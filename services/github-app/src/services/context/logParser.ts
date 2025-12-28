/**
 * Log parsing utilities.
 *
 * Extracts file references, test failures, and linting issues from CI workflow logs.
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

// ==================== ANSI Code Stripping ====================

/**
 * Strip ANSI color codes from log content.
 * ANSI codes start with ESC (0x1B) followed by [ and end with m.
 * eslint-disable-next-line no-control-regex - Required for ANSI stripping
 */
const stripAnsiCodes = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/\x1b\[[0-9;]*m/g, "");

// ==================== Test Failure Patterns ====================

/**
 * Jest/Vitest test failure patterns.
 * These patterns match after ANSI codes are stripped.
 */
const JEST_PATTERNS: readonly RegExp[] = [
  // ● TestSuite › SubSuite › test name (Jest format with bullet point)
  /●\s+([^\n]+?)[\r\n]+\s*([\s\S]+?)(?=\s*●|\s*PASS|\s*FAIL|Test Suites:|$)/gm,
  // ✕ test name (123 ms) followed by error
  /[✕✗×]\s+(.+?)\s*(?:\(\d+\s*m?s\))?[\r\n]+\s*((?:Expected|Received|Error|at ).+?)(?=[\r\n]+\s*[✓✕✗×]|$)/gms,
  // FAIL file.test.ts followed by ● Test suite failed to run
  /FAIL\s+(\S+\.(?:test|spec)\.\w+)[\s\S]*?●\s+Test suite failed to run[\r\n]+\s*([\s\S]+?)(?=\s*FAIL\s|\s*PASS\s|Test Suites:|$)/gm,
  // Generic test failure with expect().toX pattern
  /●\s+([^\n]+?)[\r\n]+[\s\S]*?(expect\(.+?\)\.to\w+[\s\S]*?)(?=\s*●|\s*at Object|$)/gm,
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
 * Extract matches from a single regex pattern.
 */
const extractMatchesFromPattern = (logs: string, pattern: RegExp): FileReference[] => {
  const regex = new RegExp(pattern.source, pattern.flags);
  const references: FileReference[] = [];
  let match;

  // While loop is required for regex.exec iteration with global flag
  while ((match = regex.exec(logs)) !== null) {
    const path = match[1];
    const line = parseInt(match[2], 10);

    if (!shouldExcludePath(path, EXCLUDED_PATH_PATTERNS)) {
      references.push({ path, line });
    }
  }

  return references;
};

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
  const allReferences = FILE_REFERENCE_PATTERNS.flatMap((pattern) =>
    extractMatchesFromPattern(logs, pattern)
  );

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
  const foundIndicator = ERROR_INDICATORS.map((indicator) => content.indexOf(indicator)).find(
    (index) => index !== -1
  );
  return foundIndicator ?? 0;
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
 * Handles both ● bullet format and ✕ checkmark format.
 */
const extractJestMatch = (match: RegExpExecArray): PatternMatch => {
  const rawTestName = match[1]?.trim() || "Unknown test";
  // Clean up test name - remove timestamps and extra whitespace
  const testName = rawTestName
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/g, "")
    .trim()
    .slice(0, 200);

  const error = (match[2]?.trim() || match[3]?.trim() || "Test failed").slice(0, 500);

  // Try to extract file from error stack trace
  const fileMatch = error.match(STACK_FILE_PATTERN);
  // Also try to extract file from test name if it looks like a file path
  const fileFromName = testName.match(/(\S+\.(?:test|spec)\.(?:ts|js|tsx|jsx))/)?.[1];

  return {
    testName: fileFromName ? testName.replace(fileFromName, "").trim() || testName : testName,
    error,
    file: fileMatch?.[1] || fileFromName,
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
 * Test framework pattern configuration.
 */
interface FrameworkPattern {
  readonly patterns: readonly RegExp[];
  readonly extractor: (match: RegExpExecArray) => PatternMatch;
  readonly name: string;
}

/**
 * Framework patterns in order of precedence.
 */
const FRAMEWORK_PATTERNS: readonly FrameworkPattern[] = [
  { patterns: JEST_PATTERNS, extractor: extractJestMatch, name: "jest" },
  { patterns: [MOCHA_PATTERN], extractor: extractMochaMatch, name: "mocha" },
];

/**
 * Try to extract failures from a framework's patterns.
 * Combines results from ALL patterns and deduplicates by test name.
 */
const tryExtractFromFramework = (
  logs: string,
  framework: FrameworkPattern,
  maxFailures: number
): TestFailure[] | null => {
  // Collect matches from ALL patterns - use higher limit per pattern to ensure we get all matches
  const perPatternLimit = maxFailures * 2;
  const allMatches = framework.patterns.flatMap((pattern) =>
    extractPatternMatches(logs, pattern, perPatternLimit, framework.extractor)
  );

  if (allMatches.length === 0) {
    return null;
  }

  // No aggressive deduplication - just limit to maxFailures
  // The patterns may produce some duplicates but it's better to have extras than miss failures
  const limited = allMatches.slice(0, maxFailures);

  logger.info("Extracted test failures from logs", {
    count: limited.length,
    framework: framework.name,
    totalMatched: allMatches.length,
  });

  return limited;
};

/**
 * Extract test failures from workflow logs.
 *
 * Supports Jest, Vitest, and Mocha test frameworks.
 * Strips ANSI color codes before parsing.
 *
 * @param logs - The workflow log content
 * @returns Array of test failure information
 */
export const extractTestFailures = (logs: string): TestFailure[] => {
  const maxFailures = LOG_PARSING_LIMITS.MAX_TEST_FAILURES;

  // Strip ANSI color codes from CI logs before parsing
  const cleanLogs = stripAnsiCodes(logs);

  // Try each framework in order, return first match
  const result = FRAMEWORK_PATTERNS.map((framework) =>
    tryExtractFromFramework(cleanLogs, framework, maxFailures)
  ).find((matches) => matches !== null);

  if (result) {
    return result;
  }

  logger.info("No test failures found in logs");
  return [];
};
