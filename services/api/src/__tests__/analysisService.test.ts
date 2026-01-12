/**
 * Unit tests for API Analysis Service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { LLMAnalysisResult, Evidence, Event } from "@kenchi/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAnalyzeIncident = jest.fn<(...args: any[]) => Promise<any>>();

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    OpenAIClient: jest.fn().mockImplementation(() => ({
      analyzeIncident: mockAnalyzeIncident,
    })),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
    searchFromEventContext: jest.fn().mockResolvedValue({
      diffChunks: [],
      knowledgeDocs: [],
      queryTokens: 10,
      cacheHit: false,
    }),
    selectModel: jest.fn().mockReturnValue({
      model: "gpt-4o-mini",
      reason: "standard_analysis",
    }),
    logModelSelection: jest.fn(),
    createAnalysis: jest.fn().mockResolvedValue({
      id: "analysis_123",
      eventId: "evt_test",
      createdAt: new Date().toISOString(),
    }),
  };
});

// Import after mock setup
import {
  createAnalysisContext,
  formatAnalysisResponse,
  analyzeFailure,
  performAnalysis,
} from "../services/analysisService.js";

describe("API Analysis Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock to default empty implementation
    mockAnalyzeIncident.mockReset();
  });

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
      // Logs without markdown headings are wrapped in Overview section
      expect(context.evidence.logs![0].level).toBe("INFO");
      expect(context.evidence.logs![0].message).toBe("## Overview\nError: Connection refused");
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

    it("should include timestamp in event", () => {
      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.event.timestamp).toBeDefined();
      expect(new Date(context.event.timestamp).getTime()).not.toBeNaN();
    });

    it("should include timestamp in evidence log", () => {
      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.evidence.logs![0].timestamp).toBeDefined();
      expect(new Date(context.evidence.logs![0].timestamp!).getTime()).not.toBeNaN();
    });

    it("should set log source based on section heading", () => {
      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      // Logs without markdown headings are in Overview section
      expect(context.evidence.logs![0].source).toBe("ci-overview");
    });

    it("should handle empty failure log", () => {
      const request = {
        failure_log: "",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.evidence.logs![0].message).toBe("");
    });

    it("should handle very long failure log", () => {
      const longLog = "A".repeat(10000);
      const request = {
        failure_log: longLog,
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      // Long logs are wrapped in Overview section
      expect(context.evidence.logs![0].message).toBe(`## Overview\n${longLog}`);
    });

    it("should handle special characters in repository name", () => {
      const request = {
        failure_log: "Error",
        repository: "org/repo-name_123",
      };

      const context = createAnalysisContext(request);

      expect(context.event.payload.repository).toBe("org/repo-name_123");
    });

    it("should include collectedAt timestamp in evidence", () => {
      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.evidence.collectedAt).toBeDefined();
      expect(new Date(context.evidence.collectedAt).getTime()).not.toBeNaN();
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

    it("should handle empty recommended actions", () => {
      const analysisWithoutActions: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Test summary",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      const response = formatAnalysisResponse(analysisWithoutActions, mockEvidence, "test-repo");

      expect(response.recommended_actions).toBeUndefined();
    });

    it("should handle low confidence", () => {
      const lowConfidenceAnalysis: LLMAnalysisResult = {
        ...mockAnalysis,
        confidence: "low",
      };

      const response = formatAnalysisResponse(lowConfidenceAnalysis, mockEvidence, "test-repo");

      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
    });

    it("should handle medium confidence", () => {
      const mediumConfidenceAnalysis: LLMAnalysisResult = {
        ...mockAnalysis,
        confidence: "medium",
      };

      const response = formatAnalysisResponse(mediumConfidenceAnalysis, mockEvidence, "test-repo");

      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
    });

    it("should preserve full analysis object", () => {
      const response = formatAnalysisResponse(mockAnalysis, mockEvidence, "test-repo");

      expect(response.full_analysis).toBe(mockAnalysis);
      expect(response.full_analysis.eventId).toBe("evt_test");
      expect(response.full_analysis.analyzedAt).toBe(mockAnalysis.analyzedAt);
    });

    it("should handle multiple recommended actions", () => {
      const multiActionAnalysis: LLMAnalysisResult = {
        ...mockAnalysis,
        recommendedActions: [
          { actionType: "fix_code", description: "Action 1", priority: "high" },
          { actionType: "review_logs", description: "Action 2", priority: "medium" },
          { actionType: "rollback", description: "Action 3", priority: "low" },
        ],
      };

      const response = formatAnalysisResponse(multiActionAnalysis, mockEvidence, "test-repo");

      expect(response.recommended_actions).toHaveLength(3);
    });
  });

  describe("analyzeFailure", () => {
    const mockEvent: Event = {
      id: "evt_test",
      type: "CICD_FAILURE",
      source: "github-app",
      timestamp: new Date().toISOString(),
      severity: "high",
      title: "Test failure",
      payload: {},
    };

    const mockEvidence: Evidence = {
      eventId: "evt_test",
      collectedAt: new Date().toISOString(),
      logs: [],
    };

    it("should successfully analyze failure", async () => {
      const mockAnalysisResult: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Test analysis",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      };

      mockAnalyzeIncident.mockResolvedValue(mockAnalysisResult);

      const result = await analyzeFailure(mockEvent, mockEvidence);

      expect(result).toEqual(mockAnalysisResult);
      expect(mockAnalyzeIncident).toHaveBeenCalledWith(mockEvent, mockEvidence);
    });

    it("should throw LLMError when OpenAI fails", async () => {
      mockAnalyzeIncident.mockRejectedValue(new Error("API Error"));

      await expect(analyzeFailure(mockEvent, mockEvidence)).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      const networkError = new Error("Network error");
      mockAnalyzeIncident.mockRejectedValue(networkError);

      await expect(analyzeFailure(mockEvent, mockEvidence)).rejects.toThrow();
    });
  });

  describe("performAnalysis", () => {
    it("should complete full analysis flow", async () => {
      const mockAnalysisResult: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Complete analysis",
        identifiedCause: "Root cause found",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
        recommendedActions: [{ actionType: "fix_code", description: "Fix it", priority: "high" }],
      };

      mockAnalyzeIncident.mockResolvedValue(mockAnalysisResult);

      const request = {
        failure_log: "Build failed",
        repository: "test-repo",
        commit: "abc123",
      };

      const result = await performAnalysis(request);

      expect(result.analysis).toBe("Complete analysis");
      expect(result.identified_cause).toBe("Root cause found");
      expect(result.repository).toBe("test-repo");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.recommended_actions).toHaveLength(1);
    });

    it("should handle analysis without commit", async () => {
      const mockAnalysisResult: LLMAnalysisResult = {
        eventId: "evt_test",
        summary: "Analysis",
        confidence: "medium",
        analyzedAt: new Date().toISOString(),
      };

      mockAnalyzeIncident.mockResolvedValue(mockAnalysisResult);

      const request = {
        failure_log: "Test failed",
        repository: "test-repo",
      };

      const result = await performAnalysis(request);

      expect(result.repository).toBe("test-repo");
    });

    it("should propagate errors from analyzeFailure", async () => {
      mockAnalyzeIncident.mockRejectedValue(new Error("LLM Error"));

      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      await expect(performAnalysis(request)).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle very long repository names", () => {
      const longRepoName = "org/" + "a".repeat(200);
      const request = {
        failure_log: "Error",
        repository: longRepoName,
      };

      const context = createAnalysisContext(request);

      expect(context.event.payload.repository).toBe(longRepoName);
    });

    it("should handle unicode in failure logs", () => {
      const request = {
        failure_log: "Error: 测试错误 🔥",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      // Unicode logs are wrapped in Overview section
      expect(context.evidence.logs![0].message).toBe("## Overview\nError: 测试错误 🔥");
    });

    it("should handle newlines in failure logs", () => {
      const request = {
        failure_log: "Line 1\nLine 2\nLine 3",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.evidence.logs![0].message).toContain("\n");
    });

    it("should generate event IDs with correct format", () => {
      const request = {
        failure_log: "Error",
        repository: "test-repo",
      };

      const context = createAnalysisContext(request);

      expect(context.event.id).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });
  });
});
