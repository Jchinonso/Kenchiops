/**
 * Unit tests for Formatter Utilities
 */

import { describe, it, expect } from "@jest/globals";
import {
  getPriorityEmoji,
  getNumericPriority,
  calculateAverageConfidence,
  calculateConfidenceWithUncertainty,
  getConfidenceEmoji,
  mergeRecommendedActions,
  DISPLAY_LIMITS,
} from "../formatters/formatterUtils.js";
import type { AnalyzedFailure, RecommendedAction } from "@kenchi/shared";
import { PRIORITY_EMOJI_MAP, PRIORITY_ORDER } from "@kenchi/shared";

describe("Formatter Utilities", () => {
  describe("getPriorityEmoji", () => {
    it("should return correct emoji for string priorities", () => {
      expect(getPriorityEmoji("immediate")).toBe("🔴");
      expect(getPriorityEmoji("critical")).toBe("🔴");
      expect(getPriorityEmoji("high")).toBe("🟠");
      expect(getPriorityEmoji("medium")).toBe("🟡");
      expect(getPriorityEmoji("low")).toBe("🟢");
    });

    it("should handle case-insensitive string priorities", () => {
      expect(getPriorityEmoji("HIGH")).toBe("🟠");
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
      expect(getNumericPriority("critical")).toBe(0);
      expect(getNumericPriority("high")).toBe(1);
      expect(getNumericPriority("medium")).toBe(2);
      expect(getNumericPriority("low")).toBe(3);
    });

    it("should handle case-insensitive strings", () => {
      expect(getNumericPriority("HIGH")).toBe(1);
      expect(getNumericPriority("Medium")).toBe(2);
      expect(getNumericPriority("CRITICAL")).toBe(0);
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
    const createAnalyzedFailureWithConfidence = (confidenceScore: number): AnalyzedFailure => ({
      checkRunId: 12345,
      checkName: "test",
      conclusion: "failure",
      confidence: confidenceScore,
      analysis: "test",
      identifiedCause: "test",
      annotations: [],
      recommendedActions: [],
      testFailures: [],
      timestamp: new Date(),
    });

    it("should calculate average for single failure", () => {
      const analyzedFailures = [createAnalyzedFailureWithConfidence(0.8)];
      expect(calculateAverageConfidence(analyzedFailures)).toBe(0.8);
    });

    it("should calculate average for multiple failures", () => {
      const analyzedFailures = [
        createAnalyzedFailureWithConfidence(0.8),
        createAnalyzedFailureWithConfidence(0.6),
        createAnalyzedFailureWithConfidence(0.4),
      ];
      expect(calculateAverageConfidence(analyzedFailures)).toBeCloseTo(0.6, 5);
    });

    it("should return 0 for empty array", () => {
      expect(calculateAverageConfidence([])).toBe(0);
    });

    it("should handle all zeros", () => {
      const analyzedFailures = [
        createAnalyzedFailureWithConfidence(0),
        createAnalyzedFailureWithConfidence(0),
      ];
      expect(calculateAverageConfidence(analyzedFailures)).toBe(0);
    });

    it("should handle all ones", () => {
      const analyzedFailures = [
        createAnalyzedFailureWithConfidence(1),
        createAnalyzedFailureWithConfidence(1),
      ];
      expect(calculateAverageConfidence(analyzedFailures)).toBe(1);
    });
  });

  describe("calculateConfidenceWithUncertainty", () => {
    it("should not flag multiple services when only path variants differ", () => {
      const analyzedFailures: AnalyzedFailure[] = [
        {
          checkRunId: 1,
          checkName: "test",
          conclusion: "failure",
          confidence: 0.8,
          analysis: "test",
          identifiedCause: "test",
          annotations: [],
          recommendedActions: [],
          testFailures: [{ testName: "test subtract", file: "tests/test_calc.py" }],
          timestamp: new Date(),
        },
        {
          checkRunId: 2,
          checkName: "test",
          conclusion: "failure",
          confidence: 0.8,
          analysis: "test",
          identifiedCause: "test",
          annotations: [],
          recommendedActions: [],
          testFailures: [{ testName: "test subtract", file: "test_calc.py" }],
          timestamp: new Date(),
        },
      ];

      const result = calculateConfidenceWithUncertainty(analyzedFailures);

      expect(result.uncertainty).toBeUndefined();
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
    const createRecommendedActionWithPriority = (
      actionDescription: string,
      priorityLevel: string,
      actionTypeName = "fix"
    ): RecommendedAction => ({
      description: actionDescription,
      priority: priorityLevel,
      actionType: actionTypeName,
    });

    const createAnalyzedFailureWithActions = (
      recommendedActions: RecommendedAction[],
      servicePath?: string
    ): AnalyzedFailure => ({
      checkRunId: 12345,
      checkName: "test",
      conclusion: "failure",
      confidence: 0.8,
      analysis: "test",
      identifiedCause: "test",
      annotations: [],
      recommendedActions,
      // Include test failures with file path to associate with a service
      testFailures: servicePath ? [{ testName: "test", file: servicePath }] : [],
      timestamp: new Date(),
    });

    it("should merge actions from multiple failures in different services", () => {
      // Actions from different services should both be included
      const analyzedFailures = [
        createAnalyzedFailureWithActions(
          [createRecommendedActionWithPriority("Action 1", "high", "rerun_pipeline")],
          "services/api/test.ts"
        ),
        createAnalyzedFailureWithActions(
          [createRecommendedActionWithPriority("Action 2", "medium", "notify_team")],
          "services/slack-bot/test.ts"
        ),
      ];

      const mergedActions = mergeRecommendedActions(analyzedFailures);

      // Should have 2 actions (one from each service)
      expect(mergedActions).toHaveLength(2);
    });

    it("should deduplicate identical actions", () => {
      const analyzedFailures = [
        createAnalyzedFailureWithActions([
          createRecommendedActionWithPriority("Same action", "high"),
        ]),
        createAnalyzedFailureWithActions([
          createRecommendedActionWithPriority("Same action", "high"),
        ]),
      ];

      const mergedActions = mergeRecommendedActions(analyzedFailures);

      expect(mergedActions).toHaveLength(1);
    });

    it("should deduplicate case-insensitively", () => {
      const analyzedFailures = [
        createAnalyzedFailureWithActions([
          createRecommendedActionWithPriority("Same Action", "high"),
        ]),
        createAnalyzedFailureWithActions([
          createRecommendedActionWithPriority("same action", "high"),
        ]),
      ];

      const mergedActions = mergeRecommendedActions(analyzedFailures);

      expect(mergedActions).toHaveLength(1);
    });

    it("should sort by priority across services", () => {
      // Actions from different services, sorted by priority
      const analyzedFailures = [
        createAnalyzedFailureWithActions(
          [createRecommendedActionWithPriority("Low priority", "low", "notify_team")],
          "services/api/test.ts"
        ),
        createAnalyzedFailureWithActions(
          [createRecommendedActionWithPriority("High priority", "high", "rerun_pipeline")],
          "services/slack-bot/test.ts"
        ),
        createAnalyzedFailureWithActions(
          [createRecommendedActionWithPriority("Immediate", "immediate", "post_comment")],
          "services/github-app/test.ts"
        ),
      ];

      const mergedActions = mergeRecommendedActions(analyzedFailures);

      // Should be sorted by priority (immediate > high > low)
      expect(mergedActions[0].description).toContain("Immediate");
      expect(mergedActions[1].description).toContain("High priority");
      expect(mergedActions[2].description).toContain("Low priority");
    });

    it("should limit to DISPLAY_LIMITS.recommendedActions across services", () => {
      // Create failures in 20 different services, each with one action
      const analyzedFailures = Array.from({ length: 20 }, (_, serviceIndex) =>
        createAnalyzedFailureWithActions(
          [
            createRecommendedActionWithPriority(
              `Action ${serviceIndex}`,
              "medium",
              `action_type_${serviceIndex}`
            ),
          ],
          `services/service-${serviceIndex}/test.ts`
        )
      );

      const mergedActions = mergeRecommendedActions(analyzedFailures);

      // Should be limited to DISPLAY_LIMITS.recommendedActions (10)
      expect(mergedActions).toHaveLength(DISPLAY_LIMITS.recommendedActions);
    });

    it("should handle empty failures array", () => {
      const mergedActions = mergeRecommendedActions([]);
      expect(mergedActions).toEqual([]);
    });

    it("should handle failures with no actions", () => {
      const analyzedFailures = [
        createAnalyzedFailureWithActions([]),
        createAnalyzedFailureWithActions([]),
      ];
      const mergedActions = mergeRecommendedActions(analyzedFailures);
      expect(mergedActions).toEqual([]);
    });
  });

  describe("Constants", () => {
    it("should have correct PRIORITY_EMOJI_MAP values", () => {
      expect(PRIORITY_EMOJI_MAP.immediate).toBe("🔴");
      expect(PRIORITY_EMOJI_MAP.critical).toBe("🔴");
      expect(PRIORITY_EMOJI_MAP.high).toBe("🟠");
      expect(PRIORITY_EMOJI_MAP.medium).toBe("🟡");
      expect(PRIORITY_EMOJI_MAP.low).toBe("🟢");
    });

    it("should have correct PRIORITY_ORDER values", () => {
      expect(PRIORITY_ORDER.immediate).toBe(0);
      expect(PRIORITY_ORDER.critical).toBe(0);
      expect(PRIORITY_ORDER.high).toBe(1);
      expect(PRIORITY_ORDER.medium).toBe(2);
      expect(PRIORITY_ORDER.low).toBe(3);
    });

    it("should have correct DISPLAY_LIMITS values", () => {
      expect(DISPLAY_LIMITS.annotationsPerCheck).toBe(100);
      expect(DISPLAY_LIMITS.totalAnnotations).toBe(150);
      expect(DISPLAY_LIMITS.recommendedActions).toBe(10);
      expect(DISPLAY_LIMITS.checksToShow).toBe(20);
      expect(DISPLAY_LIMITS.slackAnnotationsPerCheck).toBe(50);
      expect(DISPLAY_LIMITS.slackMaxChecks).toBe(10);
    });
  });
});
