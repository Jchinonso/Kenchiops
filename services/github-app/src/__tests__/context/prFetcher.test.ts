/**
 * Unit tests for PR Fetcher utilities
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  fetchPRsByCommit,
  fetchPRDiff,
  fetchPRMetadata,
  fetchDependencyChanges,
  fetchBuildConfigChanges,
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
  BUILD_CONFIG_FILES: [
    "tsconfig.json",
    "webpack.config.js",
    "rollup.config.js",
    "vite.config.ts",
    "jest.config.js",
    ".eslintrc.json",
    "babel.config.js",
  ],
  EXCLUDED_PACKAGE_JSON_FIELDS: new Set(["name", "version", "description", "license"]),
  DEPENDENCY_DIFF_PATTERNS: {
    ADDED: /^\+\s*"([^"]+)":\s*"([^"]+)"/,
    REMOVED: /^-\s*"([^"]+)":\s*"([^"]+)"/,
  },
  LOG_PARSING_LIMITS: {
    MAX_BUILD_CONFIG_DIFF_SIZE: 10000,
  },
  getErrorMessage: jest.fn((error: unknown) => {
    if (error instanceof Error) return error.message;
    return String(error);
  }),
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

    it("should filter out merged PRs", async () => {
      mockListPullRequestsAssociatedWithCommit.mockResolvedValue({
        data: [
          { number: 123, state: "open" },
          { number: 456, state: "merged" },
        ],
      } as never);

      const result = await fetchPRsByCommit(installationId, owner, repo, commitSha);

      expect(result).toEqual([123]);
    });

    it("should return empty array when no PRs found", async () => {
      mockListPullRequestsAssociatedWithCommit.mockResolvedValue({
        data: [],
      } as never);

      const result = await fetchPRsByCommit(installationId, owner, repo, commitSha);

      expect(result).toEqual([]);
    });

    it("should return empty array when all PRs are closed", async () => {
      mockListPullRequestsAssociatedWithCommit.mockResolvedValue({
        data: [
          { number: 123, state: "closed" },
          { number: 456, state: "closed" },
        ],
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

    it("should handle network errors gracefully", async () => {
      mockListPullRequestsAssociatedWithCommit.mockRejectedValue(
        new Error("Network timeout") as never
      );

      const result = await fetchPRsByCommit(installationId, owner, repo, commitSha);

      expect(result).toEqual([]);
    });

    it("should handle rate limit errors gracefully", async () => {
      const error = new Error("Rate limit exceeded");
      (error as { status?: number }).status = 429;
      mockListPullRequestsAssociatedWithCommit.mockRejectedValue(error as never);

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

      // truncateWithContext is mocked to truncate at maxSize
      expect(result).toContain("... [truncated]");
    });

    it("should handle diff as object and convert to string", async () => {
      const mockDiffObject = { toString: () => "diff content" };
      mockPullsGet.mockResolvedValue({
        data: mockDiffObject,
      } as never);

      const result = await fetchPRDiff(installationId, owner, repo, prNumber);

      expect(result).toBe("diff content");
    });

    it("should return null on API errors", async () => {
      mockPullsGet.mockRejectedValue(new Error("GitHub API error") as never);

      const result = await fetchPRDiff(installationId, owner, repo, prNumber);

      expect(result).toBeNull();
    });

    it("should handle 404 errors when PR not found", async () => {
      const error = new Error("Not found");
      (error as { status?: number }).status = 404;
      mockPullsGet.mockRejectedValue(error as never);

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
      head: { ref: "feature-branch" },
      labels: [{ name: "bug" }, { name: "urgent" }],
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

    it("should determine review status as approved when only approvals", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({
        data: [
          { state: "APPROVED", user: { login: "reviewer1" } },
          { state: "APPROVED", user: { login: "reviewer2" } },
        ],
      } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.reviewStatus).toBe("approved");
    });

    it("should determine review status as pending when reviews exist but no approval", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({
        data: [{ state: "COMMENTED", user: { login: "reviewer1" } }],
      } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.reviewStatus).toBe("pending");
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

    it("should extract unique reviewers", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({
        data: [
          { state: "APPROVED", user: { login: "reviewer1" } },
          { state: "COMMENTED", user: { login: "reviewer1" } },
          { state: "APPROVED", user: { login: "reviewer2" } },
        ],
      } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.reviewers).toEqual(["reviewer1", "reviewer2"]);
    });

    it("should limit comments to last 5", async () => {
      const comments = Array.from({ length: 10 }, (_, i) => ({
        user: { login: `user${i}` },
        body: `Comment ${i}`,
        created_at: `2024-01-01T10:${i}:00Z`,
      }));

      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({ data: [] } as never);
      mockListComments.mockResolvedValue({
        data: comments,
      } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.comments).toHaveLength(5);
      expect(result?.comments[0].author).toBe("user5"); // Last 5 comments
    });

    it("should truncate long comment bodies", async () => {
      const longBody = "a".repeat(1000);
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({ data: [] } as never);
      mockListComments.mockResolvedValue({
        data: [
          {
            user: { login: "user1" },
            body: longBody,
            created_at: "2024-01-01T10:00:00Z",
          },
        ],
      } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.comments[0].body).toHaveLength(500);
    });

    it("should handle string labels", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR({ labels: ["bug", "feature"] }),
      } as never);
      mockListReviews.mockResolvedValue({ data: [] } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.labels).toEqual(["bug", "feature"]);
    });

    it("should handle missing PR description", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR({ body: null }),
      } as never);
      mockListReviews.mockResolvedValue({ data: [] } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.description).toBeNull();
    });

    it("should handle missing user login", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR({ user: null }),
      } as never);
      mockListReviews.mockResolvedValue({ data: [] } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.author).toBe("unknown");
    });

    it("should return null on API errors", async () => {
      mockPullsGet.mockRejectedValue(new Error("GitHub API error") as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result).toBeNull();
    });

    it("should execute API calls in parallel", async () => {
      const startTimes: number[] = [];

      mockPullsGet.mockImplementation(() => {
        startTimes.push(Date.now());
        return Promise.resolve({ data: createMockPR() });
      });
      mockListReviews.mockImplementation(() => {
        startTimes.push(Date.now());
        return Promise.resolve({ data: [] });
      });
      mockListComments.mockImplementation(() => {
        startTimes.push(Date.now());
        return Promise.resolve({ data: [] });
      });

      await fetchPRMetadata(installationId, owner, repo, prNumber);

      // All calls should start within a small time window (parallel execution)
      const timeSpan = Math.max(...startTimes) - Math.min(...startTimes);
      expect(timeSpan).toBeLessThan(100); // Less than 100ms difference
    });

    it("should filter out reviewers with no login", async () => {
      mockPullsGet.mockResolvedValue({
        data: createMockPR(),
      } as never);
      mockListReviews.mockResolvedValue({
        data: [
          { state: "APPROVED", user: { login: "reviewer1" } },
          { state: "APPROVED", user: null },
          { state: "APPROVED", user: { login: "reviewer2" } },
        ],
      } as never);
      mockListComments.mockResolvedValue({ data: [] } as never);

      const result = await fetchPRMetadata(installationId, owner, repo, prNumber);

      expect(result?.reviewers).toEqual(["reviewer1", "reviewer2"]);
    });
  });

  describe("fetchDependencyChanges", () => {
    const prNumber = 123;

    it("should return empty array when no package.json changes", async () => {
      mockListFiles.mockResolvedValue({
        data: [{ filename: "src/index.ts", patch: "+console.log('test');" }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should return empty array when package.json has no patch", async () => {
      mockListFiles.mockResolvedValue({
        data: [{ filename: "package.json", patch: undefined }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should detect added dependencies", async () => {
      const patch = `
@@ -1,5 +1,6 @@
 {
   "dependencies": {
+    "express": "^4.18.0",
     "lodash": "^4.17.21"
   }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "package.json", patch }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      expect(result).toContainEqual({
        name: "express",
        type: "added",
        newVersion: "^4.18.0",
      });
    });

    it("should detect removed dependencies", async () => {
      const patch = `
@@ -1,6 +1,5 @@
 {
   "dependencies": {
-    "express": "^4.18.0",
     "lodash": "^4.17.21"
   }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "package.json", patch }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      expect(result).toContainEqual({
        name: "express",
        type: "removed",
        oldVersion: "^4.18.0",
      });
    });

    it("should detect updated dependencies", async () => {
      const patch = `
@@ -1,6 +1,6 @@
 {
   "dependencies": {
-    "express": "^4.17.0",
+    "express": "^4.18.0",
     "lodash": "^4.17.21"
   }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "package.json", patch }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      expect(result).toContainEqual({
        name: "express",
        type: "updated",
        oldVersion: "^4.17.0",
        newVersion: "^4.18.0",
      });
    });

    it("should detect multiple dependency changes", async () => {
      const patch = `
@@ -1,8 +1,9 @@
 {
   "dependencies": {
-    "express": "^4.17.0",
+    "express": "^4.18.0",
+    "axios": "^1.0.0",
-    "lodash": "^4.17.21",
     "react": "^18.0.0"
   }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "package.json", patch }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual({
        name: "express",
        type: "updated",
        oldVersion: "^4.17.0",
        newVersion: "^4.18.0",
      });
      expect(result).toContainEqual({
        name: "axios",
        type: "added",
        newVersion: "^1.0.0",
      });
      expect(result).toContainEqual({
        name: "lodash",
        type: "removed",
        oldVersion: "^4.17.21",
      });
    });

    it("should exclude non-dependency fields", async () => {
      const patch = `
@@ -1,5 +1,5 @@
 {
-  "name": "old-name",
+  "name": "new-name",
   "dependencies": {
     "express": "^4.18.0"
   }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "package.json", patch }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      // Should not include "name" field changes
      const nameChanges = result.filter((c) => c.name === "name");
      expect(nameChanges).toHaveLength(0);
    });

    it("should handle comments in package.json", async () => {
      const patch = `
@@ -1,6 +1,6 @@
 {
   "dependencies": {
+    "express": "^4.18.0",
+    "// comment": "this is a comment",
     "lodash": "^4.17.21"
   }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "package.json", patch }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      // Should not include comment lines
      const commentChanges = result.filter((c) => c.name.startsWith("//"));
      expect(commentChanges).toHaveLength(0);
    });

    it("should return empty array on API errors", async () => {
      mockListFiles.mockRejectedValue(new Error("GitHub API error") as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should handle package.json in subdirectories", async () => {
      const patch = `
@@ -1,5 +1,6 @@
 {
   "dependencies": {
+    "express": "^4.18.0",
     "lodash": "^4.17.21"
   }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "packages/app/package.json", patch }],
      } as never);

      const result = await fetchDependencyChanges(installationId, owner, repo, prNumber);

      // Should only match package.json at root, not in subdirectories
      expect(result).toEqual([]);
    });
  });

  describe("fetchBuildConfigChanges", () => {
    const prNumber = 123;

    it("should return empty array when no build config files changed", async () => {
      mockListFiles.mockResolvedValue({
        data: [
          { filename: "src/index.ts", patch: "+console.log('test');" },
          { filename: "README.md", patch: "+# Updated" },
        ],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should detect tsconfig.json changes", async () => {
      const tsconfigPatch = `
@@ -1,5 +1,5 @@
 {
-  "compilerOptions": { "target": "ES5" }
+  "compilerOptions": { "target": "ES2020" }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "tsconfig.json", patch: tsconfigPatch }],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe("tsconfig.json");
      expect(result[0].diff).toContain("compilerOptions");
    });

    it("should detect multiple build config changes", async () => {
      const tsconfigPatch = `
@@ -1,5 +1,5 @@
 {
-  "compilerOptions": { "target": "ES5" }
+  "compilerOptions": { "target": "ES2020" }
 }`;

      const webpackPatch = `
@@ -1,3 +1,4 @@
 module.exports = {
+  mode: 'production',
   entry: './src/index.ts'
 }`;

      mockListFiles.mockResolvedValue({
        data: [
          { filename: "tsconfig.json", patch: tsconfigPatch },
          { filename: "webpack.config.js", patch: webpackPatch },
        ],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.file)).toContain("tsconfig.json");
      expect(result.map((r) => r.file)).toContain("webpack.config.js");
    });

    it("should handle build config files in subdirectories", async () => {
      const tsconfigPatch = `
@@ -1,5 +1,5 @@
 {
-  "compilerOptions": { "target": "ES5" }
+  "compilerOptions": { "target": "ES2020" }
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "packages/app/tsconfig.json", patch: tsconfigPatch }],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe("packages/app/tsconfig.json");
    });

    it("should ignore build config files without patches", async () => {
      mockListFiles.mockResolvedValue({
        data: [
          { filename: "tsconfig.json", patch: undefined },
          { filename: "webpack.config.js", patch: null },
        ],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should truncate large build config diffs", async () => {
      const largePatch = "a".repeat(50000);

      mockListFiles.mockResolvedValue({
        data: [{ filename: "tsconfig.json", patch: largePatch }],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result[0].diff).toContain("... [truncated]");
    });

    it("should detect vite.config.ts changes", async () => {
      const vitePatch = `
@@ -1,5 +1,6 @@
 import { defineConfig } from 'vite';
+import react from '@vitejs/plugin-react';

 export default defineConfig({
+  plugins: [react()]
 });`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "vite.config.ts", patch: vitePatch }],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe("vite.config.ts");
    });

    it("should detect jest.config.js changes", async () => {
      const jestPatch = `
@@ -1,4 +1,5 @@
 module.exports = {
+  testEnvironment: 'jsdom',
   preset: 'ts-jest'
 };`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: "jest.config.js", patch: jestPatch }],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe("jest.config.js");
    });

    it("should detect .eslintrc.json changes", async () => {
      const eslintPatch = `
@@ -1,4 +1,5 @@
 {
+  "extends": "eslint:recommended",
   "rules": {}
 }`;

      mockListFiles.mockResolvedValue({
        data: [{ filename: ".eslintrc.json", patch: eslintPatch }],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe(".eslintrc.json");
    });

    it("should return empty array on API errors", async () => {
      mockListFiles.mockRejectedValue(new Error("GitHub API error") as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should handle empty file list", async () => {
      mockListFiles.mockResolvedValue({
        data: [],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      expect(result).toEqual([]);
    });

    it("should handle files with similar names but not exact matches", async () => {
      mockListFiles.mockResolvedValue({
        data: [
          { filename: "tsconfig.build.json", patch: "+test" },
          { filename: "custom-webpack.config.js", patch: "+test" },
        ],
      } as never);

      const result = await fetchBuildConfigChanges(installationId, owner, repo, prNumber);

      // These files don't match exact names, so should not be included
      expect(result).toEqual([]);
    });
  });
});
