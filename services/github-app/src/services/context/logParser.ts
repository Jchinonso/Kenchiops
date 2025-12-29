/**
 * Log parsing utilities.
 *
 * Extracts file references, test failures, and linting issues from CI workflow logs.
 */

import {
  createLogger,
  FILE_REFERENCE_PATTERNS,
  EXCLUDED_PATH_PATTERNS,
  ERROR_INDICATORS,
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

/**
 * Strip CI timestamps from log content.
 * GitHub Actions logs have timestamps like: 2025-12-28T17:31:34.1659529Z
 */
const stripCITimestamps = (text: string): string =>
  text.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm, "");

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
 * Pattern to extract file path and line number from error stack trace.
 * Captures: [1] = file path, [2] = line number
 */
const STACK_FILE_PATTERN = /at\s+.*?\(([^)]+\.(?:ts|js|tsx|jsx)):(\d+):\d+\)/;

// ==================== File Reference Extraction ====================

/**
 * Extract matches from a single regex pattern.
 * Uses matchAll() for functional iteration over regex matches.
 */
const extractMatchesFromPattern = (logs: string, pattern: RegExp): FileReference[] => {
  const regex = new RegExp(pattern.source, pattern.flags);

  return [...logs.matchAll(regex)]
    .filter((match) => !shouldExcludePath(match[1], EXCLUDED_PATH_PATTERNS))
    .map((match) => ({
      path: match[1],
      line: parseInt(match[2], 10),
    }));
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
 * @returns Array of unique file references (no artificial limit)
 */
export const extractFileReferences = (logs: string): FileReference[] => {
  const allReferences = FILE_REFERENCE_PATTERNS.flatMap((pattern) =>
    extractMatchesFromPattern(logs, pattern)
  );

  // Deduplicate by path - no artificial limit
  return deduplicateByKey(allReferences, (ref) => ref.path);
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
  readonly line?: number;
}

/**
 * Extract matches from logs using a regex pattern.
 * Uses matchAll() for functional iteration with slice for limiting results.
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
  extractMatch: (match: RegExpExecArray, logs?: string) => PatternMatch
): PatternMatch[] => {
  const regex = new RegExp(pattern.source, pattern.flags);

  return [...logs.matchAll(regex)]
    .slice(0, maxMatches)
    .map((match) => extractMatch(match as RegExpExecArray, logs));
};

/**
 * Build a map of test names to their source files from Jest output.
 * Parses FAIL blocks to associate tests with their file paths.
 * Uses matchAll() for functional iteration over test names.
 */
const buildTestFileMap = (logs: string): Map<string, string> => {
  // Split logs into FAIL blocks
  const failBlocks = logs.split(/(?=FAIL\s+\S+\.(?:test|spec)\.(?:ts|js|tsx|jsx))/);

  // Process blocks and build entries as [testName, filePath] pairs
  const entries = failBlocks.flatMap((block) => {
    // Extract file from FAIL line
    const failMatch = block.match(/^FAIL\s+(\S+\.(?:test|spec)\.(?:ts|js|tsx|jsx))/);
    if (!failMatch) return [];

    const filePath = failMatch[1];
    const testPattern = /●\s+([^\n]+)/g;

    // Use matchAll to find all test names in this block
    return [...block.matchAll(testPattern)]
      .map((match) =>
        match[1]
          .trim()
          .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/g, "")
          .trim()
      )
      .filter((testName) => testName.length > 0)
      .map((testName): [string, string] => [testName.toLowerCase(), filePath]);
  });

  return new Map(entries);
};

// Cache for test file map to avoid rebuilding for each match
let cachedTestFileMap: Map<string, string> | null = null;
let cachedLogsHash = "";

/**
 * Get or build the test file map, with simple caching.
 */
const getTestFileMap = (logs: string): Map<string, string> => {
  const logsHash = logs.slice(0, 1000) + logs.length; // Simple hash
  if (cachedLogsHash !== logsHash) {
    cachedTestFileMap = buildTestFileMap(logs);
    cachedLogsHash = logsHash;
  }
  return cachedTestFileMap!;
};

/**
 * Pattern to find file:line anywhere in text (more flexible than stack trace)
 * Matches: file.test.ts:123 or file.ts:45
 */
const FILE_LINE_PATTERN = /(\S+\.(?:test|spec)?\.?(?:ts|js|tsx|jsx)):(\d+)/;

/**
 * Extract line number for a specific file from error text
 */
const extractLineForFile = (error: string, filePath: string): number | undefined => {
  // Look for the file path followed by :lineNumber
  const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedPath}:(\\d+)`);
  const match = error.match(pattern);
  return match?.[1] ? parseInt(match[1], 10) : undefined;
};

/**
 * Extract Jest/Vitest test failure from regex match.
 * Handles both ● bullet format and ✕ checkmark format.
 */
const extractJestMatch = (match: RegExpExecArray, logs?: string): PatternMatch => {
  const rawTestName = match[1]?.trim() || "Unknown test";
  // Clean up test name - remove timestamps and extra whitespace
  const testName = rawTestName
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/g, "")
    .trim()
    .slice(0, 200);

  // Get FULL error content for line number extraction (before truncation)
  const fullError = match[2]?.trim() || match[3]?.trim() || "Test failed";
  const error = fullError.slice(0, 500);

  // Try to extract file and line from error stack trace (use full error)
  const fileMatch = fullError.match(STACK_FILE_PATTERN);
  const fileFromStack = fileMatch?.[1];
  const lineFromStack = fileMatch?.[2] ? parseInt(fileMatch[2], 10) : undefined;

  // Also try to extract file from test name if it looks like a file path
  const fileFromName = testName.match(/(\S+\.(?:test|spec)\.(?:ts|js|tsx|jsx))/)?.[1];

  // Try to get file from the FAIL block context if available
  let fileFromContext: string | undefined;
  if (logs) {
    const testFileMap = getTestFileMap(logs);
    fileFromContext = testFileMap.get(testName.toLowerCase());
  }

  // Determine final file
  const file = fileFromContext || fileFromStack || fileFromName;

  // Get line number - try to match the specific file path in the full error
  let line = lineFromStack;
  if (file && !line) {
    line = extractLineForFile(fullError, file);
  }
  // Fallback: try to find any file:line pattern in the error
  if (!line) {
    const anyLineMatch = fullError.match(FILE_LINE_PATTERN);
    if (anyLineMatch?.[2]) {
      line = parseInt(anyLineMatch[2], 10);
    }
  }

  return {
    testName: fileFromName ? testName.replace(fileFromName, "").trim() || testName : testName,
    error,
    file,
    line,
  };
};

/**
 * Extract Mocha test failure from regex match.
 */
const extractMochaMatch = (match: RegExpExecArray, _logs?: string): PatternMatch => ({
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
 * Extracts ALL matches and deduplicates by test name - no arbitrary limits.
 */
const tryExtractFromFramework = (
  logs: string,
  framework: FrameworkPattern
): TestFailure[] | null => {
  // Collect ALL matches from ALL patterns (no per-pattern limit)
  const allMatches = framework.patterns.flatMap((pattern) =>
    extractPatternMatches(logs, pattern, Number.MAX_SAFE_INTEGER, framework.extractor)
  );

  if (allMatches.length === 0) {
    return null;
  }

  // Deduplicate by test name to get unique failures
  const uniqueFailures = deduplicateByKey(allMatches, (match) => match.testName.toLowerCase());

  logger.info("Extracted test failures from logs", {
    count: uniqueFailures.length,
    framework: framework.name,
    totalMatched: allMatches.length,
  });

  return uniqueFailures;
};

/**
 * Extract test failures from workflow logs.
 *
 * Supports Jest, Vitest, and Mocha test frameworks.
 * Strips ANSI color codes before parsing.
 * Extracts ALL unique failures - no artificial limits.
 *
 * @param logs - The workflow log content
 * @returns Array of unique test failure information
 */
export const extractTestFailures = (logs: string): TestFailure[] => {
  // Strip ANSI color codes and CI timestamps from logs before parsing
  const cleanLogs = stripCITimestamps(stripAnsiCodes(logs));

  // Try each framework in order, return first match
  const result = FRAMEWORK_PATTERNS.map((framework) =>
    tryExtractFromFramework(cleanLogs, framework)
  ).find((matches) => matches !== null);

  if (result) {
    return result;
  }

  logger.info("No test failures found in logs");
  return [];
};
