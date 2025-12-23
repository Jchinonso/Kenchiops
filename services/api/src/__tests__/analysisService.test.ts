/**
 * Unit tests for API Analysis Service
 */

import { describe, it, expect } from "@jest/globals";
import { createAnalysisContext, formatAnalysisResponse } from "../services/analysisService.js";
import type { LLMAnalysisResult, Evidence } from "@kenchi/shared";

describe("API Analysis Service", () => {
  describe("createAnalysisContext", () => {
    it("should create event with correct structure", () => {
      const request = {
        failure_log: "Error: Connection refused",
        repository: "test-repo",
        commit: "abc123",
      };

      const context = createAnalysisContext(request);

      expect(context.event).toBeDefined();
      expect(context.event.type).toBe("CICD_FAILURE");
      expect(context.event.source).toBe("github-app");
      expect(context.event.severity).toBe("high");
      expect(context.event.title).toContain("test-repo");
      expect(context.event.payload).toEqual({
        repository: "test-repo",
        failureLog: "Error: Connection refused",
        commit: "abc123",
      });
    });

    it("should create evidence with correct structure", () => {
      const request = {
        failure_log: "Error: Connection refused",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.evidence).toBeDefined();
      expect(context.evidence.eventId).toBe(context.event.id);
      expect(context.evidence.logs).toHaveLength(1);
      expect(context.evidence.logs![0].level).toBe("ERROR");
      expect(context.evidence.logs![0].message).toBe("Error: Connection refused");
    });

    it("should generate unique event IDs", () => {
      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      const context1 = createAnalysisContext(request);
      const context2 = createAnalysisContext(request);

      expect(context1.event.id).not.toBe(context2.event.id);
    });

    it('should use "unknown" for missing commit', () => {
      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.event.payload.commit).toBe("unknown");
    });
  });

  describe("formatAnalysisResponse", () => {
    const mockAnalysis: LLMAnalysisResult = {
      eventId: "evt_test",
      summary: "Test summary",
      identifiedCause: "Test cause",
      confidence: "high",
      analyzedAt: new Date().toISOString(),
      recommendedActions: [
        {
          actionType: "fix_code",
          description: "Fix the bug",
          priority: "high",
        },
      ],
    };

    const mockEvidence: Evidence = {
      eventId: "evt_test",
      collectedAt: new Date().toISOString(),
      logs: [],
    };

    it("should format response with all required fields", () => {
      const response = formatAnalysisResponse(mockAnalysis, mockEvidence, "test-repo");

      expect(response.analysis).toBe("Test summary");
      expect(response.identified_cause).toBe("Test cause");
      expect(response.repository).toBe("test-repo");
      expect(response.full_analysis).toEqual(mockAnalysis);
      expect(response.recommended_actions).toEqual(mockAnalysis.recommendedActions);
    });

    it("should include confidence score", () => {
      const response = formatAnalysisResponse(mockAnalysis, mockEvidence, "test-repo");

      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
    });

    it("should handle undefined identified cause", () => {
      const analysisWithoutCause: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Test summary",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const response = formatAnalysisResponse(analysisWithoutCause, mockEvidence, "test-repo");

      expect(response.identified_cause).toBeUndefined();
    });
  });
});
