/**
 * Log parsing utilities.
 *
 * Provides minimal preprocessing for CI logs before AI analysis.
 * Framework-specific test failure detection is now handled by AI.
 *
 * @see docs/LANGUAGE_AGNOSTIC_MIGRATION.md
 */

import {
  createLogger,
  FILE_REFERENCE_PATTERNS,
  EXCLUDED_PATH_PATTERNS,
  ERROR_INDICATORS,
  LOG_PARSING_LIMITS,
  shouldExcludePath,
  deduplicateByKey,
} from "@kenchi/shared";
import type { FileReference, TestFailure } from "./types.js";

// ==================== Inline Helpers (simplified from deleted modules) ====================

/** Test file extensions */
const TEST_FILE_EXTENSIONS = new Set([
  ".test.ts",
  ".test.js",
  ".spec.ts",
  ".spec.js",
  ".test.tsx",
  ".test.jsx",
]);

/**
 * Check if a file path appears to be a test file.
 */
const isTestFile = (filePath: string): boolean => {
  const lowerPath = filePath.toLowerCase();
  return [...TEST_FILE_EXTENSIONS].some((ext) => lowerPath.endsWith(ext));
};

/** Patterns that indicate a generic/unhelpful error line */
const GENERIC_ERROR_PATTERNS = [
  /^at\s+/i, // Stack trace line
  /^\s*\d+\s*\|/, // Line number marker
  /^Error:\s*$/i, // Empty error
  /^[A-Z][a-z]+Error:\s*$/i, // Empty typed error
];

/**
 * Check if a line is a generic/unhelpful error line.
 */
const isGenericErrorLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  return GENERIC_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
};

interface NormalizedTestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
}

/**
 * Normalize test failure information.
 */
const normalizeTestFailure = (failure: {
  testName: string;
  file?: string;
  line?: number;
}): NormalizedTestFailure => ({
  testName: failure.testName.trim(),
  file: failure.file?.trim(),
  line: failure.line,
});

const { DEFAULT_ERROR_CONTEXT_LINES, EXTENDED_ERROR_CONTEXT_LINES } = LOG_PARSING_LIMITS;

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
 * Matches universal patterns like:
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

const GENERIC_ERROR_BODY_FALLBACK = "Test failed (see logs for details)";

/** Pattern to find a file path with separators but without line numbers */
const FILE_PATH_ONLY_PATTERN = /([^\s:()]+[\\/][^\s:()]+\.[a-zA-Z0-9]+)(?=$|[\s:()])/;

const ASSERTION_MESSAGE_PATTERNS: readonly RegExp[] = [
  /^Expected\s/i,
  /^Received\s/i,
  /^AssertionError\b/i,
  /to(Be|Equal|Contain|Match|Throw)\b/,
] as const;

const isAssertionMessage = (testName: string): boolean => {
  const trimmed = testName.trim();
  if (!trimmed) {
    return false;
  }

  const looksLikePath = trimmed.includes("/") || trimmed.includes("\\");
  const looksLikeJestChain = trimmed.includes(" > ");
  if (looksLikePath || looksLikeJestChain) {
    return false;
  }

  return ASSERTION_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
};

const isFileLevelTestName = (testName: string): boolean => {
  const trimmed = testName.trim();
  if (!trimmed) {
    return false;
  }

  if (!trimmed.includes("/") && !trimmed.includes("\\")) {
    return false;
  }

  if (trimmed.includes(" > ") || trimmed.includes("::")) {
    return false;
  }

  return isTestFile(trimmed);
};

/**
 * Extract line number from text for a given file path.
 * Searches for the file path and extracts line numbers from common patterns.
 */
const extractLineFromSuffix = (suffix: string): number | undefined => {
  // Try colon format: :123
  const colonMatch = suffix.match(/:(\d+)/);
  if (colonMatch) {
    const parsedLine = parseInt(colonMatch[1], 10);
    if (parsedLine > 0) {
      return parsedLine;
    }
  }

  // Try Python format: , line 123
  const pythonMatch = suffix.match(/,\s*line\s*(\d+)/i);
  if (pythonMatch) {
    const parsedLine = parseInt(pythonMatch[1], 10);
    if (parsedLine > 0) {
      return parsedLine;
    }
  }

  return undefined;
};

const extractLineForFile = (text: string, filePath: string): number | undefined => {
  const lines = text.split("\n");

  // Find the first line containing the file path and extract line number
  const matchingLine = lines.find((lineText) => lineText.includes(filePath));
  if (!matchingLine) {
    return undefined;
  }

  const filePathIndex = matchingLine.indexOf(filePath);
  const suffix = matchingLine.slice(filePathIndex + filePath.length);
  return extractLineFromSuffix(suffix);
};

const pathsMatch = (left: string, right: string): boolean =>
  left === right || left.endsWith(right) || right.endsWith(left);

const extractFileReferenceFromText = (text: string): FileReference | null => {
  // Try each pattern and find the first valid match with path and line
  const patternResult = FILE_REFERENCE_PATTERNS.map((pattern) => {
    const regex = new RegExp(pattern.source, pattern.flags);
    const match = [...text.matchAll(regex)][0];
    if (!match) {
      return null;
    }

    const lineNumber = parseInt(match[2], 10);
    if (match[1] && lineNumber > 0) {
      return { path: match[1], line: lineNumber };
    }
    return null;
  }).find((result) => result !== null);

  if (patternResult) {
    return patternResult;
  }

  // Fallback to path-only match
  const pathOnlyMatch = text.match(FILE_PATH_ONLY_PATTERN);
  return pathOnlyMatch ? { path: pathOnlyMatch[1] } : null;
};

/**
 * Universal test failure indicator patterns.
 * These are minimal patterns that work across all test frameworks.
 * Captures test identifier at match position for error body extraction.
 *
 * Note: Jest outputs both file-level markers (FAIL path.test.ts) and
 * individual test markers (● TestSuite › TestCase). We capture both
 * to get complete failure coverage.
 */
const UNIVERSAL_FAILURE_PATTERNS = [
  // Jest/Vitest individual test failure bullets (● TestSuite › TestCase or just ● TestName)
  // This captures each individual failing test, not just the file
  /●\s+([^\n]+\S)/gm,
  // Jest/Vitest failure marker with test name (✕ test name) at line start
  /^\s*✕\s+([^\n]+\S)/gm,
  // Generic FAIL/FAILED with file path
  /(?:FAIL(?:ED)?|✕|✗|×)\s+(\S+\.(?:test|spec)\.\w+)/gim,
  // pytest style: FAILED path/to/test.py::test_name
  /FAILED\s+(\S+\.py::\S+)/gim,
  // Go test: --- FAIL: TestName
  /---\s+FAIL:\s+(\w+(?:\/\w+)*)/gim,
  // Rust: thread 'test_name' panicked
  /thread\s+'([^']+)'\s+panicked/gim,
] as const;

/**
 * Patterns that indicate the end of an error block.
 * Stop capturing when these are encountered.
 */
const ERROR_END_MARKERS = [
  /^={3,}/, // Separator lines
  /^-{3,}/, // Separator dashes
  /^PASSED\s/i,
  /^FAILED\s/i, // Next test failure
  /^ok\s+\d/, // Go test pass
  /^---\s+PASS:/i, // Go test pass
  /^---\s+FAIL:/i, // Go test next failure
  /^test\s+\S+\s+\.\.\.\s+ok/i, // Rust test pass
  /^\s*✓\s/, // Jest pass marker
  /^\s*✕\s/, // Jest fail marker (next test)
  /^\s*●\s/, // Jest bullet marker (next test's detailed error)
] as const;

/**
 * Accumulator state for error body extraction
 */
interface ErrorBodyAccumulator {
  readonly lines: readonly string[];
  readonly charCount: number;
  readonly done: boolean;
}

/**
 * Process a single line for error body extraction.
 * Returns updated accumulator state.
 */
const processErrorLine =
  (maxChars: number) =>
  (accumulator: ErrorBodyAccumulator, line: string): ErrorBodyAccumulator => {
    if (accumulator.done) {
      return accumulator;
    }

    // Check if we've hit an end marker
    const isEndMarker = ERROR_END_MARKERS.some((marker) => marker.test(line));
    if (isEndMarker) {
      return { ...accumulator, done: true };
    }

    // Check if we've exceeded the character limit
    if (accumulator.charCount + line.length > maxChars) {
      const remaining = maxChars - accumulator.charCount;
      if (remaining > LOG_PARSING_LIMITS.MIN_TRUNCATION_CHARS) {
        return {
          lines: [...accumulator.lines, `${line.slice(0, remaining)}...`],
          charCount: maxChars,
          done: true,
        };
      }
      return { ...accumulator, done: true };
    }

    return {
      lines: [...accumulator.lines, line],
      charCount: accumulator.charCount + line.length + 1, // +1 for newline
      done: false,
    };
  };

const isGenericErrorBody = (errorBody: string): boolean => {
  const trimmed = errorBody.trim();
  if (!trimmed || trimmed === GENERIC_ERROR_BODY_FALLBACK) {
    return true;
  }
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length === 0 || lines.every((line) => isGenericErrorLine(line));
};

/**
 * Extract error body starting from a position in the logs.
 * Captures lines until an end marker or character limit is reached.
 */
const extractErrorBody = (logs: string, startIndex: number, failureLine?: string): string => {
  const remainingContent = logs.slice(startIndex);
  const allLines = remainingContent.split("\n");
  const markerLine = failureLine?.trim() || "";

  const linesToProcess = allLines.slice(0, DEFAULT_ERROR_CONTEXT_LINES);

  const initialState: ErrorBodyAccumulator = { lines: [], charCount: 0, done: false };
  const { lines: errorLines } = linesToProcess.reduce(
    processErrorLine(Number.POSITIVE_INFINITY),
    initialState
  );

  const combinedLines = markerLine ? [markerLine, ...errorLines] : [...errorLines];
  const errorBody = combinedLines.join("\n").trim();
  if (errorBody.length > 0 && !isGenericErrorBody(errorBody)) {
    return errorBody;
  }

  const extendedLines = allLines.slice(0, EXTENDED_ERROR_CONTEXT_LINES);
  const { lines: extendedErrorLines } = extendedLines.reduce(
    processErrorLine(Number.POSITIVE_INFINITY),
    initialState
  );
  const extendedCombined = markerLine
    ? [markerLine, ...extendedErrorLines]
    : [...extendedErrorLines];
  const extendedBody = extendedCombined.join("\n").trim();

  return extendedBody.length > 0 ? extendedBody : GENERIC_ERROR_BODY_FALLBACK;
};

/**
 * Extract test failures from workflow logs.
 *
 * Captures both test identifiers and actual error bodies (tracebacks,
 * assertion diffs) for AI analysis. Uses universal patterns that work
 * across test frameworks.
 *
 * @param logs - The workflow log content
 * @returns Array of test failure information with error bodies
 */
export const extractTestFailures = (logs: string): TestFailure[] => {
  // Strip ANSI color codes and CI timestamps before parsing
  const cleanLogs = stripCITimestamps(stripAnsiCodes(logs));

  const failures: TestFailure[] = [];
  const seenTests = new Set<string>();

  // Extract failures using universal patterns
  UNIVERSAL_FAILURE_PATTERNS.forEach((pattern) => {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = [...cleanLogs.matchAll(regex)];

    matches.forEach((match) => {
      const testName = match[1]?.trim();
      if (!testName || seenTests.has(testName.toLowerCase())) {
        return;
      }

      seenTests.add(testName.toLowerCase());

      // Extract the error body starting from the match position
      const matchEndIndex = (match.index ?? 0) + match[0].length;
      const markerLine = isFileLevelTestName(testName) ? "" : match[0];
      const errorBody = extractErrorBody(
        cleanLogs,
        matchEndIndex,
        markerLine.length > 0 ? markerLine : undefined
      );

      const normalized = normalizeTestFailure({ testName, file: undefined, line: undefined });
      const locationFromError = extractFileReferenceFromText(errorBody);
      const fileFromTestName = isFileLevelTestName(normalized.testName)
        ? normalized.testName
        : undefined;
      const fileFromError =
        locationFromError?.path && isTestFile(locationFromError.path)
          ? locationFromError.path
          : undefined;
      const file = normalized.file ?? fileFromTestName ?? fileFromError;
      const lineFromFile = file ? extractLineForFile(errorBody, file) : undefined;
      const line =
        lineFromFile ??
        (file && locationFromError?.path && pathsMatch(file, locationFromError.path)
          ? locationFromError.line
          : undefined);
      const finalTestName =
        file && isAssertionMessage(normalized.testName) ? "Test failed" : normalized.testName;

      failures.push({
        testName: finalTestName.slice(0, 200),
        error: errorBody,
        file,
        line,
      });
    });
  });

  if (failures.length > 0) {
    logger.info("Extracted test failures with error bodies", {
      count: failures.length,
      hasErrorBodies: failures.some(
        (testFailure) => testFailure.error !== "Test failed (see logs for details)"
      ),
    });
  }

  const detailedFiles = new Set(
    failures
      .filter((failure) => failure.file && !isFileLevelTestName(failure.testName))
      .map((failure) => failure.file ?? "")
      .filter((file) => file.length > 0)
  );

  const filteredFailures = failures.filter((failure) => {
    if (!failure.file || !isFileLevelTestName(failure.testName)) {
      return true;
    }
    return !detailedFiles.has(failure.file);
  });

  return filteredFailures;
};
