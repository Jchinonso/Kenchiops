/**
 * Flaky Test Detection Module
 *
 * Provides utilities for detecting potentially flaky tests in CI failures.
 * Currently uses heuristic-based detection with placeholder for historical data.
 */

// ==================== Types ====================

/**
 * Information about a potentially flaky test.
 */
export interface FlakyTestInfo {
  readonly testName: string;
  readonly file?: string;
  readonly flakyScore: number;
  readonly reason: string;
}

/**
 * Result of flaky test detection.
 */
export interface FlakyTestResult {
  readonly flakyTests: readonly FlakyTestInfo[];
  readonly hasFlakyTests: boolean;
  readonly totalChecked: number;
}

/**
 * Test failure input for flaky detection.
 */
export interface TestFailureInput {
  readonly testName: string;
  readonly file?: string;
  readonly error?: string;
}

// ==================== Constants ====================

/**
 * Flaky test score thresholds.
 */
const FLAKY_THRESHOLDS = {
  /** Minimum score to flag as potentially flaky */
  MIN_FLAKY_SCORE: 0.5,
  /** Base score for timing-related patterns */
  TIMING_SCORE: 0.7,
  /** Base score for race condition patterns */
  RACE_CONDITION_SCORE: 0.8,
  /** Base score for network/external service patterns */
  NETWORK_SCORE: 0.6,
  /** Base score for resource exhaustion patterns */
  RESOURCE_SCORE: 0.5,
  /** Placeholder score for historical data (to be implemented) */
  HISTORICAL_SCORE: 0.9,
} as const;

/**
 * Patterns that indicate timing-related flakiness.
 */
const TIMING_PATTERNS: readonly RegExp[] = [
  /timeout|timed out/i,
  /exceeded \d+\s*m?s/i,
  /too slow/i,
  /deadline exceeded/i,
  /jest\.setTimeout/i,
  /waitFor.*timed? ?out/i,
  /async.*timeout/i,
] as const;

/**
 * Patterns that indicate race condition flakiness.
 */
const RACE_CONDITION_PATTERNS: readonly RegExp[] = [
  /race condition/i,
  /intermittent/i,
  /flaky/i,
  /order.*depend/i,
  /not yet.*available/i,
  /state.*inconsistent/i,
  /concurrent/i,
  /parallel.*fail/i,
] as const;

/**
 * Patterns that indicate network/external dependency flakiness.
 */
const NETWORK_PATTERNS: readonly RegExp[] = [
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /network.*error/i,
  /connection.*refused/i,
  /socket hang up/i,
  /request.*fail/i,
  /fetch.*fail/i,
  /api.*unavailable/i,
] as const;

/**
 * Patterns that indicate resource exhaustion flakiness.
 */
const RESOURCE_PATTERNS: readonly RegExp[] = [
  /out of memory/i,
  /OOM/i,
  /heap.*exceeded/i,
  /resource.*exhausted/i,
  /too many open files/i,
  /ENOMEM/i,
  /memory.*limit/i,
] as const;

// ==================== Detection Functions ====================

/**
 * Pattern category with associated score and reason.
 */
interface PatternCategory {
  readonly patterns: readonly RegExp[];
  readonly score: number;
  readonly reason: string;
}

/**
 * All pattern categories for flaky detection.
 */
const FLAKY_PATTERN_CATEGORIES: readonly PatternCategory[] = [
  {
    patterns: RACE_CONDITION_PATTERNS,
    score: FLAKY_THRESHOLDS.RACE_CONDITION_SCORE,
    reason: "race condition indicators",
  },
  {
    patterns: TIMING_PATTERNS,
    score: FLAKY_THRESHOLDS.TIMING_SCORE,
    reason: "timing-dependent behavior",
  },
  {
    patterns: NETWORK_PATTERNS,
    score: FLAKY_THRESHOLDS.NETWORK_SCORE,
    reason: "network/external dependency",
  },
  {
    patterns: RESOURCE_PATTERNS,
    score: FLAKY_THRESHOLDS.RESOURCE_SCORE,
    reason: "resource exhaustion",
  },
] as const;

/**
 * Checks error message against pattern categories.
 */
const matchPatternCategory = (error: string): { score: number; reason: string } | null => {
  const matchedCategory = FLAKY_PATTERN_CATEGORIES.find((category) =>
    category.patterns.some((pattern) => pattern.test(error))
  );

  return matchedCategory ? { score: matchedCategory.score, reason: matchedCategory.reason } : null;
};

/**
 * Checks if a single test might be flaky based on heuristics.
 * Uses error message patterns to detect common flaky test indicators.
 *
 * @param testName - Name of the test
 * @param error - Optional error message from the test failure
 * @returns True if the test shows signs of flakiness
 *
 * @example
 * isTestPotentiallyFlaky('should load data', 'timeout exceeded 5000ms')
 * // Returns: true (timing-related failure)
 */
export const isTestPotentiallyFlaky = (testName: string, error?: string): boolean => {
  // Check test name for flaky indicators
  if (/flaky|intermittent|unstable/i.test(testName)) {
    return true;
  }

  // Check error message patterns
  if (error) {
    return matchPatternCategory(error) !== null;
  }

  return false;
};

/**
 * Detects potentially flaky tests from a list of test failures.
 * Returns tests that match flaky patterns with their confidence scores.
 *
 * Note: This is a heuristic-based implementation. Future versions will
 * integrate historical failure data for more accurate detection.
 *
 * @param testFailures - Array of test failures to check
 * @returns Detection result with flaky tests and metadata
 *
 * @example
 * const result = detectFlakyTests([
 *   { testName: 'should load data', error: 'timeout exceeded' },
 *   { testName: 'should validate', error: 'expected true' },
 * ]);
 * // result.hasFlakyTests: true
 * // result.flakyTests: [{ testName: 'should load data', flakyScore: 0.7, ... }]
 */
export const detectFlakyTests = (testFailures: readonly TestFailureInput[]): FlakyTestResult => {
  const flakyTests: FlakyTestInfo[] = [];

  testFailures.forEach((failure) => {
    // Check test name patterns
    if (/flaky|intermittent|unstable/i.test(failure.testName)) {
      flakyTests.push({
        testName: failure.testName,
        file: failure.file,
        flakyScore: FLAKY_THRESHOLDS.RACE_CONDITION_SCORE,
        reason: "test name indicates flakiness",
      });
      return;
    }

    // Check error message patterns
    if (failure.error) {
      const match = matchPatternCategory(failure.error);
      if (match && match.score >= FLAKY_THRESHOLDS.MIN_FLAKY_SCORE) {
        flakyTests.push({
          testName: failure.testName,
          file: failure.file,
          flakyScore: match.score,
          reason: match.reason,
        });
      }
    }
  });

  return {
    flakyTests,
    hasFlakyTests: flakyTests.length > 0,
    totalChecked: testFailures.length,
  };
};

/**
 * Formats a flaky test warning message for display.
 *
 * @param flakyResult - Result from detectFlakyTests
 * @returns Formatted warning message or null if no flaky tests
 */
export const formatFlakyTestWarning = (flakyResult: FlakyTestResult): string | null => {
  if (!flakyResult.hasFlakyTests) {
    return null;
  }

  const count = flakyResult.flakyTests.length;
  const testWord = count === 1 ? "test" : "tests";

  const reasons = Array.from(new Set(flakyResult.flakyTests.map((test) => test.reason)));

  const reasonText =
    reasons.length === 1
      ? reasons[0]
      : `${reasons.slice(0, -1).join(", ")} and ${reasons.slice(-1)[0]}`;

  return `⚠️ ${count} potentially flaky ${testWord} detected (${reasonText}). Consider re-running before investigating.`;
};
