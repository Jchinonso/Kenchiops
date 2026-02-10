/**
 * Unit tests for Change Correlation Parsing
 *
 * Tests parseChangeCorrelations() — validates LLM output for
 * change-to-test correlation mappings.
 */

import { describe, it, expect } from "@jest/globals";
import { parseChangeCorrelations } from "../../llm/structuredDataParsers.js";
import type { LLMChangeCorrelation } from "../../core/types.js";

// ==================== Test Fixtures ====================

const makeRawCorrelation = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  changed_function: "add",
  changed_file: "src/calculator.ts",
  changed_line: 8,
  failing_tests: ["test_add", "test_add_negative"],
  correlation: "high",
  explanation: "The add function was modified and test_add directly exercises it",
  ...overrides,
});

// ==================== parseChangeCorrelations ====================

describe("parseChangeCorrelations", () => {
  describe("valid input", () => {
    it("parses a single valid correlation", () => {
      const raw = [makeRawCorrelation()];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual<LLMChangeCorrelation>({
        changedFunction: "add",
        changedFile: "src/calculator.ts",
        changedLine: 8,
        failingTests: ["test_add", "test_add_negative"],
        correlation: "high",
        explanation: "The add function was modified and test_add directly exercises it",
      });
    });

    it("parses multiple valid correlations", () => {
      const raw = [
        makeRawCorrelation({ changed_function: "add", correlation: "high" }),
        makeRawCorrelation({
          changed_function: "subtract",
          changed_file: "src/calculator.ts",
          changed_line: 14,
          failing_tests: ["test_subtract"],
          correlation: "medium",
          explanation: "Subtract was modified near add",
        }),
        makeRawCorrelation({
          changed_function: "formatOutput",
          changed_file: "src/utils.ts",
          changed_line: 30,
          failing_tests: [],
          correlation: "none",
          explanation: "No tests exercise this function",
        }),
      ];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(3);
      expect(result[0]?.changedFunction).toBe("add");
      expect(result[1]?.changedFunction).toBe("subtract");
      expect(result[1]?.correlation).toBe("medium");
      expect(result[2]?.changedFunction).toBe("formatOutput");
      expect(result[2]?.correlation).toBe("none");
      expect(result[2]?.failingTests).toEqual([]);
    });

    it("accepts all valid correlation levels", () => {
      const levels = ["high", "medium", "low", "none"] as const;

      const raw = levels.map((level) =>
        makeRawCorrelation({
          changed_function: `func_${level}`,
          correlation: level,
        })
      );

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(4);
      expect(result.map((r) => r.correlation)).toEqual(["high", "medium", "low", "none"]);
    });

    it("handles correlation with no changed_line (optional field)", () => {
      const raw = [makeRawCorrelation({ changed_line: undefined })];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
      expect(result[0]?.changedLine).toBeUndefined();
    });

    it("handles empty failing_tests array", () => {
      const raw = [makeRawCorrelation({ failing_tests: [], correlation: "none" })];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
      expect(result[0]?.failingTests).toEqual([]);
    });
  });

  describe("invalid input — non-array", () => {
    it("returns empty array for null", () => {
      expect(parseChangeCorrelations(null)).toEqual([]);
    });

    it("returns empty array for undefined", () => {
      expect(parseChangeCorrelations(undefined)).toEqual([]);
    });

    it("returns empty array for string", () => {
      expect(parseChangeCorrelations("not an array")).toEqual([]);
    });

    it("returns empty array for number", () => {
      expect(parseChangeCorrelations(42)).toEqual([]);
    });

    it("returns empty array for object", () => {
      expect(parseChangeCorrelations({ key: "value" })).toEqual([]);
    });
  });

  describe("invalid entries — filtered out", () => {
    it("filters out entries missing changed_function", () => {
      const raw = [makeRawCorrelation({ changed_function: undefined })];

      const result = parseChangeCorrelations(raw);

      expect(result).toEqual([]);
    });

    it("filters out entries missing changed_file", () => {
      const raw = [makeRawCorrelation({ changed_file: undefined })];

      const result = parseChangeCorrelations(raw);

      expect(result).toEqual([]);
    });

    it("filters out entries missing correlation", () => {
      const raw = [makeRawCorrelation({ correlation: undefined })];

      const result = parseChangeCorrelations(raw);

      expect(result).toEqual([]);
    });

    it("filters out entries missing explanation", () => {
      const raw = [makeRawCorrelation({ explanation: undefined })];

      const result = parseChangeCorrelations(raw);

      expect(result).toEqual([]);
    });

    it("filters out entries with invalid correlation level", () => {
      const raw = [makeRawCorrelation({ correlation: "very_high" })];

      const result = parseChangeCorrelations(raw);

      expect(result).toEqual([]);
    });

    it("filters out entries with numeric correlation", () => {
      const raw = [makeRawCorrelation({ correlation: 5 })];

      const result = parseChangeCorrelations(raw);

      expect(result).toEqual([]);
    });

    it("filters out null entries in the array", () => {
      const raw = [null, makeRawCorrelation(), null];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
      expect(result[0]?.changedFunction).toBe("add");
    });

    it("filters out non-object entries", () => {
      const raw = ["string_entry", 42, true, makeRawCorrelation()];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
    });
  });

  describe("mixed valid and invalid entries", () => {
    it("keeps valid entries and filters invalid ones", () => {
      const raw = [
        makeRawCorrelation({ changed_function: "validFunc" }),
        makeRawCorrelation({ changed_function: undefined }), // invalid: no function name
        makeRawCorrelation({ correlation: "invalid_level" }), // invalid: bad correlation
        makeRawCorrelation({ changed_function: "anotherValid", correlation: "low" }),
      ];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(2);
      expect(result[0]?.changedFunction).toBe("validFunc");
      expect(result[1]?.changedFunction).toBe("anotherValid");
    });
  });

  describe("failing_tests filtering", () => {
    it("filters non-string entries from failing_tests", () => {
      const raw = [
        makeRawCorrelation({
          failing_tests: ["valid_test", 42, null, "another_test", true, undefined],
        }),
      ];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
      expect(result[0]?.failingTests).toEqual(["valid_test", "another_test"]);
    });

    it("returns empty failing_tests when not an array", () => {
      const raw = [makeRawCorrelation({ failing_tests: "not_an_array" })];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
      expect(result[0]?.failingTests).toEqual([]);
    });

    it("returns empty failing_tests when field is missing", () => {
      const raw = [makeRawCorrelation({ failing_tests: undefined })];

      const result = parseChangeCorrelations(raw);

      expect(result).toHaveLength(1);
      expect(result[0]?.failingTests).toEqual([]);
    });
  });

  describe("empty array", () => {
    it("returns empty array for empty input", () => {
      expect(parseChangeCorrelations([])).toEqual([]);
    });
  });
});
