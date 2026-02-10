/**
 * Unit tests for Test Failure Processing Helpers
 */

import { describe, it, expect } from "@jest/globals";
import type { TestFailureInfo } from "@kenchi/shared";
import {
  categorizeFailures,
  generateConsolidatedActions,
  generateErrorBreakdownVisual,
  extractAssertionDiff,
} from "../../services/formatters/testFailureHelpers.js";

// ==================== Test Fixtures ====================

const makeFailure = (overrides: Partial<TestFailureInfo> = {}): TestFailureInfo => ({
  testName: "test_example",
  error: "Test failed",
  ...overrides,
});

const makeLLMAction = (description: string) => ({
  description,
  priority: "high" as const,
});

// ==================== generateConsolidatedActions ====================

describe("generateConsolidatedActions", () => {
  it("passes through LLM actions as primary when test failures present", () => {
    const failures = [
      makeFailure({ testName: "test_add", expected: "5", actual: "6" }),
      makeFailure({ testName: "test_sub", expected: "3", actual: "4" }),
    ];
    const llmActions = [
      makeLLMAction("Fix off-by-one in add() and subtract() functions"),
      makeLLMAction("Run cargo test to verify fixes"),
    ];

    const result = generateConsolidatedActions(failures, llmActions);

    expect(result).toEqual([
      "Fix off-by-one in add() and subtract() functions",
      "Run cargo test to verify fixes",
    ]);
  });

  it("passes through LLM actions when no test failures present", () => {
    const llmActions = [
      makeLLMAction("Run cargo fmt to fix formatting"),
      makeLLMAction("Remove unused variable on line 7"),
    ];

    const result = generateConsolidatedActions([], llmActions);

    expect(result).toEqual(["Run cargo fmt to fix formatting", "Remove unused variable on line 7"]);
  });

  it("caps LLM actions at MAX_ACTIONS (3)", () => {
    const llmActions = [
      makeLLMAction("Action 1"),
      makeLLMAction("Action 2"),
      makeLLMAction("Action 3"),
      makeLLMAction("Action 4"),
      makeLLMAction("Action 5"),
    ];

    const result = generateConsolidatedActions([], llmActions);

    expect(result).toHaveLength(3);
    expect(result).toEqual(["Action 1", "Action 2", "Action 3"]);
  });

  it("returns fallback summary when LLM provides 0 actions and test failures exist", () => {
    const failures = [
      makeFailure({ testName: "test_add", expected: "5", actual: "6" }),
      makeFailure({ testName: "test_sub", expected: "3", actual: "4" }),
      makeFailure({ testName: "test_timeout", error: "timeout exceeded" }),
    ];

    const result = generateConsolidatedActions(failures, []);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("Review 3 test failures");
    expect(result[0]).toContain("2 assertion failures");
    expect(result[0]).toContain("1 timeout/async issue");
  });

  it("returns empty array when no failures and no actions", () => {
    const result = generateConsolidatedActions([], []);

    expect(result).toEqual([]);
  });

  it("returns single LLM action when only one provided", () => {
    const failures = [makeFailure({ expected: "1", actual: "2" })];
    const llmActions = [makeLLMAction("Fix the add function")];

    const result = generateConsolidatedActions(failures, llmActions);

    expect(result).toEqual(["Fix the add function"]);
  });
});

// ==================== categorizeFailures ====================

describe("categorizeFailures", () => {
  it("classifies by structural assertion check when expected AND actual present", () => {
    const failures = [makeFailure({ expected: "5", actual: "6", error: "some random error text" })];

    const result = categorizeFailures(failures);

    expect(result.assertion).toBe(1);
    expect(result.timeout).toBe(0);
    expect(result.module_not_found).toBe(0);
    expect(result.runtime).toBe(0);
    expect(result.other).toBe(0);
  });

  it("classifies assertion by keyword when no expected/actual fields", () => {
    const failures = [makeFailure({ error: "Expected true to equal false" })];

    const result = categorizeFailures(failures);

    expect(result.assertion).toBe(1);
  });

  it("classifies timeout by keyword", () => {
    const failures = [makeFailure({ error: "Timeout - Async callback was not invoked" })];

    const result = categorizeFailures(failures);

    expect(result.timeout).toBe(1);
  });

  it("classifies module_not_found for 'Cannot find module'", () => {
    const failures = [
      makeFailure({ error: "Cannot find module '../../llm/providers/openai/embedding.js'" }),
    ];

    const result = categorizeFailures(failures);

    expect(result.module_not_found).toBe(1);
    expect(result.runtime).toBe(0);
  });

  it("classifies module_not_found for 'Could not locate module'", () => {
    const failures = [
      makeFailure({ error: "Could not locate module ../../llm/providers/openai/embedding.js" }),
    ];

    const result = categorizeFailures(failures);

    expect(result.module_not_found).toBe(1);
  });

  it("classifies module_not_found for Python 'No module named'", () => {
    const failures = [makeFailure({ error: "ModuleNotFoundError: No module named 'pandas'" })];

    const result = categorizeFailures(failures);

    expect(result.module_not_found).toBe(1);
  });

  it("module_not_found takes priority over runtime when both keywords match", () => {
    // "Cannot find module" contains patterns that could match runtime ("undefined")
    // but module_not_found should win because it's checked first
    const failures = [
      makeFailure({
        error: "Cannot find module './utils' - undefined is not an object",
      }),
    ];

    const result = categorizeFailures(failures);

    expect(result.module_not_found).toBe(1);
    expect(result.runtime).toBe(0);
  });

  it("classifies runtime errors by keyword", () => {
    const failures = [makeFailure({ error: "TypeError: Cannot read properties of undefined" })];

    const result = categorizeFailures(failures);

    expect(result.runtime).toBe(1);
  });

  it("classifies other when no keywords match", () => {
    const failures = [makeFailure({ error: "Some unknown test failure" })];

    const result = categorizeFailures(failures);

    expect(result.other).toBe(1);
  });

  it("handles mixed failure types correctly", () => {
    const failures = [
      makeFailure({ expected: "5", actual: "6" }),
      makeFailure({ expected: "3", actual: "4" }),
      makeFailure({ error: "Timeout exceeded waiting for element" }),
      makeFailure({ error: "Cannot find module 'lodash'" }),
      makeFailure({ error: "TypeError: foo is not a function" }),
      makeFailure({ error: "Something went wrong" }),
    ];

    const result = categorizeFailures(failures);

    expect(result.assertion).toBe(2);
    expect(result.timeout).toBe(1);
    expect(result.module_not_found).toBe(1);
    expect(result.runtime).toBe(1);
    expect(result.other).toBe(1);
    expect(result.total).toBe(6);
  });

  it("returns zeros for empty input", () => {
    const result = categorizeFailures([]);

    expect(result).toEqual({
      assertion: 0,
      timeout: 0,
      module_not_found: 0,
      runtime: 0,
      other: 0,
      total: 0,
    });
  });

  it("structural check takes priority over keyword matching", () => {
    // Has expected/actual AND assertion keywords — structural check should win
    const failures = [
      makeFailure({ expected: "true", actual: "false", error: "Expected true to be false" }),
    ];

    const result = categorizeFailures(failures);

    // Should be counted once as assertion (not double-counted)
    expect(result.assertion).toBe(1);
    expect(result.total).toBe(1);
  });
});

// ==================== generateErrorBreakdownVisual ====================

describe("generateErrorBreakdownVisual", () => {
  it("returns empty array for zero total", () => {
    const result = generateErrorBreakdownVisual({
      assertion: 0,
      timeout: 0,
      module_not_found: 0,
      runtime: 0,
      other: 0,
      total: 0,
    });

    expect(result).toEqual([]);
  });

  it("includes Module row when module_not_found > 0", () => {
    const result = generateErrorBreakdownVisual({
      assertion: 2,
      timeout: 0,
      module_not_found: 1,
      runtime: 0,
      other: 0,
      total: 3,
    });

    expect(result).toContainEqual(expect.stringContaining("Assertion"));
    expect(result).toContainEqual(expect.stringContaining("Module"));
    expect(result).not.toContainEqual(expect.stringContaining("Timeout"));
    expect(result).not.toContainEqual(expect.stringContaining("Runtime"));
  });

  it("only shows categories with non-zero counts", () => {
    const result = generateErrorBreakdownVisual({
      assertion: 5,
      timeout: 0,
      module_not_found: 0,
      runtime: 0,
      other: 0,
      total: 5,
    });

    const contentLines = result.filter((line) => line !== "**Error Breakdown:**" && line !== "```");
    expect(contentLines).toHaveLength(1);
    expect(contentLines[0]).toContain("Assertion");
  });

  it("shows all categories when all have counts", () => {
    const result = generateErrorBreakdownVisual({
      assertion: 1,
      timeout: 1,
      module_not_found: 1,
      runtime: 1,
      other: 1,
      total: 5,
    });

    const contentLines = result.filter((line) => line !== "**Error Breakdown:**" && line !== "```");
    expect(contentLines).toHaveLength(5);
  });
});

// ==================== extractAssertionDiff ====================

describe("extractAssertionDiff", () => {
  it("extracts expected and received from standard format", () => {
    const result = extractAssertionDiff("Expected: 5\nReceived: 6");

    expect(result).toEqual({ expected: "5", received: "6" });
  });

  it("returns null when no assertion pattern found", () => {
    const result = extractAssertionDiff("Some generic error message");

    expect(result).toBeNull();
  });

  it("extracts only expected when received is missing", () => {
    const result = extractAssertionDiff("Expected: true");

    expect(result).toEqual({ expected: "true", received: undefined });
  });
});
