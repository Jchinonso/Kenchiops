import { describe, it, expect } from "@jest/globals";
import { determineGatingDecision, determineActionGating } from "../../safety/index.js";
import { CONFIDENCE_THRESHOLDS } from "../../constants/index.js";
import type { ActionProposal } from "../../core/types.js";

/**
 * Action Gating Boundary Tests
 *
 * Tests the boundary semantics of confidence score thresholds.
 * The module uses `< threshold` for range lookup, meaning:
 * - score < 0.3 → very_low (block)
 * - 0.3 <= score < 0.5 → low (require_approval)
 * - 0.5 <= score < 0.7 → medium (require_approval)
 * - 0.7 <= score < 0.85 → high (auto_approve or require_approval based on safety)
 * - score >= 0.85 → very_high (auto_approve or require_approval based on safety)
 */
describe("Safety - Action Gating", () => {
  // Small epsilon for boundary testing
  const EPSILON = 0.0001;

  // Test action proposals with different safety levels
  const safeAction: ActionProposal = {
    type: "restart_service",
    description: "Restart the service",
    safetyLevel: "safe",
    parameters: {},
  };

  const lowRiskAction: ActionProposal = {
    type: "update_config",
    description: "Update configuration",
    safetyLevel: "low_risk",
    parameters: {},
  };

  const mediumRiskAction: ActionProposal = {
    type: "scale_service",
    description: "Scale service instances",
    safetyLevel: "medium_risk",
    parameters: {},
  };

  const highRiskAction: ActionProposal = {
    type: "delete_resource",
    description: "Delete a resource",
    safetyLevel: "high_risk",
    parameters: {},
  };

  const dangerousAction: ActionProposal = {
    type: "drop_database",
    description: "Drop the database",
    safetyLevel: "dangerous",
    parameters: {},
  };

  describe("determineGatingDecision - boundary semantics", () => {
    describe("VERY_LOW threshold (0.3)", () => {
      it("should block at score just below threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.VERY_LOW - EPSILON;
        expect(determineGatingDecision(score)).toBe("block");
      });

      it("should require approval at exactly threshold", () => {
        // At exactly 0.3, score is NOT < 0.3, so it falls into "low" range
        expect(determineGatingDecision(CONFIDENCE_THRESHOLDS.VERY_LOW)).toBe("require_approval");
      });

      it("should require approval just above threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.VERY_LOW + EPSILON;
        expect(determineGatingDecision(score)).toBe("require_approval");
      });
    });

    describe("LOW threshold (0.5)", () => {
      it("should require approval (low range) just below threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.LOW - EPSILON;
        expect(determineGatingDecision(score)).toBe("require_approval");
      });

      it("should require approval (medium range) at exactly threshold", () => {
        // At exactly 0.5, score is NOT < 0.5, so it falls into "medium" range
        expect(determineGatingDecision(CONFIDENCE_THRESHOLDS.LOW)).toBe("require_approval");
      });

      it("should require approval (medium range) just above threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.LOW + EPSILON;
        expect(determineGatingDecision(score)).toBe("require_approval");
      });
    });

    describe("MEDIUM threshold (0.7)", () => {
      it("should require approval (medium range) just below threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.MEDIUM - EPSILON;
        expect(determineGatingDecision(score)).toBe("require_approval");
      });

      it("should auto-approve at exactly threshold", () => {
        // At exactly 0.7, score is NOT < 0.7, so it falls into "high" range
        expect(determineGatingDecision(CONFIDENCE_THRESHOLDS.MEDIUM)).toBe("auto_approve");
      });

      it("should auto-approve just above threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.MEDIUM + EPSILON;
        expect(determineGatingDecision(score)).toBe("auto_approve");
      });
    });

    describe("HIGH threshold (0.85)", () => {
      it("should auto-approve (high range) just below threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.HIGH - EPSILON;
        expect(determineGatingDecision(score)).toBe("auto_approve");
      });

      it("should auto-approve (very_high range) at exactly threshold", () => {
        // At exactly 0.85, score is NOT < 0.85, so it falls into "very_high" range
        expect(determineGatingDecision(CONFIDENCE_THRESHOLDS.HIGH)).toBe("auto_approve");
      });

      it("should auto-approve (very_high range) just above threshold", () => {
        const score = CONFIDENCE_THRESHOLDS.HIGH + EPSILON;
        expect(determineGatingDecision(score)).toBe("auto_approve");
      });
    });

    describe("edge cases", () => {
      it("should block at score 0", () => {
        expect(determineGatingDecision(0)).toBe("block");
      });

      it("should auto-approve at score 1", () => {
        expect(determineGatingDecision(1)).toBe("auto_approve");
      });

      it("should clamp negative scores to 0 (block)", () => {
        expect(determineGatingDecision(-0.5)).toBe("block");
      });

      it("should clamp scores above 1 to 1 (auto_approve)", () => {
        expect(determineGatingDecision(1.5)).toBe("auto_approve");
      });
    });
  });

  describe("determineActionGating - safety level interactions", () => {
    describe("high confidence with different safety levels", () => {
      const highConfidenceScore = 0.8; // In "high" range

      it("should auto-approve safe actions", () => {
        const result = determineActionGating(safeAction, highConfidenceScore);
        expect(result.requiresApproval).toBe(false);
        expect(result.canExecute).toBe(true);
        expect(result.message).toContain("safe");
        expect(result.message).toContain("Auto-approved");
      });

      it("should auto-approve low_risk actions", () => {
        const result = determineActionGating(lowRiskAction, highConfidenceScore);
        expect(result.requiresApproval).toBe(false);
        expect(result.canExecute).toBe(true);
        expect(result.message).toContain("low-risk");
        expect(result.message).toContain("Auto-approved");
      });

      it("should require approval for medium_risk actions", () => {
        const result = determineActionGating(mediumRiskAction, highConfidenceScore);
        expect(result.requiresApproval).toBe(true);
        expect(result.canExecute).toBe(true);
        expect(result.message).toContain("medium-risk");
        expect(result.message).toContain("Approval required");
      });

      it("should require approval for high_risk actions", () => {
        const result = determineActionGating(highRiskAction, highConfidenceScore);
        expect(result.requiresApproval).toBe(true);
        expect(result.canExecute).toBe(true);
        expect(result.message).toContain("high-risk");
        expect(result.message).toContain("Approval required");
      });

      it("should require approval for dangerous actions", () => {
        const result = determineActionGating(dangerousAction, highConfidenceScore);
        expect(result.requiresApproval).toBe(true);
        expect(result.canExecute).toBe(true);
        expect(result.message).toContain("dangerous");
        expect(result.message).toContain("Approval required");
      });
    });

    describe("very_high confidence with different safety levels", () => {
      const veryHighConfidenceScore = 0.9; // In "very_high" range

      it("should auto-approve safe actions", () => {
        const result = determineActionGating(safeAction, veryHighConfidenceScore);
        expect(result.requiresApproval).toBe(false);
        expect(result.canExecute).toBe(true);
      });

      it("should still require approval for dangerous actions", () => {
        const result = determineActionGating(dangerousAction, veryHighConfidenceScore);
        expect(result.requiresApproval).toBe(true);
        expect(result.canExecute).toBe(true);
      });
    });

    describe("low confidence ignores safety level", () => {
      const lowConfidenceScore = 0.4; // In "low" range

      it("should require approval regardless of safe action", () => {
        const result = determineActionGating(safeAction, lowConfidenceScore);
        expect(result.requiresApproval).toBe(true);
        expect(result.canExecute).toBe(true);
      });

      it("should require approval for dangerous action too", () => {
        const result = determineActionGating(dangerousAction, lowConfidenceScore);
        expect(result.requiresApproval).toBe(true);
        expect(result.canExecute).toBe(true);
      });
    });

    describe("very_low confidence blocks all actions", () => {
      const veryLowConfidenceScore = 0.2; // In "very_low" range

      it("should block safe actions", () => {
        const result = determineActionGating(safeAction, veryLowConfidenceScore);
        expect(result.requiresApproval).toBe(false); // Can't approve what's blocked
        expect(result.canExecute).toBe(false);
      });

      it("should block dangerous actions", () => {
        const result = determineActionGating(dangerousAction, veryLowConfidenceScore);
        expect(result.requiresApproval).toBe(false);
        expect(result.canExecute).toBe(false);
      });
    });

    describe("boundary: transition from block to require_approval", () => {
      it("should block at 0.2999", () => {
        const result = determineActionGating(safeAction, 0.2999);
        expect(result.canExecute).toBe(false);
      });

      it("should allow execution at exactly 0.3", () => {
        const result = determineActionGating(safeAction, 0.3);
        expect(result.canExecute).toBe(true);
        expect(result.requiresApproval).toBe(true);
      });
    });

    describe("boundary: transition from require_approval to auto_approve", () => {
      it("should require approval at 0.6999 for safe action", () => {
        const result = determineActionGating(safeAction, 0.6999);
        expect(result.requiresApproval).toBe(true);
      });

      it("should auto-approve at exactly 0.7 for safe action", () => {
        const result = determineActionGating(safeAction, 0.7);
        expect(result.requiresApproval).toBe(false);
      });

      it("should still require approval at 0.7 for dangerous action", () => {
        const result = determineActionGating(dangerousAction, 0.7);
        expect(result.requiresApproval).toBe(true);
      });
    });

    describe("invalid action handling", () => {
      it("should block null action", () => {
        const result = determineActionGating(null, 0.9);
        expect(result.canExecute).toBe(false);
        expect(result.requiresApproval).toBe(false);
      });

      it("should block undefined action", () => {
        const result = determineActionGating(undefined, 0.9);
        expect(result.canExecute).toBe(false);
      });

      it("should block action with invalid safety level", () => {
        const invalidAction = { ...safeAction, safetyLevel: "invalid" };
        const result = determineActionGating(invalidAction, 0.9);
        expect(result.canExecute).toBe(false);
      });

      it("should block action without safety level", () => {
        const noSafetyAction = { type: "test", description: "test" };
        const result = determineActionGating(noSafetyAction, 0.9);
        expect(result.canExecute).toBe(false);
      });
    });
  });

  describe("message content verification", () => {
    it("should include confidence level in high range messages", () => {
      const result = determineActionGating(safeAction, 0.8);
      // Message should contain the confidence range description
      expect(result.message.toLowerCase()).toMatch(/high|confidence/);
    });

    it("should include safety level description in messages", () => {
      const result = determineActionGating(mediumRiskAction, 0.8);
      expect(result.message).toContain("medium-risk");
    });

    it("should include approval status in messages", () => {
      const autoApproved = determineActionGating(safeAction, 0.8);
      expect(autoApproved.message).toContain("Auto-approved");

      const needsApproval = determineActionGating(dangerousAction, 0.8);
      expect(needsApproval.message).toContain("Approval required");
    });
  });
});
