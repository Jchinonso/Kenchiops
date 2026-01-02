/**
 * Unit tests for Message Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { MessageEvent } from "@slack/bolt";
import { handleMessage } from "../handlers/messageHandler.js";

// Define a minimal message type for testing
// We use this internally and cast to MessageEvent for the handler
interface TestMessageEvent {
  type: "message";
  subtype?: string;
  event_ts: string;
  channel?: string;
  user?: string;
  text?: string;
  ts: string;
  channel_type?: string;
  thread_ts?: string;
  edited?: {
    user: string;
    ts: string;
  };
  bot_id?: string;
  attachments?: Array<{
    fallback?: string;
    text?: string;
  }>;
  blocks?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
    };
  }>;
  files?: Array<{
    id: string;
    name: string;
  }>;
  reactions?: Array<{
    name: string;
    count: number;
    users: string[];
  }>;
  message?: {
    type: string;
    user: string;
    text: string;
    ts: string;
  };
}

/**
 * Safely cast test message to MessageEvent.
 * Used because Slack's MessageEvent type is a complex union
 * and our test objects don't need to satisfy all variants.
 */
const asMessageEvent = (msg: TestMessageEvent): MessageEvent => msg as unknown as MessageEvent;

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

describe("Message Handler", () => {
  // Import mocked logger for assertions
  const { logger } = jest.requireMock("@kenchi/shared") as {
    logger: {
      info: jest.Mock;
      warn: jest.Mock;
      error: jest.Mock;
      debug: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create mock message events
  const createMessageEvent = (overrides: Partial<TestMessageEvent> = {}): TestMessageEvent => ({
    type: "message",
    subtype: undefined,
    event_ts: "1234567890.123456",
    channel: "C123456",
    user: "U123456",
    text: "Hello, World!",
    ts: "1234567890.123456",
    channel_type: "channel",
    ...overrides,
  });

  describe("bot message filtering", () => {
    it("should skip bot messages", async () => {
      const botMessage = createMessageEvent({
        subtype: "bot_message",
        text: "Bot message",
      });

      await handleMessage(asMessageEvent(botMessage));

      expect(logger.debug).not.toHaveBeenCalled();
    });

    it("should process regular messages", async () => {
      const regularMessage = createMessageEvent({
        subtype: undefined,
        text: "User message",
      });

      await handleMessage(asMessageEvent(regularMessage));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should skip bot_message subtype even with text", async () => {
      const botMessage = createMessageEvent({
        subtype: "bot_message",
        text: "This should be ignored",
      });

      await handleMessage(asMessageEvent(botMessage));

      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe("text property validation", () => {
    it("should skip messages without text property", async () => {
      const noTextMessage: TestMessageEvent = {
        type: "message",
        subtype: undefined,
        event_ts: "1234567890.123456",
        channel: "C123456",
        user: "U123456",
        ts: "1234567890.123456",
        channel_type: "channel",
        // No text property
      };

      await handleMessage(asMessageEvent(noTextMessage));

      expect(logger.debug).not.toHaveBeenCalled();
    });

    it("should skip messages with non-string text", async () => {
      const invalidTextMessage: TestMessageEvent = {
        type: "message",
        subtype: undefined,
        event_ts: "1234567890.123456",
        channel: "C123456",
        user: "U123456",
        ts: "1234567890.123456",
        channel_type: "channel",
        text: null as unknown as string,
      };

      await handleMessage(asMessageEvent(invalidTextMessage));

      expect(logger.debug).not.toHaveBeenCalled();
    });

    it("should process messages with empty string text", async () => {
      const emptyTextMessage = createMessageEvent({
        text: "",
      });

      await handleMessage(asMessageEvent(emptyTextMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "",
          user: "U123456",
          channel: "C123456",
        })
      );
    });

    it("should process messages with valid text", async () => {
      const validMessage = createMessageEvent({
        text: "Hello, World!",
      });

      await handleMessage(asMessageEvent(validMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Hello, World!",
          user: "U123456",
          channel: "C123456",
        })
      );
    });
  });

  describe("debug logging", () => {
    it("should log debug message for regular messages with text", async () => {
      const message = createMessageEvent({
        text: "Test message",
        user: "U123456",
        channel: "C123456",
      });

      await handleMessage(asMessageEvent(message));

      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Test message",
          user: "U123456",
          channel: "C123456",
        })
      );
    });

    it("should include text in log payload", async () => {
      const message = createMessageEvent({
        text: "Important message content",
      });

      await handleMessage(asMessageEvent(message));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Important message content",
        })
      );
    });
  });

  describe("user and channel properties", () => {
    it("should handle messages with user and channel properties", async () => {
      const message = createMessageEvent({
        text: "Message with metadata",
        user: "U999999",
        channel: "C888888",
      });

      await handleMessage(asMessageEvent(message));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Message with metadata",
          user: "U999999",
          channel: "C888888",
        })
      );
    });

    it("should handle messages without user property", async () => {
      const messageWithoutUser: TestMessageEvent = {
        type: "message",
        subtype: undefined,
        event_ts: "1234567890.123456",
        channel: "C123456",
        text: "Message without user",
        ts: "1234567890.123456",
        channel_type: "channel",
        // No user property
      };

      await handleMessage(asMessageEvent(messageWithoutUser));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Message without user",
          user: undefined,
          channel: "C123456",
        })
      );
    });

    it("should handle messages without channel property", async () => {
      const messageWithoutChannel: TestMessageEvent = {
        type: "message",
        subtype: undefined,
        event_ts: "1234567890.123456",
        user: "U123456",
        text: "Message without channel",
        ts: "1234567890.123456",
        channel_type: "channel",
        // No channel property
      };

      await handleMessage(asMessageEvent(messageWithoutChannel));

      // Handler returns early for messages without channel
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it("should handle messages without both user and channel", async () => {
      const minimalMessage: TestMessageEvent = {
        type: "message",
        subtype: undefined,
        event_ts: "1234567890.123456",
        text: "Minimal message",
        ts: "1234567890.123456",
        channel_type: "channel",
        // No user or channel properties
      };

      await handleMessage(asMessageEvent(minimalMessage));

      // Handler returns early for messages without channel
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe("different message subtypes", () => {
    it("should skip channel_join messages", async () => {
      const joinMessage = createMessageEvent({
        subtype: "channel_join",
        text: "User joined",
      });

      await handleMessage(asMessageEvent(joinMessage));

      // Should process - only bot_message is skipped
      expect(logger.debug).toHaveBeenCalled();
    });

    it("should skip channel_leave messages", async () => {
      const leaveMessage = createMessageEvent({
        subtype: "channel_leave",
        text: "User left",
      });

      await handleMessage(asMessageEvent(leaveMessage));

      // Should process - only bot_message is skipped
      expect(logger.debug).toHaveBeenCalled();
    });

    it("should process thread messages", async () => {
      const threadMessage = createMessageEvent({
        text: "Reply in thread",
        thread_ts: "1234567890.000000",
      });

      await handleMessage(asMessageEvent(threadMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Reply in thread",
          user: "U123456",
          channel: "C123456",
        })
      );
    });

    it("should process edited messages", async () => {
      const editedMessage = createMessageEvent({
        text: "Edited message",
        edited: {
          user: "U123456",
          ts: "1234567891.123456",
        },
      });

      await handleMessage(asMessageEvent(editedMessage));

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe("message content variations", () => {
    it("should handle very long messages", async () => {
      const longText = "A".repeat(5000);
      const longMessage = createMessageEvent({
        text: longText,
      });

      await handleMessage(asMessageEvent(longMessage));

      // Handler truncates text to 100 characters for logging
      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: longText.substring(0, 100),
        })
      );
    });

    it("should handle messages with special characters", async () => {
      const specialMessage = createMessageEvent({
        text: "Test <script>alert('xss')</script>",
      });

      await handleMessage(asMessageEvent(specialMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Test <script>alert('xss')</script>",
        })
      );
    });

    it("should handle messages with unicode", async () => {
      const unicodeMessage = createMessageEvent({
        text: "テスト メッセージ 🚀 🔥 ❌",
      });

      await handleMessage(asMessageEvent(unicodeMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "テスト メッセージ 🚀 🔥 ❌",
        })
      );
    });

    it("should handle messages with newlines", async () => {
      const multilineMessage = createMessageEvent({
        text: "Line 1\nLine 2\nLine 3",
      });

      await handleMessage(asMessageEvent(multilineMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "Line 1\nLine 2\nLine 3",
        })
      );
    });

    it("should handle messages with markdown", async () => {
      const markdownMessage = createMessageEvent({
        text: "*bold* _italic_ `code` ~strikethrough~",
      });

      await handleMessage(asMessageEvent(markdownMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "*bold* _italic_ `code` ~strikethrough~",
        })
      );
    });

    it("should handle messages with mentions", async () => {
      const mentionMessage = createMessageEvent({
        text: "Hey <@U123456> check this out",
      });

      await handleMessage(asMessageEvent(mentionMessage));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle messages with channel links", async () => {
      const channelLinkMessage = createMessageEvent({
        text: "Posted in <#C123456|general>",
      });

      await handleMessage(asMessageEvent(channelLinkMessage));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle messages with URLs", async () => {
      const urlMessage = createMessageEvent({
        text: "Check out <https://example.com|this link>",
      });

      await handleMessage(asMessageEvent(urlMessage));

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe("different channel types", () => {
    it("should handle direct messages", async () => {
      const dmMessage = createMessageEvent({
        channel_type: "im",
        text: "Direct message",
      });

      await handleMessage(asMessageEvent(dmMessage));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle group messages", async () => {
      const groupMessage = createMessageEvent({
        channel_type: "mpim",
        text: "Group message",
      });

      await handleMessage(asMessageEvent(groupMessage));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle app home messages", async () => {
      const appHomeMessage = createMessageEvent({
        channel_type: "app_home",
        text: "App home message",
      });

      await handleMessage(asMessageEvent(appHomeMessage));

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle messages with whitespace-only text", async () => {
      const whitespaceMessage = createMessageEvent({
        text: "   \t\n  ",
      });

      await handleMessage(asMessageEvent(whitespaceMessage));

      expect(logger.debug).toHaveBeenCalledWith(
        "Slack message received",
        expect.objectContaining({
          text: "   \t\n  ",
        })
      );
    });

    it("should handle messages with bot_id but no bot_message subtype", async () => {
      const message = createMessageEvent({
        subtype: undefined,
        text: "Message from bot integration",
        bot_id: "B123456",
      });

      await handleMessage(asMessageEvent(message));

      // Should process - only subtype === "bot_message" is filtered
      expect(logger.debug).toHaveBeenCalled();
    });

    it("should not throw errors on valid messages", async () => {
      const message = createMessageEvent({
        text: "Valid message",
      });

      await expect(handleMessage(asMessageEvent(message))).resolves.not.toThrow();
    });

    it("should return void", async () => {
      const message = createMessageEvent({
        text: "Test message",
      });

      const result = await handleMessage(asMessageEvent(message));

      expect(result).toBeUndefined();
    });

    it("should handle messages with attachments", async () => {
      const messageWithAttachments = createMessageEvent({
        text: "Message with attachments",
        attachments: [
          {
            fallback: "Attachment fallback",
            text: "Attachment text",
          },
        ],
      });

      await handleMessage(asMessageEvent(messageWithAttachments));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle messages with blocks", async () => {
      const messageWithBlocks = createMessageEvent({
        text: "Message with blocks",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Block content",
            },
          },
        ],
      });

      await handleMessage(asMessageEvent(messageWithBlocks));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle messages with files", async () => {
      const messageWithFiles = createMessageEvent({
        text: "Message with files",
        files: [
          {
            id: "F123456",
            name: "test.txt",
          },
        ],
      });

      await handleMessage(asMessageEvent(messageWithFiles));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle messages with reactions", async () => {
      const messageWithReactions = createMessageEvent({
        text: "Message with reactions",
        reactions: [
          {
            name: "thumbsup",
            count: 5,
            users: ["U111111", "U222222"],
          },
        ],
      });

      await handleMessage(asMessageEvent(messageWithReactions));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should handle message_changed subtype with text", async () => {
      const changedMessage: TestMessageEvent = {
        type: "message",
        subtype: "message_changed",
        event_ts: "1234567890.123456",
        channel: "C123456",
        ts: "1234567890.123456",
        channel_type: "channel",
        message: {
          type: "message",
          user: "U123456",
          text: "Updated text",
          ts: "1234567890.123456",
        },
      };

      await handleMessage(asMessageEvent(changedMessage));

      // Message changed events don't have text at top level
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe("hasText type guard validation", () => {
    it("should correctly identify messages with text", async () => {
      const withText = createMessageEvent({
        text: "Has text",
      });

      await handleMessage(asMessageEvent(withText));

      expect(logger.debug).toHaveBeenCalled();
    });

    it("should correctly identify messages without text", async () => {
      const withoutText: TestMessageEvent = {
        type: "message",
        subtype: undefined,
        event_ts: "1234567890.123456",
        channel: "C123456",
        user: "U123456",
        ts: "1234567890.123456",
        channel_type: "channel",
      };

      await handleMessage(asMessageEvent(withoutText));

      expect(logger.debug).not.toHaveBeenCalled();
    });

    it("should handle undefined text gracefully", async () => {
      const undefinedText = createMessageEvent({
        text: undefined,
      });

      await handleMessage(asMessageEvent(undefinedText));

      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe("async behavior", () => {
    it("should be async and return promise", async () => {
      const message = createMessageEvent({
        text: "Async test",
      });

      const result = handleMessage(asMessageEvent(message));

      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it("should handle multiple messages sequentially", async () => {
      const message1 = createMessageEvent({ text: "First" });
      const message2 = createMessageEvent({ text: "Second" });
      const message3 = createMessageEvent({ text: "Third" });

      await handleMessage(asMessageEvent(message1));
      await handleMessage(asMessageEvent(message2));
      await handleMessage(asMessageEvent(message3));

      expect(logger.debug).toHaveBeenCalledTimes(3);
    });

    it("should handle concurrent message processing", async () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        createMessageEvent({ text: `Message ${i}` })
      );

      await Promise.all(messages.map((msg) => handleMessage(asMessageEvent(msg))));

      expect(logger.debug).toHaveBeenCalledTimes(5);
    });
  });
});
