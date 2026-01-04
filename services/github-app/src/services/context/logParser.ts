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
  shouldExcludePath,
  deduplicateByKey,
  normalizeTestFailure,
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

/** Maximum characters to capture for error body */
const MAX_ERROR_BODY_CHARS = 800;

/** Number of lines to scan after a failure marker for error context */
const ERROR_CONTEXT_LINES = 30;

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

const extractLineForFile = (text: string, filePath: string): number | undefined => {
  const lines = text.split("\n");

  for (const lineText of lines) {
    const index = lineText.indexOf(filePath);
    if (index === -1) {
      continue;
    }

    const suffix = lineText.slice(index + filePath.length);
    const colonMatch = suffix.match(/:(\d+)/);
    if (colonMatch) {
      const line = parseInt(colonMatch[1], 10);
      if (line > 0) {
        return line;
      }
    }

    const pythonMatch = suffix.match(/,\s*line\s*(\d+)/i);
    if (pythonMatch) {
      const line = parseInt(pythonMatch[1], 10);
      if (line > 0) {
        return line;
      }
    }
  }

  return undefined;
};

const pathsMatch = (left: string, right: string): boolean =>
  left === right || left.endsWith(right) || right.endsWith(left);

const extractFileReferenceFromText = (text: string): FileReference | null => {
  for (const pattern of FILE_REFERENCE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const match = [...text.matchAll(regex)][0];
    if (!match) {
      continue;
    }

    const line = parseInt(match[2], 10);
    if (match[1] && line > 0) {
      return { path: match[1], line };
    }
  }

  const pathOnlyMatch = text.match(FILE_PATH_ONLY_PATTERN);
  if (pathOnlyMatch) {
    return { path: pathOnlyMatch[1] };
  }

  return null;
};

/**
 * Universal test failure indicator patterns.
 * These are minimal patterns that work across all test frameworks.
 * Captures test identifier at match position for error body extraction.
 */
const UNIVERSAL_FAILURE_PATTERNS = [
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
] as const;

/**
 * Extract error body starting from a position in the logs.
 * Captures lines until an end marker or character limit is reached.
 */
const extractErrorBody = (logs: string, startIndex: number): string => {
  // Get the content after the match
  const remainingContent = logs.slice(startIndex);
  const lines = remainingContent.split("\n");

  const errorLines: string[] = [];
  let charCount = 0;

  // Skip the first line (contains the failure marker itself)
  const linesToProcess = lines.slice(1, ERROR_CONTEXT_LINES + 1);

  for (const line of linesToProcess) {
    // Check if we've hit an end marker
    const isEndMarker = ERROR_END_MARKERS.some((marker) => marker.test(line));
    if (isEndMarker) {
      break;
    }

    // Stop if we've exceeded the character limit
    if (charCount + line.length > MAX_ERROR_BODY_CHARS) {
      // Add truncated line if there's room
      const remaining = MAX_ERROR_BODY_CHARS - charCount;
      if (remaining > 20) {
        errorLines.push(`${line.slice(0, remaining)}...`);
      }
      break;
    }

    errorLines.push(line);
    charCount += line.length + 1; // +1 for newline
  }

  const errorBody = errorLines.join("\n").trim();

  // Return captured error or fallback
  return errorBody.length > 0 ? errorBody : "Test failed (see logs for details)";
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
      const errorBody = extractErrorBody(cleanLogs, matchEndIndex);

      const normalized = normalizeTestFailure({ testName, file: undefined, line: undefined });
      const locationFromError = extractFileReferenceFromText(errorBody);
      const file = normalized.file ?? locationFromError?.path;
      const lineFromFile = normalized.file
        ? extractLineForFile(errorBody, normalized.file)
        : undefined;
      const line =
        lineFromFile ??
        (normalized.file &&
        locationFromError?.path &&
        pathsMatch(normalized.file, locationFromError.path)
          ? locationFromError.line
          : normalized.file
            ? undefined
            : locationFromError?.line);
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

  return failures;
};
