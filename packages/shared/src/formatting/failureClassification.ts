/**
 * Failure Classification Utilities
 *
 * Functions for classifying and partitioning CI failures
 * into categories like assertions, timeouts, and infrastructure issues.
 */

import { INFRA_PATTERNS } from "../openaiClient/evidencePatterns.js";

// ==================== Types ====================

/**
 * Failure classification types for separating infrastructure issues from assertions.
 */
export type FailureClassificationType = "assertion" | "timeout" | "infra";

/**
 * Result of partitioning failures by type.
 */
export interface PartitionedFailures<T> {
  readonly assertions: readonly T[];
  readonly timeouts: readonly T[];
  readonly infra: readonly T[];
}

// ==================== Constants ====================

/**
 * Pattern for timeout errors in test failure messages.
 */
const TIMEOUT_PATTERN = /timeout|timed out|exceeded \d+m?s/i;

/**
 * Maps classification type to partition key.
 */
const CLASSIFICATION_TO_KEY: Record<FailureClassificationType, keyof PartitionedFailures<unknown>> =
  {
    assertion: "assertions",
    timeout: "timeouts",
    infra: "infra",
  } as const;

// ==================== Classification Functions ====================

/**
 * Classifies a test failure as assertion, timeout, or infrastructure issue.
 * Used to separate infrastructure problems from actual test failures.
 *
 * @param testFailure - Test failure with optional error message
 * @returns Classification: "assertion", "timeout", or "infra"
 *
 * @example
 * classifyTestFailure({ testName: 'test', error: 'Timeout exceeded 5000ms' })
 * // Returns: 'timeout'
 */
export const classifyTestFailure = <T extends { error?: string }>(
  testFailure: T
): FailureClassificationType => {
  const error = testFailure.error?.toLowerCase() ?? "";

  // Check for timeout patterns first (most specific)
  if (TIMEOUT_PATTERN.test(error)) {
    return "timeout";
  }

  // Check against infrastructure patterns
  if (INFRA_PATTERNS.some((pattern) => pattern.test(error))) {
    return "infra";
  }

  // Default to assertion failure
  return "assertion";
};

/**
 * Partitions test failures by their classification type.
 * Separates infrastructure issues and timeouts from assertion failures.
 *
 * @param failures - Array of failures to partition
 * @returns Object with assertions, timeouts, and infra arrays
 *
 * @example
 * const { assertions, timeouts, infra } = partitionByFailureType(failures);
 * // assertions: test failures, timeouts: timeout failures, infra: OOM/network issues
 */
export const partitionByFailureType = <T extends { error?: string }>(
  failures: readonly T[]
): PartitionedFailures<T> =>
  failures.reduce<PartitionedFailures<T>>(
    (accumulator, failure) => {
      const classification = classifyTestFailure(failure);
      const key = CLASSIFICATION_TO_KEY[classification];
      return {
        ...accumulator,
        [key]: [...accumulator[key], failure],
      };
    },
    { assertions: [], timeouts: [], infra: [] }
  );
