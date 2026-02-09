/**
 * Test Failure Processing Helpers
 *
 * Utilities for categorizing, filtering, and analyzing test failures.
 */

import { GITHUB_COMMENT_DISPLAY, UI_CONSTANTS, type TestFailureInfo } from "@kenchi/shared";
import { type ErrorCategoryBreakdown, PROGRESS_BAR } from "./prCommentTypes.js";

/** LLM-generated recommended action */
interface LLMAction {
  readonly description: string;
  readonly priority: string | number;
}

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
  let assertion = 0;
  let timeout = 0;
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
    } else if (isRuntimeByKeyword(errorLower)) {
      runtime++;
    } else {
      other++;
    }
  }

  return {
    assertion,
    timeout,
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
 * Generate consolidated actions by error type (not per file).
 * Works with any test framework - LLM already filters real failures.
 *
 * Uses the same priority logic as categorizeFailures:
 * Priority 1: expected AND actual fields present -> assertion
 * Priority 2: keyword matching in error message
 */
export const generateConsolidatedActions = (
  testFailures: readonly TestFailureInfo[],
  llmActions: readonly LLMAction[]
): string[] => {
  if (testFailures.length === 0) {
    return llmActions
      .slice(0, GITHUB_COMMENT_DISPLAY.MAX_ACTIONS)
      .map((action) => action.description);
  }

  const actions: string[] = [];

  // Single-pass categorization with expected/actual priority
  let assertionCount = 0;
  let timeoutCount = 0;
  let typeErrorCount = 0;

  for (const failure of testFailures) {
    // Priority 1: Structural check — expected AND actual fields present means assertion
    if (
      failure.expected !== null &&
      failure.expected !== undefined &&
      failure.actual !== null &&
      failure.actual !== undefined
    ) {
      assertionCount++;
      continue;
    }

    // Priority 2: Keyword matching (single category per failure)
    const errorLower = failure.error?.toLowerCase() ?? "";
    if (isAssertionByKeyword(errorLower)) {
      assertionCount++;
    } else if (isTimeoutByKeyword(errorLower)) {
      timeoutCount++;
    } else if (isRuntimeByKeyword(errorLower)) {
      typeErrorCount++;
    }
  }

  // Get unique files
  const uniqueFiles = [...new Set(testFailures.map((failure) => failure.file).filter(Boolean))];

  // Generate one action per error type
  if (assertionCount > 0) {
    actions.push(
      `**Assertion failures (${assertionCount})**: Test expectations don't match actual values. Review the expected vs received values and update tests or fix the implementation.`
    );
  }

  if (timeoutCount > 0) {
    actions.push(
      `**Timeout/Async issues (${timeoutCount})**: Tests timing out or async operations not completing. Check for missing \`await\`, increase timeouts, or fix hanging promises.`
    );
  }

  if (typeErrorCount > 0) {
    actions.push(
      `**Type/Runtime errors (${typeErrorCount})**: Code throwing errors during execution. Check for undefined values, missing imports, or incorrect function calls.`
    );
  }

  // Add file summary if multiple files affected
  if (uniqueFiles.length > 1) {
    const fileList = uniqueFiles
      .slice(0, GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS)
      .map((filePath) => `\`${filePath?.split("/").pop()}\``)
      .join(", ");
    actions.push(
      `**Files to review**: ${fileList}${uniqueFiles.length > GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS ? " and more" : ""}`
    );
  }

  // Add one relevant LLM action if not redundant
  const relevantLlmAction = llmActions.find(
    (llmAction) =>
      !actions.some((action) =>
        action
          .toLowerCase()
          .includes(
            llmAction.description.substring(0, GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS).toLowerCase()
          )
      )
  );
  if (relevantLlmAction) {
    actions.push(relevantLlmAction.description);
  }

  return actions.slice(0, GITHUB_COMMENT_DISPLAY.MAX_ACTIONS);
};
