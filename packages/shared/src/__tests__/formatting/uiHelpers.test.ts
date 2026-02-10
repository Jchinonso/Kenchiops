/**
 * Unit tests for formatting/uiHelpers.ts
 */
import { describe, it, expect } from "@jest/globals";
import {
  getConfidenceLabel,
  getConfidenceLabelParenthesized,
  getConfidenceColor,
  getConfidenceEmoji,
  truncateText,
  sanitizeIdPart,
  formatRelativeTime,
  pluralize,
  getRepoName,
  getFirstSentence,
  buildTruncatedList,
} from "../../formatting/index.js";
import { SLACK_COLORS } from "../../constants/index.js";

describe("UI Helpers", () => {
  describe("getConfidenceLabel", () => {
    it("should return 'Very High' for score >= 0.85", () => {
      expect(getConfidenceLabel(0.85)).toBe("Very High");
      expect(getConfidenceLabel(0.9)).toBe("Very High");
      expect(getConfidenceLabel(1.0)).toBe("Very High");
    });

    it("should return 'High' for score >= 0.7", () => {
      expect(getConfidenceLabel(0.7)).toBe("High");
      expect(getConfidenceLabel(0.75)).toBe("High");
      expect(getConfidenceLabel(0.84)).toBe("High");
    });

    it("should return 'Medium' for score >= 0.5", () => {
      expect(getConfidenceLabel(0.5)).toBe("Medium");
      expect(getConfidenceLabel(0.6)).toBe("Medium");
      expect(getConfidenceLabel(0.69)).toBe("Medium");
    });

    it("should return 'Low' for score >= 0.3", () => {
      expect(getConfidenceLabel(0.3)).toBe("Low");
      expect(getConfidenceLabel(0.4)).toBe("Low");
      expect(getConfidenceLabel(0.49)).toBe("Low");
    });

    it("should return 'Very Low' for score < 0.3", () => {
      expect(getConfidenceLabel(0.29)).toBe("Very Low");
      expect(getConfidenceLabel(0.1)).toBe("Very Low");
      expect(getConfidenceLabel(0)).toBe("Very Low");
    });
  });

  describe("getConfidenceLabelParenthesized", () => {
    it("should wrap label in parentheses", () => {
      expect(getConfidenceLabelParenthesized(0.9)).toBe("(Very High)");
      expect(getConfidenceLabelParenthesized(0.5)).toBe("(Medium)");
      expect(getConfidenceLabelParenthesized(0.1)).toBe("(Very Low)");
    });
  });

  describe("getConfidenceColor", () => {
    it("should return success color for high scores", () => {
      expect(getConfidenceColor(0.9)).toBe(SLACK_COLORS.SUCCESS);
      expect(getConfidenceColor(0.7)).toBe(SLACK_COLORS.SUCCESS);
    });

    it("should return warning color for medium scores", () => {
      expect(getConfidenceColor(0.5)).toBe(SLACK_COLORS.WARNING);
      expect(getConfidenceColor(0.6)).toBe(SLACK_COLORS.WARNING);
    });

    it("should return danger color for low scores", () => {
      expect(getConfidenceColor(0.3)).toBe(SLACK_COLORS.DANGER);
      expect(getConfidenceColor(0.1)).toBe(SLACK_COLORS.DANGER);
    });
  });

  describe("getConfidenceEmoji", () => {
    it("should return appropriate emoji for each threshold", () => {
      expect(getConfidenceEmoji(0.9)).toContain("green");
      expect(getConfidenceEmoji(0.75)).toContain("blue");
      expect(getConfidenceEmoji(0.55)).toContain("yellow");
      expect(getConfidenceEmoji(0.35)).toContain("orange");
      expect(getConfidenceEmoji(0.1)).toContain("red");
    });
  });

  describe("truncateText", () => {
    it("should return text unchanged when under maxLength", () => {
      expect(truncateText("Hello", 10)).toBe("Hello");
      expect(truncateText("Exact", 5)).toBe("Exact");
    });

    it("should truncate with '...' when over maxLength", () => {
      expect(truncateText("Hello World", 8)).toBe("Hello...");
    });

    it("should handle exactly maxLength", () => {
      expect(truncateText("12345", 5)).toBe("12345");
    });

    it("should handle empty string", () => {
      expect(truncateText("", 10)).toBe("");
    });

    it("should handle very short maxLength", () => {
      expect(truncateText("Hello", 4)).toBe("H...");
    });
  });

  describe("sanitizeIdPart", () => {
    it("should normalize case and replace unsafe characters", () => {
      expect(sanitizeIdPart("Src/Main.ts")).toBe("src_main_ts");
      expect(sanitizeIdPart("Feature:Auth@V2")).toBe("feature_auth_v2");
    });

    it("should trim leading/trailing underscores and cap length", () => {
      const longInput = "A".repeat(100);
      const sanitized = sanitizeIdPart(longInput);

      expect(sanitized.length).toBeLessThanOrEqual(64);
      expect(sanitized.startsWith("_")).toBe(false);
      expect(sanitized.endsWith("_")).toBe(false);
    });

    it("should return fallback for empty or invalid input", () => {
      expect(sanitizeIdPart("___")).toBe("unknown");
      expect(sanitizeIdPart("   ")).toBe("unknown");
    });
  });

  describe("formatRelativeTime", () => {
    it("should return 'just now' for < 1 minute", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("just now");

      const thirtySecondsAgo = new Date(Date.now() - 30000);
      expect(formatRelativeTime(thirtySecondsAgo)).toBe("just now");
    });

    it("should return 'X minutes ago' for times < 24 hours", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo)).toBe("5 minutes ago");

      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      expect(formatRelativeTime(oneMinuteAgo)).toBe("1 minute ago");

      // Note: Implementation shows minutes up to 24 hours
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe("120 minutes ago");
    });

    it("should return 'X days ago' for >= 7 days worth of hours", () => {
      // The threshold is 7 days (7 * 24 * 60 minutes)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(sevenDaysAgo)).toBe("7 days ago");

      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(tenDaysAgo)).toBe("10 days ago");
    });

    it("should return hours for times between 24 hours and 7 days", () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysAgo)).toBe("48 hours ago");
    });
  });

  describe("pluralize", () => {
    it("should return singular for count 1", () => {
      expect(pluralize(1, "test")).toBe("test");
      expect(pluralize(1, "failure")).toBe("failure");
    });

    it("should return plural for count > 1", () => {
      expect(pluralize(2, "test")).toBe("tests");
      expect(pluralize(5, "failure")).toBe("failures");
      expect(pluralize(100, "item")).toBe("items");
    });

    it("should return plural for count 0", () => {
      expect(pluralize(0, "test")).toBe("tests");
    });

    it("should use custom plural form when provided", () => {
      expect(pluralize(2, "entry", "entries")).toBe("entries");
      expect(pluralize(1, "entry", "entries")).toBe("entry");
    });
  });

  describe("getRepoName", () => {
    it("should extract repo name from 'owner/repo'", () => {
      expect(getRepoName("kenchiops/my-app")).toBe("my-app");
      expect(getRepoName("facebook/react")).toBe("react");
    });

    it("should handle single name without slash", () => {
      expect(getRepoName("single")).toBe("single");
    });

    it("should handle multiple slashes", () => {
      expect(getRepoName("a/b/c")).toBe("c");
    });

    it("should handle empty string", () => {
      expect(getRepoName("")).toBe("");
    });
  });

  describe("getFirstSentence", () => {
    it("should extract text before first period", () => {
      expect(getFirstSentence("Build failed. See logs.")).toBe("Build failed");
    });

    it("should handle exclamation marks", () => {
      expect(getFirstSentence("Success! All tests passed.")).toBe("Success");
    });

    it("should handle question marks", () => {
      expect(getFirstSentence("Is this correct? Check again.")).toBe("Is this correct");
    });

    it("should return full text if no sentence ending", () => {
      expect(getFirstSentence("No ending here")).toBe("No ending here");
    });

    it("should trim whitespace", () => {
      expect(getFirstSentence("  Leading spaces. Trailing.")).toBe("Leading spaces");
    });

    it("should handle empty string", () => {
      expect(getFirstSentence("")).toBe("");
    });
  });

  describe("buildTruncatedList", () => {
    it("should return all items when under maxItems", () => {
      const result = buildTruncatedList(["a", "b", "c"], (item) => `- ${item}`, 5, "items");

      expect(result).toEqual(["- a", "- b", "- c"]);
    });

    it("should truncate with overflow message", () => {
      const result = buildTruncatedList(
        ["a", "b", "c", "d", "e"],
        (item) => `- ${item}`,
        3,
        "items"
      );

      expect(result).toHaveLength(4);
      expect(result[3]).toContain("...and 2 more items");
    });

    it("should use custom format function", () => {
      const result = buildTruncatedList([1, 2, 3], (num) => `Item ${num}`, 5, "numbers");

      expect(result).toEqual(["Item 1", "Item 2", "Item 3"]);
    });

    it("should include index in format function", () => {
      const result = buildTruncatedList(
        ["a", "b"],
        (item, index) => `${index}: ${item}`,
        5,
        "items"
      );

      expect(result).toEqual(["0: a", "1: b"]);
    });

    it("should handle empty array", () => {
      const result = buildTruncatedList([], (item) => item, 3, "items");

      expect(result).toEqual([]);
    });

    it("should use custom overflow label", () => {
      const result = buildTruncatedList([1, 2, 3, 4], (num) => String(num), 2, "failures");

      expect(result[2]).toContain("2 more failures");
    });

    it("should handle exactly maxItems", () => {
      const result = buildTruncatedList(["a", "b", "c"], (item) => item, 3, "items");

      expect(result).toHaveLength(3);
      expect(result).not.toContain(expect.stringContaining("more"));
    });
  });
});
