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
 * Categorize test failures by error type.
 * Works with any test framework - LLM already filters real failures.
 */
export const categorizeFailures = (
  testFailures: readonly TestFailureInfo[]
): ErrorCategoryBreakdown => {
  const assertion = testFailures.filter(
    (failure) =>
      failure.error?.toLowerCase().includes("expect") ||
      failure.error?.toLowerCase().includes("assert") ||
      failure.error?.toLowerCase().includes("received") ||
      failure.error?.toLowerCase().includes("tobe") ||
      failure.error?.toLowerCase().includes("toequal")
  ).length;

  const timeout = testFailures.filter(
    (failure) =>
      failure.error?.toLowerCase().includes("timeout") ||
      failure.error?.toLowerCase().includes("exceeded") ||
      failure.error?.toLowerCase().includes("async")
  ).length;

  const runtime = testFailures.filter(
    (failure) =>
      failure.error?.toLowerCase().includes("typeerror") ||
      failure.error?.toLowerCase().includes("referenceerror") ||
      failure.error?.toLowerCase().includes("is not a function") ||
      failure.error?.toLowerCase().includes("undefined") ||
      failure.error?.toLowerCase().includes("null")
  ).length;

  // Other = total - categorized, avoiding double counting
  const categorized = new Set<TestFailureInfo>();
  testFailures.forEach((failure) => {
    const errorLower = failure.error?.toLowerCase() ?? "";
    if (
      errorLower.includes("expect") ||
      errorLower.includes("assert") ||
      errorLower.includes("received") ||
      errorLower.includes("tobe") ||
      errorLower.includes("toequal")
    ) {
      categorized.add(failure);
    } else if (
      errorLower.includes("timeout") ||
      errorLower.includes("exceeded") ||
      errorLower.includes("async")
    ) {
      categorized.add(failure);
    } else if (
      errorLower.includes("typeerror") ||
      errorLower.includes("referenceerror") ||
      errorLower.includes("is not a function") ||
      errorLower.includes("undefined") ||
      errorLower.includes("null")
    ) {
      categorized.add(failure);
    }
  });

  const other = testFailures.length - categorized.size;

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

  // Count error types across all failures
  const assertionFailures = testFailures.filter(
    (failure) =>
      failure.error?.toLowerCase().includes("expect") ||
      failure.error?.toLowerCase().includes("assert") ||
      failure.error?.toLowerCase().includes("received")
  );

  const timeoutFailures = testFailures.filter(
    (failure) =>
      failure.error?.toLowerCase().includes("timeout") ||
      failure.error?.toLowerCase().includes("exceeded")
  );

  const typeErrors = testFailures.filter(
    (failure) =>
      failure.error?.toLowerCase().includes("typeerror") ||
      failure.error?.toLowerCase().includes("is not a function") ||
      failure.error?.toLowerCase().includes("undefined")
  );

  // Get unique files
  const uniqueFiles = [...new Set(testFailures.map((failure) => failure.file).filter(Boolean))];

  // Generate one action per error type
  if (assertionFailures.length > 0) {
    actions.push(
      `**Assertion failures (${assertionFailures.length})**: Test expectations don't match actual values. Review the expected vs received values and update tests or fix the implementation.`
    );
  }

  if (timeoutFailures.length > 0) {
    actions.push(
      `**Timeout/Async issues (${timeoutFailures.length})**: Tests timing out or async operations not completing. Check for missing \`await\`, increase timeouts, or fix hanging promises.`
    );
  }

  if (typeErrors.length > 0) {
    actions.push(
      `**Type/Runtime errors (${typeErrors.length})**: Code throwing errors during execution. Check for undefined values, missing imports, or incorrect function calls.`
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
