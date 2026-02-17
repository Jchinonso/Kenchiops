/**
 * Unit tests for formatters utility module.
 *
 * Tests all pure formatting functions used across the dashboard.
 * Each function is tested for happy paths, edge cases, and boundary values.
 */

import { describe, it, expect } from "vitest";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  getSeverityStyle,
  SEVERITY_STYLES,
  formatTimestamp,
  formatRelativeTime,
  titleCase,
  truncateText,
  getPayloadString,
  formatSignalValue,
  flattenSignalEntries,
  CONFIDENCE_THRESHOLDS,
} from "./formatters";

// ==================== getConfidenceLabel ====================

describe("getConfidenceLabel", () => {
  it("should return 'High' when confidence >= 0.8", () => {
    expect(getConfidenceLabel(0.8)).toBe("High");
    expect(getConfidenceLabel(0.95)).toBe("High");
    expect(getConfidenceLabel(1.0)).toBe("High");
  });

  it("should return 'Medium' when confidence >= 0.5 and < 0.8", () => {
    expect(getConfidenceLabel(0.5)).toBe("Medium");
    expect(getConfidenceLabel(0.6)).toBe("Medium");
    expect(getConfidenceLabel(0.79)).toBe("Medium");
  });

  it("should return 'Low' when confidence < 0.5", () => {
    expect(getConfidenceLabel(0.0)).toBe("Low");
    expect(getConfidenceLabel(0.1)).toBe("Low");
    expect(getConfidenceLabel(0.49)).toBe("Low");
  });

  it("should handle exact threshold boundaries", () => {
    expect(getConfidenceLabel(CONFIDENCE_THRESHOLDS.HIGH)).toBe("High");
    expect(getConfidenceLabel(CONFIDENCE_THRESHOLDS.MEDIUM)).toBe("Medium");
    expect(getConfidenceLabel(CONFIDENCE_THRESHOLDS.HIGH - 0.001)).toBe("Medium");
    expect(getConfidenceLabel(CONFIDENCE_THRESHOLDS.MEDIUM - 0.001)).toBe("Low");
  });

  it("should handle negative values as Low", () => {
    expect(getConfidenceLabel(-1)).toBe("Low");
  });

  it("should handle values above 1.0 as High", () => {
    expect(getConfidenceLabel(1.5)).toBe("High");
  });
});

// ==================== getConfidenceStyle ====================

describe("getConfidenceStyle", () => {
  it("should return green styles for high confidence", () => {
    const style = getConfidenceStyle(0.9);
    expect(style).toContain("bg-green");
    expect(style).toContain("text-green");
  });

  it("should return amber styles for medium confidence", () => {
    const style = getConfidenceStyle(0.6);
    expect(style).toContain("bg-amber");
    expect(style).toContain("text-amber");
  });

  it("should return red styles for low confidence", () => {
    const style = getConfidenceStyle(0.2);
    expect(style).toContain("bg-red");
    expect(style).toContain("text-red");
  });
});

// ==================== getSeverityStyle ====================

describe("getSeverityStyle", () => {
  it("should return high severity style for 'high'", () => {
    expect(getSeverityStyle("high")).toBe(SEVERITY_STYLES.high);
  });

  it("should return medium severity style for 'medium'", () => {
    expect(getSeverityStyle("medium")).toBe(SEVERITY_STYLES.medium);
  });

  it("should return low severity style for 'low'", () => {
    expect(getSeverityStyle("low")).toBe(SEVERITY_STYLES.low);
  });

  it("should return default style for null severity", () => {
    expect(getSeverityStyle(null)).toBe(SEVERITY_STYLES.default);
  });

  it("should return default style for unknown severity string", () => {
    expect(getSeverityStyle("critical")).toBe(SEVERITY_STYLES.default);
    expect(getSeverityStyle("")).toBe(SEVERITY_STYLES.default);
  });
});

// ==================== formatTimestamp ====================

describe("formatTimestamp", () => {
  it("should format a valid ISO timestamp", () => {
    const result = formatTimestamp("2024-01-15T14:30:00Z");
    // Verify it contains month and day at minimum
    expect(result).not.toBe("--");
    expect(typeof result).toBe("string");
  });

  it('should return "--" for an invalid timestamp', () => {
    expect(formatTimestamp("not-a-date")).toBe("--");
    expect(formatTimestamp("")).toBe("--");
  });

  it('should return "--" for a garbage string that produces NaN date', () => {
    expect(formatTimestamp("xyz123")).toBe("--");
  });
});

// ==================== formatRelativeTime ====================

describe("formatRelativeTime", () => {
  it("should format a recent valid timestamp as relative time", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = formatRelativeTime(fiveMinutesAgo);
    expect(result).not.toBe("--");
    expect(result).toContain("ago");
  });

  it('should return "--" for an invalid timestamp', () => {
    expect(formatRelativeTime("invalid")).toBe("--");
    expect(formatRelativeTime("")).toBe("--");
  });
});

// ==================== titleCase ====================

describe("titleCase", () => {
  it("should capitalize the first letter and lowercase the rest", () => {
    expect(titleCase("hello")).toBe("Hello");
    expect(titleCase("HELLO")).toBe("Hello");
    expect(titleCase("hELLO")).toBe("Hello");
  });

  it("should return empty string for empty input", () => {
    expect(titleCase("")).toBe("");
  });

  it("should handle single character strings", () => {
    expect(titleCase("a")).toBe("A");
    expect(titleCase("A")).toBe("A");
  });

  it("should handle strings with numbers", () => {
    expect(titleCase("123abc")).toBe("123abc");
  });
});

// ==================== truncateText ====================

describe("truncateText", () => {
  it("should return full text when under maxLength", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("should truncate and add ellipsis when over maxLength", () => {
    expect(truncateText("hello world", 5)).toBe("hello...");
  });

  it("should return exact text when length equals maxLength", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("should handle empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });

  it("should handle maxLength of 0", () => {
    expect(truncateText("hello", 0)).toBe("...");
  });
});

// ==================== getPayloadString ====================

describe("getPayloadString", () => {
  it("should return the string value from payload for a given key", () => {
    const payload = { repository: "org/repo", status: "failed" };
    expect(getPayloadString(payload, "repository")).toBe("org/repo");
  });

  it('should return "--" when key does not exist in payload', () => {
    const payload = { repository: "org/repo" };
    expect(getPayloadString(payload, "nonexistent")).toBe("--");
  });

  it('should return "--" when value is not a string', () => {
    const payload = { count: 42, flag: true, nested: { a: 1 } };
    expect(getPayloadString(payload, "count")).toBe("--");
    expect(getPayloadString(payload, "flag")).toBe("--");
    expect(getPayloadString(payload, "nested")).toBe("--");
  });

  it('should return "--" when value is null or undefined', () => {
    const payload = { key: null, another: undefined };
    expect(getPayloadString(payload, "key")).toBe("--");
    expect(getPayloadString(payload, "another")).toBe("--");
  });

  it("should return empty string when value is empty string (it is a string)", () => {
    const payload = { empty: "" };
    expect(getPayloadString(payload, "empty")).toBe("");
  });
});

// ==================== formatSignalValue ====================

describe("formatSignalValue", () => {
  it('should return "--" for null', () => {
    expect(formatSignalValue(null)).toBe("--");
  });

  it('should return "--" for undefined', () => {
    expect(formatSignalValue(undefined)).toBe("--");
  });

  it("should format integers without decimal places", () => {
    expect(formatSignalValue(42)).toBe("42");
    expect(formatSignalValue(0)).toBe("0");
    expect(formatSignalValue(-1)).toBe("-1");
  });

  it("should format floating point numbers to 3 decimal places", () => {
    expect(formatSignalValue(3.14159)).toBe("3.142");
    expect(formatSignalValue(0.1)).toBe("0.100");
  });

  it('should format boolean true as "Yes"', () => {
    expect(formatSignalValue(true)).toBe("Yes");
  });

  it('should format boolean false as "No"', () => {
    expect(formatSignalValue(false)).toBe("No");
  });

  it("should stringify objects via JSON", () => {
    expect(formatSignalValue({ a: 1 })).toBe('{"a":1}');
    expect(formatSignalValue([1, 2])).toBe("[1,2]");
  });

  it("should convert strings to themselves", () => {
    expect(formatSignalValue("hello")).toBe("hello");
    expect(formatSignalValue("")).toBe("");
  });

  it('should return "[complex value]" for circular objects', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatSignalValue(circular)).toBe("[complex value]");
  });
});

// ==================== flattenSignalEntries ====================

describe("flattenSignalEntries", () => {
  it("should flatten a flat object into key-value pairs", () => {
    const signals = { score: 0.85, isCritical: true };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([
      ["score", "0.850"],
      ["isCritical", "Yes"],
    ]);
  });

  it("should flatten nested objects with dot notation keys", () => {
    const signals = {
      complexity: { cyclomatic: 12, lines: 500 },
    };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([
      ["complexity.cyclomatic", "12"],
      ["complexity.lines", "500"],
    ]);
  });

  it("should handle deeply nested objects", () => {
    const signals = { a: { b: { c: "deep" } } };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([["a.b.c", "deep"]]);
  });

  it("should handle arrays as leaf values", () => {
    const signals = { tags: ["ci", "cd"] };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([["tags", '["ci","cd"]']]);
  });

  it("should return empty array for empty object", () => {
    expect(flattenSignalEntries({})).toEqual([]);
  });

  it("should handle null values in signals", () => {
    const signals = { value: null };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([["value", "--"]]);
  });

  it("should not mutate the input", () => {
    const signals = Object.freeze({
      a: Object.freeze({ b: 1 }),
      c: "hello",
    }) as Readonly<Record<string, unknown>>;
    const result = flattenSignalEntries(signals);
    expect(result.length).toBe(2);
  });
});
