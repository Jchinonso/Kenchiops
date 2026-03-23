/**
 * Tests for chat/chatBudget — daily chat token budget checking and tracking.
 *
 * Uses jest.mock to mock the chatTokenUsage repository and logger.
 * Verifies budget status computation, plan-tier defaults, per-tenant overrides,
 * warning/exhaustion thresholds, and fail-open increment behavior.
 *
 * @module chat/chatBudget.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "../../core/types.js";
import type { ChatTokenUsage } from "../../database/chatTokenUsage/types.js";

// ==================== Mocks ====================

const mockGetTodayTokenUsage =
  jest.fn<(tenantId: string, context: RequestContext) => Promise<ChatTokenUsage | null>>();
const mockIncrementTokenUsage =
  jest.fn<(tenantId: string, tokensConsumed: number, context: RequestContext) => Promise<void>>();

jest.mock("../../database/chatTokenUsage/repository.js", () => ({
  getTodayTokenUsage: (...args: unknown[]) =>
    mockGetTodayTokenUsage(...(args as [string, RequestContext])),
  incrementTokenUsage: (...args: unknown[]) =>
    mockIncrementTokenUsage(...(args as [string, number, RequestContext])),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../../core/logger.js", () => ({
  createLogger: () => mockLogger,
}));

// Import AFTER mocks are set up
import { checkChatBudget, incrementChatTokenUsage } from "../../chat/chatBudget.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

// ==================== Helpers ====================

/** Create a ChatTokenUsage domain object for mock returns. */
const createUsage = (tokensUsed: number, budgetLimit: number | null = null): ChatTokenUsage => ({
  id: "mock-id",
  tenantId: "test-tenant",
  usageDate: new Date(),
  tokensUsed,
  messageCount: 1,
  budgetLimit,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ==================== Tests ====================

describe("checkChatBudget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return correct status when no usage exists", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(null);

    const result = await checkChatBudget("test-tenant", "free", testContext);

    expect(result).toEqual({
      tokensUsed: 0,
      budgetLimit: 50_000,
      remaining: 50_000,
      ratioUsed: 0,
      isWarning: false,
      isExhausted: false,
    });
  });

  it("should return correct status with existing usage on free tier", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(40_000));

    const result = await checkChatBudget("test-tenant", "free", testContext);

    expect(result).toEqual({
      tokensUsed: 40_000,
      budgetLimit: 50_000,
      remaining: 10_000,
      ratioUsed: 0.8,
      isWarning: true,
      isExhausted: false,
    });
  });

  it("should return exhausted when at 100% usage", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(50_000));

    const result = await checkChatBudget("test-tenant", "free", testContext);

    expect(result.isExhausted).toBe(true);
    expect(result.isWarning).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.ratioUsed).toBe(1);
  });

  it("should return exhausted when usage exceeds budget", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(60_000));

    const result = await checkChatBudget("test-tenant", "free", testContext);

    expect(result.isExhausted).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.ratioUsed).toBeGreaterThan(1);
  });

  it("should use per-tenant override when budgetLimit is set", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(80_000, 100_000));

    const result = await checkChatBudget("test-tenant", "free", testContext);

    expect(result.budgetLimit).toBe(100_000);
    expect(result.remaining).toBe(20_000);
    expect(result.ratioUsed).toBe(0.8);
    expect(result.isWarning).toBe(true);
    expect(result.isExhausted).toBe(false);
  });

  it("should fall back to free tier for unknown plan", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(null);

    const result = await checkChatBudget("test-tenant", "unknown", testContext);

    expect(result.budgetLimit).toBe(50_000);
  });

  it("should use pro tier budget for pro plan", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(null);

    const result = await checkChatBudget("test-tenant", "pro", testContext);

    expect(result.budgetLimit).toBe(200_000);
  });

  it("should use team tier budget for team plan", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(null);

    const result = await checkChatBudget("test-tenant", "team", testContext);

    expect(result.budgetLimit).toBe(500_000);
  });

  it("should use enterprise tier budget for enterprise plan", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(null);

    const result = await checkChatBudget("test-tenant", "enterprise", testContext);

    expect(result.budgetLimit).toBe(2_000_000);
  });

  it("should set isWarning true at exactly 80% threshold", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(40_000));

    const result = await checkChatBudget("test-tenant", "free", testContext);

    // 40K / 50K = 0.8 = exactly the warning threshold
    expect(result.ratioUsed).toBe(0.8);
    expect(result.isWarning).toBe(true);
  });

  it("should set isWarning false below 80% threshold", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(30_000));

    const result = await checkChatBudget("test-tenant", "free", testContext);

    expect(result.ratioUsed).toBe(0.6);
    expect(result.isWarning).toBe(false);
  });

  it("should log warning when budget is exhausted", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(50_000));

    await checkChatBudget("test-tenant", "free", testContext);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Chat token budget exhausted for tenant",
      expect.objectContaining({
        tokensUsed: 50_000,
        budgetLimit: 50_000,
        planTier: "free",
      })
    );
  });

  it("should not log warning when budget is not exhausted", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(createUsage(30_000));

    await checkChatBudget("test-tenant", "free", testContext);

    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("should pass tenantId and context to repository", async () => {
    mockGetTodayTokenUsage.mockResolvedValue(null);

    await checkChatBudget("my-tenant", "free", testContext);

    expect(mockGetTodayTokenUsage).toHaveBeenCalledWith("my-tenant", testContext);
  });

  describe("zero budget limit edge case", () => {
    it("should return ratioUsed of 0 when budgetLimit is 0 and tokensUsed is 0", async () => {
      // Per-tenant override of 0 — the code guards against division by zero:
      // `budgetLimit > 0 ? tokensUsed / budgetLimit : 0`
      mockGetTodayTokenUsage.mockResolvedValue(createUsage(0, 0));

      const result = await checkChatBudget("test-tenant", "free", testContext);

      expect(result.budgetLimit).toBe(0);
      expect(result.tokensUsed).toBe(0);
      expect(result.ratioUsed).toBe(0);
      expect(Number.isFinite(result.ratioUsed)).toBe(true);
      expect(Number.isNaN(result.ratioUsed)).toBe(false);
      // With ratioUsed = 0, isWarning and isExhausted should be false
      expect(result.isWarning).toBe(false);
      expect(result.isExhausted).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should return ratioUsed of 0 when budgetLimit is 0 and tokensUsed is positive", async () => {
      // Edge case: tenant has usage but limit is 0 (should not produce NaN/Infinity)
      mockGetTodayTokenUsage.mockResolvedValue(createUsage(5_000, 0));

      const result = await checkChatBudget("test-tenant", "free", testContext);

      expect(result.budgetLimit).toBe(0);
      expect(result.ratioUsed).toBe(0);
      expect(Number.isFinite(result.ratioUsed)).toBe(true);
      // remaining should be 0 (Math.max(0, 0 - 5000) = 0)
      expect(result.remaining).toBe(0);
    });
  });
});

describe("incrementChatTokenUsage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should delegate to repository with correct args", async () => {
    mockIncrementTokenUsage.mockResolvedValue(undefined);

    await incrementChatTokenUsage("test-tenant", 1500, testContext);

    expect(mockIncrementTokenUsage).toHaveBeenCalledWith("test-tenant", 1500, testContext);
  });

  it("should fail open when repository throws", async () => {
    mockIncrementTokenUsage.mockRejectedValue(new Error("DB connection lost"));

    // Should not throw
    await expect(
      incrementChatTokenUsage("test-tenant", 1500, testContext)
    ).resolves.toBeUndefined();
  });

  it("should log warning when repository throws", async () => {
    mockIncrementTokenUsage.mockRejectedValue(new Error("DB connection lost"));

    await incrementChatTokenUsage("test-tenant", 1500, testContext);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Failed to increment chat token usage \u2014 continuing",
      expect.objectContaining({
        error: "DB connection lost",
        tokensConsumed: 1500,
      })
    );
  });

  describe("invalid tokensConsumed values (repository-level validation, fail-open wrapper)", () => {
    it("should not throw when tokensConsumed is negative", async () => {
      // The repository validates tokensConsumed > 0 and silently returns.
      // The chatBudget wrapper should also not throw regardless.
      mockIncrementTokenUsage.mockResolvedValue(undefined);

      await expect(
        incrementChatTokenUsage("test-tenant", -100, testContext)
      ).resolves.toBeUndefined();
    });

    it("should not throw when tokensConsumed is 0", async () => {
      mockIncrementTokenUsage.mockResolvedValue(undefined);

      await expect(incrementChatTokenUsage("test-tenant", 0, testContext)).resolves.toBeUndefined();
    });

    it("should not throw when tokensConsumed is NaN", async () => {
      mockIncrementTokenUsage.mockResolvedValue(undefined);

      await expect(
        incrementChatTokenUsage("test-tenant", NaN, testContext)
      ).resolves.toBeUndefined();
    });

    it("should not throw when tokensConsumed is Infinity", async () => {
      mockIncrementTokenUsage.mockResolvedValue(undefined);

      await expect(
        incrementChatTokenUsage("test-tenant", Infinity, testContext)
      ).resolves.toBeUndefined();
    });

    it("should fail open even when repository rejects for invalid tokensConsumed", async () => {
      // Simulates what happens if the repository throws instead of silently returning
      mockIncrementTokenUsage.mockRejectedValue(new Error("Invalid value"));

      await expect(
        incrementChatTokenUsage("test-tenant", -1, testContext)
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to increment chat token usage \u2014 continuing",
        expect.objectContaining({
          error: "Invalid value",
          tokensConsumed: -1,
        })
      );
    });
  });
});
