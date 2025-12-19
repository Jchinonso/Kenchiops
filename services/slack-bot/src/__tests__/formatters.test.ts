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
      const headerBlock = blocks.find((b) => b.type === "header");

      expect(headerBlock).toBeDefined();
    });

    it("should include confidence information", () => {
      const blocks = formatAnalysisMessage(mockAnalysis, mockConfidence);
      const sectionBlocks = blocks.filter((b) => b.type === "section");

      // Check that at least one section contains confidence info
      const hasConfidence = sectionBlocks.some((b) => JSON.stringify(b).includes("Confidence"));

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
      const contextBlock = blocks.find((b) => b.type === "context");

      expect(contextBlock).toBeDefined();
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
      const actionBlocks = blocks.filter((b) => b.type === "actions");
      expect(actionBlocks.length).toBe(0);
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
  });
});
