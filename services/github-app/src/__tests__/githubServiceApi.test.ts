/**
 * Tests for GitHub Service API functions
 * These tests verify functions that interact with the GitHub API
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { KENCHI_BRANDING } from "@kenchi/shared";

// Mock dependencies first
jest.mock("@octokit/auth-app", () => ({
  createAppAuth: jest.fn(),
}));

jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    port: 3001,
    environment: "test",
    serviceName: "github-app",
    github: {
      appId: "12345",
      privateKey: "test-private-key",
      webhookSecret: "test-webhook-secret",
      installationId: 67890,
    },
  },
}));

// Create mock Octokit instance
const mockOctokitInstance = {
  rest: {
    issues: {
      listComments: jest.fn(),
      deleteComment: jest.fn(),
      createComment: jest.fn(),
    },
    apps: {
      listReposAccessibleToInstallation: jest.fn(),
    },
    checks: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
};

// Mock Octokit constructor
jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokitInstance),
}));

// Mock shared module
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
    getErrorMessage: jest.fn((error: unknown) => {
      if (error instanceof Error) return error.message;
      return String(error);
    }),
    wrapError: jest.fn((message: string, error: unknown) => {
      if (error instanceof Error) {
        return `${message}: ${error.message}`;
      }
      return message;
    }),
  };
});

// Import after mocks are set up
import {
  deleteKenchiOpsComments,
  postPRComment,
  getInstallationRepositories,
  createCheckRunWithAnnotations,
} from "../services/githubService.js";

describe("GitHub Service API Functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("deleteKenchiOpsComments", () => {
    it("should delete comments containing KenchiOps marker", async () => {
      const marker = KENCHI_BRANDING.COMMENT_MARKER;
      (mockOctokitInstance.rest.issues.listComments as jest.Mock).mockResolvedValue({
        data: [
          { id: 1, body: "Regular comment" },
          { id: 2, body: `${marker} Analysis here` },
          { id: 3, body: "Another regular comment" },
          { id: 4, body: `${marker} Old analysis` },
        ],
      });
      (mockOctokitInstance.rest.issues.deleteComment as jest.Mock).mockResolvedValue({});

      const deletedCount = await deleteKenchiOpsComments(12345, "owner", "repo", 42);

      expect(deletedCount).toBe(2);
      expect(mockOctokitInstance.rest.issues.deleteComment).toHaveBeenCalledTimes(2);
      expect(mockOctokitInstance.rest.issues.deleteComment).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        comment_id: 2,
      });
      expect(mockOctokitInstance.rest.issues.deleteComment).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        comment_id: 4,
      });
    });

    it("should return 0 when no KenchiOps comments found", async () => {
      (mockOctokitInstance.rest.issues.listComments as jest.Mock).mockResolvedValue({
        data: [
          { id: 1, body: "Regular comment" },
          { id: 2, body: "Another regular comment" },
        ],
      });

      const deletedCount = await deleteKenchiOpsComments(12345, "owner", "repo", 42);

      expect(deletedCount).toBe(0);
      expect(mockOctokitInstance.rest.issues.deleteComment).not.toHaveBeenCalled();
    });

    it("should return 0 when API call fails", async () => {
      (mockOctokitInstance.rest.issues.listComments as jest.Mock).mockRejectedValue(
        new Error("API error")
      );

      const deletedCount = await deleteKenchiOpsComments(12345, "owner", "repo", 42);

      expect(deletedCount).toBe(0);
    });

    it("should handle comments with null body", async () => {
      const marker = KENCHI_BRANDING.COMMENT_MARKER;
      (mockOctokitInstance.rest.issues.listComments as jest.Mock).mockResolvedValue({
        data: [
          { id: 1, body: null },
          { id: 2, body: undefined },
          { id: 3, body: `${marker} Valid` },
        ],
      });
      (mockOctokitInstance.rest.issues.deleteComment as jest.Mock).mockResolvedValue({});

      const deletedCount = await deleteKenchiOpsComments(12345, "owner", "repo", 42);

      expect(deletedCount).toBe(1);
    });

    it("should handle empty comments list", async () => {
      (mockOctokitInstance.rest.issues.listComments as jest.Mock).mockResolvedValue({
        data: [],
      });

      const deletedCount = await deleteKenchiOpsComments(12345, "owner", "repo", 42);

      expect(deletedCount).toBe(0);
    });
  });

  describe("postPRComment", () => {
    it("should post a comment to a PR", async () => {
      (mockOctokitInstance.rest.issues.createComment as jest.Mock).mockResolvedValue({
        data: { id: 123 },
      });

      await postPRComment(12345, "owner", "repo", 42, "Test comment body");

      expect(mockOctokitInstance.rest.issues.createComment).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        issue_number: 42,
        body: "Test comment body",
      });
    });

    it("should delete old comments when deleteOldComments is true", async () => {
      const marker = KENCHI_BRANDING.COMMENT_MARKER;
      (mockOctokitInstance.rest.issues.listComments as jest.Mock).mockResolvedValue({
        data: [{ id: 1, body: `${marker} Old comment` }],
      });
      (mockOctokitInstance.rest.issues.deleteComment as jest.Mock).mockResolvedValue({});
      (mockOctokitInstance.rest.issues.createComment as jest.Mock).mockResolvedValue({
        data: { id: 123 },
      });

      await postPRComment(12345, "owner", "repo", 42, "New comment", true);

      expect(mockOctokitInstance.rest.issues.deleteComment).toHaveBeenCalled();
      expect(mockOctokitInstance.rest.issues.createComment).toHaveBeenCalled();
    });

    it("should not delete old comments when deleteOldComments is false", async () => {
      (mockOctokitInstance.rest.issues.createComment as jest.Mock).mockResolvedValue({
        data: { id: 123 },
      });

      await postPRComment(12345, "owner", "repo", 42, "New comment", false);

      expect(mockOctokitInstance.rest.issues.listComments).not.toHaveBeenCalled();
      expect(mockOctokitInstance.rest.issues.createComment).toHaveBeenCalled();
    });

    it("should throw ExternalServiceError when create comment fails", async () => {
      (mockOctokitInstance.rest.issues.createComment as jest.Mock).mockRejectedValue(
        new Error("GitHub API error")
      );

      await expect(postPRComment(12345, "owner", "repo", 42, "Test comment")).rejects.toThrow();
    });

    it("should not call deleteComment when deleteOldComments defaults to false", async () => {
      (mockOctokitInstance.rest.issues.createComment as jest.Mock).mockResolvedValue({
        data: { id: 123 },
      });

      await postPRComment(12345, "owner", "repo", 42, "New comment");

      expect(mockOctokitInstance.rest.issues.listComments).not.toHaveBeenCalled();
    });
  });

  describe("getInstallationRepositories", () => {
    it("should fetch and return repositories", async () => {
      (
        mockOctokitInstance.rest.apps.listReposAccessibleToInstallation as jest.Mock
      ).mockResolvedValue({
        data: {
          total_count: 2,
          repositories: [
            {
              id: 1,
              name: "repo1",
              full_name: "owner/repo1",
              private: false,
              default_branch: "main",
            },
            {
              id: 2,
              name: "repo2",
              full_name: "owner/repo2",
              private: true,
              default_branch: "develop",
            },
          ],
        },
      });

      const repos = await getInstallationRepositories(12345);

      expect(repos).toHaveLength(2);
      expect(repos[0]).toEqual({
        id: 1,
        name: "repo1",
        fullName: "owner/repo1",
        private: false,
        defaultBranch: "main",
      });
      expect(repos[1]).toEqual({
        id: 2,
        name: "repo2",
        fullName: "owner/repo2",
        private: true,
        defaultBranch: "develop",
      });
    });

    it("should default to main branch when default_branch is null", async () => {
      (
        mockOctokitInstance.rest.apps.listReposAccessibleToInstallation as jest.Mock
      ).mockResolvedValue({
        data: {
          total_count: 1,
          repositories: [
            {
              id: 1,
              name: "repo1",
              full_name: "owner/repo1",
              private: false,
              default_branch: null,
            },
          ],
        },
      });

      const repos = await getInstallationRepositories(12345);

      expect(repos[0].defaultBranch).toBe("main");
    });

    it("should handle pagination for many repositories", async () => {
      // First page with 100 repos
      const firstPageRepos = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `repo${i + 1}`,
        full_name: `owner/repo${i + 1}`,
        private: false,
        default_branch: "main",
      }));

      // Second page with 50 repos
      const secondPageRepos = Array.from({ length: 50 }, (_, i) => ({
        id: i + 101,
        name: `repo${i + 101}`,
        full_name: `owner/repo${i + 101}`,
        private: false,
        default_branch: "main",
      }));

      (mockOctokitInstance.rest.apps.listReposAccessibleToInstallation as jest.Mock)
        .mockResolvedValueOnce({
          data: { total_count: 150, repositories: firstPageRepos },
        })
        .mockResolvedValueOnce({
          data: { total_count: 150, repositories: secondPageRepos },
        });

      const repos = await getInstallationRepositories(12345);

      expect(repos).toHaveLength(150);
      expect(mockOctokitInstance.rest.apps.listReposAccessibleToInstallation).toHaveBeenCalledTimes(
        2
      );
    });

    it("should throw ExternalServiceError when API call fails", async () => {
      (
        mockOctokitInstance.rest.apps.listReposAccessibleToInstallation as jest.Mock
      ).mockRejectedValue(new Error("API error"));

      await expect(getInstallationRepositories(12345)).rejects.toThrow();
    });

    it("should handle empty repository list", async () => {
      (
        mockOctokitInstance.rest.apps.listReposAccessibleToInstallation as jest.Mock
      ).mockResolvedValue({
        data: {
          total_count: 0,
          repositories: [],
        },
      });

      const repos = await getInstallationRepositories(12345);

      expect(repos).toHaveLength(0);
    });
  });

  describe("createCheckRunWithAnnotations", () => {
    it("should create check run with annotations", async () => {
      (mockOctokitInstance.rest.checks.create as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });

      await createCheckRunWithAnnotations({
        installationId: 12345,
        owner: "owner",
        repo: "repo",
        headSha: "abc123",
        name: "KenchiOps Analysis",
        summary: "Test summary",
        annotations: [
          {
            path: "src/index.ts",
            start_line: 10,
            end_line: 10,
            annotation_level: "failure",
            message: "Type error",
          },
        ],
      });

      expect(mockOctokitInstance.rest.checks.create).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        name: "KenchiOps Analysis",
        head_sha: "abc123",
        status: "completed",
        conclusion: "failure",
        output: {
          title: "KenchiOps CI Analysis",
          summary: "Test summary",
          annotations: [
            {
              path: "src/index.ts",
              start_line: 10,
              end_line: 10,
              annotation_level: "failure",
              message: "Type error",
            },
          ],
        },
      });
    });

    it("should set conclusion to neutral when no failure annotations", async () => {
      (mockOctokitInstance.rest.checks.create as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });

      await createCheckRunWithAnnotations({
        installationId: 12345,
        owner: "owner",
        repo: "repo",
        headSha: "abc123",
        name: "KenchiOps Analysis",
        summary: "Test summary",
        annotations: [
          {
            path: "src/index.ts",
            start_line: 10,
            end_line: 10,
            annotation_level: "warning",
            message: "Warning message",
          },
        ],
      });

      expect(mockOctokitInstance.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: "neutral",
        })
      );
    });

    it("should batch annotations when exceeding 50 per call", async () => {
      // Create 75 annotations (should be split into batches of 50 + 25)
      const annotations = Array.from({ length: 75 }, (_, i) => ({
        path: `src/file${i}.ts`,
        start_line: i + 1,
        end_line: i + 1,
        annotation_level: "warning" as const,
        message: `Warning ${i}`,
      }));

      (mockOctokitInstance.rest.checks.create as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });
      (mockOctokitInstance.rest.checks.update as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });

      await createCheckRunWithAnnotations({
        installationId: 12345,
        owner: "owner",
        repo: "repo",
        headSha: "abc123",
        name: "KenchiOps Analysis",
        summary: "Test summary",
        annotations,
      });

      // Should create with first 50, then update with remaining 25
      expect(mockOctokitInstance.rest.checks.create).toHaveBeenCalledTimes(1);
      expect(mockOctokitInstance.rest.checks.update).toHaveBeenCalledTimes(1);

      // First call should have 50 annotations
      const createCall = (mockOctokitInstance.rest.checks.create as jest.Mock).mock.calls[0][0];
      expect(createCall.output.annotations).toHaveLength(50);

      // Update call should have 25 annotations
      const updateCall = (mockOctokitInstance.rest.checks.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.output.annotations).toHaveLength(25);
    });

    it("should handle empty annotations array", async () => {
      (mockOctokitInstance.rest.checks.create as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });

      await createCheckRunWithAnnotations({
        installationId: 12345,
        owner: "owner",
        repo: "repo",
        headSha: "abc123",
        name: "KenchiOps Analysis",
        summary: "No issues found",
        annotations: [],
      });

      expect(mockOctokitInstance.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: "neutral",
          output: expect.objectContaining({
            annotations: [],
          }),
        })
      );
      expect(mockOctokitInstance.rest.checks.update).not.toHaveBeenCalled();
    });

    it("should throw ExternalServiceError when API call fails", async () => {
      (mockOctokitInstance.rest.checks.create as jest.Mock).mockRejectedValue(
        new Error("GitHub API error")
      );

      await expect(
        createCheckRunWithAnnotations({
          installationId: 12345,
          owner: "owner",
          repo: "repo",
          headSha: "abc123",
          name: "KenchiOps Analysis",
          summary: "Test summary",
          annotations: [],
        })
      ).rejects.toThrow();
    });

    it("should handle notice-level annotations", async () => {
      (mockOctokitInstance.rest.checks.create as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });

      await createCheckRunWithAnnotations({
        installationId: 12345,
        owner: "owner",
        repo: "repo",
        headSha: "abc123",
        name: "KenchiOps Analysis",
        summary: "Test summary",
        annotations: [
          {
            path: "src/index.ts",
            start_line: 10,
            end_line: 10,
            annotation_level: "notice",
            message: "Info message",
          },
        ],
      });

      expect(mockOctokitInstance.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: "neutral",
        })
      );
    });

    it("should handle multiple batches of annotations", async () => {
      // Create 120 annotations (should be split into batches of 50 + 50 + 20)
      const annotations = Array.from({ length: 120 }, (_, i) => ({
        path: `src/file${i}.ts`,
        start_line: i + 1,
        end_line: i + 1,
        annotation_level: "warning" as const,
        message: `Warning ${i}`,
      }));

      (mockOctokitInstance.rest.checks.create as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });
      (mockOctokitInstance.rest.checks.update as jest.Mock).mockResolvedValue({
        data: { id: 99999 },
      });

      await createCheckRunWithAnnotations({
        installationId: 12345,
        owner: "owner",
        repo: "repo",
        headSha: "abc123",
        name: "KenchiOps Analysis",
        summary: "Test summary",
        annotations,
      });

      // Should create with first 50, then update twice with remaining
      expect(mockOctokitInstance.rest.checks.create).toHaveBeenCalledTimes(1);
      expect(mockOctokitInstance.rest.checks.update).toHaveBeenCalledTimes(2);
    });
  });
});
