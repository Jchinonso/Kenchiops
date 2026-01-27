import { describe, it, expect } from "@jest/globals";
import {
  calculateConfidenceScore,
  determineActionGating,
  confidenceScore,
  shouldActOnResult,
} from "../../safety/index.js";
import type { LLMAnalysisResult, Evidence, ActionProposal } from "../../core/types.js";

describe("Safety - Confidence Scoring", () => {
  describe("calculateConfidenceScore", () => {
    it("should calculate base score from LLM confidence", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Test summary",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(1);
      expect(result.breakdown.baseScore).toBe(0.75); // high = 0.75
      expect(result.reasoning[0]).toContain("Base score");
    });

    it("should apply uncertainty penalty for hedging language", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "I am not sure about this",
        identifiedCause: "possibly a configuration issue",
        reasoning: "It appears to be related to deployment",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have strong uncertainty penalty (-0.15 for "not sure")
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.uncertainty).toBeLessThan(0);
      expect(result.breakdown.bounded.uncertainty).toBeLessThanOrEqual(-0.15);
      expect(result.finalScore).toBeLessThan(0.75); // Less than base score
    });

    it("should reward evidence alignment when analysis references logs", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Missing AUTH_SECRET environment variable",
        identifiedCause: "AUTH_SECRET is not defined causing authentication failure",
        reasoning: "The error log shows AUTH_SECRET is not defined",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        logs: [
          {
            level: "ERROR",
            message: "AUTH_SECRET is not defined",
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive evidence alignment (+0.15 for log reference)
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.evidenceAlignment).toBeGreaterThan(0);
      expect(result.finalScore).toBeGreaterThan(0.75); // Greater than base score
    });

    it("should reward evidence alignment when analysis references commits", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Configuration issue",
        reasoning: "Based on commit abc1234 which modified the config",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        gitHistory: [
          {
            sha: "abc1234567890",
            message: "Update config",
            author: "dev@example.com",
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive evidence alignment (+0.10 for commit reference)
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.evidenceAlignment).toBeGreaterThan(0);
    });

    it("should penalize when no evidence alignment but cause identified", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Database issue",
        identifiedCause: "Database connection failed due to network timeout",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        logs: [
          {
            level: "ERROR",
            message: "Completely unrelated error message",
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have negative evidence alignment (-0.15)
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.evidenceAlignment).toBe(-0.15);
    });

    it("should reward completeness when analysis is thorough", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "CI failure due to missing environment variable",
        identifiedCause: "AUTH_SECRET environment variable is not configured",
        reasoning:
          "The error logs indicate that the AUTH_SECRET variable is missing. This is a critical configuration issue that prevents authentication.",
        impactAssessment: {
          scope: "service",
          affectedUsers: "all",
          businessImpact: "high",
          description: "All users affected",
        },
        confidence: "high",
        recommendedActions: [
          {
            actionType: "add_environment_variable",
            description: "Add AUTH_SECRET",
            priority: "immediate",
          },
          {
            actionType: "notify_team",
            description: "Notify security team",
            priority: "high",
          },
        ],
        uncertainties: ["Unknown when the variable was removed"],
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive completeness score
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.completeness).toBeGreaterThan(0);
      // Root cause + reasoning + actions + impact + uncertainties = +0.13
      expect(result.breakdown.bounded.completeness).toBeGreaterThanOrEqual(0.13);
    });

    it("should penalize incomplete analysis", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Something went wrong",
        confidence: "low",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have negative completeness (-0.15)
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.completeness).toBe(-0.15);
    });

    it("should reward knowledge base validation for high-similarity incidents", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Similar to past incident",
        reasoning: "This matches incident INC-123",
        relatedIncidents: ["INC-123"],
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        relatedDocs: [
          {
            id: "INC-123",
            type: "past_incident",
            title: "Previous AUTH failure",
            similarity: 0.9,
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive knowledge base validation (+0.10)
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.knowledgeBaseValidation).toBe(0.1);
    });

    it("should reward consistency when actions address cause", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Missing environment variable",
        identifiedCause: "AUTH_SECRET not configured",
        recommendedActions: [
          {
            actionType: "add_environment_variable",
            description: "Add AUTH_SECRET environment variable",
            priority: "immediate",
          },
        ],
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive consistency (+0.05)
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.consistency).toBe(0.05);
    });

    it("should penalize inconsistent actions", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Deployment issue",
        identifiedCause: "Deployment failed due to insufficient resources",
        recommendedActions: [
          {
            actionType: "add_environment_variable",
            description: "Add some random environment variable",
            priority: "low",
          },
        ],
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have negative consistency (-0.10)
      // Check bounded value (after clamping, before weighting)
      expect(result.breakdown.bounded.consistency).toBe(-0.1);
    });

    it("should clamp final score to [0, 1] range", () => {
      const veryBadAnalysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "not sure, unclear, cannot determine",
        confidence: "very_low",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(veryBadAnalysis, evidence);

      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(1);
    });

    it("should provide detailed reasoning breakdown", () => {
      const analysis: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Test summary",
        confidence: "medium",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      expect(result.reasoning).toBeInstanceOf(Array);
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning[0]).toContain("Base score");
      expect(result.reasoning[result.reasoning.length - 1]).toContain("Final confidence score");
    });

    it("should set appropriate gating decision based on score", () => {
      const lowConfidence: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "not sure",
        confidence: "very_low",
        analyzedAt: new Date().toISOString(),
      };

      const highConfidence: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Clear issue",
        identifiedCause: "AUTH_SECRET is not defined",
        reasoning: "The error log clearly shows AUTH_SECRET is not defined",
        confidence: "very_high",
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: "evt_test",
        logs: [
          {
            level: "ERROR",
            message: "AUTH_SECRET is not defined",
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const lowResult = calculateConfidenceScore(lowConfidence, evidence);
      const highResult = calculateConfidenceScore(highConfidence, evidence);

      expect(lowResult.gatingDecision).toBe("block");
      expect(highResult.gatingDecision).toBe("auto_approve");
    });
  });

  describe("determineActionGating", () => {
    it("should block all actions for very low confidence (<0.3)", () => {
      const action: ActionProposal = {
        id: "act_test",
        eventId: "evt_test",
        actionType: "notify_team",
        description: "Notify team",
        confidence: 0.2,
        safetyLevel: "safe",
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.2);

      // Block state: requiresApproval=false (approval can't help), canExecute=false
      expect(result.requiresApproval).toBe(false);
      expect(result.canExecute).toBe(false);
      expect(result.message).toContain("Very low confidence");
    });

    it("should require approval for low confidence (0.3-0.5)", () => {
      const action: ActionProposal = {
        id: "act_test",
        eventId: "evt_test",
        actionType: "restart_service",
        description: "Restart service",
        confidence: 0.4,
        safetyLevel: "low_risk",
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.4);

      expect(result.requiresApproval).toBe(true);
      expect(result.canExecute).toBe(true);
      expect(result.message).toContain("Low confidence");
    });

    it("should require approval for medium confidence (0.5-0.7)", () => {
      const action: ActionProposal = {
        id: "act_test",
        eventId: "evt_test",
        actionType: "add_environment_variable",
        description: "Add env var",
        confidence: 0.6,
        safetyLevel: "safe",
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.6);

      expect(result.requiresApproval).toBe(true);
      expect(result.canExecute).toBe(true);
      expect(result.message).toContain("Medium confidence");
    });

    it("should auto-approve safe actions with high confidence (0.7-0.85)", () => {
      const action: ActionProposal = {
        id: "act_test",
        eventId: "evt_test",
        actionType: "notify_team",
        description: "Notify team",
        confidence: 0.75,
        safetyLevel: "safe",
        requiresApproval: false,
      };

      const result = determineActionGating(action, 0.75);

      expect(result.requiresApproval).toBe(false);
      expect(result.canExecute).toBe(true);
      expect(result.message).toContain("High confidence");
      expect(result.message).toContain("Auto-approved");
    });

    it("should require approval for risky actions even with high confidence", () => {
      const action: ActionProposal = {
        id: "act_test",
        eventId: "evt_test",
        actionType: "rollback_deployment",
        description: "Rollback",
        confidence: 0.75,
        safetyLevel: "medium_risk",
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.75);

      expect(result.requiresApproval).toBe(true);
      expect(result.canExecute).toBe(true);
      expect(result.message).toContain("medium-risk");
      expect(result.message).toContain("Approval required");
    });

    it("should auto-approve safe/low-risk actions with very high confidence (0.85+)", () => {
      const safeAction: ActionProposal = {
        id: "act_test1",
        eventId: "evt_test",
        actionType: "notify_team",
        description: "Notify team",
        confidence: 0.9,
        safetyLevel: "safe",
        requiresApproval: false,
      };

      const lowRiskAction: ActionProposal = {
        id: "act_test2",
        eventId: "evt_test",
        actionType: "restart_service",
        description: "Restart service",
        confidence: 0.9,
        safetyLevel: "low_risk",
        requiresApproval: false,
      };

      const safeResult = determineActionGating(safeAction, 0.9);
      const lowRiskResult = determineActionGating(lowRiskAction, 0.9);

      expect(safeResult.requiresApproval).toBe(false);
      expect(safeResult.canExecute).toBe(true);
      expect(lowRiskResult.requiresApproval).toBe(false);
      expect(lowRiskResult.canExecute).toBe(true);
    });

    it("should require approval for medium-risk actions even with very high confidence", () => {
      const action: ActionProposal = {
        id: "act_test",
        eventId: "evt_test",
        actionType: "rollback_deployment",
        description: "Rollback",
        confidence: 0.9,
        safetyLevel: "medium_risk",
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.9);

      expect(result.requiresApproval).toBe(true);
      expect(result.canExecute).toBe(true);
      expect(result.message).toContain("medium-risk");
    });

    it("should always require approval for dangerous actions", () => {
      const action: ActionProposal = {
        id: "act_test",
        eventId: "evt_test",
        actionType: "manual_investigation",
        description: "Manual investigation required",
        confidence: 0.95,
        safetyLevel: "dangerous",
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.95);

      expect(result.requiresApproval).toBe(true);
      expect(result.message).toContain("dangerous");
      expect(result.message).toContain("Approval required");
    });
  });

  describe("Robustness improvements", () => {
    describe("Unknown confidence handling", () => {
      it("should fall back to default for missing confidence", () => {
        const analysis: LLMAnalysisResult = {
          eventId: "evt_test",
          summary: "Test summary",
          // confidence is undefined
          analyzedAt: new Date().toISOString(),
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        const result = calculateConfidenceScore(analysis, evidence);

        expect(result.breakdown.baseScore).toBe(0.5); // DEFAULT
        expect(result.reasoning[0]).toContain("missing → default");
      });

      it("should fall back to default for invalid confidence value", () => {
        const analysis = {
          eventId: "evt_test",
          summary: "Test summary",
          confidence: "Very_High", // Invalid casing
          analyzedAt: new Date().toISOString(),
        } as unknown as LLMAnalysisResult;

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        const result = calculateConfidenceScore(analysis, evidence);

        expect(result.breakdown.baseScore).toBe(0.5); // DEFAULT
        expect(result.reasoning[0]).toContain("unknown, using default");
      });
    });

    describe("Factor bounding (mis-implementation resistant)", () => {
      it("should clamp factors to defined bounds", () => {
        // The actual factor functions should return bounded values,
        // but the main scoring function also clamps as defense-in-depth
        const analysis: LLMAnalysisResult = {
          eventId: "evt_test",
          summary: "Test",
          confidence: "high",
          analyzedAt: new Date().toISOString(),
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        const result = calculateConfidenceScore(analysis, evidence);

        // All bounded factors should be within their defined bounds
        // (bounded = raw values clamped to FACTOR_BOUNDS)
        expect(result.breakdown.bounded.uncertainty).toBeGreaterThanOrEqual(-0.3);
        expect(result.breakdown.bounded.uncertainty).toBeLessThanOrEqual(0);

        expect(result.breakdown.bounded.evidenceAlignment).toBeGreaterThanOrEqual(-0.4);
        expect(result.breakdown.bounded.evidenceAlignment).toBeLessThanOrEqual(0.4);

        expect(result.breakdown.bounded.completeness).toBeGreaterThanOrEqual(-0.2);
        expect(result.breakdown.bounded.completeness).toBeLessThanOrEqual(0.2);

        expect(result.breakdown.bounded.knowledgeBaseValidation).toBeGreaterThanOrEqual(-0.3);
        expect(result.breakdown.bounded.knowledgeBaseValidation).toBeLessThanOrEqual(0.3);

        expect(result.breakdown.bounded.consistency).toBeGreaterThanOrEqual(-0.2);
        expect(result.breakdown.bounded.consistency).toBeLessThanOrEqual(0.2);

        // Also verify weighted factors exist and are bounded * weight
        expect(result.breakdown.weighted.uncertainty).toBeDefined();
        expect(result.breakdown.weighted.evidenceAlignment).toBeDefined();
        expect(result.breakdown.weighted.completeness).toBeDefined();
        expect(result.breakdown.weighted.knowledgeBaseValidation).toBeDefined();
        expect(result.breakdown.weighted.consistency).toBeDefined();

        // Verify totals
        expect(result.breakdown.totals.weightedAdjustment).toBeDefined();
        expect(result.breakdown.totals.rawScore).toBeDefined();
        expect(result.breakdown.totals.cappedScore).toBeDefined();
        expect(result.breakdown.totals.finalScore).toBe(result.finalScore);
      });
    });

    describe("Empty analysis handling", () => {
      it("should cap score for empty analysis (no summary, cause, or actions)", () => {
        const emptyAnalysis: LLMAnalysisResult = {
          eventId: "evt_test",
          // No summary
          // No identifiedCause
          // No recommendedActions
          confidence: "very_high", // Even high confidence
          analyzedAt: new Date().toISOString(),
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        const result = calculateConfidenceScore(emptyAnalysis, evidence);

        // Should be capped at 0.3 (EMPTY_ANALYSIS_MAX_SCORE)
        expect(result.finalScore).toBeLessThanOrEqual(0.3);
        expect(result.reasoning).toContainEqual(expect.stringContaining("Empty analysis cap"));
        // Should be blocked or require approval
        expect(["block", "require_approval"]).toContain(result.gatingDecision);
      });

      it("should not apply empty analysis penalty when summary exists", () => {
        const analysisWithSummary: LLMAnalysisResult = {
          eventId: "evt_test",
          summary: "This is a valid summary",
          confidence: "high",
          analyzedAt: new Date().toISOString(),
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        const result = calculateConfidenceScore(analysisWithSummary, evidence);

        // Should NOT contain empty analysis cap in reasoning
        expect(result.reasoning).not.toContainEqual(expect.stringContaining("Empty analysis cap"));
      });
    });

    describe("Determinism", () => {
      it("should produce identical results for identical inputs", () => {
        const analysis: LLMAnalysisResult = {
          eventId: "evt_test",
          summary: "Test summary",
          identifiedCause: "Test cause",
          reasoning: "Test reasoning",
          confidence: "high",
          recommendedActions: [{ actionType: "notify_team", description: "Notify team" }],
          analyzedAt: "2024-01-01T00:00:00.000Z",
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          logs: [{ message: "Test cause found in logs" }],
          collectedAt: "2024-01-01T00:00:00.000Z",
        };

        // Run multiple times
        const results = Array.from({ length: 10 }, () =>
          calculateConfidenceScore(analysis, evidence)
        );

        // All results should be identical
        const firstResult = results[0];
        for (const result of results) {
          expect(result.finalScore).toBe(firstResult.finalScore);
          expect(result.breakdown).toEqual(firstResult.breakdown);
          expect(result.gatingDecision).toBe(firstResult.gatingDecision);
        }
      });
    });

    describe("Scoring version traceability", () => {
      it("should include scoring version in result", () => {
        const analysis: LLMAnalysisResult = {
          eventId: "evt_test",
          summary: "Test",
          confidence: "medium",
          analyzedAt: new Date().toISOString(),
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        const result = calculateConfidenceScore(analysis, evidence);

        expect(result.scoringVersion).toBeDefined();
        expect(result.scoringVersion).toBe("confidence_v2");
      });
    });

    describe("Text processing robustness", () => {
      it("should handle very long analysis text without error", () => {
        const longText = "a".repeat(50000);
        const analysis: LLMAnalysisResult = {
          eventId: "evt_test",
          summary: longText,
          reasoning: longText,
          identifiedCause: longText,
          confidence: "medium",
          analyzedAt: new Date().toISOString(),
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        // Should not throw
        expect(() => calculateConfidenceScore(analysis, evidence)).not.toThrow();

        const result = calculateConfidenceScore(analysis, evidence);
        expect(result.finalScore).toBeGreaterThanOrEqual(0);
        expect(result.finalScore).toBeLessThanOrEqual(1);
      });

      it("should handle whitespace-only fields gracefully", () => {
        const analysis: LLMAnalysisResult = {
          eventId: "evt_test",
          summary: "   ",
          reasoning: "\n\t\n",
          confidence: "medium",
          analyzedAt: new Date().toISOString(),
        };

        const evidence: Evidence = {
          eventId: "evt_test",
          collectedAt: new Date().toISOString(),
        };

        // Should not throw
        expect(() => calculateConfidenceScore(analysis, evidence)).not.toThrow();
      });
    });
  });

  // Legacy function tests (for backward compatibility)
  describe("Legacy functions", () => {
    describe("confidenceScore", () => {
      it("should return 0.5 as placeholder value", () => {
        const score = confidenceScore({ test: "value" });
        expect(score).toBe(0.5);
      });
    });

    describe("shouldActOnResult", () => {
      const mockAnalysis: LLMAnalysisResult = {
        eventId: "evt_legacy",
        summary: "Test summary",
        confidence: "low",
        analyzedAt: new Date().toISOString(),
      };

      it("should return false when confidence is below threshold", () => {
        const result = shouldActOnResult(mockAnalysis, 0.8);
        expect(result).toBe(false);
      });

      it("should return true when confidence meets threshold", () => {
        const result = shouldActOnResult(mockAnalysis, 0.2);
        expect(result).toBe(true);
      });

      it("should use default threshold of 0.7", () => {
        const result = shouldActOnResult(mockAnalysis);
        expect(result).toBe(false);
      });
    });
  });
});
