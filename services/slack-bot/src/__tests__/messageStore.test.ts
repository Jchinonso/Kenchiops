/**
 * Unit tests for Message Store
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  buildMessageKey,
  getMessage,
  setMessage,
  deleteMessage,
  cleanupMessageStore,
  getStoreSize,
  clearStore,
  type StoredMessage,
} from "../services/messageStore.js";

// Mock logger
jest.mock("@kenchi/shared", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  MESSAGE_STORE_CONFIG: {
    MAX_AGE_MS: 3600000, // 1 hour
    CLEANUP_INTERVAL_MS: 300000, // 5 minutes
  },
}));

describe("Message Store", () => {
  beforeEach(() => {
    clearStore();
    jest.clearAllMocks();
  });

  describe("buildMessageKey", () => {
    it("should create key from repository and commit SHA", () => {
      const key = buildMessageKey("owner/repo", "abc123");
      expect(key).toBe("owner/repo:abc123");
    });

    it("should handle repository with special characters", () => {
      const key = buildMessageKey("my-org/my-repo", "def456");
      expect(key).toBe("my-org/my-repo:def456");
    });

    it("should handle full commit SHA", () => {
      const sha = "a1b2c3d4e5f6789012345678901234567890abcd";
      const key = buildMessageKey("owner/repo", sha);
      expect(key).toBe(`owner/repo:${sha}`);
    });
  });

  describe("setMessage and getMessage", () => {
    it("should store and retrieve a message", () => {
      const message: StoredMessage = {
        channelId: "C123456",
        timestamp: "1234567890.123456",
        postedAt: new Date(),
      };

      setMessage("owner/repo:abc123", message);
      const retrieved = getMessage("owner/repo:abc123");

      expect(retrieved).toEqual(message);
    });

    it("should return undefined for non-existent key", () => {
      const retrieved = getMessage("non-existent-key");
      expect(retrieved).toBeUndefined();
    });

    it("should overwrite existing message with same key", () => {
      const message1: StoredMessage = {
        channelId: "C111111",
        timestamp: "1111111111.111111",
        postedAt: new Date(),
      };

      const message2: StoredMessage = {
        channelId: "C222222",
        timestamp: "2222222222.222222",
        postedAt: new Date(),
      };

      setMessage("key", message1);
      setMessage("key", message2);

      const retrieved = getMessage("key");
      expect(retrieved?.channelId).toBe("C222222");
    });

    it("should store multiple messages with different keys", () => {
      const message1: StoredMessage = {
        channelId: "C111111",
        timestamp: "1111111111.111111",
        postedAt: new Date(),
      };

      const message2: StoredMessage = {
        channelId: "C222222",
        timestamp: "2222222222.222222",
        postedAt: new Date(),
      };

      setMessage("key1", message1);
      setMessage("key2", message2);

      expect(getMessage("key1")?.channelId).toBe("C111111");
      expect(getMessage("key2")?.channelId).toBe("C222222");
    });
  });

  describe("deleteMessage", () => {
    it("should delete existing message and return true", () => {
      const message: StoredMessage = {
        channelId: "C123456",
        timestamp: "1234567890.123456",
        postedAt: new Date(),
      };

      setMessage("key", message);
      const result = deleteMessage("key");

      expect(result).toBe(true);
      expect(getMessage("key")).toBeUndefined();
    });

    it("should return false when deleting non-existent key", () => {
      const result = deleteMessage("non-existent-key");
      expect(result).toBe(false);
    });
  });

  describe("getStoreSize", () => {
    it("should return 0 for empty store", () => {
      expect(getStoreSize()).toBe(0);
    });

    it("should return correct count after adding messages", () => {
      setMessage("key1", { channelId: "C1", timestamp: "1", postedAt: new Date() });
      setMessage("key2", { channelId: "C2", timestamp: "2", postedAt: new Date() });

      expect(getStoreSize()).toBe(2);
    });

    it("should return correct count after deleting messages", () => {
      setMessage("key1", { channelId: "C1", timestamp: "1", postedAt: new Date() });
      setMessage("key2", { channelId: "C2", timestamp: "2", postedAt: new Date() });
      deleteMessage("key1");

      expect(getStoreSize()).toBe(1);
    });
  });

  describe("clearStore", () => {
    it("should remove all messages", () => {
      setMessage("key1", { channelId: "C1", timestamp: "1", postedAt: new Date() });
      setMessage("key2", { channelId: "C2", timestamp: "2", postedAt: new Date() });

      clearStore();

      expect(getStoreSize()).toBe(0);
      expect(getMessage("key1")).toBeUndefined();
      expect(getMessage("key2")).toBeUndefined();
    });

    it("should work on already empty store", () => {
      clearStore();
      expect(getStoreSize()).toBe(0);
    });
  });

  describe("cleanupMessageStore", () => {
    it("should remove messages older than 1 hour", () => {
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const recentDate = new Date();

      setMessage("old", { channelId: "C1", timestamp: "1", postedAt: oldDate });
      setMessage("recent", { channelId: "C2", timestamp: "2", postedAt: recentDate });

      cleanupMessageStore();

      expect(getMessage("old")).toBeUndefined();
      expect(getMessage("recent")).toBeDefined();
    });

    it("should keep messages less than 1 hour old", () => {
      const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      setMessage("recent", { channelId: "C1", timestamp: "1", postedAt: recentDate });

      cleanupMessageStore();

      expect(getMessage("recent")).toBeDefined();
    });

    it("should handle empty store without errors", () => {
      expect(() => cleanupMessageStore()).not.toThrow();
    });

    it("should log when messages are cleaned up", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { logger } = jest.requireMock("@kenchi/shared") as any;

      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      setMessage("old", { channelId: "C1", timestamp: "1", postedAt: oldDate });

      cleanupMessageStore();

      expect(logger.info).toHaveBeenCalledWith(
        "Cleaned up old message store entries",
        expect.objectContaining({ deletedCount: 1 })
      );
    });

    it("should not log when no messages are cleaned up", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { logger } = jest.requireMock("@kenchi/shared") as any;

      const recentDate = new Date();
      setMessage("recent", { channelId: "C1", timestamp: "1", postedAt: recentDate });

      cleanupMessageStore();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it("should remove multiple old messages at once", () => {
      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

      setMessage("old1", { channelId: "C1", timestamp: "1", postedAt: oldDate });
      setMessage("old2", { channelId: "C2", timestamp: "2", postedAt: oldDate });
      setMessage("old3", { channelId: "C3", timestamp: "3", postedAt: oldDate });

      cleanupMessageStore();

      expect(getStoreSize()).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string keys", () => {
      setMessage("", { channelId: "C1", timestamp: "1", postedAt: new Date() });
      expect(getMessage("")).toBeDefined();
    });

    it("should handle very long keys", () => {
      const longKey = "a".repeat(1000);
      setMessage(longKey, { channelId: "C1", timestamp: "1", postedAt: new Date() });
      expect(getMessage(longKey)).toBeDefined();
    });

    it("should handle special characters in keys", () => {
      const specialKey = "owner/repo:abc123!@#$%^&*()";
      setMessage(specialKey, { channelId: "C1", timestamp: "1", postedAt: new Date() });
      expect(getMessage(specialKey)).toBeDefined();
    });

    it("should preserve exact timestamp format", () => {
      const timestamp = "1234567890.123456";
      setMessage("key", { channelId: "C1", timestamp, postedAt: new Date() });
      expect(getMessage("key")?.timestamp).toBe(timestamp);
    });
  });
});
