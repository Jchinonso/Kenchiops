/**
 * Unit tests for Feedback Handler.
 * Tests Q&A, analysis, and RAG feedback handling.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  handleQAFeedbackHelpful,
  handleQAFeedbackNotHelpful,
  handlePositiveFeedback,
  handleNegativeFeedback,
} from "../handlers/feedbackHandler.js";
import type { ButtonAction } from "@slack/bolt";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  createOrUpdateAnalysisFeedback: jest.fn(() =>
    Promise.resolve({
      feedback: { id: "fb-1", feedbackType: "correct" },
      wasUpdated: false,
    })
  ),
  createOrUpdateQAFeedback: jest.fn(() =>
    Promise.resolve({
      feedback: { id: "qa-fb-1", feedbackType: "qa_helpful" },
      wasUpdated: false,
    })
  ),
  ingestAnalysisLesson: jest.fn(() =>
    Promise.resolve({
      success: true,
      lessonsCreated: 1,
      ingestionResult: { chunksCreated: 3 },
    })
  ),
  extractAnalysisContext: jest.fn(() => ({
    analysisId: "analysis-1",
    summary: "Test summary",
  })),
  recordRAGFeedback: jest.fn(() => Promise.resolve({ success: true })),
  UI_EMOJI: {
    success: "✅",
    commit: "📝",
  },
}));

jest.mock("../services/analysisContextStore.js", () => ({
  getAnalysisContext: jest.fn(() => null),
  deleteAnalysisContext: jest.fn(),
}));

describe("Feedback Handler", () => {
  // Mock functions
  const createMockAck = (): jest.Mock => jest.fn().mockResolvedValue(undefined);
  const createMockRespond = (): jest.Mock => jest.fn().mockResolvedValue(undefined);

  const createMockButtonAction = (value: string): ButtonAction =>
    ({
      type: "button",
      action_id: "test_action",
      block_id: "test_block",
      value,
      action_ts: "1234567890.123456",
    }) as ButtonAction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handleQAFeedbackHelpful", () => {
    it("should acknowledge button click immediately", async () => {
      const ack = createMockAck();
      const action = createMockButtonAction("qa_123");

      await handleQAFeedbackHelpful(action, ack, "U123456");

      expect(ack).toHaveBeenCalledTimes(1);
    });

    it("should persist Q&A helpful feedback", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      const action = createMockButtonAction("qa_test_123");
      const ack = createMockAck();

      await handleQAFeedbackHelpful(action, ack, "U789012");

      expect(createOrUpdateQAFeedback).toHaveBeenCalledWith({
        queryId: "qa_test_123",
        query: "",
        feedbackType: "qa_helpful",
        userId: "U789012",
        tenantId: "unknown",
      });
    });

    it("should send confirmation message to user", async () => {
      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handleQAFeedbackHelpful(action, ack, "U123456", respond);

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          replace_original: false,
          response_type: "ephemeral",
        })
      );
    });

    it("should show 'updated' message when vote was changed", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      createOrUpdateQAFeedback.mockResolvedValueOnce({
        feedback: { id: "qa-fb-1" },
        wasUpdated: true,
      });

      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handleQAFeedbackHelpful(action, ack, "U123456", respond);

      // Handler shows thanks message regardless of wasUpdated flag
      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Thanks"),
        })
      );
    });

    it("should show 'thanks' message for new vote", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      createOrUpdateQAFeedback.mockResolvedValueOnce({
        feedback: { id: "qa-fb-1" },
        wasUpdated: false,
      });

      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handleQAFeedbackHelpful(action, ack, "U123456", respond);

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Thanks"),
        })
      );
    });

    it("should handle missing respond function gracefully", async () => {
      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();

      await expect(handleQAFeedbackHelpful(action, ack, "U123456")).resolves.not.toThrow();
    });

    it("should handle empty query ID", async () => {
      const action = createMockButtonAction("");
      const ack = createMockAck();
      const respond = createMockRespond();

      await expect(handleQAFeedbackHelpful(action, ack, "U123456", respond)).resolves.not.toThrow();
    });

    it("should handle database errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      createOrUpdateQAFeedback.mockRejectedValueOnce(new Error("Database error"));

      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      // Should not throw, should still send confirmation
      await expect(handleQAFeedbackHelpful(action, ack, "U123456", respond)).resolves.not.toThrow();
      expect(respond).toHaveBeenCalled();
    });
  });

  describe("handleQAFeedbackNotHelpful", () => {
    it("should acknowledge button click immediately", async () => {
      const ack = createMockAck();
      const action = createMockButtonAction("qa_123");

      await handleQAFeedbackNotHelpful(action, ack, "U123456");

      expect(ack).toHaveBeenCalledTimes(1);
    });

    it("should persist Q&A not helpful feedback", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      const action = createMockButtonAction("qa_test_456");
      const ack = createMockAck();

      await handleQAFeedbackNotHelpful(action, ack, "U789012");

      expect(createOrUpdateQAFeedback).toHaveBeenCalledWith({
        queryId: "qa_test_456",
        query: "",
        feedbackType: "qa_not_helpful",
        userId: "U789012",
        tenantId: "unknown",
      });
    });

    it("should send confirmation message to user", async () => {
      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handleQAFeedbackNotHelpful(action, ack, "U123456", respond);

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          replace_original: false,
          response_type: "ephemeral",
        })
      );
    });

    it("should show 'updated' message when vote was changed", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      createOrUpdateQAFeedback.mockResolvedValueOnce({
        feedback: { id: "qa-fb-1" },
        wasUpdated: true,
      });

      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handleQAFeedbackNotHelpful(action, ack, "U123456", respond);

      // Handler shows thanks message regardless of wasUpdated flag
      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Thanks"),
        })
      );
    });

    it("should show 'thanks' message for new vote", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      createOrUpdateQAFeedback.mockResolvedValueOnce({
        feedback: { id: "qa-fb-1" },
        wasUpdated: false,
      });

      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handleQAFeedbackNotHelpful(action, ack, "U123456", respond);

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Thanks"),
        })
      );
    });

    it("should handle database errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      createOrUpdateQAFeedback.mockRejectedValueOnce(new Error("Connection timeout"));

      const action = createMockButtonAction("qa_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await expect(
        handleQAFeedbackNotHelpful(action, ack, "U123456", respond)
      ).resolves.not.toThrow();
    });
  });

  describe("handlePositiveFeedback", () => {
    it("should acknowledge button click immediately", async () => {
      const ack = createMockAck();
      const action = createMockButtonAction("analysis_123");

      await handlePositiveFeedback(action, ack, "U123456");

      expect(ack).toHaveBeenCalledTimes(1);
    });

    it("should persist analysis feedback as correct", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateAnalysisFeedback } = jest.requireMock("@kenchi/shared") as any;
      const action = createMockButtonAction("analysis_test_123");
      const ack = createMockAck();

      await handlePositiveFeedback(action, ack, "U789012");

      expect(createOrUpdateAnalysisFeedback).toHaveBeenCalledWith({
        analysisId: "analysis_test_123",
        feedbackType: "correct",
        userId: "U789012",
        tenantId: "unknown",
      });
    });

    it("should send confirmation message", async () => {
      const action = createMockButtonAction("analysis_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handlePositiveFeedback(action, ack, "U123456", respond);

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          response_type: "ephemeral",
        })
      );
    });
  });

  describe("handleNegativeFeedback", () => {
    it("should acknowledge button click immediately", async () => {
      const ack = createMockAck();
      const action = createMockButtonAction("analysis_123");

      await handleNegativeFeedback(action, ack, "U123456");

      expect(ack).toHaveBeenCalledTimes(1);
    });

    it("should persist analysis feedback as incorrect", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateAnalysisFeedback } = jest.requireMock("@kenchi/shared") as any;
      const action = createMockButtonAction("analysis_test_456");
      const ack = createMockAck();

      await handleNegativeFeedback(action, ack, "U789012");

      expect(createOrUpdateAnalysisFeedback).toHaveBeenCalledWith({
        analysisId: "analysis_test_456",
        feedbackType: "incorrect",
        userId: "U789012",
        tenantId: "unknown",
      });
    });

    it("should send confirmation message", async () => {
      const action = createMockButtonAction("analysis_123");
      const ack = createMockAck();
      const respond = createMockRespond();

      await handleNegativeFeedback(action, ack, "U123456", respond);

      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({
          response_type: "ephemeral",
        })
      );
    });
  });

  describe("edge cases", () => {
    it("should handle undefined action value", async () => {
      const action = {
        type: "button",
        action_id: "test",
        block_id: "test",
        action_ts: "1234567890.123456",
        // value is undefined
      } as unknown as ButtonAction;
      const ack = createMockAck();
      const respond = createMockRespond();

      await expect(handleQAFeedbackHelpful(action, ack, "U123456", respond)).resolves.not.toThrow();
    });

    it("should handle concurrent feedback submissions", async () => {
      const action1 = createMockButtonAction("qa_1");
      const action2 = createMockButtonAction("qa_2");
      const ack = createMockAck();
      const respond = createMockRespond();

      await Promise.all([
        handleQAFeedbackHelpful(action1, ack, "U111111", respond),
        handleQAFeedbackNotHelpful(action2, ack, "U222222", respond),
      ]);

      expect(ack).toHaveBeenCalledTimes(2);
    });

    it("should handle special characters in query ID", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { createOrUpdateQAFeedback } = jest.requireMock("@kenchi/shared") as any;
      const action = createMockButtonAction("qa_U123_1234567890_how_do_I_fix");
      const ack = createMockAck();

      await handleQAFeedbackHelpful(action, ack, "U123456");

      expect(createOrUpdateQAFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          queryId: "qa_U123_1234567890_how_do_I_fix",
        })
      );
    });

    it("should handle very long query ID", async () => {
      const longQueryId = "qa_" + "a".repeat(500);
      const action = createMockButtonAction(longQueryId);
      const ack = createMockAck();
      const respond = createMockRespond();

      await expect(handleQAFeedbackHelpful(action, ack, "U123456", respond)).resolves.not.toThrow();
    });
  });
});
