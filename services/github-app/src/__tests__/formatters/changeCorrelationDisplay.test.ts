/**
 * Unit tests for Change Correlation Display in PR Comments
 *
 * Tests the correlation table, cross-reference lines, and integration
 * with failure sections in the PR comment formatter.
 */

import { describe, it, expect } from "@jest/globals";
import { UI_EMOJI, GITHUB_COMMENT_DISPLAY, type LLMChangeCorrelation } from "@kenchi/shared";
import {
  buildChangeCorrelationSection,
  buildTestFileGroup,
  buildTestFailuresSection,
  buildFailureSection,
} from "../../services/formatters/prCommentFormatter.js";

// ==================== Test Fixtures ====================

const makeCorrelation = (overrides: Partial<LLMChangeCorrelation> = {}): LLMChangeCorrelation => ({
  changedFunction: "add",
  changedFile: "src/calculator.ts",
  changedLine: 8,
  failingTests: ["test_add"],
  correlation: "high",
  explanation: "The add function was modified and test_add directly tests it",
  ...overrides,
});

// ==================== buildChangeCorrelationSection ====================

describe("buildChangeCorrelationSection", () => {
  it("returns empty array for empty correlations", () => {
    const result = buildChangeCorrelationSection([]);

    expect(result).toEqual([]);
  });

  it("renders a single correlation as a collapsible table", () => {
    const correlations = [makeCorrelation()];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    // Has collapsible wrapper
    expect(joined).toContain("<details>");
    expect(joined).toContain("</details>");
    expect(joined).toContain(`${UI_EMOJI.link}`);
    expect(joined).toContain("Change Correlation");
    expect(joined).toContain("1 function changed");

    // Has table header
    expect(joined).toContain("| Changed Function | File | Failing Tests | Confidence |");

    // Has table row
    expect(joined).toContain("`add()`");
    expect(joined).toContain("`calculator.ts:8`");
    expect(joined).toContain("`test_add`");
    expect(joined).toContain("High");
  });

  it("pluralizes 'functions' for multiple correlations", () => {
    const correlations = [
      makeCorrelation({ changedFunction: "add" }),
      makeCorrelation({ changedFunction: "subtract" }),
    ];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    expect(joined).toContain("2 functions changed");
  });

  it("shows singular 'function' for one correlation", () => {
    const correlations = [makeCorrelation()];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    expect(joined).toContain("1 function changed");
    expect(joined).not.toContain("1 functions changed");
  });

  it("renders file name without path (basename only)", () => {
    const correlations = [makeCorrelation({ changedFile: "src/deep/nested/calculator.ts" })];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    expect(joined).toContain("`calculator.ts:8`");
    expect(joined).not.toContain("src/deep/nested/calculator.ts:8`");
  });

  it("renders file without line number when changedLine is undefined", () => {
    const correlations = [makeCorrelation({ changedLine: undefined })];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    expect(joined).toContain("`calculator.ts`");
    expect(joined).not.toContain("`calculator.ts:`");
  });

  it("shows '(none)' for correlations with no failing tests", () => {
    const correlations = [makeCorrelation({ failingTests: [], correlation: "none" })];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    expect(joined).toContain("*(none)*");
    expect(joined).toContain("—"); // "none" correlation displays as dash
  });

  it("capitalizes correlation levels correctly", () => {
    const correlations = [
      makeCorrelation({ changedFunction: "a", correlation: "high" }),
      makeCorrelation({ changedFunction: "b", correlation: "medium" }),
      makeCorrelation({ changedFunction: "c", correlation: "low" }),
      makeCorrelation({ changedFunction: "d", correlation: "none", failingTests: [] }),
    ];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    expect(joined).toContain("High");
    expect(joined).toContain("Medium");
    expect(joined).toContain("Low");
    expect(joined).toContain("—"); // none → dash
  });

  it("truncates failing tests at MAX_CORRELATION_TESTS with overflow count", () => {
    const maxTests = GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_TESTS;
    const manyTests = Array.from({ length: maxTests + 2 }, (_, i) => `test_${i}`);

    const correlations = [makeCorrelation({ failingTests: manyTests })];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    // Should show first N tests
    for (let i = 0; i < maxTests; i++) {
      expect(joined).toContain(`\`test_${i}\``);
    }
    // Should show overflow count
    expect(joined).toContain("+2 more");
    // Should NOT show the truncated tests
    expect(joined).not.toContain(`\`test_${maxTests}\``);
  });

  it("does not show overflow when tests exactly equal MAX_CORRELATION_TESTS", () => {
    const maxTests = GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_TESTS;
    const exactTests = Array.from({ length: maxTests }, (_, i) => `test_${i}`);

    const correlations = [makeCorrelation({ failingTests: exactTests })];

    const result = buildChangeCorrelationSection(correlations);
    const joined = result.join("\n");

    expect(joined).not.toContain("more");
  });

  it("truncates rows at MAX_CORRELATION_ROWS with overflow message", () => {
    const maxRows = GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_ROWS;
    const manyCorrelations = Array.from({ length: maxRows + 3 }, (_, i) =>
      makeCorrelation({ changedFunction: `func_${i}` })
    );

    const result = buildChangeCorrelationSection(manyCorrelations);
    const joined = result.join("\n");

    // Header should show total count
    expect(joined).toContain(`${maxRows + 3} functions changed`);

    // Should show first maxRows functions
    for (let i = 0; i < maxRows; i++) {
      expect(joined).toContain(`func_${i}()`);
    }

    // Should show overflow message
    expect(joined).toContain("...and 3 more changed functions");

    // Should NOT show overflow functions
    expect(joined).not.toContain(`func_${maxRows}()`);
  });

  it("does not show overflow message when exactly MAX_CORRELATION_ROWS", () => {
    const maxRows = GITHUB_COMMENT_DISPLAY.MAX_CORRELATION_ROWS;
    const exactCorrelations = Array.from({ length: maxRows }, (_, i) =>
      makeCorrelation({ changedFunction: `func_${i}` })
    );

    const result = buildChangeCorrelationSection(exactCorrelations);
    const joined = result.join("\n");

    expect(joined).not.toContain("more changed functions");
  });
});

// ==================== buildTestFileGroup (cross-references) ====================

describe("buildTestFileGroup with correlations", () => {
  it("adds cross-reference line when test matches a correlation", () => {
    const correlations = [
      makeCorrelation({
        changedFunction: "add",
        changedFile: "src/calculator.ts",
        changedLine: 8,
        failingTests: ["test_add"],
        correlation: "high",
      }),
    ];

    const result = buildTestFileGroup(
      "tests/calculator.test.ts",
      [{ testName: "test_add", error: "Expected 5, got 6" }],
      correlations
    );
    const joined = result.join("\n");

    expect(joined).toContain(`${UI_EMOJI.location}`);
    expect(joined).toContain("Likely caused by changes to `add()`");
    expect(joined).toContain("src/calculator.ts:8");
  });

  it("does not add cross-reference when no correlations match", () => {
    const correlations = [
      makeCorrelation({
        changedFunction: "subtract",
        failingTests: ["test_subtract"],
        correlation: "high",
      }),
    ];

    const result = buildTestFileGroup(
      "tests/calculator.test.ts",
      [{ testName: "test_add", error: "Expected 5, got 6" }],
      correlations
    );
    const joined = result.join("\n");

    expect(joined).not.toContain(`${UI_EMOJI.location}`);
    expect(joined).not.toContain("Likely caused by");
  });

  it("does not add cross-reference for 'none' correlation level", () => {
    const correlations = [
      makeCorrelation({
        changedFunction: "formatOutput",
        failingTests: ["test_add"],
        correlation: "none",
      }),
    ];

    const result = buildTestFileGroup(
      "tests/calculator.test.ts",
      [{ testName: "test_add", error: "Expected 5, got 6" }],
      correlations
    );
    const joined = result.join("\n");

    expect(joined).not.toContain("Likely caused by");
  });

  it("renders without cross-references when correlations not passed", () => {
    const result = buildTestFileGroup("tests/calculator.test.ts", [
      { testName: "test_add", error: "Expected 5, got 6" },
    ]);
    const joined = result.join("\n");

    expect(joined).toContain("test_add");
    expect(joined).not.toContain("Likely caused by");
  });

  it("matches by substring inclusion (test name contains correlation test)", () => {
    const correlations = [
      makeCorrelation({
        changedFunction: "add",
        failingTests: ["test_add"],
        correlation: "high",
      }),
    ];

    const result = buildTestFileGroup(
      "tests/calculator.test.ts",
      [{ testName: "should test_add correctly with positive numbers", error: "Failed" }],
      correlations
    );
    const joined = result.join("\n");

    expect(joined).toContain("Likely caused by changes to `add()`");
  });

  it("omits line reference when changedLine is undefined", () => {
    const correlations = [
      makeCorrelation({
        changedFunction: "add",
        changedFile: "src/calculator.ts",
        changedLine: undefined,
        failingTests: ["test_add"],
        correlation: "high",
      }),
    ];

    const result = buildTestFileGroup(
      "tests/calculator.test.ts",
      [{ testName: "test_add", error: "Expected 5, got 6" }],
      correlations
    );
    const joined = result.join("\n");

    expect(joined).toContain("in src/calculator.ts");
    expect(joined).not.toContain("src/calculator.ts:");
  });
});

// ==================== buildTestFailuresSection (threading) ====================

describe("buildTestFailuresSection with correlations", () => {
  it("threads correlations through to test file groups", () => {
    const correlations = [
      makeCorrelation({
        changedFunction: "add",
        failingTests: ["test_add"],
        correlation: "high",
      }),
    ];

    const result = buildTestFailuresSection(
      [{ testName: "test_add", file: "tests/calc.test.ts", error: "Failed" }],
      undefined,
      undefined,
      correlations
    );
    const joined = result.join("\n");

    expect(joined).toContain("Likely caused by changes to `add()`");
  });

  it("works without correlations parameter", () => {
    const result = buildTestFailuresSection(
      [{ testName: "test_add", file: "tests/calc.test.ts", error: "Failed" }],
      undefined,
      undefined
    );
    const joined = result.join("\n");

    expect(joined).toContain("test_add");
    expect(joined).not.toContain("Likely caused by");
  });
});

// ==================== buildFailureSection (integration) ====================

describe("buildFailureSection with correlations", () => {
  it("includes correlation table when changeCorrelations present", () => {
    const failure = {
      checkName: "CI / tests",
      identifiedCause: "Test failures",
      analysis: "Test failures",
      testFailures: [
        { testName: "test_add", file: "tests/calc.test.ts", error: "Expected 5, got 6" },
      ],
      changeCorrelations: [
        makeCorrelation({
          changedFunction: "add",
          failingTests: ["test_add"],
          correlation: "high",
        }),
      ],
    };

    const result = buildFailureSection(failure as never);
    const joined = result.join("\n");

    // Should have correlation table
    expect(joined).toContain("Change Correlation");
    expect(joined).toContain("| Changed Function |");

    // Should have cross-reference in test failure
    expect(joined).toContain("Likely caused by changes to `add()`");
  });

  it("omits correlation section when changeCorrelations is empty", () => {
    const failure = {
      checkName: "CI / tests",
      identifiedCause: "Test failures",
      analysis: "Test failures",
      testFailures: [
        { testName: "test_add", file: "tests/calc.test.ts", error: "Expected 5, got 6" },
      ],
      changeCorrelations: [],
    };

    const result = buildFailureSection(failure as never);
    const joined = result.join("\n");

    expect(joined).not.toContain("Change Correlation");
    expect(joined).not.toContain("| Changed Function |");
  });

  it("omits correlation section when changeCorrelations is undefined", () => {
    const failure = {
      checkName: "CI / tests",
      identifiedCause: "Test failures",
      analysis: "Test failures",
      testFailures: [
        { testName: "test_add", file: "tests/calc.test.ts", error: "Expected 5, got 6" },
      ],
    };

    const result = buildFailureSection(failure as never);
    const joined = result.join("\n");

    expect(joined).not.toContain("Change Correlation");
  });

  it("shows correlation for non-test failures (lint only)", () => {
    const failure = {
      checkName: "CI / lint",
      identifiedCause: "Lint errors",
      analysis: "Lint errors",
      lintErrors: [{ file: "src/calc.ts", line: 5, code: "no-unused-vars", message: "unused var" }],
      changeCorrelations: [
        makeCorrelation({
          changedFunction: "add",
          failingTests: [],
          correlation: "none",
        }),
      ],
    };

    const result = buildFailureSection(failure as never);
    const joined = result.join("\n");

    // Correlation table should still appear for lint-only failures
    expect(joined).toContain("Change Correlation");
  });
});
