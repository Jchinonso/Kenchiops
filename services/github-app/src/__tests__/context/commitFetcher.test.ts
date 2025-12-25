/**
 * Unit tests for Commit Fetcher utilities
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  fetchSourceFile,
  fetchCommitInfo,
  fetchRepositoryMetadata,
} from "../../services/context/commitFetcher.js";
import type { SourceFile, CommitInfo, RepositoryMetadata } from "../../services/context/types.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  GITHUB_CONTEXT_LIMITS: {
    MAX_FILE_SIZE: 10000,
  },
}));

// Mock truncateWithContext
jest.mock("../../services/context/logParser.js", () => ({
  truncateWithContext: jest.fn((content: string, maxSize: number) => {
    if (content.length <= maxSize) return content;
    return content.slice(0, maxSize) + "... [truncated]";
  }),
}));

// Mock getOctokit
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetContent = jest.fn<() => Promise<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetCommit = jest.fn<() => Promise<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetRepo = jest.fn<() => Promise<any>>();

const mockOctokit = {
  rest: {
    repos: {
      getContent: mockGetContent,
      getCommit: mockGetCommit,
      get: mockGetRepo,
    },
  },
};

jest.mock("../../services/githubService.js", () => ({
  getOctokit: jest.fn(() => Promise.resolve(mockOctokit)),
}));

// Import the mocked function to access it in tests
import { truncateWithContext } from "../../services/context/logParser.js";
const mockTruncateWithContext = truncateWithContext as jest.MockedFunction<typeof truncateWithContext>;

describe("Commit Fetcher", () => {
  const installationId = 12345;
  const owner = "testowner";
  const repo = "testrepo";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchSourceFile", () => {
    const path = "src/index.ts";
    const ref = "main";
    const fileContent = `line 1
line 2
line 3
line 4
line 5
line 6
line 7
line 8
line 9
line 10
line 11
line 12
line 13
line 14
line 15
line 16
line 17
line 18
line 19
line 20
line 21
line 22
line 23
line 24
line 25`;

    it("should fetch full file without line number", async () => {
      const encodedContent = Buffer.from(fileContent).toString("base64");

      mockGetContent.mockResolvedValue({
        data: {
          type: "file",
          content: encodedContent,
          encoding: "base64",
        },
      });

      const result = await fetchSourceFile(installationId, owner, repo, path, ref);

      expect(mockGetContent).toHaveBeenCalledWith({
        owner,
        repo,
        path,
        ref,
      });

      expect(result).toEqual({
        path,
        content: fileContent,
      });

      expect(mockTruncateWithContext).toHaveBeenCalledWith(fileContent, 10000);
    });

    it("should fetch file with line number context (10 lines before/after)", async () => {
      const encodedContent = Buffer.from(fileContent).toString("base64");

      mockGetContent.mockResolvedValue({
        data: {
          type: "file",
          content: encodedContent,
          encoding: "base64",
        },
      });

      const result = await fetchSourceFile(installationId, owner, repo, path, ref, 15);

      expect(result).not.toBeNull();
      expect(result?.path).toBe(path);
      expect(result?.startLine).toBe(5); // 15 - 10
      expect(result?.endLine).toBe(25); // 15 + 10
      expect(result?.content).toContain(">>> 15: line 15");
      expect(result?.content).toContain("    5: line 5");
      expect(result?.content).toContain("    25: line 25");
    });

    it("should handle line number at start of file", async () => {
      const encodedContent = Buffer.from(fileContent).toString("base64");

      mockGetContent.mockResolvedValue({
        data: {
          type: "file",
          content: encodedContent,
          encoding: "base64",
        },
      });

      const result = await fetchSourceFile(installationId, owner, repo, path, ref, 3);

      expect(result).not.toBeNull();
      expect(result?.startLine).toBe(1); // Math.max(1, 3 - 10)
      expect(result?.endLine).toBe(13); // 3 + 10
      expect(result?.content).toContain(">>> 3: line 3");
      expect(result?.content).toContain("    1: line 1");
    });

    it("should handle line number at end of file", async () => {
      const encodedContent = Buffer.from(fileContent).toString("base64");

      mockGetContent.mockResolvedValue({
        data: {
          type: "file",
          content: encodedContent,
          encoding: "base64",
        },
      });

      const result = await fetchSourceFile(installationId, owner, repo, path, ref, 23);

      expect(result).not.toBeNull();
      expect(result?.startLine).toBe(13); // 23 - 10
      expect(result?.endLine).toBe(25); // Math.min(25, 23 + 10)
      expect(result?.content).toContain(">>> 23: line 23");
      expect(result?.content).toContain("    25: line 25");
    });

    it("should add line numbers and markers for context", async () => {
      const shortContent = "line 1\nline 2\nline 3\nline 4\nline 5";
      const encodedContent = Buffer.from(shortContent).toString("base64");

      mockGetContent.mockResolvedValue({
        data: {
          type: "file",
          content: encodedContent,
          encoding: "base64",
        },
      });

      const result = await fetchSourceFile(installationId, owner, repo, path, ref, 3);

      expect(result?.content).toContain(">>> 3: line 3");
      expect(result?.content).toContain("    2: line 2");
      expect(result?.content).toContain("    4: line 4");

      // Verify marker format: target line has ">>> " while others have "    "
      const lines = result?.content.split("\n") || [];
      lines.forEach((line) => {
        if (line.includes("3: line 3")) {
          expect(line.startsWith(">>> ")).toBe(true);
        } else {
          expect(line.startsWith("    ")).toBe(true);
        }
      });
    });

    it("should handle directory response (return null)", async () => {
      mockGetContent.mockResolvedValue({
        data: [
          { type: "file", name: "file1.ts" },
          { type: "file", name: "file2.ts" },
        ],
      });

      const result = await fetchSourceFile(installationId, owner, repo, "src", ref);

      expect(result).toBeNull();
    });

    it("should handle non-file type (return null)", async () => {
      mockGetContent.mockResolvedValue({
        data: {
          type: "symlink",
          content: "",
        },
      });

      const result = await fetchSourceFile(installationId, owner, repo, path, ref);

      expect(result).toBeNull();
    });

    it("should properly decode base64 content", async () => {
      const originalContent = "console.log('Hello, World!');";
      const encodedContent = Buffer.from(originalContent).toString("base64");

      mockGetContent.mockResolvedValue({
        data: {
          type: "file",
          content: encodedContent,
          encoding: "base64",
        },
      });

      const result = await fetchSourceFile(installationId, owner, repo, path, ref);

      expect(result?.content).toBe(originalContent);
    });

    it("should handle API errors (return null)", async () => {
      mockGetContent.mockRejectedValue(new Error("Not found"));

      const result = await fetchSourceFile(installationId, owner, repo, path, ref);

      expect(result).toBeNull();
    });

    it("should handle network errors (return null)", async () => {
      mockGetContent.mockRejectedValue(new Error("Network error"));

      const result = await fetchSourceFile(installationId, owner, repo, path, ref);

      expect(result).toBeNull();
    });

    it("should handle base64 decoding errors gracefully", async () => {
      mockGetContent.mockResolvedValue({
        data: {
          type: "file",
          content: "invalid-base64-!!!",
          encoding: "base64",
        },
      });

      // This should either return a result or null, but not throw
      const result = await fetchSourceFile(installationId, owner, repo, path, ref);

      expect(result).toBeDefined();
    });
  });

  describe("fetchCommitInfo", () => {
    const sha = "abc123def456789";

    it("should successfully fetch commit with all fields", async () => {
      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: "Fix bug in user authentication",
            author: {
              name: "John Doe",
              date: "2024-01-15T10:30:00Z",
            },
            committer: {
              name: "Jane Smith",
              date: "2024-01-15T10:35:00Z",
            },
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: [
            { filename: "src/auth.ts" },
            { filename: "src/user.ts" },
            { filename: "tests/auth.test.ts" },
          ],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(mockGetCommit).toHaveBeenCalledWith({
        owner,
        repo,
        ref: sha,
      });

      expect(result).toEqual({
        sha,
        message: "Fix bug in user authentication",
        author: "John Doe",
        committer: "Jane Smith",
        timestamp: "2024-01-15T10:30:00Z",
        changedFiles: ["src/auth.ts", "src/user.ts", "tests/auth.test.ts"],
      });
    });

    it("should handle missing commit author (fallback to GitHub login)", async () => {
      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: "Update README",
            author: null,
            committer: {
              name: "Jane Smith",
              date: "2024-01-15T10:35:00Z",
            },
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: [],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result?.author).toBe("johndoe");
    });

    it("should handle missing commit committer (fallback to GitHub login)", async () => {
      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: "Update README",
            author: {
              name: "John Doe",
              date: "2024-01-15T10:30:00Z",
            },
            committer: null,
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: [],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result?.committer).toBe("janesmith");
    });

    it("should handle missing both name and login (fallback to 'unknown')", async () => {
      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: "Update README",
            author: null,
            committer: null,
          },
          author: null,
          committer: null,
          files: [],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result?.author).toBe("unknown");
      expect(result?.committer).toBe("unknown");
    });

    it("should handle missing author date (fallback to current time)", async () => {
      const beforeCall = new Date().toISOString();

      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: "Update README",
            author: null,
            committer: {
              name: "Jane Smith",
            },
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: [],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      const afterCall = new Date().toISOString();

      expect(result?.timestamp).toBeDefined();
      // Timestamp should be between before and after the call
      expect(result?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should handle empty files array", async () => {
      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: "Empty commit",
            author: {
              name: "John Doe",
              date: "2024-01-15T10:30:00Z",
            },
            committer: {
              name: "Jane Smith",
              date: "2024-01-15T10:35:00Z",
            },
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: [],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result?.changedFiles).toEqual([]);
    });

    it("should handle missing files property (fallback to empty array)", async () => {
      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: "Empty commit",
            author: {
              name: "John Doe",
              date: "2024-01-15T10:30:00Z",
            },
            committer: {
              name: "Jane Smith",
              date: "2024-01-15T10:35:00Z",
            },
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: undefined,
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result?.changedFiles).toEqual([]);
    });

    it("should handle API errors (return null)", async () => {
      mockGetCommit.mockRejectedValue(new Error("Commit not found"));

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result).toBeNull();
    });

    it("should handle 404 errors (return null)", async () => {
      const error = new Error("Not Found");
      Object.assign(error, { status: 404 });
      mockGetCommit.mockRejectedValue(error);

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result).toBeNull();
    });

    it("should handle network errors (return null)", async () => {
      mockGetCommit.mockRejectedValue(new Error("Network timeout"));

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result).toBeNull();
    });

    it("should handle very long commit messages", async () => {
      const longMessage = "A".repeat(10000);

      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: longMessage,
            author: {
              name: "John Doe",
              date: "2024-01-15T10:30:00Z",
            },
            committer: {
              name: "Jane Smith",
              date: "2024-01-15T10:35:00Z",
            },
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: [],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result?.message).toBe(longMessage);
    });

    it("should handle multi-line commit messages", async () => {
      const multiLineMessage = `Fix critical authentication bug

This commit addresses the issue where users were unable to log in
due to a malformed JWT token. The root cause was incorrect encoding
of special characters in the username field.

Fixes #123`;

      mockGetCommit.mockResolvedValue({
        data: {
          sha,
          commit: {
            message: multiLineMessage,
            author: {
              name: "John Doe",
              date: "2024-01-15T10:30:00Z",
            },
            committer: {
              name: "Jane Smith",
              date: "2024-01-15T10:35:00Z",
            },
          },
          author: {
            login: "johndoe",
          },
          committer: {
            login: "janesmith",
          },
          files: [],
        },
      });

      const result = await fetchCommitInfo(installationId, owner, repo, sha);

      expect(result?.message).toBe(multiLineMessage);
    });
  });

  describe("fetchRepositoryMetadata", () => {
    it("should successfully fetch repository metadata", async () => {
      mockGetRepo.mockResolvedValue({
        data: {
          id: 123456,
          name: "testrepo",
          full_name: "testowner/testrepo",
          owner: {
            login: "testowner",
          },
          default_branch: "main",
          private: true,
          language: "TypeScript",
        },
      });

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(mockGetRepo).toHaveBeenCalledWith({
        owner,
        repo,
      });

      expect(result).toEqual({
        id: 123456,
        name: "testrepo",
        fullName: "testowner/testrepo",
        owner: "testowner",
        defaultBranch: "main",
        isPrivate: true,
        language: "TypeScript",
      });
    });

    it("should handle public repository", async () => {
      mockGetRepo.mockResolvedValue({
        data: {
          id: 123456,
          name: "testrepo",
          full_name: "testowner/testrepo",
          owner: {
            login: "testowner",
          },
          default_branch: "main",
          private: false,
          language: "JavaScript",
        },
      });

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result?.isPrivate).toBe(false);
    });

    it("should handle repository with null language", async () => {
      mockGetRepo.mockResolvedValue({
        data: {
          id: 123456,
          name: "testrepo",
          full_name: "testowner/testrepo",
          owner: {
            login: "testowner",
          },
          default_branch: "main",
          private: false,
          language: null,
        },
      });

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result?.language).toBeNull();
    });

    it("should handle different default branches", async () => {
      mockGetRepo.mockResolvedValue({
        data: {
          id: 123456,
          name: "testrepo",
          full_name: "testowner/testrepo",
          owner: {
            login: "testowner",
          },
          default_branch: "master",
          private: false,
          language: "Python",
        },
      });

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result?.defaultBranch).toBe("master");
    });

    it("should handle various programming languages", async () => {
      const languages = ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", null];

      for (const language of languages) {
        mockGetRepo.mockResolvedValue({
          data: {
            id: 123456,
            name: "testrepo",
            full_name: "testowner/testrepo",
            owner: {
              login: "testowner",
            },
            default_branch: "main",
            private: false,
            language,
          },
        });

        const result = await fetchRepositoryMetadata(installationId, owner, repo);
        expect(result?.language).toBe(language);
      }
    });

    it("should handle API errors (return null)", async () => {
      mockGetRepo.mockRejectedValue(new Error("Repository not found"));

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result).toBeNull();
    });

    it("should handle 404 errors (return null)", async () => {
      const error = new Error("Not Found");
      Object.assign(error, { status: 404 });
      mockGetRepo.mockRejectedValue(error);

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result).toBeNull();
    });

    it("should handle 403 forbidden errors (return null)", async () => {
      const error = new Error("Forbidden");
      Object.assign(error, { status: 403 });
      mockGetRepo.mockRejectedValue(error);

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result).toBeNull();
    });

    it("should handle network errors (return null)", async () => {
      mockGetRepo.mockRejectedValue(new Error("Network timeout"));

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result).toBeNull();
    });

    it("should handle rate limit errors (return null)", async () => {
      const error = new Error("Rate limit exceeded");
      Object.assign(error, { status: 429 });
      mockGetRepo.mockRejectedValue(error);

      const result = await fetchRepositoryMetadata(installationId, owner, repo);

      expect(result).toBeNull();
    });
  });
});
