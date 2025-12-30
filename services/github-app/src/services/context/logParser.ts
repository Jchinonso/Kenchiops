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

/**
 * Universal test failure indicator patterns.
 * These are minimal patterns that work across all test frameworks.
 * Detailed extraction is handled by AI.
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
 * Extract test failures from workflow logs.
 *
 * This function provides basic extraction using universal patterns.
 * The AI performs detailed analysis of the raw logs for comprehensive
 * failure detection across all test frameworks.
 *
 * @param logs - The workflow log content
 * @returns Array of test failure information
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
      failures.push({
        testName: testName.slice(0, 200),
        error: "Test failed (see logs for details)",
      });
    });
  });

  if (failures.length > 0) {
    logger.info("Extracted test failures using universal patterns", {
      count: failures.length,
    });
  }

  return failures;
};
