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
  extractRepoFromKey,
  getPayloadString,
  formatSignalValue,
  flattenSignalEntries,
  CONFIDENCE_THRESHOLDS,
} from "@/lib/formatters";

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
    expect(getConfidenceLabel(-0.5)).toBe("Low");
  });

  it("should handle values above 1.0 as High", () => {
    expect(getConfidenceLabel(1.5)).toBe("High");
    expect(getConfidenceLabel(100)).toBe("High");
  });

  it("should handle NaN gracefully", () => {
    // NaN < 0.5 is false, NaN >= 0.8 is false, NaN >= 0.5 is false
    // So it falls through to "Low"
    expect(getConfidenceLabel(NaN)).toBe("Low");
  });
});

// ==================== getConfidenceStyle ====================

describe("getConfidenceStyle", () => {
  it("should return green styles for high confidence (>= 0.8)", () => {
    const style = getConfidenceStyle(0.9);
    expect(style).toContain("bg-green");
    expect(style).toContain("text-green");
    expect(style).toContain("border-green");
  });

  it("should return amber styles for medium confidence (>= 0.5, < 0.8)", () => {
    const style = getConfidenceStyle(0.6);
    expect(style).toContain("bg-amber");
    expect(style).toContain("text-amber");
    expect(style).toContain("border-amber");
  });

  it("should return red styles for low confidence (< 0.5)", () => {
    const style = getConfidenceStyle(0.2);
    expect(style).toContain("bg-red");
    expect(style).toContain("text-red");
    expect(style).toContain("border-red");
  });

  it("should include dark mode variants", () => {
    const highStyle = getConfidenceStyle(0.9);
    expect(highStyle).toContain("dark:");

    const medStyle = getConfidenceStyle(0.6);
    expect(medStyle).toContain("dark:");

    const lowStyle = getConfidenceStyle(0.2);
    expect(lowStyle).toContain("dark:");
  });

  it("should handle boundary values", () => {
    const atHigh = getConfidenceStyle(0.8);
    expect(atHigh).toContain("bg-green");

    const justBelowHigh = getConfidenceStyle(0.799);
    expect(justBelowHigh).toContain("bg-amber");

    const atMedium = getConfidenceStyle(0.5);
    expect(atMedium).toContain("bg-amber");

    const justBelowMedium = getConfidenceStyle(0.499);
    expect(justBelowMedium).toContain("bg-red");
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

  it("should return critical severity style for 'critical'", () => {
    expect(getSeverityStyle("critical")).toBe(SEVERITY_STYLES.critical);
  });

  it("should return default style for unknown severity strings", () => {
    expect(getSeverityStyle("")).toBe(SEVERITY_STYLES.default);
    expect(getSeverityStyle("HIGH")).toBe(SEVERITY_STYLES.default); // case-sensitive
    expect(getSeverityStyle("unknown")).toBe(SEVERITY_STYLES.default);
  });
});

// ==================== formatTimestamp ====================

describe("formatTimestamp", () => {
  it("should format a valid ISO timestamp", () => {
    const result = formatTimestamp("2024-01-15T14:30:00Z");
    expect(result).not.toBe("--");
    expect(typeof result).toBe("string");
    // Should contain "Jan" and "15"
    expect(result).toContain("Jan");
    expect(result).toContain("15");
  });

  it('should return "--" for an invalid timestamp', () => {
    expect(formatTimestamp("not-a-date")).toBe("--");
  });

  it('should return "--" for an empty string', () => {
    expect(formatTimestamp("")).toBe("--");
  });

  it('should return "--" for garbage strings', () => {
    expect(formatTimestamp("xyz123")).toBe("--");
  });

  it("should format timestamps with different months", () => {
    const result = formatTimestamp("2024-07-04T12:00:00Z");
    expect(result).not.toBe("--");
    expect(result).toContain("Jul");
  });

  it("should handle timestamps without timezone", () => {
    const result = formatTimestamp("2024-01-15T14:30:00");
    expect(result).not.toBe("--");
  });

  it("should handle date-only strings", () => {
    const result = formatTimestamp("2024-01-15");
    expect(result).not.toBe("--");
  });
});

// ==================== formatRelativeTime ====================

describe("formatRelativeTime", () => {
  it("should format a recent timestamp as relative time with 'ago' suffix", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = formatRelativeTime(fiveMinutesAgo);
    expect(result).not.toBe("--");
    expect(result).toContain("ago");
  });

  it('should return "--" for an invalid timestamp', () => {
    expect(formatRelativeTime("invalid")).toBe("--");
  });

  it('should return "--" for an empty string', () => {
    expect(formatRelativeTime("")).toBe("--");
  });

  it("should handle timestamps far in the past", () => {
    const result = formatRelativeTime("2020-01-01T00:00:00Z");
    expect(result).not.toBe("--");
    expect(result).toContain("ago");
  });

  it("should handle timestamps just now", () => {
    const justNow = new Date().toISOString();
    const result = formatRelativeTime(justNow);
    expect(result).not.toBe("--");
    // date-fns returns "less than a minute ago" or similar
    expect(result).toContain("ago");
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
    expect(titleCase("z")).toBe("Z");
  });

  it("should handle strings starting with numbers", () => {
    expect(titleCase("123abc")).toBe("123abc");
  });

  it("should handle strings with spaces (only first char affected)", () => {
    expect(titleCase("hello world")).toBe("Hello world");
  });

  it("should handle special characters", () => {
    expect(titleCase("!hello")).toBe("!hello");
    expect(titleCase("-test")).toBe("-test");
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
    expect(truncateText("", 0)).toBe("");
  });

  it("should handle maxLength of 0", () => {
    expect(truncateText("hello", 0)).toBe("...");
  });

  it("should handle maxLength of 1", () => {
    expect(truncateText("hello", 1)).toBe("h...");
  });

  it("should handle very long strings", () => {
    const longString = "a".repeat(10000);
    const result = truncateText(longString, 100);
    expect(result).toBe("a".repeat(100) + "...");
    expect(result.length).toBe(103); // 100 chars + "..."
  });

  it("should not mutate the input string", () => {
    const input = "hello world";
    truncateText(input, 5);
    expect(input).toBe("hello world");
  });
});

// ==================== extractRepoFromKey ====================

describe("extractRepoFromKey", () => {
  describe("aggregationKey with colon-separated format", () => {
    it("should return repo from 'owner/repo:sha' format", () => {
      expect(extractRepoFromKey("acme/my-app:abc123def")).toBe("acme/my-app");
    });

    it("should return repo with long commit hash", () => {
      expect(
        extractRepoFromKey("kenchi-dev/backend:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0")
      ).toBe("kenchi-dev/backend");
    });

    it("should return only text before the first colon when multiple colons present", () => {
      expect(extractRepoFromKey("org/repo:sha:extra")).toBe("org/repo");
    });
  });

  describe("aggregationKey without colon", () => {
    it("should return the full key when no colon is present", () => {
      expect(extractRepoFromKey("acme/my-app")).toBe("acme/my-app");
    });

    it("should return a bare repo name without owner prefix", () => {
      expect(extractRepoFromKey("my-repo")).toBe("my-repo");
    });
  });

  describe("aggregationKey starts with colon (boundary: colonIndex === 0)", () => {
    it("should return the full key when colon is at position 0", () => {
      // colonIndex is 0, which is NOT > 0, so the full key is returned
      expect(extractRepoFromKey(":abc123")).toBe(":abc123");
    });
  });

  describe("aggregationKey is null with fullAnalysis fallback", () => {
    it("should return fullAnalysis.repository when aggregationKey is null", () => {
      expect(extractRepoFromKey(null, { repository: "org/fallback-repo" })).toBe(
        "org/fallback-repo"
      );
    });

    it("should return fullAnalysis.repository with no owner prefix", () => {
      expect(extractRepoFromKey(null, { repository: "standalone-repo" })).toBe("standalone-repo");
    });
  });

  describe("aggregationKey is null with empty/missing fullAnalysis.repository", () => {
    it('should return "--" when fullAnalysis.repository is an empty string', () => {
      expect(extractRepoFromKey(null, { repository: "" })).toBe("--");
    });

    it('should return "--" when fullAnalysis is undefined', () => {
      expect(extractRepoFromKey(null, undefined)).toBe("--");
    });

    it('should return "--" when fullAnalysis has no repository field', () => {
      expect(extractRepoFromKey(null, { summary: "analysis" })).toBe("--");
    });

    it('should return "--" when fullAnalysis.repository is a number', () => {
      expect(extractRepoFromKey(null, { repository: 42 })).toBe("--");
    });

    it('should return "--" when fullAnalysis.repository is null', () => {
      expect(extractRepoFromKey(null, { repository: null })).toBe("--");
    });

    it('should return "--" when fullAnalysis.repository is undefined', () => {
      expect(extractRepoFromKey(null, { repository: undefined })).toBe("--");
    });

    it('should return "--" when fullAnalysis is an empty object', () => {
      expect(extractRepoFromKey(null, {})).toBe("--");
    });

    it('should return "--" when both aggregationKey and fullAnalysis are null/undefined', () => {
      expect(extractRepoFromKey(null)).toBe("--");
    });
  });

  describe("aggregationKey is empty string (falsy)", () => {
    it("should fall through to fullAnalysis when key is empty string", () => {
      expect(
        extractRepoFromKey("" as unknown as string | null, { repository: "fallback/repo" })
      ).toBe("fallback/repo");
    });
  });

  describe("input immutability", () => {
    it("should not mutate the fullAnalysis object", () => {
      const fullAnalysis = Object.freeze({ repository: "org/repo", summary: "test" });
      expect(extractRepoFromKey(null, fullAnalysis)).toBe("org/repo");
    });
  });
});

// ==================== getPayloadString ====================

describe("getPayloadString", () => {
  it("should return the string value from payload for a given key", () => {
    expect(getPayloadString({ repository: "org/repo", status: "failed" }, "repository")).toBe(
      "org/repo"
    );
  });

  it('should return "--" when key does not exist in payload', () => {
    expect(getPayloadString({ repository: "org/repo" }, "nonexistent")).toBe("--");
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
    expect(getPayloadString({ empty: "" }, "empty")).toBe("");
  });

  it("should handle empty payload object", () => {
    expect(getPayloadString({}, "anything")).toBe("--");
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
    expect(formatSignalValue(1000000)).toBe("1000000");
  });

  it("should format floating point numbers to 3 decimal places", () => {
    expect(formatSignalValue(3.14159)).toBe("3.142");
    expect(formatSignalValue(0.1)).toBe("0.100");
    expect(formatSignalValue(0.0001)).toBe("0.000");
  });

  it('should format boolean true as "Yes"', () => {
    expect(formatSignalValue(true)).toBe("Yes");
  });

  it('should format boolean false as "No"', () => {
    expect(formatSignalValue(false)).toBe("No");
  });

  it("should stringify objects via JSON", () => {
    expect(formatSignalValue({ a: 1 })).toBe('{"a":1}');
  });

  it("should stringify arrays via JSON", () => {
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

  it("should handle NaN as a number (integer check: NaN % 1 is NaN, not 0)", () => {
    // NaN % 1 === NaN, so it goes to toFixed path
    expect(formatSignalValue(NaN)).toBe("NaN");
  });

  it("should handle Infinity", () => {
    // Infinity % 1 === 0 (integer path), but NaN check:
    // Actually Infinity % 1 === 0, so it goes integer path: String(Infinity)
    expect(formatSignalValue(Infinity)).toBe("Infinity");
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

  it("should handle arrays as leaf values (not recursed)", () => {
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

  it("should handle undefined values in signals", () => {
    const signals = { value: undefined };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([["value", "--"]]);
  });

  it("should handle mixed nested and flat values", () => {
    const signals = {
      topLevel: "hello",
      nested: { inner: 42 },
      another: true,
    };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([
      ["topLevel", "hello"],
      ["nested.inner", "42"],
      ["another", "Yes"],
    ]);
  });

  it("should not mutate the input", () => {
    const signals = Object.freeze({
      a: Object.freeze({ b: 1 }),
      c: "hello",
    }) as Readonly<Record<string, unknown>>;
    const result = flattenSignalEntries(signals);
    expect(result.length).toBe(2);
  });

  it("should handle boolean values in nested objects", () => {
    const signals = { config: { enabled: false, verbose: true } };
    const result = flattenSignalEntries(signals);
    expect(result).toEqual([
      ["config.enabled", "No"],
      ["config.verbose", "Yes"],
    ]);
  });
});
