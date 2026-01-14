/**
 * Unit tests for Check Run Handler
 *
 * Tests the CI failure handling:
 * 1. Routes failures to pending aggregation
 * 2. Skips status checks and non-failure conclusions
 * 3. Routes successes to passive learning
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    // Mock Redis aggregation
    addPendingCheckToRedis: jest.fn(() => Promise.resolve()),
  };
});

// Mock success handler
jest.mock("../handlers/checkRunSuccessHandler.js", () => ({
  handleCheckRunSuccess: jest.fn(() =>
    Promise.resolve({
      handled: true,
      message: "Success processed for passive learning",
    })
  ),
}));

// Import handlers after mocks
import { handleCheckRun, handleCheckRunFailure } from "../handlers/checkRunHandler.js";
import { addPendingCheckToRedis } from "@kenchi/shared";

// Get the mocked functions
const mockAddPendingCheckToRedis = addPendingCheckToRedis as jest.MockedFunction<
  typeof addPendingCheckToRedis
>;

describe("Check Run Handler", () => {
  // Test fixtures
  const createMockWebhook = (overrides: Partial<CheckRunWebhook> = {}): CheckRunWebhook => ({
    action: GITHUB_CHECK_ACTIONS.COMPLETED,
    check_run: {
      id: 12345,
      name: "CI Build",
      conclusion: GITHUB_CHECK_CONCLUSIONS.FAILURE,
      head_sha: "abc123def456789012345678901234567890abcd",
      output: {
        title: "Build failed",
        summary: "Tests failed",
        text: "Error details",
      },
      pull_requests: [
        {
          number: 123,
          head: { sha: "abc123", ref: "feature" },
          base: { sha: "def456", ref: "main" },
        },
      ],
    },
    repository: {
      full_name: "testowner/testrepo",
      owner: { login: "testowner" },
      name: "testrepo",
    },
    installation: { id: 12345 },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddPendingCheckToRedis.mockResolvedValue(undefined);
  });

  describe("handleCheckRun", () => {
    it("should process failure check runs", async () => {
      const webhook = createMockWebhook();
      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("analyzed");
      expect(result.eventId).toBeDefined();
    });

    it("should skip non-completed check runs", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_CHECK_ACTIONS.CREATED,
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("skipped");
    });

    it("should process successful check runs for passive learning", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.SUCCESS,
        },
      });

      const result = await handleCheckRun(webhook);

      // Success is handled for passive learning
      expect(result.handled).toBe(true);
      expect(result.message).toContain("passive learning");
    });

    it("should process timed_out conclusions as failures", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.TIMED_OUT,
        },
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(true);
      expect(mockAddPendingCheckToRedis).toHaveBeenCalled();
    });

    it("should skip neutral conclusions", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.NEUTRAL,
        },
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(false);
      expect(mockAddPendingCheckToRedis).not.toHaveBeenCalled();
    });

    it("should skip cancelled conclusions", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.CANCELLED,
        },
      });

      const result = await handleCheckRun(webhook);

      expect(result.handled).toBe(false);
    });
  });

  describe("handleCheckRunFailure", () => {
    it("should add pending check to Redis aggregation", async () => {
      const webhook = createMockWebhook();
      await handleCheckRunFailure(webhook);

      expect(mockAddPendingCheckToRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryFullName: "testowner/testrepo",
          commitSha: "abc123def456789012345678901234567890abcd",
        }),
        expect.objectContaining({
          checkRunId: 12345,
          checkName: "CI Build",
          conclusion: "failure",
        }),
        expect.objectContaining({
          repositoryInfo: expect.objectContaining({
            owner: "testowner",
            name: "testrepo",
          }),
          installationId: 12345,
        })
      );
    });

    it("should return success result when added to aggregation", async () => {
      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(true);
      expect(result.eventId).toContain("12345");
      expect(result.message).toContain("aggregator");
    });

    it("should handle Redis errors gracefully", async () => {
      mockAddPendingCheckToRedis.mockRejectedValueOnce(new Error("Redis error"));

      const webhook = createMockWebhook();
      const result = await handleCheckRunFailure(webhook);

      expect(result.handled).toBe(false);
    });

    it("should skip status checks like CI Success", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          name: "CI Success",
        },
      });

      const result = await handleCheckRunFailure(webhook);

      // Status checks are skipped but return success (not actual failures)
      expect(result.handled).toBe(true);
      expect(mockAddPendingCheckToRedis).not.toHaveBeenCalled();
    });

    it("should skip ci-status checks", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          name: "ci-status",
        },
      });

      await handleCheckRunFailure(webhook);

      expect(mockAddPendingCheckToRedis).not.toHaveBeenCalled();
    });

    it("should process actual failure checks like Build", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          name: "Build",
        },
      });

      await handleCheckRunFailure(webhook);

      expect(mockAddPendingCheckToRedis).toHaveBeenCalled();
    });

    it("should process Test check failures", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          name: "Test",
        },
      });

      await handleCheckRunFailure(webhook);

      expect(mockAddPendingCheckToRedis).toHaveBeenCalled();
    });

    it("should include PR numbers in context", async () => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          pull_requests: [
            { number: 123, head: { sha: "abc", ref: "feat" }, base: { sha: "def", ref: "main" } },
            { number: 456, head: { sha: "ghi", ref: "fix" }, base: { sha: "jkl", ref: "main" } },
          ],
        },
      });

      await handleCheckRunFailure(webhook);

      expect(mockAddPendingCheckToRedis).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          pullRequestNumbers: [123, 456],
        })
      );
    });
  });

  describe("status check filtering", () => {
    const statusCheckNames = [
      "CI Success",
      "ci-success",
      "CI_Success",
      "ci status",
      "CI-Status",
      "all checks",
      "All-Checks",
      "status check",
      "Status-Check",
      "branch protection",
      "Branch-Protection",
      "required checks",
      "Required-Checks",
    ];

    it.each(statusCheckNames)("should skip status check: %s", async (checkName) => {
      const webhook = createMockWebhook({
        check_run: {
          ...createMockWebhook().check_run,
          name: checkName,
        },
      });

      await handleCheckRunFailure(webhook);

      expect(mockAddPendingCheckToRedis).not.toHaveBeenCalled();
    });

    const actualFailureCheckNames = [
      "Build",
      "Test",
      "Lint",
      "Type Check",
      "Code Quality",
      "Integration Tests",
      "Unit Tests",
      "E2E Tests",
    ];

    it.each(actualFailureCheckNames)(
      "should process actual failure check: %s",
      async (checkName) => {
        const webhook = createMockWebhook({
          check_run: {
            ...createMockWebhook().check_run,
            name: checkName,
          },
        });

        await handleCheckRunFailure(webhook);

        expect(mockAddPendingCheckToRedis).toHaveBeenCalled();
      }
    );
  });
});
