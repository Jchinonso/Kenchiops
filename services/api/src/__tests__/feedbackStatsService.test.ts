/**
 * Unit tests for Feedback Statistics Service
 *
 * Tests feedback counting by type and date filtering, including
 * error handling with graceful defaults.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockQuery = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    query: (...args: unknown[]) => mockQuery(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Import after mock setup
import { countFeedbackByType, countFeedbackSinceDate } from "../services/feedbackStatsService.js";

// ==================== Tests ====================

describe("Feedback Statistics Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== countFeedbackByType ====================

  describe("countFeedbackByType", () => {
    it("should return feedback counts grouped by type", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { feedback_type: "helpful", count: "15" },
          { feedback_type: "not_helpful", count: "3" },
        ],
      });

      const result = await countFeedbackByType();

      expect(result).toEqual({
        helpful: 15,
        not_helpful: 3,
        neutral: 0,
      });
    });

    it("should accumulate unknown feedback types into neutral", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { feedback_type: "helpful", count: "10" },
          { feedback_type: "not_helpful", count: "5" },
          { feedback_type: "skipped", count: "2" },
          { feedback_type: "other", count: "3" },
        ],
      });

      const result = await countFeedbackByType();

      expect(result).toEqual({
        helpful: 10,
        not_helpful: 5,
        neutral: 5, // 2 + 3
      });
    });

    it("should return zeros when no feedback exists", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await countFeedbackByType();

      expect(result).toEqual({
        helpful: 0,
        not_helpful: 0,
        neutral: 0,
      });
    });

    it("should pass tenantId as query parameter", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await countFeedbackByType("tenant-123");

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["tenant-123"]);
    });

    it("should pass null when tenantId is undefined", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await countFeedbackByType();

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [null]);
    });

    it("should return default zeros on database error", async () => {
      mockQuery.mockRejectedValue(new Error("Connection refused"));

      const result = await countFeedbackByType();

      expect(result).toEqual({
        helpful: 0,
        not_helpful: 0,
        neutral: 0,
      });
    });

    it("should handle only helpful feedback", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ feedback_type: "helpful", count: "42" }],
      });

      const result = await countFeedbackByType();

      expect(result).toEqual({
        helpful: 42,
        not_helpful: 0,
        neutral: 0,
      });
    });

    it("should handle only not_helpful feedback", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ feedback_type: "not_helpful", count: "7" }],
      });

      const result = await countFeedbackByType();

      expect(result).toEqual({
        helpful: 0,
        not_helpful: 7,
        neutral: 0,
      });
    });

    it("should handle large counts correctly", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { feedback_type: "helpful", count: "999999" },
          { feedback_type: "not_helpful", count: "500000" },
        ],
      });

      const result = await countFeedbackByType();

      expect(result.helpful).toBe(999999);
      expect(result.not_helpful).toBe(500000);
    });

    it("should correctly parse string count values from database", async () => {
      // Database COUNT() returns string, verify parseInt works correctly
      mockQuery.mockResolvedValue({
        rows: [{ feedback_type: "helpful", count: "0" }],
      });

      const result = await countFeedbackByType();

      expect(result.helpful).toBe(0);
      expect(typeof result.helpful).toBe("number");
    });
  });

  // ==================== countFeedbackSinceDate ====================

  describe("countFeedbackSinceDate", () => {
    it("should return count of feedback since given date", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "25" }],
      });

      const since = new Date("2024-01-01T00:00:00Z");
      const result = await countFeedbackSinceDate(since);

      expect(result).toBe(25);
    });

    it("should pass date as ISO string parameter", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "0" }],
      });

      const since = new Date("2024-06-15T12:00:00Z");
      await countFeedbackSinceDate(since);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        "2024-06-15T12:00:00.000Z",
        null,
      ]);
    });

    it("should pass tenantId when provided", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "0" }],
      });

      const since = new Date("2024-01-01T00:00:00Z");
      await countFeedbackSinceDate(since, "tenant-456");

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        expect.any(String),
        "tenant-456",
      ]);
    });

    it("should pass null when tenantId is undefined", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "0" }],
      });

      const since = new Date("2024-01-01T00:00:00Z");
      await countFeedbackSinceDate(since);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [expect.any(String), null]);
    });

    it("should return 0 when no rows returned", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
      });

      const since = new Date("2024-01-01T00:00:00Z");
      const result = await countFeedbackSinceDate(since);

      expect(result).toBe(0);
    });

    it("should return 0 on database error", async () => {
      mockQuery.mockRejectedValue(new Error("Database timeout"));

      const since = new Date("2024-01-01T00:00:00Z");
      const result = await countFeedbackSinceDate(since);

      expect(result).toBe(0);
    });

    it("should return 0 when count is zero", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "0" }],
      });

      const since = new Date("2024-01-01T00:00:00Z");
      const result = await countFeedbackSinceDate(since);

      expect(result).toBe(0);
    });

    it("should handle large counts", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "1000000" }],
      });

      const since = new Date("2020-01-01T00:00:00Z");
      const result = await countFeedbackSinceDate(since);

      expect(result).toBe(1000000);
    });
  });
});
