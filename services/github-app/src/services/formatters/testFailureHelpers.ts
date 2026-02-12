/**
 * Test Failure Processing Helpers
 *
 * Utilities for categorizing, filtering, and analyzing test failures.
 */

import { GITHUB_COMMENT_DISPLAY, UI_CONSTANTS, type TestFailureInfo } from "@kenchi/shared";
import { type ErrorCategoryBreakdown, type LLMAction, PROGRESS_BAR } from "./prCommentTypes.js";

/**
 * Extract Expected/Received values from assertion error.
 */
export const extractAssertionDiff = (
  error: string
): { expected?: string; received?: string } | null => {
  const expectedMatch = error.match(/Expected[:\s]+(.+?)(?:\n|Received|$)/i);
  const receivedMatch = error.match(/Received[:\s]+(.+?)(?:\n|$)/i);

  if (expectedMatch || receivedMatch) {
    return {
      expected: expectedMatch?.[1]
        ?.trim()
        .substring(0, GITHUB_COMMENT_DISPLAY.MAX_ERROR_LINE_LENGTH),
      received: receivedMatch?.[1]
        ?.trim()
        .substring(0, GITHUB_COMMENT_DISPLAY.MAX_ERROR_LINE_LENGTH),
    };
  }
  return null;
};

/**
 * Generate a visual progress bar.
 */
export const generateProgressBar = (value: number, total: number): string => {
  if (total === 0) {
    return PROGRESS_BAR.EMPTY.repeat(PROGRESS_BAR.WIDTH);
  }
  const percentage = value / total;
  const filledCount = Math.round(percentage * PROGRESS_BAR.WIDTH);
  const emptyCount = PROGRESS_BAR.WIDTH - filledCount;
  return PROGRESS_BAR.FILLED.repeat(filledCount) + PROGRESS_BAR.EMPTY.repeat(emptyCount);
};

/**
 * Check if a failure matches assertion keywords in its error message.
 */
const isAssertionByKeyword = (errorLower: string): boolean =>
  errorLower.includes("expect") ||
  errorLower.includes("assert") ||
  errorLower.includes("received") ||
  errorLower.includes("tobe") ||
  errorLower.includes("toequal");

/**
 * Check if a failure matches timeout keywords in its error message.
 */
const isTimeoutByKeyword = (errorLower: string): boolean =>
  errorLower.includes("timeout") || errorLower.includes("exceeded") || errorLower.includes("async");

/**
 * Check if a failure matches module-not-found keywords in its error message.
 * Checked before runtime because "Cannot find module" errors often contain
 * "undefined" which would incorrectly match the runtime category.
 */
const isModuleNotFoundByKeyword = (errorLower: string): boolean =>
  errorLower.includes("could not locate module") ||
  errorLower.includes("cannot find module") ||
  errorLower.includes("module not found") ||
  errorLower.includes("no module named") ||
  errorLower.includes("modulenotfounderror");

/**
 * Check if a failure matches runtime error keywords in its error message.
 */
const isRuntimeByKeyword = (errorLower: string): boolean =>
  errorLower.includes("typeerror") ||
  errorLower.includes("referenceerror") ||
  errorLower.includes("is not a function") ||
  errorLower.includes("undefined") ||
  errorLower.includes("null");

/**
 * Categorize test failures by error type using single-pass classification.
 *
 * Priority 1: If expected AND actual fields are present, classify as assertion
 * (structural/deterministic check, independent of LLM-written error text).
 * Priority 2: Fall back to keyword matching in the error message.
 *
 * Each failure is assigned to exactly one category (no double counting).
 */
export const categorizeFailures = (
  testFailures: readonly TestFailureInfo[]
): ErrorCategoryBreakdown => {
  // let: single-pass accumulator counters for categorization
  let assertion = 0;
  let timeout = 0;
  let moduleNotFound = 0;
  let runtime = 0;
  let other = 0;

  for (const failure of testFailures) {
    // Priority 1: Structural check — expected AND actual fields present means assertion
    if (
      failure.expected !== null &&
      failure.expected !== undefined &&
      failure.actual !== null &&
      failure.actual !== undefined
    ) {
      assertion++;
      continue;
    }

    // Priority 2: Keyword matching in error message (single category per failure)
    const errorLower = failure.error?.toLowerCase() ?? "";
    if (isAssertionByKeyword(errorLower)) {
      assertion++;
    } else if (isTimeoutByKeyword(errorLower)) {
      timeout++;
    } else if (isModuleNotFoundByKeyword(errorLower)) {
      moduleNotFound++;
    } else if (isRuntimeByKeyword(errorLower)) {
      runtime++;
    } else {
      other++;
    }
  }

  return {
    assertion,
    timeout,
    module_not_found: moduleNotFound,
    runtime,
    other: Math.max(0, other),
    total: testFailures.length,
  };
};

/**
 * Generate error category breakdown visual.
 */
export const generateErrorBreakdownVisual = (breakdown: ErrorCategoryBreakdown): string[] => {
  if (breakdown.total === 0) {
    return [];
  }

  const categories = [
    { name: "Assertion", count: breakdown.assertion },
    { name: "Timeout  ", count: breakdown.timeout },
    { name: "Module   ", count: breakdown.module_not_found },
    { name: "Runtime  ", count: breakdown.runtime },
    { name: "Other    ", count: breakdown.other },
  ];

  const visibleCategories = categories.filter((category) => category.count > 0);

  if (visibleCategories.length === 0) {
    return [];
  }

  const breakdownLines = visibleCategories.map((category) => {
    const progressBar = generateProgressBar(category.count, breakdown.total);
    const percentage = Math.round(
      (category.count / breakdown.total) * UI_CONSTANTS.PERCENTAGE_MULTIPLIER
    );
    return `${category.name} ${progressBar} ${percentage.toString().padStart(GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS)}% (${category.count})`;
  });

  return ["**Error Breakdown:**", "```", ...breakdownLines, "```"];
};

/**
 * Build a fallback summary line from categorized test failures.
 * Used only when the LLM provides no recommended actions.
 */
const buildFallbackSummary = (testFailures: readonly TestFailureInfo[]): string => {
  const breakdown = categorizeFailures(testFailures);

  const categories = [
    { count: breakdown.assertion, label: "assertion failure" },
    { count: breakdown.timeout, label: "timeout/async issue" },
    { count: breakdown.module_not_found, label: "missing module" },
    { count: breakdown.runtime, label: "runtime error" },
    { count: breakdown.other, label: "other failure" },
  ] as const;

  const parts = categories
    .filter((cat) => cat.count > 0)
    .map((cat) => `${cat.count} ${cat.label}${cat.count > 1 ? "s" : ""}`);

  const count = testFailures.length;
  const suffix = parts.length > 0 ? `: ${parts.join(", ")}` : "";
  return `Review ${count} test failure${count > 1 ? "s" : ""}${suffix}`;
};

/**
 * Generate consolidated recommended actions.
 *
 * LLM-generated actions are primary — the analysis prompts already instruct
 * surgical, pattern-based recommendations. Template fallback only fires
 * when the LLM returns zero actions.
 */
export const generateConsolidatedActions = (
  testFailures: readonly TestFailureInfo[],
  llmActions: readonly LLMAction[]
): string[] => {
  // LLM actions available — use them directly (already surgical per prompt instructions)
  if (llmActions.length > 0) {
    return llmActions
      .slice(0, GITHUB_COMMENT_DISPLAY.MAX_ACTIONS)
      .map((action) => action.description);
  }

  // No LLM actions and no test failures — nothing to recommend
  if (testFailures.length === 0) {
    return [];
  }

  // Fallback: single context-aware summary when LLM provided no actions
  return [buildFallbackSummary(testFailures)];
};
