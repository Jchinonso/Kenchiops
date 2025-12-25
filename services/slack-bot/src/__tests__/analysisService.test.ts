/**
 * Unit tests for Analysis Service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Event, LLMAnalysisResult, ConfidenceScoreResult } from "@kenchi/shared";

// Mock @kenchi/shared module
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    OpenAIClient: jest.fn().mockImplementation(() => ({
      analyzeIncident: jest.fn(),
    })),
    calculateConfidenceScore: jest.fn(),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
    getErrorMessage: jest.fn((error) => (error instanceof Error ? error.message : String(error))),
    wrapError: jest.fn((prefix, error) => {
      const message = error instanceof Error ? error.message : String(error);
      return `${prefix}: ${message}`;
    }),
  };
});

// Import after mock
import {
  getOpenAIClient,
  createEventFromCommand,
  createEventFromMention,
  createMinimalEvidence,
  performAnalysis,
} from "../services/analysisService.js";

describe("Analysis Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getOpenAIClient", () => {
    it("should create and return OpenAI client instance", () => {
      const client = getOpenAIClient();

      expect(client).toBeDefined();
      expect(client.analyzeIncident).toBeDefined();
    });

    it("should return same instance on subsequent calls (singleton pattern)", () => {
      const client1 = getOpenAIClient();
      const client2 = getOpenAIClient();

      expect(client1).toBe(client2);
    });

    it("should have analyzeIncident method", () => {
      const client = getOpenAIClient();

      expect(client.analyzeIncident).toBeDefined();
      expect(typeof client.analyzeIncident).toBe("function");
    });
  });

  describe("createEventFromCommand", () => {
    it("should create event with correct structure", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const text = "analyze this issue";

      const event = createEventFromCommand(userId, channelId, text);

      expect(event).toBeDefined();
      expect(event.type).toBe("MANUAL_TRIGGER");
      expect(event.source).toBe("slack");
      expect(event.severity).toBe("medium");
      expect(event.title).toBe("Slack Command Analysis");
    });

    it("should include command in payload", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const text = "analyze deployment failure";

      const event = createEventFromCommand(userId, channelId, text);

      expect(event.payload.command).toBe(text);
    });

    it("should include user and channel IDs in payload", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const text = "test command";

      const event = createEventFromCommand(userId, channelId, text);

      expect(event.payload.user_id).toBe(userId);
      expect(event.payload.channel_id).toBe(channelId);
    });

    it("should include triggeredBy in metadata", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const text = "test";

      const event = createEventFromCommand(userId, channelId, text);

      expect(event.metadata?.triggeredBy).toBe(userId);
    });

    it("should generate unique event ID", () => {
      const event1 = createEventFromCommand("U1", "C1", "test1");
      const event2 = createEventFromCommand("U2", "C2", "test2");

      expect(event1.id).toBeDefined();
      expect(event2.id).toBeDefined();
      expect(event1.id).not.toBe(event2.id);
      expect(event1.id).toMatch(/^evt_\d+_U1$/);
      expect(event2.id).toMatch(/^evt_\d+_U2$/);
    });

    it("should set timestamp in ISO 8601 format", () => {
      const event = createEventFromCommand("U123", "C456", "test");

      expect(event.timestamp).toBeDefined();
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should handle empty command text", () => {
      const event = createEventFromCommand("U123", "C456", "");

      expect(event.payload.command).toBe("");
      expect(event.type).toBe("MANUAL_TRIGGER");
    });

    it("should handle special characters in command", () => {
      const text = "analyze <script>alert('xss')</script>";
      const event = createEventFromCommand("U123", "C456", text);

      expect(event.payload.command).toBe(text);
    });

    it("should handle unicode characters in command", () => {
      const text = "分析このエラー 🚀";
      const event = createEventFromCommand("U123", "C456", text);

      expect(event.payload.command).toBe(text);
    });

    it("should handle very long command text", () => {
      const longText = "analyze " + "a".repeat(1000);
      const event = createEventFromCommand("U123", "C456", longText);

      expect(event.payload.command).toBe(longText);
    });
  });

  describe("createEventFromMention", () => {
    it("should create event with correct structure", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const query = "what's wrong with the deployment?";

      const event = createEventFromMention(userId, channelId, query);

      expect(event).toBeDefined();
      expect(event.type).toBe("MANUAL_TRIGGER");
      expect(event.source).toBe("slack");
      expect(event.severity).toBe("medium");
      expect(event.title).toBe("Slack Mention Analysis");
    });

    it("should include query in payload", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const query = "analyze this error";

      const event = createEventFromMention(userId, channelId, query);

      expect(event.payload.query).toBe(query);
    });

    it("should include user and channel in payload", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const query = "test query";

      const event = createEventFromMention(userId, channelId, query);

      expect(event.payload.user).toBe(userId);
      expect(event.payload.channel).toBe(channelId);
    });

    it("should include thread_ts when provided", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const query = "test query";
      const threadTs = "1234567890.123456";

      const event = createEventFromMention(userId, channelId, query, threadTs);

      expect(event.payload.thread_ts).toBe(threadTs);
    });

    it("should not include thread_ts when not provided", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const query = "test query";

      const event = createEventFromMention(userId, channelId, query);

      expect(event.payload.thread_ts).toBeUndefined();
    });

    it("should include triggeredBy in metadata", () => {
      const userId = "U123456";
      const channelId = "C789012";
      const query = "test";

      const event = createEventFromMention(userId, channelId, query);

      expect(event.metadata?.triggeredBy).toBe(userId);
    });

    it("should generate unique event ID", () => {
      const event1 = createEventFromMention("U1", "C1", "query1");
      const event2 = createEventFromMention("U2", "C2", "query2");

      expect(event1.id).toBeDefined();
      expect(event2.id).toBeDefined();
      expect(event1.id).not.toBe(event2.id);
    });

    it("should set timestamp in ISO 8601 format", () => {
      const event = createEventFromMention("U123", "C456", "query");

      expect(event.timestamp).toBeDefined();
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should handle empty query", () => {
      const event = createEventFromMention("U123", "C456", "");

      expect(event.payload.query).toBe("");
    });

    it("should handle special characters in query", () => {
      const query = "@bot help <>&\"'";
      const event = createEventFromMention("U123", "C456", query);

      expect(event.payload.query).toBe(query);
    });

    it("should handle very long query text", () => {
      const longQuery = "analyze " + "b".repeat(2000);
      const event = createEventFromMention("U123", "C456", longQuery);

      expect(event.payload.query).toBe(longQuery);
    });
  });

  describe("createMinimalEvidence", () => {
    it("should create evidence with correct structure", () => {
      const eventId = "evt_123456_U789";

      const evidence = createMinimalEvidence(eventId);

      expect(evidence).toBeDefined();
      expect(evidence.eventId).toBe(eventId);
      expect(evidence.logs).toEqual([]);
    });

    it("should set collectedAt timestamp in ISO 8601 format", () => {
      const eventId = "evt_123456_U789";

      const evidence = createMinimalEvidence(eventId);

      expect(evidence.collectedAt).toBeDefined();
      expect(evidence.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should create empty logs array", () => {
      const eventId = "evt_123456_U789";

      const evidence = createMinimalEvidence(eventId);

      expect(Array.isArray(evidence.logs)).toBe(true);
      expect(evidence.logs).toHaveLength(0);
    });

    it("should handle different event ID formats", () => {
      const eventIds = ["evt_123_U456", "evt_999999999_UABCDEF", "evt_1_U1"];

      eventIds.forEach((eventId) => {
        const evidence = createMinimalEvidence(eventId);
        expect(evidence.eventId).toBe(eventId);
      });
    });

    it("should create new timestamp for each call", () => {
      const evidence1 = createMinimalEvidence("evt1");
      const evidence2 = createMinimalEvidence("evt2");

      // Timestamps might be the same if called very quickly, but structure should be valid
      expect(evidence1.collectedAt).toBeDefined();
      expect(evidence2.collectedAt).toBeDefined();
    });
  });

  describe("performAnalysis", () => {
    const createMockEvent = (): Event => ({
      id: "evt_123456_U789",
      type: "MANUAL_TRIGGER",
      source: "slack",
      timestamp: new Date().toISOString(),
      severity: "medium",
      title: "Test Event",
      payload: {
        command: "test command",
      },
    });

    const createMockAnalysisResult = (): LLMAnalysisResult => ({
      eventId: "evt_123456_U789",
      summary: "The deployment failed due to a configuration error",
      identifiedCause: "Missing environment variable DATABASE_URL",
      confidence: "high",
      confidenceScore: 0.85,
      reasoning: "Error logs clearly indicate missing configuration",
      recommendedActions: [
        {
          actionType: "add_environment_variable",
          description: "Add DATABASE_URL to environment configuration",
          priority: "high",
        },
      ],
      analyzedAt: new Date().toISOString(),
    });

    const createMockConfidenceScore = (): ConfidenceScoreResult => ({
      finalScore: 0.82,
      breakdown: {
        baseScore: 0.75,
        uncertaintyAdjustment: 0.0,
        evidenceAlignment: 0.05,
        completeness: 0.02,
        knowledgeBaseValidation: 0.0,
        consistency: 0.0,
      },
      reasoning: ["Base score: 0.75", "Final confidence score: 0.82"],
      gatingDecision: "auto_approve",
    });

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { calculateConfidenceScore } = jest.requireMock("@kenchi/shared") as any;
      calculateConfidenceScore.mockReturnValue(createMockConfidenceScore());
    });

    it("should perform analysis successfully", async () => {
      const event = createMockEvent();
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest
        .fn<any>()
        .mockResolvedValue(createMockAnalysisResult());

      const result = await performAnalysis(event);

      expect(result).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.event).toBe(event);
    });

    it("should call OpenAI client with event and evidence", async () => {
      const event = createMockEvent();
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest
        .fn<any>()
        .mockResolvedValue(createMockAnalysisResult());

      await performAnalysis(event);

      expect(client.analyzeIncident).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          eventId: event.id,
          logs: [],
        })
      );
    });

    it("should call calculateConfidenceScore with analysis and evidence", async () => {
      const event = createMockEvent();
      const mockAnalysis = createMockAnalysisResult();
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(mockAnalysis);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { calculateConfidenceScore } = jest.requireMock("@kenchi/shared") as any;

      await performAnalysis(event);

      expect(calculateConfidenceScore).toHaveBeenCalledWith(
        mockAnalysis,
        expect.objectContaining({
          eventId: event.id,
        })
      );
    });

    it("should return analysis result with correct structure", async () => {
      const event = createMockEvent();
      const mockAnalysis = createMockAnalysisResult();
      const mockConfidence = createMockConfidenceScore();
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(mockAnalysis);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { calculateConfidenceScore } = jest.requireMock("@kenchi/shared") as any;
      calculateConfidenceScore.mockReturnValue(mockConfidence);

      const result = await performAnalysis(event);

      expect(result.analysis).toEqual(mockAnalysis);
      expect(result.confidence).toEqual(mockConfidence);
      expect(result.event).toBe(event);
    });

    it("should include confidence finalScore in result", async () => {
      const event = createMockEvent();
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest
        .fn<any>()
        .mockResolvedValue(createMockAnalysisResult());

      const result = await performAnalysis(event);

      expect(result.confidence.finalScore).toBeDefined();
      expect(typeof result.confidence.finalScore).toBe("number");
    });

    it("should include gatingDecision in result", async () => {
      const event = createMockEvent();
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest
        .fn<any>()
        .mockResolvedValue(createMockAnalysisResult());

      const result = await performAnalysis(event);

      expect(result.confidence.gatingDecision).toBeDefined();
      expect(["auto_approve", "require_approval", "block"]).toContain(
        result.confidence.gatingDecision
      );
    });

    it("should throw LLMError when OpenAI client fails", async () => {
      const event = createMockEvent();
      const error = new Error("OpenAI API error");
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockRejectedValue(error);

      await expect(performAnalysis(event)).rejects.toThrow();

      // Verify it's an LLMError by checking the error name
      try {
        await performAnalysis(event);
      } catch (e) {
        expect((e as Error).name).toBe("LLMError");
      }
    });

    it("should handle OpenAI timeout errors", async () => {
      const event = createMockEvent();
      const timeoutError = new Error("Request timeout");
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockRejectedValue(timeoutError);

      await expect(performAnalysis(event)).rejects.toThrow();
    });

    it("should handle OpenAI rate limit errors", async () => {
      const event = createMockEvent();
      const rateLimitError = new Error("Rate limit exceeded");
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockRejectedValue(rateLimitError);

      await expect(performAnalysis(event)).rejects.toThrow();
    });

    it("should handle malformed analysis response", async () => {
      const event = createMockEvent();
      const malformedAnalysis = {
        eventId: "evt_123",
        // Missing required fields
      } as unknown as LLMAnalysisResult;
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(malformedAnalysis);

      // Should still complete, confidence scoring handles missing fields
      const result = await performAnalysis(event);

      expect(result).toBeDefined();
      expect(result.analysis).toEqual(malformedAnalysis);
    });

    it("should handle analysis with low confidence", async () => {
      const event = createMockEvent();
      const lowConfidenceAnalysis = createMockAnalysisResult();
      lowConfidenceAnalysis.confidence = "very_low";
      lowConfidenceAnalysis.confidenceScore = 0.15;
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(lowConfidenceAnalysis);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { calculateConfidenceScore } = jest.requireMock("@kenchi/shared") as any;
      calculateConfidenceScore.mockReturnValue({
        finalScore: 0.15,
        breakdown: {
          baseScore: 0.15,
          uncertaintyAdjustment: 0,
          evidenceAlignment: 0,
          completeness: 0,
          knowledgeBaseValidation: 0,
          consistency: 0,
        },
        reasoning: ["Low confidence"],
        gatingDecision: "block",
      });

      const result = await performAnalysis(event);

      expect(result.confidence.gatingDecision).toBe("block");
      expect(result.confidence.finalScore).toBeLessThan(0.3);
    });

    it("should handle analysis with high confidence", async () => {
      const event = createMockEvent();
      const highConfidenceAnalysis = createMockAnalysisResult();
      highConfidenceAnalysis.confidence = "very_high";
      highConfidenceAnalysis.confidenceScore = 0.95;
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(highConfidenceAnalysis);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { calculateConfidenceScore } = jest.requireMock("@kenchi/shared") as any;
      calculateConfidenceScore.mockReturnValue({
        finalScore: 0.95,
        breakdown: {
          baseScore: 0.9,
          uncertaintyAdjustment: 0,
          evidenceAlignment: 0.05,
          completeness: 0,
          knowledgeBaseValidation: 0,
          consistency: 0,
        },
        reasoning: ["High confidence"],
        gatingDecision: "auto_approve",
      });

      const result = await performAnalysis(event);

      expect(result.confidence.gatingDecision).toBe("auto_approve");
      expect(result.confidence.finalScore).toBeGreaterThan(0.8);
    });

    it("should handle analysis with uncertainties", async () => {
      const event = createMockEvent();
      const uncertainAnalysis = createMockAnalysisResult();
      uncertainAnalysis.uncertainties = [
        "Unable to determine exact cause",
        "Multiple potential root causes",
      ];
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(uncertainAnalysis);

      const result = await performAnalysis(event);

      expect(result.analysis.uncertainties).toBeDefined();
      expect(result.analysis.uncertainties?.length).toBeGreaterThan(0);
    });

    it("should handle analysis with code annotations", async () => {
      const event = createMockEvent();
      const analysisWithAnnotations = createMockAnalysisResult();
      analysisWithAnnotations.codeAnnotations = [
        {
          path: "src/index.ts",
          line: 42,
          level: "failure",
          message: "Type error on line 42",
        },
      ];
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(analysisWithAnnotations);

      const result = await performAnalysis(event);

      expect(result.analysis.codeAnnotations).toBeDefined();
      expect(result.analysis.codeAnnotations?.length).toBe(1);
    });

    it("should handle analysis with multiple recommended actions", async () => {
      const event = createMockEvent();
      const analysisWithActions = createMockAnalysisResult();
      analysisWithActions.recommendedActions = [
        {
          actionType: "restart_service",
          description: "Restart the service",
          priority: "immediate",
        },
        {
          actionType: "notify_team",
          description: "Notify on-call team",
          priority: "high",
        },
        {
          actionType: "create_ticket",
          description: "Create bug ticket",
          priority: "medium",
        },
      ];
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockResolvedValue(analysisWithActions);

      const result = await performAnalysis(event);

      expect(result.analysis.recommendedActions).toBeDefined();
      expect(result.analysis.recommendedActions?.length).toBe(3);
    });

    it("should handle non-Error objects thrown by OpenAI client", async () => {
      const event = createMockEvent();
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest.fn<any>().mockRejectedValue("String error");

      await expect(performAnalysis(event)).rejects.toThrow();
    });

    it("should preserve event metadata in result", async () => {
      const event = createMockEvent();
      event.metadata = {
        triggeredBy: "U123456",
        environment: "production",
      };
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest
        .fn<any>()
        .mockResolvedValue(createMockAnalysisResult());

      const result = await performAnalysis(event);

      expect(result.event.metadata).toBeDefined();
      expect(result.event.metadata?.triggeredBy).toBe("U123456");
    });

    it("should work with different event types", async () => {
      const cicdEvent = createMockEvent();
      cicdEvent.type = "CICD_FAILURE";
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest
        .fn<any>()
        .mockResolvedValue(createMockAnalysisResult());

      const result = await performAnalysis(cicdEvent);

      expect(result).toBeDefined();
    });

    it("should work with different severity levels", async () => {
      const criticalEvent = createMockEvent();
      criticalEvent.severity = "critical";
      const client = getOpenAIClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).analyzeIncident = jest
        .fn<any>()
        .mockResolvedValue(createMockAnalysisResult());

      const result = await performAnalysis(criticalEvent);

      expect(result).toBeDefined();
      expect(result.event.severity).toBe("critical");
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle null or undefined values gracefully", () => {
      // Test that functions handle edge cases
      const event = createEventFromCommand("", "", "");
      expect(event.payload.user_id).toBe("");
      expect(event.payload.channel_id).toBe("");
    });

    it("should handle very long user and channel IDs", () => {
      const longId = "U" + "X".repeat(100);
      const event = createEventFromCommand(longId, "C123", "test");
      expect(event.payload.user_id).toBe(longId);
    });

    it("should handle special Slack ID formats", () => {
      const event = createEventFromCommand("U01ABC123XYZ", "C01DEF456UVW", "test");
      expect(event.payload.user_id).toBe("U01ABC123XYZ");
      expect(event.payload.channel_id).toBe("C01DEF456UVW");
    });

    it("should handle thread_ts with various formats", () => {
      const threadFormats = ["1234567890.123456", "1234567890.000000", "9999999999.999999"];

      threadFormats.forEach((ts) => {
        const event = createEventFromMention("U1", "C1", "query", ts);
        expect(event.payload.thread_ts).toBe(ts);
      });
    });
  });
});
