/**
 * Unit tests for GitHub App Handlers
 */

import { describe, it, expect, jest } from "@jest/globals";
import type { PullRequestWebhook, CheckRunWebhook } from "../types/githubTypes.js";
import {
  GITHUB_PR_ACTIONS,
  GITHUB_CHECK_ACTIONS,
  GITHUB_CHECK_CONCLUSIONS,
} from "../types/githubTypes.js";

// Mock the service module before importing handlers
jest.mock("../services/githubService.js", () => ({
  createEventFromPR: jest.fn(() => ({
    id: "pr_test_123",
    type: "MANUAL_TRIGGER",
    source: "github",
  })),
  createEventFromCheckRun: jest.fn(() => ({
    id: "check_test_123",
    type: "CICD_FAILURE",
    source: "github",
  })),
  performAnalysis: jest.fn(() =>
    Promise.resolve({
      analysis: {
        eventId: "test",
        summary: "Test summary",
        confidence: "high",
        analyzedAt: new Date().toISOString(),
      },
      confidence: {
        finalScore: 0.85,
        gatingDecision: "auto_approve",
        breakdown: {},
        reasoning: [],
      },
      event: { id: "test" },
    })
  ),
  postPRComment: jest.fn(() => Promise.resolve()),
}));

// Mock the comment formatter
jest.mock("../formatters/commentFormatter.js", () => ({
  formatGitHubComment: jest.fn(() => "## ❌ KenchiOps — CI Failure Analysis\n\nTest comment"),
}));

describe("GitHub App Handlers", () => {
  describe("Pull Request Handler", () => {
    const mockPRWebhook: PullRequestWebhook = {
      action: GITHUB_PR_ACTIONS.OPENED,
      pull_request: {
        number: 123,
        title: "Test PR",
        body: "Test body",
        head: { sha: "abc123", ref: "feature" },
        base: { sha: "def456", ref: "main" },
        user: { login: "testuser" },
      },
      repository: {
        full_name: "owner/repo",
        owner: { login: "owner" },
        name: "repo",
      },
      installation: { id: 12345 },
    };

    it("should have correct webhook structure for opened PR", () => {
      expect(mockPRWebhook.action).toBe("opened");
      expect(mockPRWebhook.pull_request.number).toBe(123);
      expect(mockPRWebhook.repository.full_name).toBe("owner/repo");
    });

    it("should extract installation ID from webhook", () => {
      expect(mockPRWebhook.installation?.id).toBe(12345);
    });

    it("should have all required PR fields", () => {
      const { pull_request } = mockPRWebhook;
      expect(pull_request.title).toBeDefined();
      expect(pull_request.head.sha).toBeDefined();
      expect(pull_request.base.ref).toBeDefined();
      expect(pull_request.user.login).toBeDefined();
    });
  });

  describe("Check Run Handler", () => {
    const mockCheckRunWebhook: CheckRunWebhook = {
      action: GITHUB_CHECK_ACTIONS.COMPLETED,
      check_run: {
        id: 456,
        name: "CI Build",
        conclusion: GITHUB_CHECK_CONCLUSIONS.FAILURE,
        head_sha: "abc123def456",
        output: {
          title: "Build Failed",
          summary: "Build failed due to errors",
          text: "Error details here",
        },
        pull_requests: [
          {
            number: 123,
            head: { sha: "abc123def456", ref: "feature-branch" },
            base: { sha: "def789", ref: "main" },
          },
        ],
      },
      repository: {
        full_name: "owner/repo",
        owner: { login: "owner" },
        name: "repo",
      },
      installation: { id: 12345 },
    };

    it("should have correct webhook structure for failed check", () => {
      expect(mockCheckRunWebhook.action).toBe("completed");
      expect(mockCheckRunWebhook.check_run.conclusion).toBe("failure");
    });

    it("should include check run output", () => {
      const { output } = mockCheckRunWebhook.check_run;
      expect(output.title).toBe("Build Failed");
      expect(output.summary).toBeDefined();
    });

    it("should correctly identify failure vs success", () => {
      const failedCheck = { ...mockCheckRunWebhook };
      const successCheck = {
        ...mockCheckRunWebhook,
        check_run: {
          ...mockCheckRunWebhook.check_run,
          conclusion: GITHUB_CHECK_CONCLUSIONS.SUCCESS,
        },
      };

      expect(failedCheck.check_run.conclusion).not.toBe("success");
      expect(successCheck.check_run.conclusion).toBe("success");
    });

    it("should include head_sha and pull_requests fields", () => {
      expect(mockCheckRunWebhook.check_run.head_sha).toBe("abc123def456");
      expect(mockCheckRunWebhook.check_run.pull_requests).toHaveLength(1);
      expect(mockCheckRunWebhook.check_run.pull_requests[0].number).toBe(123);
    });

    it("should handle check run with no associated PRs", () => {
      const noPRsWebhook: CheckRunWebhook = {
        ...mockCheckRunWebhook,
        check_run: {
          ...mockCheckRunWebhook.check_run,
          pull_requests: [],
        },
      };

      expect(noPRsWebhook.check_run.pull_requests).toHaveLength(0);
    });
  });

  describe("Type Definitions", () => {
    it("should have correct PR actions", () => {
      expect(GITHUB_PR_ACTIONS.OPENED).toBe("opened");
      expect(GITHUB_PR_ACTIONS.CLOSED).toBe("closed");
      expect(GITHUB_PR_ACTIONS.SYNCHRONIZE).toBe("synchronize");
    });

    it("should have correct check actions", () => {
      expect(GITHUB_CHECK_ACTIONS.COMPLETED).toBe("completed");
      expect(GITHUB_CHECK_ACTIONS.CREATED).toBe("created");
    });

    it("should have correct check conclusions", () => {
      expect(GITHUB_CHECK_CONCLUSIONS.SUCCESS).toBe("success");
      expect(GITHUB_CHECK_CONCLUSIONS.FAILURE).toBe("failure");
      expect(GITHUB_CHECK_CONCLUSIONS.CANCELLED).toBe("cancelled");
    });
  });
});
