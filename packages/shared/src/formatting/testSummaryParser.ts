/**
 * Test Summary Parser
 *
 * Parses test failure counts deterministically from CI runner output using regex.
 * No LLM involved — guaranteed consistent results for the same log input.
 *
 * Supports: Jest/Vitest, pytest, Rust/cargo, Go, and generic patterns.
 *
 * @module formatting/testSummaryParser
 */

import type { ParsedTestSummary } from "./extraction/types.js";

// ==================== Framework Parsers ====================

/**
 * Parse Jest/Vitest test summary.
 * Matches: "Tests: 44 failed, 3712 passed, 3756 total"
 * Also extracts suite count from: "Test Suites: 12 failed, ..."
 */
const parseJestSummary = (log: string): ParsedTestSummary | null => {
  // Match "Tests:" summary line (last occurrence in log)
  const testMatches = [
    ...log.matchAll(
      /Tests:\s+(\d+)\s+failed(?:,\s+\d+\s+\w+)*,\s+(\d+)\s+passed,\s+(\d+)\s+total/gi
    ),
  ];
  if (testMatches.length === 0) {
    return null;
  }

  const lastMatch = testMatches[testMatches.length - 1];
  const result: ParsedTestSummary = {
    failed: Number(lastMatch[1]),
    passed: Number(lastMatch[2]),
    total: Number(lastMatch[3]),
    framework: "jest",
  };

  // Try to extract suite count
  const suiteMatches = [...log.matchAll(/Test Suites:\s+(\d+)\s+failed/gi)];
  if (suiteMatches.length > 0) {
    const lastSuiteMatch = suiteMatches[suiteMatches.length - 1];
    return { ...result, failedSuites: Number(lastSuiteMatch[1]) };
  }

  return result;
};

/**
 * Parse pytest summary.
 * Matches: "===== 5 failed, 10 passed in 3.2s ====="
 */
const parsePytestSummary = (log: string): ParsedTestSummary | null => {
  const matches = [...log.matchAll(/={3,}\s+(\d+)\s+failed(?:,\s+(\d+)\s+passed)?.*?={3,}/gi)];
  if (matches.length === 0) {
    return null;
  }

  const lastMatch = matches[matches.length - 1];
  const failed = Number(lastMatch[1]);
  const passed = Number(lastMatch[2] ?? 0);

  return {
    failed,
    passed,
    total: failed + passed,
    framework: "pytest",
  };
};

/**
 * Parse Rust/cargo test summary.
 * Matches: "test result: FAILED. 3 passed; 2 failed; 0 ignored; 0 measured"
 */
const parseRustSummary = (log: string): ParsedTestSummary | null => {
  const matches = [...log.matchAll(/test result:\s*FAILED\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/gi)];
  if (matches.length === 0) {
    return null;
  }

  const lastMatch = matches[matches.length - 1];
  const passed = Number(lastMatch[1]);
  const failed = Number(lastMatch[2]);

  return {
    failed,
    passed,
    total: passed + failed,
    framework: "rust",
  };
};

/**
 * Parse Go test summary.
 * Go prints "FAIL\t<package>" for each failing package and
 * "--- FAIL: TestName" for each failing test.
 * Count individual test failures for accuracy.
 */
const parseGoSummary = (log: string): ParsedTestSummary | null => {
  const failLines = [...log.matchAll(/^--- FAIL:/gm)];
  if (failLines.length === 0) {
    return null;
  }

  const passLines = [...log.matchAll(/^--- PASS:/gm)];

  return {
    failed: failLines.length,
    passed: passLines.length,
    total: failLines.length + passLines.length,
    framework: "go",
  };
};

/**
 * Parse generic test summary.
 * Matches: "X failed, Y passed" or "X failures, Y successes"
 */
const parseGenericSummary = (log: string): ParsedTestSummary | null => {
  const matches = [
    ...log.matchAll(/(\d+)\s+(?:failed|failures?),?\s+(\d+)\s+(?:passed|success(?:es)?)/gi),
  ];
  if (matches.length === 0) {
    return null;
  }

  const lastMatch = matches[matches.length - 1];
  const failed = Number(lastMatch[1]);
  const passed = Number(lastMatch[2]);

  return {
    failed,
    passed,
    total: failed + passed,
    framework: "generic",
  };
};

// ==================== Main Parser ====================

/** Framework parsers in priority order (most specific first). */
const FRAMEWORK_PARSERS = [
  parseJestSummary,
  parsePytestSummary,
  parseRustSummary,
  parseGoSummary,
  parseGenericSummary,
] as const;

/**
 * Parse test failure count deterministically from CI runner output.
 *
 * Tries framework-specific patterns in priority order and returns
 * the first successful match. Returns null if no recognizable
 * test summary is found.
 *
 * @param log - Raw CI log output
 * @returns Parsed test summary or null if not found
 */
export const parseTestSummary = (log: string): ParsedTestSummary | null => {
  if (!log) {
    return null;
  }

  for (const parser of FRAMEWORK_PARSERS) {
    const result = parser(log);
    if (result && result.failed > 0) {
      return result;
    }
  }

  return null;
};
