/**
 * Unit tests for Formatter Utilities
 */

import { describe, it, expect } from "@jest/globals";
import {
  getPriorityEmoji,
  getNumericPriority,
  calculateAverageConfidence,
  getConfidenceEmoji,
  mergeRecommendedActions,
  PRIORITY_EMOJI,
  PRIORITY_ORDER,
  DISPLAY_LIMITS,
} from "../formatters/formatterUtils.js";
import type { AnalyzedFailure, RecommendedAction } from "@kenchi/shared";

describe("Formatter Utilities", () => {
  describe("getPriorityEmoji", () => {
    it("should return correct emoji for string priorities", () => {
      expect(getPriorityEmoji("immediate")).toBe("🔴");
      expect(getPriorityEmoji("high")).toBe("🔴");
      expect(getPriorityEmoji("medium")).toBe("🟡");
      expect(getPriorityEmoji("low")).toBe("🟢");
    });

    it("should handle case-insensitive string priorities", () => {
      expect(getPriorityEmoji("HIGH")).toBe("🔴");
      expect(getPriorityEmoji("Medium")).toBe("🟡");
      expect(getPriorityEmoji("LOW")).toBe("🟢");
    });

    it("should return correct emoji for numeric priorities", () => {
      expect(getPriorityEmoji(0)).toBe("🔴");
      expect(getPriorityEmoji(1)).toBe("🔴");
      expect(getPriorityEmoji(2)).toBe("🟡");
      expect(getPriorityEmoji(3)).toBe("🟢");
      expect(getPriorityEmoji(4)).toBe("🟢");
    });

    it("should return default emoji for unknown priority", () => {
      expect(getPriorityEmoji("unknown")).toBe("⚪");
    });
  });

  describe("getNumericPriority", () => {
    it("should convert string priorities to numbers", () => {
      expect(getNumericPriority("immediate")).toBe(0);
      expect(getNumericPriority("high")).toBe(1);
      expect(getNumericPriority("medium")).toBe(2);
      expect(getNumericPriority("low")).toBe(3);
    });

    it("should handle case-insensitive strings", () => {
      expect(getNumericPriority("HIGH")).toBe(1);
      expect(getNumericPriority("Medium")).toBe(2);
    });

    it("should return number as-is for numeric input", () => {
      expect(getNumericPriority(0)).toBe(0);
      expect(getNumericPriority(5)).toBe(5);
    });

    it("should return 4 for unknown string priority", () => {
      expect(getNumericPriority("unknown")).toBe(4);
    });
  });

  describe("calculateAverageConfidence", () => {
    const createFailure = (confidence: number): AnalyzedFailure => ({
      checkRunId: 12345,
      checkName: "test",
      conclusion: "failure",
      confidence,
      analysis: "test",
      identifiedCause: "test",
      annotations: [],
      recommendedActions: [],
      testFailures: [],
      timestamp: new Date(),
    });

    it("should calculate average for single failure", () => {
      const failures = [createFailure(0.8)];
      expect(calculateAverageConfidence(failures)).toBe(0.8);
    });

    it("should calculate average for multiple failures", () => {
      const failures = [createFailure(0.8), createFailure(0.6), createFailure(0.4)];
      expect(calculateAverageConfidence(failures)).toBeCloseTo(0.6, 5);
    });

    it("should return 0 for empty array", () => {
      expect(calculateAverageConfidence([])).toBe(0);
    });

    it("should handle all zeros", () => {
      const failures = [createFailure(0), createFailure(0)];
      expect(calculateAverageConfidence(failures)).toBe(0);
    });

    it("should handle all ones", () => {
      const failures = [createFailure(1), createFailure(1)];
      expect(calculateAverageConfidence(failures)).toBe(1);
    });
  });

  describe("getConfidenceEmoji", () => {
    it("should return green for high confidence", () => {
      expect(getConfidenceEmoji(70)).toBe("🟢");
      expect(getConfidenceEmoji(85)).toBe("🟢");
      expect(getConfidenceEmoji(100)).toBe("🟢");
    });

    it("should return yellow for medium confidence", () => {
      expect(getConfidenceEmoji(40)).toBe("🟡");
      expect(getConfidenceEmoji(55)).toBe("🟡");
      expect(getConfidenceEmoji(69)).toBe("🟡");
    });

    it("should return red for low confidence", () => {
      expect(getConfidenceEmoji(0)).toBe("🔴");
      expect(getConfidenceEmoji(20)).toBe("🔴");
      expect(getConfidenceEmoji(39)).toBe("🔴");
    });
  });

  describe("mergeRecommendedActions", () => {
    const createAction = (description: string, priority: string): RecommendedAction => ({
      description,
      priority,
      actionType: "fix",
    });

    const createFailure = (actions: RecommendedAction[]): AnalyzedFailure => ({
      checkRunId: 12345,
      checkName: "test",
      conclusion: "failure",
      confidence: 0.8,
      analysis: "test",
      identifiedCause: "test",
      annotations: [],
      recommendedActions: actions,
      testFailures: [],
      timestamp: new Date(),
    });

    it("should merge actions from multiple failures", () => {
      const failures = [
        createFailure([createAction("Action 1", "high")]),
        createFailure([createAction("Action 2", "medium")]),
      ];

      const merged = mergeRecommendedActions(failures);

      expect(merged).toHaveLength(2);
    });

    it("should deduplicate identical actions", () => {
      const failures = [
        createFailure([createAction("Same action", "high")]),
        createFailure([createAction("Same action", "high")]),
      ];

      const merged = mergeRecommendedActions(failures);

      expect(merged).toHaveLength(1);
    });

    it("should deduplicate case-insensitively", () => {
      const failures = [
        createFailure([createAction("Same Action", "high")]),
        createFailure([createAction("same action", "high")]),
      ];

      const merged = mergeRecommendedActions(failures);

      expect(merged).toHaveLength(1);
    });

    it("should sort by priority", () => {
      const failures = [
        createFailure([createAction("Low priority", "low")]),
        createFailure([createAction("High priority", "high")]),
        createFailure([createAction("Immediate", "immediate")]),
      ];

      const merged = mergeRecommendedActions(failures);

      expect(merged[0].description).toBe("Immediate");
      expect(merged[1].description).toBe("High priority");
      expect(merged[2].description).toBe("Low priority");
    });

    it("should limit to DISPLAY_LIMITS.recommendedActions", () => {
      const actions = Array.from({ length: 20 }, (_, i) => createAction(`Action ${i}`, "medium"));
      const failures = [createFailure(actions)];

      const merged = mergeRecommendedActions(failures);

      expect(merged).toHaveLength(DISPLAY_LIMITS.recommendedActions);
    });

    it("should handle empty failures array", () => {
      const merged = mergeRecommendedActions([]);
      expect(merged).toEqual([]);
    });

    it("should handle failures with no actions", () => {
      const failures = [createFailure([]), createFailure([])];
      const merged = mergeRecommendedActions(failures);
      expect(merged).toEqual([]);
    });
  });

  describe("Constants", () => {
    it("should have correct PRIORITY_EMOJI values", () => {
      expect(PRIORITY_EMOJI.immediate).toBe("🔴");
      expect(PRIORITY_EMOJI.high).toBe("🔴");
      expect(PRIORITY_EMOJI.medium).toBe("🟡");
      expect(PRIORITY_EMOJI.low).toBe("🟢");
    });

    it("should have correct PRIORITY_ORDER values", () => {
      expect(PRIORITY_ORDER.immediate).toBe(0);
      expect(PRIORITY_ORDER.high).toBe(1);
      expect(PRIORITY_ORDER.medium).toBe(2);
      expect(PRIORITY_ORDER.low).toBe(3);
    });

    it("should have correct DISPLAY_LIMITS values", () => {
      expect(DISPLAY_LIMITS.annotationsPerCheck).toBe(10);
      expect(DISPLAY_LIMITS.totalAnnotations).toBe(30);
      expect(DISPLAY_LIMITS.recommendedActions).toBe(8);
      expect(DISPLAY_LIMITS.checksToShow).toBe(10);
      expect(DISPLAY_LIMITS.slackAnnotationsPerCheck).toBe(5);
      expect(DISPLAY_LIMITS.slackMaxChecks).toBe(5);
    });
  });
});
