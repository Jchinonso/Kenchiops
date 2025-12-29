/**
 * Unit tests for PR Fetcher utilities
 *
 * Note: fetchDependencyChanges and fetchBuildConfigChanges were removed
 * as part of the language-agnostic migration. AI now analyzes the diff
 * directly to detect dependency and build config changes.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  fetchPRsByCommit,
  fetchPRDiff,
  fetchPRMetadata,
  fetchChangedFiles,
} from "../../services/context/prFetcher.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  GITHUB_CONTEXT_LIMITS: {
    MAX_DIFF_SIZE: 50000,
  },
  GITHUB_PAGINATION: {
    DEFAULT_PER_PAGE: 100,
  },
  getErrorMessage: jest.fn((error: unknown) => {
    if (error instanceof Error) return error.message;
    return String(error);
  }),
  // Cache functions - pass through to fetcher for testing
  getOrFetchPullRequest: jest.fn(
    async (_owner: string, _repo: string, _prNumber: number, fetcher: () => Promise<unknown>) =>
      fetcher()
  ),
  getOrFetchPullRequestDiff: jest.fn(
    async (_owner: string, _repo: string, _prNumber: number, fetcher: () => Promise<string>) =>
      fetcher()
  ),
}));

// Mock truncateWithContext
jest.mock("../../services/context/logParser.js", () => ({
  truncateWithContext: jest.fn((content: string, maxSize: number) => {
    if (content.length <= maxSize) return content;
    return content.slice(0, maxSize) + "... [truncated]";
  }),
}));

// Mock getOctokit
const mockListPullRequestsAssociatedWithCommit = jest.fn();
const mockPullsGet = jest.fn();
const mockListReviews = jest.fn();
const mockListFiles = jest.fn();
const mockListComments = jest.fn();

const mockOctokit = {
  rest: {
    repos: {
      listPullRequestsAssociatedWithCommit: mockListPullRequestsAssociatedWithCommit,
    },
    pulls: {
      get: mockPullsGet,
      listReviews: mockListReviews,
      listFiles: mockListFiles,
    },
    issues: {
      listComments: mockListComments,
    },
  },
};

jest.mock("../../services/githubService.js", () => ({
  getOctokit: jest.fn(() => Promise.resolve(mockOctokit)),
}));

describe("PR Fetcher", () => {
  const installationId = 12345;
  const owner = "testowner";
  const repo = "testrepo";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchPRsByCommit", () => {
    const commitSha = "abc123def456";

    it("should return array of open PR numbers for a commit", async () => {
      mockListPullRequestsAssociatedWithCommit.mockResolvedValue({
        data: [
          { number: 123, state: "open" },
          { number: 456, state: "open" },
          { number: 789, state: "closed" },
        ],
      } as never);

      const result = await fetchPRsByCommit(installationId, owner, repo, commitSha);

      expect(result).toEqual([123, 456]);
      expect(mockListPullRequestsAssociatedWithCommit).toHaveBeenCalledWith({
        owner,
        repo,
        commit_sha: commitSha,
      });
    });

    it("should filter out closed PRs", async () => {
      mockListPullRequestsAssociatedWithCommit.mockResolvedValue({
        data: [
          { number: 123, state: "closed" },
          { number: 456, state: "open" },
        ],
      } as never);

      const result = await fetchPRsByCommit(installationId, owner, repo, commitSha);

      expect(result).toEqual([456]);
    });

    it("should return empty array when no PRs found", async () => {
      mockListPullRequestsAssociatedWithCommit.mockResolvedValue({
        data: [],
      } as never);

      const result = await fetchPRsByCommit(installationId, owner, repo, commitSha);

      expect(result).toEqual([]);
    });

    it("should handle API errors gracefully", async () => {
      mockListPullRequestsAssociatedWithCommit.mockRejectedValue(
        new Error("GitHub API error") as never
      );

      const result = await fetchPRsByCommit(installationId, owner, repo, commitSha);

      expect(result).toEqual([]);
    });
  });

  describe("fetchPRDiff", () => {
    const prNumber = 123;

    it("should fetch and return PR diff", async () => {
      const mockDiff = "diff --git a/file.ts b/file.ts\n+added line\n-removed line";
      mockPullsGet.mockResolvedValue({
        data: mockDiff,
      } as never);

      const result = await fetchPRDiff(installationId, owner, repo, prNumber);

      expect(result).toBe(mockDiff);
      expect(mockPullsGet).toHaveBeenCalledWith({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: {
          format: "diff",
        },
      });
    });

    it("should truncate large diffs", async () => {
      const largeDiff = "a".repeat(100000);
      mockPullsGet.mockResolvedValue({
        data: largeDiff,
      } as never);

      const result = await fetchPRDiff(installationId, owner, repo, prNumber);

      expect(result).toContain("... [truncated]");
    });

    it("should return null on API errors", async () => {
      mockPullsGet.mockRejectedValue(new Error("GitHub API error") as never);

      const result = await fetchPRDiff(installationId, owner, repo, prNumber);

      expect(result).toBeNull();
    });

    it("should handle empty diff", async () => {
      mockPullsGet.mockResolvedValue({
        data: "",
      } as never);

      const result = await fetchPRDiff(installationId, owner, repo, prNumber);

      expect(result).toBe("");
    });
  });

  describe("fetchPRMetadata", () => {
    const prNumber = 123;

    const createMockPR = (overrides = {}) => ({
      number: 123,
      title: "Test PR",
      body: "PR description",
      user: { login: "testuser" },
      base: { ref: "main" },
      head: { ref: "feature-branch", sha: "abc123" },
      labels: [{ name: "bug" }, { name: "urgent" }],
      state: "open",
      draft: false,
      ...overrides,
    });

    it("should fetch complete PR metadata", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({
        data: [{ state: "APPROVED", user: { login: "reviewer1" } }],
      } as never);
      mockListComments.mockResolvedValue({
        data: [
          {
            user: { login: "commenter1" },
            body: "Great work!",
            created_at: "2024-01-01T10:00:00Z",
          },
        ],
      } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result).toEqual({
        number: 123,
        title: "Test PR",
        description: "PR description",
        author: "testuser",
        baseBranch: "main",
        headBranch: "feature-branch",
        labels: ["bug", "urgent"],
        isDraft: false,
        reviewStatus: "approved",
        reviewers: ["reviewer1"],
        comments: [
          {
            author: "commenter1",
            body: "Great work!",
            createdAt: "2024-01-01T10:00:00Z",
          },
        ],
      });
    });

    it("should handle draft PRs", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR({ draft: true }),
      } as never);
      mockListReviews.mockResolvedValue({ data: [] } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.isDraft).toBe(true);
    });

    it("should determine review status as changes_requested when changes requested", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({
        data: [
          { state: "APPROVED", user: { login: "reviewer1" } },
          { state: "CHANGES_REQUESTED", user: { login: "reviewer2" } },
        ],
      } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.reviewStatus).toBe("changes_requested");
    });

    it("should determine review status as review_required when no reviews", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({ data: [] } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.reviewStatus).toBe("review_required");
    });

    it("should return null on API errors", async () => {
      mockPullsGet.mockRejectedValue(new Error("GitHub API error") as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result).toBeNull();
    });
  });

  describe("fetchChangedFiles", () => {
    const prNumber = 123;

    it("should return array of changed file paths", async () => {
      mockListFiles.mockResolvedValue({
        data: [
          { filename: "src/index.ts" },
          { filename: "package.json" },
          { filename: "tsconfig.json" },
        ],
      } as never);

      const result = await fetchChangedFiles(installationId, owner, repo, prNumber);

      expect(result).toEqual(["src/index.ts", "package.json", "tsconfig.json"]);
    });

    it("should return empty array when no files changed", async () => {
      mockListFiles.mockResolvedValue({
        data: [],
      } as never);

      const result = await fetchChangedFiles(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should handle API errors gracefully", async () => {
      mockListFiles.mockRejectedValue(new Error("GitHub API error") as never);

      const result = await fetchChangedFiles(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should return files from any language/ecosystem", async () => {
      // AI-first approach: we return ALL file paths, AI determines relevance
      mockListFiles.mockResolvedValue({
        data: [
          { filename: "package.json" }, // Node.js
          { filename: "requirements.txt" }, // Python
          { filename: "go.mod" }, // Go
          { filename: "Cargo.toml" }, // Rust
          { filename: "Gemfile" }, // Ruby
          { filename: "pom.xml" }, // Java
          { filename: "src/main.rs" },
          { filename: "src/lib.py" },
        ],
      } as never);

      const result = await fetchChangedFiles(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(8);
      expect(result).toContain("package.json");
      expect(result).toContain("requirements.txt");
      expect(result).toContain("go.mod");
      expect(result).toContain("Cargo.toml");
    });
  });
});
