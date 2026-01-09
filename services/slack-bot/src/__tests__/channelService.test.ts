/**
 * Unit tests for Channel Service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { resolveChannelId, getBotMemberChannels } from "../services/channelService.js";
import type { SlackChannel } from "../services/channelService.js";

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
    SLACK_CHANNEL_ID_PATTERN: /^[CDG][A-Z0-9]+$/,
    SLACK_API_LIMITS: {
      CONVERSATIONS_LIST_LIMIT: 1000,
    },
  };
});

describe("Channel Service", () => {
  // Mock Slack client - use any type to avoid complex TypeScript issues with jest mocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockClient = (): any => {
    return {
      conversations: {
        list: jest.fn().mockImplementation(() =>
          Promise.resolve({
            channels: [
              { id: "C123456", name: "general", is_member: true },
              { id: "C234567", name: "dev", is_member: true },
              { id: "C345678", name: "random", is_member: false },
            ],
          })
        ),
      },
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    const { logger } = jest.requireMock("@kenchi/shared") as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: any;
    };
    mockLogger = logger;
  });

  describe("resolveChannelId", () => {
    it("should return ID as-is when already a channel ID starting with C", async () => {
      const channelId = "C0A4FFS1086";

      const result = await resolveChannelId(mockClient, channelId);

      expect(result).toBe(channelId);
      expect(mockClient.conversations.list).not.toHaveBeenCalled();
    });

    it("should return ID as-is when already a channel ID starting with D", async () => {
      const channelId = "D0A4FFS1086";

      const result = await resolveChannelId(mockClient, channelId);

      expect(result).toBe(channelId);
      expect(mockClient.conversations.list).not.toHaveBeenCalled();
    });

    it("should return ID as-is when already a channel ID starting with G", async () => {
      const channelId = "G0A4FFS1086";

      const result = await resolveChannelId(mockClient, channelId);

      expect(result).toBe(channelId);
      expect(mockClient.conversations.list).not.toHaveBeenCalled();
    });

    it("should look up channel by name when not an ID", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "general", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "general");

      expect(result).toBe("C123456");
      expect(mockClient.conversations.list).toHaveBeenCalledWith({
        types: "public_channel,private_channel",
        limit: 1000,
      });
    });

    it("should remove leading # from channel name", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "general", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "#general");

      expect(result).toBe("C123456");
      expect(mockClient.conversations.list).toHaveBeenCalled();
    });

    it("should throw NotFoundError when channel not found", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "general", is_member: true }],
      });

      const { NotFoundError } = jest.requireMock("@kenchi/shared") as {
        NotFoundError: new (message: string) => Error;
      };

      await expect(resolveChannelId(mockClient, "nonexistent")).rejects.toThrow(
        new NotFoundError('Channel "nonexistent" not found')
      );
    });

    it("should throw NotFoundError when channel has no ID", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ name: "general", is_member: true }],
      });

      const { NotFoundError } = jest.requireMock("@kenchi/shared") as {
        NotFoundError: new (message: string) => Error;
      };

      await expect(resolveChannelId(mockClient, "general")).rejects.toThrow(
        new NotFoundError('Channel "general" not found')
      );
    });

    it("should throw NotFoundError when channels list is empty", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [],
      });

      const { NotFoundError } = jest.requireMock("@kenchi/shared") as {
        NotFoundError: new (message: string) => Error;
      };

      await expect(resolveChannelId(mockClient, "general")).rejects.toThrow(
        new NotFoundError('Channel "general" not found')
      );
    });

    it("should throw NotFoundError when channels is undefined", async () => {
      mockClient.conversations.list.mockResolvedValue({});

      const { NotFoundError } = jest.requireMock("@kenchi/shared") as {
        NotFoundError: new (message: string) => Error;
      };

      await expect(resolveChannelId(mockClient, "general")).rejects.toThrow(
        new NotFoundError('Channel "general" not found')
      );
    });

    it("should log resolved channel info", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "general", is_member: true }],
      });

      await resolveChannelId(mockClient, "general");

      expect(mockLogger.info).toHaveBeenCalledWith("Resolved channel name to ID", {
        channelName: "general",
        channelId: "C123456",
      });
    });

    it("should log error and re-throw on API failure", async () => {
      const apiError = new Error("Slack API error");
      mockClient.conversations.list.mockRejectedValue(apiError);

      await expect(resolveChannelId(mockClient, "general")).rejects.toThrow("Slack API error");

      expect(mockLogger.error).toHaveBeenCalledWith("Failed to resolve channel name", {
        channelName: "general",
        error: "Slack API error",
      });
    });

    it("should handle non-Error exceptions gracefully", async () => {
      mockClient.conversations.list.mockRejectedValue("String error");

      await expect(resolveChannelId(mockClient, "general")).rejects.toBe("String error");

      expect(mockLogger.error).toHaveBeenCalledWith("Failed to resolve channel name", {
        channelName: "general",
        error: "Unknown error",
      });
    });

    it("should match channel name case-sensitively", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "general", is_member: true },
          { id: "C234567", name: "General", is_member: true },
        ],
      });

      const result = await resolveChannelId(mockClient, "General");

      expect(result).toBe("C234567");
    });

    it("should handle channel names with special characters", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "team-alpha", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "#team-alpha");

      expect(result).toBe("C123456");
    });

    it("should handle channel names with numbers", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "channel-123", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "channel-123");

      expect(result).toBe("C123456");
    });

    it("should handle channel names with underscores", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "dev_team", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "dev_team");

      expect(result).toBe("C123456");
    });

    it("should not remove # from middle of channel name", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "channel#1", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "#channel#1");

      expect(result).toBe("C123456");
    });

    it("should only remove first # symbol at start", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "##general", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "###general");

      expect(result).toBe("C123456");
    });

    it("should find channel when it is the only one in list", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "only-channel", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "only-channel");

      expect(result).toBe("C123456");
    });

    it("should find channel when it is the last one in list", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "first", is_member: true },
          { id: "C234567", name: "second", is_member: true },
          { id: "C345678", name: "target", is_member: true },
        ],
      });

      const result = await resolveChannelId(mockClient, "target");

      expect(result).toBe("C345678");
    });

    it("should not match partial channel names", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "general-discussion", is_member: true }],
      });

      const { NotFoundError } = jest.requireMock("@kenchi/shared") as {
        NotFoundError: new (message: string) => Error;
      };

      await expect(resolveChannelId(mockClient, "general")).rejects.toThrow(
        new NotFoundError('Channel "general" not found')
      );
    });
  });

  describe("getBotMemberChannels", () => {
    it("should return only channels where bot is member", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "general", is_member: true },
          { id: "C234567", name: "dev", is_member: true },
          { id: "C345678", name: "random", is_member: false },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { id: "C123456", name: "general", is_member: true },
        { id: "C234567", name: "dev", is_member: true },
      ]);
    });

    it("should handle empty channel list", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it("should filter out channels where is_member is false", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "channel1", is_member: false },
          { id: "C234567", name: "channel2", is_member: false },
          { id: "C345678", name: "channel3", is_member: false },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(0);
    });

    it("should handle undefined channels list", async () => {
      mockClient.conversations.list.mockResolvedValue({});

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it("should handle null channels list", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: null,
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it("should filter out channels where is_member is undefined", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "channel1", is_member: true },
          { id: "C234567", name: "channel2" }, // is_member undefined
          { id: "C345678", name: "channel3", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { id: "C123456", name: "channel1", is_member: true },
        { id: "C345678", name: "channel3", is_member: true },
      ]);
    });

    it("should filter out channels where is_member is null", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "channel1", is_member: true },
          { id: "C234567", name: "channel2", is_member: null },
          { id: "C345678", name: "channel3", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(2);
    });

    it("should call conversations.list with correct parameters", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [],
      });

      await getBotMemberChannels(mockClient);

      expect(mockClient.conversations.list).toHaveBeenCalledWith({
        types: "public_channel,private_channel",
        limit: 1000,
      });
    });

    it("should return all channels when all are member channels", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "channel1", is_member: true },
          { id: "C234567", name: "channel2", is_member: true },
          { id: "C345678", name: "channel3", is_member: true },
          { id: "C456789", name: "channel4", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(4);
    });

    it("should preserve channel properties", async () => {
      const channels: SlackChannel[] = [
        { id: "C123456", name: "general", is_member: true },
        { id: "C234567", name: "dev", is_member: true },
      ];

      mockClient.conversations.list.mockResolvedValue({ channels });

      const result = await getBotMemberChannels(mockClient);

      expect(result[0]).toEqual(channels[0]);
      expect(result[1]).toEqual(channels[1]);
    });

    it("should handle channels with missing id", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { name: "channel1", is_member: true }, // missing id
          { id: "C234567", name: "channel2", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "channel1", is_member: true });
      expect(result[1]).toEqual({ id: "C234567", name: "channel2", is_member: true });
    });

    it("should handle channels with missing name", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", is_member: true }, // missing name
          { id: "C234567", name: "channel2", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "C123456", is_member: true });
      expect(result[1]).toEqual({ id: "C234567", name: "channel2", is_member: true });
    });

    it("should handle large number of channels", async () => {
      const channels = Array.from({ length: 100 }, (_, i) => ({
        id: `C${i.toString().padStart(6, "0")}`,
        name: `channel-${i}`,
        is_member: i % 2 === 0, // Every other channel
      }));

      mockClient.conversations.list.mockResolvedValue({ channels });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(50);
      expect(result.every((channel) => channel.is_member === true)).toBe(true);
    });

    it("should handle API errors", async () => {
      mockClient.conversations.list.mockRejectedValue(new Error("API error"));

      await expect(getBotMemberChannels(mockClient)).rejects.toThrow("API error");
    });

    it("should handle channels with is_member as 0 (falsy)", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "channel1", is_member: 0 as unknown as boolean },
          { id: "C234567", name: "channel2", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      // Should only include channel with is_member: true
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("C234567");
    });

    it("should handle channels with is_member as 1 (truthy but not true)", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "channel1", is_member: 1 as unknown as boolean },
          { id: "C234567", name: "channel2", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      // Should only include channel with is_member: true (strict equality)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("C234567");
    });

    it("should handle mixed is_member values", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C123456", name: "channel1", is_member: true },
          { id: "C234567", name: "channel2", is_member: false },
          { id: "C345678", name: "channel3", is_member: undefined },
          { id: "C456789", name: "channel4", is_member: null },
          { id: "C567890", name: "channel5", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("C123456");
      expect(result[1].id).toBe("C567890");
    });

    it("should return channels in same order as API response", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [
          { id: "C999999", name: "zzz", is_member: true },
          { id: "C111111", name: "aaa", is_member: true },
          { id: "C555555", name: "mmm", is_member: true },
        ],
      });

      const result = await getBotMemberChannels(mockClient);

      expect(result[0].id).toBe("C999999");
      expect(result[1].id).toBe("C111111");
      expect(result[2].id).toBe("C555555");
    });
  });

  describe("edge cases", () => {
    it("should handle very long channel names", async () => {
      const longName = "a".repeat(100);
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: longName, is_member: true }],
      });

      const result = await resolveChannelId(mockClient, longName);

      expect(result).toBe("C123456");
    });

    it("should handle channel names with unicode characters", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "チャンネル", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "チャンネル");

      expect(result).toBe("C123456");
    });

    it("should handle channel IDs with different case patterns", async () => {
      const channelId = "C123ABC789DEF";

      const result = await resolveChannelId(mockClient, channelId);

      expect(result).toBe(channelId);
    });

    it("should not match channel ID pattern for lowercase letters", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "c123abc", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "c123abc");

      expect(result).toBe("C123456");
      expect(mockClient.conversations.list).toHaveBeenCalled();
    });

    it("should handle whitespace in channel lookup", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "  general  ", is_member: true }],
      });

      const { NotFoundError } = jest.requireMock("@kenchi/shared") as {
        NotFoundError: new (message: string) => Error;
      };

      // Should not find because "general" !== "  general  "
      await expect(resolveChannelId(mockClient, "general")).rejects.toThrow(
        new NotFoundError('Channel "general" not found')
      );
    });

    it("should handle empty string as channel name", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "general", is_member: true }],
      });

      const { NotFoundError } = jest.requireMock("@kenchi/shared") as {
        NotFoundError: new (message: string) => Error;
      };

      await expect(resolveChannelId(mockClient, "")).rejects.toThrow(
        new NotFoundError('Channel "" not found')
      );
    });

    it("should handle only # as channel name", async () => {
      mockClient.conversations.list.mockResolvedValue({
        channels: [{ id: "C123456", name: "", is_member: true }],
      });

      const result = await resolveChannelId(mockClient, "#");

      expect(result).toBe("C123456");
    });

    it("should handle timeout errors from Slack API", async () => {
      const timeoutError = new Error("Request timeout");
      mockClient.conversations.list.mockRejectedValue(timeoutError);

      await expect(resolveChannelId(mockClient, "general")).rejects.toThrow("Request timeout");
    });

    it("should handle rate limit errors from Slack API", async () => {
      const rateLimitError = new Error("rate_limited");
      mockClient.conversations.list.mockRejectedValue(rateLimitError);

      await expect(getBotMemberChannels(mockClient)).rejects.toThrow("rate_limited");
    });

    it("should throw error on malformed API response", async () => {
      mockClient.conversations.list.mockResolvedValue(null);

      await expect(getBotMemberChannels(mockClient)).rejects.toThrow();
    });

    it("should handle API returning string instead of object", async () => {
      mockClient.conversations.list.mockResolvedValue("invalid response");

      const result = await getBotMemberChannels(mockClient);

      expect(result).toEqual([]);
    });
  });
});
