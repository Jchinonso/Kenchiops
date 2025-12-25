/**
 * Unit tests for Mention Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { handleAppMention } from "../handlers/mentionHandler.js";
import type { AppMentionEvent, SayFn } from "@slack/bolt";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  TIME_CONSTANTS: {
    MILLISECONDS_PER_SECOND: 1000,
  },
}));

jest.mock("../formatters.js", () => ({
  formatAnalysisMessage: jest.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "Analysis message" } },
  ]),
  formatErrorMessage: jest.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "Error message" } },
  ]),
}));

jest.mock("../services/analysisService.js", () => ({
  createEventFromMention: jest.fn((userId, channelId, query, threadTs) => ({
    id: `evt_test_${userId}`,
    type: "MANUAL_TRIGGER",
    source: "slack",
    timestamp: new Date().toISOString(),
    severity: "medium",
    title: "Slack Mention Analysis",
    payload: {
      query,
      channel: channelId,
      user: userId,
      thread_ts: threadTs,
    },
    metadata: {
      triggeredBy: userId,
    },
  })),
  performAnalysis: jest.fn(() =>
    Promise.resolve({
      analysis: {
        eventId: "evt_test",
        summary: "Test analysis summary",
        identifiedCause: "Test cause",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
        recommendedActions: [],
      },
      confidence: {
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
        reasoning: [],
      },
    })
  ),
}));

describe("Mention Handler", () => {
  const createMockSayFn = (): jest.Mock<SayFn> => {
    return jest.fn<SayFn>().mockImplementation(() => Promise.resolve({ ok: true }));
  };

  const createMockAppMentionEvent = (overrides: Partial<AppMentionEvent> = {}): AppMentionEvent => ({
    type: "app_mention",
    text: "<@U123456> help me debug this issue",
    user: "U789012",
    ts: "1234567890.123456",
    channel: "C123456",
    event_ts: "1234567890.123456",
    ...overrides,
  });

  let mockSay: jest.Mock<SayFn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSay = createMockSayFn();
  });

  describe("handleAppMention", () => {
    it("should handle basic app mention", async () => {
      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalledTimes(2);
      // First call: analysis message
      expect(mockSay).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          blocks: expect.any(Array),
          thread_ts: event.ts,
        })
      );
      // Second call: feedback buttons
      expect(mockSay).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          blocks: expect.any(Array),
          thread_ts: event.ts,
        })
      );
    });

    it("should extract query by removing bot mentions", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        text: "<@U123456> what caused the build failure?",
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        "what caused the build failure?",
        event.ts
      );
    });

    it("should handle multiple bot mentions in text", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        text: "<@U123456> hey <@U654321> can you help?",
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        "hey  can you help?",
        event.ts
      );
    });

    it("should trim whitespace from extracted query", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        text: "<@U123456>    lots of spaces    ",
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        "lots of spaces",
        event.ts
      );
    });

    it("should use thread_ts when replying in a thread", async () => {
      const event = createMockAppMentionEvent({
        thread_ts: "1234567890.000000",
      });

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: event.ts,
        })
      );
    });

    it("should use event timestamp when thread_ts is not provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        thread_ts: undefined,
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        expect.any(String),
        event.ts
      );
    });

    it("should convert event timestamp to ISO format", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        ts: "1609459200.000000", // 2021-01-01 00:00:00 UTC
      });

      await handleAppMention(event, mockSay);

      expect(performAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        })
      );
    });

    it("should handle missing user field gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        user: undefined,
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        "unknown",
        event.channel,
        expect.any(String),
        event.ts
      );
    });

    it("should perform analysis with created event", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(performAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining("evt_test_"),
          type: "MANUAL_TRIGGER",
          source: "slack",
        })
      );
    });

    it("should format analysis message with results", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { formatAnalysisMessage } = jest.requireMock("../formatters.js") as any;
      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(formatAnalysisMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt_test",
          summary: "Test analysis summary",
        }),
        expect.objectContaining({
          finalScore: 0.85,
          gatingDecision: "auto_approve",
        })
      );
    });

    it("should send analysis message as blocks", async () => {
      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
            }),
          ]),
        })
      );
    });

    it("should create feedback buttons with event ID", async () => {
      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      // Second call should have feedback buttons
      const secondCall = mockSay.mock.calls[1]?.[0];
      expect(secondCall).toBeDefined();
      if (typeof secondCall !== "string") {
        expect(secondCall).toHaveProperty("blocks");
        expect(Array.isArray(secondCall.blocks)).toBe(true);
      }
    });

    it("should include helpful button in feedback", async () => {
      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      const feedbackCall = mockSay.mock.calls[1]?.[0];
      if (typeof feedbackCall !== "string") {
        const feedbackString = JSON.stringify(feedbackCall?.blocks);
        expect(feedbackString).toContain("Helpful");
        expect(feedbackString).toContain("feedback_helpful");
      }
    });

    it("should include not helpful button in feedback", async () => {
      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      const feedbackCall = mockSay.mock.calls[1]?.[0];
      if (typeof feedbackCall !== "string") {
        const feedbackString = JSON.stringify(feedbackCall?.blocks);
        expect(feedbackString).toContain("Not helpful");
        expect(feedbackString).toContain("feedback_not_helpful");
      }
    });

    it("should reply in the same thread for all messages", async () => {
      const event = createMockAppMentionEvent({
        ts: "1234567890.123456",
      });

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          thread_ts: "1234567890.123456",
        })
      );
      expect(mockSay).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          thread_ts: "1234567890.123456",
        })
      );
    });

    it("should handle analysis service errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      performAnalysis.mockRejectedValueOnce(new Error("Analysis failed"));

      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      // Should still call say with error message
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
          thread_ts: event.ts,
        })
      );
    });

    it("should format error message on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { formatErrorMessage } = jest.requireMock("../formatters.js") as any;
      const testError = new Error("LLM service unavailable");
      performAnalysis.mockRejectedValueOnce(testError);

      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(formatErrorMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "LLM service unavailable",
        })
      );
    });

    it("should handle non-Error exceptions", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { formatErrorMessage } = jest.requireMock("../formatters.js") as any;
      performAnalysis.mockRejectedValueOnce("String error");

      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(formatErrorMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Unknown error",
        })
      );
    });

    it("should not throw on error", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      performAnalysis.mockRejectedValueOnce(new Error("Test error"));

      const event = createMockAppMentionEvent();

      await expect(handleAppMention(event, mockSay)).resolves.not.toThrow();
    });

    it("should send error message in thread on failure", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      performAnalysis.mockRejectedValueOnce(new Error("Test error"));

      const event = createMockAppMentionEvent({
        ts: "1234567890.123456",
      });

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
          thread_ts: "1234567890.123456",
        })
      );
    });

    it("should handle empty query text", async () => {
      const event = createMockAppMentionEvent({
        text: "<@U123456>",
      });

      await handleAppMention(event, mockSay);

      // Should still process with empty query
      expect(mockSay).toHaveBeenCalled();
    });

    it("should handle query with only whitespace after mention", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        text: "<@U123456>    ",
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        "",
        event.ts
      );
    });

    it("should handle very long query text", async () => {
      const longText = `<@U123456> ${"a".repeat(2000)}`;
      const event = createMockAppMentionEvent({
        text: longText,
      });

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalled();
    });

    it("should handle special characters in query", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        text: "<@U123456> why is <script>alert('xss')</script> failing?",
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        "why is <script>alert('xss')</script> failing?",
        event.ts
      );
    });

    it("should handle unicode characters in query", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        text: "<@U123456> なぜビルドが失敗しましたか？ 🔥",
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        "なぜビルドが失敗しましたか？ 🔥",
        event.ts
      );
    });

    it("should handle malformed bot mention tags", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        text: "<@U123456 help me",
      });

      await handleAppMention(event, mockSay);

      // Should still extract text, even if mention is malformed
      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        event.channel,
        expect.any(String),
        event.ts
      );
    });

    it("should handle numeric timestamps correctly", async () => {
      const event = createMockAppMentionEvent({
        ts: "1700000000.123456",
      });

      await handleAppMention(event, mockSay);

      // Should successfully process without errors
      expect(mockSay).toHaveBeenCalled();
    });

    it("should handle timestamp with trailing zeros", async () => {
      const event = createMockAppMentionEvent({
        ts: "1234567890.000000",
      });

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalled();
    });

    it("should handle channel ID in different formats", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createEventFromMention } = jest.requireMock("../services/analysisService.js") as any;
      const event = createMockAppMentionEvent({
        channel: "D123456", // Direct message channel
      });

      await handleAppMention(event, mockSay);

      expect(createEventFromMention).toHaveBeenCalledWith(
        event.user,
        "D123456",
        expect.any(String),
        event.ts
      );
    });

    it("should preserve event ID in feedback buttons", async () => {
      const event = createMockAppMentionEvent({
        user: "U789012",
      });

      await handleAppMention(event, mockSay);

      const feedbackCall = mockSay.mock.calls[1]?.[0];
      if (typeof feedbackCall !== "string") {
        const feedbackString = JSON.stringify(feedbackCall?.blocks);
        // Event ID should be in the button values
        expect(feedbackString).toContain("evt_test_");
      }
    });
  });

  describe("edge cases", () => {
    it("should handle say function throwing error in catch block", async () => {
      // First two calls succeed, but the error handler's say call fails
      mockSay
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error("Slack API error"));

      const event = createMockAppMentionEvent();

      // Should succeed since the happy path works
      await expect(handleAppMention(event, mockSay)).resolves.not.toThrow();
    });

    it("should handle very low confidence scores", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      performAnalysis.mockResolvedValueOnce({
        analysis: {
          eventId: "evt_test",
          summary: "Low confidence analysis",
          confidence: "low",
          analyzedAt: new Date().toISOString(),
        },
        confidence: {
          finalScore: 0.15,
          gatingDecision: "block",
          breakdown: {
            baseScore: 0.15,
            uncertaintyAdjustment: 0,
            evidenceAlignment: 0,
            completeness: 0,
            knowledgeBaseValidation: 0,
            consistency: 0,
          },
          reasoning: [],
        },
      });

      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
        })
      );
    });

    it("should handle analysis with no recommended actions", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      performAnalysis.mockResolvedValueOnce({
        analysis: {
          eventId: "evt_test",
          summary: "No actions needed",
          confidence: "high",
          analyzedAt: new Date().toISOString(),
          recommendedActions: [],
        },
        confidence: {
          finalScore: 0.95,
          gatingDecision: "auto_approve",
          breakdown: {
            baseScore: 0.95,
            uncertaintyAdjustment: 0,
            evidenceAlignment: 0,
            completeness: 0,
            knowledgeBaseValidation: 0,
            consistency: 0,
          },
          reasoning: [],
        },
      });

      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalled();
    });

    it("should handle analysis timeout", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      performAnalysis.mockRejectedValueOnce(new Error("Request timeout"));

      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
        })
      );
    });

    it("should handle rate limit errors from analysis service", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { performAnalysis } = jest.requireMock("../services/analysisService.js") as any;
      performAnalysis.mockRejectedValueOnce(new Error("Rate limit exceeded"));

      const event = createMockAppMentionEvent();

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
        })
      );
    });

    it("should handle concurrent mentions", async () => {
      const event1 = createMockAppMentionEvent({ user: "U111111" });
      const event2 = createMockAppMentionEvent({ user: "U222222" });

      await Promise.all([handleAppMention(event1, mockSay), handleAppMention(event2, mockSay)]);

      // Both should complete successfully
      expect(mockSay).toHaveBeenCalledTimes(4); // 2 calls per event
    });

    it("should handle mentions with different text encodings", async () => {
      const event = createMockAppMentionEvent({
        text: "<@U123456> Ñoño تست 测试",
      });

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalled();
    });

    it("should handle event with missing channel", async () => {
      const event = createMockAppMentionEvent({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channel: undefined as any,
      });

      await handleAppMention(event, mockSay);

      expect(mockSay).toHaveBeenCalled();
    });
  });
});
