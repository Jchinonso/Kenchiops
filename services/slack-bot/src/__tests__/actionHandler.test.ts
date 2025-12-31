/**
 * Unit tests for Action Handler
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { ButtonAction, SayFn } from "@slack/bolt";
import {
  handleActionApproval,
  handleActionRejection,
  handlePositiveFeedback,
  handleNegativeFeedback,
} from "../handlers/actionHandler.js";

// Track mock state for isRedisHealthy
let mockRedisHealthy = false;
let mockExecuteActionResult = { success: true, message: "Action executed", duration: 100 };

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  // Create mock logger inside the factory to avoid hoisting issues
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return {
    ...actual,
    createLogger: jest.fn(() => mockLogger),
    mockLogger, // Export it so we can access it in tests
    UI_CONSTANTS: {
      ACTION_TIMEOUT_MS: 2000,
    },
    isRedisHealthy: jest.fn(() => Promise.resolve(mockRedisHealthy)),
    executeAction: jest.fn(() => Promise.resolve(mockExecuteActionResult)),
    enqueueAction: jest.fn(() => Promise.resolve()),
    createAnalysisFeedback: jest.fn(() =>
      Promise.resolve({
        id: "feedback_123",
        analysisId: "event-123",
        feedbackType: "correct",
        userId: "user_123",
        createdAt: new Date().toISOString(),
      })
    ),
  };
});

jest.mock("../formatters.js", () => ({
  formatProgressUpdate: jest.fn((actionId, status, message) => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${status} ${actionId} ${message}`,
      },
    },
  ]),
}));

describe("Action Handler", () => {
  let mockAck: jest.MockedFunction<() => Promise<void>>;
  let mockSay: jest.MockedFunction<SayFn>;
  // Get the mockLogger from the mocked module
  const { mockLogger } = jest.requireMock("@kenchi/shared") as {
    mockLogger: {
      info: jest.MockedFunction<(...args: unknown[]) => void>;
      warn: jest.MockedFunction<(...args: unknown[]) => void>;
      error: jest.MockedFunction<(...args: unknown[]) => void>;
      debug: jest.MockedFunction<(...args: unknown[]) => void>;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAck = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSay = jest.fn<SayFn>().mockResolvedValue(undefined as any);

    // Reset mock state
    mockRedisHealthy = false;
    mockExecuteActionResult = { success: true, message: "Action executed", duration: 100 };
  });

  afterEach(() => {
    // Only run pending timers if fake timers are active
    // This check prevents errors when tests use real timers
    try {
      jest.runOnlyPendingTimers();
    } catch {
      // Fake timers not active, ignore
    }
    jest.useRealTimers();
  });

  const createMockAction = (value: string, actionId: string = "test_action_123"): ButtonAction => ({
    type: "button",
    action_id: actionId,
    block_id: "block_123",
    text: {
      type: "plain_text",
      text: "Test Button",
      emoji: true,
    },
    value,
    action_ts: "1234567890.123456",
  });

  /**
   * Create a new-format ActionButtonValue
   */
  const createActionButtonValue = (
    overrides: Partial<{
      actionId: string;
      actionType: string;
      description: string;
      repository: string;
      commitSha: string;
      installationId: number;
      priority: string | number;
      checkRunId?: number;
    }> = {}
  ): string =>
    JSON.stringify({
      actionId: "act_123",
      actionType: "rerun_pipeline",
      description: "Rerun failed pipeline",
      repository: "owner/repo",
      commitSha: "abc123def456",
      installationId: 12345,
      priority: "high",
      ...overrides,
    });

  describe("handleActionApproval", () => {
    it("should acknowledge the action immediately", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalledTimes(1);
    });

    it("should parse action value correctly", async () => {
      const actionValue = { eventId: "event-123", actionId: "action-456" };
      const action = createMockAction(JSON.stringify(actionValue));

      await handleActionApproval(action, mockAck, mockSay);

      // Should call say with in_progress message
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
        })
      );
    });

    it("should post in_progress message immediately", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };

      await handleActionApproval(action, mockAck, mockSay);

      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "action-456",
        "in_progress",
        "Action approved and executing..."
      );
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
        })
      );
    });

    it("should post completed message after timeout", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };

      await handleActionApproval(action, mockAck, mockSay);

      // Fast-forward time past ACTION_TIMEOUT_MS (2000ms)
      jest.advanceTimersByTime(2000);

      // Wait for promise to resolve
      await Promise.resolve();

      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "action-456",
        "completed",
        "Action completed successfully"
      );
      expect(mockSay).toHaveBeenCalledTimes(2);
    });

    it("should include thread_ts when provided", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      const messageTs = "1234567890.123456";

      await handleActionApproval(action, mockAck, mockSay, messageTs);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: messageTs,
        })
      );
    });

    it("should handle missing action value", async () => {
      const action = createMockAction("");

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      // Should not crash, errors handled internally
    });

    it("should handle invalid JSON in action value", async () => {
      const action = createMockAction("invalid-json{");

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action approval",
        expect.any(Object)
      );
    });

    it("should warn when say function is not available", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );

      await handleActionApproval(action, mockAck, undefined);

      expect(mockAck).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Say function not available for action approval"
      );
    });

    it("should handle say function errors gracefully", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      mockSay.mockRejectedValue(new Error("Slack API error"));

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action approval",
        expect.objectContaining({
          error: "Slack API error",
        })
      );
    });

    it("should log action approval with action_id", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" }),
        "approve_action_456"
      );

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockLogger.info).toHaveBeenCalledWith("Action approval received", {
        action_id: "approve_action_456",
      });
    });

    it("should not post completed message if say is undefined initially", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );

      // Call with undefined say function
      await handleActionApproval(action, mockAck, undefined);

      // Fast-forward time
      jest.advanceTimersByTime(2000);
      await Promise.resolve();

      // Say should not have been called since it was undefined
      expect(mockSay).not.toHaveBeenCalled();
    });
  });

  describe("handleActionApproval with ActionButtonValue format", () => {
    it("should execute action synchronously when Redis is unavailable", async () => {
      jest.useRealTimers(); // Use real timers for this test
      const action = createMockAction(createActionButtonValue());
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };
      const { executeAction, isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        executeAction: jest.MockedFunction<
          () => Promise<{ success: boolean; message: string; duration: number }>
        >;
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(false);
      executeAction.mockResolvedValue({ success: true, message: "Action executed", duration: 100 });

      await handleActionApproval(action, mockAck, mockSay);

      // Should show in_progress then completed
      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "act_123",
        "in_progress",
        expect.stringContaining("Executing")
      );
      expect(executeAction).toHaveBeenCalled();
      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "act_123",
        "completed",
        expect.stringContaining("executed successfully")
      );
      expect(mockSay).toHaveBeenCalledTimes(2);
    });

    it("should enqueue action when Redis is healthy", async () => {
      jest.useRealTimers();
      mockRedisHealthy = true;
      const action = createMockAction(createActionButtonValue());
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };
      const { enqueueAction, isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        enqueueAction: jest.MockedFunction<() => Promise<void>>;
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(true);

      await handleActionApproval(action, mockAck, mockSay);

      expect(enqueueAction).toHaveBeenCalled();
      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "act_123",
        "in_progress",
        expect.stringContaining("Queued")
      );
      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "act_123",
        "completed",
        expect.stringContaining("queued for processing")
      );
    });

    it("should handle failed action execution", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue());
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };
      const { executeAction, isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        executeAction: jest.MockedFunction<
          () => Promise<{ success: boolean; message: string; duration: number }>
        >;
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(false);
      executeAction.mockResolvedValue({
        success: false,
        message: "Pipeline not found",
        duration: 50,
      });

      await handleActionApproval(action, mockAck, mockSay);

      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "act_123",
        "failed",
        expect.stringContaining("failed")
      );
    });

    it("should include checkRunId in execution context when provided", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue({ checkRunId: 99999 }));
      const { executeAction, isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        executeAction: jest.MockedFunction<
          () => Promise<{ success: boolean; message: string; duration: number }>
        >;
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(false);
      executeAction.mockResolvedValue({ success: true, message: "Success", duration: 100 });

      await handleActionApproval(action, mockAck, mockSay);

      expect(executeAction).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          checkRunId: 99999,
        })
      );
    });

    it("should send error message to Slack when action fails with error", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue());
      const { executeAction, isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        executeAction: jest.MockedFunction<
          () => Promise<{ success: boolean; message: string; duration: number }>
        >;
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(false);
      executeAction.mockRejectedValue(new Error("Execution failed"));

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action approval",
        expect.objectContaining({
          error: "Execution failed",
        })
      );
      // Should try to send error message
      expect(mockSay).toHaveBeenCalled();
    });

    it("should handle isRedisHealthy throwing an error", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue());
      const { isRedisHealthy, executeAction } = jest.requireMock("@kenchi/shared") as {
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
        executeAction: jest.MockedFunction<
          () => Promise<{ success: boolean; message: string; duration: number }>
        >;
      };

      isRedisHealthy.mockRejectedValue(new Error("Redis connection error"));

      await handleActionApproval(action, mockAck, mockSay);

      // Should fall back to sync execution
      expect(executeAction).toHaveBeenCalled();
    });

    it("should include thread_ts in messages when provided", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue());
      const messageTs = "1234567890.999999";
      const { isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(false);

      await handleActionApproval(action, mockAck, mockSay, messageTs);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: messageTs,
        })
      );
    });

    it("should handle different action types", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue({ actionType: "notify_team" }));
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };
      const { isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(false);

      await handleActionApproval(action, mockAck, mockSay);

      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "act_123",
        "in_progress",
        expect.stringContaining("notify_team")
      );
    });

    it("should log action execution details on success", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue());
      const { isRedisHealthy, executeAction } = jest.requireMock("@kenchi/shared") as {
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
        executeAction: jest.MockedFunction<
          () => Promise<{ success: boolean; message: string; duration: number }>
        >;
      };

      isRedisHealthy.mockResolvedValue(false);
      executeAction.mockResolvedValue({ success: true, message: "Done", duration: 100 });

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Action executed synchronously",
        expect.objectContaining({
          actionId: "act_123",
          actionType: "rerun_pipeline",
          success: true,
        })
      );
    });

    it("should handle failed say call gracefully in error handler", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue());
      const { executeAction, isRedisHealthy } = jest.requireMock("@kenchi/shared") as {
        executeAction: jest.MockedFunction<
          () => Promise<{ success: boolean; message: string; duration: number }>
        >;
        isRedisHealthy: jest.MockedFunction<() => Promise<boolean>>;
      };

      isRedisHealthy.mockResolvedValue(false);
      executeAction.mockRejectedValue(new Error("Execution failed"));
      // First call is for in_progress message, second is for error message
      mockSay
        .mockResolvedValueOnce(undefined as never)
        .mockRejectedValueOnce(new Error("Say failed in error handler"));

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to send error message to Slack",
        expect.any(Object)
      );
    });
  });

  describe("handleActionRejection with ActionButtonValue format", () => {
    it("should handle new action button value format", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue());
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };

      await handleActionRejection(action, mockAck, mockSay);

      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "act_123",
        "failed",
        expect.stringContaining("rerun_pipeline")
      );
    });

    it("should log rejection details for new format", async () => {
      jest.useRealTimers();
      const action = createMockAction(createActionButtonValue({ actionType: "notify_team" }));

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Action rejection handled",
        expect.objectContaining({
          actionId: "act_123",
          actionType: "notify_team",
        })
      );
    });
  });

  describe("handleActionRejection", () => {
    it("should acknowledge the action immediately", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalledTimes(1);
    });

    it("should parse action value correctly", async () => {
      const actionValue = { eventId: "event-123", actionId: "action-456" };
      const action = createMockAction(JSON.stringify(actionValue));

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
        })
      );
    });

    it("should post failed message", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };

      await handleActionRejection(action, mockAck, mockSay);

      // Legacy format shows "action" as the action type
      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "action-456",
        "failed",
        "Action *action* dismissed by user"
      );
    });

    it("should include thread_ts when provided", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      const messageTs = "1234567890.123456";

      await handleActionRejection(action, mockAck, mockSay, messageTs);

      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: messageTs,
        })
      );
    });

    it("should handle missing action value", async () => {
      const action = createMockAction("");

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      // Should not crash, errors handled internally
    });

    it("should handle invalid JSON in action value", async () => {
      const action = createMockAction("not-valid-json");

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action rejection",
        expect.any(Object)
      );
    });

    it("should warn when say function is not available", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );

      await handleActionRejection(action, mockAck, undefined);

      expect(mockAck).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Say function not available for action rejection"
      );
    });

    it("should handle say function errors gracefully", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      mockSay.mockRejectedValue(new Error("Slack API error"));

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action rejection",
        expect.objectContaining({
          error: "Slack API error",
        })
      );
    });

    it("should log action rejection with action_id", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" }),
        "reject_action_456"
      );

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockLogger.info).toHaveBeenCalledWith("Action rejected", {
        action_id: "reject_action_456",
      });
    });
  });

  describe("handlePositiveFeedback", () => {
    const testUserId = "user_123";

    it("should acknowledge the action immediately", async () => {
      const action = createMockAction("event-123");

      await handlePositiveFeedback(action, mockAck, testUserId);

      expect(mockAck).toHaveBeenCalledTimes(1);
    });

    it("should log positive feedback with analysisId and userId", async () => {
      const action = createMockAction("event-456");

      await handlePositiveFeedback(action, mockAck, testUserId);

      expect(mockLogger.info).toHaveBeenCalledWith("Positive feedback received", {
        analysisId: "event-456",
        userId: testUserId,
      });
    });

    it("should handle empty action value", async () => {
      const action = createMockAction("");

      await handlePositiveFeedback(action, mockAck, testUserId);

      expect(mockAck).toHaveBeenCalled();
      // Should not crash
    });

    it("should handle action with special characters in value", async () => {
      const action = createMockAction("event-123-<special>");

      await handlePositiveFeedback(action, mockAck, testUserId);

      expect(mockLogger.info).toHaveBeenCalledWith("Positive feedback received", {
        analysisId: "event-123-<special>",
        userId: testUserId,
      });
    });

    it("should not throw error if ack fails", async () => {
      const action = createMockAction("event-123");
      mockAck.mockRejectedValue(new Error("Ack failed"));

      await expect(handlePositiveFeedback(action, mockAck, testUserId)).rejects.toThrow(
        "Ack failed"
      );
    });
  });

  describe("handleNegativeFeedback", () => {
    const testUserId = "user_456";

    it("should acknowledge the action immediately", async () => {
      const action = createMockAction("event-123");

      await handleNegativeFeedback(action, mockAck, testUserId);

      expect(mockAck).toHaveBeenCalledTimes(1);
    });

    it("should log negative feedback with analysisId and userId", async () => {
      const action = createMockAction("event-789");

      await handleNegativeFeedback(action, mockAck, testUserId);

      expect(mockLogger.info).toHaveBeenCalledWith("Negative feedback received", {
        analysisId: "event-789",
        userId: testUserId,
      });
    });

    it("should handle empty action value", async () => {
      const action = createMockAction("");

      await handleNegativeFeedback(action, mockAck, testUserId);

      expect(mockAck).toHaveBeenCalled();
      // Should not crash
    });

    it("should handle action with special characters in value", async () => {
      const action = createMockAction("event-999-@#$%");

      await handleNegativeFeedback(action, mockAck, testUserId);

      expect(mockLogger.info).toHaveBeenCalledWith("Negative feedback received", {
        analysisId: "event-999-@#$%",
        userId: testUserId,
      });
    });

    it("should not throw error if ack fails", async () => {
      const action = createMockAction("event-123");
      mockAck.mockRejectedValue(new Error("Ack failed"));

      await expect(handleNegativeFeedback(action, mockAck, testUserId)).rejects.toThrow(
        "Ack failed"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle action with missing action_id", async () => {
      const action = {
        ...createMockAction(JSON.stringify({ eventId: "event-123", actionId: "action-456" })),
        action_id: "",
      };

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      // Should not crash
    });

    it("should handle action with very long action value", async () => {
      const longValue = JSON.stringify({
        eventId: "event-" + "x".repeat(1000),
        actionId: "action-" + "y".repeat(1000),
      });
      const action = createMockAction(longValue);

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
    });

    it("should handle action with unicode characters in value", async () => {
      const action = createMockAction("event-テスト-🚀");

      await handlePositiveFeedback(action, mockAck, "user_123");

      expect(mockAck).toHaveBeenCalled();
    });

    it("should handle concurrent action approvals", async () => {
      const action1 = createMockAction(
        JSON.stringify({ eventId: "event-1", actionId: "action-1" }),
        "action_1"
      );
      const action2 = createMockAction(
        JSON.stringify({ eventId: "event-2", actionId: "action-2" }),
        "action_2"
      );

      await Promise.all([
        handleActionApproval(action1, mockAck, mockSay),
        handleActionApproval(action2, mockAck, mockSay),
      ]);

      expect(mockAck).toHaveBeenCalledTimes(2);
      expect(mockSay).toHaveBeenCalledTimes(2);
    });

    it("should handle action with null values in JSON", async () => {
      const action = createMockAction(JSON.stringify({ eventId: null, actionId: null }));

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
    });

    it("should handle action with undefined value property", async () => {
      const action = {
        ...createMockAction("test"),
        value: undefined as unknown as string,
      };

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      // Should handle ValidationError for missing value
    });

    it("should handle multiple rejections in sequence", async () => {
      const action1 = createMockAction(
        JSON.stringify({ eventId: "event-1", actionId: "action-1" })
      );
      const action2 = createMockAction(
        JSON.stringify({ eventId: "event-2", actionId: "action-2" })
      );

      await handleActionRejection(action1, mockAck, mockSay);
      await handleActionRejection(action2, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalledTimes(2);
      expect(mockSay).toHaveBeenCalledTimes(2);
    });

    it("should handle feedback with very long event IDs", async () => {
      const longEventId = "event-" + "a".repeat(10000);
      const action = createMockAction(longEventId);

      await handlePositiveFeedback(action, mockAck, "user_123");

      expect(mockAck).toHaveBeenCalled();
    });
  });

  describe("error handling paths", () => {
    it("should catch and log errors from parseActionValue in approval", async () => {
      const action = createMockAction("{malformed json");

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action approval",
        expect.objectContaining({
          error: expect.stringContaining("Failed to parse action value"),
        })
      );
    });

    it("should catch and log errors from parseActionValue in rejection", async () => {
      const action = createMockAction("{{invalid}}");

      await handleActionRejection(action, mockAck, mockSay);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action rejection",
        expect.objectContaining({
          error: expect.stringContaining("Failed to parse action value"),
        })
      );
    });

    it("should include stack trace in error logs", async () => {
      const action = createMockAction("invalid");

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error handling action approval",
        expect.objectContaining({
          stack: expect.any(String),
        })
      );
    });

    it("should handle non-Error exceptions gracefully", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      mockSay.mockRejectedValue("string error");

      await handleActionApproval(action, mockAck, mockSay);

      expect(mockAck).toHaveBeenCalled();
      // Should not crash even with non-Error exception
    });

    it("should continue execution even if logging fails", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      mockLogger.info.mockImplementationOnce(() => {
        throw new Error("Logger failed");
      });

      // Should throw due to logger error in info call
      await expect(handleActionApproval(action, mockAck, mockSay)).rejects.toThrow("Logger failed");
    });
  });

  describe("timeout behavior", () => {
    it("should complete action after exact timeout duration", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };

      await handleActionApproval(action, mockAck, mockSay);

      // Clear previous calls
      formatProgressUpdate.mockClear();

      // Advance time by exactly 2000ms
      jest.advanceTimersByTime(2000);
      await Promise.resolve();

      expect(formatProgressUpdate).toHaveBeenCalledWith(
        "action-456",
        "completed",
        "Action completed successfully"
      );
    });

    it("should not complete action before timeout", async () => {
      const action = createMockAction(
        JSON.stringify({ eventId: "event-123", actionId: "action-456" })
      );
      const { formatProgressUpdate } = jest.requireMock("../formatters.js") as {
        formatProgressUpdate: jest.MockedFunction<
          typeof import("../formatters.js").formatProgressUpdate
        >;
      };

      await handleActionApproval(action, mockAck, mockSay);

      // Clear the in_progress call
      formatProgressUpdate.mockClear();

      // Advance time by less than timeout
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should not have called completed yet
      expect(formatProgressUpdate).not.toHaveBeenCalledWith(
        "action-456",
        "completed",
        "Action completed successfully"
      );
    });

    it("should handle multiple timeouts independently", async () => {
      const action1 = createMockAction(
        JSON.stringify({ eventId: "event-1", actionId: "action-1" }),
        "action_1"
      );
      const action2 = createMockAction(
        JSON.stringify({ eventId: "event-2", actionId: "action-2" }),
        "action_2"
      );

      await handleActionApproval(action1, mockAck, mockSay);
      await handleActionApproval(action2, mockAck, mockSay);

      // Advance time
      jest.advanceTimersByTime(2000);
      await Promise.resolve();

      // Both should complete
      expect(mockSay).toHaveBeenCalledTimes(4); // 2 in_progress + 2 completed
    });
  });
});
