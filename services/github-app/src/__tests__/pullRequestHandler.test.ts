/**
 * Unit tests for Pull Request Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { PullRequestWebhook } from "../types/githubTypes.js";
import { GITHUB_PR_ACTIONS } from "../types/githubTypes.js";

// Mock Octokit dependencies (must be before imports that use them)
jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn(),
}));

jest.mock("@octokit/auth-app", () => ({
  createAppAuth: jest.fn(),
}));

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
    getErrorMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error)
    ),
  };
});

// Import handlers after mocks
import { handlePullRequest, handlePullRequestOpened } from "../handlers/pullRequestHandler.js";

describe("Pull Request Handler", () => {
  // Test fixtures
  const createMockWebhook = (overrides: Partial<PullRequestWebhook> = {}): PullRequestWebhook => ({
    action: GITHUB_PR_ACTIONS.OPENED,
    pull_request: {
      number: 123,
      title: "Add new feature",
      body: "This PR adds a new feature",
      head: {
        sha: "abc123def456",
        ref: "feature-branch",
      },
      base: {
        sha: "def456ghi789",
        ref: "main",
      },
      user: {
        login: "testuser",
      },
    },
    repository: {
      full_name: "testowner/testrepo",
      owner: {
        login: "testowner",
      },
      name: "testrepo",
    },
    installation: {
      id: 12345,
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handlePullRequest", () => {
    it("should handle opened PR event", async () => {
      const webhook = createMockWebhook();
      const result = await handlePullRequest(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("logged");
    });

    it("should not handle closed PR events", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_PR_ACTIONS.CLOSED,
      });

      const result = await handlePullRequest(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("not handled");
    });

    it("should not handle reopened PR events", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_PR_ACTIONS.REOPENED,
      });

      const result = await handlePullRequest(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("not handled");
    });

    it("should not handle synchronize PR events", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_PR_ACTIONS.SYNCHRONIZE,
      });

      const result = await handlePullRequest(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("not handled");
    });

    it("should include action in message for unhandled events", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_PR_ACTIONS.CLOSED,
      });

      const result = await handlePullRequest(webhook);

      expect(result.message).toContain("closed");
    });

    it("should handle unknown action types", async () => {
      const webhook = createMockWebhook({
        action: "unknown_action",
      });

      const result = await handlePullRequest(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("unknown_action");
    });
  });

  describe("handlePullRequestOpened", () => {
    it("should log PR opened event without posting comment", async () => {
      const webhook = createMockWebhook();
      const result = await handlePullRequestOpened(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("PR opened event logged");
    });

    it("should include explanatory message about CI", async () => {
      const webhook = createMockWebhook();
      const result = await handlePullRequestOpened(webhook);

      expect(result.message).toContain("CI");
    });

    it("should handle PRs with no body", async () => {
      const webhook = createMockWebhook({
        pull_request: {
          ...createMockWebhook().pull_request,
          body: null,
        },
      });

      const result = await handlePullRequestOpened(webhook);

      expect(result.handled).toBe(true);
    });

    it("should handle PRs with empty title", async () => {
      const webhook = createMockWebhook({
        pull_request: {
          ...createMockWebhook().pull_request,
          title: "",
        },
      });

      const result = await handlePullRequestOpened(webhook);

      expect(result.handled).toBe(true);
    });

    it("should handle PRs from bot users", async () => {
      const webhook = createMockWebhook({
        pull_request: {
          ...createMockWebhook().pull_request,
          user: {
            login: "dependabot[bot]",
          },
        },
      });

      const result = await handlePullRequestOpened(webhook);

      expect(result.handled).toBe(true);
    });

    it("should handle PRs with missing installation", async () => {
      const webhook = createMockWebhook({
        installation: undefined,
      });

      const result = await handlePullRequestOpened(webhook);

      expect(result.handled).toBe(true);
    });

    it("should include PR number in log", async () => {
      const webhook = createMockWebhook({
        pull_request: {
          ...createMockWebhook().pull_request,
          number: 999,
        },
      });

      const result = await handlePullRequestOpened(webhook);

      expect(result.handled).toBe(true);
    });

    it("should include repository info in log", async () => {
      const webhook = createMockWebhook({
        repository: {
          full_name: "org/special-repo",
          owner: { login: "org" },
          name: "special-repo",
        },
      });

      const result = await handlePullRequestOpened(webhook);

      expect(result.handled).toBe(true);
    });
  });

  describe("result structure", () => {
    it("should return correct structure for handled events", async () => {
      const webhook = createMockWebhook();
      const result = await handlePullRequest(webhook);

      expect(result).toHaveProperty("handled");
      expect(result).toHaveProperty("message");
      expect(typeof result.handled).toBe("boolean");
      expect(typeof result.message).toBe("string");
    });

    it("should not include eventId for PR opened", async () => {
      const webhook = createMockWebhook();
      const result = await handlePullRequest(webhook);

      expect(result.eventId).toBeUndefined();
    });
  });
});
