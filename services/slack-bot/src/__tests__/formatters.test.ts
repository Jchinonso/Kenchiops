/**
 * Unit tests for Slack Bot Formatters
 */

import { describe, it, expect } from "@jest/globals";
import {
  formatAnalysisMessage,
  formatActionButtons,
  formatErrorMessage,
  formatProgressUpdate,
} from "../formatters.js";
import type { LLMAnalysisResult, ConfidenceScoreResult, ActionProposal } from "@kenchi/shared";

describe("Slack Bot Formatters", () => {
  describe("formatAnalysisMessage", () => {
    const mockAnalysis: LLMAnalysisResult = {
      eventId: "evt_test",
      summary: "Test summary of the issue",
      identifiedCause: "Root cause identified",
      confidence: "high",
      analyzedAt: new Date().toISOString(),
      recommendedActions: [
        {
          actionType: "fix_code",
          description: "Fix the bug",
          priority: "high",
        },
      ],
      uncertainties: ["Some uncertainty"],
    };

    const mockConfidence: ConfidenceScoreResult = {
      finalScore: 0.85,
      gatingDecision: "auto_approve",
      breakdown: {
        baseScore: 0.75,
        uncertaintyAdjustment: 0,
        evidenceAlignment: 0.1,
        completeness: 0,
        knowledgeBaseValidation: 0,
        consistency: 0,
      },
      reasoning: ["Test reasoning"],
    };

    it("should return array of blocks", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);

      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should include header block", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const headerBlock = blocks.find((block) => block.type === "header");

      expect(headerBlock).toBeDefined();
    });

    it("should include confidence information", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const sectionBlocks = blocks.filter((block) => block.type === "section");

      // Check that at least one section contains confidence info
      const hasConfidence = sectionBlocks.some((block) =>
        JSON.stringify(block).includes("Confidence")
      );

      expect(hasConfidence).toBe(true);
    });

    it("should include summary section", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Test summary of the issue");
    });

    it("should include root cause when available", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Root cause identified");
    });

    it("should include recommended actions", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Fix the bug");
    });

    it("should include uncertainties when available", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Some uncertainty");
    });

    it("should include footer with metadata", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const contextBlock = blocks.find((block) => block.type === "context");

      expect(contextBlock).toBeDefined();
    });

    it("should work without identified cause", () => {
      const analysisNoCause: LLMAnalysisResult = {
        ...mockAnalysis,
        identifiedCause: undefined,
      };
      const blocks = formatAnalysisMessage(analysisNoCause, mockConfidence);

      expect(blocks.length).toBeGreaterThan(0);
      // Should still have summary
      expect(JSON.stringify(blocks)).toContain("Test summary");
    });

    it("should work without recommended actions", () => {
      const analysisNoActions: LLMAnalysisResult = {
        ...mockAnalysis,
        recommendedActions: undefined,
      };
      const blocks = formatAnalysisMessage(analysisNoActions, mockConfidence);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should work without uncertainties", () => {
      const analysisNoUncertainties: LLMAnalysisResult = {
        ...mockAnalysis,
        uncertainties: undefined,
      };
      const blocks = formatAnalysisMessage(analysisNoUncertainties, mockConfidence);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should work with empty uncertainties array", () => {
      const analysisEmptyUncertainties: LLMAnalysisResult = {
        ...mockAnalysis,
        uncertainties: [],
      };
      const blocks = formatAnalysisMessage(analysisEmptyUncertainties, mockConfidence);
      const content = JSON.stringify(blocks);

      // Should not include uncertainties section
      expect(content).not.toContain("Uncertainties");
    });

    it("should limit recommended actions to max display count", () => {
      const manyActions: LLMAnalysisResult = {
        ...mockAnalysis,
        recommendedActions: Array.from({ length: 10 }, (_, i) => ({
          actionType: "fix_code",
          description: `Action ${i + 1}`,
          priority: "high",
        })),
      };
      const blocks = formatAnalysisMessage(manyActions, mockConfidence);

      // Should not show all 10 actions
      expect(blocks.length).toBeLessThan(20);
    });

    it("should include impact assessment when available", () => {
      const analysisWithImpact: LLMAnalysisResult = {
        ...mockAnalysis,
        impactAssessment: {
          scope: "service",
          businessImpact: "high",
          affectedUsers: "many",
        },
      };
      const blocks = formatAnalysisMessage(analysisWithImpact, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("service");
      expect(content).toContain("high");
      expect(content).toContain("many");
    });

    it("should show gating decision", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("auto approve");
    });

    it("should handle different gating decisions", () => {
      const requireApproval: ConfidenceScoreResult = {
        ...mockConfidence,
        gatingDecision: "require_approval",
      };
      const blocks = formatAnalysisMessage(mockAnalysis, requireApproval);
      const content = JSON.stringify(blocks);

      expect(content).toContain("require approval");
    });

    it("should show confidence as percentage", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      // 0.85 * 100 = 85%
      expect(content).toContain("85%");
    });

    it("should handle low confidence scores", () => {
      const lowConfidence: ConfidenceScoreResult = {
        ...mockConfidence,
        finalScore: 0.2,
      };
      const blocks = formatAnalysisMessage(mockAnalysis, lowConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("20%");
    });

    it("should include event ID in footer", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("evt_test");
    });

    it("should include LLM model in footer when available", () => {
      const analysisWithModel: LLMAnalysisResult = {
        ...mockAnalysis,
        llmModel: "gpt-4",
      };
      const blocks = formatAnalysisMessage(analysisWithModel, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("gpt-4");
    });

    it("should handle missing LLM model gracefully", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      // Should default to "AI"
      expect(content).toContain("AI");
    });

    it("should include analyzed timestamp", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const content = JSON.stringify(blocks);

      // Should contain date/time information
      expect(content).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });

    it("should handle multiple uncertainties", () => {
      const multipleUncertainties: LLMAnalysisResult = {
        ...mockAnalysis,
        uncertainties: ["Uncertainty 1", "Uncertainty 2", "Uncertainty 3"],
      };
      const blocks = formatAnalysisMessage(multipleUncertainties, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Uncertainty 1");
      expect(content).toContain("Uncertainty 2");
      expect(content).toContain("Uncertainty 3");
    });

    it("should handle special characters in summary", () => {
      const specialChars: LLMAnalysisResult = {
        ...mockAnalysis,
        summary: "Error: <script>alert('xss')</script>",
      };
      const blocks = formatAnalysisMessage(specialChars, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Error:");
    });

    it("should handle unicode characters", () => {
      const unicode: LLMAnalysisResult = {
        ...mockAnalysis,
        summary: "エラー: 問題が発生しました 🔥",
      };
      const blocks = formatAnalysisMessage(unicode, mockConfidence);
      const content = JSON.stringify(blocks);

      expect(content).toContain("エラー");
    });

    it("should include dividers between sections", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const dividers = blocks.filter((block) => block.type === "divider");

      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  describe("formatActionButtons", () => {
    const mockActions: ActionProposal[] = [
      {
        id: "action_1",
        eventId: "evt_test",
        actionType: "rollback_deployment",
        description: "Rollback deployment",
        safetyLevel: "medium_risk",
        status: "proposed",
        priority: "high",
        reasoning: "Need to rollback",
        confidence: 0.8,
        requiresApproval: true,
        createdAt: new Date().toISOString(),
      },
    ];

    it("should return empty array for no actions", () => {
      const blocks = formatActionButtons([], "evt_test");

      expect(blocks).toHaveLength(0);
    });

    it("should return blocks for non-safe actions", () => {
      const blocks = formatActionButtons(mockActions, "evt_test");

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should include approve and reject buttons", () => {
      const blocks = formatActionButtons(mockActions, "evt_test");
      const content = JSON.stringify(blocks);

      expect(content).toContain("Approve");
      expect(content).toContain("Reject");
    });

    it("should skip safe actions", () => {
      const safeActions: ActionProposal[] = [
        {
          id: "action_1",
          eventId: "evt_test",
          actionType: "notify_team",
          description: "Notify team",
          safetyLevel: "safe",
          status: "proposed",
          priority: "high",
          reasoning: "Need to notify",
          confidence: 0.8,
          requiresApproval: false,
          createdAt: new Date().toISOString(),
        },
      ];

      const blocks = formatActionButtons(safeActions, "evt_test");

      // Should only have divider and header, no action buttons
      const actionBlocks = blocks.filter((block) => block.type === "actions");
      expect(actionBlocks.length).toBe(0);
    });

    it("should limit actions to max display count", () => {
      const manyActions: ActionProposal[] = Array.from({ length: 10 }, (_, i) => ({
        id: `action_${i}`,
        eventId: "evt_test",
        actionType: "rollback_deployment",
        description: `Action ${i}`,
        safetyLevel: "medium_risk" as const,
        status: "proposed" as const,
        priority: "high",
        reasoning: "Test",
        confidence: 0.8,
        requiresApproval: true,
        createdAt: new Date().toISOString(),
      }));

      const blocks = formatActionButtons(manyActions, "evt_test");

      // Should limit to max actions
      const actionBlocks = blocks.filter((block) => block.type === "actions");
      expect(actionBlocks.length).toBeLessThanOrEqual(5);
    });

    it("should include event ID in button values", () => {
      const blocks = formatActionButtons(mockActions, "evt_custom");
      const content = JSON.stringify(blocks);

      expect(content).toContain("evt_custom");
    });

    it("should include action ID in button action_id", () => {
      const blocks = formatActionButtons(mockActions, "evt_test");
      const content = JSON.stringify(blocks);

      expect(content).toContain("action_1");
    });

    it("should handle mixed safety levels", () => {
      const mixedActions: ActionProposal[] = [
        {
          id: "action_safe",
          eventId: "evt_test",
          actionType: "notify_team",
          description: "Safe action",
          safetyLevel: "safe",
          status: "proposed",
          priority: "high",
          reasoning: "Test",
          confidence: 0.8,
          requiresApproval: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: "action_risky",
          eventId: "evt_test",
          actionType: "rollback_deployment",
          description: "Risky action",
          safetyLevel: "high_risk",
          status: "proposed",
          priority: "high",
          reasoning: "Test",
          confidence: 0.8,
          requiresApproval: true,
          createdAt: new Date().toISOString(),
        },
      ];

      const blocks = formatActionButtons(mixedActions, "evt_test");

      // Should only include the risky action
      const actionBlocks = blocks.filter((block) => block.type === "actions");
      expect(actionBlocks.length).toBe(1);
    });

    it("should include divider before actions", () => {
      const blocks = formatActionButtons(mockActions, "evt_test");
      const dividers = blocks.filter((block) => block.type === "divider");

      expect(dividers.length).toBeGreaterThan(0);
    });

    it("should include header section", () => {
      const blocks = formatActionButtons(mockActions, "evt_test");
      const content = JSON.stringify(blocks);

      expect(content).toContain("Actions require approval");
    });
  });

  describe("formatErrorMessage", () => {
    it("should format error with message", () => {
      const error = new Error("Something went wrong");
      const blocks = formatErrorMessage(error);

      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);

      const content = JSON.stringify(blocks);
      expect(content).toContain("Something went wrong");
    });

    it("should include warning indicator", () => {
      const error = new Error("Test error");
      const blocks = formatErrorMessage(error);
      const content = JSON.stringify(blocks);

      expect(content).toContain("warning");
    });

    it("should handle empty error message", () => {
      const error = new Error("");
      const blocks = formatErrorMessage(error);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle very long error message", () => {
      const longMessage = "A".repeat(1000);
      const error = new Error(longMessage);
      const blocks = formatErrorMessage(error);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle special characters in error", () => {
      const error = new Error("Error: <script>alert('xss')</script>");
      const blocks = formatErrorMessage(error);
      const content = JSON.stringify(blocks);

      expect(content).toContain("Error:");
    });

    it("should handle unicode in error message", () => {
      const error = new Error("エラー: 問題が発生しました 🔥");
      const blocks = formatErrorMessage(error);
      const content = JSON.stringify(blocks);

      expect(content).toContain("エラー");
    });

    it("should include context block with help text", () => {
      const error = new Error("Test error");
      const blocks = formatErrorMessage(error);
      const contextBlock = blocks.find((block) => block.type === "context");

      expect(contextBlock).toBeDefined();
    });

    it("should wrap error message in code block", () => {
      const error = new Error("Syntax error on line 42");
      const blocks = formatErrorMessage(error);
      const content = JSON.stringify(blocks);

      // Should use markdown code formatting
      expect(content).toContain("```");
    });
  });

  describe("formatProgressUpdate", () => {
    it("should format pending status", () => {
      const blocks = formatProgressUpdate("action_1", "pending", "Waiting...");
      const content = JSON.stringify(blocks);

      expect(content).toContain("hourglass");
      expect(content).toContain("Waiting...");
    });

    it("should format in_progress status", () => {
      const blocks = formatProgressUpdate("action_1", "in_progress", "Working...");
      const content = JSON.stringify(blocks);

      expect(content).toContain("gear");
      expect(content).toContain("Working...");
    });

    it("should format completed status", () => {
      const blocks = formatProgressUpdate("action_1", "completed", "Done!");
      const content = JSON.stringify(blocks);

      expect(content).toContain("check_mark");
      expect(content).toContain("Done!");
    });

    it("should format failed status", () => {
      const blocks = formatProgressUpdate("action_1", "failed", "Failed!");
      const content = JSON.stringify(blocks);

      expect(content).toContain(":x:");
      expect(content).toContain("Failed!");
    });

    it("should include action ID", () => {
      const blocks = formatProgressUpdate("action_123", "completed", "Done");
      const content = JSON.stringify(blocks);

      expect(content).toContain("action_123");
    });

    it("should return array of blocks", () => {
      const blocks = formatProgressUpdate("action_1", "pending", "Test");

      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle empty message", () => {
      const blocks = formatProgressUpdate("action_1", "pending", "");
      const content = JSON.stringify(blocks);

      expect(content).toContain("action_1");
    });

    it("should handle very long message", () => {
      const longMessage = "A".repeat(500);
      const blocks = formatProgressUpdate("action_1", "completed", longMessage);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle special characters in message", () => {
      const blocks = formatProgressUpdate("action_1", "completed", "<script>alert('xss')</script>");

      expect(blocks.length).toBeGreaterThan(0);
    });

    it("should handle unicode in message", () => {
      const blocks = formatProgressUpdate("action_1", "completed", "完了しました 🎉");
      const content = JSON.stringify(blocks);

      expect(content).toContain("完了しました");
    });

    it("should include section block type", () => {
      const blocks = formatProgressUpdate("action_1", "pending", "Test");
      const sectionBlock = blocks.find((block) => block.type === "section");

      expect(sectionBlock).toBeDefined();
    });

    it("should handle action ID with special characters", () => {
      const blocks = formatProgressUpdate("action-test_123", "completed", "Done");
      const content = JSON.stringify(blocks);

      expect(content).toContain("action-test_123");
    });
  });
});
